/* Capturas sin señal: si no hay internet, ciertas altas se guardan en el equipo y se mandan solas cuando vuelve la señal.
   Solo para registros que no dependen de otros (lecturas de inventario, odómetro/horómetro, entregas de almacén y checklists). */

const CLAVE = 'gfm.cola'
export const TABLAS_COLA = ['inventario_lecturas', 'lecturas', 'movimientos_consumible']
type Pendiente = { id: string; url: string; body: string; prefer: string | null; creado: string; tabla: string }

const leer = (): Pendiente[] => { try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') } catch { return [] } }
const guardar = (xs: Pendiente[]) => { try { localStorage.setItem(CLAVE, JSON.stringify(xs)) } catch { /* sin almacenamiento */ } avisar() }
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach(f => f())
export const escuchar = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f) } }
export const pendientes = () => leer()

let fetchReal: typeof fetch = (...a) => fetch(...a)
let tokenActual: () => Promise<string | null> = async () => null
export function configurar(f: typeof fetch, token: () => Promise<string | null>) { fetchReal = f; tokenActual = token }

function tablaDe(url: string) { const m = url.match(/\/rest\/v1\/([a-z_]+)(\?|$)/); return m?.[1] ?? '' }

/** fetch para el cliente de Supabase: si falla la red en un alta permitida, la guarda y responde como si se hubiera hecho. */
export const fetchConCola: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const tabla = tablaDe(url)
  const encolable = metodo === 'POST' && TABLAS_COLA.includes(tabla) && typeof init?.body === 'string'
  if (encolable && navigator.onLine === false) return encolar(url, init!, tabla)
  try {
    return await fetchReal(input, init)
  } catch (e) {
    if (encolable) return encolar(url, init!, tabla)
    throw e
  }
}

function encolar(url: string, init: RequestInit, tabla: string) {
  const h = new Headers(init.headers)
  const filas = JSON.parse(init.body as string) as Record<string, unknown> | Record<string, unknown>[]
  const conId = (Array.isArray(filas) ? filas : [filas]).map(f => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...f }))
  guardar([...leer(), { id: crypto.randomUUID(), url, body: JSON.stringify(conId), prefer: h.get('Prefer'), creado: new Date().toISOString(), tabla }])
  const devolver = (h.get('Prefer') ?? '').includes('return=representation')
  return new Response(devolver ? JSON.stringify(conId) : null, { status: 201, headers: { 'Content-Type': 'application/json', 'x-en-cola': '1' } })
}

let mandando = false
/** Manda lo pendiente. Se llama al volver la señal y al abrir la app. */
export async function sincronizar() {
  if (mandando || navigator.onLine === false) return
  const xs = leer(); if (!xs.length) return
  mandando = true; avisar()
  try {
    const token = await tokenActual()
    const quedan: Pendiente[] = []
    for (const p of xs) {
      try {
        const r = await fetchReal(p.url, { method: 'POST', body: p.body, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), apikey: (window as unknown as { __SB_KEY?: string }).__SB_KEY ?? '', Prefer: 'return=minimal' } })
        // 409 = ya existía (se mandó antes): se da por bueno
        if (!r.ok && r.status !== 409) quedan.push(p)
      } catch { quedan.push(p) }
    }
    guardar(quedan)
  } finally { mandando = false; avisar() }
}
export const estaMandando = () => mandando

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { sincronizar() })
}
