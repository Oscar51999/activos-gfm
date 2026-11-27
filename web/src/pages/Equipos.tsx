import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { UsersRound, Plus, Pencil, ArrowLeft, Crown, AlertTriangle, CheckCircle2, CircleDot, Search, Trash2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth, fotoPerfil } from '../lib/auth'
import { Encabezado, Cargando, Vacio, Modal, Campo, Aviso } from '../components/ui'
import Actividades from './Actividades'

type Equipo = { id: string; nombre: string; descripcion: string | null; color: string; miembros: number; abiertas: number; atoradas: number; vencidas: number; listas: number; soy_miembro: boolean }
type Persona = { id: string; nombre: string; foto_path: string | null; rol?: string; es_lider?: boolean }
const COLORES = ['#1F6FEB', '#E2A64B', '#00C875', '#A25DDC', '#E2445C', '#1FB5B8', '#FF7575', '#784BD1', '#FDAB3D', '#57606A']

function Cara({ p, tam = 28 }: { p: Persona; tam?: number }) {
  const foto = fotoPerfil(p)
  return (
    <span title={p.nombre} className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-marca to-[#9C6B24] font-bold text-[#120D04] ring-2 ring-panel" style={{ width: tam, height: tam, fontSize: tam * .38 }}>
      {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : p.nombre.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()}
    </span>
  )
}

/** Equipos de trabajo: grupos de usuarios con su propio tablero, calendario y kanban de tareas. */
export default function Equipos() {
  const { id } = useParams()
  return id ? <EquipoDetalle id={id} /> : <ListaEquipos />
}

function ListaEquipos() {
  const { esAdmin } = useAuth()
  const [l, setL] = useState<Equipo[] | null>(null)
  const [miembros, setMiembros] = useState<Record<string, Persona[]>>({})
  const [editar, setEditar] = useState<Equipo | 'nuevo' | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    supabase.from('v_equipos_trabajo').select('*').order('nombre').then(async ({ data }) => {
      const eqs = (data as Equipo[]) ?? []; setL(eqs)
      const m: Record<string, Persona[]> = {}
      await Promise.all(eqs.map(e => supabase.rpc('miembros_equipo', { p_equipo: e.id }).then(({ data }) => { m[e.id] = (data as Persona[]) ?? [] })))
      setMiembros(m)
    })
  }, [n])
  if (!l) return <Cargando />
  return (
    <div>
      <Encabezado titulo="Equipos de trabajo" sub="Agrupa a las personas por área. Cada equipo tiene su propio tablero, calendario y kanban de tareas, y sus miembros lo ven aunque su rol sea de solo consulta."
        acciones={esAdmin && <button className="btn-primario" onClick={() => setEditar('nuevo')}><Plus size={16} />Nuevo equipo</button>} />
      {l.length === 0 ? <Vacio titulo="Todavía no perteneces a ningún equipo" texto="El administrador puede crear equipos como Administración, Obra, Almacén o Compras y agregarte."
        accion={esAdmin ? <button className="btn-primario" onClick={() => setEditar('nuevo')}><Plus size={16} />Nuevo equipo</button> : undefined} /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {l.map(e => (
            <Link key={e.id} to={`/equipos/${e.id}`} className="tarjeta group flex flex-col gap-3 overflow-hidden p-0 transition hover:border-marca/50">
              <div className="h-1.5" style={{ background: e.color }} />
              <div className="flex flex-1 flex-col gap-3 px-5 pb-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-lg font-semibold"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color }} />{e.nombre}</h3>
                    {e.descripcion && <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">{e.descripcion}</p>}
                  </div>
                  {esAdmin && <button aria-label="Editar equipo" className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-marca" onClick={ev => { ev.preventDefault(); setEditar(e) }}><Pencil size={15} /></button>}
                </div>
                <div className="flex items-center">{(miembros[e.id] ?? []).slice(0, 7).map((p, i) => <span key={p.id} style={{ marginLeft: i ? -8 : 0 }}><Cara p={p} /></span>)}
                  <span className="ml-2 text-xs text-stone-500">{e.miembros} persona{e.miembros === 1 ? '' : 's'}</span></div>
                <div className="mt-auto flex flex-wrap gap-3 border-t border-stone-100 pt-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-stone-600"><CircleDot size={13} className="text-marca" />{e.abiertas} abiertas</span>
                  {e.atoradas > 0 && <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={13} />{e.atoradas} atoradas</span>}
                  {e.vencidas > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={13} />{e.vencidas} vencidas</span>}
                  <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} />{e.listas} listas</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {editar && <EditarEquipo e={editar === 'nuevo' ? null : editar} actuales={editar === 'nuevo' ? [] : miembros[editar.id] ?? []} onCerrar={() => setEditar(null)} onListo={() => { setEditar(null); setN(x => x + 1) }} />}
    </div>
  )
}

function EquipoDetalle({ id }: { id: string }) {
  const { esAdmin, perfil } = useAuth()
  const [e, setE] = useState<Equipo | null | undefined>(undefined)
  const [miembros, setMiembros] = useState<Persona[]>([])
  const [editar, setEditar] = useState(false)
  const [n, setN] = useState(0)
  useEffect(() => {
    supabase.from('v_equipos_trabajo').select('*').eq('id', id).maybeSingle().then(({ data }) => setE((data as Equipo) ?? null))
    supabase.rpc('miembros_equipo', { p_equipo: id }).then(({ data }) => setMiembros((data as Persona[]) ?? []))
  }, [id, n])
  if (e === undefined) return <Cargando />
  if (!e) return <Vacio titulo="Equipo no encontrado" texto="No existe o no perteneces a este equipo." accion={<Link to="/equipos" className="btn-sec">Ver equipos</Link>} />
  const soyLider = miembros.some(m => m.id === perfil?.id && m.es_lider)
  return (
    <div>
      <Link to="/equipos" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-marca"><ArrowLeft size={15} />Equipos de trabajo</Link>
      <section className="tarjeta mb-6 overflow-hidden p-0">
        <div className="h-1.5" style={{ background: e.color }} />
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold sm:text-3xl"><UsersRound size={26} style={{ color: e.color }} />{e.nombre}</h1>
            {e.descripcion && <p className="mt-1 text-sm text-stone-500">{e.descripcion}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">{miembros.map(m => (
              <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 py-0.5 pl-0.5 pr-2.5 text-xs"><Cara p={m} tam={22} />{m.nombre.split(' ').slice(0, 2).join(' ')}{m.es_lider && <Crown size={12} className="text-marca" />}</span>
            ))}</div>
            {(esAdmin || soyLider) && <button className="btn-sec" onClick={() => setEditar(true)}><Pencil size={15} />Editar equipo</button>}
          </div>
        </div>
      </section>
      <Actividades key={id + n} equipo={{ id: e.id, nombre: e.nombre }} />
      {editar && <EditarEquipo e={e} actuales={miembros} soloMiembros={!esAdmin} onCerrar={() => setEditar(false)} onListo={() => { setEditar(false); setN(x => x + 1) }} />}
    </div>
  )
}

function EditarEquipo({ e, actuales, soloMiembros = false, onCerrar, onListo }: { e: Equipo | null; actuales: Persona[]; soloMiembros?: boolean; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({ nombre: e?.nombre ?? '', descripcion: e?.descripcion ?? '', color: e?.color ?? COLORES[0] })
  const [todos, setTodos] = useState<Persona[]>([])
  const [sel, setSel] = useState<Record<string, boolean>>(Object.fromEntries(actuales.map(m => [m.id, !!m.es_lider])))
  const [q, setQ] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [borrar, setBorrar] = useState(false)
  useEffect(() => { supabase.rpc('usuarios_para_asignar').then(({ data }) => setTodos((data as Persona[]) ?? [])) }, [])
  const lista = [...todos, ...actuales.filter(a => !todos.some(t => t.id === a.id))].filter(p => !q || p.nombre.toLowerCase().includes(q.toLowerCase()))

  async function guardar() {
    setErr('')
    if (f.nombre.trim().length < 2) return setErr('Escribe el nombre del equipo.')
    if (!Object.keys(sel).length) return setErr('Agrega al menos una persona.')
    setBusy(true)
    let id = e?.id
    if (!soloMiembros) {
      const fila = { nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null, color: f.color }
      const r = e ? await supabase.from('equipos_trabajo').update(fila).eq('id', e.id).select('id').single() : await supabase.from('equipos_trabajo').insert(fila).select('id').single()
      if (r.error) { setBusy(false); return setErr(/duplicate|unique/i.test(r.error.message) ? 'Ya existe un equipo con ese nombre.' : mensajeError(r.error)) }
      id = (r.data as { id: string }).id
    }
    const antes = Object.fromEntries(actuales.map(m => [m.id, !!m.es_lider]))
    const quitar = Object.keys(antes).filter(k => !(k in sel))
    const upsert = Object.entries(sel).filter(([k, v]) => antes[k] !== v).map(([perfil_id, es_lider]) => ({ equipo_id: id, perfil_id, es_lider }))
    if (quitar.length) { const r = await supabase.from('equipo_miembros').delete().eq('equipo_id', id!).in('perfil_id', quitar); if (r.error) { setBusy(false); return setErr(mensajeError(r.error)) } }
    if (upsert.length) { const r = await supabase.from('equipo_miembros').upsert(upsert); if (r.error) { setBusy(false); return setErr(mensajeError(r.error)) } }
    setBusy(false); onListo()
  }
  async function eliminar() {
    if (!e) return
    const { error } = await supabase.from('equipos_trabajo').update({ activo: false }).eq('id', e.id)
    if (error) setErr(mensajeError(error)); else onListo()
  }

  return (
    <Modal abierto titulo={e ? `Editar ${e.nombre}` : 'Nuevo equipo de trabajo'} onCerrar={onCerrar}>
      <div className="space-y-4">
        {!soloMiembros && <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombre *"><input className="campo" placeholder="Administración, Obra Entrepiedras, Compras…" value={f.nombre} onChange={x => setF({ ...f, nombre: x.target.value })} /></Campo>
            <Campo label="Color"><div className="flex flex-wrap gap-1.5 pt-1">{COLORES.map(c => <button key={c} type="button" aria-label={c} onClick={() => setF({ ...f, color: c })} className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-panel ${f.color === c ? 'ring-2 ring-tinta' : ''}`} style={{ background: c }} />)}</div></Campo>
          </div>
          <Campo label="Descripción"><input className="campo" placeholder="De qué se encarga el equipo" value={f.descripcion} onChange={x => setF({ ...f, descripcion: x.target.value })} /></Campo>
        </>}
        <div>
          <p className="mb-1 text-sm font-medium">Personas ({Object.keys(sel).length})</p>
          <p className="mb-2 text-xs text-stone-500">Marca la corona para el líder: puede agregar o quitar personas del equipo.</p>
          <label className="relative mb-2 block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !py-1.5 pl-9 text-sm" placeholder="Buscar usuario…" value={q} onChange={x => setQ(x.target.value)} /></label>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">{lista.map(p => { const on = p.id in sel
            return (
              <div key={p.id} className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${on ? 'border-marca/50 bg-marca/5' : 'border-stone-200'}`}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={on} onChange={x => setSel(s => { const c = { ...s }; if (x.target.checked) c[p.id] = false; else delete c[p.id]; return c })} /><Cara p={p} tam={24} /><span className="truncate">{p.nombre}</span></label>
                {on && <button type="button" title="Líder del equipo" aria-label="Líder del equipo" onClick={() => setSel(s => ({ ...s, [p.id]: !s[p.id] }))} className={`rounded p-1 ${sel[p.id] ? 'text-marca' : 'text-stone-300 hover:text-stone-500'}`}><Crown size={16} /></button>}
              </div>) })}</div>
        </div>
        {err && <Aviso>{err}</Aviso>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-4">
          {e && !soloMiembros ? (borrar ? <span className="flex items-center gap-2 text-sm">¿Quitar el equipo? Sus tareas se conservan.<button className="btn-sec !text-red-600" onClick={eliminar}>Sí</button><button className="btn-sec" onClick={() => setBorrar(false)}>No</button></span>
            : <button className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-red-600" onClick={() => setBorrar(true)}><Trash2 size={14} />Quitar equipo</button>) : <span />}
          <div className="flex gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={busy} onClick={guardar}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
        </div>
      </div>
    </Modal>
  )
}
