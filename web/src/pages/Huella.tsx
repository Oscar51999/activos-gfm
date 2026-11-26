import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Leaf, FileSpreadsheet, Settings2, Trees, Check } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { libroExcel, descargar } from '../lib/excel'
import { Encabezado, Cargando, Vacio, Modal, Aviso } from '../components/ui'

type Fila = { id: string; activo_id: string; empresa_id: string; empresa: string; fecha: string; mes: string; codigo: string; descripcion: string; placa: string | null; numero_economico: string | null
  categoria: string | null; litros: number; tipo_lectura: string; combustible: 'gasolina' | 'diesel' | 'gas_lp'; supuesto: boolean; kg_co2_litro: number; kg_co2: number }
type Factor = { combustible: string; nombre: string; kg_co2_litro: number; fuente: string | null }

const COMB: Record<string, { t: string; c: string }> = { gasolina: { t: 'Gasolina', c: '#E2A64B' }, diesel: { t: 'Diésel', c: '#0f766e' }, gas_lp: { t: 'Gas LP', c: '#6366f1' } }
const KG_ARBOL = 22 // CO₂ que absorbe un árbol adulto en un año (aprox.)
const t = (kg: number, d = 1) => (kg / 1000).toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: d })
const n0 = (v: number) => Math.round(v).toLocaleString('es-MX')
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Huella de carbono de la flotilla: CO₂ emitido según los litros de combustible cargados. Sin montos. */
export default function Huella() {
  const { puedeEditar } = useAuth()
  const [l, setL] = useState<Fila[] | null>(null)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [empresa, setEmpresa] = useState('')
  const [config, setConfig] = useState(false); const [n, setN] = useState(0)
  useEffect(() => { supabase.from('v_huella_carbono').select('*').order('fecha').limit(20000).then(({ data }) => setL((data as Fila[]) ?? [])) }, [n])

  const anios = useMemo(() => [...new Set([new Date().getFullYear(), ...(l ?? []).map(r => Number(r.mes.slice(0, 4)))])].sort((a, b) => b - a), [l])
  const empresas = useMemo(() => [...new Map((l ?? []).map(r => [r.empresa_id, r.empresa])).entries()], [l])
  const vis = useMemo(() => (l ?? []).filter(r => Number(r.mes.slice(0, 4)) === anio && (!empresa || r.empresa_id === empresa)), [l, anio, empresa])
  const porMes = useMemo(() => MESES.map((_, i) => {
    const rs = vis.filter(r => Number(r.mes.slice(5, 7)) === i + 1)
    return Object.fromEntries(Object.keys(COMB).map(k => [k, rs.filter(r => r.combustible === k).reduce((s, r) => s + Number(r.kg_co2), 0)])) as Record<string, number>
  }), [vis])
  const agrupar = (clave: (r: Fila) => string, nombre: (r: Fila) => string) => {
    const m = new Map<string, { nombre: string; litros: number; kg: number; cargas: number; id: string }>()
    for (const r of vis) { const k = clave(r), x = m.get(k) ?? { nombre: nombre(r), litros: 0, kg: 0, cargas: 0, id: r.activo_id }; x.litros += Number(r.litros); x.kg += Number(r.kg_co2); x.cargas++; m.set(k, x) }
    return [...m.values()].sort((a, b) => b.kg - a.kg)
  }
  const porUnidad = useMemo(() => agrupar(r => r.activo_id, r => `${r.codigo} · ${r.placa || r.numero_economico || r.descripcion}`), [vis]) // eslint-disable-line react-hooks/exhaustive-deps
  const porEmpresa = useMemo(() => agrupar(r => r.empresa_id, r => r.empresa), [vis]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!l) return <Cargando />

  const totalKg = vis.reduce((s, r) => s + Number(r.kg_co2), 0), litros = vis.reduce((s, r) => s + Number(r.litros), 0)
  const mesActual = new Date().getMonth(), kgMes = anio === new Date().getFullYear() ? Object.values(porMes[mesActual]).reduce((a, b) => a + b, 0) : 0
  const maxMes = Math.max(1, ...porMes.map(m => Object.values(m).reduce((a, b) => a + b, 0)))
  const supuestos = vis.filter(r => r.supuesto).length

  function excel() {
    descargar(libroExcel<Fila>([{ nombre: `Huella ${anio}`, columnas: [
      { titulo: 'Fecha', valor: r => r.fecha.slice(0, 10) }, { titulo: 'Empresa', valor: r => r.empresa, ancho: 24 }, { titulo: 'Código', valor: r => r.codigo },
      { titulo: 'Unidad', valor: r => r.placa || r.numero_economico || r.descripcion, ancho: 24 }, { titulo: 'Categoría', valor: r => r.categoria, ancho: 16 },
      { titulo: 'Combustible', valor: r => COMB[r.combustible]?.t + (r.supuesto ? ' (supuesto)' : ''), ancho: 18 }, { titulo: 'Litros', valor: r => Number(r.litros) },
      { titulo: 'Factor kg CO₂/L', valor: r => Number(r.kg_co2_litro) }, { titulo: 'kg CO₂', valor: r => Number(r.kg_co2) }],
      filas: vis }]), `huella-carbono-${anio}.xlsx`)
  }

  return (
    <div>
      <Encabezado titulo="Huella de carbono" sub="CO₂ que emite la flotilla según los litros de combustible registrados. Sirve para reportes ambientales, licitaciones y para ver qué unidades contaminan más."
        acciones={<div className="flex flex-wrap gap-2">
          <select className="campo !w-auto" value={anio} onChange={e => setAnio(Number(e.target.value))}>{anios.map(a => <option key={a}>{a}</option>)}</select>
          {empresas.length > 1 && <select className="campo !w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas las empresas</option>{empresas.map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}</select>}
          <button className="btn-sec" onClick={excel} disabled={!vis.length}><FileSpreadsheet size={16} />Excel</button>
          {puedeEditar && <button className="btn-sec" onClick={() => setConfig(true)}><Settings2 size={16} />Factores</button>}</div>} />

      {l.length === 0 ? <Vacio titulo="Sin datos todavía" texto="La huella se calcula sola con las cargas de combustible. Registra las cargas en Combustible para empezar." accion={<Link to="/combustible" className="btn-primario">Ir a Combustible</Link>} /> : <>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="tarjeta p-4"><p className="cifra text-3xl font-semibold">{t(totalKg)}</p><p className="text-xs text-stone-500">toneladas de CO₂ en {anio}</p></div>
          <div className="tarjeta p-4"><p className="cifra text-3xl font-semibold">{anio === new Date().getFullYear() ? t(kgMes, 2) : '—'}</p><p className="text-xs text-stone-500">toneladas este mes</p></div>
          <div className="tarjeta p-4"><p className="cifra text-3xl font-semibold">{n0(litros)}</p><p className="text-xs text-stone-500">litros de combustible</p></div>
          <div className="tarjeta p-4"><p className="cifra flex items-center gap-2 text-3xl font-semibold text-emerald-700"><Trees size={24} />{n0(totalKg / KG_ARBOL)}</p><p className="text-xs text-stone-500">árboles para absorberlo en un año</p></div>
        </div>

        <section className="tarjeta mb-5 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">CO₂ por mes · {anio}</h2>
            <div className="flex flex-wrap gap-3 text-xs text-stone-500">{Object.entries(COMB).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: v.c }} />{v.t}</span>)}</div></div>
          <div className="flex h-48 items-end gap-1.5 sm:gap-3">
            {porMes.map((m, i) => { const tot = Object.values(m).reduce((a, b) => a + b, 0)
              return (
                <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${MESES[i]}: ${t(tot, 2)} t CO₂`}>
                  {tot > 0 && <span className="cifra text-[10px] text-stone-500">{t(tot, tot < 1000 ? 2 : 1)}</span>}
                  <div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(tot / maxMes) * 82}%` }}>
                    {Object.entries(COMB).map(([k, v]) => m[k] > 0 && <div key={k} style={{ height: `${(m[k] / tot) * 100}%`, background: v.c }} />)}
                  </div>
                  <span className="text-[10px] text-stone-500">{MESES[i]}</span>
                </div>)
            })}
          </div>
          <p className="mt-2 text-right text-[10px] text-stone-400">toneladas de CO₂</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-2 *:min-w-0">
          <Ranking titulo="Unidades que más emiten" filas={porUnidad.slice(0, 15)} total={totalKg} enlace />
          <Ranking titulo="Por empresa" filas={porEmpresa} total={totalKg} />
        </div>
        <p className="mt-4 text-xs text-stone-500">Cálculo: litros cargados × factor de emisión del combustible (kg de CO₂ por litro). {supuestos > 0 && <>{supuestos} carga(s) no indican el tipo de combustible; se tomó diésel para maquinaria y gasolina para vehículos. </>}La equivalencia en árboles es aproximada ({KG_ARBOL} kg de CO₂ por árbol al año).</p>
      </>}
      {config && <Factores onCerrar={() => setConfig(false)} onListo={() => { setConfig(false); setN(x => x + 1) }} />}
    </div>
  )
}

function Ranking({ titulo, filas, total, enlace = false }: { titulo: string; filas: { nombre: string; litros: number; kg: number; cargas: number; id: string }[]; total: number; enlace?: boolean }) {
  const max = Math.max(1, ...filas.map(f => f.kg))
  return (
    <section className="tarjeta p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><Leaf size={16} className="text-emerald-600" />{titulo}</h2>
      {filas.length === 0 ? <p className="text-sm text-stone-500">Sin cargas en este periodo.</p> : <ul className="space-y-2.5">{filas.map(f => (
        <li key={f.nombre}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            {enlace ? <Link to={`/activos/${f.id}`} className="min-w-0 truncate hover:text-marca">{f.nombre}</Link> : <span className="min-w-0 truncate">{f.nombre}</span>}
            <span className="cifra shrink-0 text-xs text-stone-500">{t(f.kg, 2)} t · {Math.round((f.kg / Math.max(1, total)) * 100)}% · {n0(f.litros)} L</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-stone-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(f.kg / max) * 100}%` }} /></div>
        </li>))}</ul>}
    </section>
  )
}

function Factores({ onCerrar, onListo }: { onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState<Factor[] | null>(null)
  const [val, setVal] = useState<Record<string, string>>({})
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { supabase.from('factores_emision').select('*').order('combustible').then(({ data }) => { const l = (data as Factor[]) ?? []; setF(l); setVal(Object.fromEntries(l.map(x => [x.combustible, String(x.kg_co2_litro)]))) }) }, [])
  async function guardar() {
    if (!f) return
    setErr(''); setBusy(true)
    for (const x of f) {
      const v = Number((val[x.combustible] ?? '').replace(',', '.'))
      if (!(v > 0 && v < 10)) { setBusy(false); setErr(`El factor de ${x.nombre} debe estar entre 0 y 10 kg de CO₂ por litro.`); return }
      if (v === Number(x.kg_co2_litro)) continue
      const { error } = await supabase.from('factores_emision').update({ kg_co2_litro: v, fuente: 'Ajustado manualmente', updated_at: new Date().toISOString() }).eq('combustible', x.combustible)
      if (error) { setBusy(false); setErr(mensajeError(error)); return }
    }
    setBusy(false); onListo()
  }
  return (
    <Modal abierto titulo="Factores de emisión" onCerrar={onCerrar} ancho="max-w-lg">
      {!f ? <Cargando /> : <>
        <p className="mb-3 text-sm text-stone-500">Kilogramos de CO₂ que produce un litro de cada combustible al quemarse. Los valores vienen de referencias internacionales; ajústalos si tu reporte ambiental usa otros.</p>
        <div className="space-y-2">{f.map(x => (
          <label key={x.combustible} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1">
            <span className="text-sm">{x.nombre}<span className="block text-[11px] text-stone-400">{x.fuente}</span></span>
            <span className="flex shrink-0 items-center gap-1"><input className="campo !w-24 text-right" inputMode="decimal" value={val[x.combustible] ?? ''} onChange={e => setVal({ ...val, [x.combustible]: e.target.value })} /><span className="text-xs text-stone-500">kg/L</span></span>
          </label>))}</div>
        {err && <div className="mt-3"><Aviso>{err}</Aviso></div>}
        <div className="mt-4 flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={busy} onClick={guardar}><Check size={16} />{busy ? 'Guardando…' : 'Guardar'}</button></div>
      </>}
    </Modal>
  )
}
