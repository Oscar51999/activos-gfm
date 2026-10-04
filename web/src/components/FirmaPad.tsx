import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { Eraser } from 'lucide-react'

export type FirmaPadRef = { vacio: () => boolean; blob: () => Promise<Blob | null>; limpiar: () => void }

/** Recuadro para firmar con el dedo, el lápiz o el mouse. */
const FirmaPad = forwardRef<FirmaPadRef, { titulo: string; nombre?: string }>(function FirmaPad({ titulo, nombre }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const [vacio, setVacio] = useState(true)

  useEffect(() => {
    const c = canvas.current!
    const ajustar = () => {
      const r = c.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      c.width = r.width * dpr; c.height = r.height * dpr
      const ctx = c.getContext('2d')!
      ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1E1719'
      setVacio(true)
    }
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [])

  const punto = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const inicio = (e: React.PointerEvent) => {
    e.preventDefault()
    canvas.current!.setPointerCapture(e.pointerId)
    dibujando.current = true
    const ctx = canvas.current!.getContext('2d')!
    const p = punto(e); ctx.beginPath(); ctx.moveTo(p.x, p.y)
  }
  const mover = (e: React.PointerEvent) => {
    if (!dibujando.current) return
    const ctx = canvas.current!.getContext('2d')!
    const p = punto(e); ctx.lineTo(p.x, p.y); ctx.stroke()
    if (vacio) setVacio(false)
  }
  const fin = () => { dibujando.current = false }

  const limpiar = () => {
    const c = canvas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setVacio(true)
  }

  useImperativeHandle(ref, () => ({
    vacio: () => vacio,
    limpiar,
    blob: () => new Promise(res => vacio ? res(null) : canvas.current!.toBlob(b => res(b), 'image/png')),
  }), [vacio])

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="etiqueta mb-0">{titulo}</span>
        <button type="button" onClick={limpiar} className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-tinta"><Eraser size={13} />Borrar</button>
      </div>
      <div className="papel relative overflow-hidden rounded-lg">
        <canvas ref={canvas} className="h-36 w-full touch-none rounded-lg border border-stone-300 bg-white"
          onPointerDown={inicio} onPointerMove={mover} onPointerUp={fin} onPointerLeave={fin} />
        {vacio && <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-stone-400">Firme aquí</span>}
        <div className="pointer-events-none absolute bottom-7 left-6 right-6 border-b border-stone-300" />
      </div>
      {nombre && <p className="mt-1 text-center text-xs text-stone-600">{nombre}</p>}
    </div>
  )
})
export default FirmaPad
