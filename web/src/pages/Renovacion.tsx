import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Hourglass, FileSpreadsheet, Search, Settings2, Check } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fecha } from '../lib/hooks'
import { libroExcel, descargar } from '../lib/excel'
import { Encabezado, Cargando, Vacio, Modal, Aviso } from '../components/ui'

export type Renov = { id: string; codigo: string; descripcion: string; serie: string | null; numero_economico: string | null; estatus: string; empresa_id: string; empresa: string
  categoria_id: string; categoria: string; marca: string | null; modelo: string | null; ubicacion: string | null; responsable: string | null; fecha_base: string | null
  vida_util: number | null; fin_vida: string | null; anios_uso: number | null; estado_vida: 'cumplida' | 'proximo_anio' | 'vigente' | 'sin_dato' }

export const ESTADO_VIDA: Record<Renov['estado_vida'], { t: string; c: string }> = {
  cumplida: { t: 'Vida útil cumplida', c: 'bg-red-50 text-red-700 ring-red-200' },
  proximo_anio: { t: 'Renovar en 12 meses', c: 'bg-amber-50 text-amber-800 ring-amber-200' },
  vigente: { t: 'Vigente', c: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  sin_dato: { t: 'Sin dato', c: 'bg-stone-100 text-stone-600 ring-stone-200' },
}
const anio = (s: string | null) => s ? new Date(s + 'T12:00:00').getFullYear() : null

/** Plan de renovación: cuándo cumple su vida útil cada equipo, según su categoría y fecha de alta (sin montos). */
export default function Renovacion() {
  const { puedeEditar } = useAuth()
  const [l, setL] = useState<Renov[] | null>(null)
  const [q, setQ] = useState(''); const [estado, setEstado] = useState(''); const [cat, setCat] = useState(''); const [anioSel, setAnioSel] = useState<number | null>(null)
  const [config, setConfig] = useState(false); const [n, setN] = useState(0)

  useEffect(() => { supabase.from('v_renovacion').select('*').order('fin_vida', { nullsFirst: false }).then(({ data }) => setL((data as Renov[]) ?? [])) }, [n])

  const hoy = new Date().getFullYear()
  const anios = [hoy, hoy + 1, hoy + 2, hoy + 3, hoy + 4]
  const plan = useMemo(() => {
    const m = new Map<string, Record<number, number> & { vencidos: number }>()
    for (const r of l ?? []) {
      const a = anio(r.fin_vida); if (a == null) continue
      const fila = m.get(r.categoria) ?? Object.assign({}, { vencidos: 0 }) as Record<number, number> & { vencidos: number }
      if (a < hoy) fila.vencidos++; else if (a <= hoy + 4) fila[a] = (fila[a] ?? 0) + 1
      m.set(r.categoria, fila)
    }
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0]))
  }, [l, hoy])
  const vis = useMemo(() => (l ?? []).filter(r => (!estado || r.estado_vida === estado) && (!cat || r.categoria === cat)
    && (anioSel == null || (anioSel < hoy ? (anio(r.fin_vida) ?? 9999) < hoy : anio(r.fin_vida) === anioSel))
    && (!q || `${r.codigo} ${r.descripcion} ${r.serie ?? ''} ${r.responsable ?? ''} ${r.marca ?? ''} ${r.modelo ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [l, q, estado, cat, anioSel, hoy])
  if (!l) return <Cargando />
  const cuenta = (e: string) => l.filter(r => r.estado_vida === e).length

  function excel() {
    descargar(libroExcel<Renov>([{ nombre: 'Renovación', columnas: [
      { titulo: 'Código', valor: r => r.codigo, ancho: 12 }, { titulo: 'Descripción', valor: r => r.descripcion, ancho: 32 }, { titulo: 'Categoría', valor: r => r.categoria, ancho: 18 },
      { titulo: 'Marca', valor: r => r.marca }, { titulo: 'Modelo', valor: r => r.modelo }, { titulo: 'Serie', valor: r => r.serie, ancho: 16 }, { titulo: 'Empresa', valor: r => r.empresa, ancho: 22 },
      { titulo: 'Responsable', valor: r => r.responsable, ancho: 24 }, { titulo: 'Fecha de alta', valor: r => r.fecha_base }, { titulo: 'Vida útil (años)', valor: r => r.vida_util },
      { titulo: 'Años de uso', valor: r => r.anios_uso }, { titulo: 'Fin de vida útil', valor: r => r.fin_vida }, { titulo: 'Estado', valor: r => ESTADO_VIDA[r.estado_vida].t, ancho: 20 }],
      filas: vis }]), `plan-renovacion-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      <Encabezado titulo="Renovación de equipo" sub="Cuándo cumple su vida útil cada equipo según su categoría y su fecha de alta. Úsalo para planear el reemplazo por año."
        acciones={<div className="flex gap-2"><button className="btn-sec" onClick={excel} disabled={!vis.length}><FileSpreadsheet size={16} />Excel</button>
          {puedeEditar && <button className="btn-sec" onClick={() => setConfig(true)}><Settings2 size={16} />Vida útil por categoría</button>}</div>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['cumplida', 'proximo_anio', 'vigente', 'sin_dato'] as const).map(e => (
          <button key={e} onClick={() => setEstado(x => x === e ? '' : e)} className={`tarjeta p-4 text-left transition hover:border-marca/50 ${estado === e ? 'ring-2 ring-marca' : ''}`}>
            <p className={`cifra text-3xl font-semibold ${e === 'cumplida' && cuenta(e) ? 'text-red-700' : e === 'proximo_anio' && cuenta(e) ? 'text-amber-700' : ''}`}>{cuenta(e)}</p>
            <p className="text-xs text-stone-500">{ESTADO_VIDA[e].t}</p></button>
        ))}
      </div>
      {cuenta('sin_dato') > 0 && <p className="mb-4 text-xs text-stone-500">{cuenta('sin_dato')} equipos no tienen fecha de alta o su categoría no tiene vida útil definida{puedeEditar ? <> — <button className="text-marca hover:underline" onClick={() => setConfig(true)}>defínela por categoría</button></> : null}.</p>}

      {plan.length > 0 && (
        <section className="tarjeta mb-5 overflow-hidden">
          <h2 className="p-5 pb-2 font-semibold">Plan de reemplazo por año</h2>
          <p className="px-5 text-xs text-stone-500">Número de equipos que cumplen su vida útil. Toca una cifra para ver cuáles son.</p>
          <div className="overflow-x-auto"><table className="mt-2 w-full min-w-[560px] text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-2 text-left">Categoría</th><th className="px-3 py-2 text-right text-red-600">Ya cumplida</th>{anios.map(a => <th key={a} className="px-3 py-2 text-right">{a}</th>)}</tr></thead>
            <tbody className="divide-y divide-stone-100">{plan.map(([c, f]) => (
              <tr key={c}><td className="px-5 py-2 font-medium">{c}</td>
                {[hoy - 1, ...anios].map(a => { const v = a < hoy ? f.vencidos : (f[a] ?? 0); const sel = cat === c && anioSel === a
                  return <td key={a} className="px-3 py-1 text-right">{v ? <button className={`cifra rounded-lg px-2 py-0.5 ${sel ? 'bg-marca text-white' : a < hoy ? 'text-red-600 hover:bg-red-50' : 'hover:bg-stone-100'}`} onClick={() => { if (sel) { setCat(''); setAnioSel(null) } else { setCat(c); setAnioSel(a) } }}>{v}</button> : <span className="text-stone-300">·</span>}</td> })}
              </tr>))}</tbody>
          </table></div>
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !pl-9" placeholder="Buscar código, descripción, serie, responsable…" value={q} onChange={e => setQ(e.target.value)} /></label>
        {(cat || anioSel != null || estado) && <button className="btn-sec" onClick={() => { setCat(''); setAnioSel(null); setEstado('') }}>Quitar filtros</button>}
      </div>
      {vis.length === 0 ? <Vacio titulo="Sin equipos" texto="No hay equipos con esos filtros." /> : (
        <section className="tarjeta overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-2">Equipo</th><th className="px-3 py-2">Categoría</th><th className="px-3 py-2">Responsable</th><th className="px-3 py-2">Alta</th><th className="px-3 py-2 text-right">Uso / vida</th><th className="px-3 py-2">Fin de vida</th><th className="px-3 py-2">Estado</th></tr></thead>
          <tbody className="divide-y divide-stone-100">{vis.slice(0, 300).map(r => (
            <tr key={r.id} className="hover:bg-stone-50">
              <td className="px-5 py-2"><Link to={`/activos/${r.id}`} className="font-mono text-xs text-marca hover:underline">{r.codigo}</Link><span className="block max-w-[18rem] truncate">{r.descripcion}</span></td>
              <td className="px-3 py-2 text-xs text-stone-600">{r.categoria}</td>
              <td className="px-3 py-2 text-xs text-stone-600">{r.responsable || '—'}</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs">{fecha(r.fecha_base)}</td>
              <td className="cifra whitespace-nowrap px-3 py-2 text-right text-xs">{r.anios_uso ?? '—'} / {r.vida_util ?? '—'} años</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs">{fecha(r.fin_vida)}</td>
              <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ring-1 ${ESTADO_VIDA[r.estado_vida].c}`}>{ESTADO_VIDA[r.estado_vida].t}</span></td>
            </tr>))}</tbody>
        </table></div>{vis.length > 300 && <p className="p-3 text-center text-xs text-stone-500">Mostrando 300 de {vis.length}. Descarga el Excel para verlos todos.</p>}</section>
      )}
      {config && <VidaUtilCategorias onCerrar={() => setConfig(false)} onListo={() => { setConfig(false); setN(x => x + 1) }} />}
    </div>
  )
}

type Cat = { id: string; nombre: string; padre_id: string | null; vida_util_anios: number | null }

function VidaUtilCategorias({ onCerrar, onListo }: { onCerrar: () => void; onListo: () => void }) {
  const [cats, setCats] = useState<Cat[] | null>(null)
  const [val, setVal] = useState<Record<string, string>>({})
  const [err, setErr] = useState(''); const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    supabase.from('categorias').select('id,nombre,padre_id,vida_util_anios').eq('activo', true).order('nombre').then(({ data }) => {
      const l = (data as Cat[]) ?? []; setCats(l); setVal(Object.fromEntries(l.map(c => [c.id, c.vida_util_anios == null ? '' : String(c.vida_util_anios)])))
    })
  }, [])
  async function guardar() {
    if (!cats) return
    setErr(''); setGuardando(true)
    for (const c of cats) {
      const v = val[c.id]?.trim() ? Number(val[c.id].replace(',', '.')) : null
      if (v != null && !(v > 0 && v <= 50)) { setGuardando(false); setErr(`La vida útil de “${c.nombre}” debe estar entre 0.5 y 50 años.`); return }
      if (v === c.vida_util_anios) continue
      const { error } = await supabase.from('categorias').update({ vida_util_anios: v }).eq('id', c.id)
      if (error) { setGuardando(false); setErr(mensajeError(error)); return }
    }
    setGuardando(false); onListo()
  }
  const padre = (id: string | null) => cats?.find(c => c.id === id)?.nombre
  return (
    <Modal abierto titulo="Vida útil por categoría" onCerrar={onCerrar}>
      {!cats ? <Cargando /> : <>
        <p className="mb-3 text-sm text-stone-500">Años que se espera que dure un equipo de cada categoría. Si una subcategoría queda vacía, usa el valor de su categoría padre.</p>
        <div className="max-h-[55vh] space-y-1 overflow-y-auto pr-1">{cats.map(c => (
          <label key={c.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-stone-50">
            <span className="min-w-0 text-sm">{c.nombre}{c.padre_id && <span className="block text-[11px] text-stone-400">en {padre(c.padre_id)}</span>}</span>
            <span className="flex shrink-0 items-center gap-1"><input className="campo !w-20 text-right" inputMode="decimal" placeholder="—" value={val[c.id] ?? ''} onChange={e => setVal({ ...val, [c.id]: e.target.value })} /><span className="text-xs text-stone-500">años</span></span>
          </label>))}</div>
        {err && <div className="mt-3"><Aviso>{err}</Aviso></div>}
        <div className="mt-4 flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando} onClick={guardar}><Check size={16} />{guardando ? 'Guardando…' : 'Guardar'}</button></div>
      </>}
    </Modal>
  )
}

/** Vida útil de un equipo, en su ficha. */
export function VidaUtilActivo({ activoId }: { activoId: string }) {
  const [r, setR] = useState<Renov | null>(null)
  useEffect(() => { supabase.from('v_renovacion').select('*').eq('id', activoId).maybeSingle().then(({ data }) => setR((data as Renov) ?? null)) }, [activoId])
  if (!r || r.estado_vida === 'sin_dato') return null
  const pct = r.vida_util && r.anios_uso != null ? Math.min(100, Math.max(0, (Number(r.anios_uso) / Number(r.vida_util)) * 100)) : 0
  return (
    <section className="tarjeta p-5">
      <h2 className="mb-3 flex items-center justify-between gap-2 font-semibold"><span className="flex items-center gap-2"><Hourglass size={17} className="text-marca" />Vida útil</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-normal ring-1 ${ESTADO_VIDA[r.estado_vida].c}`}>{ESTADO_VIDA[r.estado_vida].t}</span></h2>
      <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${r.estado_vida === 'cumplida' ? 'bg-red-500' : r.estado_vida === 'proximo_anio' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
      <p className="mt-2 text-sm text-stone-600"><span className="cifra">{r.anios_uso}</span> de <span className="cifra">{r.vida_util}</span> años de uso · fin de vida útil: <b className="font-medium">{fecha(r.fin_vida)}</b></p>
      <Link to="/renovacion" className="mt-1 inline-block text-xs text-marca hover:underline">Ver plan de renovación</Link>
    </section>
  )
}
