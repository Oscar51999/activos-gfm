import { supabase, mensajeError } from './supabase'

export type Punto = { t: string; lat: number; lng: number; p: number }
type Estado = { viajeId: string | null; km: number; puntos: number; pendientes: number; precision: number | null; error: string | null; senal: boolean }

const K_VIAJE = 'gfm.viaje.activo', K_BUF = 'gfm.viaje.buffer'
const leer = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const poner = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

/** Distancia en km entre dos puntos (fórmula de haversine). */
export function kmEntre(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Rastreo GPS de un viaje mientras la app está abierta. Guarda los puntos en el teléfono y los manda cada ~20 s;
 * si no hay señal, los conserva y los manda cuando vuelve. Mantiene la pantalla encendida si el navegador lo permite.
 */
class Rastreador {
  private watch: number | null = null
  private timer: number | null = null
  private lock: { release: () => Promise<void> } | null = null
  private buf: Punto[] = []
  private ultimo: Punto | null = null
  private oyentes = new Set<(e: Estado) => void>()
  estado: Estado = { viajeId: null, km: 0, puntos: 0, pendientes: 0, precision: null, error: null, senal: true }

  constructor() {
    try { this.buf = JSON.parse(leer(K_BUF) || '[]') } catch { this.buf = [] }
    this.estado.viajeId = leer(K_VIAJE)
    this.estado.pendientes = this.buf.length
  }
  escuchar(f: (e: Estado) => void) { this.oyentes.add(f); f(this.estado); return () => { this.oyentes.delete(f) } }
  private avisar(p: Partial<Estado>) { this.estado = { ...this.estado, ...p }; this.oyentes.forEach(f => f(this.estado)) }
  private guardarBuf() { poner(K_BUF, JSON.stringify(this.buf.slice(-3000))); this.avisar({ pendientes: this.buf.length }) }

  iniciar(viajeId: string, km = 0, puntos = 0) {
    if (this.watch != null && this.estado.viajeId === viajeId) return
    this.detenerSensores()
    poner(K_VIAJE, viajeId)
    this.avisar({ viajeId, km, puntos, error: null })
    if (!navigator.geolocation || !window.isSecureContext) { this.avisar({ error: 'Este navegador no da la ubicación. Abre la app desde https en el celular.' }); return }
    this.watch = navigator.geolocation.watchPosition(pos => {
      const p: Punto = { t: new Date(pos.timestamp).toISOString(), lat: pos.coords.latitude, lng: pos.coords.longitude, p: Math.round(pos.coords.accuracy) }
      this.avisar({ precision: p.p, error: null })
      if (p.p > 100) return
      // Solo se guarda si se movió al menos 20 m o pasó un minuto (ahorra datos y batería)
      if (this.ultimo && kmEntre(this.ultimo, p) < 0.02 && Date.parse(p.t) - Date.parse(this.ultimo.t) < 60000) return
      if (this.ultimo) {
        const d = kmEntre(this.ultimo, p), h = (Date.parse(p.t) - Date.parse(this.ultimo.t)) / 36e5
        if (d >= 0.025 && !(h > 0 && d / h > 180)) this.avisar({ km: Math.round((this.estado.km + d) * 100) / 100 })
      }
      this.ultimo = p; this.buf.push(p); this.guardarBuf()
    }, err => this.avisar({ error: err.code === 1 ? 'Sin permiso de ubicación. Actívalo para esta página en el navegador.' : 'No se pudo leer el GPS. Sal a cielo abierto.' }),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 })
    this.timer = window.setInterval(() => { void this.enviar() }, 20000)
    void this.pedirPantalla()
    document.addEventListener('visibilitychange', this.alVolver)
  }
  private alVolver = () => { if (document.visibilityState === 'visible' && this.estado.viajeId) { void this.pedirPantalla(); void this.enviar() } }
  private async pedirPantalla() {
    try { const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock; if (wl) this.lock = await wl.request('screen') } catch { /* no disponible */ }
  }
  /** Manda los puntos pendientes. Regresa los km por GPS que tiene el servidor. */
  async enviar(): Promise<number | null> {
    const id = this.estado.viajeId
    if (!id || !this.buf.length) return null
    const lote = this.buf.slice(0, 500)
    const { data, error } = await supabase.rpc('viaje_agregar_puntos', { p_viaje: id, p_puntos: lote })
    if (error) {
      const m = mensajeError(error)
      if (/no está en curso|otra persona/i.test(m)) { this.terminarLocal(); return null }
      this.avisar({ senal: false }); return null
    }
    this.buf = this.buf.slice(lote.length); this.guardarBuf()
    this.avisar({ senal: true, km: Number(data) || this.estado.km, puntos: this.estado.puntos + lote.length })
    if (this.buf.length) return this.enviar()
    return Number(data)
  }
  private detenerSensores() {
    if (this.watch != null) navigator.geolocation.clearWatch(this.watch)
    if (this.timer != null) window.clearInterval(this.timer)
    this.watch = null; this.timer = null
    document.removeEventListener('visibilitychange', this.alVolver)
    this.lock?.release().catch(() => {}); this.lock = null
  }
  /** Deja de rastrear y olvida el viaje en este teléfono. */
  terminarLocal() {
    this.detenerSensores(); this.buf = []; this.ultimo = null
    poner(K_VIAJE, null); poner(K_BUF, null)
    this.avisar({ viajeId: null, km: 0, puntos: 0, pendientes: 0, precision: null, error: null })
  }
}

export const rastreador = new Rastreador()
