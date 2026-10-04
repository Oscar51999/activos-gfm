import { useEffect, useRef, useState } from 'react'
import { FileText, ShieldCheck, Car, BadgeCheck, Receipt, FileSignature, Ship, Gauge, IdCard, Stamp, Award, File, Plus, Landmark, BookMarked, MapPinned, ScrollText, Megaphone, Scale, Banknote, LineChart, Store, Map as MapaI, ShieldAlert, Cross, Leaf, Bug, Recycle, Siren, Ruler, HardHat, CheckCheck, Umbrella, RefreshCw, ExternalLink, Paperclip, Trash2, History, CalendarClock } from 'lucide-react'
import { supabase, mensajeError, BUCKET } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { urlFirmada } from '../lib/fotos'
import { Modal, Campo, Aviso, Vacio } from './ui'
import { diasPara, fechaCorta } from './Prestamo'

export const TIPOS_DOC: Record<string, { texto: string; icono: typeof File; vence: boolean; para: string; basico?: boolean }> = {
  poliza_seguro: { texto: 'Póliza de seguro', icono: ShieldCheck, vence: true, para: 'activo+inmueble', basico: true },
  tarjeta_circulacion: { texto: 'Tarjeta de circulación', icono: Car, vence: true, para: 'vehiculo' },
  verificacion: { texto: 'Verificación', icono: BadgeCheck, vence: true, para: 'vehiculo' },
  calibracion: { texto: 'Certificado de calibración', icono: Gauge, vence: true, para: 'activo' },
  garantia: { texto: 'Garantía', icono: Award, vence: true, para: 'activo' },
  arrendamiento: { texto: 'Contrato de arrendamiento', icono: FileSignature, vence: true, para: 'activo+inmueble' },
  permiso: { texto: 'Permiso', icono: Stamp, vence: true, para: 'activo' },
  factura: { texto: 'Factura (comprobante)', icono: Receipt, vence: false, para: 'activo' },
  pedimento: { texto: 'Pedimento de importación', icono: Ship, vence: false, para: 'activo' },
  licencia_manejo: { texto: 'Licencia de manejo', icono: IdCard, vence: true, para: 'empleado' },
  certificacion: { texto: 'Certificación / DC-3', icono: Award, vence: true, para: 'empleado' },
  // ── inmuebles ──
  escritura: { texto: 'Escritura', icono: ScrollText, vence: false, para: 'inmueble', basico: true },
  registro_publico: { texto: 'Registro Público de la Propiedad', icono: BookMarked, vence: false, para: 'inmueble', basico: true },
  catastro: { texto: 'Catastro', icono: MapPinned, vence: false, para: 'inmueble' },
  predial: { texto: 'Predial', icono: Landmark, vence: true, para: 'inmueble', basico: true },
  constancias: { texto: 'Constancias y certificados', icono: Award, vence: true, para: 'inmueble' },
  avisos_ayuntamiento: { texto: 'Avisos del Ayuntamiento', icono: Megaphone, vence: false, para: 'inmueble' },
  avaluo: { texto: 'Avalúo', icono: Scale, vence: false, para: 'inmueble' },
  contrato_compraventa: { texto: 'Contrato de compraventa', icono: FileSignature, vence: false, para: 'inmueble' },
  hipoteca: { texto: 'Hipoteca', icono: Banknote, vence: false, para: 'inmueble' },
  opinion_valor: { texto: 'Opinión de valor', icono: LineChart, vence: false, para: 'inmueble' },
  licencia_funcionamiento: { texto: 'Licencia de funcionamiento', icono: Store, vence: true, para: 'inmueble' },
  uso_suelo: { texto: 'Uso de suelo', icono: MapaI, vence: true, para: 'inmueble', basico: true },
  pc_dictamen: { texto: 'Protección Civil · dictamen de verificación', icono: ShieldAlert, vence: true, para: 'inmueble', basico: true },
  pc_primeros_auxilios: { texto: 'Protección Civil · primeros auxilios y extintores', icono: Cross, vence: true, para: 'inmueble' },
  medio_ambiente: { texto: 'Dictamen de medio ambiente', icono: Leaf, vence: true, para: 'inmueble' },
  fumigacion: { texto: 'Fumigación y control de plagas', icono: Bug, vence: true, para: 'inmueble' },
  residuos: { texto: 'Recolección de residuos', icono: Recycle, vence: true, para: 'inmueble' },
  pipc: { texto: 'Programa Interno de Protección Civil', icono: Siren, vence: true, para: 'inmueble' },
  plano: { texto: 'Plano', icono: Ruler, vence: false, para: 'inmueble' },
  licencia_construccion: { texto: 'Licencia de construcción', icono: HardHat, vence: true, para: 'inmueble' },
  terminacion_obra: { texto: 'Aviso de terminación de obra', icono: CheckCheck, vence: false, para: 'inmueble' },
  seguro_danos: { texto: 'Seguro de daños patrimoniales', icono: Umbrella, vence: true, para: 'inmueble' },
  otro: { texto: 'Otro documento', icono: File, vence: true, para: 'todos' },
}
export type TipoDoc = string
export const SUBTIPOS: Record<string, string[]> = {
  plano: ['Arquitectónico', 'Estructural', 'Instalaciones', 'Topográfico'],
  constancias: ['Libertad de gravámenes', 'Título de propiedad', 'Dictamen de seguridad', 'Otro'],
  poliza_seguro: ['Daños al inmueble', 'Incendio', 'Terremoto', 'Inundación', 'Responsabilidad civil', 'Robo', 'Todo riesgo', 'Construcción / obra', 'Maquinaria y equipo', 'Otro'],
  seguro_danos: ['Edificio e instalaciones', 'Contenidos', 'Pérdida de rentas', 'Fenómenos hidrometeorológicos y terremoto', 'Responsabilidad civil', 'Robo', 'Rotura de cristales', 'Todo riesgo'],
}
/** Expediente básico de un inmueble: lo mínimo que debe tener. */
export const BASICOS_INMUEBLE = ['escritura', 'registro_publico', 'predial', 'uso_suelo', 'pc_dictamen', 'poliza_seguro']

export type Documento = { id: string; empresa_id: string; activo_id: string | null; empleado_id: string | null; inmueble_id?: string | null; subtipo?: string | null; tipo: TipoDoc; numero: string | null; emisor: string | null
  fecha_emision: string | null; fecha_vencimiento: string | null; avisar_dias: number; archivo_path: string | null; archivo_nombre: string | null; notas: string | null
  vigente: boolean; renovado_de: string | null; created_at: string }

/** Estado de vigencia con color. */
export function estadoDoc(fecha: string | null, avisar = 30) {
  if (!fecha) return { texto: 'No vence', clase: 'bg-stone-100 text-stone-600 ring-stone-200', nivel: 3 }
  const n = diasPara(fecha)
  if (n < 0) return { texto: `Vencido hace ${-n} día${n === -1 ? '' : 's'}`, clase: 'bg-red-50 text-red-700 ring-red-200', nivel: 0 }
  if (n === 0) return { texto: 'Vence hoy', clase: 'bg-red-50 text-red-700 ring-red-200', nivel: 0 }
  if (n <= avisar) return { texto: `Vence en ${n} día${n === 1 ? '' : 's'}`, clase: 'bg-amber-50 text-amber-800 ring-amber-200', nivel: 1 }
  return { texto: `Vigente hasta ${fechaCorta(fecha)}`, clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200', nivel: 2 }
}
export function VigenciaBadge({ fecha, avisar }: { fecha: string | null; avisar?: number }) {
  const e = estadoDoc(fecha, avisar)
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${e.clase}`}><CalendarClock size={11} />{e.texto}</span>
}

export async function abrirArchivo(path: string) {
  const u = await urlFirmada(path)
  if (u) window.open(u, '_blank', 'noopener')
}

/** Documentos de un activo o de un empleado: lista, alta, renovación e historial. */
export function DocumentosPanel({ empresaId, activoId, empleadoId, inmuebleId, esVehiculo = false, onCambio }: { empresaId: string; activoId?: string; empleadoId?: string; inmuebleId?: string; esVehiculo?: boolean; onCambio?: (docs: Documento[]) => void }) {
  const { puedeEditar } = useAuth()
  const [docs, setDocs] = useState<Documento[] | null>(null)
  const [modal, setModal] = useState<{ doc?: Documento; renovar?: boolean; tipo?: string } | null>(null)
  const [historial, setHistorial] = useState(false)

  const cargar = () => {
    let q = supabase.from('documentos').select('*').order('created_at', { ascending: false })
    q = activoId ? q.eq('activo_id', activoId) : inmuebleId ? q.eq('inmueble_id', inmuebleId) : q.eq('empleado_id', empleadoId!)
    q.then(({ data }) => { const d = (data as Documento[]) ?? []; setDocs(d); onCambio?.(d) })
  }
  useEffect(cargar, [activoId, empleadoId, inmuebleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const vigentes = (docs ?? []).filter(d => d.vigente).sort((a, b) => estadoDoc(a.fecha_vencimiento, a.avisar_dias).nivel - estadoDoc(b.fecha_vencimiento, b.avisar_dias).nivel)
  const anteriores = (docs ?? []).filter(d => !d.vigente)

  return (
    <section className="tarjeta p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><FileText size={17} className="text-marca" />Documentos</h2>
        <div className="flex gap-2">
          {anteriores.length > 0 && <button className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-marca" onClick={() => setHistorial(h => !h)}><History size={13} />{historial ? 'Ocultar' : `Anteriores (${anteriores.length})`}</button>}
          {puedeEditar && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => setModal({})}><Plus size={14} />Agregar</button>}
        </div>
      </div>
      {!docs ? null : vigentes.length === 0 ? (
        <Vacio titulo="Sin documentos" texto={inmuebleId ? 'Empieza por la escritura, el predial y el uso de suelo.' : activoId ? (esVehiculo ? 'Agrega póliza, tarjeta de circulación y verificación para recibir avisos antes de que venzan.' : 'Agrega garantía, póliza o certificado de calibración.') : 'Agrega su licencia de manejo o certificaciones.'} />
      ) : (
        <ul className="space-y-2">
          {vigentes.map(d => <FilaDoc key={d.id} d={d} puedeEditar={puedeEditar} onRenovar={() => setModal({ doc: d, renovar: true })} onEditar={() => setModal({ doc: d })} />)}
        </ul>
      )}
      {inmuebleId && docs && puedeEditar && (() => {
        const faltan = BASICOS_INMUEBLE.filter(t => !vigentes.some(d => d.tipo === t || (t === 'poliza_seguro' && d.tipo === 'seguro_danos')))
        return faltan.length > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-amber-200 bg-amber-50/40 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-amber-800">Falta en el expediente básico</p>
            <div className="flex flex-wrap gap-1.5">{faltan.map(t => { const X = TIPOS_DOC[t]; return <button key={t} onClick={() => setModal({ tipo: t })} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1 text-xs text-stone-600 hover:border-marca hover:text-marca"><X.icono size={13} />{X.texto}<Plus size={12} /></button> })}</div>
          </div>
        )
      })()}
      {historial && anteriores.length > 0 && (
        <div className="mt-4 border-t border-stone-200 pt-3">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-stone-500">Versiones anteriores</p>
          <ul className="space-y-1.5 opacity-70">{anteriores.map(d => <FilaDoc key={d.id} d={d} puedeEditar={false} />)}</ul>
        </div>
      )}
      <DocumentoModal abierto={!!modal} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); cargar() }}
        empresaId={empresaId} activoId={activoId} empleadoId={empleadoId} inmuebleId={inmuebleId} esVehiculo={esVehiculo} doc={modal?.doc} renovar={modal?.renovar} tipoInicial={modal?.tipo} />
    </section>
  )
}

function FilaDoc({ d, puedeEditar, onRenovar, onEditar }: { d: Documento; puedeEditar: boolean; onRenovar?: () => void; onEditar?: () => void }) {
  const T = TIPOS_DOC[d.tipo] ?? TIPOS_DOC.otro
  const e = estadoDoc(d.fecha_vencimiento, d.avisar_dias)
  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${e.nivel === 0 && d.vigente ? 'border-red-200 bg-red-50/40' : 'border-stone-200'}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-marca"><T.icono size={17} /></span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onEditar} disabled={!onEditar}>
        <p className="truncate text-sm font-medium">{T.texto}{d.subtipo ? <span className="text-stone-500"> · {d.subtipo}</span> : null}{d.numero ? <span className="font-mono text-xs text-stone-500"> · {d.numero}</span> : null}</p>
        <p className="truncate text-xs text-stone-500">{[d.emisor, d.fecha_emision && `desde ${fechaCorta(d.fecha_emision)}`].filter(Boolean).join(' · ') || 'Sin datos de emisión'}</p>
      </button>
      {d.vigente ? <VigenciaBadge fecha={d.fecha_vencimiento} avisar={d.avisar_dias} /> : <span className="text-[11px] text-stone-500">{d.fecha_vencimiento ? `venció ${fechaCorta(d.fecha_vencimiento)}` : 'reemplazado'}</span>}
      <div className="flex gap-1">
        {d.archivo_path && <button onClick={() => abrirArchivo(d.archivo_path!)} title={d.archivo_nombre ?? 'Ver archivo'} className="grid h-8 w-8 place-items-center rounded-lg border border-stone-300 text-stone-500 hover:border-marca hover:text-marca"><ExternalLink size={14} /></button>}
        {puedeEditar && d.vigente && T.vence && onRenovar && <button onClick={onRenovar} className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-300 px-2.5 text-xs text-stone-600 hover:border-marca hover:text-marca"><RefreshCw size={13} />Renovar</button>}
      </div>
    </li>
  )
}

/** Alta, edición o renovación de un documento con su archivo (PDF o foto). */
export function DocumentoModal({ abierto, onCerrar, onGuardado, empresaId, activoId, empleadoId, inmuebleId, esVehiculo, doc, renovar, tipoInicial }: {
  abierto: boolean; onCerrar: () => void; onGuardado: () => void; empresaId: string; activoId?: string; empleadoId?: string; inmuebleId?: string; esVehiculo?: boolean; doc?: Documento; renovar?: boolean; tipoInicial?: string
}) {
  const { esAdmin } = useAuth()
  const tipos = (Object.keys(TIPOS_DOC) as TipoDoc[]).filter(k => {
    const p = TIPOS_DOC[k].para
    if (p === 'todos') return true
    if (inmuebleId) return p.includes('inmueble')
    if (empleadoId) return p === 'empleado'
    return p.startsWith('activo') || (p === 'vehiculo' && !!esVehiculo)
  })
  const vacio = { tipo: (tipoInicial ?? tipos[0]) as TipoDoc, numero: '', emisor: '', fecha_emision: '', fecha_vencimiento: '', avisar_dias: 30, notas: '', subtipo: '' }
  const [f, setF] = useState(vacio)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!abierto) return
    setError(''); setArchivo(null)
    if (doc && renovar) {
      // la renovación arranca el día que vence la anterior y dura lo mismo
      let nueva = ''
      if (doc.fecha_vencimiento && doc.fecha_emision) {
        const dur = new Date(doc.fecha_vencimiento).getTime() - new Date(doc.fecha_emision).getTime()
        nueva = new Date(new Date(doc.fecha_vencimiento).getTime() + dur).toISOString().slice(0, 10)
      }
      setF({ tipo: doc.tipo, numero: '', emisor: doc.emisor ?? '', fecha_emision: doc.fecha_vencimiento ?? '', fecha_vencimiento: nueva, avisar_dias: doc.avisar_dias, notas: '', subtipo: doc.subtipo ?? '' })
    } else if (doc) {
      setF({ tipo: doc.tipo, numero: doc.numero ?? '', emisor: doc.emisor ?? '', fecha_emision: doc.fecha_emision ?? '', fecha_vencimiento: doc.fecha_vencimiento ?? '', avisar_dias: doc.avisar_dias, notas: doc.notas ?? '', subtipo: doc.subtipo ?? '' })
    } else setF(vacio)
  }, [abierto, doc, renovar, tipoInicial]) // eslint-disable-line react-hooks/exhaustive-deps

  const T = TIPOS_DOC[f.tipo] ?? TIPOS_DOC.otro
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: k === 'avisar_dias' ? Number(e.target.value) : e.target.value }))

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (T.vence && !f.fecha_vencimiento) { setError('Indica la fecha de vencimiento.'); return }
    setGuardando(true)
    try {
      let archivo_path = doc && !renovar ? doc.archivo_path : null, archivo_nombre = doc && !renovar ? doc.archivo_nombre : null
      if (archivo) {
        const ext = (archivo.name.split('.').pop() || 'pdf').toLowerCase()
        const path = `${empresaId}/documentos/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from(BUCKET).upload(path, archivo, { contentType: archivo.type || 'application/pdf' })
        if (up.error) throw up.error
        archivo_path = path; archivo_nombre = archivo.name
      }
      const datos = { tipo: f.tipo, numero: f.numero.trim() || null, emisor: f.emisor.trim() || null, fecha_emision: f.fecha_emision || null,
        fecha_vencimiento: T.vence ? f.fecha_vencimiento || null : null, avisar_dias: f.avisar_dias, notas: f.notas.trim() || null, archivo_path, archivo_nombre, subtipo: SUBTIPOS[f.tipo] && f.subtipo ? f.subtipo : null }
      if (doc && !renovar) {
        const { error } = await supabase.from('documentos').update(datos).eq('id', doc.id); if (error) throw error
      } else {
        const { error } = await supabase.from('documentos').insert({ ...datos, empresa_id: empresaId, activo_id: activoId ?? null, empleado_id: empleadoId ?? null, inmueble_id: inmuebleId ?? null, renovado_de: renovar ? doc!.id : null })
        if (error) throw error
        if (renovar && doc) await supabase.from('documentos').update({ vigente: false }).eq('id', doc.id)
      }
      onGuardado()
    } catch (err) { setError(mensajeError(err)) } finally { setGuardando(false) }
  }
  async function borrar() {
    if (!doc || !confirm('¿Borrar este documento?')) return
    const { error } = await supabase.from('documentos').delete().eq('id', doc.id)
    if (error) setError(mensajeError(error)); else onGuardado()
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={renovar ? `Renovar ${T.texto.toLowerCase()}` : doc ? 'Editar documento' : 'Agregar documento'}>
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        {!renovar && (
          <div className="sm:col-span-2">
            <span className="etiqueta">Tipo de documento</span>
            <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${tipos.length > 12 ? 'max-h-64 overflow-y-auto pr-1' : ''}`}>
              {tipos.map(k => {
                const X = TIPOS_DOC[k]
                return <button key={k} type="button" onClick={() => setF(x => ({ ...x, tipo: k }))} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${f.tipo === k ? 'border-marca bg-marca/10 text-marca' : 'border-stone-300 text-stone-600 hover:border-marca/50'}`}><X.icono size={15} className="shrink-0" /><span className="leading-tight">{X.texto}</span></button>
              })}
            </div>
          </div>
        )}
        {SUBTIPOS[f.tipo] && (inmuebleId || f.tipo !== 'poliza_seguro') && <Campo label={f.tipo === 'plano' ? 'Tipo de plano' : f.tipo === 'constancias' ? '¿Qué constancia?' : 'Cobertura'} className="sm:col-span-2"><select className="campo" value={f.subtipo} onChange={set('subtipo')}><option value="">—</option>{SUBTIPOS[f.tipo].map(x => <option key={x}>{x}</option>)}</select></Campo>}
        <Campo label={f.tipo === 'poliza_seguro' ? 'No. de póliza' : f.tipo === 'licencia_manejo' ? 'No. de licencia' : f.tipo === 'escritura' ? 'No. de escritura' : f.tipo === 'predial' ? 'Clave catastral / recibo' : 'Número / folio'}><input className="campo" value={f.numero} onChange={set('numero')} /></Campo>
        <Campo label={f.tipo === 'poliza_seguro' ? 'Aseguradora' : f.tipo === 'calibracion' ? 'Laboratorio' : f.tipo === 'licencia_manejo' ? 'Tipo / estado que la expide' : ['escritura', 'contrato_compraventa', 'hipoteca'].includes(f.tipo) ? 'Notaría' : ['predial', 'uso_suelo', 'licencia_construccion', 'licencia_funcionamiento', 'avisos_ayuntamiento', 'terminacion_obra'].includes(f.tipo) ? 'Ayuntamiento / dependencia' : 'Emisor'}><input className="campo" value={f.emisor} onChange={set('emisor')} /></Campo>
        <Campo label="Fecha de emisión / inicio"><input className="campo" type="date" value={f.fecha_emision} onChange={set('fecha_emision')} /></Campo>
        {T.vence ? <Campo label="Vence el *"><input className="campo" type="date" value={f.fecha_vencimiento} onChange={set('fecha_vencimiento')} /></Campo> : <div className="flex items-end pb-2 text-xs text-stone-500">Este documento no vence.</div>}
        {T.vence && (
          <Campo label="Avisar con anticipación" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {[7, 15, 30, 60, 90].map(n => <button key={n} type="button" onClick={() => setF(x => ({ ...x, avisar_dias: n }))} className={`rounded-lg border px-3 py-1.5 text-xs ${f.avisar_dias === n ? 'border-marca bg-marca/10 text-marca' : 'border-stone-300 text-stone-600'}`}>{n} días</button>)}
            </div>
          </Campo>
        )}
        <div className="sm:col-span-2">
          <span className="etiqueta">Archivo (PDF o foto)</span>
          <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-stone-300 px-4 py-3 text-left text-sm text-stone-500 transition hover:border-marca hover:text-marca">
            <Paperclip size={18} className="shrink-0" />
            <span className="min-w-0 truncate">{archivo ? archivo.name : doc?.archivo_nombre && !renovar ? `${doc.archivo_nombre} (toca para reemplazar)` : 'Adjuntar el documento escaneado'}</span>
          </button>
          <input ref={input} type="file" accept="application/pdf,image/*" hidden onChange={e => setArchivo(e.target.files?.[0] ?? null)} />
        </div>
        <Campo label="Notas" className="sm:col-span-2"><textarea className="campo" rows={2} value={f.notas} onChange={set('notas')} placeholder={f.tipo === 'poliza_seguro' ? 'Cobertura, teléfono de siniestros…' : ''} /></Campo>
        {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
        <div className="flex items-center gap-2 sm:col-span-2">
          {doc && !renovar && esAdmin && <button type="button" onClick={borrar} className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-red-700"><Trash2 size={14} />Borrar</button>}
          <div className="ml-auto flex gap-2"><button type="button" className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : renovar ? 'Guardar renovación' : 'Guardar'}</button></div>
        </div>
      </form>
    </Modal>
  )
}
