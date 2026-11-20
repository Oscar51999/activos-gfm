import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, ChevronLeft, ChevronRight, Printer, FileSpreadsheet, FileText, X, SlidersHorizontal } from 'lucide-react'
import { supabase, ESTATUS, mensajeError, type Estatus } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista } from '../lib/hooks'
import { Encabezado, EstatusBadge, Cargando, Vacio, Aviso } from '../components/ui'
import { OpcionesCategoria } from '../components/CatalogoEnLinea'
import { libroExcel, descargar } from '../lib/excel'
import { pdfTabla } from '../lib/pdf'
import { iconoCategoria } from '../components/FotoActivo'

export type ActivoFila = {
  id: string; codigo: string; qr: string; descripcion: string; serie: string | null; numero_economico: string | null
  estatus: Estatus; empresa: string; categoria: string; marca: string | null; modelo: string | null
  ubicacion: string | null; responsable: string | null; placa: string | null; empresa_id: string
}

const POR_PAGINA = 50

export default function Activos() {
  const { puedeEditar } = useAuth()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const empresas = useLista('empresas')
  const categorias = useLista('categorias', 'id,nombre,padre_id')
  const marcas = useLista('marcas')
  const [masFiltros, setMasFiltros] = useState(false)
  const ubicaciones = useLista('ubicaciones', 'id,nombre,empresa_id')
  const [filas, setFilas] = useState<ActivoFila[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState(sp.get('q') ?? '')

  const f = {
    q: sp.get('q') ?? '', empresa: sp.get('empresa') ?? '', categoria: sp.get('categoria') ?? '',
    ubicacion: sp.get('ubicacion') ?? '', estatus: sp.get('estatus') ?? '', pagina: Number(sp.get('p') ?? 1),
    tipo: sp.get('tipo') ?? '', marca: sp.get('marca') ?? '', resp: sp.get('resp') ?? '', serie: sp.get('serie') ?? '',
    desde: sp.get('desde') ?? '', hasta: sp.get('hasta') ?? '',
  }
  const tipos = categorias.items.filter(c => !c.padre_id).sort((a, b) => a.nombre.localeCompare(b.nombre))
  const idsTipo = f.tipo ? [f.tipo, ...categorias.items.filter(c => c.padre_id === f.tipo).map(c => c.id)] : []
  const subtipos = f.tipo ? categorias.items.filter(c => c.padre_id === f.tipo) : []
  const nFiltros = [f.empresa, f.categoria, f.ubicacion, f.estatus, f.tipo, f.marca, f.resp, f.serie, f.desde, f.hasta].filter(Boolean).length
  const setF = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, v); else n.delete(k)
    if (k !== 'p') n.delete('p')
    setSp(n, { replace: true })
  }

  const consulta = useCallback((conConteo: boolean) => {
    let q = supabase.from('v_activos').select('*', conConteo ? { count: 'exact' } : undefined)
    if (f.empresa) q = q.eq('empresa_id', f.empresa)
    if (f.categoria) q = q.eq('categoria_id', f.categoria)
    else if (idsTipo.length) q = q.in('categoria_id', idsTipo)
    if (f.marca) q = q.eq('marca_id', f.marca)
    if (f.resp === 'con') q = q.not('responsable_id', 'is', null)
    if (f.resp === 'sin') q = q.is('responsable_id', null)
    if (f.serie === 'sin') q = q.is('serie', null)
    if (f.serie === 'con') q = q.not('serie', 'is', null)
    if (f.desde) q = q.gte('fecha_alta', f.desde)
    if (f.hasta) q = q.lte('fecha_alta', f.hasta)
    if (f.ubicacion) q = q.eq('ubicacion_id', f.ubicacion)
    if (f.estatus) q = q.eq('estatus', f.estatus)
    if (f.q) {
      const t = f.q.replace(/[%,()]/g, ' ').trim()
      q = q.or(`codigo.ilike.%${t}%,descripcion.ilike.%${t}%,serie.ilike.%${t}%,numero_economico.ilike.%${t}%,placa.ilike.%${t}%,responsable.ilike.%${t}%`)
    }
    return q.order('codigo', { ascending: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.empresa, f.categoria, f.ubicacion, f.estatus, f.q, f.marca, f.resp, f.serie, f.desde, f.hasta, idsTipo.join(',')])

  useEffect(() => {
    let vivo = true
    setFilas(null)
    const desde = (f.pagina - 1) * POR_PAGINA
    consulta(true).range(desde, desde + POR_PAGINA - 1).then(({ data, count, error }) => {
      if (!vivo) return
      if (error) setError(mensajeError(error))
      setFilas((data as ActivoFila[]) ?? []); setTotal(count ?? 0)
    })
    return () => { vivo = false }
  }, [consulta, f.pagina])

  // búsqueda con pausa al escribir
  useEffect(() => {
    const t = setTimeout(() => { if (texto !== f.q) setF('q', texto) }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  const cols: [keyof ActivoFila, string, number?][] = [['codigo', 'Código', 12], ['descripcion', 'Descripción', 34], ['categoria', 'Tipo', 18], ['marca', 'Marca', 14], ['modelo', 'Modelo', 18],
    ['serie', 'Serie', 16], ['numero_economico', 'No. económico', 12], ['placa', 'Placa', 10], ['estatus', 'Estatus', 12], ['empresa', 'Empresa', 24], ['ubicacion', 'Ubicación', 22], ['responsable', 'Responsable', 26]]
  const valor = (r: ActivoFila, k: keyof ActivoFila) => k === 'estatus' ? ESTATUS[r.estatus].texto : (r[k] as string | null) ?? ''
  const descripcionFiltros = () => [
    f.tipo && `Tipo: ${categorias.items.find(c => c.id === f.tipo)?.nombre}`, f.categoria && `Subtipo: ${categorias.items.find(c => c.id === f.categoria)?.nombre}`,
    f.empresa && `Empresa: ${empresas.items.find(c => c.id === f.empresa)?.nombre}`, f.ubicacion && `Ubicación: ${ubicaciones.items.find(c => c.id === f.ubicacion)?.nombre}`,
    f.marca && `Marca: ${marcas.items.find(c => c.id === f.marca)?.nombre}`, f.estatus && `Estatus: ${ESTATUS[f.estatus as Estatus]?.texto}`,
    f.resp && (f.resp === 'con' ? 'Con responsable' : 'Sin responsable'), f.serie && (f.serie === 'con' ? 'Con serie' : 'Sin serie'),
    (f.desde || f.hasta) && `Alta ${f.desde || '…'} a ${f.hasta || '…'}`, f.q && `Búsqueda: "${f.q}"`,
  ].filter(Boolean).join(' · ')
  async function datosExport() {
    const { data, error } = await consulta(false).limit(10000)
    if (error) { setError(mensajeError(error)); return null }
    return (data as ActivoFila[]) ?? []
  }
  async function exportar() {
    const d = await datosExport(); if (!d) return
    descargar(libroExcel<ActivoFila>([{ nombre: 'Activos', titulo: `Activos${descripcionFiltros() ? ' · ' + descripcionFiltros() : ''}`, filas: d,
      columnas: cols.map(([k, t, w]) => ({ titulo: t, valor: (r: ActivoFila) => valor(r, k), ancho: w })) }]), `activos-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }
  async function exportarPdf() {
    const d = await datosExport(); if (!d) return
    const pc: (keyof ActivoFila)[] = ['codigo', 'descripcion', 'categoria', 'serie', 'estatus', 'ubicacion', 'responsable']
    await pdfTabla<ActivoFila>({ titulo: 'Activos', subtitulo: `${d.length} activo(s)${descripcionFiltros() ? ' · ' + descripcionFiltros() : ''}`, horizontal: true, nombre: `activos-${new Date().toISOString().slice(0, 10)}`,
      filas: d, columnas: pc.map(k => ({ titulo: cols.find(c => c[0] === k)![1], valor: (r: ActivoFila) => k === 'descripcion' ? [r.descripcion, [r.marca, r.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : valor(r, k) })) })
  }
  const limpiar = () => { setTexto(''); setSp(new URLSearchParams(), { replace: true }) }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const ubicVisibles = f.empresa ? ubicaciones.items.filter(u => u.empresa_id === f.empresa) : ubicaciones.items

  return (
    <div>
      <Encabezado titulo="Activos" sub={filas ? `${total.toLocaleString('es-MX')} activos` : ' '}
        acciones={<>
          <button className="btn-sec" onClick={exportar}><FileSpreadsheet size={16} />Excel</button>
          <button className="btn-sec" onClick={exportarPdf}><FileText size={16} />PDF</button>
          <Link className="btn-sec" to={`/etiquetas?${sp.toString()}`}><Printer size={16} />Imprimir etiquetas</Link>
          {puedeEditar && <Link className="btn-primario" to="/alta"><Plus size={16} />Alta de activos</Link>}
        </>} />

      <div className="tarjeta">
        {tipos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-b border-stone-200 p-3">
            <button onClick={() => { const n = new URLSearchParams(sp); n.delete('tipo'); n.delete('categoria'); n.delete('p'); setSp(n, { replace: true }) }} className={`shrink-0 rounded-full px-3 py-1.5 text-xs ring-1 ring-inset ${!f.tipo ? 'bg-marca/15 text-marca ring-marca/40' : 'text-stone-500 ring-stone-200 hover:text-tinta'}`}>Todo el equipo</button>
            {tipos.map(t => { const I = iconoCategoria(t.nombre); return (
              <button key={t.id} onClick={() => { const n = new URLSearchParams(sp); n.set('tipo', t.id); n.delete('categoria'); n.delete('p'); setSp(n, { replace: true }) }} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 ring-inset ${f.tipo === t.id ? 'bg-marca/15 text-marca ring-marca/40' : 'text-stone-500 ring-stone-200 hover:text-tinta'}`}><I size={13} />{t.nombre}</button>
            ) })}
          </div>
        )}
        <div className="grid gap-3 border-b border-stone-200 p-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="campo pl-9" placeholder="Código, descripción, serie, placa, responsable…" value={texto} onChange={e => setTexto(e.target.value)} />
          </div>
          <select className="campo" value={f.empresa} onChange={e => { setF('empresa', e.target.value) }}>
            <option value="">Todas las empresas</option>{empresas.items.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
          <select className="campo" value={f.categoria} onChange={e => setF('categoria', e.target.value)}>
            <option value="">{f.tipo ? 'Todos los subtipos' : 'Tipo o subtipo'}</option>
            {f.tipo ? subtipos.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>) : <OpcionesCategoria items={categorias.items} />}
          </select>
          <select className="campo" value={f.estatus} onChange={e => setF('estatus', e.target.value)}>
            <option value="">Todos los estatus</option>{Object.entries(ESTATUS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select>
          <button className={`btn-sec justify-center ${masFiltros || nFiltros > 2 ? '!border-marca/50 !text-marca' : ''}`} onClick={() => setMasFiltros(x => !x)}><SlidersHorizontal size={15} />Más filtros{nFiltros ? ` · ${nFiltros}` : ''}</button>
          {(masFiltros || f.ubicacion || f.marca || f.resp || f.serie || f.desde || f.hasta) && <>
            <select className="campo" value={f.ubicacion} onChange={e => setF('ubicacion', e.target.value)}>
              <option value="">Todas las ubicaciones</option>{ubicVisibles.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
            <select className="campo" value={f.marca} onChange={e => setF('marca', e.target.value)}>
              <option value="">Todas las marcas</option>{marcas.items.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
            <select className="campo" value={f.resp} onChange={e => setF('resp', e.target.value)}>
              <option value="">Con o sin responsable</option><option value="con">Con responsable</option><option value="sin">Sin responsable</option>
            </select>
            <select className="campo" value={f.serie} onChange={e => setF('serie', e.target.value)}>
              <option value="">Con o sin serie</option><option value="con">Con número de serie</option><option value="sin">Sin número de serie</option>
            </select>
            <div className="flex min-w-0 items-center gap-2 text-xs text-stone-500 sm:col-span-2">
              <span className="shrink-0">Alta del</span><input className="campo min-w-0 !py-2" type="date" value={f.desde} onChange={e => setF('desde', e.target.value)} aria-label="Fecha de alta desde" />
              <span className="shrink-0">al</span><input className="campo min-w-0 !py-2" type="date" value={f.hasta} onChange={e => setF('hasta', e.target.value)} aria-label="Fecha de alta hasta" />
            </div>
          </>}
          {(nFiltros > 0 || f.q) && <button className="flex items-center gap-1 text-sm text-stone-500 hover:text-marca" onClick={limpiar}><X size={14} />Limpiar filtros</button>}
        </div>

        {error && <div className="p-3"><Aviso>{error}</Aviso></div>}
        {!filas ? <div className="px-4"><Cargando /></div> : filas.length === 0 ? (
          <Vacio titulo="No hay activos" texto={f.q || f.empresa || f.estatus ? 'Ningún activo coincide con los filtros.' : 'Da de alta el primer activo para empezar.'}
            accion={puedeEditar && <Link className="btn-sec" to="/alta"><Plus size={16} />Alta de activos</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Código</th><th className="px-4 py-2.5 font-medium">Activo</th>
                  <th className="px-4 py-2.5 font-medium">No. econ. / Serie</th><th className="px-4 py-2.5 font-medium">Ubicación</th>
                  <th className="px-4 py-2.5 font-medium">Responsable</th><th className="px-4 py-2.5 font-medium">Estatus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filas.map(r => (
                  <tr key={r.id} className="cursor-pointer hover:bg-stone-50" onClick={() => nav(`/activos/${r.id}`)}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{r.codigo}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{r.descripcion}</p>
                      <p className="text-xs text-stone-500">{[r.categoria, r.marca, r.modelo].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <p>{r.numero_economico ?? '—'}{r.placa ? ` · ${r.placa}` : ''}</p>
                      <p className="text-stone-500">{r.serie ?? ''}</p>
                    </td>
                    <td className="px-4 py-2.5"><p>{r.ubicacion ?? '—'}</p><p className="text-xs text-stone-500">{r.empresa}</p></td>
                    <td className="px-4 py-2.5">{r.responsable || '—'}</td>
                    <td className="px-4 py-2.5"><EstatusBadge estatus={r.estatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filas && total > POR_PAGINA && (
          <div className="flex items-center justify-between border-t border-stone-200 px-4 py-2 text-sm">
            <span className="text-stone-500">Página {f.pagina} de {paginas}</span>
            <div className="flex gap-2">
              <button className="btn-sec px-2 py-1" disabled={f.pagina <= 1} onClick={() => setF('p', String(f.pagina - 1))} aria-label="Anterior"><ChevronLeft size={16} /></button>
              <button className="btn-sec px-2 py-1" disabled={f.pagina >= paginas} onClick={() => setF('p', String(f.pagina + 1))} aria-label="Siguiente"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
