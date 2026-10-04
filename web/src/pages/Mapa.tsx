import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MapPin, Plus, Minus, Crosshair, X, ExternalLink, Siren, Boxes, HardHat, Link2, LocateFixed, Search, Building2, Warehouse, Briefcase, Truck } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nombreEmpleado } from '../lib/hooks'
import { Cargando, Aviso } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import { coordenadasDe, linkMaps, num, type Existencia } from '../lib/almacen'

type Ubi = { id: string; nombre: string; tipo: string | null; codigo: string | null; empresa_id: string; latitud: number | null; longitud: number | null; direccion: string | null
  empresas: { nombre: string; nombre_corto: string | null; color: string | null } | null; empleados: { nombres: string; apellidos: string | null } | null }
type Act = { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; estatus: string; ubicacion_id: string | null; modelo_foto: string | null; foto_principal: string | null; categoria: string | null; responsable: string | null }

const W = 1000, H = 640
const TIPOS: Record<string, { texto: string; icono: typeof MapPin }> = { obra: { texto: 'Obra', icono: Building2 }, almacen: { texto: 'Almacén', icono: Warehouse }, oficina: { texto: 'Oficina', icono: Briefcase }, patio: { texto: 'Patio', icono: Truck } }
const LA_PAZ = { minLat: 23.95, maxLat: 24.25, minLng: -110.45, maxLng: -110.2 }

/** Mapa de obras: dónde está cada lugar y cuánto equipo tiene. Dibujado aquí mismo, sin depender de otro servicio. */
export default function Mapa() {
  const { puedeEditar } = useAuth()
  const [ubis, setUbis] = useState<Ubi[] | null>(null)
  const [acts, setActs] = useState<Act[]>([])
  const [conReporte, setConReporte] = useState<Set<string>>(new Set())
  const [ex, setEx] = useState<Existencia[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [empresa, setEmpresa] = useState('')
  const [tipo, setTipo] = useState('')
  const [colocar, setColocar] = useState<string | null>(null)
  const [enlace, setEnlace] = useState('')
  const [error, setError] = useState('')
  const [vista, setVista] = useState({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState<string | null>(null)
  const [inms, setInms] = useState<{ id: string; codigo: string; nombre: string; empresa_id: string; latitud: number; longitud: number; empresas: { color: string | null } | null }[]>([])
  const [verInm, setVerInm] = useState(true)
  const navegar = useNavigate()
  const svg = useRef<SVGSVGElement>(null)
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number; movio: boolean } | null>(null)

  const cargar = () => {
    supabase.from('ubicaciones').select('id,nombre,tipo,codigo,empresa_id,latitud,longitud,direccion,empresas(nombre,nombre_corto,color),empleados(nombres,apellidos)').eq('activo', true).order('nombre')
      .then(({ data }) => setUbis((data as unknown as Ubi[]) ?? []))
  }
  useEffect(() => {
    cargar()
    supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,estatus,ubicacion_id,modelo_foto,foto_principal,categoria,responsable').neq('estatus', 'baja').then(({ data }) => setActs((data as Act[]) ?? []))
    supabase.from('reportes').select('activo_id').in('estatus', ['abierto', 'en_proceso']).then(({ data }) => setConReporte(new Set(((data ?? []) as { activo_id: string }[]).map(r => r.activo_id))))
    supabase.from('v_existencias').select('*').then(({ data }) => setEx((data as Existencia[]) ?? []))
    supabase.from('inmuebles').select('id,codigo,nombre,empresa_id,latitud,longitud,empresas(color)').eq('activo', true).not('latitud', 'is', null).then(({ data }) => setInms((data as never) ?? []))
  }, [])

  const filtradas = useMemo(() => (ubis ?? []).filter(u => (!empresa || u.empresa_id === empresa) && (!tipo || u.tipo === tipo)), [ubis, empresa, tipo])
  const conCoord = filtradas.filter(u => u.latitud != null && u.longitud != null)
  const sinCoord = filtradas.filter(u => u.latitud == null || u.longitud == null)

  // Recuadro geográfico: abarca todos los lugares con coordenadas (de todas las empresas, para que el mapa no brinque al filtrar).
  const caja = useMemo(() => {
    const pts = (ubis ?? []).filter(u => u.latitud != null && u.longitud != null)
    if (pts.length < 2) return LA_PAZ
    let minLat = Math.min(...pts.map(p => p.latitud!)), maxLat = Math.max(...pts.map(p => p.latitud!)), minLng = Math.min(...pts.map(p => p.longitud!)), maxLng = Math.max(...pts.map(p => p.longitud!))
    const pLat = Math.max(0.02, (maxLat - minLat) * 0.18), pLng = Math.max(0.02, (maxLng - minLng) * 0.18)
    minLat -= pLat; maxLat += pLat; minLng -= pLng; maxLng += pLng
    // conserva la proporción real (1° de longitud mide menos que 1° de latitud)
    const cos = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180)
    const ancho = (maxLng - minLng) * cos, alto = maxLat - minLat
    if (ancho / alto < W / H) { const falta = (alto * W / H) / cos - (maxLng - minLng); minLng -= falta / 2; maxLng += falta / 2 }
    else { const falta = (ancho * H / W) - alto; minLat -= falta / 2; maxLat += falta / 2 }
    return { minLat, maxLat, minLng, maxLng }
  }, [ubis])
  const proy = (lat: number, lng: number) => ({ x: ((lng - caja.minLng) / (caja.maxLng - caja.minLng)) * W, y: ((caja.maxLat - lat) / (caja.maxLat - caja.minLat)) * H })
  const desproy = (x: number, y: number) => ({ lat: caja.maxLat - (y / H) * (caja.maxLat - caja.minLat), lng: caja.minLng + (x / W) * (caja.maxLng - caja.minLng) })

  const enLugar = (id: string) => acts.filter(a => a.ubicacion_id === id)
  const maxN = Math.max(1, ...conCoord.map(u => enLugar(u.id).length))

  function aSvg(e: { clientX: number; clientY: number }) {
    const r = svg.current!.getBoundingClientRect()
    const sx = ((e.clientX - r.left) / r.width) * W, sy = ((e.clientY - r.top) / r.height) * H
    return { x: (sx - vista.x) / vista.k, y: (sy - vista.y) / vista.k, sx, sy }
  }
  function zoom(f: number, cx = W / 2, cy = H / 2) {
    setVista(v => { const k = Math.min(8, Math.max(1, v.k * f)); const kk = k / v.k; return k === 1 ? { x: 0, y: 0, k } : { k, x: cx - (cx - v.x) * kk, y: cy - (cy - v.y) * kk } })
  }
  async function guardarCoord(id: string, lat: number, lng: number) {
    setError('')
    const { error } = await supabase.from('ubicaciones').update({ latitud: Number(lat.toFixed(6)), longitud: Number(lng.toFixed(6)) }).eq('id', id)
    if (error) return setError(mensajeError(error))
    setColocar(null); setEnlace(''); setSel(id); cargar()
  }

  if (!ubis) return <Cargando />
  const u = ubis.find(x => x.id === sel) ?? null
  const ua = u ? enLugar(u.id) : []
  const exU = u ? ex.filter(e => e.ubicacion_id === u.id && Number(e.existencia) > 0) : []
  const empresasUsadas = [...new Map(ubis.map(x => [x.empresa_id, x.empresas])).entries()]
  const lineas = (min: number, max: number) => { const paso = (max - min) > 0.6 ? 0.1 : (max - min) > 0.25 ? 0.05 : 0.02; const out: number[] = []; for (let v = Math.ceil(min / paso) * paso; v < max; v += paso) out.push(Number(v.toFixed(3))); return out }
  const colocando = colocar ? ubis.find(x => x.id === colocar) : null

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Mapa de obras</h1>
          <p className="mt-1 text-sm text-stone-500">Cada punto es una obra, almacén u oficina. El tamaño indica cuántos activos tiene; el color, la empresa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="campo !w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Empresa"><option value="">Todas las empresas</option>{empresasUsadas.map(([id, e]) => <option key={id} value={id}>{e?.nombre_corto || e?.nombre}</option>)}</select>
          <select className="campo !w-auto" value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo"><option value="">Todos los tipos</option>{Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t.texto}</option>)}</select>
        </div>
      </div>
      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="tarjeta relative h-fit min-w-0 self-start overflow-hidden p-0">
          {colocando && (
            <div className="absolute inset-x-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-marca/50 bg-[#0E1015]/95 p-2 pl-3 text-sm backdrop-blur">
              <Crosshair size={16} className="text-marca" />
              <span className="min-w-0 flex-1">Toca el mapa donde está <b>{colocando.nombre}</b>, o pega el enlace de Google Maps:</span>
              <form className="flex w-full gap-2 sm:w-auto" onSubmit={e => { e.preventDefault(); const c = coordenadasDe(enlace); if (c) guardarCoord(colocando.id, c.lat, c.lng); else setError('No encontré coordenadas en ese enlace. En Google Maps, mantén presionado el punto y copia los números que aparecen (ej. 24.1426, -110.3128).') }}>
                <input className="campo !py-1.5 text-xs sm:w-64" value={enlace} onChange={e => setEnlace(e.target.value)} placeholder="https://maps.google.com/…@24.14,-110.31 o 24.14, -110.31" />
                <button className="btn-primario !px-3 !py-1.5 text-xs"><Link2 size={13} />Usar</button>
              </form>
              <button onClick={() => setColocar(null)} className="p-1 text-stone-500" aria-label="Cancelar"><X size={16} /></button>
            </div>
          )}
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={`block h-auto w-full touch-none select-none ${colocar ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`} role="img" aria-label="Mapa de ubicaciones"
            onWheel={e => { const p = aSvg(e); zoom(e.deltaY < 0 ? 1.25 : 0.8, p.sx, p.sy) }}
            onPointerDown={e => { arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, movio: false } }}
            onPointerMove={e => {
              const a = arrastre.current; if (!a || vista.k === 1) return
              const r = svg.current!.getBoundingClientRect(); const dx = (e.clientX - a.x) * W / r.width, dy = (e.clientY - a.y) * H / r.height
              if (Math.abs(dx) + Math.abs(dy) > 4) a.movio = true
              setVista(v => ({ ...v, x: a.vx + dx, y: a.vy + dy }))
            }}
            onPointerUp={e => {
              const a = arrastre.current; arrastre.current = null
              if (a?.movio) return
              if (colocar) { const p = aSvg(e); const c = desproy(p.x, p.y); guardarCoord(colocar, c.lat, c.lng) }
            }}>
            <defs>
              <radialGradient id="fondo-mapa" cx="50%" cy="45%" r="75%"><stop offset="0" stopColor="#14171E" /><stop offset="1" stopColor="#07080B" /></radialGradient>
              <linearGradient id="barrido" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#F9B234" stopOpacity="0" /><stop offset="1" stopColor="#F9B234" stopOpacity=".22" /></linearGradient>
              <filter id="brillo-pin" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6" /></filter>
            </defs>
            <rect width={W} height={H} fill="url(#fondo-mapa)" />
            <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.k})`}>
              {/* retícula de coordenadas reales */}
              {lineas(caja.minLng, caja.maxLng).map(l => { const x = proy(caja.minLat, l).x; return <g key={'x' + l}><line x1={x} x2={x} y1={0} y2={H} stroke="#F9B234" strokeOpacity=".07" strokeWidth={1 / vista.k} /><text x={x + 4 / vista.k} y={H - 8 / vista.k} fontSize={10 / vista.k} fill="#6b6f78" fontFamily="ui-monospace,monospace">{Math.abs(l).toFixed(2)}°O</text></g> })}
              {lineas(caja.minLat, caja.maxLat).map(l => { const y = proy(l, caja.minLng).y; return <g key={'y' + l}><line x1={0} x2={W} y1={y} y2={y} stroke="#F9B234" strokeOpacity=".07" strokeWidth={1 / vista.k} /><text x={6 / vista.k} y={y - 4 / vista.k} fontSize={10 / vista.k} fill="#6b6f78" fontFamily="ui-monospace,monospace">{l.toFixed(2)}°N</text></g> })}
              {[120, 220, 320].map(r => <circle key={r} cx={W / 2} cy={H / 2} r={r} fill="none" stroke="#F9B234" strokeOpacity=".08" strokeWidth={1 / vista.k} strokeDasharray={`${4 / vista.k} ${6 / vista.k}`} />)}
              <g>
                <animateTransform attributeName="transform" type="rotate" from={`0 ${W / 2} ${H / 2}`} to={`360 ${W / 2} ${H / 2}`} dur="9s" repeatCount="indefinite" />
                <path d={`M${W / 2} ${H / 2} L${W / 2 + 340} ${H / 2 - 60} A345 345 0 0 1 ${W / 2 + 340} ${H / 2 + 60} Z`} fill="url(#barrido)" opacity=".5" />
              </g>
              {/* inmuebles: rombos */}
              {verInm && inms.filter(x => x.latitud != null && (!empresa || x.empresa_id === empresa)).map(x => { const p = proy(Number(x.latitud), Number(x.longitud)); const t = 7 / Math.sqrt(vista.k); return (
                <g key={x.id} transform={`translate(${p.x} ${p.y})`} className="cursor-pointer" onPointerUp={e => { if (!colocar && !arrastre.current?.movio) { e.stopPropagation(); arrastre.current = null; navegar(`/inmuebles/${x.id}`) } }}>
                  <title>{`${x.codigo} · ${x.nombre}`}</title>
                  <rect x={-t} y={-t} width={t * 2} height={t * 2} transform="rotate(45)" fill="#07080B" stroke={x.empresas?.color ?? '#F9B234'} strokeWidth={2 / vista.k} />
                  <rect x={-t / 2.4} y={-t / 2.4} width={t / 1.2} height={t / 1.2} transform="rotate(45)" fill={x.empresas?.color ?? '#F9B234'} />
                </g>
              ) })}
              {/* pines */}
              {[...conCoord].sort((a, b) => enLugar(b.id).length - enLugar(a.id).length).map(x => {
                const p = proy(x.latitud!, x.longitud!)
                const n = enLugar(x.id).length
                const r = (7 + Math.sqrt(n / maxN) * 16) / Math.sqrt(vista.k)
                const color = x.empresas?.color || '#F9B234'
                const alerta = enLugar(x.id).some(a => conReporte.has(a.id))
                const activo = sel === x.id || hover === x.id
                return (
                  <g key={x.id} transform={`translate(${p.x} ${p.y})`} className="cursor-pointer" onPointerUp={e => { if (!colocar && !arrastre.current?.movio) { e.stopPropagation(); arrastre.current = null; setSel(x.id) } }} onPointerEnter={() => setHover(x.id)} onPointerLeave={() => setHover(null)}>
                    <circle r={r * 1.8} fill={color} opacity={activo ? .35 : .18} filter="url(#brillo-pin)" />
                    {alerta && <circle r={r + 5 / vista.k} fill="none" stroke="#ef4444" strokeWidth={2 / vista.k}><animate attributeName="r" values={`${r};${r + 14 / vista.k}`} dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" values="1;0" dur="1.6s" repeatCount="indefinite" /></circle>}
                    <circle r={r} fill={color} fillOpacity=".9" stroke={activo ? '#fff' : '#07080B'} strokeWidth={(activo ? 2.5 : 2) / vista.k} />
                    {n > 0 && <text textAnchor="middle" dy=".35em" fontSize={Math.max(9, r * 0.9)} fontWeight={700} fill="#0b0d11" fontFamily="system-ui">{n}</text>}
                    {(activo || vista.k >= 2 || n >= maxN * 0.6) && (
                      <g transform={`translate(${r + 6 / vista.k} 0)`}>
                        <text dy=".35em" fontSize={12 / vista.k} fill="#e7e5e4" stroke="#07080B" strokeWidth={3 / vista.k} paintOrder="stroke" fontFamily="system-ui" fontWeight={600}>{x.codigo || x.nombre}</text>
                      </g>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
          <div className="absolute right-3 top-3 flex flex-col gap-1 sm:bottom-3 sm:top-auto">
            {([[Plus, () => zoom(1.4), 'Acercar'], [Minus, () => zoom(1 / 1.4), 'Alejar'], [LocateFixed, () => setVista({ x: 0, y: 0, k: 1 }), 'Ver todo']] as const).map(([I, f, t]) => (
              <button key={t} onClick={f} title={t} aria-label={t} className="grid h-8 w-8 place-items-center rounded-xl border sm:h-9 sm:w-9 border-stone-300 bg-[#0E1015]/90 text-stone-500 backdrop-blur transition hover:border-marca hover:text-marca"><I size={16} /></button>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-stone-200 px-3 py-2 text-[10px] text-stone-500 sm:absolute sm:bottom-3 sm:left-3 sm:max-w-[70%] sm:rounded-xl sm:border-0 sm:bg-[#07080B]/80 sm:backdrop-blur">
            {empresasUsadas.filter(([id]) => conCoord.some(x => x.empresa_id === id)).map(([id, e]) => <span key={id} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: e?.color ?? '#F9B234' }} />{e?.nombre_corto || e?.nombre}</span>)}
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-red-500" />con reporte abierto</span>
            {inms.length > 0 && <button onClick={() => setVerInm(v => !v)} className={`inline-flex items-center gap-1 ${verInm ? '' : 'line-through opacity-60'}`}><span className="h-2 w-2 rotate-45 border border-marca" />inmuebles</button>}
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          {u ? (
            <div className="tarjeta animate-entrar p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: u.empresas?.color ?? '#F9B234', boxShadow: `0 0 12px ${u.empresas?.color ?? '#F9B234'}` }} />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] text-marca">{u.codigo}</p>
                  <h2 className="font-semibold leading-tight">{u.nombre}</h2>
                  <p className="text-xs text-stone-500">{[TIPOS[u.tipo ?? '']?.texto ?? u.tipo, u.empresas?.nombre_corto || u.empresas?.nombre].filter(Boolean).join(' · ')}</p>
                  {u.empleados && <p className="mt-1 text-xs text-stone-500">Responsable: {nombreEmpleado(u.empleados)}</p>}
                </div>
                <button onClick={() => setSel(null)} className="p-1 text-stone-400" aria-label="Cerrar"><X size={16} /></button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {([[Boxes, 'Activos', ua.length], [Siren, 'Reportes', ua.filter(a => conReporte.has(a.id)).length], [HardHat, 'Material', exU.length]] as const).map(([I, t, n]) => (
                  <div key={t} className="rounded-xl bg-stone-50 p-2"><I size={14} className={`mx-auto ${t === 'Reportes' && n ? 'text-red-700' : 'text-marca'}`} /><p className="cifra text-lg font-semibold">{n}</p><p className="text-[10px] uppercase tracking-wider text-stone-500">{t}</p></div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {u.latitud != null && <a className="btn-sec !px-3 !py-1.5 text-xs" href={linkMaps(u.latitud, u.longitud!)} target="_blank" rel="noreferrer"><ExternalLink size={13} />Cómo llegar</a>}
                <Link className="btn-sec !px-3 !py-1.5 text-xs" to={`/activos?ubicacion=${u.id}`}><Boxes size={13} />Ver activos</Link>
                {puedeEditar && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => setColocar(u.id)}><Crosshair size={13} />Mover punto</button>}
              </div>
              {u.latitud != null && <p className="mt-2 select-all font-mono text-[10px] text-stone-400">{u.latitud.toFixed(5)}, {u.longitud!.toFixed(5)}</p>}
              <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
                {ua.map(a => (
                  <li key={a.id}><Link to={`/activos/${a.id}`} className="flex items-center gap-2 rounded-xl border border-stone-200 p-1.5 transition hover:border-marca/50">
                    <FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} className="h-9 w-10 shrink-0 rounded-lg" icono={14} />
                    <span className="min-w-0 flex-1"><span className="block font-mono text-[10px] text-marca">{a.codigo}</span><span className="block truncate text-xs">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</span></span>
                    {conReporte.has(a.id) && <Siren size={13} className="shrink-0 text-red-700" />}
                  </Link></li>
                ))}
                {exU.map(e => <li key={e.consumible_id + e.empresa_id} className="flex items-center gap-2 px-1.5 text-xs text-stone-500"><HardHat size={12} /><span className="min-w-0 flex-1 truncate">{e.nombre}</span><span className="cifra">{num(e.existencia)}</span></li>)}
              </ul>
            </div>
          ) : <Lista ubis={conCoord} n={x => enLugar(x).length} onSel={setSel} />}

          {sinCoord.length > 0 && (
            <div className="tarjeta p-4">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><MapPin size={15} className="text-stone-400" />Sin ubicar en el mapa · {sinCoord.length}</h3>
              <p className="mb-3 text-xs text-stone-500">{puedeEditar ? 'Toca “Ubicar” y luego el punto en el mapa, o pega el enlace de Google Maps.' : 'Un administrador puede colocarlos.'}</p>
              <ul className="space-y-1.5">
                {sinCoord.map(x => (
                  <li key={x.id} className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.empresas?.color ?? '#F9B234' }} />
                    <span className="min-w-0 flex-1 truncate">{x.nombre}</span>
                    {puedeEditar && <button className={`btn-sec !px-2.5 !py-1 text-xs ${colocar === x.id ? '!border-marca text-marca' : ''}`} onClick={() => { setColocar(x.id); setSel(null) }}><Crosshair size={12} />Ubicar</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function Lista({ ubis, n, onSel }: { ubis: Ubi[]; n: (id: string) => number; onSel: (id: string) => void }) {
  const [q, setQ] = useState('')
  const vis = ubis.filter(u => !q || [u.nombre, u.codigo, u.empresas?.nombre_corto].some(x => x?.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => n(b.id) - n(a.id))
  return (
    <div className="tarjeta p-4">
      <div className="relative mb-3"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar obra o almacén…" /></div>
      <ul className="max-h-[420px] space-y-1 overflow-y-auto">
        {vis.map(u => { const T = TIPOS[u.tipo ?? '']?.icono ?? MapPin; return (
          <li key={u.id}><button onClick={() => onSel(u.id)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-stone-100">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${u.empresas?.color ?? '#F9B234'}22`, color: u.empresas?.color ?? '#F9B234' }}><T size={15} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm">{u.nombre}</span><span className="block text-[11px] text-stone-500">{u.empresas?.nombre_corto || u.empresas?.nombre}</span></span>
            <span className="cifra text-sm font-semibold">{n(u.id)}</span>
          </button></li>
        ) })}
      </ul>
    </div>
  )
}
