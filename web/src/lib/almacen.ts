import { supabase } from './supabase'

export type Consumible = { id: string; nombre: string; categoria: string | null; unidad: string; marca: string | null; foto: string | null; minimo: number; activo: boolean }
export type Existencia = { consumible_id: string; nombre: string; categoria: string | null; unidad: string; marca: string | null; foto: string | null; minimo: number
  empresa_id: string; empresa: string; ubicacion_id: string | null; ubicacion: string | null; existencia: number; ultimo_movimiento: string }
export type ItemSolicitud =
  | { tipo: 'producto'; modelo_id: string; cantidad: number; nombre?: string }
  | { tipo: 'consumible'; consumible_id: string; cantidad: number; nombre?: string }
  | { tipo: 'libre'; descripcion: string; cantidad: number }

export const CATEGORIAS_CONS = ['EPP', 'Herramienta menor', 'Consumible de obra', 'Papelería', 'Limpieza', 'Cómputo', 'Otro']
export const UNIDADES = ['pieza', 'par', 'caja', 'paquete', 'litro', 'galón', 'metro', 'rollo', 'kilo', 'juego']

export const num = (n: number) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 })
export const plural = (u: string, n: number) => Number(n) === 1 ? u : u.endsWith('n') || u.endsWith('r') || u.endsWith('l') ? u + 'es' : u + 's'

/** Total por consumible y empresa (el mínimo se cuida por empresa, sumando todos sus lugares). */
export function totales(ex: Existencia[]) {
  const m = new Map<string, { consumible_id: string; empresa_id: string; empresa: string; nombre: string; unidad: string; minimo: number; total: number }>()
  for (const e of ex) {
    const k = e.consumible_id + '|' + e.empresa_id
    const t = m.get(k) ?? { consumible_id: e.consumible_id, empresa_id: e.empresa_id, empresa: e.empresa, nombre: e.nombre, unidad: e.unidad, minimo: Number(e.minimo), total: 0 }
    t.total += Number(e.existencia); m.set(k, t)
  }
  return [...m.values()]
}
export const bajoMinimo = (ex: Existencia[]) => totales(ex).filter(t => t.minimo > 0 && t.total < t.minimo)

/** Cuántas solicitudes esperan respuesta y cuántos consumibles están bajo mínimo (para avisos del menú y del tablero). */
export async function avisosAlmacen() {
  const [s, e] = await Promise.all([
    supabase.from('solicitudes').select('estatus').in('estatus', ['pendiente', 'aprobada']),
    supabase.from('v_existencias').select('*'),
  ])
  const sol = (s.data ?? []) as { estatus: string }[]
  return { pendientes: sol.filter(x => x.estatus === 'pendiente').length, porEntregar: sol.filter(x => x.estatus === 'aprobada').length, bajo: bajoMinimo((e.data ?? []) as Existencia[]).length }
}

/** Lee "@lat,lng", "q=lat,lng", "!3dlat!4dlng" o "lat, lng" de un enlace o texto de Google Maps. */
export function coordenadasDe(texto: string): { lat: number; lng: number } | null {
  const t = decodeURIComponent(texto.trim())
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/]
  for (const p of pats) {
    const m = t.match(p)
    if (m) { const lat = Number(m[1]), lng = Number(m[2]); if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng } }
  }
  return null
}
export const linkMaps = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`
