import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Plus, Search, PackagePlus, Pencil, ImagePlus, Check, X, Tags, Loader2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fotoProducto } from '../lib/logos'
import { Cargando, Aviso, Modal, Campo } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import ProductoModal, { type Producto } from '../components/ProductoModal'
import LogoMarca, { iconoTipo, colorTipo } from '../components/LogoMarca'

type Cat = { id: string; nombre: string; padre_id: string | null; es_vehiculo: boolean }
type Marca = { id: string; nombre: string; logo: string | null; sitio: string | null }
type Modelo = Producto & { marca_id: string }
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Menú de marcas: tipo de producto → subtipo → marca → modelos. */
export default function MarcasMenu() {
  const { puedeEditar } = useAuth()
  const [sp, setSp] = useSearchParams()
  const tipo = sp.get('tipo'), sub = sp.get('sub'), marcaSel = sp.get('marca')
  const [cats, setCats] = useState<Cat[] | null>(null)
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [equipos, setEquipos] = useState<Map<string, number>>(new Map())
  const [q, setQ] = useState('')
  const [nuevoSub, setNuevoSub] = useState<string | null>(null)
  const [agregarMarca, setAgregarMarca] = useState(false)
  const [editarModelo, setEditarModelo] = useState<Modelo | 'nuevo' | null>(null)
  const [editarMarca, setEditarMarca] = useState<Marca | null>(null)
  const [error, setError] = useState('')

  const cargar = () => Promise.all([
    supabase.from('categorias').select('id,nombre,padre_id,es_vehiculo').eq('activo', true).order('nombre'),
    supabase.from('marcas').select('id,nombre,logo,sitio').eq('activo', true).order('nombre'),
    supabase.from('modelos').select('*,marcas(nombre),categorias(nombre)').eq('activo', true).order('nombre'),
    supabase.from('v_activos').select('modelo_id').neq('estatus', 'baja').limit(20000),
  ]).then(([c, m, mo, a]) => {
    setCats((c.data as Cat[]) ?? []); setMarcas((m.data as Marca[]) ?? []); setModelos((mo.data as unknown as Modelo[]) ?? [])
    const e = new Map<string, number>(); for (const x of (a.data ?? []) as { modelo_id: string | null }[]) if (x.modelo_id) e.set(x.modelo_id, (e.get(x.modelo_id) ?? 0) + 1)
    setEquipos(e)
  })
  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ir = (p: Record<string, string>) => { setQ(''); setSp(p) }
  const tops = useMemo(() => (cats ?? []).filter(c => !c.padre_id), [cats])
  const hijos = (id: string) => (cats ?? []).filter(c => c.padre_id === id)
  const catTipo = cats?.find(c => c.id === tipo) ?? null
  const catSub = sub === 'general' ? catTipo : cats?.find(c => c.id === sub) ?? null
  const marca = marcas.find(m => m.id === marcaSel) ?? null
  // modelos dentro de un tipo (incluye sus subtipos)
  const deTipo = (id: string) => { const ids = new Set([id, ...hijos(id).map(h => h.id)]); return modelos.filter(m => m.categoria_id && ids.has(m.categoria_id)) }
  const deSub = (id: string) => modelos.filter(m => m.categoria_id === id)
  const nEquipos = (ms: Modelo[]) => ms.reduce((s, m) => s + (equipos.get(m.id) ?? 0), 0)
  const t = norm(q.trim())

  async function crearSubtipo() {
    if (!catTipo || !nuevoSub?.trim()) return
    const { error } = await supabase.from('categorias').insert({ nombre: nuevoSub.trim(), padre_id: catTipo.id, es_vehiculo: catTipo.es_vehiculo })
    if (error) return setError(mensajeError(error))
    setNuevoSub(null); cargar()
  }

  if (!cats) return <Cargando />

  // ── Migas ──
  const migas = (
    <nav className="mb-5 flex flex-wrap items-center gap-1 text-sm text-stone-500">
      <button onClick={() => ir({})} className={`hover:text-tinta ${!tipo && !marcaSel ? 'font-medium text-tinta' : ''}`}>Tipos de producto</button>
      {catTipo && <><ChevronRight size={14} /><button onClick={() => ir({ tipo: catTipo.id })} className={`hover:text-tinta ${!sub ? 'font-medium text-tinta' : ''}`}>{catTipo.nombre}</button></>}
      {sub && catSub && <><ChevronRight size={14} /><button onClick={() => ir({ tipo: tipo!, sub })} className={`hover:text-tinta ${!marcaSel ? 'font-medium text-tinta' : ''}`}>{sub === 'general' ? 'General' : catSub.nombre}</button></>}
      {marca && <><ChevronRight size={14} /><span className="font-medium text-tinta">{marca.nombre}</span></>}
    </nav>
  )

  // ── Nivel 4: modelos de una marca (dentro de un subtipo, o todos) ──
  if (marca) {
    const base = sub ? deSub(sub === 'general' ? tipo! : sub) : tipo ? deTipo(tipo) : modelos
    const lista = base.filter(m => m.marca_id === marca.id && (!t || norm(`${m.nombre} ${m.descripcion ?? ''}`).includes(t)))
    return (
      <div>
        {migas}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <LogoMarca marca={marca} tam={72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold sm:text-3xl">{marca.nombre}</h1>
            <p className="text-sm text-stone-500">{catSub ? `${sub === 'general' ? catTipo?.nombre : catSub.nombre} · ` : ''}{lista.length} modelo(s) · {nEquipos(lista)} equipo(s)</p>
          </div>
          {puedeEditar && <button className="btn-sec" onClick={() => setEditarMarca(marca)}><ImagePlus size={15} />Logo de la marca</button>}
          {puedeEditar && <button className="btn-primario" onClick={() => setEditarModelo('nuevo')}><Plus size={15} />Nuevo modelo</button>}
        </div>
        <Buscador q={q} setQ={setQ} texto="Busca un modelo…" />
        {lista.length === 0 ? <Aviso tipo="info">Aún no hay modelos de {marca.nombre} aquí.{puedeEditar ? ' Agrega el primero con “Nuevo modelo”.' : ''}</Aviso> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {lista.map(m => (
              <div key={m.id} className="tarjeta viva overflow-hidden">
                <FotoActivo fotoModelo={m.foto_path} categoria={m.categorias?.nombre} className="aspect-[4/3] w-full" icono={36} />
                <div className="space-y-2 p-3">
                  <div><p className="truncate font-semibold">{m.nombre}</p><p className="truncate text-xs text-stone-500">{m.descripcion || m.categorias?.nombre}</p></div>
                  <p className="text-xs text-stone-500"><span className="cifra font-semibold text-tinta">{equipos.get(m.id) ?? 0}</span> equipo(s)</p>
                  <div className="flex gap-1.5">
                    {puedeEditar && <Link to={`/alta?producto=${m.id}`} className="btn-primario flex-1 !px-2 !py-1.5 text-xs"><PackagePlus size={14} />Alta</Link>}
                    <Link to={`/catalogo/${m.id}`} className="btn-sec !px-2 !py-1.5 text-xs">Ver</Link>
                    {puedeEditar && <button className="btn-sec !px-2 !py-1.5" onClick={() => setEditarModelo(m)} aria-label="Editar modelo"><Pencil size={13} /></button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {editarModelo === 'nuevo'
          ? <NuevoModelo marca={marca} categoria={catSub ?? catTipo} cats={cats} onCerrar={() => setEditarModelo(null)} onListo={() => { setEditarModelo(null); cargar() }} />
          : <ProductoModal abierto={!!editarModelo} producto={editarModelo || null} onCerrar={() => setEditarModelo(null)} onGuardado={() => { setEditarModelo(null); cargar() }} />}
        {editarMarca && <EditarMarca marca={editarMarca} onCerrar={() => setEditarMarca(null)} onListo={() => { setEditarMarca(null); cargar() }} />}
      </div>
    )
  }

  // ── Nivel 3: marcas dentro de un subtipo ──
  if (catTipo && sub && catSub) {
    const ms = deSub(sub === 'general' ? catTipo.id : sub)
    const conteo = new Map<string, Modelo[]>(); for (const m of ms) conteo.set(m.marca_id, [...(conteo.get(m.marca_id) ?? []), m])
    const lista = marcas.filter(m => conteo.has(m.id) && (!t || norm(m.nombre).includes(t))).sort((a, b) => (conteo.get(b.id)!.length - conteo.get(a.id)!.length) || a.nombre.localeCompare(b.nombre))
    const I = iconoTipo(sub === 'general' ? catTipo.nombre : catSub.nombre)
    return (
      <div>
        {migas}
        <Cabecera icono={I} color={colorTipo(catTipo.nombre)} titulo={sub === 'general' ? `${catTipo.nombre} (general)` : catSub.nombre} sub={`${lista.length} marca(s) · ${ms.length} modelo(s) · ${nEquipos(ms)} equipo(s)`}
          accion={puedeEditar ? <button className="btn-primario" onClick={() => setAgregarMarca(true)}><Plus size={15} />Agregar marca</button> : undefined} />
        <Buscador q={q} setQ={setQ} texto="Busca una marca…" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {lista.map(m => (
            <button key={m.id} onClick={() => ir({ tipo: catTipo.id, sub, marca: m.id })} className="tarjeta viva flex flex-col items-center gap-3 p-5 text-center">
              <LogoMarca marca={m} tam={64} />
              <span className="font-semibold">{m.nombre}</span>
              <span className="text-xs text-stone-500">{conteo.get(m.id)!.length} modelo(s) · {nEquipos(conteo.get(m.id)!)} equipo(s)</span>
            </button>
          ))}
          {puedeEditar && <button onClick={() => setAgregarMarca(true)} className="grid min-h-40 place-items-center rounded-2xl border-2 border-dashed border-stone-300 p-4 text-sm text-stone-500 hover:border-marca hover:text-marca"><span className="flex flex-col items-center gap-2"><Plus size={22} />Otra marca</span></button>}
        </div>
        {agregarMarca && <ElegirMarca marcas={marcas} onCerrar={() => setAgregarMarca(false)} onElegida={id => { setAgregarMarca(false); cargar().then(() => ir({ tipo: catTipo.id, sub, marca: id })) }} />}
      </div>
    )
  }

  // ── Nivel 2: subtipos de un tipo ──
  if (catTipo) {
    const subs = hijos(catTipo.id).filter(s => !t || norm(s.nombre).includes(t))
    const generales = deSub(catTipo.id)
    const color = colorTipo(catTipo.nombre)
    return (
      <div>
        {migas}
        <Cabecera icono={iconoTipo(catTipo.nombre)} color={color} titulo={catTipo.nombre} sub={`${hijos(catTipo.id).length} subtipo(s) · ${deTipo(catTipo.id).length} modelo(s) · ${nEquipos(deTipo(catTipo.id))} equipo(s)`}
          accion={puedeEditar ? <button className="btn-sec" onClick={() => setNuevoSub('')}><Plus size={15} />Subtipo</button> : undefined} />
        {nuevoSub !== null && (
          <div className="tarjeta mb-4 flex flex-wrap items-center gap-2 p-3">
            <input className="campo min-w-0 flex-1" autoFocus value={nuevoSub} onChange={e => setNuevoSub(e.target.value)} onKeyDown={e => e.key === 'Enter' && crearSubtipo()} placeholder={`Nuevo subtipo de ${catTipo.nombre} (ej. Laptops)`} />
            <button className="btn-primario" onClick={crearSubtipo}><Check size={15} />Crear</button>
            <button className="btn-sec" onClick={() => setNuevoSub(null)}><X size={15} /></button>
          </div>
        )}
        {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}
        <Buscador q={q} setQ={setQ} texto="Busca un subtipo…" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {subs.map(s => <TarjetaTipo key={s.id} nombre={s.nombre} color={color} detalle={`${deSub(s.id).length} modelo(s) · ${nEquipos(deSub(s.id))} equipo(s)`} onClick={() => ir({ tipo: catTipo.id, sub: s.id })} />)}
          {generales.length > 0 && <TarjetaTipo nombre="General" icono={iconoTipo(catTipo.nombre)} color={color} detalle={`${generales.length} modelo(s) sin subtipo`} onClick={() => ir({ tipo: catTipo.id, sub: 'general' })} />}
        </div>
      </div>
    )
  }

  // ── Nivel 1: tipos de producto ──
  const marcasFiltradas = t ? marcas.filter(m => norm(m.nombre).includes(t)) : []
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold sm:text-3xl"><Tags className="text-marca" />Marcas y modelos</h1>
          <p className="mt-1 text-sm text-stone-500">Elige el tipo de producto, luego el subtipo y la marca para ver o agregar sus modelos.</p>
        </div>
      </div>
      <Buscador q={q} setQ={setQ} texto="Busca una marca directo (ej. Lenovo, Toyota)…" />
      {t && (
        <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {marcasFiltradas.map(m => (
            <button key={m.id} onClick={() => ir({ marca: m.id })} className="tarjeta viva flex flex-col items-center gap-2 p-4 text-center">
              <LogoMarca marca={m} tam={52} /><span className="text-sm font-medium">{m.nombre}</span>
              <span className="text-[11px] text-stone-500">{modelos.filter(x => x.marca_id === m.id).length} modelo(s)</span>
            </button>
          ))}
          {!marcasFiltradas.length && <p className="col-span-full text-sm text-stone-500">No hay marcas con ese nombre.</p>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tops.map(c => {
          const I = iconoTipo(c.nombre), color = colorTipo(c.nombre), ms = deTipo(c.id)
          return (
            <button key={c.id} onClick={() => ir({ tipo: c.id })} className="tarjeta viva group overflow-hidden text-left">
              <span className="relative grid h-36 place-items-center overflow-hidden" style={{ background: `radial-gradient(120% 90% at 50% 100%, ${color}40, ${color}10 60%, transparent)` }}>
                <span className="absolute -right-6 -top-6 h-28 w-28 rounded-full opacity-20" style={{ background: color }} />
                <I size={64} strokeWidth={1.4} style={{ color }} className="relative transition duration-300 group-hover:scale-110" />
              </span>
              <span className="block p-4">
                <span className="block font-semibold">{c.nombre}</span>
                <span className="mt-0.5 block text-xs text-stone-500">{hijos(c.id).length} subtipos · {ms.length} modelos · {nEquipos(ms)} equipos</span>
                <span className="mt-2 flex flex-wrap gap-1">{hijos(c.id).slice(0, 4).map(h => <span key={h.id} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600">{h.nombre}</span>)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Buscador({ q, setQ, texto }: { q: string; setQ: (v: string) => void; texto: string }) {
  return <div className="relative mb-4"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder={texto} /></div>
}

function Cabecera({ icono: I, color, titulo, sub, accion }: { icono: ReturnType<typeof iconoTipo>; color: string; titulo: string; sub: string; accion?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4">
      <span className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: `${color}22`, color }}><I size={32} strokeWidth={1.6} /></span>
      <div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold sm:text-3xl">{titulo}</h1><p className="text-sm text-stone-500">{sub}</p></div>
      {accion}
    </div>
  )
}

function TarjetaTipo({ nombre, detalle, color, icono, onClick }: { nombre: string; detalle: string; color: string; icono?: ReturnType<typeof iconoTipo>; onClick: () => void }) {
  const I = icono ?? iconoTipo(nombre)
  return (
    <button onClick={onClick} className="tarjeta viva group flex items-center gap-4 p-4 text-left">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl transition group-hover:scale-105" style={{ background: `${color}22`, color }}><I size={28} strokeWidth={1.6} /></span>
      <span className="min-w-0"><span className="block truncate font-semibold">{nombre}</span><span className="block text-xs text-stone-500">{detalle}</span></span>
    </button>
  )
}

/** Elegir una marca existente o crear una nueva para agregarla al subtipo. */
function ElegirMarca({ marcas, onCerrar, onElegida }: { marcas: Marca[]; onCerrar: () => void; onElegida: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const t = norm(q.trim())
  const lista = marcas.filter(m => !t || norm(m.nombre).includes(t)).slice(0, 40)
  const existe = marcas.some(m => norm(m.nombre) === t)
  async function crear() {
    const { data, error } = await supabase.from('marcas').insert({ nombre: q.trim() }).select('id').single()
    if (error) return setError(mensajeError(error))
    onElegida((data as { id: string }).id)
  }
  return (
    <Modal abierto titulo="Agregar marca" onCerrar={onCerrar} ancho="max-w-xl">
      <div className="space-y-3">
        <Buscador q={q} setQ={setQ} texto="Escribe la marca (ej. Lenovo)" />
        <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {lista.map(m => <button key={m.id} onClick={() => onElegida(m.id)} className="flex flex-col items-center gap-1.5 rounded-xl border border-stone-200 p-3 text-xs hover:border-marca"><LogoMarca marca={m} tam={40} />{m.nombre}</button>)}
        </div>
        {q.trim() && !existe && <button className="btn-primario w-full" onClick={crear}><Plus size={15} />Crear la marca “{q.trim()}”</button>}
        {error && <Aviso>{error}</Aviso>}
        <p className="text-xs text-stone-500">Después de elegirla agregas sus modelos. El logo se busca solo; si no aparece, lo subes desde la marca.</p>
      </div>
    </Modal>
  )
}

function EditarMarca({ marca, onCerrar, onListo }: { marca: Marca; onCerrar: () => void; onListo: () => void }) {
  const [logo, setLogo] = useState(marca.logo)
  const [sitio, setSitio] = useState(marca.sitio ?? '')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  async function guardar() {
    const { error } = await supabase.from('marcas').update({ logo, sitio: sitio.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || null }).eq('id', marca.id)
    if (error) return setError(mensajeError(error))
    onListo()
  }
  return (
    <Modal abierto titulo={`Logo de ${marca.nombre}`} onCerrar={onCerrar} ancho="max-w-md">
      <div className="space-y-4">
        <div className="flex items-center gap-4"><LogoMarca key={logo ?? sitio} marca={{ ...marca, logo, sitio }} tam={80} />
          <div className="flex flex-col gap-2"><button className="btn-sec" onClick={() => input.current?.click()}><ImagePlus size={15} />Subir imagen</button>{logo && <button className="text-xs text-stone-500 hover:text-red-700" onClick={() => setLogo(null)}>Quitar imagen</button>}</div></div>
        <input ref={input} type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) setLogo(await fotoProducto(f, 256)) }} />
        <Campo label="Sitio web (para buscar el logo solo)"><input className="campo" value={sitio} onChange={e => setSitio(e.target.value)} placeholder="lenovo.com" /></Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}><Check size={15} />Guardar</button></div>
      </div>
    </Modal>
  )
}

/** Modelo nuevo de una marca dentro del subtipo actual. */
function NuevoModelo({ marca, categoria, cats, onCerrar, onListo }: { marca: Marca; categoria: Cat | null; cats: Cat[]; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({ nombre: '', descripcion: '', categoria_id: categoria?.id ?? '' })
  const [foto, setFoto] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  async function guardar() {
    if (!f.nombre.trim()) return setError('Escribe el modelo.')
    if (!f.categoria_id) return setError('Elige el tipo de producto.')
    const { error } = await supabase.from('modelos').insert({ marca_id: marca.id, nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null, categoria_id: f.categoria_id, foto_path: foto })
    if (error) return setError(/duplicate|unique/i.test(error.message) ? `${marca.nombre} ${f.nombre.trim()} ya existe.` : mensajeError(error))
    onListo()
  }
  const opciones = cats.filter(c => !c.padre_id).flatMap(p => [p, ...cats.filter(c => c.padre_id === p.id)])
  return (
    <Modal abierto titulo={`Nuevo modelo de ${marca.nombre}`} onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Modelo *" className="sm:col-span-2"><input className="campo" autoFocus value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="ThinkPad E14 Gen 5" /></Campo>
          <Campo label="Descripción" className="sm:col-span-2"><input className="campo" value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} placeholder="Laptop 14 pulgadas, i5, 16 GB" /></Campo>
          <Campo label="Tipo de producto" className="sm:col-span-2">
            <select className="campo" value={f.categoria_id} onChange={e => setF({ ...f, categoria_id: e.target.value })}>
              <option value="">Elige…</option>
              {opciones.map(c => <option key={c.id} value={c.id}>{c.padre_id ? `   └ ${c.nombre}` : c.nombre}</option>)}
            </select>
          </Campo>
        </div>
        <div className="flex items-center gap-3">
          {foto ? <img src={foto} alt="" className="h-20 w-24 rounded-lg object-cover" /> : <span className="grid h-20 w-24 place-items-center rounded-lg border border-dashed border-stone-300 text-stone-400"><ImagePlus size={20} /></span>}
          <button className="btn-sec" disabled={procesando} onClick={() => input.current?.click()}>{procesando ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}Foto de referencia</button>
          <input ref={input} type="file" accept="image/*" hidden onChange={async e => { const x = e.target.files?.[0]; if (!x) return; setProcesando(true); try { setFoto(await fotoProducto(x)) } finally { setProcesando(false) } }} />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}><Check size={15} />Guardar modelo</button></div>
      </div>
    </Modal>
  )
}
