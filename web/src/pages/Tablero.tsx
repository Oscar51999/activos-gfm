import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ScanLine, Boxes, Gem, UserX, Wrench, ArrowUpRight, ClipboardSignature, PenLine, Activity, CalendarClock, Siren, FileClock, Inbox, Warehouse } from 'lucide-react'
import { avisosAlmacen } from '../lib/almacen'
import { supabase, ESTATUS, TIPOS_MOV, type Estatus, type TipoMov } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Cargando, Vacio } from '../components/ui'
import { TipoBadge } from './Movimientos'
import LogoEmpresa from '../components/LogoEmpresa'
import type { EmpresaLogo } from '../lib/logos'

type Fila = { estatus: Estatus; empresa_id: string; empresa: string; categoria: string; ubicacion: string | null; valor_referencia: number | null; responsable: string | null }
type Mov = { id: string; folio: string; tipo: TipoMov; fecha: string; a_empleado: string | null; a_ubicacion: string | null; recibe_nombre: string | null; firmado: boolean; num_activos: number }

const COLOR: Record<Estatus, string> = { disponible: '#34D399', asignado: '#38BDF8', mantenimiento: '#F9B234', siniestrado: '#FF5A5F', baja: '#6B7280' }

function contar(filas: Fila[], f: (r: Fila) => string | null) {
  const m = new Map<string, number>()
  filas.forEach(r => { const k = f(r) ?? 'Sin asignar'; m.set(k, (m.get(k) ?? 0) + 1) })
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

/** Número que sube desde cero al aparecer. */
function Contador({ valor, formato = (n: number) => Math.round(n).toLocaleString('es-MX') }: { valor: number; formato?: (n: number) => string }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0; const t0 = performance.now(); const dur = 1100
    const paso = (t: number) => { const p = Math.min(1, (t - t0) / dur); setN(valor * (1 - Math.pow(1 - p, 4))); if (p < 1) raf = requestAnimationFrame(paso) }
    raf = requestAnimationFrame(paso); return () => cancelAnimationFrame(raf)
  }, [valor])
  return <>{formato(n)}</>
}

function Kpi({ to, icono: I, titulo, valor, nota, acento = false, formato, retraso }: {
  to: string; icono: typeof Boxes; titulo: string; valor: number; nota?: ReactNode; acento?: boolean; formato?: (n: number) => string; retraso: number
}) {
  return (
    <Link to={to} className="tarjeta viva group min-w-0 animate-entrar overflow-hidden p-4 sm:p-5" style={{ animationDelay: `${retraso}ms` }}>
      <div className="flex items-start justify-between">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${acento ? 'bg-marca text-[#120D04] shadow-[0_0_24px_-4px_rgb(249_178_52/.8)]' : 'bg-stone-100 text-marca'}`}><I size={19} /></span>
        <ArrowUpRight size={16} className="text-stone-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-marca" />
      </div>
      <p className="mt-4 text-[10px] font-medium uppercase tracking-wider text-stone-500 sm:mt-5 sm:text-[11px]">{titulo}</p>
      <p className={`cifra mt-1 truncate text-[1.45rem] font-semibold sm:text-4xl ${acento ? 'brillo text-marca' : ''}`}><Contador valor={valor} formato={formato} /></p>
      {nota && <p className="mt-1 text-xs text-stone-400">{nota}</p>}
    </Link>
  )
}

/** Anillo por estatus; cada segmento lleva al listado filtrado. */
function Anillo({ datos, total }: { datos: (readonly [Estatus, number])[]; total: number }) {
  const [listo, setListo] = useState(false)
  const [foco, setFoco] = useState<Estatus | null>(null)
  useEffect(() => { const t = setTimeout(() => setListo(true), 80); return () => clearTimeout(t) }, [])
  const R = 70, C = 2 * Math.PI * R, hueco = 4
  let acum = 0
  const sel = foco ? datos.find(d => d[0] === foco) : null
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-48 w-48 shrink-0">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          <circle cx="90" cy="90" r={R} fill="none" stroke="rgb(255 255 255 / .06)" strokeWidth="14" />
          {datos.filter(d => d[1] > 0).map(([k, n]) => {
            const largo = Math.max(0, (n / total) * C - hueco), ini = acum; acum += (n / total) * C
            return (
              <Link key={k} to={`/activos?estatus=${k}`}>
                <circle cx="90" cy="90" r={R} fill="none" stroke={COLOR[k]} strokeWidth={foco === k ? 18 : 14} strokeLinecap="round"
                  strokeDasharray={`${listo ? largo : 0} ${C}`} strokeDashoffset={-ini}
                  onMouseEnter={() => setFoco(k)} onMouseLeave={() => setFoco(null)}
                  style={{ transition: 'stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1), stroke-width .2s', filter: `drop-shadow(0 0 6px ${COLOR[k]}88)`, cursor: 'pointer' }} />
              </Link>
            )
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="cifra text-4xl font-semibold" style={sel ? { color: COLOR[sel[0]] } : undefined}>{sel ? sel[1] : <Contador valor={total} />}</p>
            <p className="text-[10px] uppercase tracking-[.16em] text-stone-400">{sel ? ESTATUS[sel[0]].texto : 'activos'}</p>
          </div>
        </div>
      </div>
      <ul className="grid w-full gap-1.5">
        {datos.map(([k, n]) => (
          <li key={k}>
            <Link to={`/activos?estatus=${k}`} onMouseEnter={() => setFoco(k)} onMouseLeave={() => setFoco(null)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${foco === k ? 'bg-stone-100' : ''}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[k], boxShadow: `0 0 10px ${COLOR[k]}` }} />
              <span className="flex-1 text-stone-600">{ESTATUS[k].texto}</span>
              <span className="cifra font-semibold">{n}</span>
              <span className="w-10 text-right text-xs text-stone-400">{total ? Math.round((n / total) * 100) : 0}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Barras({ titulo, datos, total, filtro }: { titulo: string; datos: [string, number][]; total: number; filtro?: string }) {
  const max = Math.max(1, ...datos.map(d => d[1]))
  return (
    <section className="tarjeta min-w-0 p-5">
      <h2 className="mb-4 flex items-center justify-between text-sm font-semibold">{titulo}<span className="text-[10px] font-normal uppercase tracking-wider text-stone-400">{datos.length} grupos</span></h2>
      <ul className="space-y-3">
        {datos.slice(0, 7).map(([k, n], i) => (
          <li key={k}>
            <Link to={filtro ? `/activos?q=${encodeURIComponent(k)}` : '/activos'} className="group block">
              <div className="mb-1 flex justify-between gap-3 text-[13px]">
                <span className="truncate text-stone-600 group-hover:text-tinta" title={k}>{k}</span>
                <span className="cifra shrink-0">{n} <span className="text-xs text-stone-400">{Math.round((n / total) * 100)}%</span></span>
              </div>
              <span className="block h-1.5 overflow-hidden rounded-full bg-stone-100">
                <span className="block h-full origin-left rounded-full bg-gradient-to-r from-marca/40 to-marca shadow-[0_0_12px_rgb(249_178_52/.6)]"
                  style={{ width: `${(n / max) * 100}%`, animation: `crecer 1s ${i * 70}ms cubic-bezier(.2,.8,.2,1) both` }} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Tablero() {
  const { perfil, puedeEditar, puedeResguardar } = useAuth()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [movs, setMovs] = useState<Mov[]>([])
  const [empresas, setEmpresas] = useState<(EmpresaLogo & { id: string })[]>([])
  const [aten, setAten] = useState({ vencidos: 0, pronto: 0, reportes: 0, alta: 0, conteos: 0, docVenc: 0, doc30: 0, mttoVenc: 0, mttoProx: 0, solPend: 0, solEnt: 0, bajo: 0 })

  useEffect(() => {
    supabase.from('v_activos').select('estatus,empresa_id,empresa,categoria,ubicacion,valor_referencia,responsable').limit(20000)
      .then(({ data }) => setFilas((data as Fila[]) ?? []))
    Promise.all([
      supabase.from('v_prestamos').select('fecha_devolucion'),
      supabase.from('reportes').select('prioridad').in('estatus', ['abierto', 'en_proceso']),
      supabase.from('inventarios').select('id').eq('estatus', 'abierto'),
      supabase.from('v_vigencias').select('fecha_vencimiento'),
      supabase.from('v_mantenimiento').select('estado'),
      avisosAlmacen(),
    ]).then(([p, r, i, v, mt, al]) => {
      const me = ((mt.data ?? []) as { estado: string }[])
      const d = new Date(); const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      d.setDate(d.getDate() + 3); const en3 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const fp = ((p.data ?? []) as { fecha_devolucion: string }[]).map(x => x.fecha_devolucion)
      const rp = ((r.data ?? []) as { prioridad: string }[])
      const fv = ((v.data ?? []) as { fecha_vencimiento: string }[]).map(x => x.fecha_vencimiento)
      const d30 = new Date(); d30.setDate(d30.getDate() + 30); const en30 = `${d30.getFullYear()}-${String(d30.getMonth() + 1).padStart(2, '0')}-${String(d30.getDate()).padStart(2, '0')}`
      setAten({ solPend: al.pendientes, solEnt: al.porEntregar, bajo: al.bajo, mttoVenc: me.filter(x => x.estado === 'vencido').length, mttoProx: me.filter(x => x.estado === 'proximo').length, docVenc: fv.filter(f => f < hoy).length, doc30: fv.filter(f => f >= hoy && f <= en30).length, vencidos: fp.filter(f => f < hoy).length, pronto: fp.filter(f => f >= hoy && f <= en3).length, reportes: rp.length, alta: rp.filter(x => x.prioridad === 'alta').length, conteos: i.data?.length ?? 0 })
    })
    supabase.from('empresas').select('id,nombre,nombre_corto,logo_path,logo_oscuro,color').eq('activo', true).order('nombre')
      .then(({ data }) => setEmpresas((data as (EmpresaLogo & { id: string })[]) ?? []))
    supabase.from('v_movimientos').select('*').order('fecha', { ascending: false }).limit(6)
      .then(({ data }) => setMovs((data as Mov[]) ?? []))
  }, [])

  if (!filas) return <Cargando />
  const total = filas.length
  const porEstatus = (Object.keys(ESTATUS) as Estatus[]).map(k => [k, filas.filter(f => f.estatus === k).length] as const)
  const valor = filas.filter(f => f.estatus !== 'baja').reduce((s, f) => s + (f.valor_referencia ?? 0), 0)
  const sinResponsable = filas.filter(f => f.estatus !== 'baja' && !f.responsable).length
  const enMtto = filas.filter(f => f.estatus === 'mantenimiento').length
  const sinFirma = movs.filter(m => !m.firmado).length
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const mxn = (n: number) => '$' + Math.round(n).toLocaleString('es-MX')

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-marca/30 bg-marca/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[.16em] text-marca">
            <Activity size={12} />Panel del grupo
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">{saludo}, {perfil?.nombre?.split(' ')[0] ?? ''}</h1>
          <p className="mt-1 text-sm text-stone-500">Así están los activos de todas las empresas en este momento.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/escanear" className="btn-sec"><ScanLine size={16} />Escanear</Link>
          {puedeResguardar && <Link to="/resguardos/nuevo" className="btn-sec"><ClipboardSignature size={16} />Resguardo</Link>}
          {puedeEditar && <Link to="/alta" className="btn-primario"><Plus size={16} />Alta de activos</Link>}
        </div>
      </div>

      {total === 0 ? (
        <div className="tarjeta">
          <Vacio titulo="Aún no hay activos registrados"
            texto="Empieza por dar de alta ubicaciones y empleados en Organización; después registra cada activo con su foto y etiqueta QR."
            accion={puedeEditar && <Link to="/alta" className="btn-primario"><Plus size={16} />Registrar el primero</Link>} />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Kpi retraso={0} to="/activos" icono={Boxes} titulo="Activos registrados" valor={total} acento />
            <Kpi retraso={70} to="/activos" icono={Gem} titulo="Valor de referencia" valor={valor} formato={mxn} nota="sin contar bajas" />
            <Kpi retraso={140} to="/activos?estatus=disponible" icono={UserX} titulo="Sin responsable" valor={sinResponsable} nota="sin resguardo vigente" />
            <Kpi retraso={210} to="/activos?estatus=mantenimiento" icono={Wrench} titulo="En mantenimiento" valor={enMtto} />
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {([
              ['/vigencias', FileClock, 'Documentos vencidos', aten.docVenc, aten.doc30 ? `${aten.doc30} vencen en 30 días` : 'Pólizas, tarjetas, licencias', aten.docVenc > 0],
              ['/prestamos', CalendarClock, 'Préstamos vencidos', aten.vencidos, aten.pronto ? `${aten.pronto} regresan en 3 días` : 'Ninguno por vencer', aten.vencidos > 0],
              ['/reportes', Siren, 'Reportes de falla por atender', aten.reportes, aten.alta ? `${aten.alta} de prioridad alta` : 'Desde las etiquetas QR', aten.alta > 0],
              ['/mantenimiento', Wrench, 'Mantenimientos vencidos', aten.mttoVenc, aten.mttoProx ? `${aten.mttoProx} próximos` : 'Preventivos al día', aten.mttoVenc > 0],
              ['/solicitudes', Inbox, 'Solicitudes por aprobar', aten.solPend, aten.solEnt ? `${aten.solEnt} aprobadas por entregar` : 'Equipo y material pedido', false],
              ['/almacen?bajo=1', Warehouse, 'Material bajo mínimo', aten.bajo, aten.bajo ? 'Hay que surtir' : 'Existencias completas', aten.bajo > 0],
            ] as const).map(([to, I, t, n, sub, rojo], k) => (
              <Link key={to} to={to} className={`tarjeta viva group flex animate-entrar items-center gap-4 p-4 ${rojo ? '!border-red-200' : ''}`} style={{ animationDelay: `${280 + k * 60}ms` }}>
                <span className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl ${rojo ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-marca'}`}>
                  <I size={20} />{rojo && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulso" style={{ boxShadow: '0 0 0 0 rgb(239 68 68 / .6)' }} />}
                </span>
                <span className="min-w-0 flex-1"><span className="block text-[11px] uppercase tracking-wider text-stone-500">{t}</span><span className="block truncate text-xs text-stone-400">{sub}</span></span>
                <span className={`cifra text-3xl font-semibold ${rojo ? 'text-red-700' : ''}`}>{n}</span>
              </Link>
            ))}
          </div>

          {empresas.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">Empresas<Link to="/empresas" className="text-[11px] font-normal text-marca hover:underline">Ver todas</Link></h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[...empresas].sort((a, b) => filas.filter(f => f.empresa_id === b.id).length - filas.filter(f => f.empresa_id === a.id).length).map((e, i) => {
                  const n = filas.filter(f => f.empresa_id === e.id && f.estatus !== 'baja').length
                  return (
                    <Link key={e.id} to={`/empresas/${e.id}`} className="tarjeta viva group relative flex min-w-0 animate-entrar flex-col items-center overflow-hidden px-4 pb-3 pt-4" style={{ animationDelay: `${i * 50}ms` }}>
                      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px opacity-70" style={{ background: `linear-gradient(90deg, transparent, ${e.color || '#F9B234'}, transparent)` }} />
                      <LogoEmpresa empresa={e} alto={34} ancho={150} className="transition duration-500 group-hover:scale-105" />
                      <p className="mt-2 text-[11px] text-stone-500"><span className="cifra text-sm font-semibold text-tinta">{n}</span> activos</p>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          <div className="mb-6 grid gap-6 lg:grid-cols-5">
            <section className="tarjeta min-w-0 p-5 lg:col-span-3">
              <h2 className="mb-5 flex items-center justify-between text-sm font-semibold">Distribución por estatus<span className="hidden text-[10px] font-normal uppercase tracking-wider text-stone-400 sm:inline">pasa el cursor o toca</span></h2>
              <Anillo datos={porEstatus} total={total} />
            </section>

            <section className="tarjeta flex min-w-0 flex-col p-5 lg:col-span-2">
              <h2 className="mb-4 flex items-center justify-between text-sm font-semibold">
                Actividad reciente
                <Link to="/resguardos" className="text-[11px] font-normal text-marca hover:underline">Ver todo</Link>
              </h2>
              {movs.length === 0 ? <p className="text-sm text-stone-500">Sin movimientos todavía.</p> : (
                <ol className="relative flex-1 space-y-4 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-stone-300">
                  {movs.map(m => (
                    <li key={m.id} className="relative pl-6">
                      <span className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-[#0B0D11]" style={{ background: { asignacion: '#38BDF8', devolucion: '#34D399', traspaso: '#A78BFA' }[m.tipo] }} />
                      <Link to={`/resguardos/${m.id}`} className="group block">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-stone-500 group-hover:text-marca">{m.folio}</span><TipoBadge tipo={m.tipo} />
                          {!m.firmado && <span className="inline-flex items-center gap-1 text-[11px] text-amber-700"><PenLine size={11} />sin firma</span>}
                        </div>
                        <p className="mt-0.5 truncate text-sm">{TIPOS_MOV[m.tipo].texto} de {m.num_activos} activo(s) · {m.recibe_nombre ?? m.a_empleado ?? m.a_ubicacion ?? '—'}</p>
                        <p className="text-[11px] text-stone-400">{new Date(m.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
              {sinFirma > 0 && <Link to="/resguardos" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{sinFirma} resguardo(s) recientes esperan firma</Link>}
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Barras titulo="Por empresa" datos={contar(filas, f => f.empresa)} total={total} />
            <Barras titulo="Por categoría" datos={contar(filas, f => f.categoria)} total={total} />
            <Barras titulo="Por ubicación" datos={contar(filas, f => f.ubicacion)} total={total} />
          </div>
        </>
      )}
    </div>
  )
}
