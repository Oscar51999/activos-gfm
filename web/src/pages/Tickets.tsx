import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LifeBuoy, RefreshCw, ExternalLink, Link2, Unlink, Search, Image as Imagen, Trophy } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Encabezado, Cargando, Vacio, Aviso, Modal } from '../components/ui'
import { BuscarActivo, type ActivoMini } from '../components/Buscadores'

export type Ticket = { id: string; creado: string | null; nombre: string | null; area: string | null; categoria: string | null; urgencia: string | null; contacto: string | null
  descripcion: string | null; estado: string | null; notas: string | null; empresa_txt: string | null; ubicacion_txt: string | null; imagenes: number
  activo_id: string | null; ligado_manual: boolean; activos?: { codigo: string; descripcion: string } | null }

export const URL_MESA = 'https://mesadeayuda.gfmexico.mx/panel.html'
export const ESTADO_TK: Record<string, { t: string; c: string }> = {
  pendiente: { t: 'Pendiente', c: 'bg-amber-50 text-amber-800 ring-amber-200' }, en_proceso: { t: 'En proceso', c: 'bg-sky-50 text-sky-700 ring-sky-200' },
  resuelto: { t: 'Resuelto', c: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }, archivado: { t: 'Archivado', c: 'bg-stone-100 text-stone-500 ring-stone-200' },
}
export const fechaTk = (s: string | null) => s ? new Date(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'
const abierto = (t: Ticket) => t.estado === 'pendiente' || t.estado === 'en_proceso'

/** Tickets de la Mesa de ayuda, leídos cada 15 min (la Mesa de ayuda sigue funcionando igual; aquí solo se liga cada ticket a su equipo). */
export default function Tickets() {
  const { puedeEditar } = useAuth()
  const [lista, setLista] = useState<Ticket[] | null>(null)
  const [f, setF] = useState({ q: '', estado: 'abiertos', ligado: '' })
  const [ligar, setLigar] = useState<Ticket | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [sinc, setSinc] = useState(false)

  const cargar = () => supabase.from('tickets_ayuda').select('*, activos(codigo,descripcion)').order('creado', { ascending: false, nullsFirst: false }).limit(2000)
    .then(({ data, error }) => { if (error) setMsg({ ok: false, t: mensajeError(error) }); setLista((data as Ticket[]) ?? []) })
  useEffect(() => { cargar() }, [])

  async function sincronizar() {
    setSinc(true); setMsg(null)
    const { error } = await supabase.rpc('mesa_sincronizar')
    // la respuesta de la Mesa de ayuda llega unos segundos después: se procesa en una segunda vuelta
    if (!error) { await new Promise(r => setTimeout(r, 6000)); const r2 = await supabase.rpc('mesa_sincronizar'); setMsg(r2.error ? { ok: false, t: mensajeError(r2.error) } : { ok: true, t: 'Tickets actualizados desde la Mesa de ayuda.' }) }
    else setMsg({ ok: false, t: mensajeError(error) })
    await cargar(); setSinc(false)
  }

  const vis = useMemo(() => (lista ?? []).filter(t =>
    (f.estado === 'abiertos' ? abierto(t) : !f.estado || t.estado === f.estado)
    && (!f.ligado || (f.ligado === 'si' ? !!t.activo_id : !t.activo_id))
    && (!f.q || [t.id, t.nombre, t.descripcion, t.categoria, t.area, t.activos?.codigo, t.activos?.descripcion].some(x => x?.toLowerCase().includes(f.q.toLowerCase())))), [lista, f])

  const ranking = useMemo(() => {
    const m = new Map<string, { id: string; codigo: string; descripcion: string; n: number; abiertos: number }>()
    for (const t of lista ?? []) if (t.activo_id && t.activos) {
      const x = m.get(t.activo_id) ?? { id: t.activo_id, codigo: t.activos.codigo, descripcion: t.activos.descripcion, n: 0, abiertos: 0 }
      x.n++; if (abierto(t)) x.abiertos++; m.set(t.activo_id, x)
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8)
  }, [lista])
  const porCategoria = useMemo(() => {
    const m = new Map<string, number>(); for (const t of lista ?? []) m.set(t.categoria || 'Sin categoría', (m.get(t.categoria || 'Sin categoría') ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [lista])

  async function guardarLiga(t: Ticket, a: ActivoMini | null) {
    const { error } = await supabase.from('tickets_ayuda').update({ activo_id: a?.id ?? null, ligado_manual: true }).eq('id', t.id)
    if (error) { setMsg({ ok: false, t: mensajeError(error) }); return }
    setLista(l => (l ?? []).map(x => x.id === t.id ? { ...x, activo_id: a?.id ?? null, ligado_manual: true, activos: a ? { codigo: a.codigo, descripcion: a.descripcion } : null } : x))
    setLigar(null)
  }

  if (!lista) return <Cargando />
  const abiertos = lista.filter(abierto).length
  const nuevos = lista.filter(t => t.creado && Date.now() - new Date(t.creado).getTime() < 7 * 864e5).length
  const sinEquipo = lista.filter(t => !t.activo_id).length
  const maxCat = Math.max(1, ...porCategoria.map(x => x[1]))

  return (
    <div>
      <Encabezado titulo="Mesa de ayuda" sub="Los tickets de la Mesa de ayuda de TI ligados a cada equipo. Se actualizan solos cada 15 minutos; se atienden en la Mesa de ayuda como siempre."
        acciones={<>
          <a className="btn-sec" href={URL_MESA} target="_blank" rel="noreferrer"><ExternalLink size={16} />Abrir Mesa de ayuda</a>
          {puedeEditar && <button className="btn-primario" onClick={sincronizar} disabled={sinc}><RefreshCw size={16} className={sinc ? 'animate-spin' : ''} />{sinc ? 'Actualizando…' : 'Actualizar ahora'}</button>}
        </>} />
      {msg && <div className="mb-4"><Aviso tipo={msg.ok ? 'ok' : 'error'}>{msg.t}</Aviso></div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['Abiertos', abiertos, 'text-amber-700'], ['Nuevos (7 días)', nuevos, ''], ['Total', lista.length, ''], ['Sin equipo ligado', sinEquipo, sinEquipo ? 'text-red-700' : '']] as const).map(([t, v, c]) => (
          <div key={t} className="tarjeta p-4"><p className={`cifra text-3xl font-semibold ${c}`}>{v}</p><p className="text-xs text-stone-500">{t}</p></div>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2 *:min-w-0">
        <section className="tarjeta p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Trophy size={17} className="text-marca" />Equipos con más tickets</h2>
          {ranking.length === 0 ? <p className="text-sm text-stone-500">Todavía no hay tickets ligados a equipos.</p> : (
            <ol className="space-y-1.5">{ranking.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 text-sm">
                <span className="cifra w-5 text-right text-stone-400">{i + 1}</span>
                <Link to={`/activos/${r.id}`} className="min-w-0 flex-1 truncate hover:text-marca"><span className="font-mono text-xs text-marca">{r.codigo}</span> {r.descripcion}</Link>
                <span className="cifra font-semibold">{r.n}</span>{r.abiertos > 0 && <span className="rounded-full bg-amber-50 px-2 text-[11px] text-amber-800">{r.abiertos} abierto(s)</span>}
              </li>))}</ol>
          )}
        </section>
        <section className="tarjeta p-5">
          <h2 className="mb-3 font-semibold">Por categoría</h2>
          <ul className="space-y-2">{porCategoria.slice(0, 8).map(([c, n]) => (
            <li key={c} className="text-sm"><div className="flex justify-between"><span className="truncate">{c}</span><span className="cifra">{n}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-stone-100"><div className="h-full rounded-full bg-marca" style={{ width: `${(n / maxCat) * 100}%` }} /></div></li>))}</ul>
        </section>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="campo !pl-9" placeholder="Folio, persona, problema, equipo…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} /></label>
        <select className="campo !w-auto" value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>
          <option value="abiertos">Abiertos</option><option value="">Todos</option>{Object.entries(ESTADO_TK).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}
        </select>
        <select className="campo !w-auto" value={f.ligado} onChange={e => setF({ ...f, ligado: e.target.value })}>
          <option value="">Con y sin equipo</option><option value="si">Ligados a un equipo</option><option value="no">Sin equipo</option>
        </select>
      </div>

      {vis.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin tickets" texto="No hay tickets con estos filtros." /></div> : (
        <div className="tarjeta divide-y divide-stone-100">
          {vis.map(t => (
            <article key={t.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span className="font-mono font-semibold text-tinta">{t.id}</span>{fechaTk(t.creado)}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${ESTADO_TK[t.estado ?? '']?.c ?? 'bg-stone-100 ring-stone-200'}`}>{ESTADO_TK[t.estado ?? '']?.t ?? t.estado}</span>
                  {t.urgencia && <span className={/alta|cr[ií]tica/i.test(t.urgencia) ? 'font-medium text-red-600' : ''}>Urgencia {t.urgencia}</span>}
                  {t.imagenes > 0 && <span className="inline-flex items-center gap-1"><Imagen size={12} />{t.imagenes}</span>}
                </p>
                <p className="mt-1 text-sm"><b>{t.categoria ?? 'Ticket'}</b> · {t.descripcion}</p>
                <p className="mt-0.5 text-xs text-stone-500">{[t.nombre, t.area, t.empresa_txt, t.ubicacion_txt].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.activo_id && t.activos
                  ? <Link to={`/activos/${t.activo_id}`} className="rounded-xl border border-marca/40 bg-marca/10 px-3 py-1.5 text-xs hover:border-marca"><span className="font-mono text-marca">{t.activos.codigo}</span> <span className="text-stone-600">{t.activos.descripcion.slice(0, 28)}</span></Link>
                  : <span className="text-xs text-stone-400">Sin equipo</span>}
                {puedeEditar && <button className="btn-sec !px-2.5 !py-1.5 text-xs" onClick={() => setLigar(t)}><Link2 size={14} />{t.activo_id ? 'Cambiar' : 'Ligar equipo'}</button>}
              </div>
            </article>
          ))}
        </div>
      )}

      {ligar && <Modal abierto titulo={`Ligar ${ligar.id} a un equipo`} onCerrar={() => setLigar(null)} ancho="max-w-lg">
        <p className="mb-3 text-sm text-stone-600">{ligar.descripcion}</p>
        <BuscarActivo valor={null} onElegir={a => a && guardarLiga(ligar, a)} />
        {ligar.activo_id && <button className="btn-sec mt-4" onClick={() => guardarLiga(ligar, null)}><Unlink size={15} />Quitar el equipo ligado</button>}
        <p className="mt-3 text-[11px] text-stone-400">El sistema liga solo los tickets que mencionan el código, la serie o el No. económico del equipo, o cuando la persona tiene un solo equipo a su nombre. Lo que ligues aquí a mano se respeta.</p>
      </Modal>}
    </div>
  )
}

/** Tickets de un equipo, para su ficha. */
export function TicketsActivo({ activoId }: { activoId: string }) {
  const [l, setL] = useState<Ticket[] | null>(null)
  useEffect(() => { supabase.from('tickets_ayuda').select('*').eq('activo_id', activoId).order('creado', { ascending: false }).limit(20).then(({ data }) => setL((data as Ticket[]) ?? [])) }, [activoId])
  if (!l || l.length === 0) return null
  return (
    <section className="tarjeta p-5">
      <h2 className="mb-3 flex items-center justify-between gap-2 font-semibold"><span className="flex items-center gap-2"><LifeBuoy size={17} className="text-marca" />Mesa de ayuda · {l.length} ticket(s)</span>
        <Link to="/tickets" className="text-xs font-normal text-marca hover:underline">Ver todos</Link></h2>
      <ul className="divide-y divide-stone-100">{l.map(t => (
        <li key={t.id} className="py-2 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500"><span className="font-mono text-tinta">{t.id}</span>{fechaTk(t.creado)}
            <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${ESTADO_TK[t.estado ?? '']?.c ?? ''}`}>{ESTADO_TK[t.estado ?? '']?.t ?? t.estado}</span>{t.nombre}</p>
          <p className="mt-0.5"><b>{t.categoria}</b> · {t.descripcion}</p>
        </li>))}</ul>
    </section>
  )
}
