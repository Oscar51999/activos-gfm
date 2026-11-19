import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wrench, Plus, Gauge, Pencil, Trash2, CalendarClock, Check, Sparkles } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ESTATUS_OT, DISPARO, type Disparo, type EstatusOT } from '../lib/mantenimiento'
import { fecha } from '../lib/hooks'
import { Modal, Campo, Aviso } from './ui'

type Prog = { plan_id: string; plan: string; disparo: Disparo; intervalo: number; avisar_antes: number; tareas: string[]; fecha_ultimo: string | null; lectura_ultimo: number | null
  lectura_actual: number | null; proxima_fecha: string | null; proxima_lectura: number | null; restante: number; estado: 'vencido' | 'proximo' | 'ok' }
type Plan = { id: string; nombre: string; tipo: 'preventivo' | 'correctivo'; disparo: Disparo; intervalo: number; avisar_antes: number; tareas: string[]; notas: string | null; activo_id: string | null; modelo_id: string | null }
type OT = { id: string; folio: string; tipo: string; titulo: string; estatus: EstatusOT; created_at: string; fecha_fin: string | null; lectura: number | null }
export type Clase = 'vehiculo' | 'maquinaria' | 'computo' | 'otro'

/** Planes sugeridos según el tipo de equipo; se agregan con un clic y se pueden ajustar. */
const SUGERIDOS: Record<Clase, Omit<Plan, 'id' | 'activo_id' | 'modelo_id' | 'notas'>[]> = {
  vehiculo: [
    { nombre: 'Cambio de aceite y filtros', tipo: 'preventivo', disparo: 'km', intervalo: 10000, avisar_antes: 1000, tareas: ['Aceite de motor', 'Filtro de aceite', 'Filtro de aire', 'Revisión de niveles'] },
    { nombre: 'Revisión de frenos y suspensión', tipo: 'preventivo', disparo: 'km', intervalo: 20000, avisar_antes: 2000, tareas: ['Balatas', 'Discos / tambores', 'Amortiguadores', 'Alineación y balanceo'] },
    { nombre: 'Afinación mayor', tipo: 'preventivo', disparo: 'km', intervalo: 40000, avisar_antes: 3000, tareas: ['Bujías', 'Filtro de combustible', 'Banda de accesorios', 'Escaneo'] },
    { nombre: 'Servicio por tiempo (semestral)', tipo: 'preventivo', disparo: 'dias', intervalo: 180, avisar_antes: 15, tareas: ['Revisión general', 'Llantas', 'Batería', 'Luces'] },
  ],
  maquinaria: [
    { nombre: 'Servicio 250 horas', tipo: 'preventivo', disparo: 'horas', intervalo: 250, avisar_antes: 25, tareas: ['Aceite de motor', 'Filtros', 'Engrasado general'] },
    { nombre: 'Servicio 500 horas', tipo: 'preventivo', disparo: 'horas', intervalo: 500, avisar_antes: 50, tareas: ['Aceite hidráulico', 'Filtro hidráulico', 'Filtro de combustible'] },
    { nombre: 'Servicio 1,000 horas', tipo: 'preventivo', disparo: 'horas', intervalo: 1000, avisar_antes: 80, tareas: ['Aceite de transmisión', 'Mandos finales', 'Revisión de tren de rodaje'] },
  ],
  computo: [
    { nombre: 'Limpieza y revisión física', tipo: 'preventivo', disparo: 'dias', intervalo: 180, avisar_antes: 15, tareas: ['Limpieza interna', 'Pasta térmica', 'Ventiladores', 'Teclado y puertos'] },
    { nombre: 'Actualizaciones y respaldo', tipo: 'preventivo', disparo: 'dias', intervalo: 90, avisar_antes: 7, tareas: ['Actualizaciones de Windows', 'Antivirus', 'Respaldo de información', 'Espacio en disco'] },
    { nombre: 'Revisión de batería y disco', tipo: 'preventivo', disparo: 'dias', intervalo: 365, avisar_antes: 30, tareas: ['Salud de batería', 'Salud de disco (SMART)', 'Inventario de software'] },
  ],
  otro: [
    { nombre: 'Revisión general', tipo: 'preventivo', disparo: 'dias', intervalo: 180, avisar_antes: 15, tareas: ['Funciona correctamente', 'Sin daños', 'Accesorios completos', 'Limpieza'] },
  ],
}
export function claseEquipo(categoria?: string | null, esVehiculo?: boolean | null): Clase {
  const c = (categoria ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/maquinaria|retro|excavadora|motoconf|compact|cargador|grua/.test(c)) return 'maquinaria'
  if (esVehiculo || /vehic|pick|sedan|suv|camion|moto/.test(c)) return 'vehiculo'
  if (/computo|laptop|escritorio|monitor|impresora|tablet|red|break|proyector/.test(c)) return 'computo'
  return 'otro'
}
const UNIDAD: Record<Disparo, string> = { dias: 'días', km: 'km', horas: 'horas' }
const n = (x: number | null | undefined) => x == null ? '—' : Math.round(x).toLocaleString('es-MX')
const COLOR = { vencido: 'bg-red-500', proximo: 'bg-amber-400', ok: 'bg-emerald-400' }

/** Mantenimiento del equipo: cada cuánto (km, horas o días), cuándo toca, historial y lecturas. */
export default function MantenimientoActivo({ activoId, empresaId, modeloId, categoria, esVehiculo }: { activoId: string; empresaId: string; modeloId: string | null; categoria: string; esVehiculo: boolean }) {
  const { puedeEditar, puedeResguardar } = useAuth()
  const clase = claseEquipo(categoria, esVehiculo)
  const [prog, setProg] = useState<Prog[]>([])
  const [planes, setPlanes] = useState<Plan[]>([])
  const [ots, setOts] = useState<OT[]>([])
  const [lectura, setLectura] = useState<{ tipo: string; valor: number; fecha: string } | null>(null)
  const [editar, setEditar] = useState<Partial<Plan> | null>(null)
  const [leer, setLeer] = useState(false)

  const cargar = () => {
    supabase.from('v_mantenimiento').select('*').eq('activo_id', activoId).then(({ data }) => setProg((data as Prog[]) ?? []))
    let q = supabase.from('planes_mantenimiento').select('*').eq('activo', true)
    q = modeloId ? q.or(`activo_id.eq.${activoId},modelo_id.eq.${modeloId}`) : q.eq('activo_id', activoId)
    q.then(({ data }) => setPlanes((data as Plan[]) ?? []))
    supabase.from('ordenes_trabajo').select('id,folio,tipo,titulo,estatus,created_at,fecha_fin,lectura').eq('activo_id', activoId).order('created_at', { ascending: false }).limit(12).then(({ data }) => setOts((data as OT[]) ?? []))
    supabase.from('lecturas').select('tipo,valor,fecha').eq('activo_id', activoId).order('fecha', { ascending: false }).limit(1).maybeSingle().then(({ data }) => setLectura(data as typeof lectura))
  }
  useEffect(cargar, [activoId, modeloId]) // eslint-disable-line react-hooks/exhaustive-deps

  const planDe = (id: string) => planes.find(p => p.id === id)
  async function agregarSugerido(s: typeof SUGERIDOS[Clase][number]) {
    await supabase.from('planes_mantenimiento').insert({ ...s, activo_id: activoId })
    cargar()
  }
  const usaLectura = clase === 'vehiculo' || clase === 'maquinaria'

  return (
    <section className="tarjeta p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Wrench size={17} className="text-marca" />Mantenimiento</h2>
        <div className="flex flex-wrap gap-2">
          {usaLectura && puedeResguardar && <button className="btn-sec !py-1.5 text-xs" onClick={() => setLeer(true)}><Gauge size={14} />Registrar {clase === 'maquinaria' ? 'horas' : 'km'}</button>}
          {puedeResguardar && <Link className="btn-sec !py-1.5 text-xs" to={`/mantenimiento?nuevo=1&activo=${activoId}`}><Wrench size={14} />Orden correctiva</Link>}
          {puedeEditar && <button className="btn-primario !py-1.5 text-xs" onClick={() => setEditar({ tipo: 'preventivo', disparo: usaLectura ? (clase === 'maquinaria' ? 'horas' : 'km') : 'dias', intervalo: usaLectura ? (clase === 'maquinaria' ? 250 : 10000) : 180, avisar_antes: usaLectura ? (clase === 'maquinaria' ? 25 : 1000) : 15, tareas: [] })}><Plus size={14} />Plan</button>}
        </div>
      </div>

      {usaLectura && <p className="mb-4 text-sm text-stone-500">Lectura actual: <b className="cifra text-tinta">{lectura ? `${n(lectura.valor)} ${lectura.tipo}` : 'sin registrar'}</b>{lectura && <span className="text-xs"> · {fecha(lectura.fecha)}</span>}</p>}

      {prog.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500">
          <p className="mb-3">Este equipo aún no tiene programa de mantenimiento.{puedeEditar ? ' Agrega uno de estos sugeridos o crea el tuyo:' : ''}</p>
          {puedeEditar && <div className="flex flex-wrap gap-2">{SUGERIDOS[clase].map(s => (
            <button key={s.nombre} onClick={() => agregarSugerido(s)} className="inline-flex items-center gap-1.5 rounded-full border border-marca/40 px-3 py-1 text-xs text-marca hover:bg-marca/10"><Sparkles size={12} />{s.nombre} · cada {n(s.intervalo)} {UNIDAD[s.disparo]}</button>
          ))}</div>}
        </div>
      ) : (
        <ul className="space-y-3">
          {prog.map(p => {
            const pl = planDe(p.plan_id)
            const av = p.disparo === 'dias' ? Math.min(1, Math.max(0, (p.intervalo - p.restante) / p.intervalo)) : Math.min(1, Math.max(0, ((p.lectura_actual ?? 0) - (p.lectura_ultimo ?? 0)) / p.intervalo))
            return (
              <li key={p.plan_id} className="rounded-xl border border-stone-200 p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.plan} <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${pl?.tipo === 'correctivo' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>{pl?.tipo ?? 'preventivo'}</span>{pl?.modelo_id && !pl.activo_id && <span className="ml-1 text-[10px] text-stone-500">(de todo el modelo)</span>}</p>
                    <p className="text-xs text-stone-500">Cada {n(p.intervalo)} {UNIDAD[p.disparo]} · último {p.fecha_ultimo ? fecha(p.fecha_ultimo) : 'nunca'}{p.lectura_ultimo != null && p.disparo !== 'dias' ? ` a ${n(p.lectura_ultimo)} ${p.disparo}` : ''}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${p.estado === 'vencido' ? 'bg-red-50 text-red-700' : p.estado === 'proximo' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                    {p.restante < 0 ? `Vencido por ${n(-p.restante)} ${UNIDAD[p.disparo]}` : `Faltan ${n(p.restante)} ${UNIDAD[p.disparo]}`}
                  </span>
                  {puedeEditar && pl && <button className="rounded p-1 text-stone-400 hover:text-tinta" onClick={() => setEditar(pl)} aria-label="Editar plan"><Pencil size={14} /></button>}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className={`h-full ${COLOR[p.estado]}`} style={{ width: `${Math.round(av * 100)}%` }} /></div>
                <p className="mt-1.5 text-xs text-stone-500">Próximo: {p.disparo === 'dias' ? fecha(p.proxima_fecha) : `${n(p.proxima_lectura)} ${p.disparo}`}{p.tareas?.length ? ` · ${p.tareas.join(', ')}` : ''}</p>
                {puedeResguardar && p.estado !== 'ok' && <Link to={`/mantenimiento?nuevo=1&activo=${activoId}&titulo=${encodeURIComponent(p.plan)}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-marca hover:underline"><CalendarClock size={13} />Programar este servicio</Link>}
              </li>
            )
          })}
        </ul>
      )}

      {ots.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Historial de servicios</h3>
          <ul className="divide-y divide-stone-100 text-sm">
            {ots.map(o => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link to={`/mantenimiento/ot/${o.id}`} className="font-mono text-xs hover:text-marca">{o.folio}</Link>
                <span className="min-w-0 flex-1 truncate">{o.titulo}<span className="ml-1 text-xs capitalize text-stone-500">· {o.tipo}</span></span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${ESTATUS_OT[o.estatus]?.clase}`}>{ESTATUS_OT[o.estatus]?.texto}</span>
                <span className="text-xs text-stone-500">{fecha(o.fecha_fin ?? o.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editar && <EditarPlan plan={editar} activoId={activoId} onCerrar={() => setEditar(null)} onListo={() => { setEditar(null); cargar() }} />}
      {leer && <Lectura activoId={activoId} empresaId={empresaId} tipo={clase === 'maquinaria' ? 'horas' : 'km'} actual={lectura?.valor ?? null} onCerrar={() => setLeer(false)} onListo={() => { setLeer(false); cargar() }} />}
    </section>
  )
}

function EditarPlan({ plan, activoId, onCerrar, onListo }: { plan: Partial<Plan>; activoId: string; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({ nombre: plan.nombre ?? '', tipo: plan.tipo ?? 'preventivo', disparo: plan.disparo ?? 'dias', intervalo: String(plan.intervalo ?? 180), avisar_antes: String(plan.avisar_antes ?? 15), tareas: (plan.tareas ?? []).join('\n'), notas: plan.notas ?? '' })
  const [error, setError] = useState('')
  async function guardar() {
    if (!f.nombre.trim() || !(Number(f.intervalo) > 0)) return setError('Escribe el nombre y cada cuánto.')
    const datos = { nombre: f.nombre.trim(), tipo: f.tipo, disparo: f.disparo, intervalo: Math.round(Number(f.intervalo)), avisar_antes: Math.max(0, Math.round(Number(f.avisar_antes) || 0)),
      tareas: f.tareas.split(/\n|,/).map(x => x.trim()).filter(Boolean), notas: f.notas.trim() || null }
    const { error } = plan.id ? await supabase.from('planes_mantenimiento').update(datos).eq('id', plan.id) : await supabase.from('planes_mantenimiento').insert({ ...datos, activo_id: activoId })
    if (error) return setError(mensajeError(error))
    onListo()
  }
  async function quitar() { if (!plan.id) return; await supabase.from('planes_mantenimiento').update({ activo: false }).eq('id', plan.id); onListo() }
  return (
    <Modal abierto titulo={plan.id ? 'Editar plan de mantenimiento' : 'Nuevo plan de mantenimiento'} onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombre *" className="sm:col-span-2"><input className="campo" autoFocus value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Cambio de aceite y filtros" /></Campo>
          <Campo label="Tipo"><select className="campo" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as Plan['tipo'] })}><option value="preventivo">Preventivo</option><option value="correctivo">Correctivo programado</option></select></Campo>
          <Campo label="Se mide en"><select className="campo" value={f.disparo} onChange={e => setF({ ...f, disparo: e.target.value as Disparo })}>{Object.entries(DISPARO).map(([k, v]) => <option key={k} value={k}>{v === 'días' ? 'Tiempo (días)' : v === 'km' ? 'Kilómetros' : 'Horas de uso'}</option>)}</select></Campo>
          <Campo label={`Cada cuántos ${UNIDAD[f.disparo]} *`}><input className="campo" type="number" min="1" value={f.intervalo} onChange={e => setF({ ...f, intervalo: e.target.value })} /></Campo>
          <Campo label={`Avisar ${UNIDAD[f.disparo]} antes`}><input className="campo" type="number" min="0" value={f.avisar_antes} onChange={e => setF({ ...f, avisar_antes: e.target.value })} /></Campo>
          <Campo label="Tareas (una por renglón)" className="sm:col-span-2"><textarea className="campo" rows={4} value={f.tareas} onChange={e => setF({ ...f, tareas: e.target.value })} placeholder={'Aceite de motor\nFiltro de aire'} /></Campo>
          <Campo label="Notas" className="sm:col-span-2"><input className="campo" value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} placeholder="Taller autorizado, aceite 15W-40…" /></Campo>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-wrap justify-between gap-2">
          {plan.id ? <button className="btn-peligro" onClick={quitar}><Trash2 size={15} />Quitar plan</button> : <span />}
          <div className="flex gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}><Check size={15} />Guardar</button></div>
        </div>
      </div>
    </Modal>
  )
}

function Lectura({ activoId, empresaId, tipo, actual, onCerrar, onListo }: { activoId: string; empresaId: string; tipo: 'km' | 'horas'; actual: number | null; onCerrar: () => void; onListo: () => void }) {
  const [v, setV] = useState('')
  const [error, setError] = useState('')
  async function guardar() {
    const val = Number(v)
    if (!(val >= 0)) return setError('Escribe la lectura.')
    if (actual != null && val < actual) return setError(`La lectura no puede ser menor que la última (${n(actual)} ${tipo}).`)
    const { error } = await supabase.from('lecturas').insert({ activo_id: activoId, empresa_id: empresaId, tipo, valor: val })
    if (error) return setError(mensajeError(error))
    if (tipo === 'km') await supabase.from('activo_vehiculo').upsert({ activo_id: activoId, kilometraje: val }, { onConflict: 'activo_id' })
    onListo()
  }
  return (
    <Modal abierto titulo={tipo === 'km' ? 'Registrar kilometraje' : 'Registrar horómetro'} onCerrar={onCerrar} ancho="max-w-sm">
      <div className="space-y-4">
        <Campo label={`Lectura actual (${tipo})`}><input className="campo" type="number" min="0" autoFocus value={v} onChange={e => setV(e.target.value)} placeholder={actual != null ? `Última: ${n(actual)}` : ''} /></Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}><Check size={15} />Guardar</button></div>
      </div>
    </Modal>
  )
}
