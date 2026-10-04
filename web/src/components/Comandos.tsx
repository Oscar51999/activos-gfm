import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft, Boxes, User, ArrowRight, Sparkles, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { EstatusBadge } from './ui'
import type { Estatus } from '../lib/supabase'

export type Destino = { to: string; texto: string; icono: LucideIcon; grupo?: string }
type Item = { id: string; to: string; titulo: string; sub?: string; icono: LucideIcon; tipo: 'Ir a' | 'Activo' | 'Empleado' | 'Preguntar'; estatus?: Estatus }

/** Paleta de comandos (Ctrl+K): navegar y buscar activos o empleados sin soltar el teclado. */
export default function Comandos({ abierto, onCerrar, destinos }: { abierto: boolean; onCerrar: () => void; destinos: Destino[] }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [remotos, setRemotos] = useState<Item[]>([])
  const nav = useNavigate()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (abierto) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 10) } }, [abierto])

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setRemotos([]); return }
    const id = setTimeout(async () => {
      const like = `%${t.replace(/[%,()]/g, ' ')}%`
      const [a, e] = await Promise.all([
        supabase.from('v_activos').select('id,codigo,descripcion,estatus,responsable,ubicacion')
          .or(`codigo.ilike.${like},descripcion.ilike.${like},serie.ilike.${like},numero_economico.ilike.${like}`).limit(6),
        supabase.from('empleados').select('id,nombres,apellidos,puesto').or(`nombres.ilike.${like},apellidos.ilike.${like}`).limit(4),
      ])
      setRemotos([
        ...((a.data ?? []) as { id: string; codigo: string; descripcion: string; estatus: Estatus; responsable: string | null; ubicacion: string | null }[]).map(r => ({
          id: 'a' + r.id, to: `/activos/${r.id}`, titulo: `${r.codigo} · ${r.descripcion}`, sub: r.responsable ?? r.ubicacion ?? undefined, icono: Boxes, tipo: 'Activo' as const, estatus: r.estatus,
        })),
        ...((e.data ?? []) as { id: string; nombres: string; apellidos: string | null; puesto: string | null }[]).map(r => ({
          id: 'e' + r.id, to: `/empleados/${r.id}/resguardo`, titulo: [r.nombres, r.apellidos].filter(Boolean).join(' '), sub: r.puesto ?? 'Resguardo vigente', icono: User, tipo: 'Empleado' as const,
        })),
      ])
      setSel(0)
    }, 160)
    return () => clearTimeout(id)
  }, [q])

  const items = useMemo<Item[]>(() => {
    const t = q.trim().toLowerCase()
    const nav = destinos.filter(d => !t || d.texto.toLowerCase().includes(t))
      .map(d => ({ id: 'n' + d.to, to: d.to, titulo: d.texto, sub: d.grupo, icono: d.icono, tipo: 'Ir a' as const }))
    const pregunta = t.length > 3 && (t.includes('?') || t.split(/\s+/).length >= 3) ? [{ id: 'q', to: `/preguntar?q=${encodeURIComponent(q.trim())}`, titulo: `Preguntar: “${q.trim()}”`, sub: 'Asistente', icono: Sparkles, tipo: 'Preguntar' as const }] : []
    return [...pregunta, ...remotos, ...nav].slice(0, 14)
  }, [q, remotos, destinos])

  function ir(i?: Item) { if (!i) return; nav(i.to); onCerrar() }

  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); ir(items[sel]) }
    else if (e.key === 'Escape') onCerrar()
  }

  if (!abierto) return null
  let grupoPrevio = ''
  return (
    <div className="no-print fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onCerrar}>
      <div className="tarjeta w-full max-w-xl animate-entrar overflow-hidden !bg-[#0E1015]/95 shadow-[0_0_80px_-20px_rgb(249_178_52/.45)]" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label="Buscar">
        <div className="flex items-center gap-3 border-b border-stone-200 px-4">
          <Search size={18} className="text-marca" />
          <input ref={input} autoFocus value={q} onChange={e => { setQ(e.target.value); setSel(0) }} onKeyDown={tecla}
            placeholder="Busca un activo, empleado o pantalla…" className="w-full bg-transparent py-4 text-[15px] outline-none placeholder:text-stone-400" />
          <kbd className="rounded-md border border-stone-300 px-1.5 py-0.5 font-mono text-[10px] text-stone-400">ESC</kbd>
        </div>
        <ul className="max-h-[55vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-stone-500">Sin resultados para “{q}”.</li>}
          {items.map((i, n) => {
            const cab = i.tipo !== grupoPrevio ? (grupoPrevio = i.tipo) : null
            return (
              <li key={i.id}>
                {cab && <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[.14em] text-stone-400">{cab === 'Ir a' ? 'Pantallas' : cab === 'Activo' ? 'Activos' : 'Empleados'}</p>}
                <button onMouseMove={() => setSel(n)} onClick={() => ir(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${n === sel ? 'bg-marca/12 text-tinta ring-1 ring-marca/40' : 'text-stone-600'}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${n === sel ? 'bg-marca text-[#120D04]' : 'bg-stone-100 text-stone-500'}`}><i.icono size={16} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate">{i.titulo}</span>{i.sub && <span className="block truncate text-xs text-stone-400">{i.sub}</span>}</span>
                  {i.estatus && <EstatusBadge estatus={i.estatus} />}
                  {n === sel ? <CornerDownLeft size={14} className="text-marca" /> : <ArrowRight size={14} className="text-stone-400 opacity-0" />}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex gap-4 border-t border-stone-200 px-4 py-2 text-[11px] text-stone-400">
          <span><kbd className="font-mono">↑↓</kbd> moverse</span><span><kbd className="font-mono">↵</kbd> abrir</span><span className="ml-auto">Ctrl + K desde cualquier pantalla</span>
        </div>
      </div>
    </div>
  )
}
