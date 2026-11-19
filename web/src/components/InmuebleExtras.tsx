import { useEffect, useState } from 'react'
import { Receipt, Siren, Plus, Check, Pencil, Trash2, Camera, Zap, Droplets, Landmark, Wifi, Phone, Flame, Home, Wrench, Shield, Eye, Trash, CircleDollarSign } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fotoProducto } from '../lib/logos'
import { fecha } from '../lib/hooks'
import { Modal, Campo, Aviso } from './ui'

type Pago = { id: string; inmueble_id: string; empresa_id: string; concepto: string; tipo: string; proveedor: string | null; cuenta: string | null; periodicidad: string; monto: number | null
  fecha_limite: string; pagado: boolean; pagado_at: string | null; notas: string | null }
type Falla = { id: string; titulo: string; descripcion: string | null; prioridad: 'baja' | 'media' | 'alta'; estatus: 'abierta' | 'en_proceso' | 'resuelta'; foto: string | null; resolucion: string | null; created_at: string; resuelta_at: string | null }

export const TIPOS_PAGO: Record<string, { t: string; i: typeof Zap }> = {
  luz: { t: 'Luz (CFE)', i: Zap }, agua: { t: 'Agua', i: Droplets }, predial: { t: 'Predial', i: Landmark }, internet: { t: 'Internet', i: Wifi }, telefono: { t: 'Teléfono', i: Phone },
  gas: { t: 'Gas', i: Flame }, renta: { t: 'Renta', i: Home }, mantenimiento: { t: 'Mantenimiento / cuota', i: Wrench }, seguro: { t: 'Seguro', i: Shield }, vigilancia: { t: 'Vigilancia', i: Eye },
  basura: { t: 'Recolección de basura', i: Trash }, otro: { t: 'Otro', i: CircleDollarSign },
}
const PERIODOS: Record<string, [string, number]> = { unico: ['Una vez', 0], mensual: ['Mensual', 1], bimestral: ['Bimestral', 2], trimestral: ['Trimestral', 3], semestral: ['Semestral', 6], anual: ['Anual', 12] }
const hoy = () => new Date().toISOString().slice(0, 10)
const sumarMeses = (f: string, m: number) => { const d = new Date(f + 'T12:00'); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10) }
const dinero = (n: number | null) => n == null ? '' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
function estadoPago(p: Pago) {
  if (p.pagado) return { t: `Pagado ${p.pagado_at ? fecha(p.pagado_at) : ''}`, c: 'bg-emerald-50 text-emerald-700' }
  const d = Math.round((new Date(p.fecha_limite + 'T12:00').getTime() - Date.now()) / 864e5)
  if (d < 0) return { t: `Vencido hace ${-d} día(s)`, c: 'bg-red-50 text-red-700' }
  if (d <= 7) return { t: d === 0 ? 'Vence hoy' : `Vence en ${d} día(s)`, c: 'bg-amber-50 text-amber-800' }
  return { t: `Vence ${fecha(p.fecha_limite)}`, c: 'bg-stone-100 text-stone-600' }
}

/** Servicios y pagos del inmueble (luz, agua, predial…): qué toca pagar y cuándo. Al marcar pagado se crea el siguiente. */
export function PagosInmueble({ inmuebleId, empresaId }: { inmuebleId: string; empresaId: string }) {
  const { puedeEditar } = useAuth()
  const [pagos, setPagos] = useState<Pago[]>([])
  const [editar, setEditar] = useState<Partial<Pago> | null>(null)
  const [verPagados, setVerPagados] = useState(false)
  const cargar = () => { supabase.from('inmueble_pagos').select('*').eq('inmueble_id', inmuebleId).order('fecha_limite').then(({ data }) => setPagos((data as Pago[]) ?? [])) }
  useEffect(cargar, [inmuebleId])

  async function marcarPagado(p: Pago) {
    await supabase.from('inmueble_pagos').update({ pagado: true, pagado_at: hoy() }).eq('id', p.id)
    const meses = PERIODOS[p.periodicidad]?.[1] ?? 0
    if (meses) {
      const { id: _id, pagado: _p, pagado_at: _pa, ...resto } = p
      void _id; void _p; void _pa
      await supabase.from('inmueble_pagos').insert({ ...resto, fecha_limite: sumarMeses(p.fecha_limite, meses) })
    }
    cargar()
  }
  const pendientes = pagos.filter(p => !p.pagado), pagados = pagos.filter(p => p.pagado).reverse()
  return (
    <section className="tarjeta p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Receipt size={17} className="text-marca" />Servicios y pagos</h2>
        {puedeEditar && <button className="btn-primario !py-1.5 text-xs" onClick={() => setEditar({ tipo: 'luz', periodicidad: 'bimestral', fecha_limite: hoy() })}><Plus size={14} />Agregar</button>}
      </div>
      {pendientes.length === 0 ? <p className="text-sm text-stone-500">Sin pagos pendientes.{puedeEditar ? ' Agrega luz, agua, predial, internet…' : ''}</p> : (
        <ul className="space-y-2">
          {pendientes.map(p => {
            const T = TIPOS_PAGO[p.tipo] ?? TIPOS_PAGO.otro, e = estadoPago(p)
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-marca/10 text-marca"><T.i size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.concepto}</span>
                  <span className="block truncate text-xs text-stone-500">{[p.proveedor, p.cuenta && `Cuenta ${p.cuenta}`, PERIODOS[p.periodicidad]?.[0], dinero(p.monto)].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${e.c}`}>{e.t}</span>
                {puedeEditar && <>
                  <button className="btn-sec !px-2.5 !py-1.5 text-xs" onClick={() => marcarPagado(p)}><Check size={14} />Pagado</button>
                  <button className="rounded p-1 text-stone-400 hover:text-tinta" onClick={() => setEditar(p)} aria-label="Editar"><Pencil size={14} /></button>
                </>}
              </li>
            )
          })}
        </ul>
      )}
      {pagados.length > 0 && <button className="mt-3 text-xs text-stone-500 hover:text-tinta" onClick={() => setVerPagados(v => !v)}>{verPagados ? 'Ocultar' : 'Ver'} historial de pagos ({pagados.length})</button>}
      {verPagados && <ul className="mt-2 divide-y divide-stone-100 text-sm">{pagados.map(p => <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{p.concepto} · {fecha(p.fecha_limite)}</span><span className="text-xs text-emerald-700">Pagado {p.pagado_at ? fecha(p.pagado_at) : ''}{p.monto ? ` · ${dinero(p.monto)}` : ''}</span></li>)}</ul>}
      {editar && <EditarPago pago={editar} inmuebleId={inmuebleId} empresaId={empresaId} onCerrar={() => setEditar(null)} onListo={() => { setEditar(null); cargar() }} />}
    </section>
  )
}

function EditarPago({ pago, inmuebleId, empresaId, onCerrar, onListo }: { pago: Partial<Pago>; inmuebleId: string; empresaId: string; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({ tipo: pago.tipo ?? 'otro', concepto: pago.concepto ?? '', proveedor: pago.proveedor ?? '', cuenta: pago.cuenta ?? '', periodicidad: pago.periodicidad ?? 'mensual',
    monto: pago.monto != null ? String(pago.monto) : '', fecha_limite: pago.fecha_limite ?? hoy(), notas: pago.notas ?? '' })
  const [error, setError] = useState('')
  const sugerido = (t: string) => ({ luz: ['Luz', 'CFE', 'bimestral'], agua: ['Agua', 'OOMSAPAS', 'mensual'], predial: ['Predial', 'Municipio', 'anual'], internet: ['Internet', '', 'mensual'], telefono: ['Teléfono', 'Telmex', 'mensual'] } as Record<string, string[]>)[t]
  async function guardar() {
    if (!f.concepto.trim() || !f.fecha_limite) return setError('Escribe el concepto y la fecha límite.')
    const datos = { ...f, concepto: f.concepto.trim(), proveedor: f.proveedor.trim() || null, cuenta: f.cuenta.trim() || null, monto: f.monto ? Number(f.monto) : null, notas: f.notas.trim() || null }
    const { error } = pago.id ? await supabase.from('inmueble_pagos').update(datos).eq('id', pago.id) : await supabase.from('inmueble_pagos').insert({ ...datos, inmueble_id: inmuebleId, empresa_id: empresaId })
    if (error) return setError(mensajeError(error))
    onListo()
  }
  async function borrar() { if (pago.id) { await supabase.from('inmueble_pagos').delete().eq('id', pago.id); onListo() } }
  return (
    <Modal abierto titulo={pago.id ? 'Editar pago' : 'Nuevo servicio o pago'} onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">{Object.entries(TIPOS_PAGO).map(([k, v]) => (
          <button key={k} onClick={() => { const s = sugerido(k); setF(x => ({ ...x, tipo: k, ...(s && !pago.id ? { concepto: x.concepto || s[0], proveedor: x.proveedor || s[1], periodicidad: s[2] } : {}) })) }}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${f.tipo === k ? 'bg-marca/15 text-marca ring-marca/40' : 'text-stone-500 ring-stone-200'}`}><v.i size={12} />{v.t}</button>
        ))}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Concepto *" className="sm:col-span-2"><input className="campo" value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })} placeholder="Luz oficina" /></Campo>
          <Campo label="A quién se paga"><input className="campo" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} placeholder="CFE" /></Campo>
          <Campo label="No. de servicio / cuenta"><input className="campo font-mono" value={f.cuenta} onChange={e => setF({ ...f, cuenta: e.target.value })} /></Campo>
          <Campo label="Cada cuándo"><select className="campo" value={f.periodicidad} onChange={e => setF({ ...f, periodicidad: e.target.value })}>{Object.entries(PERIODOS).map(([k, [t]]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
          <Campo label="Fecha límite *"><input className="campo" type="date" value={f.fecha_limite} onChange={e => setF({ ...f, fecha_limite: e.target.value })} /></Campo>
          <Campo label="Monto aproximado (opcional)"><input className="campo" type="number" min="0" step="0.01" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /></Campo>
          <Campo label="Notas"><input className="campo" value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} placeholder="Se paga en línea, domiciliado…" /></Campo>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-wrap justify-between gap-2">
          {pago.id ? <button className="btn-peligro" onClick={borrar}><Trash2 size={15} />Borrar</button> : <span />}
          <div className="flex gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}><Check size={15} />Guardar</button></div>
        </div>
      </div>
    </Modal>
  )
}

const PRIO = { baja: 'bg-sky-50 text-sky-700', media: 'bg-amber-50 text-amber-800', alta: 'bg-red-50 text-red-700' }
const EST = { abierta: 'Abierta', en_proceso: 'En proceso', resuelta: 'Resuelta' }

/** Fallas del inmueble: goteras, luz, aire acondicionado, chapas… */
export function FallasInmueble({ inmuebleId, empresaId }: { inmuebleId: string; empresaId: string }) {
  const { puedeResguardar } = useAuth()
  const [fallas, setFallas] = useState<Falla[]>([])
  const [nueva, setNueva] = useState(false)
  const [resolver, setResolver] = useState<Falla | null>(null)
  const cargar = () => { supabase.from('inmueble_fallas').select('*').eq('inmueble_id', inmuebleId).order('created_at', { ascending: false }).then(({ data }) => setFallas((data as Falla[]) ?? [])) }
  useEffect(cargar, [inmuebleId])
  async function estatus(f: Falla, e: Falla['estatus'], resolucion?: string) {
    await supabase.from('inmueble_fallas').update({ estatus: e, ...(e === 'resuelta' ? { resuelta_at: new Date().toISOString(), resolucion: resolucion ?? f.resolucion } : {}) }).eq('id', f.id)
    cargar()
  }
  const abiertas = fallas.filter(f => f.estatus !== 'resuelta'), resueltas = fallas.filter(f => f.estatus === 'resuelta')
  return (
    <section className="tarjeta p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Siren size={17} className="text-marca" />Fallas reportadas</h2>
        <button className="btn-primario !py-1.5 text-xs" onClick={() => setNueva(true)}><Plus size={14} />Reportar falla</button>
      </div>
      {abiertas.length === 0 ? <p className="text-sm text-stone-500">Sin fallas abiertas.</p> : (
        <ul className="space-y-2">
          {abiertas.map(f => (
            <li key={f.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-stone-200 p-3">
              {f.foto && <img src={f.foto} alt="" className="h-14 w-16 shrink-0 rounded-lg object-cover" />}
              <span className="min-w-0 flex-1"><span className="block font-medium">{f.titulo}</span>{f.descripcion && <span className="block text-xs text-stone-500">{f.descripcion}</span>}<span className="block text-[11px] text-stone-500">{fecha(f.created_at)} · {EST[f.estatus]}</span></span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${PRIO[f.prioridad]}`}>{f.prioridad}</span>
              {puedeResguardar && <div className="flex gap-1.5">
                {f.estatus === 'abierta' && <button className="btn-sec !px-2.5 !py-1 text-xs" onClick={() => estatus(f, 'en_proceso')}>Atender</button>}
                <button className="btn-sec !px-2.5 !py-1 text-xs" onClick={() => setResolver(f)}><Check size={13} />Resuelta</button>
              </div>}
            </li>
          ))}
        </ul>
      )}
      {resueltas.length > 0 && <p className="mt-3 text-xs text-stone-500">{resueltas.length} resuelta(s); la última: {resueltas[0].titulo} ({fecha(resueltas[0].resuelta_at)}).</p>}
      {nueva && <NuevaFalla inmuebleId={inmuebleId} empresaId={empresaId} onCerrar={() => setNueva(false)} onListo={() => { setNueva(false); cargar() }} />}
      {resolver && <Modal abierto titulo="Marcar como resuelta" onCerrar={() => setResolver(null)} ancho="max-w-md"><Resolver onListo={r => { estatus(resolver, 'resuelta', r); setResolver(null) }} /></Modal>}
    </section>
  )
}

function Resolver({ onListo }: { onListo: (r: string) => void }) {
  const [r, setR] = useState('')
  return <div className="space-y-3"><Campo label="¿Qué se hizo?"><textarea className="campo" rows={3} autoFocus value={r} onChange={e => setR(e.target.value)} placeholder="Se cambió el contacto, vino el plomero…" /></Campo><div className="flex justify-end"><button className="btn-primario" onClick={() => onListo(r.trim())}><Check size={15} />Guardar</button></div></div>
}

function NuevaFalla({ inmuebleId, empresaId, onCerrar, onListo }: { inmuebleId: string; empresaId: string; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({ titulo: '', descripcion: '', prioridad: 'media' })
  const [foto, setFoto] = useState<string | null>(null)
  const [error, setError] = useState('')
  async function guardar() {
    if (!f.titulo.trim()) return setError('¿Qué falla?')
    const { error } = await supabase.from('inmueble_fallas').insert({ ...f, titulo: f.titulo.trim(), descripcion: f.descripcion.trim() || null, foto, inmueble_id: inmuebleId, empresa_id: empresaId })
    if (error) return setError(mensajeError(error))
    onListo()
  }
  return (
    <Modal abierto titulo="Reportar falla del inmueble" onCerrar={onCerrar} ancho="max-w-md">
      <div className="space-y-3">
        <Campo label="¿Qué falla? *"><input className="campo" autoFocus value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Gotera en bodega, no hay agua, chapa rota…" /></Campo>
        <Campo label="Detalle"><textarea className="campo" rows={2} value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} /></Campo>
        <Campo label="Prioridad"><div className="flex gap-2">{(['baja', 'media', 'alta'] as const).map(p => <button key={p} onClick={() => setF({ ...f, prioridad: p })} className={`flex-1 rounded-xl border px-3 py-2 text-sm capitalize ${f.prioridad === p ? 'border-marca bg-marca/10' : 'border-stone-200'}`}>{p}</button>)}</div></Campo>
        <label className="btn-sec cursor-pointer"><Camera size={15} />{foto ? 'Cambiar foto' : 'Agregar foto'}<input type="file" accept="image/*" hidden onChange={async e => { const x = e.target.files?.[0]; if (x) setFoto(await fotoProducto(x, 900)) }} /></label>
        {foto && <img src={foto} alt="" className="h-28 rounded-lg object-cover" />}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}><Check size={15} />Reportar</button></div>
      </div>
    </Modal>
  )
}
