/* Service worker · Activos Grupo Firme
   - La app (HTML, JS, CSS, íconos, fuentes) queda guardada para abrir sin señal.
   - Las consultas a la base (GET) se intentan en red y, si no hay señal, se responde con la última copia guardada.
   - Las capturas sin señal las guarda la app (cola en el navegador) y las manda al volver la señal. */
const VERSION = 'gfm-v6'
const APP = `${VERSION}-app`, DATOS = `${VERSION}-datos`, FUENTES = `${VERSION}-fuentes`

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(['./', './index.html', './manifest.webmanifest', './icono-192.png', './favicon.svg']).catch(() => {})))
  self.skipWaiting()
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('message', e => {
  if (e.data === 'borrar-datos') caches.delete(DATOS)   // al cerrar sesión no se dejan datos en el equipo
})

async function redPrimero(req, cache) {
  try {
    const r = await fetch(req)
    if (r.ok) (await caches.open(cache)).put(req, r.clone())
    return r
  } catch {
    const g = await caches.match(req)
    if (g) { const h = new Headers(g.headers); h.set('x-sin-senal', '1'); return new Response(await g.blob(), { status: 200, headers: h }) }
    throw new Error('sin señal')
  }
}
async function cacheYActualiza(req, cache) {
  const c = await caches.open(cache)
  const g = await c.match(req)
  const red = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r }).catch(() => g)
  return g || red
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.pathname.includes('/auth/v1/') || url.pathname.includes('/functions/v1/') || url.pathname.includes('/storage/v1/object/sign')) return
  if (url.pathname.includes('/rest/v1/')) { e.respondWith(redPrimero(req, DATOS)); return }
  if (url.hostname.includes('fonts.g')) { e.respondWith(cacheYActualiza(req, FUENTES)); return }
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(() => caches.match('./index.html'))); return }
  e.respondWith(cacheYActualiza(req, APP))
})
