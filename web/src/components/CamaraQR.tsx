import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Aviso } from './ui'

/** Cámara que lee QR de forma continua (para inventario). Evita leer el mismo código dos veces seguidas. */
export default function CamaraQR({ onLeer }: { onLeer: (texto: string) => void }) {
  const ultimo = useRef<{ t: string; at: number }>({ t: '', at: 0 })
  const cb = useRef(onLeer); cb.current = onLeer
  const [error, setError] = useState('')
  useEffect(() => {
    const lector = new Html5Qrcode('camara-inventario')
    lector.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, texto => {
      const ahora = Date.now()
      if (texto === ultimo.current.t && ahora - ultimo.current.at < 3000) return
      ultimo.current = { t: texto, at: ahora }
      cb.current(texto)
    }, () => {}).catch(() => setError('No se pudo abrir la cámara. Revisa el permiso del navegador o usa el lector / teclado.'))
    return () => { lector.stop().catch(() => {}) }
  }, [])
  return (
    <div>
      <div id="camara-inventario" className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-stone-300" />
      {error && <div className="mt-3"><Aviso>{error}</Aviso></div>}
    </div>
  )
}
