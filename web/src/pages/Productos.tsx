import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Search, PackagePlus, Pencil, ArrowLeft, Tags, Layers } from 'lucide-react'
import { supabase, type Estatus } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Cargando, Vacio, EstatusBadge } from '../components/ui'
import FotoActivo, { iconoCategoria } from '../components/FotoActivo'
import ProductoModal, { type Producto } from '../components/ProductoModal'

type Unidad = { id: string; codigo: string; serie: string | null; numero_economico: string | null; estatus: Estatus; modelo_id: string | null
  empresa: string; ubicacion: string | null; responsable: string | null; foto_principal: string | null }

function conteo(unidades: Unidad[]) {
  const m = new Map<string, { total: number; disp: number; asig: number }>()
  for (const u of unidades) {
    if (!u.modelo_id || u.estatus === 'baja') continue
    const c = m.get(u.modelo_id) ?? { total: 0, disp: 0, asig: 0 }
    c.total++; if (u.estatus === 'disponible') c.disp++; if (u.estatus === 'asignado') c.asig++
    m.set(u.modelo_id, c)
  }
  return m
}

/** Catálogo de productos: cada tarjeta es un modelo (marca + modelo + foto) con sus unidades. */
export default function Productos() {
  const { puedeEditar } = useAuth()
  const nav = useNavigate()
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [cat, setCat] = useState('')
  const [marca, setMarca] = useState('')
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(false)

  const cargar = () => {
    supabase.from('modelos').select('*,marcas(nombre),categorias(nombre)').eq('activo', true).order('nombre')
      .then(({ data }) => setProductos((data as unknown as Producto[]) ?? []))
    supabase.from('v_activos').select('id,modelo_id,estatus').limit(20000).then(({ data }) => setUnidades((data as Unidad[]) ?? []))
  }
  useEffect(cargar, [])

  const cuenta = useMemo(() => conteo(unidades), [unidades])
  const cats = useMemo(() => {
    const m = new Map<string, { nombre: string; n: number }>()
    productos?.forEach(p => { if (!p.categoria_id) return; const c = m.get(p.categoria_id) ?? { nombre: p.categorias?.nombre ?? '', n: 0 }; c.n++; m.set(p.categoria_id, c) })
    return [...m.entries()].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre))
  }, [productos])
  const marcas = useMemo(() => [...new Set(productos?.map(p => p.marcas?.nombre).filter(Boolean) as string[])].sort(), [productos])

  if (!productos) return <Cargando />
  const t = q.trim().toLowerCase()
  const lista = productos.filter(p => (!cat || p.categoria_id === cat) && (!marca || p.marcas?.nombre === marca)
    && (!t || [p.nombre, p.marcas?.nombre, p.descripcion, p.categorias?.nombre].some(x => x?.toLowerCase().includes(t))))

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Catálogo de productos</h1>
          <p className="mt-1 text-sm text-stone-500">Cada producto se captura una vez con su foto. Las unidades solo llevan serie, código y a dónde van.</p>
        </div>
        {puedeEditar && <div className="flex flex-wrap gap-2">
          <button className="btn-sec" onClick={() => setModal(true)}><Plus size={16} />Nuevo producto</button>
          <Link to="/alta" className="btn-primario"><PackagePlus size={16} />Alta de activos</Link>
        </div>}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="campo pl-10" placeholder="Buscar marca, modelo o nombre…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="campo w-auto" value={marca} onChange={e => setMarca(e.target.value)}>
          <option value="">Todas las marcas</option>{marcas.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
        <button onClick={() => setCat('')} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${!cat ? 'border-marca bg-marca text-[#120D04]' : 'border-stone-300 text-stone-600 hover:border-marca/60'}`}>
          Todo <span className="opacity-60">{productos.length}</span>
        </button>
        {cats.map(([id, c]) => {
          const I = iconoCategoria(c.nombre)
          return (
            <button key={id} onClick={() => setCat(cat === id ? '' : id)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${cat === id ? 'border-marca bg-marca text-[#120D04]' : 'border-stone-300 text-stone-600 hover:border-marca/60'}`}>
              <I size={13} />{c.nombre} <span className="opacity-60">{c.n}</span>
            </button>
          )
        })}
      </div>

      {lista.length === 0 ? (
        <div className="tarjeta"><Vacio titulo={productos.length ? 'Sin coincidencias' : 'Aún no hay productos'} texto={productos.length ? 'Prueba con otra búsqueda o categoría.' : 'Crea el primero: categoría, marca, modelo y una foto.'}
          accion={puedeEditar && <button className="btn-primario" onClick={() => setModal(true)}><Plus size={16} />Nuevo producto</button>} /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {lista.map((p, i) => {
            const c = cuenta.get(p.id) ?? { total: 0, disp: 0, asig: 0 }
            return (
              <Link key={p.id} to={`/catalogo/${p.id}`} className="tarjeta viva group min-w-0 animate-entrar overflow-hidden" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                <FotoActivo fotoModelo={p.foto_path} categoria={p.categorias?.nombre} className="aspect-[4/3] w-full border-b border-stone-200" icono={44} />
                <div className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-marca">{p.marcas?.nombre}</p>
                  <p className="truncate font-display text-[15px] font-semibold">{p.nombre}</p>
                  <p className="truncate text-xs text-stone-500">{p.descripcion || p.categorias?.nombre}</p>
                  <div className="mt-3 flex items-center gap-3 text-[11px]">
                    <span className="cifra text-base font-semibold text-tinta">{c.total}</span><span className="text-stone-400">unidades</span>
                    <span className="ml-auto flex gap-2">
                      <span className="text-emerald-700" title="Disponibles">● {c.disp}</span>
                      <span className="text-sky-700" title="Asignadas">● {c.asig}</span>
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <ProductoModal abierto={modal} onCerrar={() => setModal(false)} onGuardado={p => { setModal(false); cargar(); nav(`/catalogo/${p.id}`) }} />
    </div>
  )
}

export function ProductoDetalle() {
  const { id } = useParams()
  const { puedeEditar } = useAuth()
  const [p, setP] = useState<Producto | null>(null)
  const [unidades, setUnidades] = useState<Unidad[] | null>(null)
  const [editar, setEditar] = useState(false)

  const cargar = () => {
    supabase.from('modelos').select('*,marcas(nombre),categorias(nombre)').eq('id', id!).single().then(({ data }) => setP(data as unknown as Producto))
    supabase.from('v_activos').select('id,codigo,serie,numero_economico,estatus,modelo_id,empresa,ubicacion,responsable,foto_principal').eq('modelo_id', id!).order('codigo')
      .then(({ data }) => setUnidades((data as Unidad[]) ?? []))
  }
  useEffect(cargar, [id])

  if (!p || !unidades) return <Cargando />
  const vivos = unidades.filter(u => u.estatus !== 'baja')
  const k = (e: Estatus) => vivos.filter(u => u.estatus === e).length
  return (
    <div>
      <Link to="/catalogo" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Catálogo</Link>
      <div className="mb-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="tarjeta overflow-hidden"><FotoActivo fotoModelo={p.foto_path} categoria={p.categorias?.nombre} className="aspect-square w-full" icono={80} /></div>
        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-marca">{p.marcas?.nombre} · {p.categorias?.nombre}</p>
          <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{p.nombre}</h1>
          {p.descripcion && <p className="mt-1 text-stone-500">{p.descripcion}</p>}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([['Unidades', vivos.length, ''], ['Disponibles', k('disponible'), 'text-emerald-700'], ['Asignadas', k('asignado'), 'text-sky-700'], ['En taller', k('mantenimiento'), 'text-amber-700']] as const).map(([t, n, c]) => (
              <div key={t} className="tarjeta p-4"><p className="text-[10px] uppercase tracking-wider text-stone-500">{t}</p><p className={`cifra mt-1 text-3xl font-semibold ${c}`}>{n}</p></div>
            ))}
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-6">
            {puedeEditar && <Link to={`/alta?producto=${p.id}`} className="btn-primario"><PackagePlus size={16} />Agregar unidades</Link>}
            {puedeEditar && <button className="btn-sec" onClick={() => setEditar(true)}><Pencil size={16} />Editar producto</button>}
            {vivos.length > 0 && <Link to={`/etiquetas?ids=${vivos.map(u => u.id).join(',')}`} className="btn-sec"><Tags size={16} />Etiquetas QR</Link>}
          </div>
        </div>
      </div>

      <section className="tarjeta overflow-hidden">
        <h2 className="flex items-center gap-2 border-b border-stone-200 px-5 py-4 text-sm font-semibold"><Layers size={16} className="text-marca" />Unidades de este producto</h2>
        {unidades.length === 0 ? <Vacio titulo="Sin unidades todavía" texto="Agrega las unidades con sus números de serie." /> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-stone-200 text-left text-stone-500"><th className="px-5 py-2.5">Código</th><th className="px-3 py-2.5">Serie / No. econ.</th><th className="px-3 py-2.5">Empresa</th><th className="px-3 py-2.5">Dónde / quién</th><th className="px-3 py-2.5">Estatus</th></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {unidades.map(u => (
                <tr key={u.id} className="hover:bg-stone-50">
                  <td className="whitespace-nowrap px-5 py-2.5"><Link to={`/activos/${u.id}`} className="font-mono text-xs text-marca hover:underline">{u.codigo}</Link></td>
                  <td className="px-3 py-2.5">{[u.serie, u.numero_economico].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-3 py-2.5 text-stone-600">{u.empresa}</td>
                  <td className="px-3 py-2.5">{u.responsable || <span className="text-stone-500">{u.ubicacion ?? '—'}</span>}</td>
                  <td className="px-3 py-2.5"><EstatusBadge estatus={u.estatus} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
      <ProductoModal abierto={editar} producto={p} onCerrar={() => setEditar(false)} onGuardado={() => { setEditar(false); cargar() }} />
    </div>
  )
}
