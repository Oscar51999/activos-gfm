import { useEffect, useState } from 'react'

/** Tema de la app: oscuro (de siempre) o claro. Cada persona lo elige; se recuerda en el equipo y en su perfil. */
export type Tema = 'oscuro' | 'claro'
export type Apariencia = { acento?: string | null; tema_defecto?: Tema; densidad?: 'normal' | 'compacta'; subtitulo?: string | null }

const CLAVE = 'gfm.tema'
const leer = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

export function temaGuardado(): Tema | null {
  const t = leer(CLAVE)
  return t === 'claro' || t === 'oscuro' ? t : null
}

export function aplicarTema(t: Tema, recordar = true) {
  const r = document.documentElement
  if (t === 'claro') r.setAttribute('data-tema', 'claro'); else r.removeAttribute('data-tema')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'claro' ? '#F3F4F6' : '#06070A')
  if (recordar) guardar(CLAVE, t)
  window.dispatchEvent(new CustomEvent('gfm-tema', { detail: t }))
}

export const temaActual = (): Tema => (document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'oscuro')

/** Oscurece un color hex (para que el acento se lea sobre blanco). */
function oscurecer(hex: string, f: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(v * (1 - f)))
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
}

/** Ajustes de apariencia de toda la empresa (los define el administrador principal). */
export function aplicarApariencia(a: Apariencia | null | undefined) {
  const r = document.documentElement
  let st = document.getElementById('gfm-acento') as HTMLStyleElement | null
  const acento = a?.acento && /^#[0-9a-f]{6}$/i.test(a.acento) ? a.acento : null
  if (!acento) { st?.remove() } else {
    if (!st) { st = document.createElement('style'); st.id = 'gfm-acento'; document.head.appendChild(st) }
    st.textContent = `:root{--color-marca:${acento};--color-marca-oscuro:${oscurecer(acento, .15)}}:root[data-tema="claro"]{--color-marca:${oscurecer(acento, .28)};--color-marca-oscuro:${oscurecer(acento, .4)}}`
  }
  r.toggleAttribute('data-compacto', a?.densidad === 'compacta')
  if (!temaGuardado() && a?.tema_defecto) aplicarTema(a.tema_defecto, false)
}

export const ACENTOS = [
  { nombre: 'Ámbar Firme (suave)', hex: '#E2A64B' },
  { nombre: 'Ámbar original', hex: '#F9B234' },
  { nombre: 'Arena', hex: '#C9A06A' },
  { nombre: 'Azul marino', hex: '#4F7BC8' },
  { nombre: 'Turquesa', hex: '#1FB5B8' },
  { nombre: 'Verde', hex: '#3DAE7A' },
  { nombre: 'Gris acero', hex: '#8A97A8' },
]

/** Tema actual, y se actualiza cuando la persona lo cambia. */
export function useTema(): Tema {
  const [t, setT] = useState<Tema>(temaActual())
  useEffect(() => { const f = () => setT(temaActual()); window.addEventListener('gfm-tema', f); return () => window.removeEventListener('gfm-tema', f) }, [])
  return t
}
