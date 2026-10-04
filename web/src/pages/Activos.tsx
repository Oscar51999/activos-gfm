import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, Download, ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { supabase, ESTATUS, mensajeError, type Estatus } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista } from '../lib/hooks'
import { Encabezado, EstatusBadge, Cargando, Vacio, Aviso } from '../components/ui'

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
  const categorias = useLista('categorias')
  const ubicaciones = useLista('ubicaciones', 'id,nombre,empresa_id')
  const [filas, setFilas] = useState<ActivoFila[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [texto, setTexto] = useState(sp.get('q') ?? '')

  const f = {
    q: sp.get('q') ?? '', empresa: sp.get('empresa') ?? '', categoria: sp.get('categoria') ?? '',
    ubicacion: sp.get('ubicacion') ?? '', estatus: sp.get('estatus') ?? '', pagina: Number(sp.get('p') ?? 1),
  }
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
    if (f.ubicacion) q = q.eq('ubicacion_id', f.ubicacion)
    if (f.estatus) q = q.eq('estatus', f.estatus)
    if (f.q) {
      const t = f.q.replace(/[%,()]/g, ' ').trim()
      q = q.or(`codigo.ilike.%${t}%,descripcion.ilike.%${t}%,serie.ilike.%${t}%,numero_economico.ilike.%${t}%,placa.ilike.%${t}%,responsable.ilike.%${t}%`)
    }
    return q.order('codigo', { ascending: false })
  }, [f.empresa, f.categoria, f.ubicacion, f.estatus, f.q])

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

  async function exportar() {
    const { data, error } = await consulta(false).limit(10000)
    if (error) { setError(mensajeError(error)); return }
    const cols: [keyof ActivoFila, string][] = [['codigo', 'Código'], ['descripcion', 'Descripción'], ['categoria', 'Categoría'], ['marca', 'Marca'], ['modelo', 'Modelo'],
      ['serie', 'Serie'], ['numero_economico', 'No. económico'], ['placa', 'Placa'], ['estatus', 'Estatus'], ['empresa', 'Empresa'], ['ubicacion', 'Ubicación'], ['responsable', 'Responsable']]
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [cols.map(c => esc(c[1])).join(','), ...(data as ActivoFila[]).map(r => cols.map(c => esc(c[0] === 'estatus' ? ESTATUS[r.estatus].texto : r[c[0]])).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `activos-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const ubicVisibles = f.empresa ? ubicaciones.items.filter(u => u.empresa_id === f.empresa) : ubicaciones.items

  return (
    <div>
      <Encabezado titulo="Activos" sub={filas ? `${total.toLocaleString('es-MX')} activos` : ' '}
        acciones={<>
          <button className="btn-sec" onClick={exportar}><Download size={16} />Excel (CSV)</button>
          <Link className="btn-sec" to={`/etiquetas?${sp.toString()}`}><Printer size={16} />Imprimir etiquetas</Link>
          {puedeEditar && <Link className="btn-primario" to="/alta"><Plus size={16} />Alta de activos</Link>}
        </>} />

      <div className="tarjeta">
        <div className="grid gap-3 border-b border-stone-200 p-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="campo pl-9" placeholder="Código, descripción, serie, placa, responsable…" value={texto} onChange={e => setTexto(e.target.value)} />
          </div>
          <select className="campo" value={f.empresa} onChange={e => { setF('empresa', e.target.value) }}>
            <option value="">Todas las empresas</option>{empresas.items.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
          <select className="campo" value={f.ubicacion} onChange={e => setF('ubicacion', e.target.value)}>
            <option value="">Todas las ubicaciones</option>{ubicVisibles.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
          <select className="campo" value={f.categoria} onChange={e => setF('categoria', e.target.value)}>
            <option value="">Todas las categorías</option>{categorias.items.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
          <select className="campo" value={f.estatus} onChange={e => setF('estatus', e.target.value)}>
            <option value="">Todos los estatus</option>{Object.entries(ESTATUS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select>
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
