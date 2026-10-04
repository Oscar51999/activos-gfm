import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardSignature, Undo2, Printer, Pencil, Mail, Phone, Hash, ArrowLeftRight, History, PenLine, Package, ShieldCheck, UserMinus } from 'lucide-react'
import { supabase, mensajeError, type Estatus, type TipoMov } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nombreEmpleado } from '../lib/hooks'
import { Cargando, Vacio, EstatusBadge } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import LogoEmpresa from '../components/LogoEmpresa'
import { ListaEmpleados, Avatar, EmpleadoModal, type Empleado } from '../components/Empleados'
import { TipoBadge } from './Movimientos'
import { PrestamoBadge } from '../components/Prestamo'
import { DocumentosPanel } from '../components/Documentos'
import { EntregasEmpleado } from './Almacen'
import { PedirConfirmacion } from './Confirmaciones'
import { Modal, Campo, Aviso } from '../components/ui'
import type { EmpresaLogo } from '../lib/logos'

/** Directorio de todo el personal del grupo. */
export default function Personal() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Empleados</h1>
        <p className="mt-1 text-sm text-stone-500">Personas que pueden tener activos a su cargo. Toca a alguien para ver todo lo que tiene.</p>
      </div>
      <ListaEmpleados />
    </div>
  )
}

type Act = { id: string; codigo: string; descripcion: string; serie: string | null; numero_economico: string | null; estatus: Estatus; categoria: string
  marca: string | null; modelo: string | null; ubicacion: string | null; foto_principal: string | null; modelo_foto: string | null; updated_at: string }
type Mov = { id: string; folio: string; tipo: TipoMov; fecha: string; num_activos: number; firmado: boolean; a_ubicacion: string | null; a_empleado_id: string | null }

/** Ficha del empleado: sus datos, todo lo que tiene asignado y su historial de resguardos. */
export function EmpleadoDetalle() {
  const { id } = useParams()
  const { puedeEditar, puedeResguardar } = useAuth()
  const [e, setE] = useState<(Empleado & { empresas: EmpresaLogo | null }) | null>(null)
  const [acts, setActs] = useState<Act[] | null>(null)
  const [movs, setMovs] = useState<Mov[]>([])
  const [editar, setEditar] = useState(false)
  const [prest, setPrest] = useState<Record<string, string>>({})
  const [confirmar, setConfirmar] = useState(false)
  const [baja, setBaja] = useState(false)
  const [fb, setFb] = useState({ fecha: new Date().toISOString().slice(0, 10), motivo: '', forzar: false })
  const [errBaja, setErrBaja] = useState('')
  const { esAdmin } = useAuth()
  const nav = useNavigate()
  async function darDeBaja() {
    setErrBaja('')
    const { error } = await supabase.from('empleados').update({ activo: false, fecha_baja: fb.fecha, motivo_baja: fb.motivo.trim() || null }).eq('id', e!.id)
    if (error) setErrBaja(mensajeError(error)); else nav(`/empresas/${e!.empresa_id}?tab=empleados`)
  }

  const cargar = () => {
    supabase.from('empleados').select('*,departamentos(nombre),empresas(nombre,nombre_corto,logo_path,logo_oscuro,color)').eq('id', id!).single()
      .then(({ data }) => setE(data as never))
    supabase.from('v_prestamos').select('activo_id,fecha_devolucion').eq('empleado_id', id!).then(({ data }) => setPrest(Object.fromEntries(((data ?? []) as { activo_id: string; fecha_devolucion: string }[]).map(p => [p.activo_id, p.fecha_devolucion]))))
    supabase.from('v_activos').select('*').eq('responsable_id', id!).neq('estatus', 'baja').order('codigo').then(({ data }) => setActs((data as Act[]) ?? []))
    Promise.all([
      supabase.from('v_movimientos').select('*').eq('a_empleado_id', id!),
      supabase.from('movimiento_activos').select('movimiento_id').eq('responsable_anterior_id', id!),
    ]).then(async ([a, b]) => {
      const ids = [...new Set(((b.data ?? []) as { movimiento_id: string }[]).map(x => x.movimiento_id))]
      const extra = ids.length ? (await supabase.from('v_movimientos').select('*').in('id', ids)).data ?? [] : []
      const todos = new Map<string, Mov>(); [...(a.data ?? []), ...extra].forEach(m => todos.set((m as Mov).id, m as Mov))
      setMovs([...todos.values()].sort((x, y) => y.fecha.localeCompare(x.fecha)))
    })
  }
  useEffect(cargar, [id])

  if (!e || !acts) return <Cargando />
  const nombre = nombreEmpleado(e)
  const sinFirma = movs.filter(m => !m.firmado && m.a_empleado_id === e.id).length

  return (
    <div>
      <Link to={`/empresas/${e.empresa_id}?tab=empleados`} className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />{e.empresas?.nombre_corto || e.empresas?.nombre || 'Empleados'}</Link>

      <header className="tarjeta relative mb-6 overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-marca/15 blur-3xl" />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center">
          <Avatar e={e} tam={88} />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold">{nombre}</h1>
            <p className="mt-1 text-stone-500">{[e.puesto, e.departamentos?.nombre].filter(Boolean).join(' · ') || 'Sin puesto registrado'}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
              {e.codigo && <span className="inline-flex items-center gap-1.5"><Hash size={14} className="text-stone-400" />{e.codigo}</span>}
              {e.email && <span className="inline-flex select-all items-center gap-1.5"><Mail size={14} className="text-stone-400" />{e.email}</span>}
              {e.telefono && <span className="inline-flex select-all items-center gap-1.5"><Phone size={14} className="text-stone-400" />{e.telefono}</span>}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {puedeResguardar && <Link to={`/resguardos/nuevo?tipo=asignacion&empresa=${e.empresa_id}&empleado=${e.id}`} className="btn-primario"><ClipboardSignature size={16} />Asignar activos</Link>}
              {puedeResguardar && acts.length > 0 && <Link to={`/resguardos/nuevo?tipo=devolucion&activos=${acts.map(a => a.id).join(',')}`} className="btn-sec"><Undo2 size={16} />Devolver todo</Link>}
              {acts.length > 0 && <Link to={`/empleados/${e.id}/resguardo`} className="btn-sec"><Printer size={16} />Resguardo vigente</Link>}
              {puedeResguardar && <Link to={`/kits?empleado=${e.id}`} className="btn-sec"><Package size={16} />Entregar kit</Link>}
              {puedeResguardar && acts.length > 0 && <button className="btn-sec" onClick={() => setConfirmar(true)}><ShieldCheck size={16} />Pedir confirmación</button>}
              {puedeEditar && <button className="btn-sec" onClick={() => setEditar(true)}><Pencil size={16} />Editar</button>}
              {puedeEditar && e.activo !== false && <button className="btn-sec hover:!border-red-200 hover:!text-red-700" onClick={() => setBaja(true)}><UserMinus size={16} />Dar de baja</button>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-3 md:items-end">
            {e.empresas && <div className="grid h-16 w-48 place-items-center rounded-xl border border-stone-200 bg-stone-50 px-3"><LogoEmpresa empresa={e.empresas} alto={36} ancho={170} /></div>}
            <div className="text-center md:text-right"><p className="cifra text-5xl font-semibold text-marca brillo">{acts.length}</p><p className="text-[11px] uppercase tracking-wider text-stone-500">activos a su cargo</p></div>
          </div>
        </div>
      </header>

      {sinFirma > 0 && <Link to="/resguardos" className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"><PenLine size={16} />{sinFirma} resguardo(s) de {e.nombres} esperan su firma.</Link>}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold">Lo que tiene asignado</h2>
          {acts.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin activos a su cargo" texto="Cuando le asignes algo, aparecerá aquí con su foto."
            accion={puedeResguardar && <Link to={`/resguardos/nuevo?tipo=asignacion&empresa=${e.empresa_id}&empleado=${e.id}`} className="btn-primario"><ClipboardSignature size={16} />Asignar activos</Link>} /></div> : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {acts.map((a, i) => (
                <div key={a.id} className="tarjeta viva group min-w-0 animate-entrar overflow-hidden" style={{ animationDelay: `${i * 40}ms` }}>
                  <Link to={`/activos/${a.id}`} className="block">
                    <div className="relative"><FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} className="aspect-[16/10] w-full" icono={36} />
                      <span className="absolute left-2 top-2"><EstatusBadge estatus={a.estatus} /></span></div>
                    <div className="p-4 pb-2">
                      <p className="font-mono text-[11px] text-marca">{a.codigo}</p>
                      <p className="truncate font-medium">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</p>
                      <p className="truncate text-xs text-stone-500">{[a.serie && `S/N ${a.serie}`, a.numero_economico].filter(Boolean).join(' · ') || a.categoria}</p>
                      <p className="mt-1 truncate text-[11px] text-stone-400">{a.ubicacion ?? 'Sin ubicación'}</p>
                      {prest[a.id] && <div className="mt-2"><PrestamoBadge fecha={prest[a.id]} /></div>}
                    </div>
                  </Link>
                  {puedeResguardar && <div className="flex gap-1 px-3 pb-3">
                    <Link to={`/resguardos/nuevo?tipo=devolucion&activos=${a.id}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-stone-500 hover:bg-stone-100 hover:text-tinta"><Undo2 size={13} />Devolver</Link>
                    <Link to={`/resguardos/nuevo?tipo=traspaso&activos=${a.id}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-stone-500 hover:bg-stone-100 hover:text-tinta"><ArrowLeftRight size={13} />Traspasar</Link>
                  </div>}
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="h-fit space-y-6">
          <DocumentosPanel empresaId={e.empresa_id} empleadoId={e.id} />
          <EntregasEmpleado empleadoId={e.id} />
          <div className="tarjeta p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><History size={16} className="text-marca" />Historial de resguardos</h2>
          {movs.length === 0 ? <p className="text-sm text-stone-500">Sin movimientos.</p> : (
            <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-stone-300">
              {movs.map(m => (
                <li key={m.id} className="relative pl-6">
                  <span className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-[#0B0D11]" style={{ background: { asignacion: '#38BDF8', devolucion: '#34D399', traspaso: '#A78BFA' }[m.tipo] }} />
                  <Link to={`/resguardos/${m.id}`} className="group block">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-stone-500 group-hover:text-marca">{m.folio}</span><TipoBadge tipo={m.tipo} /></div>
                    <p className="text-sm">{m.num_activos} activo(s){m.a_ubicacion ? ` · ${m.a_ubicacion}` : ''}</p>
                    <p className="text-[11px] text-stone-400">{new Date(m.fecha).toLocaleDateString('es-MX', { dateStyle: 'medium' })}{!m.firmado && m.a_empleado_id === e.id ? ' · sin firma' : ''}</p>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          </div>
        </aside>
      </div>
      <PedirConfirmacion abierto={confirmar} empleadoId={e.id} onCerrar={() => setConfirmar(false)} onHecho={() => {}} />
      <Modal abierto={baja} onCerrar={() => setBaja(false)} titulo={`Dar de baja a ${e.nombres}`}>
        <div className="space-y-4">
          {acts.length > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">Tiene {acts.length} activo(s) a su cargo:</p>
              <ul className="mt-2 space-y-1 text-xs">{acts.map(a => <li key={a.id}><span className="font-mono">{a.codigo}</span> · {[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</li>)}</ul>
              <Link to={`/resguardos/nuevo?tipo=devolucion&activos=${acts.map(a => a.id).join(',')}`} className="btn-primario mt-3 !py-2 text-xs"><Undo2 size={14} />Registrar la devolución de todo</Link>
            </div>
          ) : <Aviso tipo="ok">No tiene activos pendientes de devolver.</Aviso>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Fecha de baja"><input type="date" className="campo" value={fb.fecha} onChange={x => setFb({ ...fb, fecha: x.target.value })} /></Campo>
            <Campo label="Motivo"><select className="campo" value={fb.motivo} onChange={x => setFb({ ...fb, motivo: x.target.value })}><option value="">—</option><option>Renuncia</option><option>Término de obra</option><option>Despido</option><option>Cambio de empresa del grupo</option><option>Otro</option></select></Campo>
          </div>
          {acts.length > 0 && esAdmin && <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-[#F9B234]" checked={fb.forzar} onChange={x => setFb({ ...fb, forzar: x.target.checked })} />Dar de baja aunque tenga activos (quedan a su nombre como pendientes).</label>}
          {errBaja && <Aviso>{errBaja}</Aviso>}
          <div className="flex justify-end gap-2"><button className="btn-sec" onClick={() => setBaja(false)}>Cancelar</button>
            <button className="btn-peligro" disabled={acts.length > 0 && !fb.forzar} onClick={darDeBaja}><UserMinus size={16} />Dar de baja</button></div>
        </div>
      </Modal>
      <EmpleadoModal abierto={editar} empleado={e} onCerrar={() => setEditar(false)} onGuardado={() => { setEditar(false); cargar() }} />
    </div>
  )
}
