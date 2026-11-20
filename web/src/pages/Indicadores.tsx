import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, UserCheck, Siren, Timer, Hourglass, Archive, FileSpreadsheet, MapPin, Building2, Tags, CalendarRange } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLista } from '../lib/hooks'
import { libroExcel, descargar } from '../lib/excel'
import { Encabezado, Cargando } from '../components/ui'

type A = { id: string; codigo: string; descripcion: string; estatus: string; empresa_id: string; empresa: string; categoria: string | null; marca: string | null; modelo: string | null; ubicacion: string | null; ubicacion_tipo: string | null; fecha_alta: string; responsable: string | null }
type R = { id: string; activo_id: string; empresa_id: string; estatus: string; created_at: string; resuelto_at: string | null }
type Fila = { etiqueta: string; valor: number; sub?: string; to?: string }

const PERIODOS = [[90, '90 días'], [180, '6 meses'], [365, '12 meses']] as const
const ANIOS = 4

/** Trae todas las filas aunque pasen de mil (paginado). */
async function todo<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < 50; i++) {
    const { data } = await armar(i * 1000, i * 1000 + 999)
    const d = (data as T[]) ?? []
    out.push(...d)
    if (d.length < 1000) break
  }
  return out
}
const dur = (h: number | null) => h == null ? '—' : h >= 48 ? `${(h / 24).toFixed(1)} días` : `${h.toFixed(1)} h`
const edad = (f: string) => (Date.now() - new Date(f + 'T12:00').getTime()) / (365.25 * 864e5)
function top(m: Map<string, number>, n = 10): Fila[] { return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([etiqueta, valor]) => ({ etiqueta, valor })) }

/** Indicadores para dirección: dónde está el equipo, qué falla, qué tan viejo es y qué tan rápido se atiende. */
export default function Indicadores() {
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const [acts, setActs] = useState<A[] | null>(null)
  const [reps, setReps] = useState<R[]>([])
  const [bajas, setBajas] = useState<{ empresa_id: string; autorizado_at: string }[]>([])
  const [empresa, setEmpresa] = useState('')
  const [dias, setDias] = useState<number>(365)

  useEffect(() => {
    const desde = new Date(Date.now() - 400 * 864e5).toISOString()
    todo<A>((a, b) => supabase.from('v_activos').select('id,codigo,descripcion,estatus,empresa_id,empresa,categoria,marca,modelo,ubicacion,ubicacion_tipo,fecha_alta,responsable').order('id').range(a, b)).then(setActs)
    todo<R>((a, b) => supabase.from('reportes').select('id,activo_id,empresa_id,estatus,created_at,resuelto_at').gte('created_at', desde).order('id').range(a, b)).then(setReps)
    supabase.from('bajas_activos').select('empresa_id,autorizado_at').eq('estatus', 'autorizada').gte('autorizado_at', desde).then(({ data }) => setBajas((data as { empresa_id: string; autorizado_at: string }[]) ?? []))
  }, [])

  const k = useMemo(() => {
    if (!acts) return null
    const ini = Date.now() - dias * 864e5
    const A = acts.filter(a => !empresa || a.empresa_id === empresa)
    const vivos = A.filter(a => a.estatus !== 'baja')
    const porId = new Map(A.map(a => [a.id, a]))
    const R = reps.filter(r => (!empresa || r.empresa_id === empresa) && r.estatus !== 'descartado')
    const enPeriodo = R.filter(r => new Date(r.created_at).getTime() >= ini)
    const resueltos = enPeriodo.filter(r => r.resuelto_at)
    const horas = resueltos.map(r => (new Date(r.resuelto_at!).getTime() - new Date(r.created_at).getTime()) / 36e5)
    const prom = horas.length ? horas.reduce((s, x) => s + x, 0) / horas.length : null
    const viejos = vivos.filter(a => edad(a.fecha_alta) >= ANIOS)

    const obra = new Map<string, number>(); const emp = new Map<string, number>()
    for (const a of vivos) { if (a.ubicacion_tipo === 'obra' && a.ubicacion) obra.set(a.ubicacion, (obra.get(a.ubicacion) ?? 0) + 1); emp.set(a.empresa, (emp.get(a.empresa) ?? 0) + 1) }

    const eqMarca = new Map<string, number>(); for (const a of A) { const m = [a.marca, a.modelo].filter(Boolean).join(' ') || 'Sin marca'; eqMarca.set(m, (eqMarca.get(m) ?? 0) + 1) }
    const fMarca = new Map<string, number>(); for (const r of enPeriodo) { const a = porId.get(r.activo_id); if (!a) continue; const m = [a.marca, a.modelo].filter(Boolean).join(' ') || 'Sin marca'; fMarca.set(m, (fMarca.get(m) ?? 0) + 1) }
    const fallasMarca = top(fMarca).map(f => ({ ...f, sub: `${eqMarca.get(f.etiqueta) ?? 0} equipo(s) · ${(f.valor / Math.max(1, eqMarca.get(f.etiqueta) ?? 1)).toFixed(1)} por equipo` }))

    const rangos: [string, number, number][] = [['Menos de 1 año', 0, 1], ['1 a 2 años', 1, 2], ['2 a 3 años', 2, 3], ['3 a 4 años', 3, 4], [`${ANIOS} años o más`, 4, 999]]
    const antig = rangos.map(([etiqueta, a, b]) => ({ etiqueta, valor: vivos.filter(x => { const e = edad(x.fecha_alta); return e >= a && e < b }).length }))
    const viejosCat = new Map<string, number>(); for (const a of viejos) viejosCat.set(a.categoria ?? 'Sin categoría', (viejosCat.get(a.categoria ?? 'Sin categoría') ?? 0) + 1)

    const meses: Fila[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); d.setHours(0, 0, 0, 0)
      const fin = new Date(d); fin.setMonth(fin.getMonth() + 1)
      const hs = R.filter(r => r.resuelto_at && new Date(r.created_at) >= d && new Date(r.created_at) < fin).map(r => (new Date(r.resuelto_at!).getTime() - new Date(r.created_at).getTime()) / 36e5)
      const abiertos = R.filter(r => new Date(r.created_at) >= d && new Date(r.created_at) < fin).length
      meses.push({ etiqueta: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }), valor: hs.length ? hs.reduce((s, x) => s + x, 0) / hs.length : 0, sub: `${abiertos} reporte(s)` })
    }
    return {
      vivos: vivos.length, asignados: vivos.filter(a => a.estatus === 'asignado').length, mant: vivos.filter(a => a.estatus === 'mantenimiento').length,
      abiertas: R.filter(r => r.estatus === 'abierto' || r.estatus === 'en_proceso').length, fallasPeriodo: enPeriodo.length, prom, resueltos: resueltos.length,
      viejos, bajas: bajas.filter(b => (!empresa || b.empresa_id === empresa) && new Date(b.autorizado_at).getTime() >= ini).length,
      obra: top(obra, 12), emp: top(emp, 12), fallasMarca, antig, viejosCat: top(viejosCat, 8), meses,
    }
  }, [acts, reps, bajas, empresa, dias])

  function excel() {
    if (!k) return
    const col = (t: string) => [{ titulo: t, valor: (f: Fila) => f.etiqueta, ancho: 36 }, { titulo: 'Cantidad', valor: (f: Fila) => Math.round(f.valor * 10) / 10 }, { titulo: 'Detalle', valor: (f: Fila) => f.sub ?? '' }]
    descargar(libroExcel<Fila>([
      { nombre: 'Por obra', titulo: 'Equipos por obra', columnas: col('Obra'), filas: k.obra },
      { nombre: 'Por empresa', titulo: 'Equipos por empresa', columnas: col('Empresa'), filas: k.emp },
      { nombre: 'Fallas por marca', titulo: `Fallas por marca y modelo (${dias} días)`, columnas: col('Marca / modelo'), filas: k.fallasMarca },
      { nombre: 'Antigüedad', titulo: 'Antigüedad del equipo', columnas: col('Rango'), filas: k.antig },
      { nombre: 'Atención', titulo: 'Horas promedio de atención por mes', columnas: col('Mes'), filas: k.meses },
      { nombre: `Más de ${ANIOS} años`, titulo: `Equipos con ${ANIOS} años o más`, columnas: col('Código'), filas: k.viejos.map(a => ({ etiqueta: a.codigo, valor: Math.round(edad(a.fecha_alta) * 10) / 10, sub: `${a.descripcion} · ${a.empresa}${a.responsable ? ' · ' + a.responsable : ''}` })) },
    ]), 'indicadores-activos.xlsx')
  }

  return (
    <div>
      <Encabezado titulo="Indicadores" sub="Para dirección: dónde está el equipo, qué falla más, qué tan viejo es y qué tan rápido se atiende."
        acciones={<button className="btn-sec" onClick={excel} disabled={!k}><FileSpreadsheet size={16} />Excel</button>} />
      <div className="mb-5 flex flex-wrap gap-2">
        <select className="campo !w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas las empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select>
        <div className="flex overflow-hidden rounded-xl border border-stone-200 text-sm">{PERIODOS.map(([d, t]) => <button key={d} onClick={() => setDias(d)} className={`px-3 py-2 ${dias === d ? 'bg-marca/15 text-marca' : 'text-stone-500 hover:bg-stone-100'}`}>{t}</button>)}</div>
      </div>
      {!k ? <Cargando texto="Calculando indicadores…" /> : <>
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi icono={Boxes} titulo="Activos en operación" valor={k.vivos.toLocaleString('es-MX')} sub={`${k.mant} en mantenimiento`} />
          <Kpi icono={UserCheck} titulo="Asignados" valor={`${k.vivos ? Math.round(k.asignados / k.vivos * 100) : 0}%`} sub={`${k.asignados.toLocaleString('es-MX')} con responsable`} />
          <Kpi icono={Siren} titulo="Fallas abiertas" valor={String(k.abiertas)} sub={`${k.fallasPeriodo} en el periodo`} alerta={k.abiertas > 0} to="/reportes" />
          <Kpi icono={Timer} titulo="Tiempo de atención" valor={dur(k.prom)} sub={`promedio de ${k.resueltos} resuelto(s)`} />
          <Kpi icono={Hourglass} titulo={`Con ${ANIOS}+ años`} valor={String(k.viejos.length)} sub={`${k.vivos ? Math.round(k.viejos.length / k.vivos * 100) : 0}% del equipo`} alerta={k.viejos.length > 0} />
          <Kpi icono={Archive} titulo="Bajas autorizadas" valor={String(k.bajas)} sub="en el periodo" to="/bajas" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Barras icono={MapPin} titulo="Equipos por obra" filas={k.obra} vacio="Ningún equipo está en una ubicación tipo obra." />
          <Barras icono={Building2} titulo="Equipos por empresa" filas={k.emp} />
          <Barras icono={Tags} titulo="Fallas por marca y modelo" filas={k.fallasMarca} vacio="Sin reportes de falla en el periodo." tono="rojo" />
          <Barras icono={Hourglass} titulo="Antigüedad del equipo" filas={k.antig} nota="Según la fecha de alta." tono="ambar" />
          <Barras icono={CalendarRange} titulo="Horas promedio de atención por mes" filas={k.meses} formato={dur} nota="Desde que se reporta hasta que se resuelve." />
          <section className="tarjeta p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Hourglass size={15} className="text-marca" />Para renovar: {ANIOS} años o más</h2>
            {k.viejos.length === 0 ? <p className="text-sm text-stone-500">Ningún equipo llega a {ANIOS} años.</p> : <>
              <div className="mb-3 flex flex-wrap gap-1.5">{k.viejosCat.map(c => <span key={c.etiqueta} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">{c.etiqueta} · {c.valor}</span>)}</div>
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">{[...k.viejos].sort((a, b) => a.fecha_alta.localeCompare(b.fecha_alta)).slice(0, 60).map(a => (
                <li key={a.id}><Link to={`/activos/${a.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-stone-100"><span className="font-mono text-xs text-stone-500">{a.codigo}</span><span className="min-w-0 flex-1 truncate">{a.descripcion}</span><span className="cifra shrink-0 text-xs text-stone-500">{edad(a.fecha_alta).toFixed(1)} años</span></Link></li>
              ))}</ul>
            </>}
          </section>
        </div>
      </>}
    </div>
  )
}

function Kpi({ icono: I, titulo, valor, sub, alerta, to }: { icono: typeof Boxes; titulo: string; valor: string; sub: string; alerta?: boolean; to?: string }) {
  const c = <><p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-stone-500"><I size={13} />{titulo}</p><p className={`cifra mt-1 text-2xl font-semibold ${alerta ? 'text-amber-600' : ''}`}>{valor}</p><p className="truncate text-xs text-stone-500">{sub}</p></>
  return to ? <Link to={to} className="tarjeta p-4 hover:border-marca/40">{c}</Link> : <div className="tarjeta p-4">{c}</div>
}

function Barras({ icono: I, titulo, filas, vacio = 'Sin datos.', nota, formato, tono }: { icono: typeof Boxes; titulo: string; filas: Fila[]; vacio?: string; nota?: string; formato?: (v: number) => string; tono?: 'rojo' | 'ambar' }) {
  const max = Math.max(1, ...filas.map(f => f.valor))
  const color = tono === 'rojo' ? 'bg-red-400' : tono === 'ambar' ? 'bg-amber-400' : 'bg-marca'
  return (
    <section className="tarjeta p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><I size={15} className="text-marca" />{titulo}</h2>
      {filas.length === 0 || filas.every(f => !f.valor) ? <p className="text-sm text-stone-500">{vacio}</p> : (
        <ul className="space-y-2">{filas.map(f => (
          <li key={f.etiqueta}>
            <div className="mb-0.5 flex items-baseline justify-between gap-3 text-xs"><span className="min-w-0 truncate">{f.etiqueta}</span><span className="cifra shrink-0 font-medium">{formato ? formato(f.valor) : f.valor.toLocaleString('es-MX')}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${color}`} style={{ width: f.valor ? `${Math.max(2, f.valor / max * 100)}%` : 0 }} /></div>
            {f.sub && <p className="mt-0.5 text-[11px] text-stone-500">{f.sub}</p>}
          </li>
        ))}</ul>
      )}
      {nota && <p className="mt-3 text-[11px] text-stone-500">{nota}</p>}
    </section>
  )
}
