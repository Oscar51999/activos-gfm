import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gauge, Plus, ClipboardCheck, Wrench, Check, X, AlertTriangle } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { unidadLectura, ESTATUS_OT, type TipoEquipo, type EstatusOT } from '../lib/mantenimiento'
import { Modal, Aviso } from './ui'
import ChecklistDiario from './Checklist'
import { fechaCorta } from './Prestamo'

type Lect = { valor: number; fecha: string; origen: string }
type Prog = { plan: string; disparo: string; restante: number; estado: 'vencido' | 'proximo' | 'ok'; ot_abierta: string | null; ot_folio: string | null }
type Chk = { id: string; operador: string; todo_ok: boolean; created_at: string; lectura: number | null }
type OT = { id: string; folio: string; titulo: string; estatus: EstatusOT; created_at: string }
const n = (x: number) => Math.round(x).toLocaleString('es-MX')

/** Uso y mantenimiento de un vehículo o máquina: lectura actual, próximos servicios, checklists y órdenes. */
export default function UsoPanel({ activoId, empresaId, qr, tipo, nombreUsuario }: { activoId: string; empresaId: string; qr: string; tipo: TipoEquipo; nombreUsuario?: string }) {
  const { puedeResguardar } = useAuth()
  const u = unidadLectura(tipo)
  const [lects, setLects] = useState<Lect[]>([])
  const [prog, setProg] = useState<Prog[]>([])
  const [chks, setChks] = useState<Chk[]>([])
  const [ots, setOts] = useState<OT[]>([])
  const [nueva, setNueva] = useState('')
  const [checklist, setChecklist] = useState(false)
  const [error, setError] = useState('')
  const cargar = () => {
    supabase.from('lecturas').select('valor,fecha,origen').eq('activo_id', activoId).eq('tipo', u).order('fecha', { ascending: false }).limit(12).then(({ data }) => setLects((data as Lect[]) ?? []))
    supabase.from('v_mantenimiento').select('plan,disparo,restante,estado,ot_abierta,ot_folio').eq('activo_id', activoId).order('restante').then(({ data }) => setProg((data as Prog[]) ?? []))
    supabase.from('checklists').select('id,operador,todo_ok,created_at,lectura').eq('activo_id', activoId).order('created_at', { ascending: false }).limit(5).then(({ data }) => setChks((data as Chk[]) ?? []))
    supabase.from('ordenes_trabajo').select('id,folio,titulo,estatus,created_at').eq('activo_id', activoId).order('created_at', { ascending: false }).limit(5).then(({ data }) => setOts((data as OT[]) ?? []))
  }
  useEffect(cargar, [activoId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function registrar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const v = Number(nueva)
    if (!nueva || v < 0) return
    if (lects[0] && v < lects[0].valor) { setError(`La lectura no puede ser menor a la última (${n(lects[0].valor)} ${u}).`); return }
    const { error } = await supabase.from('lecturas').insert({ activo_id: activoId, empresa_id: empresaId, tipo: u, valor: v, origen: 'manual' })
    if (error) setError(mensajeError(error)); else { setNueva(''); cargar() }
  }

  const actual = lects[0]
  const serie = [...lects].reverse()
  const max = Math.max(...serie.map(l => l.valor), 1), min = Math.min(...serie.map(l => l.valor), 0)
  const puntos = serie.map((l, i) => `${(i / Math.max(1, serie.length - 1)) * 100},${36 - ((l.valor - min) / Math.max(1, max - min)) * 32}`).join(' ')
  const col = { vencido: 'text-red-700', proximo: 'text-amber-700', ok: 'text-emerald-700' }

  return (
    <section className="tarjeta p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Gauge size={17} className="text-marca" />Uso y mantenimiento</h2>
        <div className="flex gap-2">
          <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => setChecklist(true)}><ClipboardCheck size={14} />Checklist diario</button>
          {puedeResguardar && <Link to={`/mantenimiento?nuevo=1&activo=${activoId}`} className="btn-sec !px-3 !py-1.5 text-xs"><Wrench size={14} />Orden de trabajo</Link>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200 p-4">
          <p className="text-[11px] uppercase tracking-wider text-stone-500">{u === 'km' ? 'Kilometraje' : 'Horómetro'}</p>
          <p className="cifra mt-1 text-3xl font-semibold">{actual ? n(actual.valor) : '—'} <span className="text-sm font-normal text-stone-500">{u}</span></p>
          <p className="text-[11px] text-stone-400">{actual ? `al ${fechaCorta(actual.fecha)} · ${actual.origen}` : 'Sin lecturas todavía'}</p>
          {serie.length > 1 && <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-10 w-full"><polyline points={puntos} fill="none" stroke="#F9B234" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>}
          {puedeResguardar && (
            <form onSubmit={registrar} className="mt-3 flex gap-2">
              <input className="campo !py-1.5 text-sm" type="number" min="0" step="0.1" inputMode="decimal" placeholder={`Nueva lectura (${u})`} value={nueva} onChange={e => setNueva(e.target.value)} />
              <button className="btn-primario !px-3 !py-1.5"><Plus size={15} /></button>
            </form>
          )}
          {error && <div className="mt-2"><Aviso>{error}</Aviso></div>}
        </div>
        <div className="rounded-xl border border-stone-200 p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-stone-500">Próximos servicios</p>
          {prog.length === 0 ? <p className="text-sm text-stone-500">Sin plan de mantenimiento. <Link to="/mantenimiento?tab=planes" className="text-marca hover:underline">Crear uno</Link></p> : (
            <ul className="space-y-2">{prog.map(p => (
              <li key={p.plan} className="text-sm">
                <p className="flex items-center gap-1.5 font-medium">{p.estado === 'vencido' && <AlertTriangle size={13} className="text-red-700" />}{p.plan}</p>
                <p className={`text-xs ${col[p.estado]}`}>{p.restante < 0 ? `Vencido por ${n(-p.restante)} ${p.disparo}` : `Faltan ${n(p.restante)} ${p.disparo}`}{p.ot_folio && <> · <Link to={`/mantenimiento/ot/${p.ot_abierta}`} className="text-marca hover:underline">{p.ot_folio}</Link></>}</p>
              </li>
            ))}</ul>
          )}
        </div>
      </div>
      {(chks.length > 0 || ots.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><p className="mb-1.5 text-[11px] uppercase tracking-wider text-stone-500">Últimos checklists</p>
            <ul className="space-y-1">{chks.map(c => <li key={c.id} className="flex items-center gap-2 text-xs">{c.todo_ok ? <Check size={13} className="text-emerald-700" /> : <X size={13} className="text-red-700" />}<span className="truncate">{c.operador}</span><span className="ml-auto text-stone-400">{fechaCorta(c.created_at)}</span></li>)}</ul></div>
          <div><p className="mb-1.5 text-[11px] uppercase tracking-wider text-stone-500">Órdenes de trabajo</p>
            <ul className="space-y-1">{ots.map(o => <li key={o.id}><Link to={`/mantenimiento/ot/${o.id}`} className="flex items-center gap-2 text-xs hover:text-marca"><span className="font-mono text-stone-500">{o.folio}</span><span className="truncate">{o.titulo}</span><span className={`ml-auto rounded-full px-1.5 text-[10px] ring-1 ring-inset ${ESTATUS_OT[o.estatus].clase}`}>{ESTATUS_OT[o.estatus].texto}</span></Link></li>)}</ul></div>
        </div>
      )}
      <Modal abierto={checklist} onCerrar={() => { setChecklist(false); cargar() }} titulo="Checklist diario">
        <ChecklistDiario qr={qr} tipo={tipo} nombreInicial={nombreUsuario} onListo={cargar} />
      </Modal>
    </section>
  )
}
