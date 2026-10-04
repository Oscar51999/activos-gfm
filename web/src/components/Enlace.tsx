import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, MessageCircle } from 'lucide-react'

/** URL pública del sistema para enlaces que se mandan por WhatsApp o correo. */
export function urlPublica(ruta: string) {
  const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '')
  return `${base}#/${ruta.replace(/^\//, '')}`
}
export const blobADataURL = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(b) })

/** Mostrar un enlace para mandarlo: copiar, abrir WhatsApp con el mensaje armado o enseñar el QR en pantalla. */
export default function EnviarEnlace({ url, mensaje, telefono, compacto = false }: { url: string; mensaje: string; telefono?: string | null; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const tel = (telefono ?? '').replace(/\D/g, '')
  const wa = `https://wa.me/${tel ? (tel.length === 10 ? '52' + tel : tel) : ''}?text=${encodeURIComponent(`${mensaje}\n${url}`)}`
  async function copiar() {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 1800) }
    catch { const i = document.getElementById('enlace-' + url.slice(-12)) as HTMLInputElement | null; i?.select() }
  }
  return (
    <div className={compacto ? 'flex flex-wrap items-center gap-1.5' : 'space-y-3'}>
      {!compacto && <input id={'enlace-' + url.slice(-12)} readOnly value={url} onFocus={e => e.target.select()} className="campo font-mono text-xs" />}
      <div className="flex flex-wrap gap-2">
        <a href={wa} target="_blank" rel="noreferrer" className={`btn-primario ${compacto ? '!px-3 !py-1.5 text-xs' : ''}`}><MessageCircle size={compacto ? 14 : 16} />WhatsApp</a>
        <button type="button" onClick={copiar} className={`btn-sec ${compacto ? '!px-3 !py-1.5 text-xs' : ''}`}>{copiado ? <Check size={compacto ? 14 : 16} className="text-emerald-700" /> : <Copy size={compacto ? 14 : 16} />}{copiado ? 'Copiado' : 'Copiar enlace'}</button>
      </div>
      {!compacto && (
        <div className="flex items-center gap-4 rounded-xl border border-stone-200 p-3">
          <div className="papel rounded-lg p-2"><QRCodeSVG value={url} size={96} marginSize={0} /></div>
          <p className="text-xs text-stone-500">Si la persona está contigo, que escanee este código con su celular. El enlace sirve una sola vez y no necesita cuenta.</p>
        </div>
      )}
    </div>
  )
}
