/** Lo último que abrió cada persona en este equipo (para "Accesos recientes" del tablero). */
export type Reciente = { to: string; texto: string; tipo: string; t: number }
const CLAVE = 'gfm.recientes'
export function recientes(): Reciente[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as Reciente[] } catch { return [] }
}
export function registrarReciente(to: string, texto: string, tipo: string) {
  if (!texto || to === '/') return
  try {
    const l = [{ to, texto, tipo, t: Date.now() }, ...recientes().filter(r => r.to !== to)].slice(0, 12)
    localStorage.setItem(CLAVE, JSON.stringify(l))
  } catch { /* sin almacenamiento */ }
}
