import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Plus, Minus, Maximize2, Crosshair, X, Boxes, Siren, Building2, Warehouse, Briefcase, Truck, ChevronLeft, ExternalLink, Link2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nombreEmpleado } from '../lib/hooks'
import { coordenadasDe, linkMaps } from '../lib/almacen'
import { MX, ESTADOS_MX, proyectarMx, desproyectarMx } from '../lib/mapaMexico'
import { Modal, Campo, Aviso } from './ui'

type Ubi = { id: string; nombre: string; tipo: string | null; codigo: string | null; empresa_id: string; latitud: number | null; longitud: number | null
  empresas: { nombre: string; nombre_corto: string | null; color: string | null } | null; empleados: { nombres: string; apellidos: string | null } | null }
type Caja = { x: number; y: number; w: number; h: number }
type Lugar = Ubi & { x: number; y: number; estado: string | null; equipos: number; reportes: number }

const TIPOS: Record<string, { texto: string; icono: typeof MapPin }> = { obra: { texto: 'Obras', icono: Building2 }, almacen: { texto: 'Almacenes', icono: Warehouse }, oficina: { texto: 'Oficinas', icono: Briefcase }, patio: { texto: 'Patios', icono: Truck } }
const TIPO1: Record<string, string> = { obra: 'Obra', almacen: 'Almacén', oficina: 'Oficina', patio: 'Patio', taller: 'Taller', sitio: 'Sitio' }
const TODO: Caja = { x: 0, y: 0, w: MX.W, h: MX.H }

// Polígonos de cada estado (ya proyectados) para saber en qué estado cae cada obra y para hacer zoom al estado.
const ANILLOS = ESTADOS_MX.map(e => e.d.split('Z').filter(Boolean).map(r => r.replace('M', '').split('L').map(p => p.split(',').map(Number) as [number, number])))
const CAJAS = ANILLOS.map(rs => { const ps = rs.flat(); const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } })
function dentro(x: number, y: number, r: [number, number][]) {
  let s = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) s = !s
  return s
}
function estadoDe(x: number, y: number): string | null {
  const i = ANILLOS.findIndex(rs => rs.some(r => dentro(x, y, r)))
  if (i >= 0) return ESTADOS_MX[i].n
  // en la costa el contorno simplificado puede dejar el punto afuera: toma el estado más cercano
  let mejor = -1, d = Infinity
  CAJAS.forEach((c, k) => { const dx = Math.max(c.x - x, 0, x - c.x - c.w), dy = Math.max(c.y - y, 0, y - c.y - c.h), dd = dx * dx + dy * dy; if (dd < d) { d = dd; mejor = k } })
  return d < 400 ? ESTADOS_MX[mejor].n : null
}
/** Caja con la proporción del mapa y margen, centrada en lo que se quiere ver. */
function encuadre(c: Caja, margen = 0.18): Caja {
  let w = Math.max(c.w * (1 + 2 * margen), 40), h = Math.max(c.h * (1 + 2 * margen), 40 * MX.H / MX.W)
  if (w / h > MX.W / MX.H) h = w * MX.H / MX.W; else w = h * MX.W / MX.H
  return { x: c.x + c.w / 2 - w / 2, y: c.y + c.h / 2 - h / 2, w, h }
}

/** Mapa de la República con los lugares donde hay obra. Toca un estado para acercarte y una obra para ver su equipo. */
export default function MapaMexico({ empresaId }: { empresaId?: string }) {
  const { puedeEditar } = useAuth()
  const [ubis, setUbis] = useState<Ubi[] | null>(null)
  const [equipos, setEquipos] = useState<Map<string, number>>(new Map())
  const [reportes, setReportes] = useState<Map<string, number>>(new Map())
  const [empresa, setEmpresa] = useState(empresaId ?? '')
  const [tipo, setTipo] = useState('')
  const [estado, setEstado] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [vb, setVb] = useState<Caja>(TODO)
  const [marcar, setMarcar] = useState(false)
  const [punto, setPunto] = useState<{ lat: number; lng: number; estado: string | null } | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const anim = useRef(0)

  const cargar = () => {
    supabase.from('ubicaciones').select('id,nombre,tipo,codigo,empresa_id,latitud,longitud,empresas(nombre,nombre_corto,color),empleados(nombres,apellidos)').eq('activo', true).order('nombre')
      .then(({ data }) => setUbis((data as unknown as Ubi[]) ?? []))
  }
  useEffect(() => {
    cargar()
    supabase.from('v_activos').select('id,ubicacion_id').neq('estatus', 'baja').limit(20000).then(({ data }) => {
      const rows = (data ?? []) as { id: string; ubicacion_id: string | null }[]
      const m = new Map<string, number>(); for (const a of rows) if (a.ubicacion_id) m.set(a.ubicacion_id, (m.get(a.ubicacion_id) ?? 0) + 1)
      setEquipos(m)
      const dondeEsta = new Map(rows.map(a => [a.id, a.ubicacion_id]))
      supabase.from('reportes').select('activo_id').in('estatus', ['abierto', 'en_proceso']).then(({ data: r }) => {
        const mr = new Map<string, number>(); for (const x of (r ?? []) as { activo_id: string }[]) { const u = dondeEsta.get(x.activo_id); if (u) mr.set(u, (mr.get(u) ?? 0) + 1) }
        setReportes(mr)
      })
    })
  }, [])
  useEffect(() => { if (empresaId !== undefined) setEmpresa(empresaId) }, [empresaId])

  // Zoom suave
  function irA(destino: Caja) {
    cancelAnimationFrame(anim.current)
    const ini = vb, t0 = performance.now(), dur = 450
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3)
      setVb({ x: ini.x + (destino.x - ini.x) * e, y: ini.y + (destino.y - ini.y) * e, w: ini.w + (destino.w - ini.w) * e, h: ini.h + (destino.h - ini.h) * e })
      if (p < 1) anim.current = requestAnimationFrame(paso)
    }
    anim.current = requestAnimationFrame(paso)
  }
  const zoom = (f: number) => { const w = Math.min(MX.W, Math.max(12, vb.w / f)), h = w * MX.H / MX.W; irA({ x: vb.x + vb.w / 2 - w / 2, y: vb.y + vb.h / 2 - h / 2, w, h }) }
  const verEstado = (n: string | null) => {
    setSel(null); setEstado(n)
    if (!n) return irA(TODO)
    // con obras: acerca a donde están (para que los puntos se separen); sin obras: el estado completo
    const ls = porEstado.get(n) ?? []
    if (ls.length) {
      const xs = ls.map(l => l.x), ys = ls.map(l => l.y), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
      const minW = 22
      return irA(encuadre({ x: x0 + w / 2 - Math.max(w, minW) / 2, y: y0 + h / 2 - Math.max(h, minW * MX.H / MX.W) / 2, w: Math.max(w, minW), h: Math.max(h, minW * MX.H / MX.W) }, 0.12))
    }
    irA(encuadre(CAJAS[ESTADOS_MX.findIndex(e => e.n === n)]))
  }

  const lugares: Lugar[] = useMemo(() => (ubis ?? []).filter(u => u.latitud != null && u.longitud != null && (!empresa || u.empresa_id === empresa) && (!tipo || u.tipo === tipo)).map(u => {
    const p = proyectarMx(Number(u.latitud), Number(u.longitud))
    return { ...u, ...p, estado: estadoDe(p.x, p.y), equipos: equipos.get(u.id) ?? 0, reportes: reportes.get(u.id) ?? 0 }
  }), [ubis, empresa, tipo, equipos, reportes])
  const sinUbicar = (ubis ?? []).filter(u => (u.latitud == null || u.longitud == null) && (!empresa || u.empresa_id === empresa))
  const porEstado = useMemo(() => {
    const m = new Map<string, Lugar[]>()
    for (const l of lugares) if (l.estado) m.set(l.estado, [...(m.get(l.estado) ?? []), l])
    return m
  }, [lugares])
  const maxEstado = Math.max(1, ...[...porEstado.values()].map(v => v.length))
  const empresas = useMemo(() => [...new Map((ubis ?? []).filter(u => u.latitud != null).map(u => [u.empresa_id, u.empresas])).entries()], [ubis])
  const escala = vb.w / MX.W
  const lugarSel = lugares.find(l => l.id === sel) ?? null
  const enEstado = estado ? (porEstado.get(estado) ?? []).sort((a, b) => b.equipos - a.equipos) : []

  function clicMapa(e: React.MouseEvent<SVGSVGElement>) {
    if (!marcar || !svg.current) return
    const pt = svg.current.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const m = svg.current.getScreenCTM(); if (!m) return
    const p = pt.matrixTransform(m.inverse())
    const c = desproyectarMx(p.x, p.y)
    setPunto({ lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)), estado: estadoDe(p.x, p.y) })
  }

  return (
    <section className="tarjeta overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold"><MapPin size={17} className="text-marca" />Dónde tenemos obra</h2>
          <p className="text-xs text-stone-500">{lugares.length} {lugares.length === 1 ? 'lugar' : 'lugares'} en {porEstado.size} {porEstado.size === 1 ? 'estado' : 'estados'}{sinUbicar.length ? ` · ${sinUbicar.length} sin ubicar en el mapa` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setTipo('')} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${!tipo ? 'bg-marca/15 text-marca ring-marca/40' : 'text-stone-500 ring-stone-200'}`}>Todo</button>
          {Object.entries(TIPOS).map(([k, t]) => <button key={k} onClick={() => setTipo(tipo === k ? '' : k)} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ring-1 ring-inset ${tipo === k ? 'bg-marca/15 text-marca ring-marca/40' : 'text-stone-500 ring-stone-200'}`}><t.icono size={12} />{t.texto}</button>)}
          {puedeEditar && <button onClick={() => { setMarcar(!marcar); setPunto(null) }} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${marcar ? 'bg-marca text-[#1E1719] ring-marca' : 'text-marca ring-marca/40'}`}><Crosshair size={12} />{marcar ? 'Toca el mapa…' : 'Marcar obra'}</button>}
        </div>
      </div>
      {empresaId === undefined && empresas.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-stone-200 px-5 py-2.5">
          <button onClick={() => setEmpresa('')} className={`shrink-0 rounded-full px-3 py-1 text-xs ring-1 ring-inset ${!empresa ? 'bg-stone-100 text-tinta ring-stone-300' : 'text-stone-500 ring-stone-200'}`}>Todas las empresas</button>
          {empresas.map(([id, e]) => (
            <button key={id} onClick={() => setEmpresa(empresa === id ? '' : id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 ring-inset ${empresa === id ? 'bg-stone-100 text-tinta ring-stone-300' : 'text-stone-500 ring-stone-200'}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: e?.color || '#F9B234' }} />{e?.nombre_corto || e?.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-w-0 bg-[#07080B]">
          <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className={`block h-auto w-full select-none ${marcar ? 'cursor-crosshair' : ''}`} role="img" aria-label="Mapa de México con las obras" onClick={clicMapa}>
            <defs>
              <radialGradient id="mx-brillo"><stop offset="0" stopColor="#F9B234" stopOpacity=".55" /><stop offset="1" stopColor="#F9B234" stopOpacity="0" /></radialGradient>
            </defs>
            <rect x={-500} y={-500} width={MX.W + 1000} height={MX.H + 1000} fill="#07080B" />
            {ESTADOS_MX.map(e => {
              const n = porEstado.get(e.n)?.length ?? 0, activo = estado === e.n, h = hover === e.n
              return (
                <path key={e.n} d={e.d} fillRule="evenodd"
                  fill={n ? `rgb(249 178 52 / ${0.12 + 0.38 * (n / maxEstado)})` : h ? '#1F232C' : '#14171D'}
                  stroke={activo ? '#F9B234' : n ? 'rgb(249 178 52 / .65)' : '#2B303A'} strokeWidth={(activo ? 2 : 0.8) * escala} strokeLinejoin="round"
                  className={marcar ? '' : 'cursor-pointer'} style={{ transition: 'fill .2s' }}
                  onPointerEnter={ev => { if (ev.pointerType === 'mouse') setHover(e.n) }} onPointerLeave={() => setHover(null)}
                  onClick={ev => { if (marcar) return; ev.stopPropagation(); verEstado(estado === e.n ? null : e.n) }}>
                  <title>{e.n}{n ? ` · ${n} ${n === 1 ? 'lugar' : 'lugares'}` : ''}</title>
                </path>
              )
            })}
            {vb.w > 500 && ESTADOS_MX.filter(e => porEstado.has(e.n)).map(e => (
              <text key={e.n} x={e.c[0]} y={e.c[1] - 10 * escala} textAnchor="middle" fontSize={11 * escala} fill="#F5E6C8" style={{ pointerEvents: 'none', paintOrder: 'stroke' }} stroke="#07080B" strokeWidth={3 * escala}>{e.p}</text>
            ))}
            {lugares.map(l => {
              const r = (4 + Math.min(7, Math.sqrt(l.equipos) * 1.6)) * escala, color = l.empresas?.color || '#F9B234', s = sel === l.id
              return (
                <g key={l.id} className={marcar ? '' : 'cursor-pointer'} onClick={ev => { if (marcar) return; ev.stopPropagation(); setSel(l.id); if (l.estado && l.estado !== estado) { setEstado(l.estado) } }}>
                  {(s || l.reportes > 0) && <circle cx={l.x} cy={l.y} r={r * 2.6} fill={l.reportes ? 'rgb(239 68 68 / .25)' : 'url(#mx-brillo)'} />}
                  <circle cx={l.x} cy={l.y} r={r} fill={color} stroke={s ? '#fff' : '#07080B'} strokeWidth={(s ? 2 : 1.2) * escala} />
                  {vb.w < 260 && <text x={l.x + r + 3 * escala} y={l.y + 3.5 * escala} fontSize={10 * escala} fill="#E7E5E4" stroke="#07080B" strokeWidth={2.5 * escala} style={{ paintOrder: 'stroke', pointerEvents: 'none' }}>{l.codigo || l.nombre}</text>}
                  <title>{l.nombre} · {l.equipos} equipo(s)</title>
                </g>
              )
            })}
            {punto && (() => { const p = proyectarMx(punto.lat, punto.lng); return <g style={{ pointerEvents: 'none' }}><circle cx={p.x} cy={p.y} r={9 * escala} fill="none" stroke="#F9B234" strokeWidth={2 * escala} /><circle cx={p.x} cy={p.y} r={2.5 * escala} fill="#F9B234" /></g> })()}
          </svg>
          <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
            <button className="grid h-8 w-8 place-items-center rounded-lg border border-stone-200 bg-[#0E1015]/90 text-stone-500 hover:text-tinta" onClick={() => zoom(1.8)} aria-label="Acercar"><Plus size={15} /></button>
            <button className="grid h-8 w-8 place-items-center rounded-lg border border-stone-200 bg-[#0E1015]/90 text-stone-500 hover:text-tinta" onClick={() => zoom(1 / 1.8)} aria-label="Alejar"><Minus size={15} /></button>
            {vb.w < MX.W - 1 && <button className="grid h-8 w-8 place-items-center rounded-lg border border-stone-200 bg-[#0E1015]/90 text-stone-500 hover:text-tinta" onClick={() => verEstado(null)} aria-label="Ver todo México"><Maximize2 size={14} /></button>}
          </div>
          {hover && !marcar && <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-[#0E1015]/90 px-2.5 py-1 text-xs text-stone-500 ring-1 ring-stone-200">{hover}{porEstado.get(hover) ? ` · ${porEstado.get(hover)!.length}` : ''}</div>}
          {marcar && <div className="pointer-events-none absolute inset-x-3 top-3 rounded-lg bg-[#0E1015]/90 px-3 py-2 text-xs text-stone-500 ring-1 ring-marca/40">Toca el lugar de la obra. Para más precisión, acércate al estado primero o pega después el enlace de Google Maps.</div>}
        </div>

        <aside className="min-w-0 border-t border-stone-200 p-4 lg:border-l lg:border-t-0">
          {lugarSel ? (
            <div className="space-y-3">
              <button className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-tinta" onClick={() => setSel(null)}><ChevronLeft size={14} />{estado ?? 'Estados'}</button>
              <div>
                <p className="flex items-center gap-2 text-xs text-stone-500"><span className="h-2 w-2 rounded-full" style={{ background: lugarSel.empresas?.color || '#F9B234' }} />{lugarSel.empresas?.nombre_corto || lugarSel.empresas?.nombre} · {TIPO1[lugarSel.tipo ?? ''] ?? lugarSel.tipo}</p>
                <h3 className="mt-1 text-lg font-semibold leading-tight">{lugarSel.nombre}</h3>
                <p className="text-xs text-stone-500">{[lugarSel.codigo, lugarSel.estado].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl border border-stone-200 bg-stone-50 py-2.5"><Boxes size={14} className="mx-auto mb-1 text-marca" /><p className="cifra text-xl font-semibold">{lugarSel.equipos}</p><p className="text-[10px] uppercase tracking-wider text-stone-500">Equipos</p></div>
                <div className={`rounded-xl border py-2.5 ${lugarSel.reportes ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-stone-50'}`}><Siren size={14} className={`mx-auto mb-1 ${lugarSel.reportes ? 'text-red-600' : 'text-marca'}`} /><p className="cifra text-xl font-semibold">{lugarSel.reportes}</p><p className="text-[10px] uppercase tracking-wider text-stone-500">Fallas abiertas</p></div>
              </div>
              {lugarSel.empleados && <p className="text-sm"><span className="text-stone-500">Responsable: </span>{nombreEmpleado(lugarSel.empleados)}</p>}
              <div className="flex flex-col gap-2">
                <Link className="btn-primario" to={`/activos?ubicacion=${lugarSel.id}`}><Boxes size={15} />Ver el equipo de esta obra</Link>
                <a className="btn-sec" href={linkMaps(Number(lugarSel.latitud), Number(lugarSel.longitud))} target="_blank" rel="noreferrer"><ExternalLink size={14} />Abrir en Google Maps</a>
              </div>
            </div>
          ) : estado ? (
            <div>
              <button className="mb-2 inline-flex items-center gap-1 text-xs text-stone-500 hover:text-tinta" onClick={() => verEstado(null)}><ChevronLeft size={14} />Todo México</button>
              <h3 className="font-semibold">{estado}</h3>
              <p className="mb-3 text-xs text-stone-500">{enEstado.length ? `${enEstado.length} ${enEstado.length === 1 ? 'lugar' : 'lugares'} · ${enEstado.reduce((s, l) => s + l.equipos, 0)} equipos` : 'Sin obras registradas aquí.'}</p>
              <ul className="max-h-[380px] space-y-1.5 overflow-y-auto">
                {enEstado.map(l => <LugarFila key={l.id} l={l} onClick={() => setSel(l.id)} />)}
              </ul>
              {!enEstado.length && puedeEditar && <button className="btn-sec mt-2 w-full" onClick={() => setMarcar(true)}><Crosshair size={14} />Marcar una obra en {estado}</button>}
            </div>
          ) : (
            <div>
              <h3 className="mb-1 font-semibold">Estados con obra</h3>
              <p className="mb-3 text-xs text-stone-500">Elige un estado para acercarte.</p>
              {porEstado.size === 0 ? <p className="text-sm text-stone-500">Aún no hay lugares ubicados en el mapa.{puedeEditar ? ' Usa “Marcar obra” para agregarlos.' : ''}</p> : (
                <ul className="space-y-1.5">
                  {[...porEstado.entries()].sort((a, b) => b[1].length - a[1].length).map(([n, ls]) => (
                    <li key={n}>
                      <button onClick={() => verEstado(n)} className="flex w-full items-center gap-3 rounded-xl border border-stone-200 px-3 py-2 text-left text-sm transition hover:border-marca/50">
                        <span className="min-w-0 flex-1 truncate font-medium">{n}</span>
                        <span className="text-xs text-stone-500">{ls.reduce((s, l) => s + l.equipos, 0)} equipos</span>
                        <span className="cifra grid h-6 min-w-6 place-items-center rounded-full bg-marca/15 px-1.5 text-xs font-semibold text-marca">{ls.length}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {sinUbicar.length > 0 && <p className="mt-4 text-xs text-stone-500">{sinUbicar.length} {sinUbicar.length === 1 ? 'lugar no tiene' : 'lugares no tienen'} ubicación: {sinUbicar.slice(0, 3).map(u => u.nombre).join(', ')}{sinUbicar.length > 3 ? '…' : ''}.{puedeEditar ? ' Con “Marcar obra” los ubicas.' : ''}</p>}
            </div>
          )}
        </aside>
      </div>

      {punto && <NuevaObra punto={punto} empresaFija={empresaId} sinUbicar={sinUbicar} onCerrar={() => setPunto(null)} onListo={id => { setPunto(null); setMarcar(false); cargar(); setSel(id) }} />}
    </section>
  )
}

function LugarFila({ l, onClick }: { l: Lugar; onClick: () => void }) {
  const T = TIPOS[l.tipo ?? '']?.icono ?? MapPin
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 px-3 py-2 text-left text-sm transition hover:border-marca/50">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `${l.empresas?.color || '#F9B234'}22`, color: l.empresas?.color || '#F9B234' }}><T size={14} /></span>
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{l.nombre}</span><span className="block truncate text-[11px] text-stone-500">{l.empresas?.nombre_corto || l.empresas?.nombre}{l.codigo ? ` · ${l.codigo}` : ''}</span></span>
        <span className="text-right text-xs text-stone-500"><span className="cifra block font-semibold text-tinta">{l.equipos}</span>equipos</span>
        {l.reportes > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Fallas abiertas" />}
      </button>
    </li>
  )
}

function NuevaObra({ punto, empresaFija, sinUbicar, onCerrar, onListo }: {
  punto: { lat: number; lng: number; estado: string | null }; empresaFija?: string; sinUbicar: Ubi[]; onCerrar: () => void; onListo: (id: string) => void
}) {
  const [modo, setModo] = useState<'nueva' | 'existente'>('nueva')
  const [empresas, setEmpresas] = useState<{ id: string; nombre: string; nombre_corto: string | null }[]>([])
  const [f, setF] = useState({ empresa_id: empresaFija ?? '', nombre: '', codigo: '', tipo: 'obra', existente: '' })
  const [coord, setCoord] = useState({ lat: punto.lat, lng: punto.lng })
  const [enlace, setEnlace] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { supabase.from('empresas').select('id,nombre,nombre_corto').eq('activo', true).order('nombre').then(({ data }) => setEmpresas((data as typeof empresas) ?? [])) }, [])
  useEffect(() => { if (!f.empresa_id && empresas.length) setF(x => ({ ...x, empresa_id: empresas[0].id })) }, [empresas, f.empresa_id])

  async function guardar() {
    setError('')
    const c = { latitud: coord.lat, longitud: coord.lng }
    setGuardando(true)
    if (modo === 'existente') {
      if (!f.existente) { setGuardando(false); return setError('Elige el lugar.') }
      const { error } = await supabase.from('ubicaciones').update(c).eq('id', f.existente)
      setGuardando(false)
      if (error) return setError(mensajeError(error))
      return onListo(f.existente)
    }
    if (!f.nombre.trim()) { setGuardando(false); return setError('Escribe el nombre de la obra.') }
    const { data, error } = await supabase.from('ubicaciones').insert({ empresa_id: f.empresa_id, nombre: f.nombre.trim(), codigo: f.codigo.trim() || null, tipo: f.tipo, ...c }).select('id').single()
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    onListo((data as { id: string }).id)
  }

  return (
    <Modal abierto titulo={`Obra en ${punto.estado ?? 'este punto'}`} onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        {sinUbicar.length > 0 && (
          <div className="flex gap-1 rounded-xl border border-stone-200 p-1 text-sm">
            <button onClick={() => setModo('nueva')} className={`flex-1 rounded-lg px-3 py-1.5 ${modo === 'nueva' ? 'bg-marca/15 text-marca' : 'text-stone-500'}`}>Obra nueva</button>
            <button onClick={() => setModo('existente')} className={`flex-1 rounded-lg px-3 py-1.5 ${modo === 'existente' ? 'bg-marca/15 text-marca' : 'text-stone-500'}`}>Ubicar una que ya existe</button>
          </div>
        )}
        {modo === 'nueva' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {!empresaFija && <Campo label="Empresa" className="sm:col-span-2"><select className="campo" value={f.empresa_id} onChange={e => setF({ ...f, empresa_id: e.target.value })}>{empresas.map(e => <option key={e.id} value={e.id}>{e.nombre_corto || e.nombre}</option>)}</select></Campo>}
            <Campo label="Nombre de la obra *" className="sm:col-span-2"><input className="campo" autoFocus value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Fraccionamiento Las Garzas etapa 2" /></Campo>
            <Campo label="Clave"><input className="campo font-mono" value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value.toUpperCase() })} placeholder="GF-220" /></Campo>
            <Campo label="Tipo"><select className="campo" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option value="obra">Obra</option><option value="almacen">Almacén</option><option value="oficina">Oficina</option><option value="patio">Patio</option><option value="taller">Taller</option><option value="sitio">Sitio</option></select></Campo>
          </div>
        ) : (
          <Campo label="Lugar sin ubicar"><select className="campo" value={f.existente} onChange={e => setF({ ...f, existente: e.target.value })}><option value="">Elige…</option>{sinUbicar.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.empresas ? ` · ${u.empresas.nombre_corto || u.empresas.nombre}` : ''}</option>)}</select></Campo>
        )}
        <div className="rounded-xl border border-stone-200 p-3">
          <p className="text-xs text-stone-500">Coordenadas: <span className="cifra text-tinta">{coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}</span></p>
          <div className="mt-2 flex gap-2">
            <input className="campo !py-1.5 text-xs" value={enlace} onChange={e => setEnlace(e.target.value)} placeholder="Para precisión exacta pega el enlace de Google Maps o 24.14, -110.31" />
            <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => { const c = coordenadasDe(enlace); if (c) { setCoord({ lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)) }); setError('') } else setError('No encontré coordenadas en ese texto.') }}><Link2 size={13} />Usar</button>
          </div>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}><X size={15} />Cancelar</button><button className="btn-primario" disabled={guardando} onClick={guardar}><MapPin size={15} />Guardar</button></div>
      </div>
    </Modal>
  )
}
