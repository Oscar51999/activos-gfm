import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Car, Check, X, Camera, Loader2, Fuel, Gauge, ClipboardCheck, CircleAlert, CheckCircle2, Plus } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fecha } from '../lib/hooks'
import { PUNTOS, tipoEquipo, unidadLectura } from '../lib/mantenimiento'
import { Encabezado, Campo, Modal, Aviso, Cargando, Vacio } from '../components/ui'
import { BuscarActivo, fotoADataUrl, type ActivoMini } from '../components/Buscadores'

const LADOS = ['Frente', 'Atrás', 'Lado izquierdo', 'Lado derecho', 'Tablero (km)']
const ZONAS = ['Defensa delantera', 'Cofre', 'Parabrisas', 'Faros', 'Puerta delantera izq.', 'Puerta trasera izq.', 'Puerta delantera der.', 'Puerta trasera der.', 'Costado izquierdo', 'Costado derecho', 'Espejos', 'Techo', 'Caja / batea', 'Defensa trasera', 'Calaveras', 'Rines / llantas']
const COMBUSTIBLE: [number, string][] = [[0, 'Reserva'], [25, '¼'], [50, '½'], [75, '¾'], [100, 'Lleno']]
type Check_ = { id: string; activo_id: string; operador: string; lectura: number | null; combustible: number | null; respuestas: { punto: string; ok: boolean; nota: string }[]; golpes: { zona: string; nota: string }[]
  fotos: { lado: string; foto: string }[]; todo_ok: boolean; reporte_id: string | null; created_at: string; activos: { codigo: string; descripcion: string } | null; reportes: { folio: string } | null }
type Veh = { id: string; codigo: string; descripcion: string; placa: string | null; responsable: string | null; empresa: string }

const hoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }

/** Checklist vehicular desde el celular: fotos de los 4 lados, kilometraje, combustible, puntos de revisión y golpes nuevos. */
export default function ChecklistVehicular() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'nuevo' | 'hoy' | 'historial'>(params.get('activo') ? 'nuevo' : 'hoy')
  const [n, setN] = useState(0)
  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo="Checklist vehicular" sub="Revisión diaria desde el celular. El kilometraje alimenta el mantenimiento y lo que salga mal abre un reporte."
        acciones={tab !== 'nuevo' ? <button className="btn-primario" onClick={() => setTab('nuevo')}><Plus size={16} />Nuevo checklist</button> : undefined} />
      <div className="mb-5 flex overflow-hidden rounded-xl border border-stone-200 text-sm sm:w-fit">
        {([['nuevo', 'Nuevo'], ['hoy', 'Hoy'], ['historial', 'Historial']] as const).map(([k, t]) => <button key={k} onClick={() => setTab(k)} className={`flex-1 px-4 py-2 ${tab === k ? 'bg-marca/15 text-marca' : 'text-stone-500 hover:bg-stone-100'}`}>{t}</button>)}
      </div>
      {tab === 'nuevo' && <NuevoChecklist key={n} activoInicial={params.get('activo')} onOtro={() => setN(x => x + 1)} />}
      {tab === 'hoy' && <Hoy onNuevo={() => setTab('nuevo')} />}
      {tab === 'historial' && <Historial />}
    </div>
  )
}

function NuevoChecklist({ activoInicial, onOtro }: { activoInicial: string | null; onOtro: () => void }) {
  const { perfil } = useAuth()
  const [veh, setVeh] = useState<ActivoMini | null>(null)
  const [ultima, setUltima] = useState<number | null>(null)
  const [operador, setOperador] = useState('')
  const [lectura, setLectura] = useState('')
  const [comb, setComb] = useState<number | null>(null)
  const [res, setRes] = useState<Record<string, { ok: boolean; nota: string }>>({})
  const [golpes, setGolpes] = useState<Record<string, string>>({})
  const [fotos, setFotos] = useState<Record<string, string>>({})
  const [cargandoFoto, setCargandoFoto] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const lado = useRef('')

  useEffect(() => { if (activoInicial) supabase.from('v_activos').select('*').eq('id', activoInicial).single().then(({ data }) => data && setVeh(data as unknown as ActivoMini)) }, [activoInicial])
  const tipo = veh ? (tipoEquipo(veh.categoria, veh.es_vehiculo) === 'maquinaria' ? 'maquinaria' : 'vehiculo') : 'vehiculo'
  const puntos = PUNTOS[tipo]
  const unidad = unidadLectura(tipo)
  useEffect(() => {
    setRes(Object.fromEntries(puntos.map(p => [p, { ok: true, nota: '' }])))
    setUltima(null)
    if (!veh) return
    setOperador(veh.responsable || perfil?.nombre || '')
    supabase.from('lecturas').select('valor').eq('activo_id', veh.id).eq('tipo', unidad).order('valor', { ascending: false }).limit(1).then(({ data }) => setUltima((data?.[0] as { valor: number } | undefined)?.valor ?? null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veh?.id])

  async function tomar(files: FileList | null) {
    const a = files?.[0]; const l = lado.current
    if (!a || !l) return
    setCargandoFoto(l)
    try { const d = await fotoADataUrl(a, 1000, 0.7); setFotos(f => ({ ...f, [l]: d })) } catch { setError('No se pudo leer la foto.') }
    setCargandoFoto(null); if (input.current) input.current.value = ''
  }
  const fallas = puntos.filter(p => res[p] && !res[p].ok)
  const nGolpes = Object.keys(golpes).length
  const menor = lectura !== '' && ultima != null && Number(lectura) < ultima

  async function enviar() {
    setError('')
    if (!veh) return setError('Elige el vehículo.')
    if (!operador.trim()) return setError('Escribe el nombre de quien maneja.')
    if (lectura === '') return setError(unidad === 'km' ? 'Captura el kilometraje.' : 'Captura el horómetro.')
    if (menor) return setError(`El ${unidad === 'km' ? 'kilometraje' : 'horómetro'} no puede ser menor al último (${ultima}).`)
    setEnviando(true)
    const { data, error } = await supabase.rpc('registrar_checklist_vehicular', {
      p_activo: veh.id, p_operador: operador.trim(), p_empleado: veh.responsable_id, p_lectura: Number(lectura), p_combustible: comb,
      p_respuestas: puntos.map(p => ({ punto: p, ok: res[p].ok, nota: res[p].nota })), p_golpes: Object.entries(golpes).map(([zona, nota]) => ({ zona, nota })),
      p_fotos: Object.entries(fotos).map(([l, foto]) => ({ lado: l, foto })),
    })
    setEnviando(false)
    if (error) setError(mensajeError(error)); else setHecho(data as string)
  }

  if (hecho) return (
    <div className="tarjeta py-10 text-center">
      <div className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full ring-1 ${hecho !== 'ok' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>{hecho !== 'ok' ? <ClipboardCheck size={28} /> : <Check size={30} />}</div>
      <p className="text-lg font-semibold">{hecho !== 'ok' ? 'Checklist enviado con observaciones' : '¡Todo en orden! Buen camino'}</p>
      <p className="mt-1 text-sm text-stone-500">{hecho !== 'ok' ? <>Se abrió el reporte <span className="font-mono text-marca">{hecho}</span> para que lo revisen.</> : `Quedó registrado con ${lectura} ${unidad}.`}</p>
      <button className="btn-primario mt-5" onClick={onOtro}><Plus size={16} />Otro checklist</button>
    </div>
  )

  return (
    <div className="space-y-4">
      <section className="tarjeta space-y-4 p-4 sm:p-5">
        <Campo label="Vehículo *"><BuscarActivo valor={veh} onElegir={setVeh} soloVehiculos placeholder="Placa, no. económico o descripción…" /></Campo>
        {veh && <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Quién maneja *"><input className="campo" value={operador} onChange={e => setOperador(e.target.value)} /></Campo>
          <Campo label={`${unidad === 'km' ? 'Kilometraje (odómetro)' : 'Horómetro'} *`}>
            <div className="relative"><Gauge size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input className={`campo !pl-9 ${menor ? '!border-red-400' : ''}`} type="number" min="0" step="1" inputMode="numeric" value={lectura} onChange={e => setLectura(e.target.value)} placeholder={ultima != null ? `Último: ${ultima.toLocaleString('es-MX')}` : 'Ej. 48250'} /></div>
            {ultima != null && lectura !== '' && !menor && <span className="mt-1 block text-[11px] text-stone-500">+{(Number(lectura) - ultima).toLocaleString('es-MX')} {unidad} desde el último registro</span>}
          </Campo>
          <div className="sm:col-span-2"><span className="etiqueta flex items-center gap-1.5"><Fuel size={13} />Combustible</span>
            <div className="grid grid-cols-5 overflow-hidden rounded-xl border border-stone-300 text-sm">
              {COMBUSTIBLE.map(([v, t], i) => <button key={v} type="button" onClick={() => setComb(v)} className={`py-2.5 ${i ? 'border-l border-stone-300' : ''} ${comb === v ? (v === 0 ? 'bg-red-50 text-red-700' : 'bg-marca/15 font-medium text-marca') : 'text-stone-500'}`}>{t}</button>)}
            </div>
          </div>
        </div>}
      </section>

      {veh && <>
        <section className="tarjeta p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Camera size={15} className="text-marca" />Fotos del vehículo</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {LADOS.map(l => (
              <button key={l} type="button" onClick={() => { lado.current = l; input.current?.click() }} className={`relative aspect-[4/3] overflow-hidden rounded-xl border text-xs ${fotos[l] ? 'border-marca/50' : 'border-dashed border-stone-300 text-stone-500 hover:border-marca hover:text-marca'}`}>
                {fotos[l] ? <img src={fotos[l]} alt={l} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center">{cargandoFoto === l ? <Loader2 size={18} className="animate-spin" /> : <span className="flex flex-col items-center gap-1"><Camera size={18} />{l}</span>}</span>}
                {fotos[l] && <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-0.5 text-[10px] text-white">{l}</span>}
              </button>
            ))}
          </div>
          <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => tomar(e.target.files)} />
        </section>

        <section className="tarjeta p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold">Revisión</h2>
          <ul className="space-y-1.5">
            {puntos.map(p => res[p] && (
              <li key={p} className={`rounded-xl border p-2.5 ${res[p].ok ? 'border-stone-200' : 'border-red-200 bg-red-50/40'}`}>
                <div className="flex items-center gap-3"><span className="min-w-0 flex-1 text-sm">{p}</span>
                  <div className="flex shrink-0 overflow-hidden rounded-lg border border-stone-300 text-xs">
                    <button type="button" onClick={() => setRes(r => ({ ...r, [p]: { ...r[p], ok: true } }))} className={`px-3 py-1.5 ${res[p].ok ? 'bg-emerald-50 text-emerald-700' : 'text-stone-500'}`}><Check size={13} className="inline" /> Bien</button>
                    <button type="button" onClick={() => setRes(r => ({ ...r, [p]: { ...r[p], ok: false } }))} className={`border-l border-stone-300 px-3 py-1.5 ${!res[p].ok ? 'bg-red-50 text-red-700' : 'text-stone-500'}`}><X size={13} className="inline" /> Falla</button>
                  </div></div>
                {!res[p].ok && <input className="campo mt-2 !py-1.5 text-xs" placeholder="¿Qué tiene?" value={res[p].nota} onChange={e => setRes(r => ({ ...r, [p]: { ...r[p], nota: e.target.value } }))} />}
              </li>
            ))}
          </ul>
        </section>

        <section className="tarjeta p-4 sm:p-5">
          <h2 className="mb-1 text-sm font-semibold">Golpes o daños nuevos</h2>
          <p className="mb-3 text-xs text-stone-500">Toca la zona solo si hay algo que no estaba antes.</p>
          <div className="flex flex-wrap gap-1.5">
            {ZONAS.map(z => { const on = z in golpes; return <button key={z} type="button" onClick={() => setGolpes(g => { const x = { ...g }; if (on) delete x[z]; else x[z] = ''; return x })} className={`rounded-full border px-3 py-1.5 text-xs ${on ? 'border-red-300 bg-red-50 text-red-700' : 'border-stone-200 text-stone-600 hover:border-stone-300'}`}>{z}</button> })}
          </div>
          {nGolpes > 0 && <div className="mt-3 space-y-2">{Object.keys(golpes).map(z => <input key={z} className="campo !py-1.5 text-xs" placeholder={`${z}: ¿qué pasó?`} value={golpes[z]} onChange={e => setGolpes(g => ({ ...g, [z]: e.target.value }))} />)}</div>}
        </section>

        {error && <Aviso>{error}</Aviso>}
        <div className="sticky bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-10 lg:bottom-3 flex items-center gap-3 rounded-2xl border border-stone-200 bg-panel/95 p-3 shadow-xl backdrop-blur">
          <p className="min-w-0 flex-1 text-xs text-stone-500">{fallas.length || nGolpes ? <span className="text-amber-700">{[fallas.length && `${fallas.length} falla(s)`, nGolpes && `${nGolpes} golpe(s)`].filter(Boolean).join(' y ')}: se abrirá un reporte.</span> : 'Todo en orden.'} {Object.keys(fotos).length}/5 fotos.</p>
          <button className="btn-primario" onClick={enviar} disabled={enviando}><Check size={16} />{enviando ? 'Enviando…' : 'Enviar'}</button>
        </div>
      </>}
    </div>
  )
}

function Hoy({ onNuevo }: { onNuevo: () => void }) {
  const [vehs, setVehs] = useState<Veh[] | null>(null)
  const [hoy, setHoy] = useState<Check_[]>([])
  const [ver, setVer] = useState<Check_ | null>(null)
  useEffect(() => {
    supabase.from('v_activos').select('id,codigo,descripcion,placa,responsable,empresa').eq('es_vehiculo', true).neq('estatus', 'baja').is('montado_en', null).order('codigo').then(({ data }) => setVehs((data as Veh[]) ?? []))
    supabase.from('checklists').select('*,activos(codigo,descripcion),reportes(folio)').gte('created_at', hoy0()).order('created_at', { ascending: false }).then(({ data }) => setHoy((data as unknown as Check_[]) ?? []))
  }, [])
  const por = useMemo(() => { const m = new Map<string, Check_>(); for (const c of hoy) if (!m.has(c.activo_id)) m.set(c.activo_id, c); return m }, [hoy])
  if (!vehs) return <Cargando />
  if (!vehs.length) return <div className="tarjeta"><Vacio titulo="No hay vehículos registrados" /></div>
  const hechos = vehs.filter(v => por.has(v.id)).length
  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="tarjeta p-4"><p className="text-[11px] uppercase tracking-wider text-stone-500">Hechos hoy</p><p className="cifra text-3xl font-semibold">{hechos}<span className="text-base text-stone-400"> / {vehs.length}</span></p></div>
        <div className="tarjeta p-4"><p className="text-[11px] uppercase tracking-wider text-stone-500">Con observaciones</p><p className="cifra text-3xl font-semibold text-amber-600">{[...por.values()].filter(c => !c.todo_ok).length}</p></div>
        <div className="tarjeta p-4"><p className="text-[11px] uppercase tracking-wider text-stone-500">Pendientes</p><p className="cifra text-3xl font-semibold">{vehs.length - hechos}</p></div>
      </div>
      <ul className="tarjeta divide-y divide-stone-200">
        {vehs.map(v => { const c = por.get(v.id); return (
          <li key={v.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${!c ? 'bg-stone-100 text-stone-400' : c.todo_ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{!c ? <Car size={17} /> : c.todo_ok ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{v.descripcion}</p><p className="truncate text-xs text-stone-500"><span className="font-mono">{v.codigo}</span>{[v.placa, v.responsable].filter(Boolean).map(x => ` · ${x}`).join('')}</p></div>
            {c ? <button className="text-right text-xs text-stone-500 hover:text-marca" onClick={() => setVer(c)}>{new Date(c.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}<span className="block">{c.lectura != null ? `${c.lectura.toLocaleString('es-MX')} km` : ''}</span></button>
              : <Link to={`/checklist-vehicular?activo=${v.id}`} onClick={onNuevo} className="btn-sec !px-3 !py-1.5 text-xs">Hacer</Link>}
          </li>) })}
      </ul>
      {ver && <VerChecklist c={ver} onCerrar={() => setVer(null)} />}
    </div>
  )
}

function Historial() {
  const [lista, setLista] = useState<Check_[] | null>(null)
  const [veh, setVeh] = useState<ActivoMini | null>(null)
  const [ver, setVer] = useState<Check_ | null>(null)
  useEffect(() => {
    let q = supabase.from('checklists').select('*,activos(codigo,descripcion),reportes(folio)').order('created_at', { ascending: false }).limit(100)
    if (veh) q = q.eq('activo_id', veh.id)
    q.then(({ data }) => setLista((data as unknown as Check_[]) ?? []))
  }, [veh])
  return (
    <div>
      <div className="mb-4 sm:max-w-md"><BuscarActivo valor={veh} onElegir={setVeh} soloVehiculos placeholder="Filtrar por vehículo…" /></div>
      {!lista ? <Cargando /> : lista.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin checklists" /></div> : (
        <ul className="tarjeta divide-y divide-stone-200">
          {lista.map(c => (
            <li key={c.id}><button onClick={() => setVer(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50">
              {c.fotos[0] ? <img src={c.fotos[0].foto} alt="" className="h-11 w-14 shrink-0 rounded-lg object-cover" /> : <span className="grid h-11 w-14 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-400"><Car size={17} /></span>}
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.activos?.descripcion} <span className="font-mono text-xs text-stone-500">{c.activos?.codigo}</span></p>
                <p className="truncate text-xs text-stone-500">{fecha(c.created_at)} {new Date(c.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {c.operador}{c.lectura != null ? ` · ${c.lectura.toLocaleString('es-MX')} km` : ''}</p></div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${c.todo_ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>{c.todo_ok ? 'Bien' : c.reportes?.folio ?? 'Observaciones'}</span>
            </button></li>
          ))}
        </ul>
      )}
      {ver && <VerChecklist c={ver} onCerrar={() => setVer(null)} />}
    </div>
  )
}

function VerChecklist({ c, onCerrar }: { c: Check_; onCerrar: () => void }) {
  const fallas = c.respuestas.filter(r => !r.ok)
  return (
    <Modal abierto titulo={`${c.activos?.codigo ?? ''} · ${fecha(c.created_at)}`} onCerrar={onCerrar}>
      <p className="mb-3 text-sm">{c.activos?.descripcion} · {c.operador}{c.lectura != null ? ` · ${c.lectura.toLocaleString('es-MX')} km` : ''}{c.combustible != null ? ` · combustible ${COMBUSTIBLE.find(x => x[0] === c.combustible)?.[1] ?? c.combustible + '%'}` : ''}</p>
      {c.fotos.length > 0 && <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{c.fotos.map((f, i) => <figure key={i}><img src={f.foto} alt={f.lado} className="aspect-[4/3] w-full rounded-lg object-cover" /><figcaption className="mt-0.5 text-[11px] text-stone-500">{f.lado}</figcaption></figure>)}</div>}
      {fallas.length === 0 && c.golpes.length === 0 ? <Aviso tipo="ok">Todo en orden.</Aviso> : <div className="space-y-2">
        {fallas.length > 0 && <Aviso><b>Fallas:</b> {fallas.map(r => r.punto + (r.nota ? ` (${r.nota})` : '')).join(', ')}</Aviso>}
        {c.golpes.length > 0 && <Aviso><b>Golpes nuevos:</b> {c.golpes.map(g => g.zona + (g.nota ? ` (${g.nota})` : '')).join(', ')}</Aviso>}
        {c.reportes && <Link to="/reportes" className="block text-sm text-marca">Ver reporte {c.reportes.folio} →</Link>}
      </div>}
    </Modal>
  )
}
