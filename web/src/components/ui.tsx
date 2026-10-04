import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import { ESTATUS, type Estatus } from '../lib/supabase'

export function Encabezado({ titulo, sub, acciones }: { titulo: string; sub?: string; acciones?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{titulo}</h1>
        {sub && <p className="mt-1 text-sm text-stone-500">{sub}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  )
}

export function Campo({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="etiqueta">{label}</span>
      {children}
    </label>
  )
}

export function Modal({ abierto, titulo, onCerrar, children, ancho = 'max-w-2xl' }: {
  abierto: boolean; titulo: string; onCerrar: () => void; children: ReactNode; ancho?: string
}) {
  useEffect(() => {
    if (!abierto) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [abierto, onCerrar])
  if (!abierto) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8" onMouseDown={onCerrar}>
      <div className={`tarjeta w-full ${ancho} animate-entrar !bg-[#0E1015]/95 shadow-[0_0_80px_-24px_rgb(249_178_52/.35)]`} onMouseDown={e => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button className="rounded p-1 hover:bg-stone-100" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

export function EstatusBadge({ estatus }: { estatus: Estatus }) {
  const e = ESTATUS[estatus]
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${e.clase}`}>{e.texto}</span>
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <div className="flex items-center gap-2 py-10 text-sm text-stone-500"><Loader2 className="animate-spin text-marca" size={16} />{texto}</div>
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-marca/30 bg-marca/10 shadow-[0_0_30px_-8px_rgb(249_178_52/.6)]"><span className="h-2 w-2 rounded-full bg-marca shadow-[0_0_10px_#F9B234]" /></div>
      <p className="font-medium">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-stone-500">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}

export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const c = { error: 'border-red-200 bg-red-50 text-red-800', ok: 'border-emerald-200 bg-emerald-50 text-emerald-800', info: 'border-stone-200 bg-stone-50 text-stone-700' }[tipo]
  return <div className={`rounded-lg border px-3 py-2 text-sm ${c}`}>{children}</div>
}
