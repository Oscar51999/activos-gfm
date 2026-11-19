import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BookOpenText, ChevronLeft, FileSpreadsheet, Printer, Search, ClipboardSignature, Siren, Wrench, Boxes } from 'lucide-react'
import { supabase, ESTATUS, TIPOS_MOV, type Estatus, type TipoMov } from '../lib/supabase'
import { useLista, fecha } from '../lib/hooks'
import { iconoCategoria } from '../components/FotoActivo'
import { libroExcel, descargar, type ColumnaExcel } from '../lib/excel'
import { Cargando, EstatusBadge, Vacio } from '../components/ui'

type Fila = {
  id: string; codigo: string; descripcion: string; serie: string | null; numero_economico: string | null; estatus: Estatus; fecha_alta: string | null
  empresa_id: string; empresa: string; categoria_id: string; categoria: string; es_vehiculo: boolean; marca: string | null; modelo: string | null
  ubicacion: string | null; responsable: string | null; placa: string | null
}
type Evento = { fecha: string; tipo: 'resguardo' | 'falla' | 'mantenimiento'; folio: string; activo_id: string; texto: string; estado: string }
const SELECT = 'id,codigo,descripcion,serie,numero_economico,estatus,fecha_alta,empresa_id,empresa,categoria_id,categoria,es_vehiculo,marca,modelo,ubicacion,responsable,placa'
const ORDEN_ESTATUS: Estatus[] = ['asignado', 'disponible', 'mantenimiento', 'siniestrado', 'baja']
const hoy = () => new Date().toISOString().slice(0, 10)

/** Bitácoras: un cuaderno por tipo de equipo (vehículos, cómputo, maquinaria…) con su inventario y sus eventos. */
export default function Bitacoras() {
  const { id } = useParams()
  return id ? <BitacoraCategoria id={id} /> : <Indice />
}

function Indice() {
  const [filas, setFilas] = useState<Pick<Fila, 'categoria_id' | 'categoria' | 'estatus' | 'empresa_id'>[] | null>(null)
  const categorias = useLista('categorias')
  const empresas = useLista('empresas', 'id,nombre,nombre_corto')
  const [empresa, setEmpresa] = useState('')
  useEffect(() => {
    supabase.from('v_activos').select('categoria_id,categoria,estatus,empresa_id').limit(20000).then(({ data }) => setFilas((data as typeof filas) ?? []))
  }, [])
  const porCat = useMemo(() => {
    const m = new Map<string, { total: number; e: Partial<Record<Estatus, number>> }>()
    for (const f of filas ?? []) {
      if (empresa && f.empresa_id !== empresa) continue
      const x = m.get(f.categoria_id) ?? { total: 0, e: {} }; x.total++; x.e[f.estatus] = (x.e[f.estatus] ?? 0) + 1; m.set(f.categoria_id, x)
    }
    return m
  }, [filas, empresa])
  if (!filas) return <Cargando />
  const total = [...porCat.values()].reduce((s, x) => s + x.total, 0)
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold sm:text-3xl"><BookOpenText className="text-marca" />Bitácoras</h1>
          <p className="mt-1 text-sm text-stone-500">Elige un tipo de equipo para ver su inventario y su historial; desde ahí imprimes o descargas a Excel.</p>
        </div>
        <select className="campo !w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {empresas.items.map(e => <option key={e.id} value={e.id}>{String(e.nombre_corto || e.nombre)}</option>)}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Link to={`/bitacoras/todas${empresa ? `?empresa=${empresa}` : ''}`} className="tarjeta viva flex items-center gap-4 p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-marca/15 text-marca"><Boxes size={22} /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">Todo el equipo</span><span className="text-xs text-stone-500">Bitácora general</span></span>
          <span className="cifra text-2xl font-semibold">{total}</span>
        </Link>
        {categorias.items.map(c => {
          const x = porCat.get(c.id); const I = iconoCategoria(c.nombre)
          return (
            <Link key={c.id} to={`/bitacoras/${c.id}${empresa ? `?empresa=${empresa}` : ''}`} className="tarjeta viva flex items-center gap-4 p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-stone-100 text-marca"><I size={22} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.nombre}</span>
                <span className="block truncate text-xs text-stone-500">{x ? ORDEN_ESTATUS.filter(s => x.e[s]).map(s => `${x.e[s]} ${ESTATUS[s].texto.toLowerCase()}`).join(' · ') : 'Sin equipo registrado'}</span>
              </span>
              <span className="cifra text-2xl font-semibold">{x?.total ?? 0}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function BitacoraCategoria({ id }: { id: string }) {
  const [sp] = useSearchParams()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [vista, setVista] = useState<'inventario' | 'eventos' | 'resumen'>('inventario')
  const [empresa, setEmpresa] = useState(sp.get('empresa') ?? '')
  const [estatus, setEstatus] = useState('')
  const [q, setQ] = useState('')
  const empresas = useLista('empresas', 'id,nombre,nombre_corto')
  const categorias = useLista('categorias')
  const todas = id === 'todas'
  const nombreCat = todas ? 'Todo el equipo' : String(categorias.items.find(c => c.id === id)?.nombre ?? 'Bitácora')

  useEffect(() => {
    let c = supabase.from('v_activos').select(SELECT).order('codigo').limit(20000)
    if (!todas) c = c.eq('categoria_id', id)
    c.then(({ data }) => setFilas((data as Fila[]) ?? []))
  }, [id, todas])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (filas ?? []).filter(f => (!empresa || f.empresa_id === empresa) && (!estatus || f.estatus === estatus)
      && (!t || [f.codigo, f.descripcion, f.serie, f.numero_economico, f.placa, f.marca, f.modelo, f.ubicacion, f.responsable].some(v => v?.toLowerCase().includes(t))))
  }, [filas, empresa, estatus, q])
  const vehiculos = visibles.some(f => f.es_vehiculo)

  // Eventos de los equipos visibles: resguardos, fallas y órdenes de trabajo
  useEffect(() => {
    if (vista !== 'eventos' || !filas) return
    setEventos(null)
    const ids = visibles.map(f => f.id).slice(0, 600)
    if (!ids.length) { setEventos([]); return }
    const trozos: string[][] = []; for (let i = 0; i < ids.length; i += 150) trozos.push(ids.slice(i, i + 150))
    Promise.all(trozos.flatMap(t => [
      supabase.from('movimiento_activos').select('activo_id,movimientos(folio,tipo,fecha,recibe_nombre,cancelado)').in('activo_id', t).limit(1000),
      supabase.from('reportes').select('activo_id,folio,tipo,descripcion,estatus,created_at').in('activo_id', t).order('created_at', { ascending: false }).limit(500),
      supabase.from('ordenes_trabajo').select('activo_id,folio,tipo,titulo,estatus,created_at').in('activo_id', t).order('created_at', { ascending: false }).limit(500),
    ])).then(rs => {
      const ev: Evento[] = []
      rs.forEach((r, i) => {
        const k = i % 3
        for (const x of (r.data ?? []) as Record<string, unknown>[]) {
          if (k === 0) { const m = x.movimientos as { folio: string; tipo: TipoMov; fecha: string; recibe_nombre: string | null; cancelado: boolean } | null; if (m && !m.cancelado) ev.push({ fecha: m.fecha, tipo: 'resguardo', folio: m.folio, activo_id: String(x.activo_id), texto: `${TIPOS_MOV[m.tipo]?.texto ?? m.tipo}${m.recibe_nombre ? ` · recibe ${m.recibe_nombre}` : ''}`, estado: 'Firmado' }) }
          if (k === 1) ev.push({ fecha: String(x.created_at), tipo: 'falla', folio: String(x.folio), activo_id: String(x.activo_id), texto: `${String(x.tipo)}: ${String(x.descripcion)}`, estado: String(x.estatus) })
          if (k === 2) ev.push({ fecha: String(x.created_at), tipo: 'mantenimiento', folio: String(x.folio), activo_id: String(x.activo_id), texto: `${String(x.tipo)}: ${String(x.titulo)}`, estado: String(x.estatus).replace('_', ' ') })
        }
      })
      setEventos(ev.sort((a, b) => b.fecha.localeCompare(a.fecha)))
    })
  }, [vista, visibles, filas])

  const porId = useMemo(() => new Map((filas ?? []).map(f => [f.id, f])), [filas])
  const resumen = useMemo(() => {
    const m = new Map<string, Partial<Record<Estatus, number>> & { total: number }>()
    for (const f of visibles) { const x = m.get(f.empresa) ?? { total: 0 }; x.total++; x[f.estatus] = (x[f.estatus] ?? 0) + 1; m.set(f.empresa, x) }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [visibles])

  const columnas: ColumnaExcel<Fila>[] = [
    { titulo: 'Código', valor: f => f.codigo }, { titulo: 'Descripción', valor: f => f.descripcion },
    ...(todas ? [{ titulo: 'Categoría', valor: (f: Fila) => f.categoria }] : []),
    { titulo: 'Marca', valor: f => f.marca }, { titulo: 'Modelo', valor: f => f.modelo }, { titulo: 'Serie', valor: f => f.serie },
    ...(vehiculos ? [{ titulo: 'Placa', valor: (f: Fila) => f.placa }, { titulo: 'Núm. económico', valor: (f: Fila) => f.numero_economico }] : []),
    { titulo: 'Empresa', valor: f => f.empresa }, { titulo: 'Ubicación', valor: f => f.ubicacion }, { titulo: 'Responsable', valor: f => f.responsable },
    { titulo: 'Estatus', valor: f => ESTATUS[f.estatus]?.texto }, { titulo: 'Fecha de alta', valor: f => f.fecha_alta },
  ]
  const filtrosTxt = [empresa && String(empresas.items.find(e => e.id === empresa)?.nombre ?? ''), estatus && ESTATUS[estatus as Estatus]?.texto, q && `"${q}"`].filter(Boolean).join(' · ')

  async function excel() {
    let ev = eventos
    if (!ev && visibles.length) {
      // trae los eventos para incluirlos en el archivo
      const ids = visibles.map(f => f.id).slice(0, 150)
      const [m, r, o] = await Promise.all([
        supabase.from('movimiento_activos').select('activo_id,movimientos(folio,tipo,fecha,recibe_nombre,cancelado)').in('activo_id', ids).limit(1000),
        supabase.from('reportes').select('activo_id,folio,tipo,descripcion,estatus,created_at').in('activo_id', ids).limit(500),
        supabase.from('ordenes_trabajo').select('activo_id,folio,tipo,titulo,estatus,created_at').in('activo_id', ids).limit(500),
      ])
      ev = [
        ...((m.data ?? []) as unknown as { activo_id: string; movimientos: { folio: string; tipo: TipoMov; fecha: string; recibe_nombre: string | null; cancelado: boolean } | null }[]).filter(x => x.movimientos && !x.movimientos.cancelado).map(x => ({ fecha: x.movimientos!.fecha, tipo: 'resguardo' as const, folio: x.movimientos!.folio, activo_id: x.activo_id, texto: TIPOS_MOV[x.movimientos!.tipo]?.texto ?? '', estado: 'Firmado' })),
        ...((r.data ?? []) as { activo_id: string; folio: string; tipo: string; descripcion: string; estatus: string; created_at: string }[]).map(x => ({ fecha: x.created_at, tipo: 'falla' as const, folio: x.folio, activo_id: x.activo_id, texto: `${x.tipo}: ${x.descripcion}`, estado: x.estatus })),
        ...((o.data ?? []) as { activo_id: string; folio: string; tipo: string; titulo: string; estatus: string; created_at: string }[]).map(x => ({ fecha: x.created_at, tipo: 'mantenimiento' as const, folio: x.folio, activo_id: x.activo_id, texto: `${x.tipo}: ${x.titulo}`, estado: x.estatus })),
      ].sort((a, b) => b.fecha.localeCompare(a.fecha))
    }
    const libro = libroExcel<never>([
      { nombre: 'Inventario', titulo: `Bitácora · ${nombreCat}${filtrosTxt ? ` · ${filtrosTxt}` : ''} · ${hoy()}`, columnas: columnas as ColumnaExcel<never>[], filas: visibles as never[] },
      { nombre: 'Eventos', titulo: `Eventos · ${nombreCat}`, filas: (ev ?? []) as never[], columnas: [
        { titulo: 'Fecha', valor: (e: Evento) => e.fecha.slice(0, 10) }, { titulo: 'Tipo', valor: (e: Evento) => e.tipo }, { titulo: 'Folio', valor: (e: Evento) => e.folio },
        { titulo: 'Equipo', valor: (e: Evento) => porId.get(e.activo_id)?.codigo }, { titulo: 'Descripción del equipo', valor: (e: Evento) => porId.get(e.activo_id)?.descripcion },
        { titulo: 'Detalle', valor: (e: Evento) => e.texto }, { titulo: 'Estado', valor: (e: Evento) => e.estado },
      ] as ColumnaExcel<never>[] },
      { nombre: 'Resumen', titulo: `Resumen por empresa · ${nombreCat}`, filas: resumen as never[], columnas: [
        { titulo: 'Empresa', valor: (r: typeof resumen[number]) => r[0] }, { titulo: 'Total', valor: (r: typeof resumen[number]) => r[1].total },
        ...ORDEN_ESTATUS.map(s => ({ titulo: ESTATUS[s].texto, valor: (r: typeof resumen[number]) => r[1][s] ?? 0 })),
      ] as ColumnaExcel<never>[] },
    ])
    descargar(libro, `bitacora-${nombreCat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}-${hoy()}.xlsx`)
  }

  if (!filas) return <Cargando />
  const I = todas ? Boxes : iconoCategoria(nombreCat)
  return (
    <div>
      <Link to="/bitacoras" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ChevronLeft size={15} />Bitácoras</Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="no-print grid h-12 w-12 place-items-center rounded-xl bg-marca/15 text-marca"><I size={22} /></span>
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Bitácora · {nombreCat}</h1>
            <p className="text-sm text-stone-500">{visibles.length} equipo(s){filtrosTxt ? ` · ${filtrosTxt}` : ''} · impreso el {fecha(new Date().toISOString())}</p>
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button className="btn-sec" onClick={() => window.print()}><Printer size={16} />Imprimir</button>
          <button className="btn-primario" onClick={excel} disabled={!visibles.length}><FileSpreadsheet size={16} />Excel</button>
        </div>
      </div>

      <div className="no-print mb-4 flex flex-wrap gap-2">
        <span className="relative min-w-[200px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder="Código, serie, placa, responsable, ubicación…" /></span>
        <select className="campo !w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Empresa"><option value="">Todas las empresas</option>{empresas.items.map(e => <option key={e.id} value={e.id}>{String(e.nombre_corto || e.nombre)}</option>)}</select>
        <select className="campo !w-auto" value={estatus} onChange={e => setEstatus(e.target.value)} aria-label="Estatus"><option value="">Todos los estatus</option>{ORDEN_ESTATUS.map(s => <option key={s} value={s}>{ESTATUS[s].texto}</option>)}</select>
      </div>

      <div className="no-print mb-4 flex gap-1 border-b border-stone-200">
        {([['inventario', 'Inventario'], ['eventos', 'Eventos'], ['resumen', 'Reporte']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setVista(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${vista === k ? 'border-marca text-tinta' : 'border-transparent text-stone-500 hover:text-tinta'}`}>{t}</button>
        ))}
      </div>

      {vista === 'inventario' && (visibles.length === 0 ? <Vacio titulo="Sin equipo" texto="No hay equipo con estos filtros." /> : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>{['Código', 'Descripción', 'Marca / modelo', 'Serie', ...(vehiculos ? ['Placa'] : []), 'Empresa', 'Ubicación', 'Responsable', 'Estatus'].map(h => <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {visibles.map(f => (
                <tr key={f.id} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs"><Link to={`/activos/${f.id}`} className="hover:text-marca">{f.codigo}</Link></td>
                  <td className="px-3 py-2">{f.descripcion}{todas && <span className="block text-xs text-stone-500">{f.categoria}</span>}</td>
                  <td className="px-3 py-2 text-stone-600">{[f.marca, f.modelo].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{f.serie || '—'}</td>
                  {vehiculos && <td className="px-3 py-2 font-mono text-xs">{f.placa || '—'}{f.numero_economico && <span className="block text-stone-500">{f.numero_economico}</span>}</td>}
                  <td className="px-3 py-2 text-stone-600">{f.empresa}</td>
                  <td className="px-3 py-2 text-stone-600">{f.ubicacion || '—'}</td>
                  <td className="px-3 py-2">{f.responsable || '—'}</td>
                  <td className="px-3 py-2"><EstatusBadge estatus={f.estatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {vista === 'eventos' && (!eventos ? <Cargando texto="Juntando resguardos, fallas y mantenimientos…" /> : eventos.length === 0 ? <Vacio titulo="Sin eventos" texto="Estos equipos aún no tienen resguardos, fallas ni órdenes de trabajo." /> : (
        <ul className="tarjeta divide-y divide-stone-100">
          {eventos.slice(0, 400).map((e, i) => {
            const a = porId.get(e.activo_id); const Ic = e.tipo === 'resguardo' ? ClipboardSignature : e.tipo === 'falla' ? Siren : Wrench
            return (
              <li key={i} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${e.tipo === 'falla' ? 'bg-red-50 text-red-700' : e.tipo === 'mantenimiento' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}><Ic size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block"><b className="font-medium">{e.folio}</b> · <Link to={`/activos/${e.activo_id}`} className="hover:text-marca">{a?.codigo} {a?.descripcion}</Link></span>
                  <span className="block text-xs text-stone-500">{e.texto}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-stone-500">{fecha(e.fecha)}<span className="block capitalize">{e.estado}</span></span>
              </li>
            )
          })}
        </ul>
      ))}

      {vista === 'resumen' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="tarjeta p-4"><p className="text-[11px] uppercase tracking-wider text-stone-500">Total</p><p className="cifra text-2xl font-semibold">{visibles.length}</p></div>
            {ORDEN_ESTATUS.map(s => <div key={s} className="tarjeta p-4"><p className="text-[11px] uppercase tracking-wider text-stone-500">{ESTATUS[s].texto}</p><p className="cifra text-2xl font-semibold">{visibles.filter(f => f.estatus === s).length}</p></div>)}
          </div>
          <div className="tarjeta overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-stone-500"><tr><th className="px-3 py-2.5 font-medium">Empresa</th><th className="px-3 py-2.5 text-right font-medium">Total</th>{ORDEN_ESTATUS.map(s => <th key={s} className="px-3 py-2.5 text-right font-medium">{ESTATUS[s].texto}</th>)}</tr></thead>
              <tbody className="divide-y divide-stone-100">
                {resumen.map(([n, x]) => <tr key={n}><td className="px-3 py-2">{n}</td><td className="cifra px-3 py-2 text-right font-semibold">{x.total}</td>{ORDEN_ESTATUS.map(s => <td key={s} className="cifra px-3 py-2 text-right text-stone-600">{x[s] ?? 0}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
