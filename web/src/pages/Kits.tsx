import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Package, Plus, Pencil, Trash2, Minus, UserPlus, CheckCircle2, AlertTriangle, Search } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nombreEmpleado } from '../lib/hooks'
import { Cargando, Vacio, Modal, Campo, Aviso } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import type { Producto } from '../components/ProductoModal'

type Item = { id?: string; modelo_id: string; cantidad: number; modelos?: Producto | null }
type Kit = { id: string; nombre: string; descripcion: string | null; puesto: string | null; kit_items: Item[] }
const SELECT = '*, kit_items(id,modelo_id,cantidad,modelos(id,nombre,foto_path,descripcion,marca_id,categoria_id,marcas(nombre),categorias(nombre)))'

/** Kits por puesto: un paquete de productos que se entrega junto, con un solo resguardo. */
export default function Kits() {
  const { puedeEditar, puedeResguardar } = useAuth()
  const [sp] = useSearchParams()
  const [kits, setKits] = useState<Kit[] | null>(null)
  const [editar, setEditar] = useState<Kit | 'nuevo' | null>(null)
  const [asignar, setAsignar] = useState<Kit | null>(null)
  const cargar = () => { supabase.from('kits').select(SELECT).eq('activo', true).order('nombre').then(({ data }) => setKits((data as unknown as Kit[]) ?? [])) }
  useEffect(cargar, [])

  if (!kits) return <Cargando />
  const empleadoPre = sp.get('empleado') ?? undefined
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Kits por puesto</h1>
          <p className="mt-1 text-sm text-stone-500">Arma el paquete que lleva cada puesto (por ejemplo, residente de obra: camioneta, laptop, celular y casco) y entrégalo en un solo resguardo.</p>
        </div>
        {puedeEditar && <button className="btn-primario" onClick={() => setEditar('nuevo')}><Plus size={16} />Nuevo kit</button>}
      </div>
      {empleadoPre && <div className="mb-4"><Aviso tipo="info">Elige el kit que le vas a entregar.</Aviso></div>}
      {kits.length === 0 ? <div className="tarjeta"><Vacio titulo="Aún no hay kits" texto="Crea el primero con los productos del catálogo que lleva un puesto." /></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {kits.map((k, i) => (
            <div key={k.id} className="tarjeta viva flex min-w-0 animate-entrar flex-col p-5" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="mb-3 flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-marca/15 text-marca"><Package size={20} /></span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{k.nombre}</p><p className="truncate text-xs text-stone-500">{k.puesto ? `Para: ${k.puesto}` : k.descripcion || 'Sin puesto'}</p></div>
                {puedeEditar && <button onClick={() => setEditar(k)} className="text-stone-400 hover:text-marca" aria-label="Editar"><Pencil size={15} /></button>}
              </div>
              <ul className="mb-4 space-y-1.5">
                {k.kit_items.map(it => (
                  <li key={it.modelo_id} className="flex items-center gap-2.5 text-sm">
                    <FotoActivo fotoModelo={it.modelos?.foto_path} categoria={it.modelos?.categorias?.nombre} className="h-8 w-10 shrink-0 rounded-md" icono={14} />
                    <span className="min-w-0 flex-1 truncate">{it.modelos?.marcas?.nombre} {it.modelos?.nombre}</span>
                    <span className="cifra text-xs text-stone-500">×{it.cantidad}</span>
                  </li>
                ))}
              </ul>
              {puedeResguardar && <button className="btn-primario mt-auto" onClick={() => setAsignar(k)} disabled={!k.kit_items.length}><UserPlus size={16} />Entregar kit</button>}
            </div>
          ))}
        </div>
      )}
      <KitModal kit={editar === 'nuevo' ? null : editar} abierto={!!editar} onCerrar={() => setEditar(null)} onGuardado={() => { setEditar(null); cargar() }} />
      {asignar && <AsignarKit kit={asignar} empleadoInicial={empleadoPre} onCerrar={() => setAsignar(null)} />}
    </div>
  )
}

function KitModal({ kit, abierto, onCerrar, onGuardado }: { kit: Kit | null; abierto: boolean; onCerrar: () => void; onGuardado: () => void }) {
  const { esAdmin } = useAuth()
  const [f, setF] = useState({ nombre: '', puesto: '', descripcion: '' })
  const [items, setItems] = useState<Item[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    if (!abierto) return
    setError(''); setQ('')
    setF({ nombre: kit?.nombre ?? '', puesto: kit?.puesto ?? '', descripcion: kit?.descripcion ?? '' })
    setItems(kit?.kit_items.map(i => ({ modelo_id: i.modelo_id, cantidad: i.cantidad, modelos: i.modelos })) ?? [])
    supabase.from('modelos').select('*,marcas(nombre),categorias(nombre)').eq('activo', true).order('nombre').then(({ data }) => setProductos((data as unknown as Producto[]) ?? []))
  }, [abierto, kit])
  const t = q.trim().toLowerCase()
  const sugeridos = productos.filter(p => !items.some(i => i.modelo_id === p.id) && (!t || [p.nombre, p.marcas?.nombre, p.descripcion, p.categorias?.nombre].some(x => x?.toLowerCase().includes(t)))).slice(0, 8)

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!items.length) { setError('Agrega al menos un producto.'); return }
    setGuardando(true)
    try {
      const datos = { nombre: f.nombre.trim(), puesto: f.puesto.trim() || null, descripcion: f.descripcion.trim() || null }
      let id = kit?.id
      if (id) { const r = await supabase.from('kits').update(datos).eq('id', id); if (r.error) throw r.error; await supabase.from('kit_items').delete().eq('kit_id', id) }
      else { const r = await supabase.from('kits').insert(datos).select('id').single(); if (r.error) throw r.error; id = (r.data as { id: string }).id }
      const r2 = await supabase.from('kit_items').insert(items.map(i => ({ kit_id: id, modelo_id: i.modelo_id, cantidad: i.cantidad })))
      if (r2.error) throw r2.error
      onGuardado()
    } catch (err) { setError(mensajeError(err)) } finally { setGuardando(false) }
  }
  async function borrar() {
    if (!kit || !confirm('¿Quitar este kit?')) return
    await supabase.from('kits').update({ activo: false }).eq('id', kit.id); onGuardado()
  }
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={kit ? 'Editar kit' : 'Nuevo kit'} ancho="max-w-3xl">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre del kit *"><input className="campo" required value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Ej. Kit residente de obra" /></Campo>
          <Campo label="Para el puesto"><input className="campo" value={f.puesto} onChange={e => setF({ ...f, puesto: e.target.value })} placeholder="Ej. Residente de obra" /></Campo>
        </div>
        <div>
          <span className="etiqueta">Productos del kit</span>
          {items.length === 0 ? <p className="rounded-xl border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500">Busca abajo y agrega los productos.</p> : (
            <ul className="space-y-1.5">{items.map(it => (
              <li key={it.modelo_id} className="flex items-center gap-3 rounded-xl border border-stone-200 p-2">
                <FotoActivo fotoModelo={it.modelos?.foto_path} categoria={it.modelos?.categorias?.nombre} className="h-9 w-11 shrink-0 rounded-md" icono={14} />
                <span className="min-w-0 flex-1 truncate text-sm">{it.modelos?.marcas?.nombre} {it.modelos?.nombre}</span>
                <div className="flex items-center gap-1">
                  <button type="button" className="grid h-7 w-7 place-items-center rounded-lg border border-stone-300" onClick={() => setItems(l => l.map(x => x.modelo_id === it.modelo_id ? { ...x, cantidad: Math.max(1, x.cantidad - 1) } : x))}><Minus size={13} /></button>
                  <span className="cifra w-6 text-center text-sm">{it.cantidad}</span>
                  <button type="button" className="grid h-7 w-7 place-items-center rounded-lg border border-stone-300" onClick={() => setItems(l => l.map(x => x.modelo_id === it.modelo_id ? { ...x, cantidad: x.cantidad + 1 } : x))}><Plus size={13} /></button>
                </div>
                <button type="button" className="text-stone-400 hover:text-red-700" onClick={() => setItems(l => l.filter(x => x.modelo_id !== it.modelo_id))} aria-label="Quitar"><Trash2 size={15} /></button>
              </li>
            ))}</ul>
          )}
        </div>
        <div className="rounded-xl border border-stone-200 p-3">
          <div className="relative mb-2"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo pl-9" placeholder="Buscar en el catálogo…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {sugeridos.map(p => (
              <button key={p.id} type="button" onClick={() => setItems(l => [...l, { modelo_id: p.id, cantidad: 1, modelos: p }])} className="flex items-center gap-2 rounded-lg border border-stone-200 p-1.5 text-left text-xs hover:border-marca">
                <FotoActivo fotoModelo={p.foto_path} categoria={p.categorias?.nombre} className="h-8 w-9 shrink-0 rounded" icono={12} /><span className="min-w-0 truncate">{p.marcas?.nombre} {p.nombre}</span>
              </button>
            ))}
          </div>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex items-center gap-2">
          {kit && esAdmin && <button type="button" onClick={borrar} className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-red-700"><Trash2 size={14} />Quitar kit</button>}
          <div className="ml-auto flex gap-2"><button type="button" className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar kit'}</button></div>
        </div>
      </form>
    </Modal>
  )
}

/** Elige empleado y aparta unidades disponibles de cada producto del kit; luego abre el resguardo ya armado. */
function AsignarKit({ kit, empleadoInicial, onCerrar }: { kit: Kit; empleadoInicial?: string; onCerrar: () => void }) {
  const nav = useNavigate()
  const [empleados, setEmpleados] = useState<{ id: string; nombres: string; apellidos: string | null; puesto: string | null; empresa_id: string }[]>([])
  const [empleado, setEmpleado] = useState(empleadoInicial ?? '')
  const [disp, setDisp] = useState<{ id: string; codigo: string; serie: string | null; modelo_id: string; empresa_id: string; ubicacion: string | null }[]>([])
  useEffect(() => {
    supabase.from('empleados').select('id,nombres,apellidos,puesto,empresa_id').eq('activo', true).order('nombres').then(({ data }) => setEmpleados((data as never) ?? []))
    supabase.from('v_activos').select('id,codigo,serie,modelo_id,empresa_id,ubicacion').eq('estatus', 'disponible').in('modelo_id', kit.kit_items.map(i => i.modelo_id)).order('codigo').then(({ data }) => setDisp((data as never) ?? []))
  }, [kit])
  const emp = empleados.find(e => e.id === empleado)
  const plan = useMemo(() => kit.kit_items.map(it => {
    const libres = disp.filter(d => d.modelo_id === it.modelo_id && d.empresa_id === emp?.empresa_id)
    return { it, elegidos: libres.slice(0, it.cantidad), faltan: Math.max(0, it.cantidad - libres.length) }
  }), [kit, disp, emp])
  const ids = plan.flatMap(p => p.elegidos.map(e => e.id))
  const faltan = plan.reduce((s, p) => s + p.faltan, 0)
  const sugeridos = empleados.filter(e => kit.puesto && e.puesto?.toLowerCase().includes(kit.puesto.toLowerCase()))

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Entregar ${kit.nombre}`} ancho="max-w-2xl">
      <div className="space-y-4">
        <Campo label="¿A quién?">
          <select className="campo" value={empleado} onChange={e => setEmpleado(e.target.value)}>
            <option value="">— Elige empleado —</option>
            {sugeridos.length > 0 && <optgroup label={`Puesto ${kit.puesto}`}>{sugeridos.map(e => <option key={e.id} value={e.id}>{nombreEmpleado(e)}</option>)}</optgroup>}
            <optgroup label="Todos">{empleados.map(e => <option key={e.id} value={e.id}>{nombreEmpleado(e)}{e.puesto ? ` · ${e.puesto}` : ''}</option>)}</optgroup>
          </select>
        </Campo>
        {emp && (
          <>
            <ul className="space-y-2">{plan.map(p => (
              <li key={p.it.modelo_id} className={`rounded-xl border p-3 ${p.faltan ? 'border-amber-200 bg-amber-50/40' : 'border-stone-200'}`}>
                <div className="flex items-center gap-3">
                  <FotoActivo fotoModelo={p.it.modelos?.foto_path} categoria={p.it.modelos?.categorias?.nombre} className="h-10 w-12 shrink-0 rounded-lg" icono={16} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.it.modelos?.marcas?.nombre} {p.it.modelos?.nombre} <span className="text-stone-500">×{p.it.cantidad}</span></span>
                  {p.faltan ? <span className="inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={13} />faltan {p.faltan}</span> : <CheckCircle2 size={16} className="text-emerald-700" />}
                </div>
                {p.elegidos.length > 0 && <p className="mt-1.5 pl-[60px] font-mono text-[11px] text-marca">{p.elegidos.map(e => e.codigo + (e.serie ? ` (${e.serie})` : '')).join(' · ')}</p>}
              </li>
            ))}</ul>
            {faltan > 0 && <Aviso tipo="info">No hay suficientes unidades disponibles en su empresa para {faltan} pieza(s). Puedes entregar lo que hay y completar después, o darlas de alta primero.</Aviso>}
          </>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-sec" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primario" disabled={!emp || !ids.length} onClick={() => nav(`/resguardos/nuevo?tipo=asignacion&empresa=${emp!.empresa_id}&empleado=${emp!.id}&activos=${ids.join(',')}`)}>
            <UserPlus size={16} />Continuar al resguardo ({ids.length})
          </button>
        </div>
      </div>
    </Modal>
  )
}
