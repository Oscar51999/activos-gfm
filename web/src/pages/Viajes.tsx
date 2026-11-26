import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Route, Play, Square, X, MapPin, Satellite, WifiOff, AlertTriangle, CheckCircle2, FileSpreadsheet, ExternalLink } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { rastreador } from '../lib/viaje'
import { ubicacionActual } from '../lib/escaneo'
import { libroExcel, descargar } from '../lib/excel'
import { Encabezado, Campo, Modal, Aviso, Cargando, Vacio } from '../components/ui'
import { BuscarActivo, type ActivoMini } from '../components/Buscadores'
import RutaMapa from '../components/RutaMapa'

export type Viaje = { id: string; activo_id: string; empresa_id: string; perfil_id: string | null; operador: string | null; motivo: string | null; destino: string | null
  inicio: string; fin: string | null; km_inicio: number | null; km_fin: number | null; lat_inicio: number | null; lng_inicio: number | null; lat_fin: number | null; lng_fin: number | null
  km_gps: number; puntos: number; estado: 'en_curso' | 'terminado' | 'cancelado'; notas: string | null; codigo: string; descripcion: string; placa: string | null; numero_economico: string | null
  empresa: string; km_odometro: number | null; minutos: number }
type Cuadre = { id: string; activo_id: string; fecha: string; fecha_ant: string; codigo: string; descripcion: string; placa: string | null; numero_economico: string | null; litros: number
  operador: string | null; recorrido: number | null; viajes: number; km_gps: number; estado: 'cuadra' | 'revisar' | 'sin_viajes' | 'sin_lectura' }

const num = (n: number | null | undefined, d = 1) => n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: d })
const fh = (s: string) => new Date(s).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dur = (min: number) => min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`
const unidad = (v: { placa: string | null; numero_economico: string | null; descripcion: string }) => v.placa || v.numero_economico || v.descripcion
export const CUADRE: Record<Cuadre['estado'], { t: string; c: string }> = {
  cuadra: { t: 'Cuadra', c: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  revisar: { t: 'No cuadra', c: 'bg-red-50 text-red-700 ring-red-200' },
  sin_viajes: { t: 'Sin viajes', c: 'bg-stone-100 text-stone-600 ring-stone-200' },
  sin_lectura: { t: 'Sin kilometraje', c: 'bg-stone-100 text-stone-600 ring-stone-200' },
}

/** Bitácora de viajes: el operador inicia y termina el viaje desde su celular y el GPS registra la ruta y los km. */
export default function Viajes() {
  const { perfil } = useAuth()
  const [sp] = useSearchParams()
  const [viajes, setViajes] = useState<Viaje[] | null>(null)
  const [cuadre, setCuadre] = useState<Cuadre[]>([])
  const [est, setEst] = useState(rastreador.estado)
  const [n, setN] = useState(0)
  const [ver, setVer] = useState<Viaje | null>(null)
  const [tab, setTab] = useState<'viajes' | 'cuadre'>(sp.get('ver') === 'cuadre' ? 'cuadre' : 'viajes')

  useEffect(() => rastreador.escuchar(setEst), [])
  useEffect(() => {
    supabase.from('v_viajes').select('*').order('inicio', { ascending: false }).limit(200).then(({ data }) => setViajes((data as Viaje[]) ?? []))
    supabase.from('v_cuadre_combustible').select('*').order('fecha', { ascending: false }).limit(200).then(({ data }) => setCuadre((data as Cuadre[]) ?? []))
  }, [n, est.viajeId])
  // Si el usuario tiene un viaje en curso (por ejemplo, abrió la app de nuevo), se reanuda el rastreo
  const mio = useMemo(() => viajes?.find(v => v.estado === 'en_curso' && v.perfil_id === perfil?.id) ?? null, [viajes, perfil])
  useEffect(() => { if (mio && est.viajeId !== mio.id) rastreador.iniciar(mio.id, Number(mio.km_gps), mio.puntos) }, [mio]) // eslint-disable-line react-hooks/exhaustive-deps

  // Un viaje guardado en este teléfono que ya se terminó en otro lado: se olvida
  useEffect(() => { if (viajes && est.viajeId && !viajes.some(v => v.id === est.viajeId && v.estado === 'en_curso')) rastreador.terminarLocal() }, [viajes]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!viajes) return <Cargando />
  const enCurso = viajes.filter(v => v.estado === 'en_curso')
  const mes = viajes.filter(v => v.estado === 'terminado' && Date.now() - new Date(v.inicio).getTime() < 30 * 864e5)
  const revisar = cuadre.filter(c => c.estado === 'revisar')

  function excel() {
    descargar(libroExcel<Viaje>([{ nombre: 'Viajes', columnas: [
      { titulo: 'Inicio', valor: v => fh(v.inicio), ancho: 18 }, { titulo: 'Fin', valor: v => v.fin ? fh(v.fin) : '', ancho: 18 }, { titulo: 'Código', valor: v => v.codigo },
      { titulo: 'Unidad', valor: v => unidad(v), ancho: 24 }, { titulo: 'Operador', valor: v => v.operador, ancho: 22 }, { titulo: 'Destino', valor: v => v.destino, ancho: 22 },
      { titulo: 'Motivo', valor: v => v.motivo, ancho: 24 }, { titulo: 'Km inicial', valor: v => v.km_inicio }, { titulo: 'Km final', valor: v => v.km_fin },
      { titulo: 'Km odómetro', valor: v => v.km_odometro }, { titulo: 'Km GPS', valor: v => v.km_gps }, { titulo: 'Duración (min)', valor: v => v.minutos }, { titulo: 'Estado', valor: v => v.estado }],
      filas: viajes ?? [] }]), `viajes-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      <Encabezado titulo="Bitácora de viajes" sub="Inicia y termina cada viaje desde el celular: el GPS registra la ruta y los kilómetros, y se comparan con el odómetro y las cargas de combustible."
        acciones={<button className="btn-sec" onClick={excel} disabled={!viajes.length}><FileSpreadsheet size={16} />Excel</button>} />

      <div className="mb-5 grid gap-5 lg:grid-cols-[26rem_1fr] *:min-w-0">
        {est.viajeId && mio ? <ViajeEnCurso v={mio} est={est} onListo={() => setN(x => x + 1)} />
          : <IniciarViaje activoInicial={sp.get('activo')} onIniciado={() => setN(x => x + 1)} />}
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {([['Viajes en curso', enCurso.length, ''], ['Viajes últimos 30 días', mes.length, ''], ['Km por GPS (30 días)', num(mes.reduce((s, v) => s + Number(v.km_gps), 0), 0), ''], ['Cargas que no cuadran', revisar.length, revisar.length ? 'text-red-700' : '']] as const).map(([t, v, c]) => (
            <div key={t} className="tarjeta p-4"><p className={`cifra text-3xl font-semibold ${c}`}>{v}</p><p className="text-xs text-stone-500">{t}</p></div>
          ))}
          {enCurso.length > 0 && <div className="tarjeta p-4 sm:col-span-2"><p className="mb-2 text-sm font-semibold">En la calle ahora</p>
            <ul className="space-y-1 text-sm">{enCurso.map(v => <li key={v.id} className="flex flex-wrap justify-between gap-2"><span><span className="font-mono text-xs text-marca">{v.codigo}</span> {unidad(v)} · {v.operador}</span><span className="cifra text-xs text-stone-500">{dur(v.minutos)} · {num(v.km_gps, 1)} km</span></li>)}</ul></div>}
        </div>
      </div>

      <div className="mb-3 flex gap-1 rounded-xl bg-stone-100 p-1 text-sm sm:w-fit">
        <button className={`flex-1 rounded-lg px-4 py-1.5 ${tab === 'viajes' ? 'bg-panel font-medium shadow-sm' : 'text-stone-500'}`} onClick={() => setTab('viajes')}>Viajes</button>
        <button className={`flex-1 rounded-lg px-4 py-1.5 ${tab === 'cuadre' ? 'bg-panel font-medium shadow-sm' : 'text-stone-500'}`} onClick={() => setTab('cuadre')}>Cuadre con combustible{revisar.length ? ` (${revisar.length})` : ''}</button>
      </div>

      {tab === 'viajes' ? (viajes.length === 0 ? <Vacio titulo="Sin viajes todavía" texto="Cuando un operador inicie un viaje desde su celular aparecerá aquí con su ruta." /> : (
        <section className="tarjeta overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-2">Inicio</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2">Operador</th><th className="px-3 py-2">Destino</th><th className="px-3 py-2 text-right">Km odómetro</th><th className="px-3 py-2 text-right">Km GPS</th><th className="px-3 py-2 text-right">Duración</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y divide-stone-100">{viajes.map(v => {
            const dif = v.km_odometro != null && v.km_gps > 0 && Math.abs(v.km_odometro - v.km_gps) > Math.max(5, v.km_odometro * 0.25)
            return (
              <tr key={v.id} className="cursor-pointer hover:bg-stone-50" onClick={() => setVer(v)}>
                <td className="whitespace-nowrap px-5 py-2 text-xs text-stone-500">{fh(v.inicio)}</td>
                <td className="px-3 py-2"><span className="font-mono text-xs text-marca">{v.codigo}</span> {unidad(v)}</td>
                <td className="px-3 py-2 text-xs">{v.operador}</td>
                <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-stone-500">{v.destino || v.motivo || '—'}</td>
                <td className="cifra px-3 py-2 text-right">{num(v.km_odometro, 0)}</td>
                <td className={`cifra px-3 py-2 text-right ${dif ? 'font-semibold text-red-600' : ''}`}>{num(v.km_gps, 1)}</td>
                <td className="cifra whitespace-nowrap px-3 py-2 text-right text-xs">{dur(v.minutos)}</td>
                <td className="px-3 py-2">{v.estado === 'en_curso' ? <span className="whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 ring-1 ring-sky-200">En curso</span> : v.estado === 'cancelado' ? <span className="text-[11px] text-stone-400">Cancelado</span> : <MapPin size={14} className="text-stone-400" />}</td>
              </tr>)
          })}</tbody>
        </table></div></section>
      )) : (
        <section className="tarjeta overflow-hidden">
          <p className="p-5 pb-2 text-xs text-stone-500">Para cada carga de combustible se compara lo que marcó el odómetro desde la carga anterior con los km por GPS de los viajes registrados en ese lapso. “No cuadra” es una diferencia mayor al 25%: puede ser un viaje sin registrar, el GPS apagado o combustible que no se usó en la unidad.</p>
          {cuadre.length === 0 ? <p className="p-5 pt-0 text-sm text-stone-500">Aún no hay cargas con kilometraje para comparar.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-2">Carga</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2 text-right">Litros</th><th className="px-3 py-2 text-right">Odómetro</th><th className="px-3 py-2 text-right">GPS ({'viajes'})</th><th className="px-3 py-2">Resultado</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{cuadre.map(c => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap px-5 py-2 text-xs text-stone-500">{fh(c.fecha)}</td>
                  <td className="px-3 py-2"><Link to={`/activos/${c.activo_id}`} className="font-mono text-xs text-marca hover:underline">{c.codigo}</Link> {unidad(c)}</td>
                  <td className="cifra px-3 py-2 text-right">{num(c.litros, 1)}</td>
                  <td className="cifra px-3 py-2 text-right">{num(c.recorrido, 0)} km</td>
                  <td className="cifra px-3 py-2 text-right">{num(c.km_gps, 0)} km <span className="text-xs text-stone-400">({c.viajes})</span></td>
                  <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ring-1 ${CUADRE[c.estado].c}`}>{CUADRE[c.estado].t}</span></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </section>
      )}
      {ver && <DetalleViaje v={ver} onCerrar={() => setVer(null)} />}
    </div>
  )
}

function IniciarViaje({ activoInicial, onIniciado }: { activoInicial: string | null; onIniciado: () => void }) {
  const { perfil } = useAuth()
  const [activo, setActivo] = useState<ActivoMini | null>(null)
  const [f, setF] = useState({ km: '', destino: '', motivo: '', operador: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { if (perfil?.nombre && !f.operador) setF(x => ({ ...x, operador: perfil.nombre })) }, [perfil]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activoInicial) return
    supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,serie,numero_economico,placa,empresa_id,empresa,categoria,es_vehiculo,estatus,responsable,responsable_id,foto_principal,modelo_foto').eq('id', activoInicial).maybeSingle()
      .then(({ data }) => { if (data) setActivo(data as ActivoMini) })
  }, [activoInicial])

  async function iniciar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!activo) { setErr('Elige la unidad.'); return }
    setBusy(true)
    const pos = await ubicacionActual()
    const km = f.km ? Number(f.km.replace(/[,\s]/g, '')) : null
    const { data, error } = await supabase.rpc('viaje_iniciar', { p_activo: activo.id, p_km: km, p_motivo: f.motivo || null, p_destino: f.destino || null, p_operador: f.operador || null, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null })
    setBusy(false)
    if (error) { setErr(mensajeError(error)); return }
    rastreador.iniciar(String(data), 0, pos ? 1 : 0)
    onIniciado()
  }
  return (
    <form onSubmit={iniciar} className="tarjeta space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Route size={17} className="text-marca" />Iniciar viaje</h2>
      <Campo label="Unidad"><BuscarActivo valor={activo} onElegir={setActivo} soloVehiculos placeholder="Placa, No. económico o código…" /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Kilometraje actual"><input className="campo" inputMode="numeric" placeholder="Opcional" value={f.km} onChange={e => setF({ ...f, km: e.target.value })} /></Campo>
        <Campo label="Operador"><input className="campo" value={f.operador} onChange={e => setF({ ...f, operador: e.target.value })} /></Campo>
      </div>
      <Campo label="Destino"><input className="campo" placeholder="Obra, ciudad, proveedor…" value={f.destino} onChange={e => setF({ ...f, destino: e.target.value })} /></Campo>
      <Campo label="Motivo"><input className="campo" placeholder="Opcional" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} /></Campo>
      {err && <Aviso>{err}</Aviso>}
      <button className="btn-primario w-full justify-center py-3 text-base" disabled={busy}><Play size={18} />{busy ? 'Buscando señal GPS…' : 'Iniciar viaje'}</button>
      <p className="text-[11px] leading-snug text-stone-400">El celular registra la ruta mientras esta pantalla esté abierta. Si se cierra la app, al volver a abrirla el viaje continúa. Pide permiso de ubicación la primera vez.</p>
    </form>
  )
}

function ViajeEnCurso({ v, est, onListo }: { v: Viaje; est: typeof rastreador.estado; onListo: () => void }) {
  const [ahora, setAhora] = useState(Date.now())
  const [km, setKm] = useState(''); const [notas, setNotas] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [cancelar, setCancelar] = useState(false)
  useEffect(() => { const t = window.setInterval(() => setAhora(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  const min = (ahora - new Date(v.inicio).getTime()) / 60000

  async function terminar() {
    setErr(''); setBusy(true)
    await rastreador.enviar()
    const pos = await ubicacionActual()
    const { data, error } = await supabase.rpc('viaje_terminar', { p_viaje: v.id, p_km: km ? Number(km.replace(/[,\s]/g, '')) : null, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_notas: notas || null })
    setBusy(false)
    if (error) { setErr(mensajeError(error)); return }
    void data; rastreador.terminarLocal(); onListo()
  }
  async function cancelarViaje() {
    const { error } = await supabase.rpc('viaje_cancelar', { p_viaje: v.id })
    if (error) { setErr(mensajeError(error)); return }
    rastreador.terminarLocal(); onListo()
  }
  return (
    <section className="tarjeta space-y-3 border-marca/40 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>Viaje en curso</h2>
        <span className="font-mono text-xs text-marca">{v.codigo}</span>
      </div>
      <p className="text-sm text-stone-600">{unidad(v)}{v.destino ? ` → ${v.destino}` : ''}</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-stone-50 p-3"><p className="cifra text-3xl font-semibold">{num(est.km, 1)}</p><p className="text-[11px] text-stone-500">km por GPS</p></div>
        <div className="rounded-xl bg-stone-50 p-3"><p className="cifra text-3xl font-semibold">{dur(min)}</p><p className="text-[11px] text-stone-500">desde {new Date(v.inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p></div>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-stone-500">
        <span className="inline-flex items-center gap-1"><Satellite size={12} />{est.precision != null ? `GPS ±${est.precision} m` : 'Esperando GPS…'}</span>
        {!est.senal && <span className="inline-flex items-center gap-1 text-amber-700"><WifiOff size={12} />Sin internet: {est.pendientes} puntos guardados</span>}
        {est.senal && est.pendientes > 0 && <span>{est.pendientes} puntos por enviar</span>}
      </div>
      {est.error && <Aviso>{est.error}</Aviso>}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">Deja esta pantalla abierta durante el viaje. Si el celular la cierra, ábrela otra vez y el viaje sigue.</p>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Kilometraje final"><input className="campo" inputMode="numeric" placeholder={v.km_inicio != null ? `Mayor a ${num(v.km_inicio, 0)}` : 'Opcional'} value={km} onChange={e => setKm(e.target.value)} /></Campo>
        <Campo label="Notas"><input className="campo" placeholder="Opcional" value={notas} onChange={e => setNotas(e.target.value)} /></Campo>
      </div>
      {err && <Aviso>{err}</Aviso>}
      <button className="btn-primario w-full justify-center py-3 text-base" disabled={busy} onClick={terminar}><Square size={16} />{busy ? 'Terminando…' : 'Terminar viaje'}</button>
      {cancelar ? <p className="flex flex-wrap items-center justify-center gap-2 text-sm">¿Cancelar el viaje?<button className="btn-sec !text-red-600" onClick={cancelarViaje}>Sí, cancelar</button><button className="btn-sec" onClick={() => setCancelar(false)}>No</button></p>
        : <button className="mx-auto flex items-center gap-1 text-xs text-stone-400 hover:text-red-600" onClick={() => setCancelar(true)}><X size={13} />Cancelar viaje</button>}
    </section>
  )
}

function DetalleViaje({ v, onCerrar }: { v: Viaje; onCerrar: () => void }) {
  const [pts, setPts] = useState<{ lat: number; lng: number }[] | null>(null)
  useEffect(() => { supabase.from('viaje_puntos').select('lat,lng').eq('viaje_id', v.id).order('t').limit(5000).then(({ data }) => setPts((data as { lat: number; lng: number }[]) ?? [])) }, [v.id])
  const maps = pts && pts.length > 1 ? (() => {
    const paso = Math.max(1, Math.floor(pts.length / 8)), w = pts.slice(1, -1).filter((_, i) => i % paso === 0).slice(0, 8)
    return `https://www.google.com/maps/dir/?api=1&origin=${pts[0].lat},${pts[0].lng}&destination=${pts[pts.length - 1].lat},${pts[pts.length - 1].lng}${w.length ? `&waypoints=${w.map(p => `${p.lat},${p.lng}`).join('|')}` : ''}`
  })() : null
  const dif = v.km_odometro != null && v.km_gps > 0 ? v.km_odometro - Number(v.km_gps) : null
  return (
    <Modal abierto titulo={`Viaje · ${v.codigo} ${unidad(v)}`} onCerrar={onCerrar} ancho="max-w-3xl">
      {!pts ? <Cargando /> : <RutaMapa puntos={pts} />}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-stone-500">Operador</p><p>{v.operador || '—'}</p></div>
        <div><p className="text-xs text-stone-500">Inicio</p><p>{fh(v.inicio)}</p></div>
        <div><p className="text-xs text-stone-500">Fin</p><p>{v.fin ? fh(v.fin) : 'En curso'}</p></div>
        <div><p className="text-xs text-stone-500">Duración</p><p>{dur(v.minutos)}</p></div>
        <div><p className="text-xs text-stone-500">Km por GPS</p><p className="cifra font-semibold">{num(v.km_gps, 1)}</p></div>
        <div><p className="text-xs text-stone-500">Km odómetro</p><p className="cifra">{num(v.km_odometro, 0)}{v.km_inicio != null ? <span className="text-xs text-stone-400"> ({num(v.km_inicio, 0)} → {num(v.km_fin, 0)})</span> : null}</p></div>
        <div className="col-span-2"><p className="text-xs text-stone-500">Destino / motivo</p><p>{[v.destino, v.motivo].filter(Boolean).join(' · ') || '—'}</p></div>
      </div>
      {dif != null && (Math.abs(dif) > Math.max(5, (v.km_odometro ?? 0) * 0.25)
        ? <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertTriangle size={15} className="shrink-0" />El odómetro marca {num(Math.abs(dif), 0)} km {dif > 0 ? 'más' : 'menos'} que el GPS. Revisa si el GPS se apagó o si la unidad hizo recorridos fuera del viaje.</p>
        : <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 size={14} />El odómetro y el GPS coinciden.</p>)}
      {v.notas && <p className="mt-3 text-sm text-stone-600">{v.notas}</p>}
      {maps && <a href={maps} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-marca hover:underline"><ExternalLink size={14} />Ver ruta en Google Maps</a>}
    </Modal>
  )
}
