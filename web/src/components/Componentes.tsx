import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Puzzle, Plus, Unlink, Search, History, ArrowUpRight } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Modal, Aviso } from './ui'
import FotoActivo from './FotoActivo'

type Mini = { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; estatus: string; empresa_id: string; modelo_foto: string | null; foto_principal: string | null; categoria: string | null; ubicacion: string | null }
type Montaje = { id: string; componente_id: string; equipo_id: string; montado_at: string; desmontado_at: string | null; notas: string | null }
const SEL = 'id,codigo,descripcion,marca,modelo,serie,estatus,empresa_id,modelo_foto,foto_principal,categoria,ubicacion'
const nombre = (a: Mini) => [a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion
const fecha = (f: string) => new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })

/** Estructura del equipo (como SAP PM): aditamentos y accesorios montados, con historial de montaje. */
export default function Componentes({ activoId, empresaId }: { activoId: string; empresaId: string }) {
  const { puedeEditar } = useAuth()
  const [hijos, setHijos] = useState<Mini[]>([])
  const [padre, setPadre] = useState<Mini | null>(null)
  const [hist, setHist] = useState<(Montaje & { otro?: Mini })[]>([])
  const [verHist, setVerHist] = useState(false)
  const [montar, setMontar] = useState(false)
  const [error, setError] = useState('')

  async function cargar() {
    const [h, yo, m] = await Promise.all([
      supabase.from('activos').select('id').eq('montado_en', activoId),
      supabase.from('activos').select('montado_en').eq('id', activoId).maybeSingle(),
      supabase.from('montajes').select('*').or(`equipo_id.eq.${activoId},componente_id.eq.${activoId}`).order('montado_at', { ascending: false }),
    ])
    const ids = ((h.data ?? []) as { id: string }[]).map(x => x.id)
    const padreId = (yo.data as { montado_en: string | null } | null)?.montado_en ?? null
    const montajes = (m.data ?? []) as Montaje[]
    const otros = [...new Set([...ids, ...(padreId ? [padreId] : []), ...montajes.map(x => x.equipo_id === activoId ? x.componente_id : x.equipo_id)])]
    const { data } = otros.length ? await supabase.from('v_activos').select(SEL).in('id', otros) : { data: [] }
    const mapa = new Map(((data ?? []) as Mini[]).map(x => [x.id, x]))
    setHijos(ids.map(i => mapa.get(i)).filter(Boolean) as Mini[])
    setPadre(padreId ? mapa.get(padreId) ?? null : null)
    setHist(montajes.map(x => ({ ...x, otro: mapa.get(x.equipo_id === activoId ? x.componente_id : x.equipo_id) })))
  }
  useEffect(() => { cargar() }, [activoId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function desmontar(c: Mini) {
    setError('')
    const r1 = await supabase.from('activos').update({ montado_en: null }).eq('id', c.id)
    if (r1.error) return setError(mensajeError(r1.error))
    await supabase.from('montajes').update({ desmontado_at: new Date().toISOString() }).eq('componente_id', c.id).eq('equipo_id', activoId).is('desmontado_at', null)
    cargar()
  }

  if (!padre && hijos.length === 0 && !puedeEditar && hist.length === 0) return null
  return (
    <section className="tarjeta p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Puzzle size={17} className="text-marca" />Componentes</h2>
        <div className="flex gap-2">
          {hist.length > 0 && <button className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-marca" onClick={() => setVerHist(v => !v)}><History size={13} />{verHist ? 'Ocultar' : 'Historial'}</button>}
          {puedeEditar && !padre && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => setMontar(true)}><Plus size={14} />Montar</button>}
        </div>
      </div>
      {padre && (
        <Link to={`/activos/${padre.id}`} className="mb-3 flex items-center gap-3 rounded-xl border border-marca/30 bg-marca/5 p-2.5 transition hover:border-marca">
          <FotoActivo foto={padre.foto_principal} fotoModelo={padre.modelo_foto} categoria={padre.categoria} className="h-10 w-12 shrink-0 rounded-lg" icono={16} />
          <span className="min-w-0 flex-1"><span className="block text-[11px] uppercase tracking-wider text-marca">Montado en</span><span className="block truncate text-sm"><span className="font-mono text-xs text-marca">{padre.codigo}</span> {nombre(padre)}</span></span>
          <ArrowUpRight size={15} className="text-stone-400" />
        </Link>
      )}
      {padre && puedeEditar && <button className="mb-2 inline-flex items-center gap-1 text-xs text-stone-500 hover:text-red-700" onClick={async () => {
        const r = await supabase.from('activos').update({ montado_en: null }).eq('id', activoId); if (r.error) return setError(mensajeError(r.error))
        await supabase.from('montajes').update({ desmontado_at: new Date().toISOString() }).eq('componente_id', activoId).is('desmontado_at', null); cargar()
      }}><Unlink size={13} />Desmontar de este equipo</button>}
      {hijos.length === 0 && !padre && <p className="text-sm text-stone-500">Sin aditamentos montados. Ej. el martillo hidráulico de la retro, el cargador de la laptop o el tripié de la estación total.</p>}
      <ul className="space-y-1.5">
        {hijos.map(c => (
          <li key={c.id} className="flex items-center gap-2.5 rounded-xl border border-stone-200 p-2">
            <FotoActivo foto={c.foto_principal} fotoModelo={c.modelo_foto} categoria={c.categoria} className="h-9 w-11 shrink-0 rounded-lg" icono={15} />
            <Link to={`/activos/${c.id}`} className="min-w-0 flex-1 hover:text-marca"><span className="block font-mono text-[11px] text-marca">{c.codigo}</span><span className="block truncate text-sm">{nombre(c)}{c.serie ? <span className="text-xs text-stone-500"> · {c.serie}</span> : null}</span></Link>
            {puedeEditar && <button className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700" title="Desmontar" onClick={() => desmontar(c)}><Unlink size={14} /></button>}
          </li>
        ))}
      </ul>
      {verHist && (
        <ul className="mt-3 space-y-1 border-t border-stone-200 pt-3 text-xs text-stone-500">
          {hist.map(h => (
            <li key={h.id} className="flex flex-wrap gap-x-2"><span className="text-tinta">{h.otro ? `${h.otro.codigo} ${nombre(h.otro)}` : '—'}</span><span>{h.equipo_id === activoId ? 'montado aquí' : 'estuvo montado en ese equipo'}</span><span>{fecha(h.montado_at)} → {h.desmontado_at ? fecha(h.desmontado_at) : 'hoy'}</span></li>
          ))}
        </ul>
      )}
      {error && <div className="mt-3"><Aviso>{error}</Aviso></div>}
      {montar && <MontarModal activoId={activoId} empresaId={empresaId} onCerrar={() => setMontar(false)} onListo={() => { setMontar(false); cargar() }} />}
    </section>
  )
}

function MontarModal({ activoId, empresaId, onCerrar, onListo }: { activoId: string; empresaId: string; onCerrar: () => void; onListo: () => void }) {
  const [lista, setLista] = useState<Mini[]>([])
  const [libres, setLibres] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.from('v_activos').select(SEL).eq('empresa_id', empresaId).neq('estatus', 'baja').neq('id', activoId).order('codigo').limit(2000).then(({ data }) => setLista((data as Mini[]) ?? []))
    // solo los que no están montados en otro equipo ni tienen componentes propios
    Promise.all([supabase.from('activos').select('id,montado_en').eq('empresa_id', empresaId)]).then(([r]) => {
      const filas = (r.data ?? []) as { id: string; montado_en: string | null }[]
      const padres = new Set(filas.map(f => f.montado_en).filter(Boolean) as string[])
      setLibres(new Set(filas.filter(f => !f.montado_en && !padres.has(f.id)).map(f => f.id)))
    })
  }, [activoId, empresaId])
  const vis = useMemo(() => lista.filter(a => libres.has(a.id) && (!q || [a.codigo, a.descripcion, a.marca, a.modelo, a.serie].some(x => x?.toLowerCase().includes(q.toLowerCase())))).slice(0, 60), [lista, libres, q])

  async function guardar() {
    if (!sel.length) return setError('Elige al menos un componente.')
    const r = await supabase.from('activos').update({ montado_en: activoId }).in('id', sel)
    if (r.error) return setError(mensajeError(r.error))
    await supabase.from('montajes').insert(sel.map(id => ({ componente_id: id, equipo_id: activoId, empresa_id: empresaId, notas: notas || null })))
    onListo()
  }
  return (
    <Modal abierto titulo="Montar componentes" onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-3">
        <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder="Martillo, cucharón, cargador, tripié…" autoFocus /></div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {vis.length === 0 && <p className="py-6 text-center text-sm text-stone-500">No hay activos libres que coincidan en esta empresa.</p>}
          {vis.map(a => (
            <label key={a.id} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2 transition ${sel.includes(a.id) ? 'border-marca bg-marca/10' : 'border-stone-200'}`}>
              <input type="checkbox" className="accent-[#F9B234]" checked={sel.includes(a.id)} onChange={e => setSel(s => e.target.checked ? [...s, a.id] : s.filter(x => x !== a.id))} />
              <FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} className="h-9 w-11 shrink-0 rounded-lg" icono={14} />
              <span className="min-w-0"><span className="block font-mono text-[11px] text-marca">{a.codigo}</span><span className="block truncate text-sm">{nombre(a)}</span><span className="block truncate text-[11px] text-stone-500">{[a.serie, a.ubicacion].filter(Boolean).join(' · ')}</span></span>
            </label>
          ))}
        </div>
        <input className="campo" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas (opcional)" />
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}><Puzzle size={16} />Montar {sel.length || ''}</button></div>
      </div>
    </Modal>
  )
}
