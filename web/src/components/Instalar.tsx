import { useState } from 'react'
import { Share, PlusSquare, X, Smartphone, CheckCircle2 } from 'lucide-react'

export const esIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
export const instalada = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
const leer = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

/** Cómo instalar el ERP como app en el celular (iPhone y Android). */
export function InstruccionesInstalar() {
  if (instalada()) return <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} />Ya la estás usando como app.</p>
  return (
    <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-xl border border-stone-200 p-3">
        <p className="mb-1 font-medium">iPhone (Safari)</p>
        <ol className="list-decimal space-y-1 pl-5 text-stone-600">
          <li>Toca <Share size={13} className="inline -mt-0.5" /> <b>Compartir</b> abajo en Safari.</li>
          <li>Elige <PlusSquare size={13} className="inline -mt-0.5" /> <b>Agregar a inicio</b> y luego <b>Agregar</b>.</li>
          <li>Abre la app desde el ícono e inicia sesión.</li>
        </ol>
        <p className="mt-2 text-xs text-stone-500">Ojo: al acercar un sticker NFC el iPhone abre <b>Safari</b>, no la app. Inicia sesión también una vez en Safari para ver la ficha completa al escanear.</p>
      </div>
      <div className="rounded-xl border border-stone-200 p-3">
        <p className="mb-1 font-medium">Android (Chrome)</p>
        <ol className="list-decimal space-y-1 pl-5 text-stone-600">
          <li>Toca el menú <b>⋮</b> de Chrome.</li>
          <li>Elige <b>Instalar app</b> (o “Agregar a pantalla principal”).</li>
          <li>Ábrela desde el ícono. Los stickers NFC abren directo la app.</li>
        </ol>
      </div>
    </div>
  )
}

/** Aviso discreto en iPhone mientras no se haya instalado la app. */
export function SugerenciaInstalar() {
  const [ver, setVer] = useState(() => esIOS() && !instalada() && leer('gfm.instalar.oculto') !== '1')
  if (!ver) return null
  return (
    <div className="no-print mb-4 flex items-start gap-3 rounded-2xl border border-marca/30 bg-marca/10 p-3 text-sm">
      <Smartphone size={18} className="mt-0.5 shrink-0 text-marca" />
      <p className="min-w-0 flex-1">Instala el ERP en tu iPhone: toca <Share size={13} className="inline -mt-0.5" /> <b>Compartir</b> → <b>Agregar a inicio</b>. Tendrás su ícono y la sesión siempre abierta.</p>
      <button aria-label="Cerrar" className="text-stone-400 hover:text-tinta" onClick={() => { guardar('gfm.instalar.oculto', '1'); setVer(false) }}><X size={16} /></button>
    </div>
  )
}
