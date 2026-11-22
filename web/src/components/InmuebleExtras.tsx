import { useEffect, useState } from 'react'
import { Receipt, Siren, Plus, Check, Pencil, Trash2, Camera, Zap, Droplets, Landmark, Wifi, Phone, Flame, Home, Wrench, Shield, Eye, Trash, CircleDollarSign } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fotoProducto } from '../lib/logos'
import { fecha } from '../lib/hooks'
import { Modal, Campo, Aviso } from './ui'

export type Pago = { id: string; inmueble_id: string; empresa_id: string; concepto: string; tipo: string; proveedor: string | null; cuenta: string | null; periodicidad: string; monto: number | null
  fecha_limite: string; pagado: boolean; pagado_at: string | null; notas: string | null; referencia_pago?: string | null; comprobante?: string | null; pagado_por?: string | null }
type Falla = { id: string; titulo: string; descripcion: string | null; prioridad: 'baja' | 'media' | 'alta'; estatus: 'abierta' | 'en_proceso' | 'resuelta'; foto: string | null; resolucion: string | null; created_at: string; resuelta_at: string | null }

export const TIPOS_PAGO: Record<string, { t: string; i: typeof Zap }> = {
  luz: { t: 'Luz (CFE)', i: Zap }, agua: { t: 'Agua', i: Droplets }, predial: { t: 'Predial', i: Landmark }, internet: { t: 'Internet', i: Wifi }, telefono: { t: 'Teléfono', i: Phone },
  gas: { t: 'Gas', i: Flame }, renta: { t: 'Renta', i: Home }, mantenimiento: { t: 'Mantenimiento / cuota', i: Wrench }, seguro: { t: 'Seguro', i: Shield }, vigilancia: { t: 'Vigilancia', i: Eye },
  basura: { t: 'Recolección de basura', i: Trash }, otro: { t: 'Otro', i: CircleDollarSign },
}
export const PERIODOS: Record<string, [string, number]> = { unico: ['Una vez', 0], mensual: ['Mensual', 1], bimestral: ['Bimestral', 2], trimestral: ['Trimestral', 3], semestral: ['Semestral', 6], anual: ['Anual', 12] }
const hoy = () => new Date().toISOString().slice(0, 10)
const sumarMeses = (f: string, m: number) => { const d = new Date(f + 'T12:00'); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10) }
export const dinero = (n: number | null) => n == null ? '' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
export function estadoPago(p: Pick<Pago, 'pagado' | 'pagado_at' | 'fecha_limite'>) {
  if (p.pagado) return { t: `Pagado ${p.pagado_at ? fecha(p.pagado_at) : ''}`, c: 'bg-emerald-50 text-emerald-700' }
  const d = Math.round((new Date(p.fecha_limite + 'T12:00').getTime() - Date.now()) / 864e5)
  if (d < 0) return { t: `Vencido hace ${-d} día(s)`, c: 'bg-red-50 text-red-700' }
  if (d <= 7) return { t: d === 0 ? 'Vence hoy' : `Vence en ${d} día(s)`, c: 'bg-amber-50 text-amber-800' }
  return { t: `Vence ${fecha(p.fecha_limite)}`, c: 'bg-stone-100 text-stone-600' }
}

/** Marca un pago como pagado (con referencia y comprobante) y deja listo el siguiente según cada cuándo se paga. */
export async function registrarPago(p: Pago, extra: { fecha?: string; referencia?: string | null; comprobante?: string | null; pagadoPor?: string | null } = {}) {
  const { error } = await supabase.from('inmueble_pagos').update({ pagado: true, pagado_at: extra.fecha || hoy(), referencia_pago: extra.referencia || null, comprobante: extra.comprobante || null, pagado_por: extra.pagadoPor ?? null }).eq('id', p.id)
  if (error) throw error
  const meses = PERIODOS[p.periodicidad]?.[1] ?? 0
  if (meses) {
    const siguiente = sumarMeses(p.fecha_limite, meses)
    const { data: ya } = await supabase.from('inmueble_pagos').select('id').eq('inmueble_id', p.inmueble_id).eq('concepto', p.concepto).eq('fecha_limite', siguiente).limit(1)
    if (!ya?.length) await supabase.from('inmueble_pagos').insert({ inmueble_id: p.inmueble_id, empresa_id: p.empresa_id, concepto: p.concepto, tipo: p.tipo, proveedor: p.proveedor, cuenta: p.cuenta,
      periodicidad: p.periodicidad, monto: p.monto, notas: p.notas, fecha_limite: siguiente })
  }
}

/** Ventana para registrar el pago: fecha, folio o referencia y foto/PDF del comprobante. */
export function RegistrarPago({ pago, onCerrar, onListo }: { pago: Pago; onCerrar: () => void; onListo: () => void }) {
  const { perfil } = useAuth()
  const [f, setF] = useState({ fecha: hoy(), referencia: '' })
  const [comp, setComp] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  async function archivo(a?: File) {
    if (!a) return
    setError('')
    try {
      if (a.type.startsWith('image/')) setComp(await fotoProducto(a))
      else if (a.type === 'application/pdf') { if (a.size > 1_500_000) return setError('El PDF pesa más de 1.5 MB; mejor toma una foto del recibo.'); setComp(await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(a) })) }
      else return setError('Sube una foto o un PDF.')
      setNombre(a.name)
    } catch { setError('No se pudo leer el archivo.') }
  }
  async function guardar() {
    setGuardando(true); setError('')
    try { await registrarPago(pago, { fecha: f.fecha, referencia: f.referencia.trim(), comprobante: comp, pagadoPor: perfil?.id ?? null }); onListo() }
    catch (e) { setError(mensajeError(e)); setGuardando(false) }
  }
  const sig = (PERIODOS[pago.periodicidad]?.[1] ?? 0) ? sumarMeses(pago.fecha_limite, PERIODOS[pago.periodicidad][1]) : null
  return (
    <Modal abierto titulo={`Registrar pago · ${pago.concepto}`} onCerrar={onCerrar} ancho="max-w-md">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Fecha de pago"><input className="campo" type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
          <Campo label="Folio o referencia"><input className="campo font-mono" value={f.referencia} onChange={e => setF({ ...f, referencia: e.target.value })} placeholder="No. de operación" /></Campo>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 p-3 text-sm text-stone-500 hover:border-marca">
          <Camera size={18} className="text-marca" /><span className="min-w-0 flex-1 truncate">{nombre || 'Comprobante (foto o PDF, opcional)'}</span>
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => archivo(e.target.files?.[0])} />
        </label>
        {comp?.startsWith('data:image') && <img src={comp} alt="Comprobante" className="max-h-40 rounded-lg object-contain" />}
        {sig && <p className="text-xs text-stone-500">Se programa el siguiente pago para el {fecha(sig)}.</p>}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando} onClick={guardar}><Check size={15} />{guardando ? 'Guardando…' : 'Marcar pagado'}</button></div>
      </div>
    </Modal>
  )
}

/** Abrir el comprobante guardado (imagen o PDF) en otra pestaña. */
export function verComprobante(c: string) {
  const w = window.open(); if (!w) return
  w.document.write(c.startsWith('data:application/pdf') ? `<iframe src="${c}" style="border:0;width:100%;height:100vh"></iframe>` : `<img src="${c}" style="max-width:100%">`)
}

const TIPICOS: [string, string, string, string][] = [['luz', 'Luz', 'CFE', 'bimestral'], ['agua', 'Agua', 'OOMSAPAS', 'mensual'], ['predial', 'Predial', 'Municipio', 'anual'], ['internet', 'Internet', '', 'mensual'],
  ['telefono', 'Teléfono', 'Telmex', 'mensual'], ['gas', 'Gas', '', 'mensual'], ['basura', 'Recolección de basura', '', 'mensual'], ['vigilancia', 'Vigilancia', '', 'mensual'], ['renta', 'Renta', '', 'mensual'], ['seguro', 'Seguro del inmueble', '', 'anual']]

/** Alta rápida de los servicios que se pagan en un inmueble: se marcan y se pone cuándo vence cada uno. */
export function ServiciosTipicos({ inmuebleId, empresaId, existentes, onCerrar, onListo }: { inmuebleId: string; empresaId: string; existentes: string[]; onCerrar: () => void; onListo: () => void }) {
  const [sel, setSel] = useState<Record<string, { on: boolean; proveedor: string; cuenta: string; periodicidad: string; fecha: string }>>(() =>
    Object.fromEntries(TIPICOS.map(([k, , prov, per]) => [k, { on: false, proveedor: prov, cuenta: '', periodicidad: per, fecha: hoy() }])))
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const n = Object.values(sel).filter(x => x.on).length
  async function guardar() {
    setGuardando(true); setError('')
    const filas = TIPICOS.filter(([k]) => sel[k].on).map(([k, t]) => ({ inmueble_id: inmuebleId, empresa_id: empresaId, tipo: k, concepto: t, proveedor: sel[k].proveedor.trim() || null, cuenta: sel[k].cuenta.trim() || null, periodicidad: sel[k].periodicidad, fecha_limite: sel[k].fecha }))
    const { error } = await supabase.from('inmueble_pagos').insert(filas)
    setGuardando(false)
    if (error) setError(mensajeError(error)); else onListo()
  }
  return (
    <Modal abierto titulo="Servicios que se pagan en este inmueble" onCerrar={onCerrar} ancho="max-w-3xl">
      <p className="mb-3 text-sm text-stone-500">Marca los que aplican y pon el próximo vencimiento. Cada vez que se registre un pago, el sistema programa el siguiente.</p>
      <ul className="space-y-2">
        {TIPICOS.map(([k, t]) => {
          const T = TIPOS_PAGO[k] ?? TIPOS_PAGO.otro, x = sel[k], ya = existentes.includes(k)
          const set = (c: Partial<typeof x>) => setSel(s => ({ ...s, [k]: { ...s[k], ...c } }))
          return (
            <li key={k} className={`rounded-xl border p-3 ${x.on ? 'border-marca/50 bg-marca/5' : 'border-stone-200'}`}>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" checked={x.on} onChange={e => set({ on: e.target.checked })} />
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-marca/10 text-marca"><T.i size={15} /></span>
                <span className="flex-1 text-sm font-medium">{t}</span>{ya && <span className="text-[11px] text-stone-400">ya registrado</span>}
              </label>
              {x.on && <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <input className="campo !py-1.5 text-sm" value={x.proveedor} onChange={e => set({ proveedor: e.target.value })} placeholder="A quién se paga" aria-label="A quién se paga" />
                <input className="campo !py-1.5 font-mono text-sm" value={x.cuenta} onChange={e => set({ cuenta: e.target.value })} placeholder="No. de servicio" aria-label="No. de servicio" />
                <select className="campo !py-1.5 text-sm" value={x.periodicidad} onChange={e => set({ periodicidad: e.target.value })} aria-label="Cada cuándo">{Object.entries(PERIODOS).map(([p, [pt]]) => <option key={p} value={p}>{pt}</option>)}</select>
                <input className="campo !py-1.5 text-sm" type="date" value={x.fecha} onChange={e => set({ fecha: e.target.value })} aria-label="Próximo vencimiento" />
              </div>}
            </li>
          )
        })}
      </ul>
      {error && <div className="mt-3"><Aviso>{error}</Aviso></div>}
      <div className="mt-4 flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={!n || guardando} onClick={guardar}><Check size={15} />Agregar {n || ''} servicio(s)</button></div>
    </Modal>
  )
}

/** Servicios y pagos del inmueble (luz, agua, predial…): qué toca pagar y cuándo. Al marcar pagado se crea el siguiente. */
export function PagosInmueble({ inmuebleId, empresaId }: { inmuebleId: string; empresaId: string }) {
  const { puedeEditar } = useAuth()
  const [pagos, setPagos] = useState<Pago[]>([])
  const [editar, setEditar] = useState<Partial<Pago> | null>(null)
  const [verPagados, setVerPagados] = useState(false)
  const [pagar, setPagar] = useState<Pago | null>(null)
  const [tipicos, setTipicos] = useState(false)
  const cargar = () => { supabase.from('inmueble_pagos').select('*').eq('inmueble_id', inmuebleId).order('fecha_limite').then(({ data }) => setPagos((data as Pago[]) ?? [])) }
  useEffect(cargar, [inmuebleId])

  const pendientes = pagos.filter(p => !p.pagado), pagados = pagos.filter(p => p.pagado).reverse()
  return (
    <section className="tarjeta p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Receipt size={17} className="text-marca" />Servicios y pagos</h2>
        {puedeEditar && <div className="flex gap-2">
          <button className="btn-sec !py-1.5 text-xs" onClick={() => setTipicos(true)}><Receipt size={14} />Servicios del inmueble</button>
          <button className="btn-primario !py-1.5 text-xs" onClick={() => setEditar({ tipo: 'luz', periodicidad: 'bimestral', fecha_limite: hoy() })}><Plus size={14} />Agregar</button>
        </div>}
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
                  <button className="btn-sec !px-2.5 !py-1.5 text-xs" onClick={() => setPagar(p)}><Check size={14} />Pagado</button>
                  <button className="rounded p-1 text-stone-400 hover:text-tinta" onClick={() => setEditar(p)} aria-label="Editar"><Pencil size={14} /></button>
                </>}
              </li>
            )
          })}
        </ul>
      )}
      {pagados.length > 0 && <button className="mt-3 text-xs text-stone-500 hover:text-tinta" onClick={() => setVerPagados(v => !v)}>{verPagados ? 'Ocultar' : 'Ver'} historial de pagos ({pagados.length})</button>}
      {verPagados && <ul className="mt-2 divide-y divide-stone-100 text-sm">{pagados.map(p => <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{p.concepto} · {fecha(p.fecha_limite)}</span><span className="flex items-center gap-2 text-xs text-emerald-700">Pagado {p.pagado_at ? fecha(p.pagado_at) : ''}{p.referencia_pago ? ` · Ref. ${p.referencia_pago}` : ''}{p.monto ? ` · ${dinero(p.monto)}` : ''}{p.comprobante && <button className="text-marca underline" onClick={() => verComprobante(p.comprobante!)}>Comprobante</button>}</span></li>)}</ul>}
      {editar && <EditarPago pago={editar} inmuebleId={inmuebleId} empresaId={empresaId} onCerrar={() => setEditar(null)} onListo={() => { setEditar(null); cargar() }} />}
      {pagar && <RegistrarPago pago={pagar} onCerrar={() => setPagar(null)} onListo={() => { setPagar(null); cargar() }} />}
      {tipicos && <ServiciosTipicos inmuebleId={inmuebleId} empresaId={empresaId} existentes={pendientes.map(p => p.tipo)} onCerrar={() => setTipicos(false)} onListo={() => { setTipicos(false); cargar() }} />}
    </section>
  )
}

export function EditarPago({ pago, inmuebleId, empresaId, onCerrar, onListo }: { pago: Partial<Pago>; inmuebleId: string; empresaId: string; onCerrar: () => void; onListo: () => void }) {
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
