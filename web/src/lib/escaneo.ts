import { supabase } from './supabase'

type Pos = { lat: number; lng: number; precision: number } | null

/** Pide la ubicación del celular (si la persona da permiso). Nunca truena ni tarda más de ~8 s. */
export function ubicacionActual(): Promise<Pos> {
  return new Promise(res => {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) { res(null); return }
    let listo = false
    const fin = (p: Pos) => { if (!listo) { listo = true; res(p) } }
    setTimeout(() => fin(null), 9000)
    try {
      navigator.geolocation.getCurrentPosition(
        g => fin({ lat: g.coords.latitude, lng: g.coords.longitude, precision: Math.round(g.coords.accuracy) }),
        () => fin(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 },
      )
    } catch { fin(null) }
  })
}

/** Registra que se escaneó un equipo (con ubicación si se puede). No bloquea nada: se llama y se olvida. */
export async function registrarEscaneo(o: { qr?: string; activo?: string; origen: 'etiqueta' | 'lector' | 'nfc_celular' | 'camara' }) {
  try {
    const p = await ubicacionActual()
    await supabase.rpc('registrar_escaneo', { p_qr: o.qr ?? null, p_activo: o.activo ?? null, p_origen: o.origen, p_lat: p?.lat ?? null, p_lng: p?.lng ?? null, p_precision: p?.precision ?? null })
  } catch { /* el escaneo nunca debe estorbar */ }
}

/** Imagen del mapa (OpenStreetMap) centrada en un punto: devuelve el mosaico y dónde cae el punto dentro de él. */
export function mosaico(lat: number, lng: number, z = 15) {
  const n = 2 ** z
  const x = ((lng + 180) / 360) * n
  const r = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  const tx = Math.floor(x), ty = Math.floor(y)
  return { tiles: [-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => ({ dx, dy, url: `https://tile.openstreetmap.org/${z}/${tx + dx}/${ty + dy}.png` }))), px: (x - tx) * 256, py: (y - ty) * 256 }
}
export const linkMapa = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`
