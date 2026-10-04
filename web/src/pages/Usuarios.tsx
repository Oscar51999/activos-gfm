import { useCallback, useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { supabase, ROLES, mensajeError, type Rol } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, nombreEmpleado } from '../lib/hooks'
import { Encabezado, Modal, Campo, Aviso, Cargando } from '../components/ui'

type Perfil = { id: string; nombre: string; email: string | null; rol: Rol; activo: boolean; todas_empresas: boolean; empleado_id: string | null; created_at: string }

export default function Usuarios() {
  const { perfil: yo } = useAuth()
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
      nombre: edit.nombre, rol: edit.rol, activo: edit.activo, todas_empresas: edit.todas_empresas, empleado_id: edit.empleado_id || null,
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
      <Encabezado titulo="Usuarios" sub="Las personas se registran solas desde la pantalla de inicio; aquí las activas y les das rol y empresas." />
      {pendientes > 0 && <div className="mb-4"><Aviso tipo="info">{pendientes} usuario(s) esperan activación.</Aviso></div>}
      <div className="tarjeta overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr><th className="px-4 py-2.5 font-medium">Nombre</th><th className="px-4 py-2.5 font-medium">Correo</th><th className="px-4 py-2.5 font-medium">Rol</th><th className="px-4 py-2.5 font-medium">Empresas</th><th className="px-4 py-2.5 font-medium">Estado</th><th className="w-12" /></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filas.map(f => (
              <tr key={f.id} className="hover:bg-stone-50">
                <td className="px-4 py-2.5 font-medium">{f.nombre}</td>
                <td className="px-4 py-2.5 text-stone-600">{f.email}</td>
                <td className="px-4 py-2.5">{ROLES[f.rol]}</td>
                <td className="px-4 py-2.5 text-xs">{f.todas_empresas || f.rol === 'admin' ? 'Todas' : (accesos[f.id] ?? []).map(id => empresas.items.find(e => e.id === id)?.nombre).filter(Boolean).join(', ') || <span className="text-rojo">Ninguna</span>}</td>
                <td className="px-4 py-2.5">{f.activo ? <span className="text-emerald-700">Activo</span> : <span className="font-medium text-amber-700">Pendiente</span>}</td>
                <td className="px-2"><button className="rounded p-1.5 text-stone-500 hover:bg-stone-200" aria-label="Editar" onClick={() => { setError(''); setEdit({ ...f, empresas: accesos[f.id] ?? [] }) }}><Pencil size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal abierto={!!edit} titulo="Editar usuario" onCerrar={() => setEdit(null)}>
        {edit && (
          <form onSubmit={guardar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nombre"><input className="campo" value={edit.nombre} onChange={e => setEdit({ ...edit, nombre: e.target.value })} /></Campo>
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
