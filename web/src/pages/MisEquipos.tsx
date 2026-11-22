import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PenLine, Siren, Inbox, KeyRound, CalendarClock, UserRound, ShieldCheck, Boxes } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fecha } from '../lib/hooks'
import { Cargando, Modal, Vacio } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import ReportarFalla from '../components/ReportarFalla'
import { ESTATUS, type Estatus } from '../lib/supabase'

type Mio = { id: string; codigo: string; qr: string; descripcion: string; serie: string | null; categoria: string; marca: string | null; modelo: string | null; ubicacion: string | null; estatus: Estatus
  foto_principal: string | null; modelo_foto: string | null; empresa: string; garantia_hasta: string | null; desde: string | null; folio: string | null }
type PorFirmar = { id: string; folio: string; fecha: string; tipo: string; activos: number; token: string }
type Lic = { id: string; licencia: string; cuenta: string | null; asignada: string; vence: string | null }
type Res = { id: string; codigo: string; descripcion: string; inicio: string; fin: string; motivo: string | null }

const hora = (s: string) => new Date(s).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Portal del empleado: su equipo, sus resguardos por firmar, reportar fallas y pedir equipo. Lo ve cualquier usuario ligado a un empleado. */
export default function MisEquipos() {
  const { perfil } = useAuth()
  const [mios, setMios] = useState<Mio[] | null>(null)
  const [firmar, setFirmar] = useState<PorFirmar[]>([])
  const [lics, setLics] = useState<Lic[]>([])
  const [res, setRes] = useState<Res[]>([])
  const [reportar, setReportar] = useState<Mio | null>(null)

  useEffect(() => {
    if (!perfil?.empleado_id) { setMios([]); return }
    supabase.rpc('mis_activos').then(({ data }) => setMios((data as Mio[]) ?? []))
    supabase.rpc('mis_resguardos_por_firmar').then(({ data }) => setFirmar((data as PorFirmar[]) ?? []))
    supabase.rpc('mis_licencias').then(({ data }) => setLics((data as Lic[]) ?? []))
    supabase.from('v_reservas').select('id,codigo,descripcion,inicio,fin,motivo').eq('perfil_id', perfil.id).eq('estatus', 'activa').gte('fin', new Date().toISOString()).order('inicio').limit(10)
      .then(({ data }) => setRes((data as Res[]) ?? []))
  }, [perfil?.empleado_id, perfil?.id])

  if (!perfil) return <Cargando />
  if (!perfil.empleado_id) return (
    <div className="mx-auto max-w-xl">
      <div className="tarjeta"><Vacio titulo="Tu usuario no está ligado a un empleado" texto="Pide al administrador que en Usuarios elija tu nombre en “Empleado vinculado”. Así verás aquí el equipo que tienes a tu cargo, tus resguardos y tus licencias." /></div>
    </div>
  )
  if (!mios) return <Cargando />

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-marca/30 bg-marca/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[.16em] text-marca"><UserRound size={12} />Mi espacio</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">Mis equipos</h1>
          <p className="mt-1 text-sm text-stone-500">Lo que tienes a tu cargo, lo que te falta firmar y tus licencias.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/solicitudes?nuevo=1" className="btn-sec"><Inbox size={16} />Pedir equipo o material</Link>
          <Link to="/reservas" className="btn-primario"><CalendarClock size={16} />Reservar equipo</Link>
        </div>
      </div>

      {firmar.length > 0 && (
        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800"><PenLine size={16} />Tienes {firmar.length} resguardo(s) por firmar</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {firmar.map(f => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl bg-panel px-3 py-2">
                <span className="min-w-0 flex-1"><span className="block font-mono text-xs text-stone-500">{f.folio}</span><span className="block text-sm">{f.activos} equipo(s) · {fecha(f.fecha)}</span></span>
                <Link to={`/firmar/${f.token}`} className="btn-primario !px-3 !py-1.5 text-xs"><PenLine size={14} />Revisar y firmar</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Boxes size={16} className="text-marca" />A mi cargo · {mios.length}</h2>
        {mios.length === 0 ? <div className="tarjeta"><Vacio titulo="No tienes equipo asignado" texto="Cuando te entreguen algo con resguardo, aparecerá aquí." /></div> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mios.map(a => {
              const gar = a.garantia_hasta ? Math.round((new Date(a.garantia_hasta + 'T12:00').getTime() - Date.now()) / 864e5) : null
              return (
                <article key={a.id} className="tarjeta overflow-hidden">
                  <FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} className="aspect-[16/9] w-full" icono={36} />
                  <div className="space-y-1 p-4">
                    <p className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-stone-500">{a.codigo}</span><span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${ESTATUS[a.estatus]?.clase ?? ''}`}>{ESTATUS[a.estatus]?.texto ?? a.estatus}</span></p>
                    <p className="font-medium">{a.descripcion}</p>
                    <p className="text-xs text-stone-500">{[a.marca, a.modelo, a.serie && `Serie ${a.serie}`].filter(Boolean).join(' · ')}</p>
                    <p className="text-xs text-stone-500">{[a.empresa, a.ubicacion, a.desde && `desde ${fecha(a.desde)}`].filter(Boolean).join(' · ')}</p>
                    {gar != null && <p className={`flex items-center gap-1 text-xs ${gar < 0 ? 'text-stone-400' : gar <= 30 ? 'text-amber-700' : 'text-emerald-700'}`}><ShieldCheck size={12} />{gar < 0 ? 'Garantía vencida' : `Garantía hasta ${fecha(a.garantia_hasta)}`}</p>}
                    <button className="btn-sec mt-2 w-full justify-center !py-1.5 text-xs" onClick={() => setReportar(a)}><Siren size={14} />Reportar falla o daño</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="tarjeta p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} className="text-marca" />Mis licencias y cuentas</h2>
          {lics.length === 0 ? <p className="text-sm text-stone-500">No tienes licencias a tu nombre.</p> : <ul className="space-y-1.5">{lics.map(l => <li key={l.id} className="text-sm"><span className="font-medium">{l.licencia}</span><span className="block text-xs text-stone-500">{[l.cuenta, `desde ${fecha(l.asignada)}`, l.vence && `vence ${fecha(l.vence)}`].filter(Boolean).join(' · ')}</span></li>)}</ul>}
        </section>
        <section className="tarjeta p-4">
          <h2 className="mb-2 flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><CalendarClock size={15} className="text-marca" />Mis reservas</span><Link to="/reservas" className="text-[11px] font-normal text-marca hover:underline">Ver agenda</Link></h2>
          {res.length === 0 ? <p className="text-sm text-stone-500">No tienes reservas próximas.</p> : <ul className="space-y-1.5">{res.map(r => <li key={r.id} className="text-sm"><span className="font-medium">{r.descripcion}</span> <span className="font-mono text-xs text-stone-500">{r.codigo}</span><span className="block text-xs text-stone-500">{hora(r.inicio)} → {hora(r.fin)}{r.motivo ? ` · ${r.motivo}` : ''}</span></li>)}</ul>}
        </section>
      </div>

      {reportar && <Modal abierto titulo={`Reportar · ${reportar.descripcion}`} onCerrar={() => setReportar(null)} ancho="max-w-lg">
        <ReportarFalla qr={reportar.qr} nombreInicial={perfil.nombre} onListo={() => setTimeout(() => setReportar(null), 1800)} />
      </Modal>}
    </div>
  )
}
