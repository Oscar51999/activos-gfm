import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Archive, Plus, Camera, X, Check, Ban, Printer, ArrowLeft, FileText, Loader2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fecha } from '../lib/hooks'
import { Encabezado, Campo, Modal, Aviso, Cargando, Vacio } from '../components/ui'
import { BuscarActivo, fotoADataUrl, type ActivoMini } from '../components/Buscadores'
import { LogoFirme } from '../components/Logo'
import { nombresUsuarios } from '../lib/nombresUsuarios'

export const MOTIVOS_BAJA: Record<string, string> = {
  obsolescencia: 'Obsolescencia / fin de vida', dano_irreparable: 'Daño irreparable', robo: 'Robo', extravio: 'Extravío', siniestro: 'Siniestro (choque, incendio, inundación)', venta_donacion: 'Venta o donación', otro: 'Otro',
}
const ESTADO: Record<string, { t: string; c: string }> = {
  pendiente: { t: 'Por autorizar', c: 'bg-amber-50 text-amber-800 ring-amber-200' }, autorizada: { t: 'Autorizada', c: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }, rechazada: { t: 'Rechazada', c: 'bg-stone-100 text-stone-600 ring-stone-200' },
}
type Baja = { id: string; folio: string; activo_id: string; empresa_id: string; motivo: string; descripcion: string; referencia: string | null; destino: string | null; fotos: string[]; estatus: string
  solicitado_por: string | null; autorizado_por: string | null; autorizado_at: string | null; respuesta: string | null; estatus_anterior: string | null; created_at: string
  activos: { codigo: string; descripcion: string; serie: string | null; numero_economico: string | null; fecha_alta: string; marcas: { nombre: string } | null; modelos: { nombre: string } | null; categorias: { nombre: string } | null; empresas: { nombre: string; razon_social: string | null } | null } | null
  responsable: { nombres: string; apellidos: string | null } | null }
const SEL = '*,activos(codigo,descripcion,serie,numero_economico,fecha_alta,marcas(nombre),modelos(nombre),categorias(nombre),empresas(nombre,razon_social)),responsable:empleados!bajas_activos_responsable_anterior_fkey(nombres,apellidos)'

/** Bajas de activos: se piden con motivo y fotos, las autoriza un supervisor y queda el acta. */
export default function Bajas() {
  const { puedeEditar, puedeResguardar } = useAuth()
  const [params, setParams] = useSearchParams()
  const [lista, setLista] = useState<Baja[] | null>(null)
  const [tab, setTab] = useState<'pendiente' | 'autorizada' | 'rechazada'>('pendiente')
  const [nueva, setNueva] = useState(!!params.get('activo'))
  const [resolver, setResolver] = useState<{ b: Baja; autorizar: boolean } | null>(null)
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [n, setN] = useState(0)

  useEffect(() => {
    supabase.from('bajas_activos').select(SEL).order('created_at', { ascending: false }).limit(500).then(({ data }) => setLista((data as unknown as Baja[]) ?? []))
    nombresUsuarios().then(setNombres)
  }, [n])
  const vis = (lista ?? []).filter(b => b.estatus === tab)
  const cuenta = (e: string) => (lista ?? []).filter(b => b.estatus === e).length

  return (
    <div>
      <Encabezado titulo="Bajas de activos" sub="Equipo obsoleto, robado, extraviado o siniestrado: con motivo, fotos y autorización. Cada baja genera su acta."
        acciones={puedeResguardar ? <button className="btn-primario" onClick={() => setNueva(true)}><Plus size={16} />Solicitar baja</button> : undefined} />
      <div className="mb-4 flex overflow-hidden rounded-xl border border-stone-200 text-sm sm:w-fit">
        {(['pendiente', 'autorizada', 'rechazada'] as const).map(k => <button key={k} onClick={() => setTab(k)} className={`flex-1 px-4 py-2 ${tab === k ? 'bg-marca/15 text-marca' : 'text-stone-500 hover:bg-stone-100'}`}>{ESTADO[k].t} <span className="cifra text-xs opacity-70">{cuenta(k)}</span></button>)}
      </div>
      {!lista ? <Cargando /> : vis.length === 0 ? <div className="tarjeta"><Vacio titulo={tab === 'pendiente' ? 'No hay bajas por autorizar' : 'Sin bajas aquí'} texto="Desde el detalle de un activo o con el botón Solicitar baja." /></div> : (
        <div className="space-y-2">
          {vis.map(b => (
            <div key={b.id} className="tarjeta flex flex-wrap items-center gap-4 p-4">
              <div className="flex shrink-0 gap-1">{b.fotos.slice(0, 2).map((f, i) => <img key={i} src={f} alt="" className="h-14 w-14 rounded-lg object-cover ring-1 ring-stone-200" />)}{!b.fotos.length && <span className="grid h-14 w-14 place-items-center rounded-lg bg-stone-100 text-stone-400"><Archive size={20} /></span>}</div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-mono text-xs text-stone-500">{b.folio}</span><span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${ESTADO[b.estatus].c}`}>{ESTADO[b.estatus].t}</span><span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">{MOTIVOS_BAJA[b.motivo]}</span></p>
                <p className="mt-1 truncate font-medium"><Link to={`/activos/${b.activo_id}`} className="hover:text-marca">{b.activos?.descripcion}</Link> <span className="font-mono text-xs text-stone-500">{b.activos?.codigo}</span></p>
                <p className="truncate text-xs text-stone-500">{b.descripcion} · pidió {nombres[b.solicitado_por ?? ''] ?? '—'} el {fecha(b.created_at)}{b.autorizado_at ? ` · ${b.estatus === 'autorizada' ? 'autorizó' : 'rechazó'} ${nombres[b.autorizado_por ?? ''] ?? '—'}` : ''}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {puedeEditar && b.estatus === 'pendiente' && <>
                  <button className="btn-sec !px-3 text-xs hover:!text-red-700" onClick={() => setResolver({ b, autorizar: false })}><Ban size={14} />Rechazar</button>
                  <button className="btn-primario !px-3 text-xs" onClick={() => setResolver({ b, autorizar: true })}><Check size={14} />Autorizar</button>
                </>}
                <Link className="btn-sec !px-3 text-xs" to={`/bajas/${b.id}`}><FileText size={14} />Acta</Link>
              </div>
            </div>
          ))}
        </div>
      )}
      {nueva && <NuevaBaja activoId={params.get('activo')} onCerrar={() => { setNueva(false); if (params.get('activo')) setParams({}) }} onListo={() => { setNueva(false); setParams({}); setTab('pendiente'); setN(x => x + 1) }} />}
      {resolver && <Resolver {...resolver} onCerrar={() => setResolver(null)} onListo={() => { setResolver(null); setN(x => x + 1) }} />}
    </div>
  )
}

function NuevaBaja({ activoId, onCerrar, onListo }: { activoId: string | null; onCerrar: () => void; onListo: () => void }) {
  const [act, setAct] = useState<ActivoMini | null>(null)
  const [f, setF] = useState({ motivo: 'obsolescencia', descripcion: '', referencia: '', destino: '' })
  const [fotos, setFotos] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (activoId) supabase.from('v_activos').select('*').eq('id', activoId).single().then(({ data }) => data && setAct(data as unknown as ActivoMini))
  }, [activoId])
  const asignado = act?.estatus === 'asignado'
  const permitido = !asignado || ['robo', 'extravio', 'siniestro', 'dano_irreparable'].includes(f.motivo)

  async function agregar(files: FileList | null) {
    if (!files) return
    setCargando(true)
    try { const nuevas = await Promise.all([...files].slice(0, 6 - fotos.length).map(x => fotoADataUrl(x))); setFotos(p => [...p, ...nuevas]) } catch { setError('No se pudo leer la foto.') }
    setCargando(false); if (input.current) input.current.value = ''
  }
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!act) return setError('Elige el activo.')
    if (!permitido) return setError('El activo está asignado: primero recíbelo con una devolución.')
    setEnviando(true)
    const { error } = await supabase.from('bajas_activos').insert({ activo_id: act.id, empresa_id: act.empresa_id, motivo: f.motivo, descripcion: f.descripcion.trim(), referencia: f.referencia.trim() || null, destino: f.destino.trim() || null, fotos })
    setEnviando(false)
    if (error) setError(mensajeError(error)); else onListo()
  }
  return (
    <Modal abierto titulo="Solicitar baja de activo" onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo label="Activo *"><BuscarActivo valor={act} onElegir={setAct} /></Campo>
        {asignado && <Aviso tipo="info">Lo tiene <b>{act?.responsable}</b>. Solo puede darse de baja así por robo, extravío, siniestro o daño irreparable; en otro caso primero haz la devolución.</Aviso>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Motivo *"><select className="campo" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })}>{Object.entries(MOTIVOS_BAJA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
          <Campo label={f.motivo === 'robo' || f.motivo === 'extravio' ? 'No. de denuncia o acta' : f.motivo === 'siniestro' ? 'No. de siniestro / póliza' : 'Dictamen o referencia'}><input className="campo" value={f.referencia} onChange={e => setF({ ...f, referencia: e.target.value })} /></Campo>
          <Campo label="¿Qué pasó? *" className="sm:col-span-2"><textarea className="campo" rows={3} required value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} placeholder="Ej. Laptop con tarjeta madre dañada, el proveedor dictaminó que no tiene reparación." /></Campo>
          <Campo label="Destino del equipo" className="sm:col-span-2"><input className="campo" value={f.destino} onChange={e => setF({ ...f, destino: e.target.value })} placeholder="Reciclaje, chatarra, se entrega a la aseguradora, donación…" /></Campo>
        </div>
        <div>
          <span className="etiqueta">Fotos (hasta 6)</span>
          <div className="flex flex-wrap gap-2">
            {fotos.map((x, i) => <span key={i} className="relative"><img src={x} alt="" className="h-20 w-20 rounded-lg object-cover ring-1 ring-stone-200" /><button type="button" onClick={() => setFotos(p => p.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white" aria-label="Quitar"><X size={12} /></button></span>)}
            {fotos.length < 6 && <button type="button" onClick={() => input.current?.click()} className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-stone-300 text-stone-400 hover:border-marca hover:text-marca">{cargando ? <Loader2 size={18} className="animate-spin" /> : <Camera size={20} />}</button>}
          </div>
          <input ref={input} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => agregar(e.target.files)} />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={enviando || !permitido}><Archive size={15} />{enviando ? 'Enviando…' : 'Solicitar baja'}</button></div>
      </form>
    </Modal>
  )
}

function Resolver({ b, autorizar, onCerrar, onListo }: { b: Baja; autorizar: boolean; onCerrar: () => void; onListo: () => void }) {
  const [resp, setResp] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function ok() {
    setError(''); setEnviando(true)
    const { error } = await supabase.rpc('resolver_baja', { p_id: b.id, p_autorizar: autorizar, p_respuesta: resp })
    setEnviando(false)
    if (error) setError(mensajeError(error)); else onListo()
  }
  return (
    <Modal abierto titulo={autorizar ? `Autorizar baja ${b.folio}` : `Rechazar baja ${b.folio}`} onCerrar={onCerrar} ancho="max-w-lg">
      <p className="mb-3 text-sm">{b.activos?.descripcion} <span className="font-mono text-xs text-stone-500">{b.activos?.codigo}</span> · {MOTIVOS_BAJA[b.motivo]}</p>
      {autorizar && <Aviso tipo="info">El activo quedará en estatus <b>Baja</b>, sin responsable, y se liberan las licencias instaladas en él. No se puede deshacer desde aquí.</Aviso>}
      <Campo label={autorizar ? 'Comentario (opcional)' : 'Motivo del rechazo'} className="mt-3"><textarea className="campo" rows={2} value={resp} onChange={e => setResp(e.target.value)} /></Campo>
      {error && <div className="mt-3"><Aviso>{error}</Aviso></div>}
      <div className="mt-4 flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button>
        <button className={autorizar ? 'btn-primario' : 'btn-peligro'} onClick={ok} disabled={enviando}>{autorizar ? <><Check size={15} />Autorizar baja</> : <><Ban size={15} />Rechazar</>}</button></div>
    </Modal>
  )
}

/** Acta de baja lista para imprimir. */
export function ActaBaja() {
  const { id } = useParams()
  const nav = useNavigate()
  const [b, setB] = useState<Baja | null>(null)
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.from('bajas_activos').select(SEL).eq('id', id!).single().then(({ data, error }) => { if (error) setError(mensajeError(error)); else setB(data as unknown as Baja) })
    nombresUsuarios().then(setNombres)
  }, [id])
  if (error) return <Aviso>{error}</Aviso>
  if (!b) return <Cargando />
  const a = b.activos
  const empresa = a?.empresas?.razon_social || a?.empresas?.nombre || ''
  const filas: [string, string | null | undefined][] = [
    ['Código', a?.codigo], ['Descripción', a?.descripcion], ['Categoría', a?.categorias?.nombre], ['Marca / modelo', [a?.marcas?.nombre, a?.modelos?.nombre].filter(Boolean).join(' ')],
    ['No. de serie', a?.serie], ['No. económico', a?.numero_economico], ['Fecha de alta', fecha(a?.fecha_alta)],
    ['Responsable al momento', b.responsable ? [b.responsable.nombres, b.responsable.apellidos].filter(Boolean).join(' ') : null],
  ]
  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => nav('/bajas')} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Bajas</button>
        <button className="btn-primario" onClick={() => window.print()}><Printer size={16} />Imprimir acta</button>
      </div>
      <article className="papel tarjeta mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed print:border-0 print:p-0">
        <header className="mb-6 flex items-start justify-between border-b-2 border-tinta pb-4">
          <div className="flex items-center gap-3"><LogoFirme className="h-9 w-auto text-black" /><div><p className="font-semibold">{empresa}</p><p className="text-xs text-stone-500">Departamento de TICS · Control de activos</p></div></div>
          <div className="text-right text-xs"><p className="font-mono text-sm font-semibold">{b.folio}</p><p>{fecha(b.autorizado_at ?? b.created_at)}</p></div>
        </header>
        <h2 className="mb-1 text-center text-base font-semibold uppercase tracking-wide">Acta de baja de activo</h2>
        <p className={`mb-5 text-center text-xs font-medium uppercase tracking-wider ${b.estatus === 'autorizada' ? 'text-emerald-700' : b.estatus === 'rechazada' ? 'text-red-700' : 'text-amber-700'}`}>{ESTADO[b.estatus].t}</p>
        <table className="mb-5 w-full border-collapse text-xs"><tbody>
          {filas.filter(([, v]) => v).map(([k, v]) => <tr key={k} className="border-b border-stone-200"><td className="w-44 py-1.5 pr-3 font-medium text-stone-600">{k}</td><td className="py-1.5">{v}</td></tr>)}
        </tbody></table>
        <p className="mb-2"><b>Motivo:</b> {MOTIVOS_BAJA[b.motivo]}{b.referencia ? ` · Referencia: ${b.referencia}` : ''}</p>
        <p className="mb-2"><b>Descripción:</b> {b.descripcion}</p>
        {b.destino && <p className="mb-2"><b>Destino del equipo:</b> {b.destino}</p>}
        {b.respuesta && <p className="mb-2"><b>Comentario de autorización:</b> {b.respuesta}</p>}
        {b.fotos.length > 0 && <div className="my-4 grid grid-cols-3 gap-2">{b.fotos.map((f, i) => <img key={i} src={f} alt={`Evidencia ${i + 1}`} className="aspect-[4/3] w-full rounded object-cover ring-1 ring-stone-300" />)}</div>}
        <p className="mt-4 text-xs text-stone-600">Con esta acta el activo deja de formar parte del inventario de {empresa} y se conserva su historial en el sistema de control de activos.</p>
        <div className="mt-16 grid grid-cols-3 gap-6 text-center text-xs">
          <div className="border-t border-tinta pt-1"><p className="font-medium">{nombres[b.solicitado_por ?? ''] ?? ''}&nbsp;</p><p className="text-stone-500">Solicita</p></div>
          <div className="border-t border-tinta pt-1"><p className="font-medium">{nombres[b.autorizado_por ?? ''] ?? ''}&nbsp;</p><p className="text-stone-500">Autoriza</p></div>
          <div className="border-t border-tinta pt-1"><p className="font-medium">&nbsp;</p><p className="text-stone-500">Testigo</p></div>
        </div>
      </article>
    </div>
  )
}
