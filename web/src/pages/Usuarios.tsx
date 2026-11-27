import { useCallback, useEffect, useState } from 'react'
import { Pencil, UserPlus, KeyRound, Trash2, Eye, EyeOff, HardHat, Mail, Copy, Check, Wand2, LockKeyhole } from 'lucide-react'
import { MODULOS, nombreModulo } from '../lib/avisos'
import { supabase, ROLES, mensajeError, type Rol } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, nombreEmpleado } from '../lib/hooks'
import { Encabezado, Modal, Campo, Aviso, Cargando } from '../components/ui'

type EstadoClave = { perfil_id: string; estado: 'visible' | 'cambiada'; asignada_at: string | null; cambiada_at: string | null }
type Perfil = { id: string; nombre: string; usuario?: string | null; email: string | null; rol: Rol; activo: boolean; todas_empresas: boolean; empleado_id: string | null; created_at: string; avisos?: string[]; avisos_correo?: string | null; avisos_activos?: boolean }

export default function Usuarios() {
  const { perfil: yo, esSuper } = useAuth()
  const [nuevo, setNuevo] = useState(false)
  const [clave, setClave] = useState<Perfil | null>(null)
  const [verClave, setVerClave] = useState<Perfil | null>(null)
  const [estClave, setEstClave] = useState<Record<string, EstadoClave>>({})
  const [borrar, setBorrar] = useState<Perfil | null>(null)
  const empresas = useLista('empresas')
  const empleados = useLista('empleados', 'id,nombres,apellidos,empresa_id', 'nombres')
  const [filas, setFilas] = useState<Perfil[] | null>(null)
  const [accesos, setAccesos] = useState<Record<string, string[]>>({})
  const [obrasDe, setObrasDe] = useState<Record<string, string[]>>({})
  const ubicaciones = useLista('ubicaciones', 'id,nombre,empresa_id,tipo')
  const [edit, setEdit] = useState<(Perfil & { empresas: string[]; obras: string[]; limitar: boolean }) | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const [rp, ra, ro] = await Promise.all([
      supabase.from('perfiles').select('*').order('activo').order('created_at', { ascending: false }),
      supabase.from('perfil_empresas').select('perfil_id,empresa_id'),
      supabase.from('perfil_ubicaciones').select('perfil_id,ubicacion_id'),
    ])
    setFilas((rp.data as Perfil[]) ?? [])
    const m: Record<string, string[]> = {}
    ;((ra.data as { perfil_id: string; empresa_id: string }[]) ?? []).forEach(r => { (m[r.perfil_id] ??= []).push(r.empresa_id) })
    setAccesos(m)
    const o: Record<string, string[]> = {}
    ;((ro.data as { perfil_id: string; ubicacion_id: string }[]) ?? []).forEach(r => { (o[r.perfil_id] ??= []).push(r.ubicacion_id) })
    setObrasDe(o)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const cargarClaves = useCallback(() => {
    if (!esSuper) return
    supabase.rpc('admin_estado_contrasenas').then(({ data }) => setEstClave(Object.fromEntries(((data as EstadoClave[]) ?? []).map(x => [x.perfil_id, x]))))
  }, [esSuper])
  useEffect(() => { cargarClaves() }, [cargarClaves])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    setError('')
    const { error } = await supabase.from('perfiles').update({
      nombre: edit.nombre, usuario: edit.usuario?.trim().toUpperCase() || null, rol: edit.rol, activo: edit.activo, todas_empresas: edit.todas_empresas, empleado_id: edit.empleado_id || null,
      avisos: edit.avisos ?? [], avisos_correo: edit.avisos_correo?.trim() || null,
    }).eq('id', edit.id)
    if (error) { setError(mensajeError(error)); return }
    const antes = accesos[edit.id] ?? []
    const quitar = antes.filter(x => !edit.empresas.includes(x))
    const poner = edit.empresas.filter(x => !antes.includes(x))
    if (quitar.length) await supabase.from('perfil_empresas').delete().eq('perfil_id', edit.id).in('empresa_id', quitar)
    if (poner.length) {
      const r = await supabase.from('perfil_empresas').insert(poner.map(empresa_id => ({ perfil_id: edit.id, empresa_id })))
      if (r.error) { setError(mensajeError(r.error)); return }
    }
    // Obras: si "limitar" está apagado se borran todas (sin restricción)
    const obrasAntes = obrasDe[edit.id] ?? [], obrasAhora = edit.limitar ? edit.obras : []
    const qo = obrasAntes.filter(x => !obrasAhora.includes(x)), po = obrasAhora.filter(x => !obrasAntes.includes(x))
    if (qo.length) await supabase.from('perfil_ubicaciones').delete().eq('perfil_id', edit.id).in('ubicacion_id', qo)
    if (po.length) { const r = await supabase.from('perfil_ubicaciones').insert(po.map(ubicacion_id => ({ perfil_id: edit.id, ubicacion_id }))); if (r.error) { setError(mensajeError(r.error)); return } }
    setEdit(null); cargar()
  }

  if (!filas) return <Cargando />
  const pendientes = filas.filter(f => !f.activo).length

  return (
    <div>
      <Encabezado titulo="Usuarios" sub="Crea cuentas con correo, usuario y contraseña, o activa a quien se registró solo; aquí das rol y empresas."
        acciones={<button className="btn-primario" onClick={() => setNuevo(true)}><UserPlus size={16} />Nuevo usuario</button>} />
      {pendientes > 0 && <div className="mb-4"><Aviso tipo="info">{pendientes} usuario(s) esperan activación.</Aviso></div>}
      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-4 py-2.5 font-medium">Nombre</th><th className="px-4 py-2.5 font-medium">Correo</th><th className="px-4 py-2.5 font-medium">Rol</th><th className="px-4 py-2.5 font-medium">Empresas</th><th className="px-4 py-2.5 font-medium">Encargado de</th><th className="px-4 py-2.5 font-medium">Estado</th><th className="w-12" /></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.map(f => (
              <tr key={f.id} className="hover:bg-stone-50">
                <td className="px-4 py-2.5 font-medium">{f.nombre}{f.usuario && <span className="block font-mono text-[10px] text-stone-500">{f.usuario}</span>}</td>
                <td className="px-4 py-2.5 text-stone-600">{f.email}</td>
                <td className="px-4 py-2.5">{ROLES[f.rol]}</td>
                <td className="px-4 py-2.5 text-xs">{f.todas_empresas || f.rol === 'admin' ? 'Todas' : (accesos[f.id] ?? []).map(id => empresas.items.find(e => e.id === id)?.nombre).filter(Boolean).join(', ') || <span className="text-rojo">Ninguna</span>}</td>
                <td className="px-4 py-2.5"><span className="flex max-w-[16rem] flex-wrap gap-1">{(f.avisos ?? []).length ? (f.avisos ?? []).map(m => <span key={m} className="rounded-full bg-marca/10 px-2 py-0.5 text-[10px] text-marca-oscuro ring-1 ring-inset ring-marca/30">{nombreModulo(m)}</span>) : <span className="text-xs text-stone-400">—</span>}</span></td>
                <td className="px-4 py-2.5">{f.activo ? <span className="text-emerald-700">Activo</span> : <span className="font-medium text-amber-700">Pendiente</span>}</td>
                <td className="whitespace-nowrap px-2">
                  <button className="rounded p-1.5 text-stone-500 hover:bg-stone-200 hover:text-tinta" aria-label="Editar permisos" title="Editar rol y empresas" onClick={() => { setError(''); setEdit({ ...f, empresas: accesos[f.id] ?? [], obras: obrasDe[f.id] ?? [], limitar: (obrasDe[f.id] ?? []).length > 0 }) }}><Pencil size={15} /></button>
                  {esSuper && f.id !== yo?.id && <>
                    <button className={`rounded p-1.5 hover:bg-stone-200 hover:text-tinta ${estClave[f.id]?.estado === 'visible' ? 'text-marca' : 'text-stone-400'}`} aria-label="Ver contraseña" title={estClave[f.id]?.estado === 'visible' ? 'Ver contraseña' : estClave[f.id]?.estado === 'cambiada' ? 'El usuario cambió su contraseña' : 'Contraseña sin registrar'} onClick={() => setVerClave(f)}><Eye size={15} /></button>
                    <button className="rounded p-1.5 text-stone-500 hover:bg-stone-200 hover:text-tinta" aria-label="Poner contraseña" title="Poner contraseña nueva" onClick={() => setClave(f)}><KeyRound size={15} /></button>
                    <button className="rounded p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-700" aria-label="Eliminar usuario" title="Eliminar usuario" onClick={() => setBorrar(f)}><Trash2 size={15} /></button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NuevoUsuario abierto={nuevo} empresas={empresas.items} empleados={empleados.items} ubicaciones={ubicaciones.items} puedeAdmin={esSuper} onCerrar={() => setNuevo(false)} onListo={() => { setNuevo(false); cargar() }} />
      {clave && <PonerContrasena u={clave} onCerrar={() => { setClave(null); cargarClaves() }} />}
      {verClave && <VerContrasena u={verClave} onCerrar={() => setVerClave(null)} onAsignar={() => { setClave(verClave); setVerClave(null) }} />}
      {borrar && <EliminarUsuario u={borrar} onCerrar={() => setBorrar(null)} onListo={() => { setBorrar(null); cargar() }} />}

      <Modal abierto={!!edit} titulo="Editar usuario" onCerrar={() => setEdit(null)}>
        {edit && (
          <form onSubmit={guardar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nombre"><input className="campo" value={edit.nombre} onChange={e => setEdit({ ...edit, nombre: e.target.value })} /></Campo>
              <Campo label="Usuario para entrar (ej. OSCAR COTA)"><input className="campo uppercase" value={edit.usuario ?? ''} onChange={e => setEdit({ ...edit, usuario: e.target.value })} /></Campo>
              <Campo label="Correo"><input className="campo" value={edit.email ?? ''} disabled /></Campo>
              <Campo label="Acceso" className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.activo} disabled={edit.id === yo?.id} onChange={e => setEdit({ ...edit, activo: e.target.checked })} />Usuario activo (puede entrar al sistema)</label>
              </Campo>
            </div>
            <PermisosUsuario v={edit} onChange={x => setEdit({ ...edit, ...x })} empresas={empresas.items} empleados={empleados.items} ubicaciones={ubicaciones.items} puedeAdmin={esSuper} bloquearRol={edit.id === yo?.id} correo={edit.email} />
            {error && <Aviso>{error}</Aviso>}
            <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
              <button type="button" className="btn-sec" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn-primario">Guardar</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

function CampoClave({ valor, onChange, label = 'Contraseña (mín. 8)' }: { valor: string; onChange: (v: string) => void; label?: string }) {
  const [ver, setVer] = useState(false)
  return (
    <Campo label={label}>
      <span className="relative block">
        <input className="campo pr-10" type={ver ? 'text' : 'password'} minLength={8} required autoComplete="new-password" value={valor} onChange={e => onChange(e.target.value)} />
        <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar' : 'Mostrar'} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-stone-400 hover:text-tinta">{ver ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </span>
    </Campo>
  )
}

export type Permisos = { rol: Rol; todas_empresas: boolean; empresas: string[]; limitar: boolean; obras: string[]; empleado_id: string | null; avisos?: string[]; avisos_correo?: string | null }
type Op = { id: string; nombre: string; [k: string]: unknown }

const QUE_HACE: Record<Rol, { t: string; si: string[]; no: string[] }> = {
  admin: { t: 'Administrador', si: ['Todo el sistema', 'Usuarios y permisos', 'Ajustes y catálogos'], no: [] },
  supervisor: { t: 'Supervisor', si: ['Altas y edición de activos', 'Resguardos, préstamos, bajas', 'Mantenimiento, inventarios, catálogos'], no: ['Usuarios y permisos'] },
  almacen: { t: 'Almacén', si: ['Resguardos y préstamos', 'Vales, inventarios y fallas', 'Almacén y combustible'], no: ['Dar de alta o editar activos', 'Usuarios'] },
  consulta: { t: 'Solo consulta', si: ['Ver activos, resguardos y reportes', 'Reportar fallas'], no: ['Modificar información'] },
}

/** Rol, empresas, obras, empleado y avisos: lo mismo al crear y al editar un usuario. */
function PermisosUsuario({ v, onChange, empresas, empleados, ubicaciones, puedeAdmin, bloquearRol = false, correo, crearEmpleado }: {
  v: Permisos; onChange: (x: Partial<Permisos>) => void; empresas: Op[]; empleados: Op[]; ubicaciones: Op[]; puedeAdmin: boolean; bloquearRol?: boolean; correo?: string | null
  crearEmpleado?: { on: boolean; empresa_id: string; puesto: string; set: (x: { on?: boolean; empresa_id?: string; puesto?: string }) => void }
}) {
  const [qObra, setQObra] = useState('')
  const [qEmp, setQEmp] = useState('')
  const empFiltrados = empleados.filter(o => !qEmp || nombreEmpleado(o as never).toLowerCase().includes(qEmp.toLowerCase())).slice(0, 200)
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">Rol</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(QUE_HACE) as Rol[]).filter(r => r !== 'admin' || puedeAdmin || v.rol === 'admin').map(r => {
            const on = v.rol === r, q = QUE_HACE[r]
            return (
              <label key={r} className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm transition ${on ? 'border-marca bg-marca/10' : 'border-stone-200 hover:border-stone-300'} ${bloquearRol ? 'pointer-events-none opacity-60' : ''}`}>
                <input type="radio" name="rol" className="mt-0.5" checked={on} disabled={bloquearRol} onChange={() => onChange({ rol: r })} />
                <span className="min-w-0"><span className="block font-semibold">{q.t}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-emerald-700">{q.si.map(x => `✓ ${x}`).join('  ')}</span>
                  {q.no.length > 0 && <span className="block text-[11px] leading-snug text-stone-500">{q.no.map(x => `✕ ${x}`).join('  ')}</span>}</span>
              </label>)
          })}
        </div>
      </div>

      {v.rol !== 'admin' && (
        <Campo label="Empresas que puede ver">
          <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={v.todas_empresas} onChange={e => onChange({ todas_empresas: e.target.checked })} />Todas las empresas</label>
          {!v.todas_empresas && <div className="grid gap-1.5 sm:grid-cols-2">{empresas.map(em => (
            <label key={em.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.empresas.includes(em.id)} onChange={e => onChange({ empresas: e.target.checked ? [...v.empresas, em.id] : v.empresas.filter(x => x !== em.id) })} />{em.nombre}</label>
          ))}</div>}
          {!v.todas_empresas && v.empresas.length === 0 && <p className="mt-1 text-xs text-amber-700">Sin empresas no verá ningún activo.</p>}
        </Campo>
      )}

      {v.rol !== 'admin' && (
        <div className="rounded-xl border border-stone-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={v.limitar} onChange={e => onChange({ limitar: e.target.checked })} /><HardHat size={15} className="text-marca" />Limitar a ciertas obras</label>
          <p className="mt-1 text-xs text-stone-500">Solo verá y moverá el equipo que está en esas obras (y el que tenga a su nombre). Ideal para residentes.</p>
          {v.limitar && <>
            <input className="campo mt-2 !py-1.5 text-sm" placeholder="Buscar obra o ubicación…" value={qObra} onChange={e => setQObra(e.target.value)} />
            <div className="mt-2 grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {ubicaciones.filter(u => (v.todas_empresas || v.empresas.includes(String(u.empresa_id))) && (!qObra || u.nombre.toLowerCase().includes(qObra.toLowerCase()))).map(u => (
                <label key={u.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.obras.includes(u.id)} onChange={e => onChange({ obras: e.target.checked ? [...v.obras, u.id] : v.obras.filter(x => x !== u.id) })} /><span className="truncate">{u.nombre}</span></label>
              ))}
            </div>
            <p className="mt-1 text-xs text-marca">{v.obras.length} obra(s) elegidas</p>
          </>}
        </div>
      )}

      <div className="rounded-xl border border-stone-200 p-3">
        <p className="text-sm font-medium">Ficha de empleado</p>
        <p className="mt-1 text-xs text-stone-500">Ligarlo a su ficha le muestra sus resguardos, préstamos y firmas pendientes.</p>
        {crearEmpleado && <div className="mt-2 flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={!crearEmpleado.on} onChange={() => crearEmpleado.set({ on: false })} />Ya existe</label>
          <label className="flex items-center gap-2"><input type="radio" checked={crearEmpleado.on} onChange={() => { crearEmpleado.set({ on: true }); onChange({ empleado_id: null }) }} />Crear ficha nueva</label>
        </div>}
        {crearEmpleado?.on ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Campo label="Empresa del empleado *"><select className="campo" value={crearEmpleado.empresa_id} onChange={e => crearEmpleado.set({ empresa_id: e.target.value })}><option value="">Elige…</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></Campo>
            <Campo label="Puesto"><input className="campo" value={crearEmpleado.puesto} onChange={e => crearEmpleado.set({ puesto: e.target.value })} placeholder="Residente de obra" /></Campo>
          </div>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input className="campo !py-1.5 text-sm" placeholder="Buscar empleado…" value={qEmp} onChange={e => setQEmp(e.target.value)} />
            <select className="campo !py-1.5 text-sm" value={v.empleado_id ?? ''} onChange={e => onChange({ empleado_id: e.target.value || null })}>
              <option value="">— Sin ligar —</option>
              {v.empleado_id && !empFiltrados.some(o => o.id === v.empleado_id) && <option value={v.empleado_id}>{nombreEmpleado(empleados.find(o => o.id === v.empleado_id) as never) || 'Empleado ligado'}</option>}
              {empFiltrados.map(o => <option key={o.id} value={o.id}>{nombreEmpleado(o as never)}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 p-3">
        <p className="flex items-center gap-2 text-sm font-medium"><Mail size={15} className="text-marca" />Encargado de (avisos por correo)</p>
        <p className="mt-1 text-xs text-stone-500">Cada mañana le llega un correo con lo pendiente de estos temas, de las empresas que puede ver.</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {MODULOS.map(m => { const on = (v.avisos ?? []).includes(m.id)
            return (
              <label key={m.id} title={m.d} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition ${on ? 'border-marca/60 bg-marca/10' : 'border-stone-200 hover:border-stone-300'}`}>
                <input type="checkbox" className="mt-0.5" checked={on} onChange={e => onChange({ avisos: e.target.checked ? [...(v.avisos ?? []), m.id] : (v.avisos ?? []).filter(x => x !== m.id) })} />
                <span className="min-w-0"><span className="block font-medium leading-tight">{m.t}</span><span className="block text-[11px] leading-tight text-stone-500">{m.d}</span></span>
              </label>) })}
        </div>
        <Campo label="Mandar los avisos a otro correo (opcional)" className="mt-3"><input className="campo" type="email" placeholder={correo || 'correo@grupofirmedemexico.com'} value={v.avisos_correo ?? ''} onChange={e => onChange({ avisos_correo: e.target.value })} /></Campo>
      </div>
    </div>
  )
}

/** Alta directa en dos pasos: 1) datos de acceso, 2) rol y permisos. La cuenta queda activa. */
function NuevoUsuario({ abierto, empresas, empleados, ubicaciones, puedeAdmin, onCerrar, onListo }: { abierto: boolean; empresas: Op[]; empleados: Op[]; ubicaciones: Op[]; puedeAdmin: boolean; onCerrar: () => void; onListo: () => void }) {
  const vacio = { nombre: '', correo: '', usuario: '', contrasena: '' }
  const permVacio: Permisos = { rol: 'consulta', todas_empresas: false, empresas: [], limitar: false, obras: [], empleado_id: null, avisos: [], avisos_correo: '' }
  const [f, setF] = useState(vacio)
  const [perm, setPerm] = useState<Permisos>(permVacio)
  const [ce, setCe] = useState({ on: true, empresa_id: '', puesto: '' })
  const [paso, setPaso] = useState<1 | 2>(1)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [lista, setLista] = useState<{ usuario: string; clave: string } | null>(null)
  useEffect(() => { if (abierto) { setF(vacio); setPerm(permVacio); setCe({ on: true, empresa_id: '', puesto: '' }); setPaso(1); setError(''); setLista(null) } }, [abierto]) // eslint-disable-line react-hooks/exhaustive-deps

  function siguiente(e?: React.FormEvent) {
    e?.preventDefault(); setError('')
    if (!f.nombre.trim()) return setError('Escribe el nombre.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.correo.trim())) return setError('El correo no es válido.')
    if (f.contrasena.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    setPaso(2)
  }
  async function crear() {
    setError('')
    if (perm.rol !== 'admin' && !perm.todas_empresas && !perm.empresas.length) return setError('Elige al menos una empresa o marca “Todas las empresas”.')
    if (ce.on && !ce.empresa_id) return setError('Elige la empresa de la ficha de empleado (o elige “Ya existe”).')
    setGuardando(true)
    const r = await supabase.rpc('admin_crear_usuario', { p_correo: f.correo.trim(), p_contrasena: f.contrasena, p_nombre: f.nombre.trim(), p_usuario: f.usuario || null, p_rol: perm.rol, p_todas_empresas: perm.todas_empresas, p_empresas: perm.empresas })
    if (r.error) { setGuardando(false); return setError(mensajeError(r.error)) }
    const uid = String(r.data)
    let empleado_id = perm.empleado_id
    if (ce.on) {
      const partes = f.nombre.trim().toUpperCase().split(/\s+/)
      const nombres = partes.length > 2 ? partes.slice(0, partes.length - 2).join(' ') : partes[0], apellidos = partes.length > 2 ? partes.slice(-2).join(' ') : partes.slice(1).join(' ')
      const e = await supabase.from('empleados').insert({ empresa_id: ce.empresa_id, nombres, apellidos: apellidos || null, puesto: ce.puesto.trim().toUpperCase() || null, email: f.correo.trim().toLowerCase() }).select('id').single()
      if (e.error) { setGuardando(false); return setError('El usuario se creó, pero no la ficha de empleado: ' + mensajeError(e.error)) }
      empleado_id = (e.data as { id: string }).id
    }
    const u = await supabase.from('perfiles').update({ empleado_id, avisos: perm.avisos ?? [], avisos_correo: perm.avisos_correo?.trim() || null, puesto: ce.on ? ce.puesto.trim() || null : undefined }).eq('id', uid)
    if (u.error) { setGuardando(false); return setError('El usuario se creó, pero faltó guardar sus avisos: ' + mensajeError(u.error)) }
    if (perm.limitar && perm.obras.length) {
      const o = await supabase.from('perfil_ubicaciones').insert(perm.obras.map(ubicacion_id => ({ perfil_id: uid, ubicacion_id })))
      if (o.error) { setGuardando(false); return setError('El usuario se creó, pero faltó limitar sus obras: ' + mensajeError(o.error)) }
    }
    setGuardando(false)
    setLista({ usuario: f.usuario.trim() ? f.usuario.trim().toUpperCase() : f.correo.trim(), clave: f.contrasena })
  }

  return (
    <Modal abierto={abierto} titulo="Nuevo usuario" onCerrar={lista ? onListo : onCerrar}>
      {lista ? (
        <div className="space-y-4">
          <Aviso tipo="ok">Listo. {f.nombre} ya puede entrar.</Aviso>
          <div className="space-y-2 rounded-xl bg-stone-100 p-4 text-sm">
            <p className="flex justify-between gap-2"><span className="text-stone-500">Página</span><span className="font-mono">activos.gfmexico.mx</span></p>
            <p className="flex justify-between gap-2"><span className="text-stone-500">Usuario</span><span className="select-all font-mono">{lista.usuario}</span></p>
            <p className="flex items-center justify-between gap-2"><span className="text-stone-500">Contraseña</span><span className="flex items-center gap-2"><span className="select-all font-mono">{lista.clave}</span><Copiar texto={`Página: https://activos.gfmexico.mx\nUsuario: ${lista.usuario}\nContraseña: ${lista.clave}`} /></span></p>
          </div>
          <p className="text-xs text-stone-500">“Copiar” copia los tres datos para mandárselos. La contraseña la podrás volver a ver con el ojo mientras no la cambie.</p>
          <div className="flex justify-end"><button className="btn-primario" onClick={onListo}>Terminar</button></div>
        </div>
      ) : <>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 text-sm">
          <button type="button" className={`rounded-lg px-3 py-1.5 ${paso === 1 ? 'bg-panel font-medium shadow-sm' : 'text-stone-500'}`} onClick={() => setPaso(1)}>1 · Datos de acceso</button>
          <button type="button" className={`rounded-lg px-3 py-1.5 ${paso === 2 ? 'bg-panel font-medium shadow-sm' : 'text-stone-500'}`} onClick={() => siguiente()}>2 · Rol y permisos</button>
        </div>
        {paso === 1 ? (
          <form onSubmit={siguiente} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nombre completo *" className="sm:col-span-2"><input className="campo" required value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo>
              <Campo label="Correo *"><input className="campo" type="email" required value={f.correo} onChange={e => setF({ ...f, correo: e.target.value })} placeholder="nombre@grupofirmedemexico.com" /></Campo>
              <Campo label="Usuario para entrar"><input className="campo uppercase" value={f.usuario} onChange={e => setF({ ...f, usuario: e.target.value })} placeholder="JUAN PEREZ" /></Campo>
              <div className="sm:col-span-2">
                <CampoClave valor={f.contrasena} onChange={v => setF({ ...f, contrasena: v })} />
                <button type="button" className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-marca hover:underline" onClick={() => setF({ ...f, contrasena: generarContrasena() })}><Wand2 size={14} />Generar una segura</button>
              </div>
            </div>
            <p className="text-xs text-stone-500">La persona entra con su usuario (o correo) y esta contraseña; después la puede cambiar desde su perfil.</p>
            {error && <Aviso>{error}</Aviso>}
            <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
              <button type="button" className="btn-sec" onClick={onCerrar}>Cancelar</button>
              <button className="btn-primario">Siguiente: rol y permisos</button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <PermisosUsuario v={perm} onChange={x => setPerm(p => ({ ...p, ...x }))} empresas={empresas} empleados={empleados} ubicaciones={ubicaciones} puedeAdmin={puedeAdmin} correo={f.correo}
              crearEmpleado={{ ...ce, set: x => setCe(c => ({ ...c, ...x })) }} />
            {error && <Aviso>{error}</Aviso>}
            <div className="flex justify-between gap-2 border-t border-stone-200 pt-4">
              <button type="button" className="btn-sec" onClick={() => setPaso(1)}>Atrás</button>
              <button type="button" className="btn-primario" disabled={guardando} onClick={crear}><UserPlus size={15} />{guardando ? 'Creando…' : 'Crear usuario'}</button>
            </div>
          </div>
        )}
      </>}
    </Modal>
  )
}

/** Contraseña segura y fácil de dictar: sin letras que se confunden (O/0, l/1). */
export function generarContrasena() {
  const may = 'ABCDEFGHJKLMNPQRSTUVWXYZ', min = 'abcdefghijkmnpqrstuvwxyz', num = '23456789', sim = '#$%&*-+?'
  const r = (t: string) => t[crypto.getRandomValues(new Uint32Array(1))[0] % t.length]
  const base = [r(may), r(may), r(min), r(min), r(min), r(min), r(num), r(num), r(num), r(sim), r(may), r(min)]
  for (let i = base.length - 1; i > 0; i--) { const k = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [base[i], base[k]] = [base[k], base[i]] }
  return base.join('')
}

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false)
  return <button type="button" className="btn-sec" onClick={() => { navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500) }).catch(() => {}) }}>{ok ? <Check size={15} /> : <Copy size={15} />}{ok ? 'Copiada' : 'Copiar'}</button>
}

function PonerContrasena({ u, onCerrar }: { u: Perfil; onCerrar: () => void }) {
  const [c, setC] = useState('')
  const [lista, setLista] = useState('')
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null)
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.rpc('admin_contrasena', { p_id: u.id, p_contrasena: c })
    setMsg(error ? { t: 'error', m: mensajeError(error) } : { t: 'ok', m: `Listo. ${u.nombre} ya puede entrar con la contraseña nueva.` })
    if (!error) { setLista(c); setC('') }
  }
  return (
    <Modal abierto titulo={`Contraseña de ${u.nombre}`} onCerrar={onCerrar} ancho="max-w-md">
      <form onSubmit={guardar} className="space-y-4">
        <CampoClave valor={c} onChange={setC} label="Contraseña nueva (mín. 8)" />
        <button type="button" className="inline-flex items-center gap-1.5 text-sm text-marca hover:underline" onClick={() => setC(generarContrasena())}><Wand2 size={14} />Generar una segura</button>
        {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}
        {lista && <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-100 p-3"><span className="select-all font-mono text-lg tracking-wide">{lista}</span><Copiar texto={lista} /></div>}
        <p className="text-xs text-stone-500">Podrás volver a verla con el botón del ojo mientras {u.nombre.split(' ')[0]} no la cambie desde su perfil.</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn-sec" onClick={onCerrar}>Cerrar</button><button className="btn-primario"><KeyRound size={15} />Guardar contraseña</button></div>
      </form>
    </Modal>
  )
}

/** Muestra la contraseña que asignó el administrador principal (si el usuario no la ha cambiado). Cada consulta queda en la bitácora. */
function VerContrasena({ u, onCerrar, onAsignar }: { u: Perfil; onCerrar: () => void; onAsignar: () => void }) {
  const [r, setR] = useState<{ estado: 'visible' | 'cambiada' | 'sin_dato'; contrasena?: string; asignada_at?: string; cambiada_at?: string } | null>(null)
  const [err, setErr] = useState('')
  const [mostrar, setMostrar] = useState(false)
  useEffect(() => { supabase.rpc('admin_ver_contrasena', { p_id: u.id }).then(({ data, error }) => { if (error) setErr(mensajeError(error)); else setR(data) }) }, [u.id])
  const f = (s?: string) => s ? new Date(s).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <Modal abierto titulo={`Contraseña de ${u.nombre}`} onCerrar={onCerrar} ancho="max-w-md">
      {err ? <Aviso>{err}</Aviso> : !r ? <Cargando /> : r.estado === 'visible' ? (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">Usuario: <b className="font-mono text-tinta">{u.usuario || u.email}</b></p>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-100 p-3">
            <span className="select-all font-mono text-lg tracking-wide">{mostrar ? r.contrasena : '••••••••••••'}</span>
            <span className="flex gap-2"><button type="button" className="btn-sec" onClick={() => setMostrar(v => !v)}>{mostrar ? <EyeOff size={15} /> : <Eye size={15} />}{mostrar ? 'Ocultar' : 'Mostrar'}</button><Copiar texto={r.contrasena ?? ''} /></span>
          </div>
          <p className="text-xs text-stone-500">Asignada el {f(r.asignada_at)}. Esta consulta quedó registrada en la bitácora.</p>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2"><LockKeyhole size={16} className="mt-0.5 shrink-0 text-stone-400" />{r.estado === 'cambiada'
            ? <>{u.nombre.split(' ')[0]} cambió su contraseña{r.cambiada_at ? ` el ${f(r.cambiada_at)}` : ''}. Ya no se puede ver: solo la conoce el usuario.</>
            : <>Esta contraseña se puso antes de que existiera esta función, por eso no está guardada.</>}</p>
          <p className="text-stone-500">Si necesitas que entre con una que tú conozcas, asígnale una nueva.</p>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-sec" onClick={onCerrar}>Cerrar</button><button type="button" className="btn-primario" onClick={onAsignar}><KeyRound size={15} />Asignar nueva</button></div>
    </Modal>
  )
}

function EliminarUsuario({ u, onCerrar, onListo }: { u: Perfil; onCerrar: () => void; onListo: () => void }) {
  const [txt, setTxt] = useState('')
  const [error, setError] = useState('')
  const [borrando, setBorrando] = useState(false)
  async function eliminar() {
    setError(''); setBorrando(true)
    const { error } = await supabase.rpc('admin_eliminar_usuario', { p_id: u.id })
    setBorrando(false)
    if (error) return setError(mensajeError(error))
    onListo()
  }
  return (
    <Modal abierto titulo="Eliminar usuario" onCerrar={onCerrar} ancho="max-w-md">
      <div className="space-y-4">
        <Aviso>Se borra la cuenta de <b>{u.nombre}</b> ({u.email}) y ya no podrá entrar. Lo que capturó (resguardos, altas) se conserva. No se puede deshacer.</Aviso>
        <Campo label="Escribe ELIMINAR para confirmar"><input className="campo" value={txt} onChange={e => setTxt(e.target.value)} autoFocus /></Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-peligro" disabled={txt.trim().toUpperCase() !== 'ELIMINAR' || borrando} onClick={eliminar}><Trash2 size={15} />{borrando ? 'Eliminando…' : 'Eliminar'}</button></div>
      </div>
    </Modal>
  )
}
