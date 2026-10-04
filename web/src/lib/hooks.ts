import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Opcion = { id: string; nombre: string; [k: string]: unknown }

/** Lista simple para selects (id + nombre + extras). */
export function useLista(tabla: string, select = 'id,nombre', orden = 'nombre', soloActivos = true) {
  const [items, setItems] = useState<Opcion[]>([])
  const cargar = useCallback(async () => {
    let q = supabase.from(tabla).select(select).order(orden)
    if (soloActivos) q = q.eq('activo', true)
    const { data } = await q
    setItems((data as unknown as Opcion[]) ?? [])
  }, [tabla, select, orden, soloActivos])
  useEffect(() => { cargar() }, [cargar])
  return { items, recargar: cargar }
}

export function nombreEmpleado(e: { nombres?: string | null; apellidos?: string | null } | null | undefined) {
  if (!e) return ''
  return [e.nombres, e.apellidos].filter(Boolean).join(' ')
}

export function moneda(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

export function fecha(v: string | null | undefined) {
  if (!v) return '—'
  const d = v.length === 10 ? new Date(v + 'T12:00:00') : new Date(v)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}
