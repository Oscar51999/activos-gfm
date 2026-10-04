import { useRef, useState } from 'react'
import { Camera, Check, Loader2, X, Wrench, ShieldAlert, SearchX, HelpCircle, Hammer } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { fotoProducto } from '../lib/logos'
import { Aviso } from './ui'

export const TIPOS_REPORTE = {
  falla: { texto: 'No funciona', icono: Wrench },
  dano: { texto: 'Dañado', icono: Hammer },
  robo: { texto: 'Robo', icono: ShieldAlert },
  extravio: { texto: 'Extraviado', icono: SearchX },
  otro: { texto: 'Otro', icono: HelpCircle },
} as const
export type TipoReporte = keyof typeof TIPOS_REPORTE

/** Formulario corto para reportar un problema de un activo. Funciona con o sin cuenta (usa el QR). */
export default function ReportarFalla({ qr, anonimo = false, onListo, nombreInicial = '' }: { qr: string; anonimo?: boolean; onListo?: (folio: string) => void; nombreInicial?: string }) {
  const [tipo, setTipo] = useState<TipoReporte>('falla')
  const [desc, setDesc] = useState('')
  const [foto, setFoto] = useState<string | null>(null)
  const [nombre, setNombre] = useState(nombreInicial)
  const [contacto, setContacto] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [folio, setFolio] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function tomar(f?: File | null) {
    if (!f) return
    setProcesando(true)
    try { setFoto(await fotoProducto(f, 1000)) } catch { setError('No se pudo leer la foto.') } finally { setProcesando(false) }
  }
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (anonimo && !nombre.trim()) { setError('Escribe tu nombre para saber quién reporta.'); return }
    setEnviando(true)
    const { data, error } = await supabase.rpc('reportar_por_qr', { p_qr: qr, p_tipo: tipo, p_descripcion: desc, p_nombre: nombre, p_contacto: contacto, p_foto: foto })
    setEnviando(false)
    if (error) { setError(mensajeError(error)); return }
    setFolio(data as string); onListo?.(data as string)
  }

  if (folio) return (
    <div className="py-6 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 shadow-[0_0_40px_-8px_rgb(52_211_153/.7)]"><Check size={30} /></div>
      <p className="text-lg font-semibold">Reporte enviado</p>
      <p className="mt-1 text-sm text-stone-500">Folio <span className="font-mono text-marca">{folio}</span>. Almacén ya lo puede ver y le dará seguimiento.</p>
    </div>
  )

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <span className="etiqueta">¿Qué pasa?</span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(Object.keys(TIPOS_REPORTE) as TipoReporte[]).map(k => {
            const T = TIPOS_REPORTE[k]
            return (
              <button key={k} type="button" onClick={() => setTipo(k)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs transition ${tipo === k ? 'border-marca bg-marca/10 text-marca' : 'border-stone-300 text-stone-600 hover:border-marca/50'}`}>
                <T.icono size={20} />{T.texto}
              </button>
            )
          })}
        </div>
      </div>
      <label className="block"><span className="etiqueta">Descríbelo *</span>
        <textarea className="campo" rows={3} required maxLength={2000} value={desc} onChange={e => setDesc(e.target.value)}
          placeholder={tipo === 'falla' ? 'Ej. No enciende, hace un ruido raro al arrancar…' : tipo === 'robo' || tipo === 'extravio' ? 'Dónde y cuándo se vio por última vez…' : 'Qué le pasó y en qué parte…'} />
      </label>
      <div>
        <span className="etiqueta">Foto (opcional)</span>
        {foto ? (
          <div className="relative w-40 overflow-hidden rounded-xl border border-stone-300">
            <img src={foto} alt="" className="aspect-[4/3] w-full object-cover" />
            <button type="button" onClick={() => setFoto(null)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-stone-700" aria-label="Quitar foto"><X size={14} /></button>
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 py-4 text-sm text-stone-500 transition hover:border-marca hover:text-marca">
            {procesando ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}Tomar o elegir foto
          </button>
        )}
        <input ref={input} type="file" accept="image/*" hidden onChange={e => tomar(e.target.files?.[0])} />
      </div>
      {anonimo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="etiqueta">Tu nombre *</span><input className="campo" value={nombre} onChange={e => setNombre(e.target.value)} /></label>
          <label className="block"><span className="etiqueta">Teléfono (opcional)</span><input className="campo" type="tel" value={contacto} onChange={e => setContacto(e.target.value)} /></label>
        </div>
      )}
      {error && <Aviso>{error}</Aviso>}
      <button className="btn-primario w-full py-3" disabled={enviando || procesando}>{enviando ? 'Enviando…' : 'Enviar reporte'}</button>
    </form>
  )
}
