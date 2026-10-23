import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Wrench, CalendarClock, Gauge, Plus, ArrowLeft, Play, PauseCircle, CheckCircle2, XCircle, Camera, Trash2, Pencil, Search, AlertOctagon, Hourglass, ClipboardList } from 'lucide-react'
import { supabase, mensajeError, type Estatus } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fotoProducto } from '../lib/logos'
import { useLista } from '../lib/hooks'
import { RefaccionesOT } from '../components/Refacciones'
import { ESTATUS_OT, DISPARO, type EstatusOT, type Disparo } from '../lib/mantenimiento'
import { Cargando, Vacio, Modal, Campo, Aviso, EstatusBadge } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import { fechaCorta } from '../components/Prestamo'

type Prog = { plan_id: string; plan: string; disparo: Disparo; intervalo: number; avisar_antes: number; tareas: string[]; activo_id: string; codigo: string; descripcion: string; empresa_id: string; empresa: string
  estatus: Estatus; marca: string | null; modelo: string | null; modelo_foto: string | null; foto_principal: string | null; categoria: string; numero_economico: string | null
  fecha_ultimo: string | null; lectura_ultimo: number | null; lectura_actual: number | null; proxima_fecha: string | null; proxima_lectura: number | null; restante: number; estado: 'vencido' | 'proximo' | 'ok'; ot_abierta: string | null; ot_folio: string | null }
type OT = { id: string; folio: string; activo_id: string; empresa_id: string; tipo: 'preventivo' | 'correctivo'; plan_id: string | null; reporte_id: string | null; titulo: string; descripcion: string | null
  prioridad: 'baja' | 'media' | 'alta'; estatus: EstatusOT; proveedor_id: string | null; responsable: string | null; fecha_programada: string | null; fecha_inicio: string | null; fecha_fin: string | null
  lectura: number | null; checklist: { tarea: string; hecho: boolean }[]; fotos_antes: string[]; fotos_despues: string[]; refacciones: string | null; notas_cierre: string | null; created_at: string; dano_id?: string | null; causa_id?: string | null; accion_id?: string | null; paro?: boolean
  activos?: { codigo: string; descripcion: string; estatus: Estatus; responsable_id: string | null; foto_principal: string | null; modelos: { nombre: string; foto_path: string | null } | null; marcas: { nombre: string } | null; categorias: { nombre: string } | null } | null
  proveedores?: { nombre: string } | null }
type Plan = { id: string; nombre: string; modelo_id: string | null; activo_id: string | null; disparo: Disparo; intervalo: number; avisar_antes: number; tareas: string[]; activo: boolean
  modelos?: { nombre: string; marcas: { nombre: string } | null } | null; activos?: { codigo: string; descripcion: string } | null }

const SEL_OT = '*, activos(codigo,descripcion,estatus,responsable_id,foto_principal,modelos(nombre,foto_path),marcas(nombre),categorias(nombre)), proveedores(nombre)'
const n = (x: number) => Math.round(x).toLocaleString('es-MX')
function textoRestante(p: Prog) {
  const u = p.disparo === 'dias' ? 'día' : p.disparo === 'km' ? 'km' : 'hora'
  const pl = (v: number) => p.disparo === 'km' ? 'km' : `${u}${Math.abs(v) === 1 ? '' : 's'}`
  if (p.restante < 0) return `Vencido por ${n(-p.restante)} ${pl(p.restante)}`
  return p.disparo === 'dias' ? `Faltan ${n(p.restante)} ${pl(p.restante)}` : `Faltan ${n(p.restante)} ${pl(p.restante)}`
}
function avance(p: Prog) {
  if (p.disparo === 'dias') return Math.min(1, Math.max(0, (p.intervalo - p.restante) / p.intervalo))
  return Math.min(1, Math.max(0, ((p.lectura_actual ?? 0) - (p.lectura_ultimo ?? 0)) / p.intervalo))
}
const COLOR_EST = { vencido: '#FF5A5F', proximo: '#F9B234', ok: '#34D399' }

/** Mantenimiento: programa de preventivos, tablero de órdenes y planes. */
export default function Mantenimiento() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') ?? 'programa'
  const { puedeEditar, puedeResguardar } = useAuth()
  const [prog, setProg] = useState<Prog[] | null>(null)
  const [ots, setOts] = useState<OT[]>([])
  const [planes, setPlanes] = useState<Plan[]>([])
  const [nueva, setNueva] = useState<Partial<OT> | null>(sp.get('nuevo') ? { activo_id: sp.get('activo') ?? undefined, reporte_id: sp.get('reporte') ?? null, tipo: 'correctivo', titulo: sp.get('titulo') ?? '' } : null)
  const [plan, setPlan] = useState<Plan | 'nuevo' | null>(null)
  const [q, setQ] = useState('')

  const cargar = () => {
    supabase.from('v_mantenimiento').select('*').order('restante').limit(2000).then(({ data }) => setProg((data as Prog[]) ?? []))
    supabase.from('ordenes_trabajo').select(SEL_OT).order('created_at', { ascending: false }).limit(300).then(({ data }) => setOts((data as unknown as OT[]) ?? []))
    supabase.from('planes_mantenimiento').select('*, modelos(nombre, marcas(nombre)), activos(codigo,descripcion)').eq('activo', true).order('nombre').then(({ data }) => setPlanes((data as unknown as Plan[]) ?? []))
  }
  useEffect(cargar, [])

  if (!prog) return <Cargando />
  const t = q.trim().toLowerCase()
  const venc = prog.filter(p => p.estado === 'vencido'), prox = prog.filter(p => p.estado === 'proximo')
  const abiertas = ots.filter(o => ['abierta', 'en_proceso', 'espera_refaccion'].includes(o.estatus))
  const TABS = [['programa', `Programa · ${venc.length + prox.length}`], ['ordenes', `Órdenes · ${abiertas.length}`], ['planes', `Planes · ${planes.length}`]] as const

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Mantenimiento</h1>
          <p className="mt-1 text-sm text-stone-500">Preventivos por fecha, kilometraje u horas de motor, y órdenes de trabajo con checklist y fotos.</p>
        </div>
        {puedeResguardar && <button className="btn-primario" onClick={() => setNueva({ tipo: 'correctivo' })}><Plus size={16} />Nueva orden</button>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['Preventivos vencidos', venc.length, AlertOctagon, 'text-red-700'], ['Próximos', prox.length, Hourglass, 'text-amber-700'], ['Órdenes abiertas', abiertas.length, ClipboardList, 'text-sky-700'], ['Terminadas este mes', ots.filter(o => o.estatus === 'terminada' && o.fecha_fin && o.fecha_fin.slice(0, 7) === new Date().toISOString().slice(0, 7)).length, CheckCircle2, 'text-emerald-700']] as const).map(([tt, v, I, c]) => (
          <div key={tt} className="tarjeta p-4"><I size={18} className={v ? c : 'text-stone-400'} /><p className={`cifra mt-2 text-3xl font-semibold ${v && c !== 'text-emerald-700' && c !== 'text-sky-700' ? c : ''}`}>{v}</p><p className="text-[11px] uppercase tracking-wider text-stone-500">{tt}</p></div>
        ))}
      </div>

      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50 p-1">
        {TABS.map(([k, txt]) => <button key={k} onClick={() => setSp(k === 'programa' ? {} : { tab: k }, { replace: true })} className={`flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${tab === k ? 'bg-marca text-[#120D04]' : 'text-stone-500 hover:text-tinta'}`}>{txt}</button>)}
      </nav>

      {tab !== 'planes' && <div className="relative mb-4"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo pl-10" placeholder="Buscar código, equipo, No. económico…" value={q} onChange={e => setQ(e.target.value)} /></div>}

      <div key={tab} className="animate-entrar">
        {tab === 'programa' && (
          prog.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin preventivos programados" texto="Crea un plan (por ejemplo, servicio cada 10,000 km para las Hilux) y el programa se arma solo." accion={puedeEditar && <button className="btn-primario" onClick={() => { setSp({ tab: 'planes' }); setPlan('nuevo') }}><Plus size={16} />Crear plan</button>} /></div> : (
            <div className="tarjeta divide-y divide-stone-100 overflow-hidden">
              {prog.filter(p => !t || [p.codigo, p.descripcion, p.marca, p.modelo, p.numero_economico, p.plan].some(x => x?.toLowerCase().includes(t))).map(p => (
                <div key={p.plan_id + p.activo_id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <FotoActivo foto={p.foto_principal} fotoModelo={p.modelo_foto} categoria={p.categoria} className="h-12 w-14 shrink-0 rounded-lg" icono={18} />
                  <Link to={`/activos/${p.activo_id}`} className="min-w-0 flex-1 basis-48">
                    <p className="font-mono text-[11px] text-marca">{p.codigo}{p.numero_economico ? ` · ${p.numero_economico}` : ''}</p>
                    <p className="truncate text-sm font-medium">{[p.marca, p.modelo].filter(Boolean).join(' ') || p.descripcion}</p>
                    <p className="truncate text-xs text-stone-500">{p.plan} · cada {n(p.intervalo)} {DISPARO[p.disparo]} · {p.empresa}</p>
                  </Link>
                  <div className="w-full sm:w-56">
                    <div className="mb-1 flex justify-between text-[11px]"><span style={{ color: COLOR_EST[p.estado] }} className="font-medium">{textoRestante(p)}</span>
                      <span className="text-stone-500">{p.disparo === 'dias' ? (p.proxima_fecha ? fechaCorta(p.proxima_fecha) : '') : `${n(p.lectura_actual ?? 0)} / ${n(p.proxima_lectura ?? 0)} ${DISPARO[p.disparo]}`}</span></div>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-stone-100"><span className="block h-full origin-left rounded-full" style={{ width: `${avance(p) * 100}%`, background: COLOR_EST[p.estado], boxShadow: `0 0 10px ${COLOR_EST[p.estado]}`, animation: 'crecer .8s cubic-bezier(.2,.8,.2,1) both' }} /></span>
                  </div>
                  {p.ot_abierta
                    ? <Link to={`/mantenimiento/ot/${p.ot_abierta}`} className="btn-sec !px-3 !py-1.5 text-xs"><Wrench size={14} />{p.ot_folio}</Link>
                    : puedeResguardar && <button className={`${p.estado === 'ok' ? 'btn-sec' : 'btn-primario'} !px-3 !py-1.5 text-xs`} onClick={() => setNueva({ activo_id: p.activo_id, plan_id: p.plan_id, tipo: 'preventivo', titulo: p.plan, checklist: p.tareas.map(x => ({ tarea: x, hecho: false })) })}><Plus size={14} />Programar</button>}
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'ordenes' && (
          <div className="grid gap-4 lg:grid-cols-4">
            {(['abierta', 'en_proceso', 'espera_refaccion', 'terminada'] as EstatusOT[]).map(est => {
              const col = ots.filter(o => o.estatus === est && (!t || [o.folio, o.titulo, o.activos?.codigo, o.activos?.descripcion, o.activos?.modelos?.nombre].some(x => x?.toLowerCase().includes(t)))).slice(0, est === 'terminada' ? 12 : 100)
              return (
                <section key={est} className="min-w-0">
                  <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-stone-500"><span className="h-2 w-2 rounded-full" style={{ background: ESTATUS_OT[est].color, boxShadow: `0 0 8px ${ESTATUS_OT[est].color}` }} />{ESTATUS_OT[est].texto} · {col.length}</h2>
                  <div className="space-y-2">
                    {col.length === 0 && <p className="rounded-xl border border-dashed border-stone-300 px-3 py-6 text-center text-xs text-stone-400">Nada aquí</p>}
                    {col.map(o => (
                      <Link key={o.id} to={`/mantenimiento/ot/${o.id}`} className="tarjeta viva block p-3">
                        <div className="mb-2 flex items-center gap-2"><span className="font-mono text-[11px] text-stone-500">{o.folio}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${o.tipo === 'preventivo' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-800'}`}>{o.tipo}</span>
                          {o.prioridad === 'alta' && <span className="ml-auto text-[10px] font-bold uppercase text-red-700">● alta</span>}</div>
                        <div className="flex items-center gap-2.5">
                          <FotoActivo foto={o.activos?.foto_principal} fotoModelo={o.activos?.modelos?.foto_path} categoria={o.activos?.categorias?.nombre} className="h-10 w-11 shrink-0 rounded-lg" icono={15} />
                          <div className="min-w-0"><p className="truncate text-sm font-medium">{o.titulo}</p><p className="truncate text-[11px] text-stone-500">{o.activos?.codigo} · {[o.activos?.marcas?.nombre, o.activos?.modelos?.nombre].filter(Boolean).join(' ') || o.activos?.descripcion}</p></div>
                        </div>
                        {o.checklist.length > 0 && <div className="mt-2 flex items-center gap-2 text-[10px] text-stone-500"><span className="block h-1 flex-1 overflow-hidden rounded-full bg-stone-100"><span className="block h-full bg-marca" style={{ width: `${(o.checklist.filter(c => c.hecho).length / o.checklist.length) * 100}%` }} /></span>{o.checklist.filter(c => c.hecho).length}/{o.checklist.length}</div>}
                        <p className="mt-1.5 text-[10px] text-stone-400">{o.proveedores?.nombre ?? o.responsable ?? 'Sin asignar'}{o.fecha_programada ? ` · ${fechaCorta(o.fecha_programada)}` : ''}</p>
                      </Link>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {tab === 'planes' && (
          <div>
            {puedeEditar && <div className="mb-4 flex justify-end"><button className="btn-sec" onClick={() => setPlan('nuevo')}><Plus size={16} />Nuevo plan</button></div>}
            {planes.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin planes" texto="Un plan dice cada cuánto se le da servicio a un producto o a una unidad." /></div> : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {planes.map(p => (
                  <div key={p.id} className="tarjeta p-4">
                    <div className="mb-2 flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-marca">{p.disparo === 'dias' ? <CalendarClock size={18} /> : <Gauge size={18} />}</span>
                      <div className="min-w-0 flex-1"><p className="truncate font-semibold">{p.nombre}</p><p className="truncate text-xs text-stone-500">{p.activo_id ? `Unidad ${p.activos?.codigo}` : `Todas las ${p.modelos?.marcas?.nombre ?? ''} ${p.modelos?.nombre ?? ''}`}</p></div>
                      {puedeEditar && <button onClick={() => setPlan(p)} className="text-stone-400 hover:text-marca" aria-label="Editar"><Pencil size={15} /></button>}
                    </div>
                    <p className="text-sm">Cada <b className="cifra text-marca">{n(p.intervalo)}</b> {DISPARO[p.disparo]} · aviso {n(p.avisar_antes)} {DISPARO[p.disparo]} antes</p>
                    {p.tareas.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-stone-500">{p.tareas.slice(0, 5).map(x => <li key={x}>· {x}</li>)}{p.tareas.length > 5 && <li>+{p.tareas.length - 5} más</li>}</ul>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {nueva && <NuevaOT inicial={nueva} onCerrar={() => { setNueva(null); if (sp.get('nuevo')) setSp({}, { replace: true }) }} />}
      {plan && <PlanModal plan={plan === 'nuevo' ? null : plan} onCerrar={() => setPlan(null)} onGuardado={() => { setPlan(null); cargar() }} />}
    </div>
  )
}

function NuevaOT({ inicial, onCerrar }: { inicial: Partial<OT>; onCerrar: () => void }) {
  const nav = useNavigate()
  const [acts, setActs] = useState<{ id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; empresa_id: string; estatus: Estatus }[]>([])
  const [talleres, setTalleres] = useState<{ id: string; nombre: string }[]>([])
  const [f, setF] = useState({ activo_id: inicial.activo_id ?? '', tipo: inicial.tipo ?? 'correctivo', titulo: inicial.titulo ?? '', descripcion: '', prioridad: 'media', proveedor_id: '', responsable: '', fecha_programada: new Date().toISOString().slice(0, 10) })
  const [tareas, setTareas] = useState((inicial.checklist ?? []).map(c => c.tarea).join('\n'))
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,empresa_id,estatus').neq('estatus', 'baja').order('codigo').limit(5000).then(({ data }) => setActs((data as never) ?? []))
    supabase.from('proveedores').select('id,nombre').eq('activo', true).order('nombre').then(({ data }) => setTalleres((data as never) ?? []))
    if (inicial.reporte_id) supabase.from('reportes').select('descripcion,prioridad').eq('id', inicial.reporte_id).single().then(({ data }) => {
      const r = data as { descripcion: string; prioridad: string } | null
      if (r) setF(x => ({ ...x, titulo: x.titulo || r.descripcion.slice(0, 70), descripcion: r.descripcion, prioridad: r.prioridad }))
    })
  }, [inicial.reporte_id])
  const sel = acts.find(a => a.id === f.activo_id)
  const t = q.trim().toLowerCase()
  async function crear() {
    setError('')
    if (!sel) { setError('Elige el equipo.'); return }
    const checklist = tareas.split('\n').map(x => x.trim()).filter(Boolean).map(tarea => ({ tarea, hecho: false }))
    const { data, error } = await supabase.from('ordenes_trabajo').insert({ activo_id: sel.id, empresa_id: sel.empresa_id, tipo: f.tipo, plan_id: inicial.plan_id ?? null, reporte_id: inicial.reporte_id ?? null,
      titulo: f.titulo.trim() || (f.tipo === 'preventivo' ? 'Servicio preventivo' : 'Reparación'), descripcion: f.descripcion.trim() || null, prioridad: f.prioridad,
      proveedor_id: f.proveedor_id || null, responsable: f.responsable.trim() || null, fecha_programada: f.fecha_programada || null, checklist }).select('id').single()
    if (error) { setError(mensajeError(error)); return }
    if (inicial.reporte_id) await supabase.from('reportes').update({ estatus: 'en_proceso' }).eq('id', inicial.reporte_id)
    nav(`/mantenimiento/ot/${(data as { id: string }).id}`)
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo={inicial.tipo === 'preventivo' ? 'Programar servicio preventivo' : 'Nueva orden de trabajo'} ancho="max-w-3xl">
      <div className="space-y-4">
        {sel ? (
          <div className="flex items-center gap-3 rounded-xl border border-stone-200 p-3"><span className="font-mono text-xs text-marca">{sel.codigo}</span><span className="min-w-0 flex-1 truncate text-sm">{[sel.marca, sel.modelo].filter(Boolean).join(' ') || sel.descripcion}</span><EstatusBadge estatus={sel.estatus} />
            {!inicial.activo_id && <button className="text-xs text-marca hover:underline" onClick={() => setF({ ...f, activo_id: '' })}>Cambiar</button>}</div>
        ) : (
          <div>
            <span className="etiqueta">Equipo *</span>
            <input className="campo mb-2" placeholder="Busca por código, marca, modelo…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
            <ul className="max-h-48 space-y-1 overflow-y-auto">{acts.filter(a => !t || [a.codigo, a.descripcion, a.marca, a.modelo].some(x => x?.toLowerCase().includes(t))).slice(0, 30).map(a => (
              <li key={a.id}><button onClick={() => setF({ ...f, activo_id: a.id })} className="flex w-full items-center gap-3 rounded-lg border border-stone-200 px-3 py-1.5 text-left text-sm hover:border-marca"><span className="font-mono text-xs text-marca">{a.codigo}</span><span className="truncate">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</span></button></li>
            ))}</ul>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Tipo"><select className="campo" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as 'preventivo' | 'correctivo' })}><option value="correctivo">Correctivo (reparación)</option><option value="preventivo">Preventivo (servicio)</option></select></Campo>
          <Campo label="Prioridad"><select className="campo" value={f.prioridad} onChange={e => setF({ ...f, prioridad: e.target.value })}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></Campo>
          <Campo label="Fecha programada"><input type="date" className="campo" value={f.fecha_programada} onChange={e => setF({ ...f, fecha_programada: e.target.value })} /></Campo>
        </div>
        <Campo label="¿Qué hay que hacer? *"><input className="campo" value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Ej. Servicio de 10,000 km / Revisar fuga hidráulica" /></Campo>
        <Campo label="Detalle"><textarea className="campo" rows={2} value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} /></Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Taller externo"><select className="campo" value={f.proveedor_id} onChange={e => setF({ ...f, proveedor_id: e.target.value })}><option value="">— Interno —</option>{talleres.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
          <Campo label="Mecánico / responsable"><input className="campo" value={f.responsable} onChange={e => setF({ ...f, responsable: e.target.value })} /></Campo>
        </div>
        <Campo label="Tareas (una por renglón)"><textarea className="campo font-mono text-xs" rows={4} value={tareas} onChange={e => setTareas(e.target.value)} placeholder={'Cambio de aceite\nFiltro de aire\nRevisar frenos'} /></Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={crear}><Wrench size={16} />Crear orden</button></div>
      </div>
    </Modal>
  )
}

function PlanModal({ plan, onCerrar, onGuardado }: { plan: Plan | null; onCerrar: () => void; onGuardado: () => void }) {
  const [modelos, setModelos] = useState<{ id: string; nombre: string; marcas: { nombre: string } | null }[]>([])
  const [acts, setActs] = useState<{ id: string; codigo: string; descripcion: string }[]>([])
  const [f, setF] = useState({ nombre: plan?.nombre ?? '', aplica: plan?.activo_id ? 'activo' : 'modelo', modelo_id: plan?.modelo_id ?? '', activo_id: plan?.activo_id ?? '', disparo: plan?.disparo ?? 'km' as Disparo, intervalo: String(plan?.intervalo ?? 10000), avisar_antes: String(plan?.avisar_antes ?? 1000) })
  const [tareas, setTareas] = useState((plan?.tareas ?? []).join('\n'))
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.from('modelos').select('id,nombre,marcas(nombre)').eq('activo', true).order('nombre').then(({ data }) => setModelos((data as never) ?? []))
    supabase.from('activos').select('id,codigo,descripcion').neq('estatus', 'baja').order('codigo').then(({ data }) => setActs((data as never) ?? []))
  }, [])
  async function guardar() {
    setError('')
    const datos = { nombre: f.nombre.trim(), modelo_id: f.aplica === 'modelo' ? f.modelo_id || null : null, activo_id: f.aplica === 'activo' ? f.activo_id || null : null,
      disparo: f.disparo, intervalo: Number(f.intervalo), avisar_antes: Number(f.avisar_antes || 0), tareas: tareas.split('\n').map(x => x.trim()).filter(Boolean) }
    if (!datos.nombre || (!datos.modelo_id && !datos.activo_id) || !datos.intervalo) { setError('Completa nombre, a qué aplica e intervalo.'); return }
    const { error } = plan ? await supabase.from('planes_mantenimiento').update(datos).eq('id', plan.id) : await supabase.from('planes_mantenimiento').insert(datos)
    if (error) setError(mensajeError(error)); else onGuardado()
  }
  async function quitar() { if (plan && confirm('¿Quitar este plan?')) { await supabase.from('planes_mantenimiento').update({ activo: false }).eq('id', plan.id); onGuardado() } }
  const u = DISPARO[f.disparo]
  return (
    <Modal abierto onCerrar={onCerrar} titulo={plan ? 'Editar plan' : 'Nuevo plan de mantenimiento'}>
      <div className="space-y-4">
        <Campo label="Nombre *"><input className="campo" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Ej. Servicio de 10,000 km" /></Campo>
        <div className="flex gap-2">{(['modelo', 'activo'] as const).map(k => <button key={k} onClick={() => setF({ ...f, aplica: k })} className={`flex-1 rounded-xl border px-3 py-2 text-sm ${f.aplica === k ? 'border-marca bg-marca/10 text-marca' : 'border-stone-300 text-stone-600'}`}>{k === 'modelo' ? 'Todas las unidades de un producto' : 'Una unidad en específico'}</button>)}</div>
        {f.aplica === 'modelo'
          ? <Campo label="Producto"><select className="campo" value={f.modelo_id} onChange={e => setF({ ...f, modelo_id: e.target.value })}><option value="">— Elige —</option>{modelos.map(m => <option key={m.id} value={m.id}>{m.marcas?.nombre} {m.nombre}</option>)}</select></Campo>
          : <Campo label="Unidad"><select className="campo" value={f.activo_id} onChange={e => setF({ ...f, activo_id: e.target.value })}><option value="">— Elige —</option>{acts.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.descripcion}</option>)}</select></Campo>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Cada"><select className="campo" value={f.disparo} onChange={e => setF({ ...f, disparo: e.target.value as Disparo })}><option value="km">Kilómetros</option><option value="horas">Horas de motor</option><option value="dias">Días</option></select></Campo>
          <Campo label={`Intervalo (${u})`}><input type="number" min="1" className="campo" value={f.intervalo} onChange={e => setF({ ...f, intervalo: e.target.value })} /></Campo>
          <Campo label={`Avisar antes (${u})`}><input type="number" min="0" className="campo" value={f.avisar_antes} onChange={e => setF({ ...f, avisar_antes: e.target.value })} /></Campo>
        </div>
        <Campo label="Tareas del servicio (una por renglón)"><textarea className="campo font-mono text-xs" rows={5} value={tareas} onChange={e => setTareas(e.target.value)} placeholder={'Cambio de aceite y filtro\nFiltro de aire\nRotación de llantas'} /></Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex items-center gap-2">{plan && <button onClick={quitar} className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-red-700"><Trash2 size={14} />Quitar</button>}
          <div className="ml-auto flex gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}>Guardar plan</button></div></div>
      </div>
    </Modal>
  )
}

/** Detalle de una orden de trabajo: avance, checklist, fotos y cierre. */
export function OrdenTrabajo() {
  const { id } = useParams()
  const { puedeResguardar, puedeEditar } = useAuth()
  const [o, setO] = useState<OT | null>(null)
  const [cerrar, setCerrar] = useState(false)
  const [fc, setFc] = useState({ lectura: '', refacciones: '', notas: '', dano_id: '', causa_id: '', accion_id: '', paro: true })
  const { items: codigos } = useLista('codigos_falla', 'id,nombre,grupo,codigo', 'codigo')
  const [error, setError] = useState('')
  const inAntes = useRef<HTMLInputElement>(null), inDesp = useRef<HTMLInputElement>(null)
  const cargar = () => { supabase.from('ordenes_trabajo').select(SEL_OT).eq('id', id!).single().then(({ data }) => setO(data as unknown as OT)) }
  useEffect(cargar, [id])
  const tipoLect = useMemo(() => (o?.activos?.categorias?.nombre ?? '').toLowerCase().includes('maquinaria') ? 'horas' : 'km', [o])

  async function guardar(cambios: Partial<OT>) {
    setError('')
    const { error } = await supabase.from('ordenes_trabajo').update(cambios).eq('id', o!.id)
    if (error) { setError(mensajeError(error)); return false }
    setO(x => x ? { ...x, ...cambios } : x); return true
  }
  async function iniciar() {
    if (!(await guardar({ estatus: 'en_proceso', fecha_inicio: o!.fecha_inicio ?? new Date().toISOString() }))) return
    if (puedeEditar && o!.activos && ['disponible', 'asignado'].includes(o!.activos.estatus)) { await supabase.from('activos').update({ estatus: 'mantenimiento' }).eq('id', o!.activo_id); cargar() }
  }
  async function terminar() {
    const ok = await guardar({ estatus: 'terminada', fecha_fin: new Date().toISOString(), lectura: fc.lectura ? Number(fc.lectura) : null, refacciones: fc.refacciones.trim() || null, notas_cierre: fc.notas.trim() || null, dano_id: fc.dano_id || null, causa_id: fc.causa_id || null, accion_id: fc.accion_id || null, paro: fc.paro })
    if (!ok) return
    if (fc.lectura) await supabase.from('lecturas').insert({ activo_id: o!.activo_id, empresa_id: o!.empresa_id, tipo: tipoLect, valor: Number(fc.lectura), origen: 'orden', nota: o!.folio })
    if (puedeEditar && o!.activos?.estatus === 'mantenimiento') {
      const { data: otras } = await supabase.from('ordenes_trabajo').select('id').eq('activo_id', o!.activo_id).neq('id', o!.id).in('estatus', ['en_proceso', 'espera_refaccion'])
      if (!otras?.length) await supabase.from('activos').update({ estatus: o!.activos.responsable_id ? 'asignado' : 'disponible' }).eq('id', o!.activo_id)
    }
    if (o!.reporte_id) await supabase.from('reportes').update({ estatus: 'resuelto', resolucion: `${o!.folio}: ${fc.notas.trim() || o!.titulo}`, resuelto_at: new Date().toISOString() }).eq('id', o!.reporte_id)
    setCerrar(false); cargar()
  }
  async function agregarFoto(campo: 'fotos_antes' | 'fotos_despues', file?: File | null) {
    if (!file || !o) return
    const url = await fotoProducto(file, 1000)
    await guardar({ [campo]: [...o[campo], url] } as Partial<OT>)
  }

  if (!o) return <Cargando />
  const E = ESTATUS_OT[o.estatus], hechos = o.checklist.filter(c => c.hecho).length, abierta = !['terminada', 'cancelada'].includes(o.estatus)
  const pasos: EstatusOT[] = ['abierta', 'en_proceso', 'terminada']
  return (
    <div>
      <Link to="/mantenimiento?tab=ordenes" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Órdenes de trabajo</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm text-stone-500">{o.folio}</span><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${E.clase}`}>{E.texto}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${o.tipo === 'preventivo' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-800'}`}>{o.tipo}</span>{o.prioridad === 'alta' && <span className="text-[11px] font-bold uppercase text-red-700">● prioridad alta</span>}</div>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{o.titulo}</h1>
          {o.descripcion && <p className="mt-1 text-stone-500">{o.descripcion}</p>}
        </div>
        {puedeResguardar && abierta && (
          <div className="flex flex-wrap gap-2">
            {o.estatus === 'abierta' && <button className="btn-primario" onClick={iniciar}><Play size={16} />Iniciar trabajo</button>}
            {o.estatus === 'en_proceso' && <button className="btn-sec" onClick={() => guardar({ estatus: 'espera_refaccion' })}><PauseCircle size={16} />Espera refacción</button>}
            {o.estatus === 'espera_refaccion' && <button className="btn-sec" onClick={() => guardar({ estatus: 'en_proceso' })}><Play size={16} />Reanudar</button>}
            {o.estatus !== 'abierta' && <button className="btn-primario" onClick={() => setCerrar(true)}><CheckCircle2 size={16} />Terminar</button>}
            <button className="inline-flex items-center gap-1 px-2 text-xs text-stone-500 hover:text-red-700" onClick={() => confirm('¿Cancelar esta orden?') && guardar({ estatus: 'cancelada' })}><XCircle size={14} />Cancelar</button>
          </div>
        )}
      </div>
      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}

      <ol className="mb-6 grid grid-cols-3 gap-2">
        {pasos.map((p, i) => {
          const idx = o.estatus === 'espera_refaccion' ? 1 : o.estatus === 'cancelada' ? -1 : pasos.indexOf(o.estatus)
          const fecha = p === 'abierta' ? o.created_at : p === 'en_proceso' ? o.fecha_inicio : o.fecha_fin
          return (
            <li key={p} className={`rounded-xl border px-3 py-2.5 ${i <= idx ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200'}`}>
              <p className={`text-xs font-medium ${i <= idx ? 'text-emerald-700' : 'text-stone-500'}`}>{['Creada', 'En proceso', 'Terminada'][i]}</p>
              <p className="text-[11px] text-stone-400">{fecha ? new Date(fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</p>
            </li>
          )
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="tarjeta p-5">
            <h2 className="mb-3 flex items-center justify-between font-semibold">Checklist <span className="cifra text-sm text-marca">{hechos}/{o.checklist.length}</span></h2>
            {o.checklist.length === 0 ? <p className="text-sm text-stone-500">Sin tareas.</p> : (
              <ul className="space-y-1.5">{o.checklist.map((c, i) => (
                <li key={i}><label className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${c.hecho ? 'border-emerald-200 bg-emerald-50/50' : 'border-stone-200'} ${abierta && puedeResguardar ? 'cursor-pointer' : ''}`}>
                  <input type="checkbox" className="h-4 w-4 accent-[#34D399]" checked={c.hecho} disabled={!abierta || !puedeResguardar} onChange={() => guardar({ checklist: o.checklist.map((x, k) => k === i ? { ...x, hecho: !x.hecho } : x) })} />
                  <span className={c.hecho ? 'text-stone-500 line-through' : ''}>{c.tarea}</span>
                </label></li>
              ))}</ul>
            )}
          </section>
          {(['fotos_antes', 'fotos_despues'] as const).map(campo => (
            <section key={campo} className="tarjeta p-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{campo === 'fotos_antes' ? 'Fotos de antes' : 'Fotos de después'}</h2>
                {puedeResguardar && abierta && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => (campo === 'fotos_antes' ? inAntes : inDesp).current?.click()}><Camera size={14} />Agregar</button>}</div>
              {o[campo].length === 0 ? <p className="text-sm text-stone-500">Sin fotos.</p> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{o[campo].map((u, i) => <img key={i} src={u} alt="" className="aspect-square w-full rounded-xl object-cover" />)}</div>}
              <input ref={campo === 'fotos_antes' ? inAntes : inDesp} type="file" accept="image/*" hidden onChange={e => agregarFoto(campo, e.target.files?.[0])} />
            </section>
          ))}
          <RefaccionesOT otId={o.id} folio={o.folio} empresaId={o.empresa_id} abierta={o.estatus !== 'terminada' && o.estatus !== 'cancelada'} />
          {o.estatus === 'terminada' && (o.refacciones || o.notas_cierre || o.dano_id) && (
            <section className="tarjeta p-5"><h2 className="mb-2 font-semibold">Cierre</h2>
              {(o.dano_id || o.causa_id || o.accion_id) && <p className="mb-2 flex flex-wrap gap-1.5">{[o.dano_id, o.causa_id, o.accion_id].map((c, i) => { const x = codigos.find(k => k.id === c); return x ? <span key={i} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600"><span className="font-mono text-marca">{x.codigo as string}</span> {x.nombre}</span> : null })}</p>}
              {o.refacciones && <p className="text-sm"><b>Refacciones:</b> {o.refacciones}</p>}{o.notas_cierre && <p className="mt-1 text-sm text-stone-600">{o.notas_cierre}</p>}
              {o.lectura != null && <p className="mt-1 text-xs text-stone-500">{tipoLect === 'km' ? 'Kilometraje' : 'Horómetro'} al servicio: {n(o.lectura)}</p>}</section>
          )}
        </div>
        <aside className="space-y-4">
          {o.activos && <Link to={`/activos/${o.activo_id}`} className="tarjeta viva block overflow-hidden">
            <FotoActivo foto={o.activos.foto_principal} fotoModelo={o.activos.modelos?.foto_path} categoria={o.activos.categorias?.nombre} className="aspect-[16/10] w-full" icono={40} />
            <div className="p-4"><p className="font-mono text-xs text-marca">{o.activos.codigo}</p><p className="font-medium">{[o.activos.marcas?.nombre, o.activos.modelos?.nombre].filter(Boolean).join(' ') || o.activos.descripcion}</p><div className="mt-2"><EstatusBadge estatus={o.activos.estatus} /></div></div>
          </Link>}
          <div className="tarjeta space-y-2 p-4 text-sm">
            <p><span className="text-stone-500">Taller:</span> {o.proveedores?.nombre ?? 'Interno'}</p>
            <p><span className="text-stone-500">Responsable:</span> {o.responsable ?? '—'}</p>
            <p><span className="text-stone-500">Programada:</span> {o.fecha_programada ? fechaCorta(o.fecha_programada) : '—'}</p>
            {o.reporte_id && <p><Link to="/reportes" className="text-marca hover:underline">Viene de un reporte de falla</Link></p>}
          </div>
        </aside>
      </div>

      <Modal abierto={cerrar} onCerrar={() => setCerrar(false)} titulo={`Terminar ${o.folio}`}>
        <div className="space-y-4">
          {hechos < o.checklist.length && <Aviso tipo="info">Faltan {o.checklist.length - hechos} tarea(s) del checklist por marcar.</Aviso>}
          <Campo label={tipoLect === 'km' ? 'Kilometraje al terminar' : 'Horómetro al terminar'}><input type="number" min="0" step="0.1" className="campo" value={fc.lectura} onChange={e => setFc({ ...fc, lectura: e.target.value })} /></Campo>
          <div className="grid gap-3 sm:grid-cols-3">
            {([['dano_id', 'dano', '¿Qué falló?'], ['causa_id', 'causa', '¿Por qué?'], ['accion_id', 'accion', '¿Qué se hizo?']] as const).map(([k, g, t]) => (
              <Campo key={k} label={t}><select className="campo" value={fc[k]} onChange={e => setFc({ ...fc, [k]: e.target.value })}><option value="">—</option>{codigos.filter(c => c.grupo === g).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#F9B234]" checked={fc.paro} onChange={e => setFc({ ...fc, paro: e.target.checked })} />El equipo estuvo parado mientras duró la orden (cuenta para la disponibilidad)</label>
          <Campo label="Refacciones cambiadas"><input className="campo" value={fc.refacciones} onChange={e => setFc({ ...fc, refacciones: e.target.value })} placeholder="Ej. Aceite 15W40, filtro de aceite y aire" /></Campo>
          <Campo label="Notas"><textarea className="campo" rows={2} value={fc.notas} onChange={e => setFc({ ...fc, notas: e.target.value })} /></Campo>
          <p className="text-xs text-stone-500">Al terminar, el equipo regresa a {o.activos?.responsable_id ? '“Asignado”' : '“Disponible”'} (si no tiene otra orden en proceso) y el siguiente preventivo se calcula desde este servicio.</p>
          <div className="flex justify-end gap-2"><button className="btn-sec" onClick={() => setCerrar(false)}>Cancelar</button><button className="btn-primario" onClick={terminar}><CheckCircle2 size={16} />Terminar orden</button></div>
        </div>
      </Modal>
    </div>
  )
}
