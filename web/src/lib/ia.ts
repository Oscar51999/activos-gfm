import { supabase } from './supabase'
import { fotoProducto } from './logos'

export type Lectura = { marca: string | null; modelo: string | null; serie: string | null; categoria: string | null; descripcion: string | null; otros_textos?: string[]; confianza?: 'alta' | 'media' | 'baja'; foto?: string }

/** Manda la foto a la función `leer-etiqueta` y regresa lo que se alcanzó a leer. */
export async function leerEtiqueta(archivo: File): Promise<Lectura> {
  const imagen = await fotoProducto(archivo, 1400)
  const { data, error } = await supabase.functions.invoke('leer-etiqueta', { body: { imagen } })
  if (error) {
    let msg = error.message
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error } catch { /* sin detalle */ }
    throw new Error(msg)
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return { ...(data as Lectura), foto: imagen }
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/** Busca en el catálogo el producto que coincide con lo leído (marca + modelo, tolerante a espacios y guiones). */
export function buscarProducto<T extends { nombre: string; marcas?: { nombre: string } | null }>(lista: T[], l: Lectura): T | null {
  const mo = norm(l.modelo), ma = norm(l.marca)
  if (!mo) return null
  const candidatos = lista.filter(p => { const n = norm(p.nombre); return n && (n === mo || n.includes(mo) || mo.includes(n)) })
  return candidatos.find(p => !ma || norm(p.marcas?.nombre) === ma) ?? (ma ? null : candidatos[0] ?? null)
}
