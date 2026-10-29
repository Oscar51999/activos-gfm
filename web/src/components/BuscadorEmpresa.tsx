import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, X, Boxes, Users, PackageSearch, Tags, MapPin, Warehouse, Landmark, FileText, Loader2, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { nombreEmpleado } from '../lib/hooks'
import { num } from '../lib/almacen'
import FotoActivo from './FotoActivo'
import { Avatar } from './Empleados'

type Emp = { id: string; nombre: string; nombre_corto: string | null; color: string | null }
type Datos = {
  activos: { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; modelo_id: string | null; serie: string | null; numero_economico: string | null; categoria: string | null
    responsable: string | null; responsable_id: string | null; ubicacion: string | null; ubicacion_id: string | null; estatus: string; placa: string | null; rfid_epc: string | null; empresa_id: string; foto_principal: string | null; modelo_foto: string | null }[]
  empleados: { id: string; nombres: string; apellidos: string | null; puesto: string | null; email: string | null; telefono: string | null; codigo: string | null; empresa_id: string; departamentos: { nombre: string } | null }[]
  ubicaciones: { id: string; nombre: string; codigo: string | null; tipo: string | null; direccion: string | null; empresa_id: string }[]
  existencias: { consumible_id: string; nombre: string; marca: string | null; categoria: string | null; unidad: string; existencia: number; ubicacion: string | null; empresa_id: string }[]
  inmuebles: { id: string; codigo: string; nombre: string; colonia: string | null; municipio: string | null; empresa_id: string }[]
  documentos: { id: string; tipo: string; numero: string | null; emisor: string | null; activo_id: string | null; empleado_id: string | null; inmueble_id: string | null; empresa_id: string }[]
}

/** Quita acentos y mayúsculas para que "camion" encuentre "Camión". */
const norm = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const coincide = (campos: unknown[], palabras: string[]) => { const h = norm(campos.filter(Boolean).join(' ')); return palabras.every(p => h.includes(p)) }
const DOCS: Record<string, string> = { poliza_seguro: 'Póliza de seguro', tarjeta_circulacion: 'Tarjeta de circulación', verificacion: 'Verificación', licencia_manejo: 'Licencia de manejo', certificacion: 'Certificación', factura: 'Factura', garantia: 'Garantía', escritura: 'Escritura', predial: 'Predial' }

/** Buscador de todo dentro de una empresa (o de todas): activos, empleados, productos, marcas, obras, almacén, inmuebles y documentos. */
export default function BuscadorEmpresa({ empresaId, autoFocus = false }: { empresaId?: string; autoFocus?: boolean }) {
  const [empresas, setEmpresas] = useState<Emp[]>([])
  const [emp, setEmp] = useState(empresaId ?? '')
  const [q, setQ] = useState('')
  const [d, setD] = useState<Datos | null>(null)
  const [cargando, setCargando] = useState(false)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const pedido = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (empresaId === undefined) supabase.from('empresas').select('id,nombre,nombre_corto,color').eq('activo', true).order('nombre').then(({ data }) => setEmpresas((data as Emp[]) ?? [])) }, [empresaId])
  useEffect(() => { if (empresaId !== undefined) setEmp(empresaId) }, [empresaId])

  // Carga perezosa: los datos se traen la primera vez que se escribe algo.
  useEffect(() => {
    if (!q.trim() || pedido.current) return
    pedido.current = true; setCargando(true)
    const f = <T,>(p: PromiseLike<{ data: unknown }>) => Promise.resolve(p).then(r => (r.data as T[]) ?? [])
    Promise.all([
      f<Datos['activos'][number]>(supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,modelo_id,serie,numero_economico,categoria,responsable,responsable_id,ubicacion,ubicacion_id,estatus,placa,rfid_epc,empresa_id,foto_principal,modelo_foto').neq('estatus', 'baja').limit(20000)),
      f<Datos['empleados'][number]>(supabase.from('empleados').select('id,nombres,apellidos,puesto,email,telefono,codigo,empresa_id,departamentos(nombre)').eq('activo', true).limit(10000)),
      f<Datos['ubicaciones'][number]>(supabase.from('ubicaciones').select('id,nombre,codigo,tipo,direccion,empresa_id').eq('activo', true)),
      f<Datos['existencias'][number]>(supabase.from('v_existencias').select('consumible_id,nombre,marca,categoria,unidad,existencia,ubicacion,empresa_id')),
      f<Datos['inmuebles'][number]>(supabase.from('inmuebles').select('id,codigo,nombre,colonia,municipio,empresa_id').eq('activo', true)),
      f<Datos['documentos'][number]>(supabase.from('documentos').select('id,tipo,numero,emisor,activo_id,empleado_id,inmueble_id,empresa_id').eq('vigente', true).limit(10000)),
    ]).then(([activos, empleados, ubicaciones, existencias, inmuebles, documentos]) => { setD({ activos, empleados, ubicaciones, existencias, inmuebles, documentos }); setCargando(false) })
  }, [q])

  const r = useMemo(() => {
    const palabras = norm(q).split(/\s+/).filter(Boolean)
    if (!d || !palabras.length) return null
    const de = <T extends { empresa_id: string }>(l: T[]) => emp ? l.filter(x => x.empresa_id === emp) : l
    const activos = de(d.activos).filter(a => coincide([a.codigo, a.descripcion, a.marca, a.modelo, a.serie, a.numero_economico, a.categoria, a.responsable, a.ubicacion, a.placa, a.rfid_epc], palabras))
    const empleados = de(d.empleados).filter(e => coincide([nombreEmpleado(e), e.puesto, e.email, e.telefono, e.codigo, e.departamentos?.nombre], palabras))
    // productos y marcas salen de los activos de la empresa
    const prodMap = new Map<string, { id: string; marca: string | null; modelo: string | null; categoria: string | null; n: number; foto: string | null }>()
    const marcaMap = new Map<string, number>()
    for (const a of de(d.activos)) {
      if (a.modelo_id && coincide([a.marca, a.modelo, a.categoria, a.descripcion], palabras)) { const p = prodMap.get(a.modelo_id) ?? { id: a.modelo_id, marca: a.marca, modelo: a.modelo, categoria: a.categoria, n: 0, foto: a.modelo_foto }; p.n++; prodMap.set(a.modelo_id, p) }
      if (a.marca && coincide([a.marca], palabras)) marcaMap.set(a.marca, (marcaMap.get(a.marca) ?? 0) + 1)
    }
    const ubicaciones = de(d.ubicaciones).filter(u => coincide([u.nombre, u.codigo, u.tipo, u.direccion], palabras))
    const almacen = de(d.existencias).filter(x => Number(x.existencia) > 0 && coincide([x.nombre, x.marca, x.categoria, x.ubicacion], palabras))
    const inmuebles = de(d.inmuebles).filter(i => coincide([i.codigo, i.nombre, i.colonia, i.municipio], palabras))
    const documentos = de(d.documentos).filter(x => coincide([DOCS[x.tipo] ?? x.tipo, x.numero, x.emisor], palabras))
    return { activos, empleados, productos: [...prodMap.values()].sort((a, b) => b.n - a.n), marcas: [...marcaMap.entries()].sort((a, b) => b[1] - a[1]), ubicaciones, almacen, inmuebles, documentos }
  }, [d, q, emp])

  const total = r ? Object.values(r).reduce((s, l) => s + l.length, 0) : 0
  const nomEmp = (id: string) => { const e = empresas.find(x => x.id === id); return e ? e.nombre_corto || e.nombre : '' }
  const sec = (clave: string, l: unknown[]) => abiertos.has(clave) ? l : l.slice(0, 6)
  const Mas = ({ clave, n }: { clave: string; n: number }) => n > 6 ? <button className="mt-1 text-xs text-marca hover:underline" onClick={() => setAbiertos(s => { const x = new Set(s); if (x.has(clave)) x.delete(clave); else x.add(clave); return x })}>{abiertos.has(clave) ? 'Ver menos' : `Ver los ${n}`}</button> : null
  const Seccion = ({ titulo, icono: I, n, children, clave }: { titulo: string; icono: typeof Boxes; n: number; children: React.ReactNode; clave: string }) => n === 0 ? null : (
    <section className="min-w-0">
      <h3 className="etiqueta flex items-center gap-1.5"><I size={13} className="text-marca" />{titulo} · {n}</h3>
      <div className="space-y-1.5">{children}</div>
      <Mas clave={clave} n={n} />
    </section>
  )
  const fila = 'flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2 text-sm transition hover:border-marca/50'

  return (
    <div className="tarjeta p-4">
      <form onSubmit={e => e.preventDefault()} className="flex flex-wrap gap-2">
        {empresaId === undefined && (
          <select className="campo !w-auto min-w-0 sm:max-w-[14rem]" value={emp} onChange={e => setEmp(e.target.value)} aria-label="Empresa donde buscar">
            <option value="">Todas las empresas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre_corto || e.nombre}</option>)}
          </select>
        )}
        <div className="relative min-w-0 flex-1 basis-60">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input ref={input} autoFocus={autoFocus} className="campo pl-11 pr-10" value={q} onChange={e => setQ(e.target.value)}
            placeholder={empresaId ? 'Busca en esta empresa: empleado, producto, marca, serie, obra…' : 'Busca empleado, producto, marca, serie, placa, obra, documento…'} />
          {q && <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-tinta" onClick={() => { setQ(''); input.current?.focus() }} aria-label="Limpiar"><X size={16} /></button>}
        </div>
      </form>

      {q.trim() && (
        <div className="mt-4">
          {cargando || !r ? <p className="flex items-center gap-2 text-sm text-stone-500"><Loader2 size={15} className="animate-spin text-marca" />Buscando…</p>
            : total === 0 ? <p className="text-sm text-stone-500">Nada coincide con “{q.trim()}”{emp && empresaId === undefined ? ` en ${nomEmp(emp)}` : ''}.</p> : (
            <>
              <p className="mb-3 text-xs text-stone-500">{total} resultado(s){emp && empresaId === undefined ? ` en ${nomEmp(emp)}` : ''}</p>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                <Seccion titulo="Activos" icono={Boxes} n={r.activos.length} clave="act">
                  {(sec('act', r.activos) as typeof r.activos).map(a => (
                    <Link key={a.id} to={`/activos/${a.id}`} className={fila}>
                      <FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} className="h-9 w-11 shrink-0 rounded-md" icono={13} />
                      <span className="min-w-0 flex-1"><span className="block font-mono text-[10px] text-marca">{a.codigo}{!emp ? ` · ${nomEmp(a.empresa_id)}` : ''}</span>
                        <span className="block truncate">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</span>
                        <span className="block truncate text-[11px] text-stone-500">{[a.serie && `S/N ${a.serie}`, a.placa, a.responsable || a.ubicacion].filter(Boolean).join(' · ')}</span></span>
                    </Link>
                  ))}
                </Seccion>
                <Seccion titulo="Empleados" icono={Users} n={r.empleados.length} clave="emp">
                  {(sec('emp', r.empleados) as typeof r.empleados).map(e => {
                    const n = d!.activos.filter(a => a.responsable_id === e.id).length
                    return (
                      <Link key={e.id} to={`/empleados/${e.id}`} className={fila}>
                        <Avatar e={e} tam={34} />
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{nombreEmpleado(e)}</span>
                          <span className="block truncate text-[11px] text-stone-500">{[e.puesto, e.departamentos?.nombre, !emp && nomEmp(e.empresa_id)].filter(Boolean).join(' · ') || 'Sin puesto'}</span></span>
                        {n > 0 && <span className="cifra text-xs text-marca">{n} activos</span>}
                      </Link>
                    )
                  })}
                </Seccion>
                <Seccion titulo="Productos" icono={PackageSearch} n={r.productos.length} clave="prod">
                  {(sec('prod', r.productos) as typeof r.productos).map(p => (
                    <Link key={p.id} to={`/catalogo/${p.id}`} className={fila}>
                      <FotoActivo fotoModelo={p.foto} categoria={p.categoria} className="h-9 w-11 shrink-0 rounded-md" icono={13} />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{[p.marca, p.modelo].filter(Boolean).join(' ')}</span><span className="block truncate text-[11px] text-stone-500">{p.categoria}</span></span>
                      <span className="cifra text-xs text-stone-500">{p.n} unidad(es)</span>
                    </Link>
                  ))}
                </Seccion>
                <Seccion titulo="Marcas" icono={Tags} n={r.marcas.length} clave="mar">
                  {(sec('mar', r.marcas) as typeof r.marcas).map(([m, n]) => (
                    <Link key={m} to={`/activos?q=${encodeURIComponent(m)}${emp ? `&empresa=${emp}` : ''}`} className={fila}>
                      <span className="min-w-0 flex-1 truncate font-medium">{m}</span><span className="cifra text-xs text-stone-500">{n} activo(s)</span><ChevronRight size={14} className="text-stone-400" />
                    </Link>
                  ))}
                </Seccion>
                <Seccion titulo="Obras y ubicaciones" icono={MapPin} n={r.ubicaciones.length} clave="ubi">
                  {(sec('ubi', r.ubicaciones) as typeof r.ubicaciones).map(u => (
                    <Link key={u.id} to={`/activos?ubicacion=${u.id}`} className={fila}>
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{u.nombre}</span><span className="block truncate text-[11px] text-stone-500">{[u.codigo, u.tipo, !emp && nomEmp(u.empresa_id)].filter(Boolean).join(' · ')}</span></span>
                      <span className="cifra text-xs text-stone-500">{d!.activos.filter(a => a.ubicacion_id === u.id).length} equipos</span>
                    </Link>
                  ))}
                </Seccion>
                <Seccion titulo="Almacén" icono={Warehouse} n={r.almacen.length} clave="alm">
                  {(sec('alm', r.almacen) as typeof r.almacen).map((x, i) => (
                    <Link key={x.consumible_id + i} to="/almacen" className={fila}>
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{x.nombre}</span><span className="block truncate text-[11px] text-stone-500">{[x.marca, x.ubicacion, !emp && nomEmp(x.empresa_id)].filter(Boolean).join(' · ')}</span></span>
                      <span className="cifra text-xs text-stone-500">{num(x.existencia)} {x.unidad}</span>
                    </Link>
                  ))}
                </Seccion>
                <Seccion titulo="Inmuebles" icono={Landmark} n={r.inmuebles.length} clave="inm">
                  {(sec('inm', r.inmuebles) as typeof r.inmuebles).map(i => (
                    <Link key={i.id} to={`/inmuebles/${i.id}`} className={fila}>
                      <span className="min-w-0 flex-1"><span className="block font-mono text-[10px] text-marca">{i.codigo}</span><span className="block truncate font-medium">{i.nombre}</span></span>
                    </Link>
                  ))}
                </Seccion>
                <Seccion titulo="Documentos" icono={FileText} n={r.documentos.length} clave="doc">
                  {(sec('doc', r.documentos) as typeof r.documentos).map(x => (
                    <Link key={x.id} to={x.activo_id ? `/activos/${x.activo_id}` : x.empleado_id ? `/empleados/${x.empleado_id}` : x.inmueble_id ? `/inmuebles/${x.inmueble_id}` : '/vigencias'} className={fila}>
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{DOCS[x.tipo] ?? x.tipo.replace(/_/g, ' ')}</span><span className="block truncate text-[11px] text-stone-500">{[x.numero, x.emisor].filter(Boolean).join(' · ')}</span></span>
                    </Link>
                  ))}
                </Seccion>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
