import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Inbox, Plus, Check, X, PackageCheck, Ban, Clock, MapPin, User, CalendarDays, Trash2, Search, Package, HardHat, PenLine, Minus, AlertTriangle } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, nombreEmpleado } from '../lib/hooks'
import { Cargando, Vacio, Aviso, Modal, Campo } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import { type Consumible, type Existencia, type ItemSolicitud, num, plural } from '../lib/almacen'
import { fechaCorta, diasPara } from '../components/Prestamo'

type Estatus = 'pendiente' | 'aprobada' | 'rechazada' | 'entregada' | 'cancelada'
type Solicitud = { id: string; folio: string; empresa_id: string; empleado_id: string | null; ubicacion_id: string | null; items: ItemSolicitud[]; motivo: string | null; fecha_necesaria: string | null
  estatus: Estatus; respuesta: string | null; resuelto_at: string | null; movimiento_id: string | null; entregado_at: string | null; solicitante: string | null; created_by: string | null; created_at: string
  empresas: { nombre: string; nombre_corto: string | null; color: string | null } | null; empleados: { nombres: string; apellidos: string | null; puesto: string | null } | null; ubicaciones: { nombre: string } | null }
type Modelo = { id: string; nombre: string; foto_path: string | null; descripcion: string | null; marcas: { nombre: string } | null; categorias: { nombre: string } | null }
type Disp = { id: string; codigo: string; modelo_id: string; empresa_id: string; serie: string | null; ubicacion: string | null }

const EST: Record<Estatus, { texto: string; clase: string }> = {
  pendiente: { texto: 'Por aprobar', clase: 'bg-amber-50 text-amber-800 ring-amber-200' },
  aprobada: { texto: 'Aprobada · por entregar', clase: 'bg-sky-50 text-sky-700 ring-sky-200' },
  entregada: { texto: 'Entregada', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  rechazada: { texto: 'Rechazada', clase: 'bg-red-50 text-red-700 ring-red-200' },
  cancelada: { texto: 'Cancelada', clase: 'bg-stone-100 text-stone-600 ring-stone-200' },
}
const SELECT = '*, empresas(nombre,nombre_corto,color), empleados(nombres,apellidos,puesto), ubicaciones(nombre)'

/** Solicitudes de equipo y material: alguien pide, almacén aprueba y entrega con resguardo. Sin compras ni costos. */
export default function Solicitudes() {
  const { puedeResguardar, perfil, session } = useAuth()
  const [lista, setLista] = useState<Solicitud[] | null>(null)
  const [filtro, setFiltro] = useState<'abiertas' | Estatus | 'todas'>('abiertas')
  const [nueva, setNueva] = useState(false)
  const [responder, setResponder] = useState<{ s: Solicitud; aprobar: boolean } | null>(null)
  const [entregar, setEntregar] = useState<Solicitud | null>(null)
  const [error, setError] = useState('')
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [cons, setCons] = useState<Consumible[]>([])
  const [disp, setDisp] = useState<Disp[]>([])
  const [ex, setEx] = useState<Existencia[]>([])

  const cargar = () => {
    supabase.from('solicitudes').select(SELECT).order('created_at', { ascending: false }).limit(500).then(({ data }) => setLista((data as unknown as Solicitud[]) ?? []))
    supabase.from('v_activos').select('id,codigo,modelo_id,empresa_id,serie,ubicacion').eq('estatus', 'disponible').then(({ data }) => setDisp((data as Disp[]) ?? []))
    supabase.from('v_existencias').select('*').then(({ data }) => setEx((data as Existencia[]) ?? []))
  }
  useEffect(() => {
    cargar()
    supabase.from('modelos').select('id,nombre,foto_path,descripcion,marcas(nombre),categorias(nombre)').eq('activo', true).order('nombre').then(({ data }) => setModelos((data as unknown as Modelo[]) ?? []))
    supabase.from('consumibles').select('*').eq('activo', true).order('nombre').then(({ data }) => setCons((data as Consumible[]) ?? []))
  }, [])

  async function cancelar(s: Solicitud) {
    setError('')
    const { error } = await supabase.from('solicitudes').update({ estatus: 'cancelada' }).eq('id', s.id)
    if (error) setError(mensajeError(error)); else cargar()
  }

  if (!lista) return <Cargando />
  const n = (e: Estatus) => lista.filter(s => s.estatus === e).length
  const vis = lista.filter(s => filtro === 'todas' ? true : filtro === 'abiertas' ? s.estatus === 'pendiente' || s.estatus === 'aprobada' : s.estatus === filtro)
  const nombreItem = (it: ItemSolicitud) => it.tipo === 'libre' ? it.descripcion : it.tipo === 'producto'
    ? (() => { const m = modelos.find(x => x.id === it.modelo_id); return m ? `${m.marcas?.nombre ?? ''} ${m.nombre}`.trim() : it.nombre ?? 'Producto' })()
    : cons.find(x => x.id === it.consumible_id)?.nombre ?? it.nombre ?? 'Artículo'
  const hayDe = (it: ItemSolicitud, empresa: string) => it.tipo === 'producto' ? disp.filter(d => d.modelo_id === it.modelo_id && d.empresa_id === empresa).length
    : it.tipo === 'consumible' ? ex.filter(e => e.consumible_id === it.consumible_id && e.empresa_id === empresa).reduce((s, e) => s + Number(e.existencia), 0) : null

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Solicitudes</h1>
          <p className="mt-1 text-sm text-stone-500">Una obra o un empleado pide equipo o material; almacén aprueba y entrega con resguardo. Lo que no hay se queda anotado.</p>
        </div>
        <button className="btn-primario" onClick={() => setNueva(true)}><Plus size={16} />Nueva solicitud</button>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50 p-1">
        {([['abiertas', `Abiertas · ${n('pendiente') + n('aprobada')}`], ['pendiente', `Por aprobar · ${n('pendiente')}`], ['aprobada', `Por entregar · ${n('aprobada')}`], ['entregada', `Entregadas · ${n('entregada')}`], ['todas', 'Todas']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${filtro === k ? 'bg-marca text-[#120D04]' : 'text-stone-500 hover:text-tinta'}`}>{t}</button>
        ))}
      </div>
      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}

      {vis.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin solicitudes aquí" texto="Cuando alguien pida equipo o material aparecerá en esta bandeja." accion={<button className="btn-sec" onClick={() => setNueva(true)}><Plus size={15} />Nueva solicitud</button>} /></div> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {vis.map((s, i) => {
            const urge = s.fecha_necesaria && (s.estatus === 'pendiente' || s.estatus === 'aprobada') ? diasPara(s.fecha_necesaria) : null
            const mia = s.created_by === session?.user.id
            return (
              <article key={s.id} className="tarjeta min-w-0 animate-entrar p-4" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-stone-500">{s.folio}</span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${EST[s.estatus].clase}`}>{EST[s.estatus].texto}</span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-500"><span className="h-2 w-2 rounded-full" style={{ background: s.empresas?.color ?? '#F9B234' }} />{s.empresas?.nombre_corto || s.empresas?.nombre}</span>
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-stone-400"><Clock size={11} />{new Date(s.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                  {s.empleados && <span className="inline-flex items-center gap-1"><User size={12} />Para {nombreEmpleado(s.empleados)}</span>}
                  {s.ubicaciones && <span className="inline-flex items-center gap-1"><MapPin size={12} />{s.ubicaciones.nombre}</span>}
                  {s.fecha_necesaria && <span className={`inline-flex items-center gap-1 ${urge != null && urge < 0 ? 'text-red-700' : urge != null && urge <= 2 ? 'text-amber-700' : ''}`}><CalendarDays size={12} />Se necesita {urge === 0 ? 'hoy' : fechaCorta(s.fecha_necesaria)}</span>}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {s.items.map((it, k) => {
                    const hay = s.estatus === 'pendiente' || s.estatus === 'aprobada' ? hayDe(it, s.empresa_id) : null
                    const falta = hay != null && hay < it.cantidad
                    const I = it.tipo === 'producto' ? Package : it.tipo === 'consumible' ? HardHat : PenLine
                    return (
                      <li key={k} className="flex items-center gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-sm">
                        <I size={14} className="shrink-0 text-stone-400" />
                        <span className="cifra w-7 shrink-0 text-right font-semibold">{num(it.cantidad)}</span>
                        <span className="min-w-0 flex-1 truncate">{nombreItem(it)}</span>
                        {hay != null && <span className={`shrink-0 text-[11px] ${falta ? 'text-red-700' : 'text-emerald-700'}`}>{falta ? `hay ${num(hay)}` : 'hay'}</span>}
                      </li>
                    )
                  })}
                </ul>
                {s.motivo && <p className="mt-2 text-sm text-stone-600">“{s.motivo}”</p>}
                <p className="mt-1 text-[11px] text-stone-400">Pidió {s.solicitante ?? '—'}</p>
                {s.respuesta && <p className={`mt-2 rounded-lg border px-3 py-2 text-xs ${s.estatus === 'rechazada' ? 'border-red-200 bg-red-50 text-red-700' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>{s.respuesta}</p>}
                {s.movimiento_id && <Link to={`/resguardos/${s.movimiento_id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-marca hover:underline"><PackageCheck size={13} />Ver resguardo de entrega</Link>}
                {(s.estatus === 'pendiente' || s.estatus === 'aprobada') && (puedeResguardar || mia) && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-stone-200 pt-3">
                    {puedeResguardar && s.estatus === 'pendiente' && <>
                      <button className="btn-primario !px-3 !py-1.5 text-xs" onClick={() => setResponder({ s, aprobar: true })}><Check size={14} />Aprobar</button>
                      <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => setResponder({ s, aprobar: false })}><X size={14} />Rechazar</button>
                    </>}
                    {puedeResguardar && s.estatus === 'aprobada' && <button className="btn-primario !px-3 !py-1.5 text-xs" onClick={() => setEntregar(s)}><PackageCheck size={14} />Entregar</button>}
                    {(mia || puedeResguardar) && s.estatus === 'pendiente' && <button className="ml-auto inline-flex items-center gap-1 px-2 text-xs text-stone-500 hover:text-red-700" onClick={() => cancelar(s)}><Ban size={14} />Cancelar</button>}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {nueva && <NuevaSolicitud modelos={modelos} consumibles={cons} hayDe={hayDe} solicitante={perfil?.nombre ?? ''} onCerrar={() => setNueva(false)} onListo={() => { setNueva(false); setFiltro('abiertas'); cargar() }} />}
      {responder && <Responder {...responder} onCerrar={() => setResponder(null)} onListo={() => { setResponder(null); cargar() }} />}
      {entregar && <Entregar s={entregar} modelos={modelos} consumibles={cons} disp={disp} ex={ex} nombreItem={nombreItem} entrega={perfil?.nombre ?? ''} onCerrar={() => setEntregar(null)} onListo={() => { setEntregar(null); cargar() }} />}
    </div>
  )
}

function NuevaSolicitud({ modelos, consumibles, hayDe, solicitante, onCerrar, onListo }: {
  modelos: Modelo[]; consumibles: Consumible[]; hayDe: (it: ItemSolicitud, e: string) => number | null; solicitante: string; onCerrar: () => void; onListo: () => void
}) {
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const { items: ubis } = useLista('ubicaciones', 'id,nombre,empresa_id')
  const { items: emps } = useLista('empleados', 'id,nombre:nombres,apellidos,empresa_id,puesto', 'nombres')
  const [empresa, setEmpresa] = useState('')
  const [empleado, setEmpleado] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [fecha, setFecha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [items, setItems] = useState<ItemSolicitud[]>([])
  const [modo, setModo] = useState<'producto' | 'consumible' | 'libre'>('producto')
  const [q, setQ] = useState('')
  const [libre, setLibre] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (!empresa && empresas.length) setEmpresa(empresas[0].id) }, [empresas, empresa])

  const opciones = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (modo === 'producto') return modelos.filter(m => !t || [m.nombre, m.marcas?.nombre, m.descripcion, m.categorias?.nombre].some(x => x?.toLowerCase().includes(t))).slice(0, 8)
      .map(m => ({ key: m.id, item: { tipo: 'producto', modelo_id: m.id, cantidad: 1 } as ItemSolicitud, titulo: `${m.marcas?.nombre ?? ''} ${m.nombre}`.trim(), sub: m.descripcion, foto: m.foto_path, cat: m.categorias?.nombre }))
    if (modo === 'consumible') return consumibles.filter(c => !t || [c.nombre, c.categoria, c.marca].some(x => x?.toLowerCase().includes(t))).slice(0, 8)
      .map(c => ({ key: c.id, item: { tipo: 'consumible', consumible_id: c.id, cantidad: 1 } as ItemSolicitud, titulo: c.nombre, sub: c.categoria, foto: c.foto, cat: null }))
    return []
  }, [modo, q, modelos, consumibles])
  const clave = (it: ItemSolicitud) => it.tipo === 'producto' ? it.modelo_id : it.tipo === 'consumible' ? it.consumible_id : 'l:' + it.descripcion
  const agregar = (it: ItemSolicitud) => setItems(xs => xs.some(x => clave(x) === clave(it)) ? xs.map(x => clave(x) === clave(it) ? { ...x, cantidad: x.cantidad + 1 } : x) : [...xs, it])
  const cambiar = (k: number, d: number) => setItems(xs => xs.map((x, i) => i === k ? { ...x, cantidad: Math.max(1, x.cantidad + d) } : x))
  const titulo = (it: ItemSolicitud) => it.tipo === 'libre' ? it.descripcion : it.tipo === 'producto' ? (() => { const m = modelos.find(x => x.id === it.modelo_id); return `${m?.marcas?.nombre ?? ''} ${m?.nombre ?? ''}`.trim() })() : consumibles.find(c => c.id === it.consumible_id)?.nombre ?? ''

  async function enviar() {
    setError('')
    if (!empresa) return setError('Elige la empresa.')
    if (items.length === 0) return setError('Agrega al menos una cosa.')
    if (!empleado && !ubicacion) return setError('Indica para quién es o a qué obra va.')
    const { error } = await supabase.from('solicitudes').insert({ empresa_id: empresa, empleado_id: empleado || null, ubicacion_id: ubicacion || null, items: items.map(x => ({ ...x, nombre: titulo(x) })), motivo: motivo || null, fecha_necesaria: fecha || null, solicitante, estatus: 'pendiente' })
    if (error) return setError(mensajeError(error))
    onListo()
  }

  return (
    <Modal abierto titulo="Nueva solicitud" onCerrar={onCerrar}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Empresa"><select className="campo" value={empresa} onChange={e => { setEmpresa(e.target.value); setEmpleado(''); setUbicacion('') }}>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select></Campo>
          <Campo label="¿Para cuándo?"><input className="campo" type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></Campo>
          <Campo label="¿Para quién?"><select className="campo" value={empleado} onChange={e => setEmpleado(e.target.value)}><option value="">Para la obra en general</option>{emps.filter(x => x.empresa_id === empresa).map(x => <option key={x.id} value={x.id}>{x.nombre} {x.apellidos as string}</option>)}</select></Campo>
          <Campo label="¿A dónde va?"><select className="campo" value={ubicacion} onChange={e => setUbicacion(e.target.value)}><option value="">—</option>{ubis.filter(u => u.empresa_id === empresa).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
        </div>

        <div>
          <span className="etiqueta">¿Qué se necesita?</span>
          <div className="mb-2 grid grid-cols-3 gap-1 rounded-2xl border border-stone-200 bg-stone-50 p-1">
            {([['producto', 'Equipo', Package], ['consumible', 'Material', HardHat], ['libre', 'Otra cosa', PenLine]] as const).map(([k, t, I]) => (
              <button key={k} onClick={() => { setModo(k); setQ('') }} className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition ${modo === k ? 'bg-marca text-[#120D04]' : 'text-stone-500 hover:text-tinta'}`}><I size={14} />{t}</button>
            ))}
          </div>
          {modo === 'libre' ? (
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (libre.trim()) { agregar({ tipo: 'libre', descripcion: libre.trim(), cantidad: 1 }); setLibre('') } }}>
              <input className="campo" value={libre} onChange={e => setLibre(e.target.value)} placeholder="Ej. Escalera de tijera 8 peldaños" />
              <button className="btn-sec shrink-0"><Plus size={15} />Agregar</button>
            </form>
          ) : <>
            <div className="relative mb-2"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder={modo === 'producto' ? 'Buscar en el catálogo…' : 'Buscar casco, broca…'} /></div>
            <div className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {opciones.map(o => { const hay = empresa ? hayDe(o.item, empresa) : null; return (
                <button key={o.key} onClick={() => agregar(o.item)} className="flex min-w-0 items-center gap-2 rounded-xl border border-stone-200 p-1.5 text-left transition hover:border-marca/60">
                  <FotoActivo fotoModelo={o.foto} categoria={o.cat} className="h-10 w-10 shrink-0 rounded-lg" icono={16} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm">{o.titulo}</span><span className={`block text-[11px] ${hay ? 'text-emerald-700' : 'text-stone-400'}`}>{hay ? `${num(hay)} disponibles` : 'Sin existencia'}</span></span>
                  <Plus size={15} className="shrink-0 text-marca" />
                </button>
              ) })}
            </div>
          </>}
        </div>

        {items.length > 0 && (
          <ul className="space-y-1.5 rounded-xl border border-stone-200 p-2">
            {items.map((it, k) => (
              <li key={k} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{titulo(it)}</span>
                <button className="rounded-lg border border-stone-200 p-1" onClick={() => cambiar(k, -1)} aria-label="Menos"><Minus size={12} /></button>
                <span className="cifra w-8 text-center font-semibold">{it.cantidad}</span>
                <button className="rounded-lg border border-stone-200 p-1" onClick={() => cambiar(k, 1)} aria-label="Más"><Plus size={12} /></button>
                <button className="p-1 text-stone-400 hover:text-red-700" onClick={() => setItems(xs => xs.filter((_, i) => i !== k))} aria-label="Quitar"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
        <Campo label="¿Para qué?"><textarea className="campo" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Arranca la cimentación del edificio B el lunes" /></Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={enviar}><Inbox size={16} />Enviar solicitud</button></div>
      </div>
    </Modal>
  )
}

function Responder({ s, aprobar, onCerrar, onListo }: { s: Solicitud; aprobar: boolean; onCerrar: () => void; onListo: () => void }) {
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  async function guardar() {
    if (!aprobar && !nota.trim()) return setError('Escribe el motivo para que quien pidió sepa qué pasó.')
    const { error } = await supabase.from('solicitudes').update({ estatus: aprobar ? 'aprobada' : 'rechazada', respuesta: nota || null, resuelto_at: new Date().toISOString() }).eq('id', s.id)
    if (error) return setError(mensajeError(error))
    onListo()
  }
  return (
    <Modal abierto titulo={`${aprobar ? 'Aprobar' : 'Rechazar'} ${s.folio}`} onCerrar={onCerrar} ancho="max-w-md">
      <div className="space-y-4">
        <Campo label={aprobar ? 'Nota (opcional)' : 'Motivo'}><textarea className="campo" rows={3} autoFocus value={nota} onChange={e => setNota(e.target.value)} placeholder={aprobar ? 'Ej. Se entrega el lunes en la mañana' : 'Ej. Ya tiene una laptop asignada'} /></Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className={aprobar ? 'btn-primario' : 'btn-peligro'} onClick={guardar}>{aprobar ? <><Check size={16} />Aprobar</> : <><X size={16} />Rechazar</>}</button></div>
      </div>
    </Modal>
  )
}

/** Entrega: aparta unidades disponibles, crea el resguardo y descuenta el material del almacén. */
function Entregar({ s, modelos, consumibles, disp, ex, nombreItem, entrega, onCerrar, onListo }: {
  s: Solicitud; modelos: Modelo[]; consumibles: Consumible[]; disp: Disp[]; ex: Existencia[]; nombreItem: (it: ItemSolicitud) => string; entrega: string; onCerrar: () => void; onListo: () => void
}) {
  const nav = useNavigate()
  const prods = s.items.filter((x): x is Extract<ItemSolicitud, { tipo: 'producto' }> => x.tipo === 'producto')
  const mats = s.items.filter((x): x is Extract<ItemSolicitud, { tipo: 'consumible' }> => x.tipo === 'consumible')
  const libres = s.items.filter(x => x.tipo === 'libre')
  const [sel, setSel] = useState<string[]>(() => prods.flatMap(p => disp.filter(d => d.modelo_id === p.modelo_id && d.empresa_id === s.empresa_id).slice(0, p.cantidad).map(d => d.id)))
  const lugares = (cid: string) => ex.filter(e => e.consumible_id === cid && e.empresa_id === s.empresa_id && Number(e.existencia) > 0).sort((a, b) => Number(b.existencia) - Number(a.existencia))
  const [origen, setOrigen] = useState<Record<string, string>>(() => Object.fromEntries(mats.map(m => [m.consumible_id, lugares(m.consumible_id)[0]?.ubicacion_id ?? ''])))
  const [cant, setCant] = useState<Record<string, number>>(() => Object.fromEntries(mats.map(m => [m.consumible_id, Math.min(m.cantidad, Number(lugares(m.consumible_id)[0]?.existencia ?? 0))])))
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const recibe = s.empleados ? nombreEmpleado(s.empleados) : ''

  async function confirmar() {
    setError('')
    if (sel.length && !s.empleado_id && !s.ubicacion_id) return setError('La solicitud no tiene a quién ni a dónde entregar.')
    setGuardando(true)
    try {
      let movId: string | null = null
      if (sel.length) {
        const { data, error } = await supabase.rpc('registrar_movimiento', {
          p_tipo: s.empleado_id ? 'asignacion' : 'traspaso', p_empresa: s.empresa_id, p_activos: sel, p_a_empleado: s.empleado_id, p_a_ubicacion: s.ubicacion_id,
          p_entrega_nombre: entrega, p_recibe_nombre: recibe || null, p_notas: `Entrega de la solicitud ${s.folio}${s.motivo ? ' · ' + s.motivo : ''}`, p_estados: {},
        })
        if (error) throw error
        movId = data as string
      }
      const salidas = mats.filter(m => (cant[m.consumible_id] ?? 0) > 0).map(m => ({ consumible_id: m.consumible_id, empresa_id: s.empresa_id, ubicacion_id: origen[m.consumible_id] || null, tipo: 'salida', cantidad: cant[m.consumible_id], empleado_id: s.empleado_id, solicitud_id: s.id, notas: `Solicitud ${s.folio}` }))
      if (salidas.length) { const { error } = await supabase.from('movimientos_consumible').insert(salidas); if (error) throw error }
      const faltan = [
        ...prods.map(p => ({ n: nombreItem(p), f: p.cantidad - sel.filter(id => disp.find(d => d.id === id)?.modelo_id === p.modelo_id).length })),
        ...mats.map(m => ({ n: nombreItem(m), f: m.cantidad - (cant[m.consumible_id] ?? 0) })),
        ...libres.map(l => ({ n: nombreItem(l), f: l.cantidad })),
      ].filter(x => x.f > 0)
      const { error } = await supabase.from('solicitudes').update({ estatus: 'entregada', movimiento_id: movId, entregado_at: new Date().toISOString(),
        respuesta: faltan.length ? `Entregada parcialmente. Quedó pendiente: ${faltan.map(x => `${x.f} × ${x.n}`).join(', ')}` : s.respuesta }).eq('id', s.id)
      if (error) throw error
      if (movId) nav(`/resguardos/${movId}`); else onListo()
    } catch (e) { setError(mensajeError(e as Error)) } finally { setGuardando(false) }
  }

  return (
    <Modal abierto titulo={`Entregar ${s.folio}`} onCerrar={onCerrar}>
      <div className="space-y-5">
        <p className="text-sm text-stone-500">{recibe ? <>Se hace el resguardo a nombre de <b className="text-tinta">{recibe}</b></> : <>Se manda a <b className="text-tinta">{s.ubicaciones?.nombre}</b></>}. Revisa qué unidades salen.</p>
        {prods.map(p => {
          const m = modelos.find(x => x.id === p.modelo_id)
          const op = disp.filter(d => d.modelo_id === p.modelo_id && d.empresa_id === s.empresa_id)
          const elegidas = op.filter(d => sel.includes(d.id)).length
          return (
            <div key={p.modelo_id}>
              <p className="mb-1.5 flex items-center gap-2 text-sm font-medium"><Package size={14} className="text-marca" />{nombreItem(p)}<span className={`ml-auto text-xs ${elegidas < p.cantidad ? 'text-amber-700' : 'text-emerald-700'}`}>{elegidas} de {p.cantidad}</span></p>
              {op.length === 0 ? <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={13} />No hay unidades disponibles de {m?.nombre} en esta empresa; quedará pendiente.</p> : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {op.map(d => (
                    <label key={d.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-sm transition ${sel.includes(d.id) ? 'border-marca bg-marca/10' : 'border-stone-200'}`}>
                      <input type="checkbox" className="accent-[#F9B234]" checked={sel.includes(d.id)} onChange={e => setSel(xs => e.target.checked ? [...xs, d.id] : xs.filter(x => x !== d.id))} />
                      <span className="min-w-0"><span className="block font-mono text-xs text-marca">{d.codigo}</span><span className="block truncate text-[11px] text-stone-500">{[d.serie, d.ubicacion].filter(Boolean).join(' · ')}</span></span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {mats.map(m => {
          const c = consumibles.find(x => x.id === m.consumible_id)
          const ls = lugares(m.consumible_id)
          const max = Number(ls.find(l => (l.ubicacion_id ?? '') === origen[m.consumible_id])?.existencia ?? 0)
          return (
            <div key={m.consumible_id}>
              <p className="mb-1.5 flex items-center gap-2 text-sm font-medium"><HardHat size={14} className="text-marca" />{nombreItem(m)}<span className="ml-auto text-xs text-stone-500">pidió {num(m.cantidad)}</span></p>
              {ls.length === 0 ? <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={13} />Sin existencia en almacén; quedará pendiente.</p> : (
                <div className="flex gap-2">
                  <select className="campo" value={origen[m.consumible_id]} onChange={e => setOrigen({ ...origen, [m.consumible_id]: e.target.value })}>{ls.map(l => <option key={l.ubicacion_id ?? ''} value={l.ubicacion_id ?? ''}>{l.ubicacion ?? 'Sin lugar'} · hay {num(l.existencia)}</option>)}</select>
                  <input className="campo cifra !w-24" type="number" min={0} max={max} value={cant[m.consumible_id] ?? 0} onChange={e => setCant({ ...cant, [m.consumible_id]: Math.min(max, Math.max(0, Number(e.target.value))) })} aria-label="Cantidad" />
                  <span className="self-center text-xs text-stone-500">{c ? plural(c.unidad, 2) : ''}</span>
                </div>
              )}
            </div>
          )
        })}
        {libres.length > 0 && <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">Sin catálogo: {libres.map(l => `${l.cantidad} × ${nombreItem(l)}`).join(', ')}. Si ya lo tienes, dalo de alta como activo antes de entregar; si no, queda anotado como pendiente.</p>}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-sec" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primario" disabled={guardando} onClick={confirmar}><PackageCheck size={16} />{guardando ? 'Entregando…' : sel.length ? 'Entregar y hacer resguardo' : 'Marcar entregada'}</button>
        </div>
      </div>
    </Modal>
  )
}
