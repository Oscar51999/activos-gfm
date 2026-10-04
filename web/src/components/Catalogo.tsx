import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Plus, Search, Pencil } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista } from '../lib/hooks'
import { Encabezado, Modal, Campo, Cargando, Vacio, Aviso } from './ui'

type Fila = Record<string, unknown> & { id: string }

export type CampoDef = {
  key: string
  label: string
  tipo?: 'texto' | 'email' | 'tel' | 'numero' | 'bool' | 'enum' | 'ref' | 'textarea' | 'multi'
  opciones?: Record<string, string>
  ref?: { tabla: string; select?: string; etiqueta?: (r: Record<string, unknown>) => string; porEmpresa?: boolean }
  requerido?: boolean
  completo?: boolean
  defecto?: unknown
}

export type ColumnaDef = { key: string; label: string; render?: (f: Fila) => ReactNode }

type Props = {
  tabla: string
  titulo: string
  sub?: string
  select?: string
  orden?: string
  campos: CampoDef[]
  columnas: ColumnaDef[]
  buscarEn?: string[]
  porEmpresa?: boolean
  soloAdmin?: boolean
}

function RefSelect({ def, valor, onChange, empresaId }: { def: CampoDef; valor: unknown; onChange: (v: string | null) => void; empresaId?: string }) {
  const r = def.ref!
  const { items } = useLista(r.tabla, r.select ?? (r.porEmpresa ? 'id,nombre,empresa_id' : 'id,nombre'), r.select?.includes('nombres') ? 'nombres' : 'nombre')
  const visibles = r.porEmpresa && empresaId ? items.filter(i => i.empresa_id === empresaId) : items
  return (
    <select className="campo" value={(valor as string) ?? ''} required={def.requerido} onChange={e => onChange(e.target.value || null)}>
      <option value="">— Selecciona —</option>
      {visibles.map(i => <option key={i.id} value={i.id}>{r.etiqueta ? r.etiqueta(i) : i.nombre}</option>)}
    </select>
  )
}

export default function Catalogo(p: Props) {
  const { puedeEditar, esAdmin } = useAuth()
  const editable = p.soloAdmin ? esAdmin : puedeEditar
  const empresas = useLista('empresas')
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [q, setQ] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    let qy = supabase.from(p.tabla).select(p.select ?? '*').order(p.orden ?? 'nombre').limit(1000)
    if (!verInactivos) qy = qy.eq('activo', true)
    if (p.porEmpresa && empresaFiltro) qy = qy.eq('empresa_id', empresaFiltro)
    const { data, error } = await qy
    if (error) setError(mensajeError(error))
    setFilas((data as unknown as Fila[]) ?? [])
  }, [p.tabla, p.select, p.orden, p.porEmpresa, empresaFiltro, verInactivos])

  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    if (!filas) return null
    const t = q.trim().toLowerCase()
    if (!t) return filas
    const keys = p.buscarEn ?? ['nombre']
    return filas.filter(f => keys.some(k => String(f[k] ?? '').toLowerCase().includes(t)))
  }, [filas, q, p.buscarEn])

  function nuevo() {
    const base: Record<string, unknown> = { activo: true }
    p.campos.forEach(c => { if (c.defecto !== undefined) base[c.key] = c.defecto })
    if (p.porEmpresa) base.empresa_id = empresaFiltro || empresas.items[0]?.id
    setError(''); setEdit(base)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    setGuardando(true); setError('')
    const datos: Record<string, unknown> = { activo: edit.activo ?? true }
    if (p.porEmpresa) datos.empresa_id = edit.empresa_id
    p.campos.forEach(c => {
      let v = edit[c.key]
      if (c.tipo === 'numero') v = v === '' || v == null ? null : Number(v)
      else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim()
      datos[c.key] = v ?? (c.tipo === 'multi' ? [] : c.tipo === 'bool' ? false : null)
    })
    const res = edit.id
      ? await supabase.from(p.tabla).update(datos).eq('id', edit.id as string)
      : await supabase.from(p.tabla).insert(datos)
    setGuardando(false)
    if (res.error) { setError(mensajeError(res.error)); return }
    setEdit(null); cargar()
  }

  const set = (k: string, v: unknown) => setEdit(s => ({ ...s!, [k]: v }))

  return (
    <div>
      <Encabezado titulo={p.titulo} sub={p.sub}
        acciones={editable && <button className="btn-primario" onClick={nuevo}><Plus size={16} />Agregar</button>} />

      <div className="tarjeta">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 p-3">
          <div className="relative min-w-56 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="campo pl-9" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {p.porEmpresa && (
            <select className="campo w-auto" value={empresaFiltro} onChange={e => setEmpresaFiltro(e.target.value)}>
              <option value="">Todas las empresas</option>
              {empresas.items.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} />Ver inactivos
          </label>
        </div>

        {!visibles ? <div className="px-4"><Cargando /></div> : visibles.length === 0 ? (
          <Vacio titulo="Sin registros" texto={q ? 'Nada coincide con la búsqueda.' : 'Todavía no hay registros aquí.'}
            accion={editable && !q && <button className="btn-sec" onClick={nuevo}><Plus size={16} />Agregar el primero</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  {p.columnas.map(c => <th key={c.key} className="px-4 py-2.5 font-medium">{c.label}</th>)}
                  {editable && <th className="w-12" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visibles.map(f => (
                  <tr key={f.id} className={`hover:bg-stone-50 ${f.activo === false ? 'text-stone-400' : ''}`}>
                    {p.columnas.map(c => <td key={c.key} className="px-4 py-2.5">{c.render ? c.render(f) : String(f[c.key] ?? '—')}</td>)}
                    {editable && (
                      <td className="px-2">
                        <button className="rounded p-1.5 text-stone-500 hover:bg-stone-200" aria-label="Editar"
                          onClick={() => { setError(''); setEdit({ ...f }) }}><Pencil size={15} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {visibles && visibles.length > 0 && <div className="border-t border-stone-200 px-4 py-2 text-xs text-stone-500">{visibles.length} registros</div>}
      </div>

      <Modal abierto={!!edit} titulo={edit?.id ? `Editar ${p.titulo.toLowerCase()}` : `Agregar a ${p.titulo.toLowerCase()}`} onCerrar={() => setEdit(null)}>
        {edit && (
          <form onSubmit={guardar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {p.porEmpresa && (
                <Campo label="Empresa *" className="sm:col-span-2">
                  <select className="campo" required value={(edit.empresa_id as string) ?? ''} onChange={e => set('empresa_id', e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {empresas.items.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </Campo>
              )}
              {p.campos.map(c => (
                <Campo key={c.key} label={c.label + (c.requerido ? ' *' : '')} className={c.completo || c.tipo === 'textarea' ? 'sm:col-span-2' : ''}>
                  {c.tipo === 'bool' ? (
                    <input type="checkbox" className="h-4 w-4" checked={!!edit[c.key]} onChange={e => set(c.key, e.target.checked)} />
                  ) : c.tipo === 'enum' ? (
                    <select className="campo" required={c.requerido} value={(edit[c.key] as string) ?? ''} onChange={e => set(c.key, e.target.value || null)}>
                      <option value="">— Selecciona —</option>
                      {Object.entries(c.opciones!).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : c.tipo === 'multi' ? (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {Object.entries(c.opciones!).map(([k, v]) => {
                        const arr = (edit[c.key] as string[]) ?? []
                        return (
                          <label key={k} className="flex items-center gap-1.5 text-sm">
                            <input type="checkbox" checked={arr.includes(k)}
                              onChange={e => set(c.key, e.target.checked ? [...arr, k] : arr.filter(x => x !== k))} />{v}
                          </label>
                        )
                      })}
                    </div>
                  ) : c.tipo === 'ref' ? (
                    <RefSelect def={c} valor={edit[c.key]} onChange={v => set(c.key, v)} empresaId={edit.empresa_id as string | undefined} />
                  ) : c.tipo === 'textarea' ? (
                    <textarea className="campo" rows={3} value={(edit[c.key] as string) ?? ''} onChange={e => set(c.key, e.target.value)} />
                  ) : (
                    <input className="campo" required={c.requerido}
                      type={c.tipo === 'numero' ? 'number' : c.tipo === 'email' ? 'email' : c.tipo === 'tel' ? 'tel' : 'text'}
                      step="any" value={(edit[c.key] as string | number) ?? ''} onChange={e => set(c.key, e.target.value)} />
                  )}
                </Campo>
              ))}
              {!!edit.id && (
                <Campo label="Estado" className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={edit.activo !== false} onChange={e => set('activo', e.target.checked)} />Activo (desmarcar para darlo de baja sin borrarlo)
                  </label>
                </Campo>
              )}
            </div>
            {error && <Aviso>{error}</Aviso>}
            <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
              <button type="button" className="btn-sec" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
