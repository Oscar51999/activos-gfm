import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Send, CheckCircle2, AlertTriangle, Clock, XCircle, Link2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Cargando, Vacio, Modal, Aviso, Campo } from '../components/ui'
import { Avatar } from '../components/Empleados'
import EnviarEnlace, { urlPublica } from '../components/Enlace'
import { fechaCorta } from '../components/Prestamo'

type Conf = { id: string; token: string; empresa_id: string; empleado_id: string; activos: { codigo: string }[]; estatus: 'pendiente' | 'confirmado' | 'con_diferencias' | 'cancelado'
  comentario: string | null; faltantes: string[] | null; respondido_at: string | null; created_at: string
  empleados: { nombres: string; apellidos: string | null; telefono: string | null } | null; empresas: { nombre: string; nombre_corto: string | null } | null }

const EST = {
  pendiente: { t: 'Pendiente', c: 'bg-amber-50 text-amber-800 ring-amber-200', i: Clock },
  confirmado: { t: 'Confirmó todo', c: 'bg-emerald-50 text-emerald-700 ring-emerald-200', i: CheckCircle2 },
  con_diferencias: { t: 'Con diferencias', c: 'bg-red-50 text-red-700 ring-red-200', i: AlertTriangle },
  cancelado: { t: 'Cancelado', c: 'bg-stone-100 text-stone-600 ring-stone-200', i: XCircle },
}
const mensaje = (nombre: string) => `Hola ${nombre.split(' ')[0]}, por favor confirma los activos que tienes a tu nombre en Grupo Firme:`

/** Crea solicitudes de confirmación para uno o varios empleados con activos y devuelve sus enlaces. */
export function PedirConfirmacion({ abierto, onCerrar, onHecho, empleadoId }: { abierto: boolean; onCerrar: () => void; onHecho: () => void; empleadoId?: string }) {
  const [empresas, setEmpresas] = useState<{ id: string; nombre: string }[]>([])
  const [empresa, setEmpresa] = useState('')
  const [cands, setCands] = useState<{ id: string; nombre: string; telefono: string | null; empresa_id: string; acts: { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; modelo_foto: string | null }[] }[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [creadas, setCreadas] = useState<{ nombre: string; telefono: string | null; token: string }[]>([])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setCreadas([]); setError('')
    supabase.from('empresas').select('id,nombre').eq('activo', true).order('nombre').then(({ data }) => setEmpresas((data as { id: string; nombre: string }[]) ?? []))
    Promise.all([
      supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,serie,modelo_foto,responsable_id,empresa_id').eq('estatus', 'asignado').limit(20000),
      supabase.from('empleados').select('id,nombres,apellidos,telefono,empresa_id').eq('activo', true),
    ]).then(([a, e]) => {
      const acts = (a.data ?? []) as { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; modelo_foto: string | null; responsable_id: string; empresa_id: string }[]
      const l = ((e.data ?? []) as { id: string; nombres: string; apellidos: string | null; telefono: string | null; empresa_id: string }[])
        .map(x => ({ id: x.id, nombre: [x.nombres, x.apellidos].filter(Boolean).join(' '), telefono: x.telefono, empresa_id: x.empresa_id, acts: acts.filter(y => y.responsable_id === x.id) }))
        .filter(x => x.acts.length && (!empleadoId || x.id === empleadoId))
      setCands(l); setSel(new Set(l.map(x => x.id)))
      if (empleadoId && l[0]) setEmpresa(l[0].empresa_id)
    })
  }, [abierto, empleadoId])

  const vis = cands.filter(c => !empresa || c.empresa_id === empresa)
  async function crear() {
    setError(''); setGuardando(true)
    const filas = vis.filter(c => sel.has(c.id)).map(c => ({ token: crypto.randomUUID(), empresa_id: c.empresa_id, empleado_id: c.id,
      activos: c.acts.map(a => ({ id: a.id, codigo: a.codigo, descripcion: a.descripcion, marca: a.marca, modelo: a.modelo, serie: a.serie, foto: a.modelo_foto })) }))
    const { error } = await supabase.from('confirmaciones').insert(filas)
    setGuardando(false)
    if (error) { setError(mensajeError(error)); return }
    setCreadas(filas.map(f => { const c = vis.find(x => x.id === f.empleado_id)!; return { nombre: c.nombre, telefono: c.telefono, token: f.token } }))
    onHecho()
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={creadas.length ? 'Enlaces listos para enviar' : 'Pedir confirmación de resguardo'} ancho="max-w-3xl">
      {creadas.length ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">Manda a cada persona su enlace. Lo abre en el celular, marca lo que tiene y responde. No necesita cuenta.</p>
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
            {creadas.map(c => (
              <li key={c.token} className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 p-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.nombre}</span>
                <EnviarEnlace compacto url={urlPublica(`confirmar/${c.token}`)} mensaje={mensaje(c.nombre)} telefono={c.telefono} />
              </li>
            ))}
          </ul>
          <div className="flex justify-end"><button className="btn-primario" onClick={onCerrar}>Listo</button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-stone-500">Cada empleado recibe un enlace con la lista de lo que tiene a su nombre y confirma si todavía lo tiene. Recomendado cada 6 meses.</p>
          {!empleadoId && <Campo label="Empresa"><select className="campo" value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas</option>{empresas.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>}
          {vis.length === 0 ? <Aviso tipo="info">No hay empleados con activos asignados{empresa ? ' en esta empresa' : ''}.</Aviso> : (
            <>
              {!empleadoId && <div className="flex justify-between text-xs"><span className="text-stone-500">{[...sel].filter(id => vis.some(v => v.id === id)).length} de {vis.length} seleccionados</span>
                <button className="text-marca hover:underline" onClick={() => setSel(s => s.size ? new Set() : new Set(vis.map(v => v.id)))}>{sel.size ? 'Quitar todos' : 'Seleccionar todos'}</button></div>}
              <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto">
                {vis.map(c => (
                  <li key={c.id}><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 px-3 py-2 hover:bg-stone-50">
                    <input type="checkbox" className="accent-[#F9B234]" checked={sel.has(c.id)} onChange={() => setSel(s => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })} />
                    <Avatar e={{ id: c.id, nombres: c.nombre }} tam={30} /><span className="min-w-0 flex-1 truncate text-sm">{c.nombre}</span><span className="text-xs text-stone-500">{c.acts.length} activo(s)</span>
                  </label></li>
                ))}
              </ul>
            </>
          )}
          {error && <Aviso>{error}</Aviso>}
          <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button>
            <button className="btn-primario" disabled={guardando || !vis.some(v => sel.has(v.id))} onClick={crear}><Send size={16} />{guardando ? 'Creando…' : 'Crear enlaces'}</button></div>
        </div>
      )}
    </Modal>
  )
}

/** Seguimiento de las confirmaciones de resguardo. */
export default function Confirmaciones() {
  const { puedeResguardar } = useAuth()
  const [lista, setLista] = useState<Conf[] | null>(null)
  const [filtro, setFiltro] = useState<'todas' | Conf['estatus']>('todas')
  const [pedir, setPedir] = useState(false)
  const [ver, setVer] = useState<Conf | null>(null)
  const cargar = () => { supabase.from('confirmaciones').select('*,empleados(nombres,apellidos,telefono),empresas(nombre,nombre_corto)').neq('estatus', 'cancelado').order('created_at', { ascending: false }).then(({ data }) => setLista((data as unknown as Conf[]) ?? [])) }
  useEffect(cargar, [])
  const cuenta = useMemo(() => ({ pendiente: 0, confirmado: 0, con_diferencias: 0, ...Object.fromEntries(Object.entries((lista ?? []).reduce((m, c) => ({ ...m, [c.estatus]: (m[c.estatus] ?? 0) + 1 }), {} as Record<string, number>))) }), [lista]) as Record<string, number>

  if (!lista) return <Cargando />
  const vis = lista.filter(c => filtro === 'todas' || c.estatus === filtro)
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Confirmación de resguardo</h1>
          <p className="mt-1 text-sm text-stone-500">Cada empleado confirma desde su celular que todavía tiene lo que está a su nombre.</p>
        </div>
        {puedeResguardar && <button className="btn-primario" onClick={() => setPedir(true)}><Send size={16} />Pedir confirmación</button>}
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {(['pendiente', 'confirmado', 'con_diferencias'] as const).map(k => {
          const E = EST[k]
          return (
            <button key={k} onClick={() => setFiltro(filtro === k ? 'todas' : k)} className={`tarjeta p-4 text-left ${filtro === k ? '!border-marca ring-2 ring-marca/30' : ''}`}>
              <E.i size={18} className={k === 'con_diferencias' && cuenta[k] ? 'text-red-700' : k === 'confirmado' ? 'text-emerald-700' : 'text-amber-700'} />
              <p className="cifra mt-2 text-3xl font-semibold">{cuenta[k] ?? 0}</p><p className="text-[11px] uppercase tracking-wider text-stone-500">{E.t}</p>
            </button>
          )
        })}
      </div>
      {vis.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin confirmaciones" texto="Pide la primera: elige a los empleados con activos y mándales su enlace por WhatsApp." /></div> : (
        <div className="tarjeta divide-y divide-stone-100 overflow-hidden">
          {vis.map(c => {
            const E = EST[c.estatus], nombre = [c.empleados?.nombres, c.empleados?.apellidos].filter(Boolean).join(' ')
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar e={{ id: c.empleado_id, nombres: nombre }} tam={36} />
                <Link to={`/empleados/${c.empleado_id}`} className="min-w-0 flex-1 basis-40"><p className="truncate text-sm font-medium hover:text-marca">{nombre}</p><p className="truncate text-xs text-stone-500">{c.empresas?.nombre_corto || c.empresas?.nombre} · {c.activos.length} activo(s) · pedida el {fechaCorta(c.created_at)}</p></Link>
                <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${E.c}`}><E.i size={11} />{E.t}</span>
                {c.estatus === 'pendiente' ? (
                  <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => setVer(c)}><Link2 size={14} />Enlace</button>
                ) : (
                  <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => setVer(c)}>Ver respuesta</button>
                )}
              </div>
            )
          })}
        </div>
      )}
      <PedirConfirmacion abierto={pedir} onCerrar={() => { setPedir(false); cargar() }} onHecho={cargar} />
      <Modal abierto={!!ver} onCerrar={() => setVer(null)} titulo={ver?.estatus === 'pendiente' ? 'Enviar enlace' : 'Respuesta'}>
        {ver && (ver.estatus === 'pendiente' ? (
          <EnviarEnlace url={urlPublica(`confirmar/${ver.token}`)} mensaje={mensaje(ver.empleados?.nombres ?? '')} telefono={ver.empleados?.telefono} />
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-stone-500">Respondió el {ver.respondido_at ? fechaCorta(ver.respondido_at) : '—'}.</p>
            <ul className="space-y-1.5">{ver.activos.map(a => {
              const falta = ver.faltantes?.includes(a.codigo)
              return <li key={a.codigo} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${falta ? 'border-red-200 bg-red-50 text-red-700' : 'border-stone-200'}`}>{falta ? <XCircle size={14} /> : <ShieldCheck size={14} className="text-emerald-700" />}<span className="font-mono text-xs">{a.codigo}</span><span className="truncate">{(a as { descripcion?: string }).descripcion}</span>{falta && <b className="ml-auto text-xs">No lo tiene</b>}</li>
            })}</ul>
            {ver.comentario && <p className="rounded-lg border border-stone-200 px-3 py-2">“{ver.comentario}”</p>}
            {ver.faltantes?.length ? <Link to="/inventarios" className="btn-sec">Revisar con un conteo físico</Link> : null}
          </div>
        ))}
      </Modal>
    </div>
  )
}
