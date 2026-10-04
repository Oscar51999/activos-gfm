import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useLista } from '../lib/hooks'
import { fotoProducto } from '../lib/logos'
import { Modal, Campo, Aviso } from './ui'
import FotoActivo from './FotoActivo'

export type Producto = {
  id: string; nombre: string; marca_id: string; categoria_id: string | null; foto_path: string | null; descripcion: string | null
  marcas?: { nombre: string } | null; categorias?: { nombre: string } | null
}

/** Alta o edición de un producto del catálogo: categoría + marca + modelo + foto de referencia. */
export default function ProductoModal({ abierto, onCerrar, onGuardado, producto, inicial }: {
  abierto: boolean; onCerrar: () => void; onGuardado: (p: Producto) => void; producto?: Producto | null
  inicial?: { marca?: string; modelo?: string; descripcion?: string; categoria?: string; foto?: string | null }
}) {
  const categorias = useLista('categorias')
  const marcas = useLista('marcas')
  const [categoria, setCategoria] = useState('')
  const [catNueva, setCatNueva] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [foto, setFoto] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!abierto) return
    setError(''); setCatNueva('')
    setCategoria(producto?.categoria_id ?? ''); setMarca(producto?.marcas?.nombre ?? '')
    setModelo(producto?.nombre ?? ''); setDescripcion(producto?.descripcion ?? ''); setFoto(producto?.foto_path ?? null)
    if (!producto && inicial) {
      setMarca(inicial.marca ?? ''); setModelo(inicial.modelo ?? ''); setDescripcion(inicial.descripcion ?? ''); setFoto(inicial.foto ?? null)
      const c = inicial.categoria?.toLowerCase()
      const hallada = c ? categorias.items.find(x => x.nombre.toLowerCase().includes(c) || c.includes(x.nombre.toLowerCase().replace(/s$/, ''))) : undefined
      if (hallada) setCategoria(hallada.id)
    }
  }, [abierto, producto, inicial, categorias.items])

  async function tomarFoto(f?: File | null) {
    if (!f) return
    setProcesando(true)
    try { setFoto(await fotoProducto(f)) } catch { setError('No se pudo leer la imagen.') } finally { setProcesando(false) }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setError(''); setGuardando(true)
    try {
      let catId = categoria
      if (categoria === '__nueva') {
        if (!catNueva.trim()) throw new Error('Escribe el nombre de la categoría nueva.')
        const r = await supabase.from('categorias').insert({ nombre: catNueva.trim() }).select('id').single()
        if (r.error) throw r.error
        catId = (r.data as { id: string }).id
      }
      if (!catId) throw new Error('Elige la categoría.')
      const nombreMarca = marca.trim()
      if (!nombreMarca) throw new Error('Escribe la marca.')
      let marcaId = marcas.items.find(m => m.nombre.toLowerCase() === nombreMarca.toLowerCase())?.id
      if (!marcaId) {
        const r = await supabase.from('marcas').insert({ nombre: nombreMarca }).select('id').single()
        if (r.error) throw r.error
        marcaId = (r.data as { id: string }).id
      }
      const datos = { nombre: modelo.trim(), marca_id: marcaId, categoria_id: catId, descripcion: descripcion.trim() || null, foto_path: foto }
      const q = producto
        ? supabase.from('modelos').update(datos).eq('id', producto.id).select('*,marcas(nombre),categorias(nombre)').single()
        : supabase.from('modelos').insert(datos).select('*,marcas(nombre),categorias(nombre)').single()
      const { data, error } = await q
      if (error) throw error
      categorias.recargar(); marcas.recargar()
      onGuardado(data as unknown as Producto)
    } catch (err) { setError(mensajeError(err)) } finally { setGuardando(false) }
  }

  const nombreCat = categorias.items.find(c => c.id === categoria)?.nombre
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={producto ? 'Editar producto' : 'Nuevo producto'} ancho="max-w-3xl">
      <form onSubmit={guardar} className="grid gap-6 sm:grid-cols-[15rem_1fr]">
        <div>
          <span className="etiqueta">Foto de referencia</span>
          <div onClick={() => input.current?.click()}
            onDragOver={e => { e.preventDefault(); setArrastrando(true) }} onDragLeave={() => setArrastrando(false)}
            onDrop={e => { e.preventDefault(); setArrastrando(false); tomarFoto(e.dataTransfer.files[0]) }}
            className={`group relative aspect-square cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition ${arrastrando ? 'border-marca bg-marca/10' : 'border-stone-300 hover:border-marca/60'}`}>
            {foto
              ? <img src={foto} alt="" className="h-full w-full object-cover" />
              : <FotoActivo categoria={nombreCat} className="h-full w-full" icono={56} />}
            <div className={`absolute inset-0 grid place-items-center bg-black/55 text-center text-xs text-stone-700 transition ${foto ? 'opacity-0 group-hover:opacity-100' : 'opacity-100 bg-transparent'}`}>
              {procesando ? <Loader2 className="animate-spin text-marca" /> : <span className="flex flex-col items-center gap-2"><ImagePlus size={26} className="text-marca" />{foto ? 'Cambiar foto' : <>Arrastra una foto<br />o toca para elegir</>}</span>}
            </div>
            {foto && <button type="button" onClick={e => { e.stopPropagation(); setFoto(null) }} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-stone-700 hover:text-red-700" aria-label="Quitar foto"><X size={14} /></button>}
          </div>
          <input ref={input} type="file" accept="image/*" hidden onChange={e => tomarFoto(e.target.files?.[0])} />
          <p className="mt-2 text-[11px] text-stone-400">Una foto del producto (de catálogo o tomada). Se usa en todas las unidades que no tengan foto propia.</p>
        </div>

        <div className="space-y-4">
          <Campo label="Categoría *">
            <select className="campo" value={categoria} onChange={e => setCategoria(e.target.value)} required>
              <option value="">— Elige —</option>
              {categorias.items.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              <option value="__nueva">+ Categoría nueva…</option>
            </select>
          </Campo>
          {categoria === '__nueva' && <Campo label="Nombre de la categoría nueva"><input className="campo" autoFocus value={catNueva} onChange={e => setCatNueva(e.target.value)} placeholder="Ej. Telefonía" /></Campo>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Marca *">
              <input className="campo" list="lista-marcas" required value={marca} onChange={e => setMarca(e.target.value)} placeholder="Ej. Lenovo" />
              <datalist id="lista-marcas">{marcas.items.map(m => <option key={m.id} value={m.nombre} />)}</datalist>
            </Campo>
            <Campo label="Modelo *"><input className="campo" required value={modelo} onChange={e => setModelo(e.target.value)} placeholder="Ej. ThinkPad E14" /></Campo>
          </div>
          <Campo label="Nombre con el que se conoce">
            <input className="campo" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej. Laptop 14” i5 16 GB" />
          </Campo>
          {marca && !marcas.items.some(m => m.nombre.toLowerCase() === marca.trim().toLowerCase()) && (
            <p className="text-xs text-marca">“{marca.trim()}” es una marca nueva; se agregará al catálogo.</p>
          )}
          {error && <Aviso>{error}</Aviso>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-sec" onClick={onCerrar}>Cancelar</button>
            <button className="btn-primario" disabled={guardando || procesando}>{guardando ? 'Guardando…' : producto ? 'Guardar cambios' : 'Crear producto'}</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
