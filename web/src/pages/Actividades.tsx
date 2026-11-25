import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, KanbanSquare, Table2, Plus, ChevronLeft, ChevronRight, ChevronDown, Search, Trash2, Check, X, MessageSquare, TrendingUp, CalendarRange, FileSpreadsheet, FileText, Upload } from 'lucide-react'
import { ImportarActividades } from '../components/Importadores'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth, fotoPerfil } from '../lib/auth'
import { useLista } from '../lib/hooks'
import { Cargando, Modal, Campo, Aviso } from '../components/ui'
import { libroExcel, descargar } from '../lib/excel'
import { pdfTabla } from '../lib/pdf'

type Estatus = 'pendiente' | 'en_curso' | 'atorado' | 'listo'
type Prioridad = 'baja' | 'media' | 'alta' | 'urgente'
type Act = { id: string; titulo: string; grupo: string; descripcion: string | null; estatus: Estatus; prioridad: Prioridad; responsable_id: string | null; empresa_id: string | null
  fecha_inicio: string | null; fecha_fin: string | null; avance: number; orden: number; created_at: string; participantes: string[] }
type Usuario = { id: string; nombre: string; foto_path: string | null }

// Colores tipo Monday: el estatus se ve de lejos
const ESTATUS: Record<Estatus, { t: string; c: string }> = {
  pendiente: { t: 'Pendiente', c: '#9AA0AA' }, en_curso: { t: 'En curso', c: '#E2A64B' }, atorado: { t: 'Atorado', c: '#E2445C' }, listo: { t: 'Listo', c: '#00C875' },
}
const PRIORIDAD: Record<Prioridad, { t: string; c: string }> = {
  baja: { t: 'Baja', c: '#579BFC' }, media: { t: 'Media', c: '#A25DDC' }, alta: { t: 'Alta', c: '#FDAB3D' }, urgente: { t: 'Urgente', c: '#E2445C' },
}
const COLORES_GRUPO = ['#579BFC', '#A25DDC', '#00C875', '#FDAB3D', '#E2445C', '#1FB5B8', '#FF7575', '#784BD1']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const corta = (s: string | null) => s ? new Date(s + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : ''
const hoy = iso(new Date())
const lunesDe = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const masDias = (f: string, n: number) => { const d = new Date(f + 'T12:00'); d.setDate(d.getDate() + n); return iso(d) }
const personasDe = (a: Pick<Act, 'responsable_id' | 'participantes'>) => [...new Set([a.responsable_id, ...(a.participantes ?? [])].filter(Boolean) as string[])]
type Avance = { id: string; actividad_id: string; autor_id: string | null; avance: number | null; estatus: Estatus | null; comentario: string | null; created_at: string }

/** Caritas encimadas de las personas de una actividad. */
function Personas({ ids, usuarios, max = 3, tam = 24 }: { ids: string[]; usuarios: Usuario[]; max?: number; tam?: number }) {
  if (!ids.length) return <span className="text-xs text-stone-400">—</span>
  const us = ids.map(id => usuarios.find(u => u.id === id)).filter(Boolean) as Usuario[]
  return (
    <span className="flex items-center" title={us.map(u => u.nombre).join(', ')}>
      {us.slice(0, max).map((u, i) => {
        const foto = fotoPerfil(u)
        return <span key={u.id} className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-marca to-[#9C6B24] font-bold text-[#120D04] ring-2 ring-panel" style={{ width: tam, height: tam, fontSize: tam * .38, marginLeft: i ? -tam * .3 : 0 }}>
          {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : u.nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
        </span>
      })}
      {us.length > max && <span className="ml-1 text-[11px] text-stone-500">+{us.length - max}</span>}
    </span>
  )
}

/** Actividades del equipo (supervisores y administradores): tablero por grupos, calendario y kanban. */
export default function Actividades() {
  const { puedeEditar, perfil } = useAuth()
  const [sp, setSp] = useSearchParams()
  const vista = (sp.get('vista') ?? 'tablero') as 'tablero' | 'calendario' | 'kanban'
  const [acts, setActs] = useState<Act[] | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const empresas = useLista('empresas', 'id,nombre,nombre_corto')
  const [editar, setEditar] = useState<Partial<Act> | null>(null)
  const [q, setQ] = useState('')
  const [mias, setMias] = useState(false)
  const [semana, setSemana] = useState<string | null>(null)   // lunes de la semana filtrada
  const [comentarios, setComentarios] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState('')
  const [importar, setImportar] = useState(false)

  const cargar = () => {
    supabase.from('actividad_avances').select('actividad_id').not('comentario', 'is', null).then(({ data }) => {
      const m = new Map<string, number>(); for (const x of (data ?? []) as { actividad_id: string }[]) m.set(x.actividad_id, (m.get(x.actividad_id) ?? 0) + 1); setComentarios(m)
    })
    return supabase.from('actividades').select('*').order('orden').order('created_at').then(({ data, error }) => { if (error) setError(mensajeError(error)); setActs(((data ?? []) as Act[]).map(a => ({ ...a, participantes: a.participantes ?? [] }))) })
  }
  useEffect(() => { cargar(); supabase.rpc('usuarios_para_asignar').then(({ data }) => setUsuarios((data as Usuario[]) ?? [])) }, [])

  const finSemana = semana ? masDias(semana, 6) : null
  const visibles = useMemo(() => (acts ?? []).filter(a => {
    if (mias && !personasDe(a).includes(perfil?.id ?? '')) return false
    if (q.trim() && !`${a.titulo} ${a.descripcion ?? ''} ${a.grupo}`.toLowerCase().includes(q.trim().toLowerCase())) return false
    if (semana && finSemana) { const s = a.fecha_inicio ?? a.fecha_fin, e = a.fecha_fin ?? a.fecha_inicio; if (!s || !e || s > finSemana || e < semana) return false }
    return true
  }), [acts, mias, q, perfil?.id, semana, finSemana])
  const grupos = useMemo(() => [...new Set((acts ?? []).map(a => a.grupo))].sort((a, b) => a === 'General' ? -1 : b === 'General' ? 1 : a.localeCompare(b)), [acts])

  async function actualizar(id: string, c: Partial<Act>) {
    setActs(xs => xs?.map(a => a.id === id ? { ...a, ...c, ...(c.estatus === 'listo' ? { avance: 100 } : {}) } : a) ?? null)
    const { error } = await supabase.from('actividades').update({ ...c, ...(c.estatus === 'listo' ? { avance: 100 } : {}) }).eq('id', id)
    if (error) { setError(mensajeError(error)); cargar() }
  }
  async function crearRapido(grupo: string, titulo: string) {
    if (!titulo.trim()) return
    const { error } = await supabase.from('actividades').insert({ titulo: titulo.trim(), grupo, responsable_id: perfil?.id ?? null, orden: (acts?.length ?? 0) + 1 })
    if (error) return setError(mensajeError(error))
    cargar()
  }

  const nombreDe = (id: string | null) => usuarios.find(u => u.id === id)?.nombre ?? ''
  const fechaTxt = (s: string | null) => s ? new Date(s + 'T12:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
  const titulo = `Actividades · ${vista === 'calendario' ? 'Calendario' : vista === 'kanban' ? 'Kanban' : 'Tablero'}`
  const filtrosTxt = () => [semana ? `Semana ${corta(semana)} – ${corta(finSemana)}` : 'Todas las fechas', mias && `Solo de ${perfil?.nombre ?? 'mí'}`, q.trim() && `Búsqueda: "${q.trim()}"`].filter(Boolean).join(' · ')
  // El orden sigue la vista: tablero por grupo, calendario por fecha, kanban por estatus
  const ordenadas = () => {
    const xs = [...visibles]
    if (vista === 'calendario') return xs.sort((a, b) => (a.fecha_inicio ?? a.fecha_fin ?? '9999').localeCompare(b.fecha_inicio ?? b.fecha_fin ?? '9999'))
    if (vista === 'kanban') return xs.sort((a, b) => Object.keys(ESTATUS).indexOf(a.estatus) - Object.keys(ESTATUS).indexOf(b.estatus))
    return xs.sort((a, b) => grupos.indexOf(a.grupo) - grupos.indexOf(b.grupo) || a.orden - b.orden)
  }
  const COLS: { titulo: string; valor: (a: Act) => string | number; ancho?: number }[] = [
    { titulo: 'Actividad', valor: a => a.titulo, ancho: 38 }, { titulo: 'Grupo', valor: a => a.grupo, ancho: 14 },
    { titulo: 'Estatus', valor: a => ESTATUS[a.estatus].t, ancho: 11 }, { titulo: 'Prioridad', valor: a => PRIORIDAD[a.prioridad].t, ancho: 10 },
    { titulo: 'Responsable', valor: a => nombreDe(a.responsable_id), ancho: 22 }, { titulo: 'Participantes', valor: a => (a.participantes ?? []).filter(x => x !== a.responsable_id).map(nombreDe).filter(Boolean).join(', '), ancho: 28 },
    { titulo: 'Inicio', valor: a => fechaTxt(a.fecha_inicio), ancho: 12 }, { titulo: 'Entrega', valor: a => fechaTxt(a.fecha_fin), ancho: 12 },
    { titulo: 'Avance', valor: a => `${a.avance ?? 0}%`, ancho: 8 }, { titulo: 'Comentarios', valor: a => comentarios.get(a.id) ?? 0, ancho: 11 },
  ]
  async function exportarExcel() {
    const filas = ordenadas()
    const { data } = filas.length ? await supabase.from('actividad_avances').select('*').in('actividad_id', filas.map(a => a.id)).order('created_at') : { data: [] }
    const avs = (data ?? []) as Avance[]
    const porId = new Map(filas.map(a => [a.id, a]))
    descargar(libroExcel<Act | Avance>([
      { nombre: 'Actividades', titulo: `${titulo} · ${filtrosTxt()}`, filas, columnas: [...COLS.map(c => ({ titulo: c.titulo, valor: (a: Act | Avance) => c.valor(a as Act), ancho: c.ancho })),
        { titulo: 'Descripción', valor: (a: Act | Avance) => (a as Act).descripcion ?? '', ancho: 40 }] },
      { nombre: 'Avances y comentarios', titulo: 'Bitácora de avances', filas: avs, columnas: [
        { titulo: 'Actividad', valor: x => porId.get((x as Avance).actividad_id)?.titulo ?? '', ancho: 38 }, { titulo: 'Fecha', valor: x => new Date((x as Avance).created_at).toLocaleString('es-MX'), ancho: 18 },
        { titulo: 'Quién', valor: x => nombreDe((x as Avance).autor_id), ancho: 22 }, { titulo: 'Avance', valor: x => (x as Avance).avance != null ? `${(x as Avance).avance}%` : '', ancho: 8 },
        { titulo: 'Estatus', valor: x => (x as Avance).estatus ? ESTATUS[(x as Avance).estatus!].t : '', ancho: 11 }, { titulo: 'Comentario', valor: x => (x as Avance).comentario ?? '', ancho: 60 },
      ] },
    ]), `actividades-${hoy}.xlsx`)
  }
  async function exportarPdf() {
    const filas = ordenadas()
    const colsPdf = COLS.filter(c => c.titulo !== 'Grupo' || vista !== 'tablero').filter(c => c.titulo !== 'Estatus' || vista !== 'kanban').filter(c => c.titulo !== 'Comentarios')
    const grupos_ = vista === 'tablero' ? grupos.map(g => ({ titulo: g, filas: filas.filter(a => a.grupo === g) }))
      : vista === 'kanban' ? (Object.keys(ESTATUS) as Estatus[]).map(k => ({ titulo: ESTATUS[k].t, filas: filas.filter(a => a.estatus === k) })) : undefined
    const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
    await pdfTabla<Act>({ titulo, subtitulo: `${filas.length} actividad(es) · ${filtrosTxt()}`, horizontal: true, nombre: `actividades-${vista}-${hoy}`, filas, grupos: grupos_,
      columnas: colsPdf.map(c => ({ titulo: c.titulo, valor: c.valor })), colorFila: a => vista === 'kanban' ? null : hex(ESTATUS[a.estatus].c) })
  }

  if (!puedeEditar) return <Navigate to="/" replace />
  if (!acts) return <Cargando />
  const resumen = (Object.keys(ESTATUS) as Estatus[]).map(k => ({ k, n: visibles.filter(a => a.estatus === k).length }))

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Actividades</h1>
          <p className="mt-1 text-sm text-stone-500">Pendientes del equipo de TI y supervisores: quién, qué y para cuándo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        {puedeEditar && <button className="btn-sec" onClick={() => setImportar(true)}><Upload size={16} />Cargar Excel</button>}
        <button className="btn-sec" onClick={exportarExcel} disabled={!visibles.length}><FileSpreadsheet size={16} />Excel</button>
        <button className="btn-sec" onClick={exportarPdf} disabled={!visibles.length}><FileText size={16} />PDF</button>
        <button className="btn-primario" onClick={() => setEditar({ grupo: grupos[0] ?? 'General', estatus: 'pendiente', prioridad: 'media', responsable_id: perfil?.id ?? null, fecha_inicio: hoy })}><Plus size={16} />Nueva actividad</button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-stone-200 p-1">
          {([['tablero', 'Tablero', Table2], ['calendario', 'Calendario', CalendarDays], ['kanban', 'Kanban', KanbanSquare]] as const).map(([k, t, I]) => (
            <button key={k} onClick={() => setSp({ vista: k }, { replace: true })} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${vista === k ? 'bg-marca/15 text-tinta' : 'text-stone-500 hover:text-tinta'}`}><I size={15} />{t}</button>
          ))}
        </div>
        <span className="relative min-w-[180px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !py-2 pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar actividad…" /></span>
        <label className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm"><input type="checkbox" checked={mias} onChange={e => setMias(e.target.checked)} />Solo las mías</label>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-stone-500"><CalendarRange size={14} />Semana</span>
        <button onClick={() => setSemana(null)} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${!semana ? 'bg-marca/15 text-marca ring-marca/40' : 'text-stone-500 ring-stone-200'}`}>Todas</button>
        <button onClick={() => setSemana(iso(lunesDe(new Date())))} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${semana === iso(lunesDe(new Date())) ? 'bg-marca/15 text-marca ring-marca/40' : 'text-stone-500 ring-stone-200'}`}>Esta semana</button>
        <button onClick={() => setSemana(iso(lunesDe(new Date(Date.now() + 7 * 864e5))))} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${semana === iso(lunesDe(new Date(Date.now() + 7 * 864e5))) ? 'bg-marca/15 text-marca ring-marca/40' : 'text-stone-500 ring-stone-200'}`}>Próxima</button>
        <span className="flex items-center gap-1 rounded-xl border border-stone-200 px-1 py-0.5">
          <button className="grid h-7 w-7 place-items-center rounded-lg text-stone-500 hover:text-tinta" onClick={() => setSemana(masDias(semana ?? iso(lunesDe(new Date())), -7))} aria-label="Semana anterior"><ChevronLeft size={15} /></button>
          <span className="min-w-36 text-center text-sm">{semana ? `${corta(semana)} – ${corta(finSemana)}` : 'Elige una semana'}</span>
          <button className="grid h-7 w-7 place-items-center rounded-lg text-stone-500 hover:text-tinta" onClick={() => setSemana(masDias(semana ?? iso(lunesDe(new Date())), 7))} aria-label="Semana siguiente"><ChevronRight size={15} /></button>
        </span>
        {semana && <span className="text-xs text-stone-500">{visibles.length} actividad(es) esa semana</span>}
      </div>
      <div className="mb-5 flex h-2 overflow-hidden rounded-full bg-stone-100" title="Avance por estatus">
        {resumen.map(r => r.n > 0 && <div key={r.k} style={{ width: `${(r.n / Math.max(1, visibles.length)) * 100}%`, background: ESTATUS[r.k].c }} />)}
      </div>
      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}

      {importar && <ImportarActividades abierto onCerrar={() => setImportar(false)} onListo={() => { setImportar(false); cargar() }} />}
      {vista === 'tablero' && <Tablero grupos={grupos} acts={visibles} usuarios={usuarios} comentarios={comentarios} actualizar={actualizar} abrir={setEditar} crear={crearRapido} />}
      {vista === 'calendario' && <Calendario acts={visibles} usuarios={usuarios} semana={semana} abrir={setEditar} nueva={f => setEditar({ grupo: grupos[0] ?? 'General', estatus: 'pendiente', prioridad: 'media', responsable_id: perfil?.id ?? null, fecha_inicio: f, fecha_fin: f })} />}
      {vista === 'kanban' && <Kanban acts={visibles} usuarios={usuarios} comentarios={comentarios} actualizar={actualizar} abrir={setEditar} />}

      {editar && <EditarAct act={editar} grupos={grupos} usuarios={usuarios} empresas={empresas.items as { id: string; nombre: string; nombre_corto?: string }[]} onCerrar={() => setEditar(null)} onListo={() => { setEditar(null); cargar() }} />}
    </div>
  )
}

function Pastilla({ texto, color, opciones, onElegir }: { texto: string; color: string; opciones: { k: string; t: string; c: string }[]; onElegir: (k: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <span className="relative block">
      <button onClick={() => setAbierto(a => !a)} className="w-full rounded-md px-2 py-1.5 text-center text-xs font-medium text-[#fff] transition hover:brightness-110" style={{ background: color }}>{texto}</button>
      {abierto && <>
        <span className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
        <span className="absolute left-1/2 top-full z-50 mt-1 grid w-36 -translate-x-1/2 gap-1 rounded-xl border border-stone-300 bg-panel p-1.5 shadow-2xl">
          {opciones.map(o => <button key={o.k} onClick={() => { onElegir(o.k); setAbierto(false) }} className="rounded-md px-2 py-1.5 text-xs font-medium text-[#fff]" style={{ background: o.c }}>{o.t}</button>)}
        </span>
      </>}
    </span>
  )
}

function Tablero({ grupos, acts, usuarios, comentarios, actualizar, abrir, crear }: {
  grupos: string[]; acts: Act[]; usuarios: Usuario[]; comentarios: Map<string, number>
  actualizar: (id: string, c: Partial<Act>) => void; abrir: (a: Partial<Act>) => void; crear: (grupo: string, titulo: string) => void
}) {
  const [cerrados, setCerrados] = useState<Set<string>>(new Set())
  const [nuevos, setNuevos] = useState<Record<string, string>>({})
  const [grupoNuevo, setGrupoNuevo] = useState<string | null>(null)
  const lista = grupos.length ? grupos : ['General']
  return (
    <div className="space-y-6">
      {lista.map((g, gi) => {
        const color = COLORES_GRUPO[gi % COLORES_GRUPO.length]
        const items = acts.filter(a => a.grupo === g)
        const cerrado = cerrados.has(g)
        return (
          <section key={g}>
            <button onClick={() => setCerrados(s => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n })} className="mb-2 flex items-center gap-2 font-semibold" style={{ color }}>
              <ChevronDown size={16} className={`transition ${cerrado ? '-rotate-90' : ''}`} />{g}<span className="text-xs font-normal text-stone-500">{items.length} actividad(es)</span>
            </button>
            {!cerrado && (
              <div className="tarjeta overflow-x-auto" style={{ borderLeft: `4px solid ${color}` }}>
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-left text-stone-500"><tr>
                    <th className="px-3 py-2 font-medium">Actividad</th><th className="w-28 px-2 py-2 text-center font-medium">Personas</th><th className="w-32 px-2 py-2 text-center font-medium">Estatus</th>
                    <th className="w-28 px-2 py-2 text-center font-medium">Prioridad</th><th className="w-36 px-2 py-2 text-center font-medium">Fechas</th><th className="w-28 px-2 py-2 font-medium">Avance</th>
                  </tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {items.map(a => {
                      const vencida = a.fecha_fin && a.fecha_fin < hoy && a.estatus !== 'listo', nc = comentarios.get(a.id) ?? 0
                      return (
                        <tr key={a.id} className="hover:bg-stone-50">
                          <td className="px-3 py-1.5"><button onClick={() => abrir(a)} className={`text-left hover:text-marca ${a.estatus === 'listo' ? 'text-stone-500 line-through' : ''}`}>{a.titulo}</button>
                            {nc > 0 && <button onClick={() => abrir(a)} className="ml-2 inline-flex items-center gap-0.5 align-middle text-[11px] text-stone-500 hover:text-marca" title="Comentarios de avance"><MessageSquare size={12} />{nc}</button>}
                            {a.descripcion && <span className="block truncate text-xs text-stone-500">{a.descripcion}</span>}</td>
                          <td className="px-2 py-1.5"><button onClick={() => abrir(a)} className="mx-auto flex justify-center rounded-md px-1 py-0.5 hover:bg-stone-100" aria-label="Personas"><Personas ids={personasDe(a)} usuarios={usuarios} /></button></td>
                          <td className="px-2 py-1.5"><Pastilla texto={ESTATUS[a.estatus].t} color={ESTATUS[a.estatus].c} opciones={Object.entries(ESTATUS).map(([k, v]) => ({ k, ...v }))} onElegir={k => actualizar(a.id, { estatus: k as Estatus })} /></td>
                          <td className="px-2 py-1.5"><Pastilla texto={PRIORIDAD[a.prioridad].t} color={PRIORIDAD[a.prioridad].c} opciones={Object.entries(PRIORIDAD).map(([k, v]) => ({ k, ...v }))} onElegir={k => actualizar(a.id, { prioridad: k as Prioridad })} /></td>
                          <td className={`px-2 py-1.5 text-center text-xs ${vencida ? 'font-medium text-red-700' : 'text-stone-600'}`}>{a.fecha_inicio || a.fecha_fin ? `${corta(a.fecha_inicio)}${a.fecha_fin && a.fecha_fin !== a.fecha_inicio ? ` – ${corta(a.fecha_fin)}` : ''}` : '—'}</td>
                          <td className="px-2 py-1.5"><button onClick={() => abrir({ ...a, _avance: true } as Partial<Act>)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 hover:bg-stone-100" title="Registrar avance"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full" style={{ width: `${a.avance}%`, background: ESTATUS.listo.c }} /></div><span className="cifra w-8 text-right text-[11px] text-stone-500">{a.avance}%</span></button></td>
                        </tr>
                      )
                    })}
                    <tr><td colSpan={6} className="px-3 py-1.5">
                      <form onSubmit={e => { e.preventDefault(); crear(g, nuevos[g] ?? ''); setNuevos(n => ({ ...n, [g]: '' })) }} className="flex items-center gap-2">
                        <Plus size={14} className="text-stone-400" /><input className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-stone-400" value={nuevos[g] ?? ''} onChange={e => setNuevos(n => ({ ...n, [g]: e.target.value }))} placeholder="Agregar actividad y Enter…" />
                      </form>
                    </td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
      {grupoNuevo === null
        ? <button className="btn-sec" onClick={() => setGrupoNuevo('')}><Plus size={15} />Nuevo grupo</button>
        : <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (grupoNuevo.trim()) crear(grupoNuevo.trim(), 'Primera actividad'); setGrupoNuevo(null) }}>
            <input className="campo max-w-xs" autoFocus value={grupoNuevo} onChange={e => setGrupoNuevo(e.target.value)} placeholder="Nombre del grupo (ej. Proyecto red Costa Palmas)" />
            <button className="btn-primario"><Check size={15} />Crear</button><button type="button" className="btn-sec" onClick={() => setGrupoNuevo(null)}><X size={15} /></button>
          </form>}
    </div>
  )
}

function Calendario({ acts, usuarios, semana, abrir, nueva }: { acts: Act[]; usuarios: Usuario[]; semana: string | null; abrir: (a: Partial<Act>) => void; nueva: (fecha: string) => void }) {
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  if (semana) {
    // Vista de una semana: cada día con todas sus actividades, personas y avance
    const dias = Array.from({ length: 7 }, (_, i) => masDias(semana, i))
    const enDia = (f: string) => acts.filter(a => { const s = a.fecha_inicio ?? a.fecha_fin, e = a.fecha_fin ?? a.fecha_inicio; return s && e && s <= f && f <= e })
    return (
      <div className="tarjeta overflow-x-auto">
        <div className="grid min-w-[840px] grid-cols-7">
          {dias.map(f => {
            const d = new Date(f + 'T12:00')
            return (
              <div key={f} className="min-h-72 border-r border-stone-100 last:border-r-0">
                <div className={`flex items-center justify-between border-b border-stone-200 px-2 py-2 ${f === hoy ? 'bg-marca/10' : ''}`}>
                  <span className="text-xs"><span className="uppercase tracking-wider text-stone-500">{d.toLocaleDateString('es-MX', { weekday: 'short' })}</span> <b className={f === hoy ? 'text-marca' : ''}>{d.getDate()}</b></span>
                  <button onClick={() => nueva(f)} className="text-stone-400 hover:text-marca" aria-label="Agregar"><Plus size={14} /></button>
                </div>
                <div className="space-y-1.5 p-1.5">
                  {enDia(f).map(a => (
                    <button key={a.id} onClick={() => abrir(a)} className="block w-full rounded-lg border border-stone-200 p-2 text-left hover:border-marca/50" style={{ borderLeft: `3px solid ${ESTATUS[a.estatus].c}` }}>
                      <span className="block text-xs font-medium leading-snug">{a.titulo}</span>
                      <span className="mt-1.5 flex items-center justify-between gap-1"><Personas ids={personasDe(a)} usuarios={usuarios} tam={18} /><span className="cifra text-[10px] text-stone-500">{a.avance}%</span></span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-stone-100"><span className="block h-full" style={{ width: `${a.avance}%`, background: ESTATUS.listo.c }} /></span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  const ini = new Date(mes); ini.setDate(1 - ((mes.getDay() + 6) % 7))   // semana empieza en lunes
  const dias = Array.from({ length: 42 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d })
  const enDia = (f: string) => acts.filter(a => { const s = a.fecha_inicio ?? a.fecha_fin, e = a.fecha_fin ?? a.fecha_inicio; return s && e && s <= f && f <= e })
  return (
    <div className="tarjeta overflow-hidden">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <button className="btn-sec !px-2 !py-1.5" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
        <h2 className="font-semibold capitalize">{mes.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</h2>
        <button className="btn-sec !px-2 !py-1.5" onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="border-b border-stone-200 px-2 py-1.5 text-center text-[11px] uppercase tracking-wider text-stone-500">{d}</div>)}
          {dias.map(d => {
            const f = iso(d), fuera = d.getMonth() !== mes.getMonth(), items = enDia(f)
            return (
              <div key={f} onDoubleClick={() => nueva(f)} className={`min-h-24 border-b border-r border-stone-100 p-1.5 ${fuera ? 'opacity-40' : ''}`}>
                <div className="mb-1 flex items-center justify-between"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${f === hoy ? 'bg-marca font-bold text-[#120D04]' : 'text-stone-500'}`}>{d.getDate()}</span>
                  <button onClick={() => nueva(f)} className="text-stone-300 hover:text-marca" aria-label="Agregar"><Plus size={13} /></button></div>
                <div className="space-y-1">
                  {items.slice(0, 3).map(a => <button key={a.id} onClick={() => abrir(a)} className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-[#fff]" style={{ background: ESTATUS[a.estatus].c }} title={a.titulo}>{a.titulo}</button>)}
                  {items.length > 3 && <p className="px-1 text-[10px] text-stone-500">+{items.length - 3} más</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Kanban({ acts, usuarios, comentarios, actualizar, abrir }: { acts: Act[]; usuarios: Usuario[]; comentarios: Map<string, number>; actualizar: (id: string, c: Partial<Act>) => void; abrir: (a: Partial<Act>) => void }) {
  const [arrastra, setArrastra] = useState<string | null>(null)
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(ESTATUS) as Estatus[]).map(k => {
        const items = acts.filter(a => a.estatus === k)
        return (
          <div key={k} onDragOver={e => e.preventDefault()} onDrop={() => { if (arrastra) actualizar(arrastra, { estatus: k }); setArrastra(null) }} className="min-h-40 rounded-2xl border border-stone-200 bg-stone-50 p-2">
            <p className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ESTATUS[k].c }} />{ESTATUS[k].t}<span className="text-xs font-normal text-stone-500">{items.length}</span></p>
            <div className="space-y-2">
              {items.map(a => {
                const nc = comentarios.get(a.id) ?? 0
                return (
                  <div key={a.id} draggable onDragStart={() => setArrastra(a.id)} onClick={() => abrir(a)} className="tarjeta cursor-grab p-3 active:cursor-grabbing" style={{ borderLeft: `3px solid ${PRIORIDAD[a.prioridad].c}` }}>
                    <p className="text-sm font-medium">{a.titulo}</p>
                    <p className="mt-0.5 text-[11px] text-stone-500">{a.grupo}{a.fecha_fin ? ` · ${corta(a.fecha_fin)}` : ''}</p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-100"><div className="h-full" style={{ width: `${a.avance}%`, background: ESTATUS.listo.c }} /></div>
                    <p className="mt-2 flex items-center justify-between gap-2 text-[11px] text-stone-500"><Personas ids={personasDe(a)} usuarios={usuarios} tam={20} /><span className="flex items-center gap-2">{nc > 0 && <span className="flex items-center gap-0.5"><MessageSquare size={11} />{nc}</span>}<span className="cifra">{a.avance}%</span></span></p>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EditarAct({ act, grupos, usuarios, empresas, onCerrar, onListo }: { act: Partial<Act>; grupos: string[]; usuarios: Usuario[]; empresas: { id: string; nombre: string; nombre_corto?: string }[]; onCerrar: () => void; onListo: () => void }) {
  const { perfil } = useAuth()
  const [f, setF] = useState({ titulo: act.titulo ?? '', grupo: act.grupo ?? 'General', descripcion: act.descripcion ?? '', estatus: act.estatus ?? 'pendiente', prioridad: act.prioridad ?? 'media',
    responsable_id: act.responsable_id ?? '', empresa_id: act.empresa_id ?? '', fecha_inicio: act.fecha_inicio ?? '', fecha_fin: act.fecha_fin ?? '', avance: act.avance ?? 0 })
  const [participantes, setParticipantes] = useState<string[]>(act.participantes ?? [])
  const [avances, setAvances] = useState<Avance[]>([])
  const [nuevo, setNuevo] = useState({ avance: act.avance ?? 0, estatus: '' as Estatus | '', comentario: '' })
  const [error, setError] = useState('')
  const [cambio, setCambio] = useState(false)
  const verAvances = () => { if (act.id) supabase.from('actividad_avances').select('*').eq('actividad_id', act.id).order('created_at', { ascending: false }).then(({ data }) => setAvances((data as Avance[]) ?? [])) }
  useEffect(verAvances, [act.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const enfocarAvance = (act as { _avance?: boolean })._avance
  const nombre = (id: string | null) => usuarios.find(u => u.id === id)?.nombre ?? 'Alguien'
  const cambiarPersona = (id: string) => setParticipantes(ps => ps.includes(id) ? ps.filter(x => x !== id) : [...ps, id])

  async function guardar() {
    if (!f.titulo.trim()) return setError('Escribe la actividad.')
    if (f.fecha_inicio && f.fecha_fin && f.fecha_fin < f.fecha_inicio) return setError('La fecha final no puede ser antes del inicio.')
    const datos = { ...f, titulo: f.titulo.trim(), grupo: f.grupo.trim() || 'General', descripcion: f.descripcion.trim() || null, responsable_id: f.responsable_id || null, empresa_id: f.empresa_id || null,
      fecha_inicio: f.fecha_inicio || null, fecha_fin: f.fecha_fin || null, avance: f.estatus === 'listo' ? 100 : Number(f.avance), participantes: participantes.filter(x => x !== f.responsable_id) }
    if (act.id) { delete (datos as Partial<typeof datos>).avance }   // el avance de una actividad existente se registra abajo, con comentario
    const { error } = act.id ? await supabase.from('actividades').update(datos).eq('id', act.id) : await supabase.from('actividades').insert(datos)
    if (error) return setError(mensajeError(error))
    onListo()
  }
  async function registrarAvance() {
    if (!act.id) return
    if (!nuevo.comentario.trim() && nuevo.avance === (act.avance ?? 0) && !nuevo.estatus) return setError('Mueve el avance o escribe un comentario.')
    const { error } = await supabase.from('actividad_avances').insert({ actividad_id: act.id, autor_id: perfil?.id, avance: nuevo.avance, estatus: nuevo.estatus || null, comentario: nuevo.comentario.trim() || null })
    if (error) return setError(mensajeError(error))
    setError(''); setNuevo(n => ({ ...n, comentario: '', estatus: '' })); setF(x => ({ ...x, avance: nuevo.avance, ...(nuevo.estatus ? { estatus: nuevo.estatus } : nuevo.avance === 100 ? { estatus: 'listo' } : {}) })); setCambio(true); verAvances()
  }
  async function borrar() { if (!act.id) return; await supabase.from('actividades').delete().eq('id', act.id); onListo() }
  const cerrar = () => { if (cambio) onListo(); else onCerrar() }

  return (
    <Modal abierto titulo={act.id ? 'Actividad' : 'Nueva actividad'} onCerrar={cerrar} ancho="max-w-2xl">
      <div className="space-y-5">
        {!enfocarAvance && <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Actividad *" className="sm:col-span-2"><input className="campo" autoFocus value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Instalar access point en obra Entrepiedras" /></Campo>
            <Campo label="Grupo"><input className="campo" list="grupos-act" value={f.grupo} onChange={e => setF({ ...f, grupo: e.target.value })} /><datalist id="grupos-act">{grupos.map(g => <option key={g} value={g} />)}</datalist></Campo>
            <Campo label="Responsable principal"><select className="campo" value={f.responsable_id} onChange={e => setF({ ...f, responsable_id: e.target.value })}><option value="">—</option>{usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
            <Campo label="También participan" className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {usuarios.filter(u => u.id !== f.responsable_id).map(u => {
                  const on = participantes.includes(u.id)
                  return <button key={u.id} type="button" onClick={() => cambiarPersona(u.id)} className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs ring-1 ring-inset ${on ? 'bg-marca/15 text-tinta ring-marca/40' : 'text-stone-500 ring-stone-200 hover:text-tinta'}`}>
                    <Personas ids={[u.id]} usuarios={usuarios} tam={20} />{u.nombre}{on && <Check size={12} className="text-marca" />}
                  </button>
                })}
                {usuarios.length <= 1 && <span className="text-xs text-stone-500">Da de alta más usuarios (supervisores o administradores) para asignarles actividades.</span>}
              </div>
            </Campo>
            <Campo label="Estatus"><select className="campo" value={f.estatus} onChange={e => setF({ ...f, estatus: e.target.value as Estatus })}>{Object.entries(ESTATUS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select></Campo>
            <Campo label="Prioridad"><select className="campo" value={f.prioridad} onChange={e => setF({ ...f, prioridad: e.target.value as Prioridad })}>{Object.entries(PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select></Campo>
            <Campo label="Inicio"><input className="campo" type="date" value={f.fecha_inicio} onChange={e => setF({ ...f, fecha_inicio: e.target.value })} /></Campo>
            <Campo label="Entrega"><input className="campo" type="date" value={f.fecha_fin} onChange={e => setF({ ...f, fecha_fin: e.target.value })} /></Campo>
            {!act.id && <Campo label={`Avance inicial: ${f.avance}%`}><input type="range" min="0" max="100" step="5" className="w-full accent-[var(--color-marca)]" value={f.avance} onChange={e => setF({ ...f, avance: Number(e.target.value) })} /></Campo>}
            <Campo label="Empresa (opcional)"><select className="campo" value={f.empresa_id} onChange={e => setF({ ...f, empresa_id: e.target.value })}><option value="">—</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nombre_corto || e.nombre}</option>)}</select></Campo>
            <Campo label="Detalle" className="sm:col-span-2"><textarea className="campo" rows={2} value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} /></Campo>
          </div>
        </>}

        {act.id && (
          <section className="rounded-2xl border border-stone-200 p-4">
            <h3 className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold"><span className="flex items-center gap-2"><TrendingUp size={16} className="text-marca" />Avance: {f.avance}%</span><span className="text-xs font-normal text-stone-500">{act.titulo}</span></h3>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full transition-all" style={{ width: `${f.avance}%`, background: ESTATUS.listo.c }} /></div>
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <Campo label={`Nuevo avance: ${nuevo.avance}%`}><input type="range" min="0" max="100" step="5" className="w-full accent-[var(--color-marca)]" value={nuevo.avance} onChange={e => setNuevo({ ...nuevo, avance: Number(e.target.value) })} /></Campo>
              <Campo label="Estatus"><select className="campo !py-1.5" value={nuevo.estatus} onChange={e => setNuevo({ ...nuevo, estatus: e.target.value as Estatus | '' })}><option value="">Automático</option>{Object.entries(ESTATUS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select></Campo>
              <Campo label="Comentario" className="sm:col-span-2"><textarea className="campo" rows={2} autoFocus={enfocarAvance} value={nuevo.comentario} onChange={e => setNuevo({ ...nuevo, comentario: e.target.value })} placeholder="Qué se hizo, qué falta, qué lo detiene…" /></Campo>
            </div>
            <div className="mt-2 flex justify-end"><button className="btn-primario !py-1.5 text-xs" onClick={registrarAvance}><Check size={14} />Registrar avance</button></div>
            {avances.length > 0 && (
              <ol className="mt-4 space-y-3 border-l border-stone-200 pl-4">
                {avances.map(v => (
                  <li key={v.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-panel" style={{ background: v.estatus ? ESTATUS[v.estatus].c : ESTATUS.en_curso.c }} />
                    <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500"><Personas ids={v.autor_id ? [v.autor_id] : []} usuarios={usuarios} tam={18} /><b className="font-medium text-tinta">{v.autor_id === perfil?.id ? 'Tú' : nombre(v.autor_id)}</b>
                      {v.avance != null && <span className="cifra rounded-full bg-emerald-50 px-1.5 text-emerald-700">{v.avance}%</span>}{v.estatus && <span>· {ESTATUS[v.estatus].t}</span>}
                      <span>· {new Date(v.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></p>
                    {v.comentario && <p className="mt-0.5 whitespace-pre-line text-sm">{v.comentario}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-wrap justify-between gap-2">
          {act.id && !enfocarAvance ? <button className="btn-peligro" onClick={borrar}><Trash2 size={15} />Borrar</button> : <span />}
          <div className="flex gap-2"><button className="btn-sec" onClick={cerrar}>{enfocarAvance ? 'Cerrar' : 'Cancelar'}</button>{!enfocarAvance && <button className="btn-primario" onClick={guardar}><Check size={15} />Guardar</button>}</div>
        </div>
      </div>
    </Modal>
  )
}
