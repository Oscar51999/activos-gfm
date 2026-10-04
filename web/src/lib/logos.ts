// Logos de empresa.
// En la base, empresas.logo_path / logo_oscuro guardan:
//   "app:<clave>"  → logo incluido en la app (src/assets/logos/<clave>-claro|oscuro.png)
//   "data:..."     → logo subido por un administrador, ya procesado en el navegador
const archivos = import.meta.glob('../assets/logos/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export type Variante = 'claro' | 'oscuro'
export type EmpresaLogo = { nombre: string; nombre_corto?: string | null; logo_path?: string | null; logo_oscuro?: string | null; color?: string | null }

export function urlLogo(e: EmpresaLogo, v: Variante): string | null {
  const ref = (v === 'oscuro' ? e.logo_oscuro || e.logo_path : e.logo_path) ?? null
  if (!ref) return null
  if (ref.startsWith('data:') || ref.startsWith('http') || ref.startsWith('blob:')) return ref
  if (ref.startsWith('app:')) {
    const clave = ref.slice(4)
    if (clave === 'grupo-firme') return 'svg:grupo-firme'
    return archivos[`../assets/logos/${clave}-${v}.png`] ?? archivos[`../assets/logos/${clave}-claro.png`] ?? null
  }
  return null
}

export const iniciales = (t: string) => t.replace(/\b(de|del|la|las|los|y|S\.?A\.?|C\.?V\.?)\b/gi, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

/**
 * Procesa un logo subido: quita el fondo claro, recorta, deja margen parejo y genera la versión
 * para fondo oscuro (los textos negros o azul marino pasan a blanco; los colores vivos se respetan).
 */
export async function procesarLogo(archivo: File): Promise<{ claro: string; oscuro: string }> {
  const img = await createImageBitmap(archivo)
  const esc = Math.min(1, 1600 / img.width, 800 / img.height)
  const W = Math.round(img.width * esc), H = Math.round(img.height * esc)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, W, H)
  const d = ctx.getImageData(0, 0, W, H), px = d.data

  // color de fondo = promedio del borde
  let br = 0, bg = 0, bb = 0, n = 0
  const tomar = (x: number, y: number) => { const i = (y * W + x) * 4; if (px[i + 3] < 10) return; br += px[i]; bg += px[i + 1]; bb += px[i + 2]; n++ }
  for (let x = 0; x < W; x++) { tomar(x, 0); tomar(x, H - 1) }
  for (let y = 0; y < H; y++) { tomar(0, y); tomar(W - 1, y) }
  const fondo = n ? [br / n, bg / n, bb / n] : [255, 255, 255]

  let x0 = W, y0 = H, x1 = 0, y1 = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    const dist = Math.max(Math.abs(px[i] - fondo[0]), Math.abs(px[i + 1] - fondo[1]), Math.abs(px[i + 2] - fondo[2]))
    const a = Math.min(px[i + 3], Math.max(0, Math.min(255, ((dist - 8) / 40) * 255)))
    px[i + 3] = a
    if (a > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  ctx.putImageData(d, 0, 0)
  if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1 }

  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, pad = Math.round(Math.max(cw, ch) * 0.03)
  const s = Math.min(1, 560 / (cw + pad * 2), 180 / (ch + pad * 2))
  const out = document.createElement('canvas')
  out.width = Math.round((cw + pad * 2) * s); out.height = Math.round((ch + pad * 2) * s)
  const o = out.getContext('2d', { willReadFrequently: true })!
  o.imageSmoothingQuality = 'high'
  o.drawImage(c, x0, y0, cw, ch, pad * s, pad * s, cw * s, ch * s)
  const claro = out.toDataURL('image/png')

  const od = o.getImageData(0, 0, out.width, out.height), q = od.data
  for (let i = 0; i < q.length; i += 4) {
    if (q[i + 3] < 10) continue
    const r = q[i] / 255, g = q[i + 1] / 255, b = q[i + 2] / 255
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0
    if (Y < 0.3 && (sat < 0.25 || b >= r)) { q[i] = 242; q[i + 1] = 244; q[i + 2] = 246 }
  }
  o.putImageData(od, 0, 0)
  return { claro, oscuro: out.toDataURL('image/png') }
}

/** Comprime una foto de producto a JPEG ligero para guardarla junto al producto. */
export async function fotoProducto(archivo: File, max = 720): Promise<string> {
  const img = await createImageBitmap(archivo)
  const s = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.82)
}
