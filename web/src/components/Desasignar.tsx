import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Undo2, CheckCircle2, Printer } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nombreEmpleado } from '../lib/hooks'
import { Modal, Campo, Aviso } from './ui'
import FotoActivo from './FotoActivo'

export type ActAsignado = { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; numero_economico: string | null
  estatus: string; empresa_id: string; ubicacion_id: string | null; ubicacion: string | null; foto_principal: string | null; modelo_foto: string | null; categoria: string | null }
type Persona = { id: string; nombres: string; apellidos: string | null; empresa_id: string }

const ESTADOS = ['Buen estado', 'Con detalles de uso', 'Dañado', 'Incompleto (faltan accesorios)']

/** Quita activos a un empleado en un paso: registra la devolución (queda en su historial con folio) y los deja disponibles. */
export function DesasignarModal({ empleado, activos, onCerrar, onListo }: { empleado: Persona; activos: ActAsignado[]; onCerrar: () => void; onListo: () => void }) {
  const { perfil } = useAuth()
  const [ubis, setUbis] = useState<{ id: string; nombre: string; tipo: string }[]>([])
  const [destino, setDestino] = useState('')
  const [estado, setEstado] = useState(ESTADOS[0])
  const [porActivo, setPorActivo] = useState<Record<string, string>>({})
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState<{ id: string; folio: string } | null>(null)

  // Solo se puede regresar lo que está "asignado" y es de la empresa del empleado (una devolución es de una sola empresa).
  const validos = activos.filter(a => a.estatus === 'asignado' && a.empresa_id === empleado.empresa_id)
  const fuera = activos.filter(a => !validos.includes(a))

  useEffect(() => {
    supabase.from('ubicaciones').select('id,nombre,tipo').eq('empresa_id', empleado.empresa_id).eq('activo', true).order('nombre').then(({ data }) => {
      const l = (data as { id: string; nombre: string; tipo: string }[]) ?? []
      setUbis(l)
      const alm = l.find(u => u.tipo === 'almacen')?.id ?? l.find(u => u.id === validos[0]?.ubicacion_id)?.id ?? l[0]?.id ?? ''
      setDestino(d => d || alm)
    })
  }, [empleado.empresa_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const estados = useMemo(() => Object.fromEntries(validos.map(a => [a.id, porActivo[a.id] || estado])), [validos, porActivo, estado])

  async function guardar() {
    setError('')
    if (!validos.length) return setError('No hay activos que se puedan desasignar.')
    if (!destino) return setError('Elige a dónde regresa el equipo.')
    setGuardando(true)
    const { data, error } = await supabase.rpc('registrar_movimiento', {
      p_tipo: 'devolucion', p_empresa: empleado.empresa_id, p_activos: validos.map(a => a.id), p_a_empleado: null, p_a_ubicacion: destino,
      p_entrega_nombre: nombreEmpleado(empleado), p_recibe_nombre: perfil?.nombre ?? null, p_notas: notas.trim() || null, p_estados: estados,
    })
    if (error) { setGuardando(false); return setError(mensajeError(error)) }
    const { data: m } = await supabase.from('movimientos').select('id,folio').eq('id', data as string).maybeSingle()
    setGuardando(false)
    setHecho({ id: data as string, folio: (m as { folio?: string } | null)?.folio ?? '' })
  }

  if (hecho) return (
    <Modal abierto titulo="Listo" onCerrar={onListo} ancho="max-w-md">
      <div className="space-y-4 text-center">
        <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
        <p>Se desasignaron <b>{validos.length}</b> activo(s) de {empleado.nombres}. Ya están disponibles en <b>{ubis.find(u => u.id === destino)?.nombre}</b>.</p>
        {hecho.folio && <p className="text-sm text-stone-500">Quedó registrado como devolución <span className="font-mono text-tinta">{hecho.folio}</span>.</p>}
        <div className="flex justify-center gap-2">
          <Link to={`/resguardos/${hecho.id}`} className="btn-sec"><Printer size={15} />Ver / firmar la devolución</Link>
          <button className="btn-primario" onClick={onListo}>Cerrar</button>
        </div>
      </div>
    </Modal>
  )

  return (
    <Modal abierto titulo={`Desasignar a ${nombreEmpleado(empleado)}`} onCerrar={onCerrar} ancho="max-w-xl">
      <div className="space-y-4">
        <ul className="max-h-64 divide-y divide-stone-200 overflow-y-auto rounded-xl border border-stone-200">
          {validos.map(a => (
            <li key={a.id} className="flex items-center gap-3 p-2">
              <FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} className="h-10 w-12 shrink-0 rounded-lg" icono={14} />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] text-marca">{a.codigo}</p>
                <p className="truncate text-sm">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</p>
              </div>
              <select className="campo !w-40 !py-1.5 text-xs" value={porActivo[a.id] ?? ''} onChange={e => setPorActivo(p => ({ ...p, [a.id]: e.target.value }))} aria-label={`Estado de ${a.codigo}`}>
                <option value="">{estado}</option>
                {ESTADOS.filter(x => x !== estado).map(x => <option key={x}>{x}</option>)}
              </select>
            </li>
          ))}
        </ul>
        {fuera.length > 0 && <Aviso tipo="info">{fuera.length} no se puede(n) desasignar aquí: {fuera.map(a => `${a.codigo} (${a.estatus === 'asignado' ? 'de otra empresa' : a.estatus.replace('_', ' ')})`).join(', ')}.</Aviso>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Regresa a">
            <select className="campo" value={destino} onChange={e => setDestino(e.target.value)}>
              {ubis.length === 0 && <option value="">La empresa no tiene ubicaciones</option>}
              {ubis.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.tipo === 'almacen' ? ' · almacén' : ''}</option>)}
            </select>
          </Campo>
          <Campo label="Estado en que lo entrega"><select className="campo" value={estado} onChange={e => setEstado(e.target.value)}>{ESTADOS.map(x => <option key={x}>{x}</option>)}</select></Campo>
        </div>
        <Campo label="Notas (opcional)"><input className="campo" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej. Se va de vacaciones, cambio de puesto…" /></Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2">
          <button className="btn-sec" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primario" disabled={guardando || !validos.length} onClick={guardar}><Undo2 size={16} />Desasignar {validos.length}</button>
        </div>
      </div>
    </Modal>
  )
}
