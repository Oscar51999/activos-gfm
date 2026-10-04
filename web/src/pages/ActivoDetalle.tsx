import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, Pencil, Printer, Trash2, Camera, MapPin, User, Building2, UserPlus, Undo2, ArrowLeftRight, Siren } from 'lucide-react'
import ReportarFalla, { TIPOS_REPORTE, type TipoReporte } from '../components/ReportarFalla'
import { PrestamoBadge } from '../components/Prestamo'
import { DocumentosPanel } from '../components/Documentos'
import LineaTiempo from '../components/LineaTiempo'
import UsoPanel from '../components/UsoPanel'
import { tipoEquipo } from '../lib/mantenimiento'
import { supabase, mensajeError, ESTATUS, BUCKET } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fecha, moneda } from '../lib/hooks'
import { subirFoto, urlFirmada } from '../lib/fotos'
import { urlQR } from '../lib/qr'
import { EstatusBadge, Cargando, Aviso, Modal } from '../components/ui'
import type { ActivoFila } from './Activos'
import { TipoBadge } from './Movimientos'
import type { TipoMov } from '../lib/supabase'

type Detalle = ActivoFila & { valor_referencia: number | null; fecha_alta: string; foto_principal: string | null; updated_at: string; es_vehiculo: boolean }
type Veh = { placa: string | null; anio: number | null; color: string | null; combustible: string | null; transmision: string | null; kilometraje: number | null; cilindros: number | null; pasajeros: number | null; capacidad_tanque: number | null }
type Foto = { id: string; path: string; url?: string }
type Resg = { movimiento_id: string; estado_fisico: string | null; movimientos: { folio: string; tipo: TipoMov; fecha: string; recibe_nombre: string | null; entrega_nombre: string | null; cancelado: boolean; ubicacion: { nombre: string } | null } | null }
type Mov = { id: number; accion: string; fecha: string; antes: Record<string, unknown> | null; despues: Record<string, unknown> | null }

const CAMPOS_BITACORA: Record<string, string> = {
  estatus: 'Estatus', ubicacion_id: 'Ubicación', responsable_id: 'Responsable', descripcion: 'Descripción', serie: 'Serie',
  numero_economico: 'No. económico', valor_referencia: 'Valor', empresa_id: 'Empresa', categoria_id: 'Categoría', notas: 'Notas',
}

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-xs text-stone-500">{k}</dt><dd className="mt-0.5 text-sm">{v || '—'}</dd></div>
}

export default function ActivoDetalle() {
  const { id } = useParams()
  const nav = useNavigate()
  const { puedeEditar, esAdmin, puedeResguardar } = useAuth()
  const [resg, setResg] = useState<Resg[]>([])
  const [a, setA] = useState<Detalle | null>(null)
  const [veh, setVeh] = useState<Veh | null>(null)
  const [fotos, setFotos] = useState<Foto[]>([])
  const [notas, setNotas] = useState<string | null>(null)
  const [movs, setMovs] = useState<Mov[]>([])
  const [error, setError] = useState('')
  const [reportar, setReportar] = useState(false)
  const [prestamo, setPrestamo] = useState<string | null>(null)
  const [reportes, setReportes] = useState<{ id: string; folio: string; tipo: TipoReporte; descripcion: string; estatus: string; created_at: string }[]>([])
  const { perfil: perfilRep } = useAuth()
  const cargarExtras = () => {
    supabase.from('v_prestamos').select('fecha_devolucion').eq('activo_id', id!).then(({ data }) => setPrestamo((data as { fecha_devolucion: string }[] | null)?.[0]?.fecha_devolucion ?? null))
    supabase.from('reportes').select('id,folio,tipo,descripcion,estatus,created_at').eq('activo_id', id!).in('estatus', ['abierto', 'en_proceso']).order('created_at', { ascending: false })
      .then(({ data }) => setReportes((data as never) ?? []))
  }
  useEffect(cargarExtras, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [subiendo, setSubiendo] = useState(false)

  async function cargar() {
    supabase.from('movimiento_activos').select('movimiento_id,estado_fisico, movimientos(folio,tipo,fecha,recibe_nombre,entrega_nombre,cancelado, ubicacion:a_ubicacion_id(nombre))')
      .eq('activo_id', id!).then(({ data }) => setResg(((data as unknown as Resg[]) ?? []).sort((x, y) => (y.movimientos?.fecha ?? '').localeCompare(x.movimientos?.fecha ?? ''))))
    const [ra, rv, rf, rn] = await Promise.all([
      supabase.from('v_activos').select('*').eq('id', id!).single(),
      supabase.from('activo_vehiculo').select('*').eq('activo_id', id!).maybeSingle(),
      supabase.from('activo_fotos').select('id,path').eq('activo_id', id!).order('created_at'),
      supabase.from('activos').select('notas').eq('id', id!).single(),
    ])
    if (ra.error) { setError(mensajeError(ra.error)); return }
    setA(ra.data as Detalle); setVeh(rv.data as Veh | null); setNotas(rn.data?.notas ?? null)
    const fs = await Promise.all(((rf.data as Foto[]) ?? []).map(async f => ({ ...f, url: await urlFirmada(f.path) })))
    setFotos(fs)
    if (esAdmin) {
      const { data } = await supabase.from('bitacora').select('id,accion,fecha,antes,despues')
        .eq('tabla', 'activos').eq('registro_id', id!).order('fecha', { ascending: false }).limit(30)
      setMovs((data as Mov[]) ?? [])
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [id, esAdmin])

  async function agregarFotos(files: FileList | null) {
    if (!files?.length || !a) return
    setSubiendo(true)
    try {
      for (const f of Array.from(files)) {
        const p = await subirFoto(a.empresa_id, a.id, f)
        if (!a.foto_principal) await supabase.from('activos').update({ foto_principal: p }).eq('id', a.id)
      }
      await cargar()
    } catch (e) { setError(mensajeError(e)) } finally { setSubiendo(false) }
  }

  async function borrarFoto(f: Foto) {
    if (!confirm('¿Borrar esta foto?')) return
    await supabase.storage.from(BUCKET).remove([f.path])
    await supabase.from('activo_fotos').delete().eq('id', f.id)
    if (a?.foto_principal === f.path) await supabase.from('activos').update({ foto_principal: fotos.find(x => x.id !== f.id)?.path ?? null }).eq('id', a.id)
    cargar()
  }

  async function borrar() {
    if (!a || !confirm(`¿Borrar definitivamente ${a.codigo}? Si el activo ya no existe, mejor cambia su estatus a "Baja" para conservar el historial.`)) return
    const { error } = await supabase.from('activos').delete().eq('id', a.id)
    if (error) { setError(mensajeError(error)); return }
    nav('/activos', { replace: true })
  }

  if (error && !a) return <Aviso>{error}</Aviso>
  if (!a) return <Cargando />

  const principal = fotos.find(f => f.path === a.foto_principal) ?? fotos[0]

  return (
    <div>
      <Link to="/activos" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Activos</Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm text-stone-500">{a.codigo}</span>
            <EstatusBadge estatus={a.estatus} />
            {prestamo && <PrestamoBadge fecha={prestamo} />}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{a.descripcion}</h1>
          <p className="text-sm text-stone-500">{[a.categoria, a.marca, a.modelo].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {puedeResguardar && a.estatus === 'disponible' && <Link className="btn-marca" to={`/resguardos/nuevo?tipo=asignacion&activos=${a.id}`}><UserPlus size={16} />Asignar</Link>}
          {puedeResguardar && a.estatus === 'asignado' && <Link className="btn-sec" to={`/resguardos/nuevo?tipo=devolucion&activos=${a.id}`}><Undo2 size={16} />Devolver</Link>}
          {puedeResguardar && ['asignado', 'disponible', 'mantenimiento'].includes(a.estatus) && <Link className="btn-sec" to={`/resguardos/nuevo?tipo=traspaso&activos=${a.id}`}><ArrowLeftRight size={16} />Traspasar</Link>}
          <button className="btn-sec" onClick={() => setReportar(true)}><Siren size={16} />Reportar problema</button>
          <Link className="btn-sec" to={`/etiquetas?ids=${a.id}`}><Printer size={16} />Etiqueta</Link>
          {puedeEditar && a.estatus !== 'asignado' && a.estatus !== 'baja' && <Link className="btn-sec" to={`/traspasos?activo=${a.id}`}><Building2 size={16} />Otra empresa</Link>}
          {puedeEditar && <Link className="btn-primario" to={`/activos/${a.id}/editar`}><Pencil size={16} />Editar</Link>}
          {esAdmin && <button className="btn-peligro" onClick={borrar}><Trash2 size={16} /></button>}
        </div>
      </div>
      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}
      {reportes.length > 0 && (
        <Link to="/reportes" className="no-print mb-4 block rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <b className="inline-flex items-center gap-1.5"><Siren size={15} />{reportes.length} reporte(s) sin resolver</b>
          {reportes.slice(0, 2).map(r => <span key={r.id} className="mt-1 block truncate text-xs"><span className="font-mono">{r.folio}</span> · {TIPOS_REPORTE[r.tipo]?.texto}: {r.descripcion}</span>)}
        </Link>
      )}
      <Modal abierto={reportar} onCerrar={() => { setReportar(false); cargarExtras() }} titulo={`Reportar problema · ${a.codigo}`}>
        <ReportarFalla qr={(a as unknown as { qr: string }).qr} nombreInicial={perfilRep?.nombre ?? ''} onListo={() => cargarExtras()} />
      </Modal>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="tarjeta flex items-start gap-3 p-4"><MapPin size={18} className="mt-0.5 text-marca-oscuro" /><div><p className="text-xs text-stone-500">Ubicación</p><p className="text-sm font-medium">{a.ubicacion ?? 'Sin ubicación'}</p></div></div>
            <div className="tarjeta flex items-start gap-3 p-4"><User size={18} className="mt-0.5 text-marca-oscuro" /><div><p className="text-xs text-stone-500">Responsable</p><p className="text-sm font-medium">{a.responsable || 'Sin responsable'}</p></div></div>
            <div className="tarjeta flex items-start gap-3 p-4"><Building2 size={18} className="mt-0.5 text-marca-oscuro" /><div><p className="text-xs text-stone-500">Empresa</p><p className="text-sm font-medium">{a.empresa}</p></div></div>
          </div>

          <section className="tarjeta p-5">
            <h2 className="mb-4 font-semibold">Datos</h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Dato k="Número de serie" v={a.serie} />
              <Dato k="Número económico" v={a.numero_economico} />
              <Dato k="Fecha de alta" v={fecha(a.fecha_alta)} />
              <Dato k="Valor de referencia" v={moneda(a.valor_referencia)} />
              <Dato k="Última actualización" v={fecha(a.updated_at)} />
            </dl>
            {notas && <p className="mt-4 whitespace-pre-line border-t border-stone-100 pt-4 text-sm text-stone-700">{notas}</p>}
          </section>

          {veh && (
            <section className="tarjeta p-5">
              <h2 className="mb-4 font-semibold">Vehículo</h2>
              <dl className="grid gap-4 sm:grid-cols-4">
                <Dato k="Placa" v={veh.placa} /><Dato k="Año" v={veh.anio} /><Dato k="Color" v={veh.color} />
                <Dato k="Kilometraje / horas" v={veh.kilometraje?.toLocaleString('es-MX')} />
                <Dato k="Combustible" v={veh.combustible} /><Dato k="Transmisión" v={veh.transmision} />
                <Dato k="Cilindros" v={veh.cilindros} /><Dato k="Pasajeros" v={veh.pasajeros} />
              </dl>
            </section>
          )}

          {tipoEquipo(a.categoria, a.es_vehiculo) !== 'otro' && <UsoPanel activoId={a.id} empresaId={(a as unknown as { empresa_id: string }).empresa_id} qr={(a as unknown as { qr: string }).qr} tipo={tipoEquipo(a.categoria, a.es_vehiculo)} nombreUsuario={perfilRep?.nombre} />}

          <DocumentosPanel empresaId={(a as unknown as { empresa_id: string }).empresa_id} activoId={a.id} esVehiculo={a.es_vehiculo} />

          <section className="tarjeta p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Fotos</h2>
              {puedeEditar && (
                <label className="btn-sec cursor-pointer py-1.5 text-xs">
                  <Camera size={14} />{subiendo ? 'Subiendo…' : 'Agregar'}
                  <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={subiendo} onChange={e => agregarFotos(e.target.files)} />
                </label>
              )}
            </div>
            {fotos.length === 0 ? <p className="text-sm text-stone-500">Sin fotos todavía.</p> : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {fotos.map(f => (
                  <div key={f.id} className="group relative aspect-square overflow-hidden rounded-lg bg-stone-100">
                    <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt="" className="h-full w-full object-cover" loading="lazy" /></a>
                    {puedeEditar && <button onClick={() => borrarFoto(f)} className="absolute right-1.5 top-1.5 hidden rounded bg-white/90 p-1 text-rojo group-hover:block" aria-label="Borrar foto"><Trash2 size={14} /></button>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="tarjeta p-5">
            <h2 className="mb-4 font-semibold">Historial de resguardos</h2>
            {resg.length === 0 ? <p className="text-sm text-stone-500">Sin movimientos todavía.</p> : (
              <ol className="space-y-3">
                {resg.map(r => r.movimientos && (
                  <li key={r.movimiento_id} className="flex flex-wrap items-start justify-between gap-2 border-l-2 border-stone-300 pl-3 text-sm">
                    <div>
                      <div className="flex items-center gap-2"><TipoBadge tipo={r.movimientos.tipo} /><span className="text-xs text-stone-500">{new Date(r.movimientos.fecha).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</span></div>
                      <p className="mt-1">{r.movimientos.entrega_nombre ?? '—'} → {r.movimientos.recibe_nombre ?? '—'}{r.movimientos.ubicacion ? ` · ${r.movimientos.ubicacion.nombre}` : ''}</p>
                      {r.estado_fisico && <p className="text-xs text-stone-500">Estado: {r.estado_fisico}</p>}
                    </div>
                    <Link to={`/resguardos/${r.movimiento_id}`} className="font-mono text-xs text-stone-600 hover:underline">{r.movimientos.folio}</Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {esAdmin && movs.length > 0 && (
            <section className="tarjeta p-5">
              <h2 className="mb-4 font-semibold">Historial de cambios</h2>
              <ol className="space-y-3">
                {movs.map(m => {
                  const cambios = m.accion === 'UPDATE' && m.antes && m.despues
                    ? Object.keys(CAMPOS_BITACORA).filter(k => JSON.stringify(m.antes![k]) !== JSON.stringify(m.despues![k])) : []
                  if (m.accion === 'UPDATE' && cambios.length === 0) return null
                  return (
                    <li key={m.id} className="border-l-2 border-marca pl-3 text-sm">
                      <p className="text-xs text-stone-500">{new Date(m.fecha).toLocaleString('es-MX')}</p>
                      <p>{m.accion === 'INSERT' ? 'Alta del activo' : m.accion === 'DELETE' ? 'Borrado' : `Cambió: ${cambios.map(k => k === 'estatus'
                        ? `estatus a ${ESTATUS[m.despues!.estatus as keyof typeof ESTATUS]?.texto}` : CAMPOS_BITACORA[k].toLowerCase()).join(', ')}`}</p>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}
        </div>

        <div className="space-y-6">
          {principal?.url && <img src={principal.url} alt={a.descripcion} className="tarjeta aspect-[4/3] w-full object-cover" />}
          <section className="tarjeta flex flex-col items-center p-5 text-center">
            <QRCodeSVG value={urlQR(a.qr)} size={176} level="M" marginSize={0} />
            <p className="mt-3 font-mono text-sm font-semibold">{a.codigo}</p>
            <p className="mt-1 text-xs text-stone-500">Escanéalo con el celular para abrir esta ficha.</p>
          </section>
          <LineaTiempo activoId={a.id} alta={(a as unknown as { created_at?: string }).created_at ?? a.fecha_alta} />
        </div>
      </div>
    </div>
  )
}
