import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, PenLine, Upload, FileText, Send } from 'lucide-react'
import { supabase, mensajeError, BUCKET, type TipoMov } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nombreEmpleado } from '../lib/hooks'
import { urlFirmada } from '../lib/fotos'
import { Cargando, Aviso, Modal } from '../components/ui'
import FirmaPad, { type FirmaPadRef } from '../components/FirmaPad'
import { TipoBadge } from './Movimientos'
import { LogoFirme } from '../components/Logo'
import { PrestamoBadge, fechaCorta } from '../components/Prestamo'
import EnviarEnlace, { urlPublica } from '../components/Enlace'

type Linea = { activo_id: string; estado_fisico: string | null; estatus_anterior: string
  activos: { codigo: string; descripcion: string; serie: string | null; numero_economico: string | null; marcas: { nombre: string } | null; modelos: { nombre: string } | null } | null
  resp_ant: { nombres: string; apellidos: string | null } | null; ubic_ant: { nombre: string } | null }
type Mov = { id: string; folio: string; tipo: TipoMov; fecha: string; empresa_id: string; notas: string | null; entrega_nombre: string | null; recibe_nombre: string | null
  firma_recibe: string | null; firma_entrega: string | null; documento: string | null; fecha_devolucion?: string | null; token_firma?: string | null; firmado_remoto_at?: string | null
  empresas: { nombre: string; razon_social: string | null } | null
  empleado: { nombres: string; apellidos: string | null; puesto: string | null } | null
  ubicacion: { nombre: string } | null }

const TITULOS: Record<TipoMov, string> = {
  asignacion: 'Carta responsiva de resguardo de activos',
  devolucion: 'Constancia de devolución de activos',
  traspaso: 'Constancia de traspaso de activos',
}

export default function MovimientoDetalle() {
  const { id } = useParams()
  const { puedeResguardar } = useAuth()
  const [m, setM] = useState<Mov | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [firmas, setFirmas] = useState<{ recibe?: string; entrega?: string }>({})
  const [error, setError] = useState('')
  const [firmando, setFirmando] = useState(false)
  const [remoto, setRemoto] = useState<string | null>(null)
  async function enviarFirma() {
    if (!m) return
    let t = m.token_firma
    if (!t) {
      t = crypto.randomUUID()
      const { error } = await supabase.from('movimientos').update({ token_firma: t }).eq('id', m.id)
      if (error) { setError(mensajeError(error)); return }
    }
    setRemoto(t)
  }
  const padRecibe = useRef<FirmaPadRef>(null)
  const padEntrega = useRef<FirmaPadRef>(null)

  async function cargar() {
    const [rm, rl] = await Promise.all([
      supabase.from('movimientos').select('*, empresas(nombre,razon_social), empleado:a_empleado_id(nombres,apellidos,puesto), ubicacion:a_ubicacion_id(nombre)').eq('id', id!).single(),
      supabase.from('movimiento_activos').select('activo_id,estado_fisico,estatus_anterior, activos(codigo,descripcion,serie,numero_economico,marcas(nombre),modelos(nombre)), resp_ant:responsable_anterior_id(nombres,apellidos), ubic_ant:ubicacion_anterior_id(nombre)').eq('movimiento_id', id!),
    ])
    if (rm.error) { setError(mensajeError(rm.error)); return }
    const mov = rm.data as unknown as Mov
    setM(mov)
    setLineas(((rl.data as unknown as Linea[]) ?? []).sort((a, b) => (a.activos?.codigo ?? '').localeCompare(b.activos?.codigo ?? '')))
    setFirmas({
      recibe: mov.firma_recibe ? await urlFirmada(mov.firma_recibe) : undefined,
      entrega: mov.firma_entrega ? await urlFirmada(mov.firma_entrega) : undefined,
    })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [id])

  async function guardarFirmas() {
    if (!m) return
    const cambios: Record<string, string> = {}
    for (const [k, pad] of [['firma_recibe', padRecibe], ['firma_entrega', padEntrega]] as const) {
      const b = await pad.current?.blob()
      if (!b) continue
      const path = `${m.empresa_id}/movimientos/${m.id}/${k}-${Date.now()}.png`
      const up = await supabase.storage.from(BUCKET).upload(path, b, { contentType: 'image/png' })
      if (up.error) { setError(mensajeError(up.error)); return }
      cambios[k] = path
    }
    if (!Object.keys(cambios).length) { setFirmando(false); return }
    const { error } = await supabase.from('movimientos').update(cambios).eq('id', m.id)
    if (error) { setError(mensajeError(error)); return }
    setFirmando(false); cargar()
  }

  async function subirDocumento(f: File | undefined) {
    if (!f || !m) return
    const ext = f.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const path = `${m.empresa_id}/movimientos/${m.id}/carta-firmada-${Date.now()}.${ext}`
    const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type })
    if (up.error) { setError(mensajeError(up.error)); return }
    await supabase.from('movimientos').update({ documento: path }).eq('id', m.id)
    cargar()
  }

  async function verDocumento() {
    if (m?.documento) window.open(await urlFirmada(m.documento), '_blank')
  }

  if (error && !m) return <Aviso>{error}</Aviso>
  if (!m) return <Cargando />

  const empresaNombre = m.empresas?.razon_social || m.empresas?.nombre || ''
  const empleado = m.empleado ? nombreEmpleado(m.empleado) : null
  const fecha = new Date(m.fecha)
  const fechaLarga = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const sinFirma = !m.firma_recibe

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/resguardos" className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Resguardos</Link>
          <div className="flex items-center gap-3"><h1 className="text-2xl font-semibold">{m.folio}</h1><TipoBadge tipo={m.tipo} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {m.documento && <button className="btn-sec" onClick={verDocumento}><FileText size={16} />Carta escaneada</button>}
          {puedeResguardar && (
            <label className="btn-sec cursor-pointer"><Upload size={16} />Subir carta firmada
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => subirDocumento(e.target.files?.[0])} /></label>
          )}
          {puedeResguardar && sinFirma && m.tipo !== 'devolucion' && <button className="btn-sec" onClick={enviarFirma}><Send size={16} />Enviar para firma</button>}
          {puedeResguardar && <button className="btn-sec" onClick={() => setFirmando(true)}><PenLine size={16} />{sinFirma ? 'Firmar ahora' : 'Volver a firmar'}</button>}
          <button className="btn-primario" onClick={() => window.print()}><Printer size={16} />Imprimir</button>
        </div>
      </div>
      {m.fecha_devolucion && m.tipo !== 'devolucion' && <div className="no-print mb-4"><PrestamoBadge fecha={m.fecha_devolucion} /></div>}
      {sinFirma && <div className="no-print mb-4"><Aviso tipo="info">Falta la firma de quien recibe. Puedes mandarle un enlace para que firme desde su celular, firmar aquí en pantalla o imprimir, firmar a mano y subir la carta escaneada.</Aviso></div>}
      {m.firmado_remoto_at && <div className="no-print mb-4"><Aviso tipo="ok">Firmado a distancia desde el celular el {new Date(m.firmado_remoto_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</Aviso></div>}
      {error && <div className="no-print mb-4"><Aviso>{error}</Aviso></div>}

      <article className="papel tarjeta mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed print:border-0 print:p-0">
        <header className="mb-6 flex items-start justify-between border-b-2 border-tinta pb-4">
          <div className="flex items-center gap-3">
            <LogoFirme className="h-9 w-auto text-black" />
            <div><p className="font-semibold">{empresaNombre}</p><p className="text-xs text-stone-500">Control de activos</p></div>
          </div>
          <div className="text-right text-xs">
            <p className="font-mono text-sm font-semibold">{m.folio}</p>
            <p>{fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        </header>

        <h2 className="mb-4 text-center text-base font-semibold uppercase tracking-wide">{TITULOS[m.tipo]}</h2>

        {m.tipo === 'asignacion' && (
          <p className="mb-4">
            En la fecha {fechaLarga}, <b>{m.recibe_nombre || empleado}</b>{m.empleado?.puesto ? `, con puesto de ${m.empleado.puesto},` : ''} recibe de <b>{empresaNombre}</b> los
            activos que se describen abajo, en el estado indicado{m.ubicacion ? <>, para su uso en <b>{m.ubicacion.nombre}</b></> : ''}. Se compromete a usarlos únicamente
            para las actividades de su trabajo, a cuidarlos, a reportar de inmediato cualquier daño, falla, pérdida o robo, y a devolverlos cuando la empresa lo solicite
            o al terminar su relación laboral.
          </p>
        )}
        {m.tipo === 'devolucion' && (
          <p className="mb-4">
            En la fecha {fechaLarga}, <b>{m.entrega_nombre}</b> devuelve a <b>{empresaNombre}</b> los activos que se describen abajo, que quedan
            en <b>{m.ubicacion?.nombre}</b> bajo resguardo de la empresa. Quien recibe deja constancia del estado en que se reciben.
          </p>
        )}
        {m.tipo === 'traspaso' && (
          <p className="mb-4">
            En la fecha {fechaLarga} se registra el traspaso de los activos que se describen abajo
            {empleado ? <> al resguardo de <b>{empleado}</b></> : ''}{m.ubicacion ? <>{empleado ? ' y' : ''} a la ubicación <b>{m.ubicacion.nombre}</b></> : ''}.
          </p>
        )}

        <div className="mb-4 overflow-x-auto print:overflow-visible"><table className="w-full min-w-[520px] border-collapse text-xs print:min-w-0">
          <thead>
            <tr className="border-y border-stone-400 bg-stone-50 text-left">
              <th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Código</th><th className="px-2 py-1.5">Descripción</th>
              <th className="px-2 py-1.5">Serie / No. econ.</th><th className="px-2 py-1.5">{m.tipo === 'asignacion' ? 'Estado' : 'Antes'}</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={l.activo_id} className="border-b border-stone-200 align-top">
                <td className="px-2 py-1.5">{i + 1}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono">{l.activos?.codigo}</td>
                <td className="px-2 py-1.5">{l.activos?.descripcion}<span className="text-stone-500">{[l.activos?.marcas?.nombre, l.activos?.modelos?.nombre].filter(Boolean).length ? ` · ${[l.activos?.marcas?.nombre, l.activos?.modelos?.nombre].filter(Boolean).join(' ')}` : ''}</span></td>
                <td className="px-2 py-1.5">{[l.activos?.serie, l.activos?.numero_economico].filter(Boolean).join(' / ') || '—'}</td>
                <td className="px-2 py-1.5">
                  {m.tipo === 'asignacion' ? (l.estado_fisico || 'Bueno') : (
                    <>{l.resp_ant ? nombreEmpleado(l.resp_ant) : 'Sin responsable'}{l.ubic_ant ? ` · ${l.ubic_ant.nombre}` : ''}{l.estado_fisico ? <span className="block text-stone-500">{l.estado_fisico}</span> : null}</>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="mb-6 text-xs text-stone-500">Total: {lineas.length} activo(s).</p>

        {m.fecha_devolucion && m.tipo !== 'devolucion' && <p className="mb-3 rounded border border-stone-300 px-3 py-2"><b>Préstamo temporal.</b> Quien recibe se compromete a devolver estos activos a más tardar el <b>{fechaCorta(m.fecha_devolucion)}</b>.</p>}
        {m.notas && <p className="mb-6"><b>Notas:</b> {m.notas}</p>}

        <div className="mt-10 grid grid-cols-2 gap-10">
          {[{ t: 'Entrega', n: m.entrega_nombre, f: firmas.entrega }, { t: 'Recibe', n: m.recibe_nombre || empleado, f: firmas.recibe }].map(x => (
            <div key={x.t} className="text-center">
              <div className="flex h-24 items-end justify-center">{x.f ? <img src={x.f} alt={`Firma ${x.t}`} className="max-h-24" /> : null}</div>
              <div className="border-t border-tinta pt-1">
                <p className="font-medium">{x.n || ' '}</p>
                <p className="text-xs text-stone-500">{x.t}</p>
              </div>
            </div>
          ))}
        </div>
      </article>

      <Modal abierto={!!remoto} titulo="Enviar para firma" onCerrar={() => setRemoto(null)}>
        {remoto && <div className="space-y-3"><p className="text-sm text-stone-500">Manda este enlace a <b className="text-tinta">{m.recibe_nombre || 'quien recibe'}</b>. Lo abre en su celular, revisa los activos y firma con el dedo; la firma aparece sola en esta carta.</p>
          <EnviarEnlace url={urlPublica(`firmar/${remoto}`)} mensaje={`Hola, por favor revisa y firma tu resguardo ${m.folio} de Grupo Firme:`} /></div>}
      </Modal>
      <Modal abierto={firmando} titulo={`Firmar ${m.folio}`} onCerrar={() => setFirmando(false)}>
        <div className="grid gap-6 sm:grid-cols-2">
          <FirmaPad ref={padEntrega} titulo="Firma de quien entrega" nombre={m.entrega_nombre ?? undefined} />
          <FirmaPad ref={padRecibe} titulo="Firma de quien recibe" nombre={(m.recibe_nombre || empleado) ?? undefined} />
        </div>
        <p className="mt-3 text-xs text-stone-500">Solo se guardan los recuadros que tengan firma.</p>
        <div className="mt-4 flex justify-end gap-2 border-t border-stone-200 pt-4">
          <button className="btn-sec" onClick={() => setFirmando(false)}>Cancelar</button>
          <button className="btn-primario" onClick={guardarFirmas}>Guardar firmas</button>
        </div>
      </Modal>
    </div>
  )
}
