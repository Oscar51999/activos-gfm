import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, SendHorizontal, X, Loader2, Maximize2, Trash2 } from 'lucide-react'
import { preguntar, type Respuesta } from '../lib/preguntas'
import { Formato } from '../pages/Preguntar'

type Msg = { rol: 'usuario' | 'asistente'; texto: string; fuente?: Respuesta['fuente'] }
const RAPIDAS = ['¿Dónde está la estación total?', '¿Qué préstamos están vencidos?', '¿Qué vence este mes?', '¿Hay fallas abiertas?']

/** “Pregúntale” siempre a la mano: botón flotante abajo a la derecha. */
export default function AsistenteFlotante() {
  const [abierto, setAbierto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const fin = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [msgs, pensando, abierto])
  useEffect(() => { if (abierto) setTimeout(() => entrada.current?.focus(), 50) }, [abierto])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  async function enviar(q = texto) {
    const t = q.trim(); if (!t || pensando) return
    const historial = msgs.map(m => ({ rol: m.rol, texto: m.texto }))
    setMsgs(m => [...m, { rol: 'usuario', texto: t }]); setTexto(''); setPensando(true)
    try { const r = await preguntar(t, historial); setMsgs(m => [...m, { rol: 'asistente', texto: r.texto, fuente: r.fuente }]) }
    catch (e) { setMsgs(m => [...m, { rol: 'asistente', texto: 'No pude contestar: ' + (e as Error).message }]) }
    finally { setPensando(false) }
  }

  return (
    <div className="no-print fixed bottom-24 right-4 z-40 flex flex-col items-end gap-3 lg:bottom-6 lg:right-6">
      {abierto && (
        <section role="dialog" aria-label="Pregúntale al sistema"
          className="flex h-[min(540px,calc(100dvh-11rem))] w-[min(380px,calc(100vw-2rem))] animate-entrar flex-col overflow-hidden rounded-2xl border border-stone-300 bg-panel shadow-2xl">
          <header className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-marca/15 text-marca"><Sparkles size={15} /></span>
            <div className="min-w-0 flex-1 leading-tight"><p className="text-sm font-semibold">Pregúntale</p><p className="text-[11px] text-stone-500">Busca equipos, personas, vencimientos…</p></div>
            {msgs.length > 0 && <button onClick={() => setMsgs([])} className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-tinta" aria-label="Limpiar conversación"><Trash2 size={15} /></button>}
            <Link to="/preguntar" onClick={() => setAbierto(false)} className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-tinta" aria-label="Abrir en pantalla completa"><Maximize2 size={15} /></Link>
            <button onClick={() => setAbierto(false)} className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-tinta" aria-label="Cerrar"><X size={16} /></button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {msgs.length === 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-stone-500">Prueba con:</p>
                {RAPIDAS.map(r => <button key={r} onClick={() => enviar(r)} className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-left text-stone-600 hover:border-marca/50 hover:text-tinta">{r}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.rol === 'usuario' ? 'justify-end' : ''}`}>
                <div className={`max-w-[88%] rounded-2xl px-3 py-2 leading-relaxed ${m.rol === 'usuario' ? 'bg-marca/15 text-tinta' : 'bg-stone-50 text-stone-600 ring-1 ring-stone-200'}`}>
                  {m.rol === 'usuario' ? m.texto : <Formato texto={m.texto} />}
                </div>
              </div>
            ))}
            {pensando && <p className="flex items-center gap-2 text-xs text-stone-500"><Loader2 size={14} className="animate-spin text-marca" />Buscando…</p>}
            <div ref={fin} />
          </div>
          <form onSubmit={e => { e.preventDefault(); enviar() }} className="flex items-center gap-2 border-t border-stone-200 p-2">
            <input ref={entrada} className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-stone-400" value={texto} onChange={e => setTexto(e.target.value)} placeholder="¿Qué tiene asignado Luis?" />
            <button className="btn-primario !h-9 !px-3 !shadow-none" disabled={!texto.trim() || pensando} aria-label="Preguntar"><SendHorizontal size={16} /></button>
          </form>
        </section>
      )}
      <button onClick={() => setAbierto(a => !a)} aria-label={abierto ? 'Cerrar asistente' : 'Pregúntale al sistema'} title="Pregúntale (IA)"
        className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-b from-[#EBB866] to-[#CF9336] text-[#120D04] shadow-[0_10px_30px_-8px_rgb(0_0_0/.5)] ring-4 ring-fondo transition hover:scale-105">
        {abierto ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </div>
  )
}
