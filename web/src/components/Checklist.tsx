import { useRef, useState } from 'react'
import { Check, X, Camera, Loader2, ClipboardCheck } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { fotoProducto } from '../lib/logos'
import { PUNTOS, unidadLectura, type TipoEquipo } from '../lib/mantenimiento'
import { Aviso } from './ui'

/** Checklist diario del operador antes de arrancar. Funciona con o sin cuenta (por el QR). */
export default function ChecklistDiario({ qr, tipo, nombreInicial = '', onListo }: { qr: string; tipo: TipoEquipo; nombreInicial?: string; onListo?: (folio: string) => void }) {
  const puntos = PUNTOS[tipo]
  const [res, setRes] = useState<Record<string, { ok: boolean; nota: string }>>(() => Object.fromEntries(puntos.map(p => [p, { ok: true, nota: '' }])))
  const [operador, setOperador] = useState(nombreInicial)
  const [lectura, setLectura] = useState('')
  const [foto, setFoto] = useState<string | null>(null)
  const [cargandoFoto, setCargandoFoto] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const fallas = puntos.filter(p => !res[p].ok)
  const unidad = unidadLectura(tipo)

  async function enviar() {
    setError('')
    if (!operador.trim()) { setError('Escribe tu nombre.'); return }
    setEnviando(true)
    const { data, error } = await supabase.rpc('registrar_checklist', { p_qr: qr, p_operador: operador, p_lectura: lectura ? Number(lectura) : null,
      p_respuestas: puntos.map(p => ({ punto: p, ok: res[p].ok, nota: res[p].nota })), p_foto: foto })
    setEnviando(false)
    if (error) { setError(mensajeError(error)); return }
    setHecho(data as string); onListo?.(data as string)
  }

  if (hecho) return (
    <div className="py-6 text-center">
      <div className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full ring-1 ${fallas.length ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>{fallas.length ? <ClipboardCheck size={28} /> : <Check size={30} />}</div>
      <p className="text-lg font-semibold">{fallas.length ? 'Checklist enviado con observaciones' : '¡Todo en orden! Buen turno'}</p>
      <p className="mt-1 text-sm text-stone-500">{fallas.length ? <>Se abrió el reporte <span className="font-mono text-marca">{hecho}</span> para que mantenimiento lo revise.</> : 'Quedó registrado el checklist de hoy.'}</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="etiqueta">Operador *</span><input className="campo" value={operador} onChange={e => setOperador(e.target.value)} placeholder="Tu nombre" /></label>
        <label className="block"><span className="etiqueta">{unidad === 'km' ? 'Kilometraje (odómetro)' : 'Horómetro'}</span><input className="campo" type="number" min="0" step="0.1" inputMode="decimal" value={lectura} onChange={e => setLectura(e.target.value)} placeholder={unidad === 'km' ? 'Ej. 48250' : 'Ej. 6130.5'} /></label>
      </div>
      <ul className="space-y-1.5">
        {puntos.map(p => (
          <li key={p} className={`rounded-xl border p-2.5 transition ${res[p].ok ? 'border-stone-200' : 'border-red-200 bg-red-50/40'}`}>
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 text-sm">{p}</span>
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-stone-300 text-xs">
                <button type="button" onClick={() => setRes(r => ({ ...r, [p]: { ...r[p], ok: true } }))} className={`px-3 py-1.5 ${res[p].ok ? 'bg-emerald-50 text-emerald-700' : 'text-stone-500'}`}><Check size={13} className="inline" /> Bien</button>
                <button type="button" onClick={() => setRes(r => ({ ...r, [p]: { ...r[p], ok: false } }))} className={`border-l border-stone-300 px-3 py-1.5 ${!res[p].ok ? 'bg-red-50 text-red-700' : 'text-stone-500'}`}><X size={13} className="inline" /> Falla</button>
              </div>
            </div>
            {!res[p].ok && <input className="campo mt-2 !py-1.5 text-xs" placeholder="¿Qué tiene?" value={res[p].nota} onChange={e => setRes(r => ({ ...r, [p]: { ...r[p], nota: e.target.value } }))} />}
          </li>
        ))}
      </ul>
      {fallas.length > 0 && (
        <div>
          <span className="etiqueta">Foto de la falla (opcional)</span>
          {foto ? <img src={foto} alt="" className="h-28 rounded-xl" onClick={() => setFoto(null)} /> : (
            <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 py-3 text-sm text-stone-500 hover:border-marca hover:text-marca">
              {cargandoFoto ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}Tomar foto
            </button>
          )}
          <input ref={input} type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; setCargandoFoto(true); try { setFoto(await fotoProducto(f, 1000)) } finally { setCargandoFoto(false) } }} />
        </div>
      )}
      {error && <Aviso>{error}</Aviso>}
      <button className="btn-primario w-full py-3" onClick={enviar} disabled={enviando}>
        {enviando ? 'Enviando…' : fallas.length ? `Enviar · ${fallas.length} falla(s)` : 'Todo bien, enviar checklist'}
      </button>
    </div>
  )
}
