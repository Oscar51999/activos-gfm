import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Timer, Wrench, PauseCircle, AlertTriangle, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLista } from '../lib/hooks'
import { Cargando, Vacio } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import { num } from '../lib/almacen'

type OT = { id: string; folio: string; activo_id: string; empresa_id: string; tipo: 'preventivo' | 'correctivo'; estatus: string; fecha_inicio: string | null; fecha_fin: string | null; created_at: string; paro: boolean | null; dano_id: string | null; causa_id: string | null }
type Act = { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; empresa_id: string; empresa: string; categoria: string | null; es_vehiculo: boolean | null; modelo_foto: string | null; foto_principal: string | null; estatus: string }
type Lect = { activo_id: string; tipo: string; valor: number; fecha: string }
type Fila = { a: Act; disp: number; fuera: number; fallas: number; mtbf: number | null; mttr: number | null; uso: { valor: number; tipo: string } | null; ots: number }

const PERIODOS = [[30, '30 días'], [90, '90 días'], [365, '12 meses']] as const
const h = (ms: number) => ms / 3_600_000
const hrs = (x: number | null) => x == null ? '—' : x >= 48 ? `${num(Math.round(x / 24 * 10) / 10)} días` : `${num(Math.round(x * 10) / 10)} h`

/** Unión de intervalos recortada a la ventana: horas reales que el equipo estuvo parado. */
function horasParado(ots: OT[], ini: number, fin: number) {
  const iv = ots.filter(o => o.fecha_inicio && o.paro !== false && o.estatus !== 'cancelada')
    .map(o => [Math.max(ini, new Date(o.fecha_inicio!).getTime()), Math.min(fin, o.fecha_fin ? new Date(o.fecha_fin).getTime() : fin)] as [number, number])
    .filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  let total = 0, cur: [number, number] | null = null
  for (const r of iv) { if (!cur || r[0] > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [...r] } else cur[1] = Math.max(cur[1], r[1]) }
  if (cur) total += cur[1] - cur[0]
  return h(total)
}

/** Confiabilidad (como SAP PM): disponibilidad, tiempo entre fallas, tiempo de reparación y qué falla más. */
export default function Confiabilidad() {
  const [dias, setDias] = useState<number>(90)
  const [empresa, setEmpresa] = useState('')
  const [ots, setOts] = useState<OT[] | null>(null)
  const [acts, setActs] = useState<Act[]>([])
  const [lects, setLects] = useState<Lect[]>([])
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const { items: codigos } = useLista('codigos_falla', 'id,nombre,grupo,codigo', 'codigo')

  useEffect(() => {
    const desde = new Date(Date.now() - 365 * 864e5).toISOString()
    supabase.from('ordenes_trabajo').select('id,folio,activo_id,empresa_id,tipo,estatus,fecha_inicio,fecha_fin,created_at,paro,dano_id,causa_id').gte('created_at', desde).limit(10000)
      .then(({ data }) => setOts((data as OT[]) ?? []))
    supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,empresa_id,empresa,categoria,es_vehiculo,modelo_foto,foto_principal,estatus').neq('estatus', 'baja').limit(20000)
      .then(({ data }) => setActs((data as Act[]) ?? []))
    supabase.from('lecturas').select('activo_id,tipo,valor,fecha').gte('fecha', desde).order('fecha').limit(20000).then(({ data }) => setLects((data as Lect[]) ?? []))
  }, [])

  const calc = useMemo(() => {
    if (!ots) return null
    const fin = Date.now(), ini = fin - dias * 864e5, ventana = h(fin - ini)
    const enVentana = ots.filter(o => (!empresa || o.empresa_id === empresa) && (new Date(o.created_at).getTime() >= ini || (o.fecha_fin && new Date(o.fecha_fin).getTime() >= ini) || !o.fecha_fin))
    const conOT = new Set(enVentana.map(o => o.activo_id))
    const base = acts.filter(a => (!empresa || a.empresa_id === empresa) && (conOT.has(a.id) || a.es_vehiculo || (a.categoria ?? '').toLowerCase().includes('maquinaria')))
    const filas: Fila[] = base.map(a => {
      const mias = enVentana.filter(o => o.activo_id === a.id)
      const fuera = horasParado(mias, ini, fin)
      const corr = mias.filter(o => o.tipo === 'correctivo' && new Date(o.created_at).getTime() >= ini)
      const rep = corr.filter(o => o.fecha_inicio && o.fecha_fin).map(o => h(new Date(o.fecha_fin!).getTime() - new Date(o.fecha_inicio!).getTime()))
      const l = lects.filter(x => x.activo_id === a.id && new Date(x.fecha).getTime() >= ini)
      const uso = l.length >= 2 ? { valor: Math.max(...l.map(x => Number(x.valor))) - Math.min(...l.map(x => Number(x.valor))), tipo: l[0].tipo } : null
      return { a, fuera, disp: Math.max(0, 1 - fuera / ventana), fallas: corr.length, mtbf: corr.length ? (ventana - fuera) / corr.length : null, mttr: rep.length ? rep.reduce((s, x) => s + x, 0) / rep.length : null, uso, ots: mias.length }
    }).sort((x, y) => x.disp - y.disp || y.fallas - x.fallas)
    const corrTodas = enVentana.filter(o => o.tipo === 'correctivo' && new Date(o.created_at).getTime() >= ini)
    const pareto = (grupo: 'dano' | 'causa', campo: 'dano_id' | 'causa_id') => {
      const m = new Map<string, number>()
      for (const o of corrTodas) { const k = o[campo] ?? '—'; m.set(k, (m.get(k) ?? 0) + 1) }
      return [...m.entries()].map(([k, n]) => ({ k, n, nombre: k === '—' ? 'Sin clasificar' : (codigos.find(c => c.id === k)?.nombre ?? '—'), codigo: k === '—' ? '' : (codigos.find(c => c.id === k)?.codigo as string ?? '') }))
        .sort((x, y) => (x.k === '—' ? 1 : 0) - (y.k === '—' ? 1 : 0) || y.n - x.n).slice(0, 8).map(x => ({ ...x, grupo }))
    }
    const totFuera = filas.reduce((s, f) => s + f.fuera, 0), totFallas = filas.reduce((s, f) => s + f.fallas, 0)
    const reps = corrTodas.filter(o => o.fecha_inicio && o.fecha_fin).map(o => h(new Date(o.fecha_fin!).getTime() - new Date(o.fecha_inicio!).getTime()))
    return {
      filas, danos: pareto('dano', 'dano_id'), causas: pareto('causa', 'causa_id'),
      disp: filas.length ? filas.reduce((s, f) => s + f.disp, 0) / filas.length : 1,
      mtbf: totFallas ? (ventana * filas.length - totFuera) / totFallas : null,
      mttr: reps.length ? reps.reduce((s, x) => s + x, 0) / reps.length : null, totFuera, totFallas,
    }
  }, [ots, acts, lects, dias, empresa, codigos])

  if (!calc) return <Cargando />
  const pct = (x: number) => `${num(Math.round(x * 1000) / 10)}%`

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Confiabilidad</h1>
          <p className="mt-1 text-sm text-stone-500">Qué tanto tiempo está disponible cada equipo, cada cuánto falla, cuánto tarda en repararse y qué es lo que más falla. Sale de las órdenes de trabajo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="campo !w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Empresa"><option value="">Todas las empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select>
          <div className="flex gap-1 rounded-2xl border border-stone-200 bg-stone-50 p-1">
            {PERIODOS.map(([d, t]) => <button key={d} onClick={() => setDias(d)} className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${dias === d ? 'bg-marca text-[#120D04]' : 'text-stone-500 hover:text-tinta'}`}>{t}</button>)}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([[Activity, 'Disponibilidad promedio', pct(calc.disp), 'del tiempo, listos para trabajar', calc.disp < 0.85],
          [Timer, 'Tiempo entre fallas', hrs(calc.mtbf), 'promedio por equipo (MTBF)', false],
          [Wrench, 'Tiempo de reparación', hrs(calc.mttr), 'promedio por correctivo (MTTR)', false],
          [PauseCircle, 'Tiempo parado', hrs(calc.totFuera), `${calc.totFallas} falla(s) en el periodo`, false]] as const).map(([I, t, v, s, rojo]) => (
          <div key={t} className={`tarjeta p-4 ${rojo ? '!border-red-200' : ''}`}>
            <I size={18} className={rojo ? 'text-red-700' : 'text-marca'} />
            <p className={`cifra mt-2 text-2xl font-semibold sm:text-3xl ${rojo ? 'text-red-700' : ''}`}>{v}</p>
            <p className="text-[11px] uppercase tracking-wider text-stone-500">{t}</p>
            <p className="text-[11px] text-stone-400">{s}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {([['¿Qué falla más?', calc.danos], ['¿Por qué falla?', calc.causas]] as const).map(([t, xs]) => {
          const max = Math.max(1, ...xs.map(x => x.n)), tot = xs.reduce((s, x) => s + x.n, 0)
          return (
            <section key={t} className="tarjeta p-5">
              <h2 className="mb-1 font-semibold">{t}</h2>
              <p className="mb-4 text-xs text-stone-500">Órdenes correctivas del periodo · {tot}</p>
              {xs.length === 0 ? <p className="py-6 text-center text-sm text-stone-500">Sin fallas en el periodo.</p> : (
                <ul className="space-y-2.5">
                  {xs.map(x => (
                    <li key={x.k} className="group grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm" title={`${x.nombre}: ${x.n} de ${tot} (${Math.round(x.n / tot * 100)}%)`}>
                      <span className={`truncate ${x.k === '—' ? 'text-stone-400' : 'text-stone-600'}`}>{x.codigo && <span className="mr-1 font-mono text-[11px] text-stone-400">{x.codigo}</span>}{x.nombre}</span>
                      <span className="h-3 rounded-r bg-stone-100"><span className={`block h-full rounded-r transition-[filter] group-hover:brightness-110 ${x.k === '—' ? 'bg-stone-300' : 'bg-marca'}`} style={{ width: `${(x.n / max) * 100}%` }} /></span>
                      <span className="cifra w-14 text-right text-stone-600">{x.n} <span className="text-[11px] text-stone-400">{Math.round(x.n / tot * 100)}%</span></span>
                    </li>
                  ))}
                </ul>
              )}
              {xs.some(x => x.k === '—') && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-stone-400"><Info size={12} />Al terminar una orden, elige qué falló y por qué para que esta gráfica sea útil.</p>}
            </section>
          )
        })}
      </div>

      <section className="tarjeta overflow-hidden">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><h2 className="font-semibold">Por equipo</h2><span className="text-xs text-stone-500">De menor a mayor disponibilidad</span></div>
        {calc.filas.length === 0 ? <Vacio titulo="Sin equipos" texto="Aquí aparecen vehículos, maquinaria y todo equipo con órdenes de trabajo." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-stone-500"><th className="px-5 py-2">Equipo</th><th className="px-3 py-2">Disponibilidad</th><th className="px-3 py-2 text-right">Fallas</th><th className="px-3 py-2 text-right">Entre fallas</th><th className="px-3 py-2 text-right">Reparación</th><th className="px-3 py-2 text-right">Parado</th><th className="px-3 py-2 text-right">Uso</th></tr></thead>
              <tbody>
                {calc.filas.map(f => {
                  const alerta = f.disp < 0.85 || f.fallas >= 3
                  return (
                    <tr key={f.a.id} className="border-t border-stone-100 hover:bg-stone-50">
                      <td className="px-5 py-2.5"><Link to={`/activos/${f.a.id}`} className="flex items-center gap-3">
                        <FotoActivo foto={f.a.foto_principal} fotoModelo={f.a.modelo_foto} categoria={f.a.categoria} className="h-9 w-11 shrink-0 rounded-lg" icono={14} />
                        <span className="min-w-0"><span className="block font-mono text-[11px] text-marca">{f.a.codigo}</span><span className="block truncate">{[f.a.marca, f.a.modelo].filter(Boolean).join(' ') || f.a.descripcion}</span><span className="block text-[11px] text-stone-500">{f.a.empresa}</span></span>
                      </Link></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-100"><span className={`block h-full rounded-full ${f.disp < 0.85 ? 'bg-red-500' : f.disp < 0.95 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${f.disp * 100}%` }} /></span>
                          <span className="cifra w-14">{pct(f.disp)}</span>
                          {alerta && <span title={f.disp < 0.85 ? 'Disponibilidad baja: revisa si conviene reemplazarlo o reforzar el preventivo' : 'Falla seguido: revisa la causa'} className="text-red-700"><AlertTriangle size={14} /></span>}
                        </div>
                      </td>
                      <td className="cifra px-3 py-2.5 text-right">{f.fallas}</td>
                      <td className="cifra px-3 py-2.5 text-right">{hrs(f.mtbf)}</td>
                      <td className="cifra px-3 py-2.5 text-right">{hrs(f.mttr)}</td>
                      <td className="cifra px-3 py-2.5 text-right">{f.fuera ? hrs(f.fuera) : '—'}</td>
                      <td className="cifra px-3 py-2.5 text-right">{f.uso ? `${num(Math.round(f.uso.valor))} ${f.uso.tipo === 'horas' ? 'h' : 'km'}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-3 text-[11px] text-stone-400">Disponibilidad = tiempo del periodo menos el tiempo con una orden de trabajo abierta que paró el equipo. Entre fallas (MTBF) = tiempo trabajando ÷ número de correctivos. Reparación (MTTR) = promedio de inicio a fin de los correctivos terminados.</p>
    </div>
  )
}
