import { useState } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'

type Cat = { id: string; nombre: string; padre_id?: unknown }

/** Opciones de categoría agrupadas: tipo de equipo (Equipo mayor, Cómputo, Vehículos…) y sus subtipos. */
export function OpcionesCategoria({ items }: { items: Cat[] }) {
  const tipos = items.filter(c => !c.padre_id).sort((a, b) => a.nombre.localeCompare(b.nombre))
  const huerfanas = items.filter(c => c.padre_id && !items.some(t => t.id === c.padre_id))
  return <>
    {tipos.map(t => {
      const hijos = items.filter(c => c.padre_id === t.id).sort((a, b) => a.nombre.localeCompare(b.nombre))
      return hijos.length ? (
        <optgroup key={t.id} label={t.nombre}>
          <option value={t.id}>{t.nombre} (general)</option>
          {hijos.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}
        </optgroup>
      ) : <option key={t.id} value={t.id}>{t.nombre}</option>
    })}
    {huerfanas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
  </>
}

/** Campo pequeño para crear algo sin salir del formulario (marca, modelo, categoría). */
export function NuevoEnLinea({ etiqueta, placeholder, onCrear, deshabilitado, extra }: {
  etiqueta: string; placeholder: string; onCrear: (nombre: string, extra?: string) => Promise<string | null>; deshabilitado?: boolean
  extra?: { etiqueta: string; opciones: { id: string; nombre: string }[] }
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [ex, setEx] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  async function crear() {
    if (!nombre.trim()) return
    setGuardando(true); setError('')
    const e = await onCrear(nombre.trim(), ex || undefined)
    setGuardando(false)
    if (e) setError(e); else { setNombre(''); setEx(''); setAbierto(false) }
  }
  if (!abierto) return <button type="button" className="btn-sec px-2.5" title={etiqueta} aria-label={etiqueta} disabled={deshabilitado} onClick={() => setAbierto(true)}><Plus size={16} /></button>
  return (
    <div className="absolute inset-x-0 top-full z-20 mt-1 space-y-2 rounded-xl border border-marca/40 bg-panel p-2 shadow-xl">
      <p className="text-[11px] font-medium uppercase tracking-wider text-marca">{etiqueta}</p>
      {extra && <select className="campo !py-1.5 text-sm" value={ex} onChange={e => setEx(e.target.value)}><option value="">{extra.etiqueta}</option>{extra.opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select>}
      <div className="flex gap-1.5">
        <input className="campo !py-1.5 text-sm" autoFocus value={nombre} placeholder={placeholder} onChange={e => setNombre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crear() } if (e.key === 'Escape') setAbierto(false) }} />
        <button type="button" className="btn-primario !px-2.5 !py-1.5" disabled={guardando || !nombre.trim()} onClick={crear} aria-label="Crear"><Check size={15} /></button>
        <button type="button" className="btn-sec !px-2.5 !py-1.5" onClick={() => setAbierto(false)} aria-label="Cancelar"><X size={15} /></button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** Crea marca si no existe (sin importar mayúsculas) y regresa su id. */
export async function asegurarMarca(nombre: string, existentes: { id: string; nombre: string }[]): Promise<string> {
  const ya = existentes.find(m => m.nombre.toLowerCase() === nombre.toLowerCase())
  if (ya) return ya.id
  const sitio = /^[a-z0-9-]+$/i.test(nombre) ? `${nombre.toLowerCase()}.com` : null
  const { data, error } = await supabase.from('marcas').insert({ nombre, sitio }).select('id').single()
  if (error) throw new Error(mensajeError(error))
  return (data as { id: string }).id
}
