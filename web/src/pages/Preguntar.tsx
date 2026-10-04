import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Sparkles, SendHorizontal, Mic, MicOff, Loader2, Bot, User, Zap, Trash2 } from 'lucide-react'
import { preguntar, type Respuesta } from '../lib/preguntas'

type Msg = { rol: 'usuario' | 'asistente'; texto: string; fuente?: Respuesta['fuente'] }
const SUGERENCIAS = [
  '¿Qué préstamos ya se pasaron de fecha?', '¿Qué documentos vencen en los próximos 30 días?', '¿Qué tiene asignado Janani?',
  '¿Cuántas retroexcavadoras hay disponibles?', '¿Qué material está bajo mínimo?', '¿Dónde está la estación total?',
  '¿Qué mantenimientos están vencidos?', '¿Hay reportes de falla abiertos?',
]

/** Texto con [enlace](#/ruta), **negritas** y listas "- ". */
function Formato({ texto }: { texto: string }) {
  const enLinea = (s: string, k: number): ReactNode[] => s.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).filter(Boolean).map((t, i) => {
    const l = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (l) return l[2].startsWith('#/') ? <Link key={`${k}-${i}`} to={l[2].slice(1)} className="font-medium text-marca hover:underline">{l[1]}</Link> : <a key={`${k}-${i}`} href={l[2]} target="_blank" rel="noreferrer" className="text-marca underline">{l[1]}</a>
    const b = t.match(/^\*\*([^*]+)\*\*$/)
    if (b) return <b key={`${k}-${i}`} className="font-semibold text-tinta">{b[1]}</b>
    return <span key={`${k}-${i}`}>{t}</span>
  })
  const bloques: ReactNode[] = []
  let items: string[] = []
  const cerrar = (k: number) => { if (items.length) { bloques.push(<ul key={'u' + k} className="my-1.5 space-y-1">{items.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-marca" /><span className="min-w-0">{enLinea(x, k * 100 + i)}</span></li>)}</ul>); items = [] } }
  texto.split('\n').forEach((linea, k) => {
    if (/^\s*[-•]\s+/.test(linea)) items.push(linea.replace(/^\s*[-•]\s+/, ''))
    else { cerrar(k); if (linea.trim()) bloques.push(<p key={k} className="my-1">{enLinea(linea, k)}</p>) }
  })
  cerrar(9999)
  return <>{bloques}</>
}

type Reconocimiento = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void }

/** Pregúntale al sistema en español: “¿qué tiene Juan?”, “¿qué vence este mes?”. */
export default function Preguntar() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [oyendo, setOyendo] = useState(false)
  const fin = useRef<HTMLDivElement>(null)
  const rec = useRef<Reconocimiento | null>(null)
  const W = window as unknown as { SpeechRecognition?: new () => Reconocimiento; webkitSpeechRecognition?: new () => Reconocimiento }
  const Voz = W.SpeechRecognition ?? W.webkitSpeechRecognition
  const [sp, setSp] = useSearchParams()
  useEffect(() => { const q = sp.get('q'); if (q) { setSp({}, { replace: true }); enviar(q) } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, pensando])

  async function enviar(q = texto) {
    const t = q.trim(); if (!t || pensando) return
    const historial = msgs.map(m => ({ rol: m.rol, texto: m.texto }))
    setMsgs(m => [...m, { rol: 'usuario', texto: t }]); setTexto(''); setPensando(true)
    try { const r = await preguntar(t, historial); setMsgs(m => [...m, { rol: 'asistente', texto: r.texto, fuente: r.fuente }]) }
    catch (e) { setMsgs(m => [...m, { rol: 'asistente', texto: 'No pude contestar: ' + (e as Error).message, fuente: 'local' }]) }
    finally { setPensando(false) }
  }
  function dictar() {
    if (!Voz) return
    if (oyendo) { rec.current?.stop(); return }
    const r = new Voz(); r.lang = 'es-MX'; r.interimResults = false
    r.onresult = e => { const t = e.results[0][0].transcript; setTexto(t); enviar(t) }
    r.onend = () => setOyendo(false)
    rec.current = r; setOyendo(true)
    try { r.start() } catch { setOyendo(false) }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col" style={{ minHeight: 'calc(100dvh - 12rem)' }}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-marca/30 bg-marca/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[.16em] text-marca"><Sparkles size={12} />Asistente</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">Pregúntale al sistema</h1>
          <p className="mt-1 text-sm text-stone-500">Escribe o dicta como le preguntarías a alguien de almacén. Solo ve lo que tus permisos te dejan ver.</p>
        </div>
        {msgs.length > 0 && <button className="btn-sec !px-3 text-xs" onClick={() => setMsgs([])}><Trash2 size={14} />Limpiar</button>}
      </div>

      <div className="flex-1 space-y-4">
        {msgs.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGERENCIAS.map((s, i) => (
              <button key={s} onClick={() => enviar(s)} className="tarjeta viva animate-entrar px-4 py-3 text-left text-sm text-stone-600 transition hover:text-tinta" style={{ animationDelay: `${i * 40}ms` }}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex animate-entrar gap-3 ${m.rol === 'usuario' ? 'flex-row-reverse' : ''}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${m.rol === 'usuario' ? 'bg-stone-100 text-stone-500' : 'bg-gradient-to-b from-[#FFC95A] to-[#E9A11E] text-[#120D04]'}`}>{m.rol === 'usuario' ? <User size={15} /> : <Bot size={16} />}</span>
            <div className={`min-w-0 max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.rol === 'usuario' ? 'bg-marca/15 text-tinta' : 'tarjeta !rounded-2xl text-stone-600'}`}>
              {m.rol === 'usuario' ? m.texto : <Formato texto={m.texto} />}
              {m.fuente === 'local' && <p className="mt-2 flex items-center gap-1 border-t border-stone-200 pt-1.5 text-[10px] uppercase tracking-wider text-stone-400"><Zap size={10} />Respuesta rápida (sin IA)</p>}
            </div>
          </div>
        ))}
        {pensando && <div className="flex items-center gap-3 text-sm text-stone-500"><span className="grid h-8 w-8 place-items-center rounded-full bg-stone-100"><Loader2 size={15} className="animate-spin text-marca" /></span>Buscando…</div>}
        <div ref={fin} />
      </div>

      <form onSubmit={e => { e.preventDefault(); enviar() }} className="sticky bottom-24 mt-6 flex items-center gap-2 rounded-2xl border border-stone-300 bg-[#0E1015]/95 p-2 shadow-[0_0_40px_-16px_rgb(249_178_52/.5)] backdrop-blur lg:bottom-4">
        <input className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-stone-400" value={texto} onChange={e => setTexto(e.target.value)} placeholder="¿Qué tiene asignado Luis Adrián?" autoFocus />
        {Voz && <button type="button" onClick={dictar} className={`grid h-10 w-10 place-items-center rounded-xl border transition ${oyendo ? 'border-red-400 text-red-500 animate-pulso' : 'border-stone-300 text-stone-500 hover:text-marca'}`} aria-label="Dictar">{oyendo ? <MicOff size={17} /> : <Mic size={17} />}</button>}
        <button className="btn-primario !h-10 !px-4" disabled={!texto.trim() || pensando} aria-label="Preguntar"><SendHorizontal size={17} /></button>
      </form>
    </div>
  )
}
