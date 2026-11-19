import { useCallback, useEffect, useState } from 'react'
import { Pencil, UserPlus, KeyRound, Trash2, Eye, EyeOff } from 'lucide-react'
import { supabase, ROLES, mensajeError, type Rol } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, nombreEmpleado } from '../lib/hooks'
import { Encabezado, Modal, Campo, Aviso, Cargando } from '../components/ui'

type Perfil = { id: string; nombre: string; usuario?: string | null; email: string | null; rol: Rol; activo: boolean; todas_empresas: boolean; empleado_id: string | null; created_at: string }

export default function Usuarios() {
  const { perfil: yo, esSuper } = useAuth()
  const [nuevo, setNuevo] = useState(false)
  const [clave, setClave] = useState<Perfil | null>(null)
  const [borrar, setBorrar] = useState<Perfil | null>(null)
  const empresas = useLista('empresas')
  const empleados = useLista('empleados', 'id,nombres,apellidos,empresa_id', 'nombres')
  const [filas, setFilas] = useState<Perfil[] | null>(null)
  const [accesos, setAccesos] = useState<Record<string, string[]>>({})
  const [edit, setEdit] = useState<(Perfil & { empresas: string[] }) | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const [rp, ra] = await Promise.all([
      supabase.from('perfiles').select('*').order('activo').order('created_at', { ascending: false }),
      supabase.from('perfil_empresas').select('perfil_id,empresa_id'),
    ])
    setFilas((rp.data as Perfil[]) ?? [])
    const m: Record<string, string[]> = {}
    ;((ra.data as { perfil_id: string; empresa_id: string }[]) ?? []).forEach(r => { (m[r.perfil_id] ??= []).push(r.empresa_id) })
    setAccesos(m)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    setError('')
    const { error } = await supabase.from('perfiles').update({
      nombre: edit.nombre, usuario: edit.usuario?.trim().toUpperCase() || null, rol: edit.rol, activo: edit.activo, todas_empresas: edit.todas_empresas, empleado_id: edit.empleado_id || null,
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
            <tr><th className="px-4 py-2.5 font-medium">Nombre</th><th className="px-4 py-2.5 font-medium">Correo</th><th className="px-4 py-2.5 font-medium">Rol</th><th className="px-4 py-2.5 font-medium">Empresas</th><th className="px-4 py-2.5 font-medium">Estado</th><th className="w-12" /></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.map(f => (
              <tr key={f.id} className="hover:bg-stone-50">
                <td className="px-4 py-2.5 font-medium">{f.nombre}{f.usuario && <span className="block font-mono text-[10px] text-stone-500">{f.usuario}</span>}</td>
                <td className="px-4 py-2.5 text-stone-600">{f.email}</td>
                <td className="px-4 py-2.5">{ROLES[f.rol]}</td>
                <td className="px-4 py-2.5 text-xs">{f.todas_empresas || f.rol === 'admin' ? 'Todas' : (accesos[f.id] ?? []).map(id => empresas.items.find(e => e.id === id)?.nombre).filter(Boolean).join(', ') || <span className="text-rojo">Ninguna</span>}</td>
                <td className="px-4 py-2.5">{f.activo ? <span className="text-emerald-700">Activo</span> : <span className="font-medium text-amber-700">Pendiente</span>}</td>
                <td className="whitespace-nowrap px-2">
                  <button className="rounded p-1.5 text-stone-500 hover:bg-stone-200 hover:text-tinta" aria-label="Editar permisos" title="Editar rol y empresas" onClick={() => { setError(''); setEdit({ ...f, empresas: accesos[f.id] ?? [] }) }}><Pencil size={15} /></button>
                  {esSuper && f.id !== yo?.id && <>
                    <button className="rounded p-1.5 text-stone-500 hover:bg-stone-200 hover:text-tinta" aria-label="Poner contraseña" title="Poner contraseña nueva" onClick={() => setClave(f)}><KeyRound size={15} /></button>
                    <button className="rounded p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-700" aria-label="Eliminar usuario" title="Eliminar usuario" onClick={() => setBorrar(f)}><Trash2 size={15} /></button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NuevoUsuario abierto={nuevo} empresas={empresas.items} puedeAdmin={esSuper} onCerrar={() => setNuevo(false)} onListo={() => { setNuevo(false); cargar() }} />
      {clave && <PonerContrasena u={clave} onCerrar={() => setClave(null)} />}
      {borrar && <EliminarUsuario u={borrar} onCerrar={() => setBorrar(null)} onListo={() => { setBorrar(null); cargar() }} />}

      <Modal abierto={!!edit} titulo="Editar usuario" onCerrar={() => setEdit(null)}>
        {edit && (
          <form onSubmit={guardar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nombre"><input className="campo" value={edit.nombre} onChange={e => setEdit({ ...edit, nombre: e.target.value })} /></Campo>
              <Campo label="Usuario para entrar (ej. OSCAR COTA)"><input className="campo uppercase" value={edit.usuario ?? ''} onChange={e => setEdit({ ...edit, usuario: e.target.value })} /></Campo>
              <Campo label="Correo"><input className="campo" value={edit.email ?? ''} disabled /></Campo>
              <Campo label="Rol">
                <select className="campo" value={edit.rol} disabled={edit.id === yo?.id} onChange={e => setEdit({ ...edit, rol: e.target.value as Rol })}>
                  {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Campo>
              <Campo label="Empleado vinculado (opcional)">
                <select className="campo" value={edit.empleado_id ?? ''} onChange={e => setEdit({ ...edit, empleado_id: e.target.value || null })}>
                  <option value="">—</option>{empleados.items.map(o => <option key={o.id} value={o.id}>{nombreEmpleado(o as never)}</option>)}
                </select>
              </Campo>
              <Campo label="Acceso" className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.activo} disabled={edit.id === yo?.id} onChange={e => setEdit({ ...edit, activo: e.target.checked })} />Usuario activo (puede entrar al sistema)</label>
              </Campo>
              {edit.rol !== 'admin' && (
                <Campo label="Empresas que puede ver" className="sm:col-span-2">
                  <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.todas_empresas} onChange={e => setEdit({ ...edit, todas_empresas: e.target.checked })} />Todas las empresas</label>
                  {!edit.todas_empresas && (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {empresas.items.map(em => (
                        <label key={em.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={edit.empresas.includes(em.id)}
                            onChange={e => setEdit({ ...edit, empresas: e.target.checked ? [...edit.empresas, em.id] : edit.empresas.filter(x => x !== em.id) })} />{em.nombre}
                        </label>
                      ))}
                    </div>
                  )}
                </Campo>
              )}
            </div>
            <p className="text-xs text-stone-500"><b>Administrador:</b> todo, incluidos usuarios. <b>Almacén:</b> da de alta y edita activos y catálogos. <b>Supervisor</b> y <b>Solo consulta:</b> ven la información de sus empresas.</p>
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

/** Alta directa: correo + usuario + contraseña; la cuenta queda activa. */
function NuevoUsuario({ abierto, empresas, puedeAdmin, onCerrar, onListo }: { abierto: boolean; empresas: { id: string; nombre: string }[]; puedeAdmin: boolean; onCerrar: () => void; onListo: () => void }) {
  const vacio = { nombre: '', correo: '', usuario: '', contrasena: '', rol: 'consulta' as Rol, todas: false, empresas: [] as string[] }
  const [f, setF] = useState(vacio)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (abierto) { setF(vacio); setError('') } }, [abierto]) // eslint-disable-line react-hooks/exhaustive-deps
  async function crear(e: React.FormEvent) {
    e.preventDefault(); setError(''); setGuardando(true)
    const { error } = await supabase.rpc('admin_crear_usuario', { p_correo: f.correo, p_contrasena: f.contrasena, p_nombre: f.nombre, p_usuario: f.usuario || null, p_rol: f.rol, p_todas_empresas: f.todas, p_empresas: f.empresas })
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    onListo()
  }
  return (
    <Modal abierto={abierto} titulo="Nuevo usuario" onCerrar={onCerrar}>
      <form onSubmit={crear} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre completo *" className="sm:col-span-2"><input className="campo" required value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo>
          <Campo label="Correo *"><input className="campo" type="email" required value={f.correo} onChange={e => setF({ ...f, correo: e.target.value })} placeholder="nombre@grupofirmedemexico.com" /></Campo>
          <Campo label="Usuario para entrar"><input className="campo uppercase" value={f.usuario} onChange={e => setF({ ...f, usuario: e.target.value })} placeholder="JUAN PEREZ" /></Campo>
          <CampoClave valor={f.contrasena} onChange={v => setF({ ...f, contrasena: v })} />
          <Campo label="Rol">
            <select className="campo" value={f.rol} onChange={e => setF({ ...f, rol: e.target.value as Rol })}>
              {Object.entries(ROLES).filter(([k]) => k !== 'admin' || puedeAdmin).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          {f.rol !== 'admin' && (
            <Campo label="Empresas que puede ver" className="sm:col-span-2">
              <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.todas} onChange={e => setF({ ...f, todas: e.target.checked })} />Todas las empresas</label>
              {!f.todas && <div className="grid gap-1.5 sm:grid-cols-2">{empresas.map(em => (
                <label key={em.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.empresas.includes(em.id)} onChange={e => setF({ ...f, empresas: e.target.checked ? [...f.empresas, em.id] : f.empresas.filter(x => x !== em.id) })} />{em.nombre}</label>
              ))}</div>}
            </Campo>
          )}
        </div>
        <p className="text-xs text-stone-500">La persona entra con su usuario (o correo) y esta contraseña; después la puede cambiar desde su perfil.</p>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
          <button type="button" className="btn-sec" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primario" disabled={guardando}><UserPlus size={15} />{guardando ? 'Creando…' : 'Crear usuario'}</button>
        </div>
      </form>
    </Modal>
  )
}

function PonerContrasena({ u, onCerrar }: { u: Perfil; onCerrar: () => void }) {
  const [c, setC] = useState('')
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null)
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.rpc('admin_contrasena', { p_id: u.id, p_contrasena: c })
    setMsg(error ? { t: 'error', m: mensajeError(error) } : { t: 'ok', m: `Listo. ${u.nombre} ya puede entrar con la contraseña nueva.` })
    if (!error) setC('')
  }
  return (
    <Modal abierto titulo={`Contraseña de ${u.nombre}`} onCerrar={onCerrar} ancho="max-w-md">
      <form onSubmit={guardar} className="space-y-4">
        <CampoClave valor={c} onChange={setC} label="Contraseña nueva (mín. 8)" />
        {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-sec" onClick={onCerrar}>Cerrar</button><button className="btn-primario"><KeyRound size={15} />Guardar contraseña</button></div>
      </form>
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
