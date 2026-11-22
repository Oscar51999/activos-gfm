import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, ChevronLeft, ChevronRight, Plus, X, Check, Settings2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Encabezado, Campo, Modal, Aviso, Cargando, Vacio } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import { BuscarActivo, type ActivoMini } from '../components/Buscadores'

type Equipo = { id: string; empresa_id: string; codigo: string; descripcion: string; categoria: string | null; empresa: string; foto_principal: string | null; modelo_foto: string | null; estatus: string }
type Reserva = { id: string; activo_id: string; perfil_id: string; para_quien: string | null; inicio: string; fin: string; motivo: string | null; estatus: string; reservo: string | null; codigo: string; descripcion: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const lunes = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const hhmm = (s: string) => new Date(s).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const local = (d: Date) => `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const COLORES = ['#38BDF8', '#A78BFA', '#34D399', '#F472B6', '#FDAB3D', '#2DD4BF', '#FB7185']
const color = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORES[h % COLORES.length] }

/** Agenda para apartar equipo compartido (camionetas, proyectores, equipo de topografía…) sin choques de horario. */
export default function Reservas() {
  const { perfil, puedeEditar, puedeResguardar } = useAuth()
  const [sp] = useSearchParams()
  const [equipos, setEquipos] = useState<Equipo[] | null>(null)
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [semana, setSemana] = useState(() => lunes(new Date()))
  const [nueva, setNueva] = useState<{ activo?: string; dia?: string } | null>(sp.get('activo') ? { activo: sp.get('activo')! } : null)
  const [ver, setVer] = useState<Reserva | null>(null)
  const [agregar, setAgregar] = useState(false)
  const [n, setN] = useState(0)
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(semana); d.setDate(d.getDate() + i); return d }), [semana])
  const fin = useMemo(() => { const d = new Date(semana); d.setDate(d.getDate() + 7); return d }, [semana])

  useEffect(() => {
    supabase.from('v_activos').select('id,empresa_id,codigo,descripcion,categoria,empresa,foto_principal,modelo_foto,estatus').eq('reservable', true).neq('estatus', 'baja').order('descripcion').then(({ data }) => setEquipos((data as Equipo[]) ?? []))
  }, [n])
  useEffect(() => {
    supabase.from('v_reservas').select('*').eq('estatus', 'activa').lt('inicio', fin.toISOString()).gt('fin', semana.toISOString()).order('inicio').then(({ data }) => setReservas((data as Reserva[]) ?? []))
  }, [semana, fin, n])

  async function quitarReservable(id: string) { await supabase.from('activos').update({ reservable: false }).eq('id', id); setN(x => x + 1) }

  if (!equipos) return <Cargando />
  const hoy = iso(new Date())

  return (
    <div>
      <Encabezado titulo="Reservas de equipo" sub="Aparta camionetas, proyectores, equipo de topografía o cualquier equipo compartido. El sistema no deja que dos personas lo aparten a la misma hora."
        acciones={<>
          {puedeEditar && <button className="btn-sec" onClick={() => setAgregar(true)}><Settings2 size={16} />Equipo para reservar</button>}
          <button className="btn-primario" onClick={() => setNueva({})} disabled={!equipos.length}><Plus size={16} />Nueva reserva</button>
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 rounded-xl border border-stone-200 px-1 py-0.5">
          <button className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:text-tinta" onClick={() => setSemana(d => { const x = new Date(d); x.setDate(x.getDate() - 7); return x })} aria-label="Semana anterior"><ChevronLeft size={16} /></button>
          <span className="min-w-44 text-center text-sm">{dias[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – {dias[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <button className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:text-tinta" onClick={() => setSemana(d => { const x = new Date(d); x.setDate(x.getDate() + 7); return x })} aria-label="Semana siguiente"><ChevronRight size={16} /></button>
        </span>
        <button className="btn-sec !py-1.5 text-xs" onClick={() => setSemana(lunes(new Date()))}>Esta semana</button>
        <span className="text-xs text-stone-500">{reservas.length} reserva(s) esta semana</span>
      </div>

      {equipos.length === 0 ? <div className="tarjeta"><Vacio titulo="Todavía no hay equipo para reservar" texto={puedeEditar ? 'Usa “Equipo para reservar” para elegir qué camionetas, proyectores o equipos se pueden apartar.' : 'Pide a un supervisor que marque qué equipo se puede apartar.'} /></div> : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed border-collapse text-xs">
            <thead><tr><th className="w-56 border-b border-stone-200 p-2 text-left font-medium text-stone-500">Equipo</th>
              {dias.map(d => <th key={iso(d)} className={`border-b border-l border-stone-200 p-2 text-center font-medium ${iso(d) === hoy ? 'text-marca' : 'text-stone-500'}`}>{d.toLocaleDateString('es-MX', { weekday: 'short' })}<span className="block text-base">{d.getDate()}</span></th>)}</tr></thead>
            <tbody>
              {equipos.map(e => (
                <tr key={e.id} className="align-top">
                  <td className="border-b border-stone-200 p-2">
                    <div className="flex items-center gap-2">
                      <FotoActivo foto={e.foto_principal} fotoModelo={e.modelo_foto} categoria={e.categoria} className="h-10 w-12 shrink-0 rounded-lg" icono={18} />
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{e.descripcion}</p><p className="truncate text-[11px] text-stone-500"><span className="font-mono">{e.codigo}</span> · {e.empresa}</p></div>
                    </div>
                  </td>
                  {dias.map(d => {
                    const ini = new Date(d), fin = new Date(d); fin.setDate(fin.getDate() + 1)
                    const rs = reservas.filter(r => r.activo_id === e.id && new Date(r.inicio) < fin && new Date(r.fin) > ini)
                    return (
                      <td key={iso(d)} className={`group h-16 border-b border-l border-stone-200 p-1 ${iso(d) === hoy ? 'bg-marca/5' : ''}`}>
                        <div className="space-y-1">
                          {rs.map(r => <button key={r.id} onClick={() => setVer(r)} className="block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] text-[#0b0d11]" style={{ background: color(r.perfil_id) }} title={`${r.reservo ?? ''} · ${r.motivo ?? ''}`}>
                            {hhmm(r.inicio)}–{hhmm(r.fin)} {r.para_quien || r.reservo}</button>)}
                          {iso(d) >= hoy && <button onClick={() => setNueva({ activo: e.id, dia: iso(d) })} className="hidden w-full rounded-md border border-dashed border-stone-300 py-0.5 text-[11px] text-stone-400 hover:border-marca hover:text-marca group-hover:block">+ Apartar</button>}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nueva && <NuevaReserva equipos={equipos} inicial={nueva} onCerrar={() => setNueva(null)} onListo={() => { setNueva(null); setN(x => x + 1) }} />}
      {ver && <Modal abierto titulo={`${ver.descripcion} · ${ver.codigo}`} onCerrar={() => setVer(null)} ancho="max-w-md">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-stone-500">Desde</dt><dd>{new Date(ver.inicio).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-stone-500">Hasta</dt><dd>{new Date(ver.fin).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-stone-500">Reservó</dt><dd>{ver.reservo ?? '—'}</dd></div>
          {ver.para_quien && <div className="flex justify-between gap-3"><dt className="text-stone-500">Para</dt><dd>{ver.para_quien}</dd></div>}
          {ver.motivo && <div className="flex justify-between gap-3"><dt className="text-stone-500">Motivo</dt><dd className="text-right">{ver.motivo}</dd></div>}
        </dl>
        {(ver.perfil_id === perfil?.id || puedeResguardar) && <div className="mt-4 flex justify-end"><button className="btn-peligro" onClick={async () => { await supabase.from('reservas').update({ estatus: 'cancelada' }).eq('id', ver.id); setVer(null); setN(x => x + 1) }}><X size={15} />Cancelar reserva</button></div>}
      </Modal>}
      {agregar && <EquipoReservable equipos={equipos} onCerrar={() => setAgregar(false)} onQuitar={quitarReservable} onListo={() => setN(x => x + 1)} />}
      <p className="mt-3 text-xs text-stone-500">¿Ya te lo entregaron? Haz el préstamo en <Link to="/resguardos/nuevo" className="text-marca underline">Resguardos</Link> para que quede quién lo trae.</p>
    </div>
  )
}

function NuevaReserva({ equipos, inicial, onCerrar, onListo }: { equipos: Equipo[]; inicial: { activo?: string; dia?: string }; onCerrar: () => void; onListo: () => void }) {
  const base = inicial.dia ? new Date(inicial.dia + 'T09:00') : (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d })()
  const fin0 = new Date(base); fin0.setHours(fin0.getHours() + (inicial.dia ? 9 : 2))
  const [f, setF] = useState({ activo: inicial.activo ?? '', inicio: local(base), fin: local(fin0), para: '', motivo: '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  async function guardar() {
    setError('')
    if (!f.activo) return setError('Elige el equipo.')
    const i = new Date(f.inicio), t = new Date(f.fin)
    if (!(t > i)) return setError('La hora de regreso debe ser después de la de salida.')
    setGuardando(true)
    const { error } = await supabase.from('reservas').insert({ activo_id: f.activo, empresa_id: equipos.find(e => e.id === f.activo)!.empresa_id, inicio: i.toISOString(), fin: t.toISOString(), para_quien: f.para.trim() || null, motivo: f.motivo.trim() || null })
    setGuardando(false)
    if (error) setError(/reservas_sin_choques|conflicting key|exclusion/i.test(error.message) ? 'Ese equipo ya está apartado en ese horario. Elige otra hora u otro equipo.' : mensajeError(error))
    else onListo()
  }
  return (
    <Modal abierto titulo="Apartar equipo" onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <Campo label="Equipo *"><select className="campo" value={f.activo} onChange={e => setF({ ...f, activo: e.target.value })}><option value="">— Elige —</option>{equipos.map(e => <option key={e.id} value={e.id}>{e.descripcion} · {e.codigo}</option>)}</select></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Sale / desde *"><input className="campo" type="datetime-local" value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} /></Campo>
          <Campo label="Regresa / hasta *"><input className="campo" type="datetime-local" value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })} /></Campo>
          <Campo label="Para quién (si no es para ti)"><input className="campo" value={f.para} onChange={e => setF({ ...f, para: e.target.value })} placeholder="Nombre" /></Campo>
          <Campo label="Para qué"><input className="campo" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} placeholder="Visita a obra Ecatepec" /></Campo>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando} onClick={guardar}><CalendarClock size={15} />{guardando ? 'Guardando…' : 'Apartar'}</button></div>
      </div>
    </Modal>
  )
}

function EquipoReservable({ equipos, onCerrar, onQuitar, onListo }: { equipos: Equipo[]; onCerrar: () => void; onQuitar: (id: string) => void; onListo: () => void }) {
  const [act, setAct] = useState<ActivoMini | null>(null)
  const [error, setError] = useState('')
  async function agregar() {
    if (!act) return
    const { error } = await supabase.from('activos').update({ reservable: true }).eq('id', act.id)
    if (error) setError(mensajeError(error)); else { setAct(null); onListo() }
  }
  return (
    <Modal abierto titulo="Equipo que se puede reservar" onCerrar={onCerrar} ancho="max-w-lg">
      <div className="mb-3 flex gap-2"><div className="min-w-0 flex-1"><BuscarActivo valor={act} onElegir={setAct} placeholder="Busca la camioneta, proyector…" /></div><button className="btn-primario" disabled={!act} onClick={agregar}><Check size={15} />Agregar</button></div>
      {error && <Aviso>{error}</Aviso>}
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200">
        {equipos.length === 0 ? <li className="p-3 text-sm text-stone-500">Ninguno todavía.</li> : equipos.map(e => (
          <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{e.descripcion} <span className="font-mono text-xs text-stone-500">{e.codigo}</span></span>
            <button className="text-xs text-stone-500 hover:text-red-700" onClick={() => onQuitar(e.id)}>Quitar</button></li>
        ))}
      </ul>
    </Modal>
  )
}
