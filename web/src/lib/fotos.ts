import { supabase, BUCKET } from './supabase'

/** Reduce la foto a máx. 1600 px y la convierte a JPEG para ahorrar espacio y datos móviles. */
export async function comprimir(archivo: File, max = 1600, calidad = 0.82): Promise<Blob> {
  if (!archivo.type.startsWith('image/')) return archivo
  const img = await createImageBitmap(archivo)
  const escala = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return await new Promise(r => c.toBlob(b => r(b ?? archivo), 'image/jpeg', calidad))
}

export async function subirFoto(empresaId: string, activoId: string, archivo: File) {
  const blob = await comprimir(archivo)
  const path = `${empresaId}/${activoId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  const { error: e2 } = await supabase.from('activo_fotos').insert({ activo_id: activoId, path })
  if (e2) throw e2
  return path
}

const cache = new Map<string, { url: string; vence: number }>()
export async function urlFirmada(path: string) {
  if (!path) return ''
  if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http')) return path
  const demo = (window as unknown as { __demoUrls?: Record<string, string> }).__demoUrls
  if (demo) return demo[path] ?? ''
  const c = cache.get(path)
  if (c && c.vence > Date.now()) return c.url
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (data?.signedUrl) cache.set(path, { url: data.signedUrl, vence: Date.now() + 3300_000 })
  return data?.signedUrl ?? ''
}
