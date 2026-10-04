import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Landmark, Plus, Search, MapPin, Ruler, Pencil, ArrowLeft, Camera, ExternalLink, AlertTriangle, CheckCircle2, Droplets, Zap, Waves, Wifi, Flame, Route, FileText, Building2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista } from '../lib/hooks'
import { fotoProducto } from '../lib/logos'
import { coordenadasDe, linkMaps, num } from '../lib/almacen'
import { Cargando, Vacio, Aviso, Modal, Campo } from '../components/ui'
import { DocumentosPanel, TIPOS_DOC, BASICOS_INMUEBLE, estadoDoc, type Documento } from '../components/Documentos'

export type Inmueble = { id: string; codigo: string; empresa_id: string; nombre: string; propietario: string | null; clave_catastral: string | null
  superficie_terreno: number | null; superficie_construccion: number | null; calle: string | null; numero_ext: string | null; numero_int: string | null; manzana: string | null; lote: string | null
  colonia: string | null; entre_calles: string | null; municipio: string | null; estado: string | null; cp: string | null; tipo: string; clasificacion: string | null; situacion: string | null
  servicios: string[]; colindancias: string | null; observaciones: string | null; foto: string | null; latitud: number | null; longitud: number | null; ubicacion_id: string | null; activo: boolean
  empresas?: { nombre: string; nombre_corto: string | null; color: string | null } | null }

export const TIPOS_INM: Record<string, string> = { terreno: 'Terreno', oficina: 'Oficina corporativa', bodega: 'Bodega', taller: 'Taller', campamento: 'Campamento', patio: 'Patio de maquinaria', casa_personal: 'Casa para personal', edificacion_proceso: 'Edificación en proceso' }
const CLASIF: Record<string, string> = { urbana: 'Urbana', suburbana: 'Suburbana', rustica: 'Rústica o rural' }
const SITUACION: Record<string, string> = { no_disponible: 'No disponible', en_proceso: 'En proceso', reserva: 'De reserva', en_desarrollo: 'En desarrollo', renta: 'En renta', oficina: 'Oficina', campamento: 'Campamento', empresa_socios: 'Empresa y/o socios' }
const SERVICIOS = [['agua', 'Agua', Droplets], ['luz', 'Luz', Zap], ['drenaje', 'Drenaje', Waves], ['internet', 'Internet', Wifi], ['gas', 'Gas', Flame], ['pavimento', 'Pavimento', Route]] as const
type DocMin = Pick<Documento, 'inmueble_id' | 'tipo' | 'fecha_vencimiento' | 'avisar_dias'>

const direccion = (i: Inmueble) => [[i.calle, i.numero_ext && `#${i.numero_ext}`, i.numero_int && `int. ${i.numero_int}`].filter(Boolean).join(' '), i.manzana && `Mz ${i.manzana}`, i.lote && `Lt ${i.lote}`, i.colonia, i.municipio].filter(Boolean).join(', ')

/** Expediente: cuántos de los documentos básicos tiene y si alguno venció. */
export function expediente(docs: DocMin[]) {
  const tiene = BASICOS_INMUEBLE.filter(t => docs.some(d => d.tipo === t || (t === 'poliza_seguro' && d.tipo === 'seguro_danos')))
  const vencidos = docs.filter(d => d.fecha_vencimiento && estadoDoc(d.fecha_vencimiento, d.avisar_dias).nivel === 0).length
  const porVencer = docs.filter(d => d.fecha_vencimiento && estadoDoc(d.fecha_vencimiento, d.avisar_dias).nivel === 1).length
  return { pct: Math.round((tiene.length / BASICOS_INMUEBLE.length) * 100), tiene: tiene.length, total: BASICOS_INMUEBLE.length, vencidos, porVencer }
}

function Anillo({ pct, rojo, tam = 56 }: { pct: number; rojo?: boolean; tam?: number }) {
  const r = tam / 2 - 5, c = 2 * Math.PI * r
  const color = rojo ? '#ef4444' : pct === 100 ? '#34d399' : '#F9B234'
  return (
    <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} className="shrink-0" role="img" aria-label={`Expediente ${pct}%`}>
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="5" />
      <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      <text x="50%" y="50%" dy=".35em" textAnchor="middle" fontSize={tam * 0.24} fontWeight={700} fill="currentColor" fontFamily="var(--font-display)">{pct}%</text>
    </svg>
  )
}

/** Inmuebles de las empresas con su expediente (escritura, predial, uso de suelo, protección civil…). */
export default function Inmuebles() {
  const { puedeEditar } = useAuth()
  const [lista, setLista] = useState<Inmueble[] | null>(null)
  const [docs, setDocs] = useState<DocMin[]>([])
  const [q, setQ] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [tipo, setTipo] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const nav = useNavigate()

  const cargar = () => {
    supabase.from('inmuebles').select('*, empresas(nombre,nombre_corto,color)').eq('activo', true).order('codigo').then(({ data }) => setLista((data as unknown as Inmueble[]) ?? []))
    supabase.from('documentos').select('inmueble_id,tipo,fecha_vencimiento,avisar_dias').eq('vigente', true).not('inmueble_id', 'is', null).then(({ data }) => setDocs((data as DocMin[]) ?? []))
  }
  useEffect(cargar, [])

  const vis = useMemo(() => (lista ?? []).filter(i => (!empresa || i.empresa_id === empresa) && (!tipo || i.tipo === tipo)
    && (!q || [i.codigo, i.nombre, i.clave_catastral, i.colonia, i.propietario].some(x => x?.toLowerCase().includes(q.toLowerCase())))), [lista, empresa, tipo, q])
  if (!lista) return <Cargando />
  const exps = new Map(lista.map(i => [i.id, expediente(docs.filter(d => d.inmueble_id === i.id))]))
  const completos = [...exps.values()].filter(e => e.pct === 100).length
  const conVencidos = [...exps.values()].filter(e => e.vencidos > 0).length
  const m2 = lista.reduce((s, i) => s + Number(i.superficie_terreno ?? 0), 0)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Inmuebles</h1>
          <p className="mt-1 text-sm text-stone-500">Terrenos, oficinas, bodegas, talleres, campamentos y casas del personal, con su expediente de documentos.</p>
        </div>
        {puedeEditar && <button className="btn-primario" onClick={() => setNuevo(true)}><Plus size={16} />Nuevo inmueble</button>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([[Landmark, 'Inmuebles', String(lista.length), false], [Ruler, 'm² de terreno', num(m2), false], [CheckCircle2, 'Expediente completo', `${completos} de ${lista.length}`, false], [AlertTriangle, 'Con documentos vencidos', String(conVencidos), conVencidos > 0]] as const).map(([I, t, v, rojo]) => (
          <div key={t} className={`tarjeta p-4 ${rojo ? '!border-red-200' : ''}`}><I size={18} className={rojo ? 'text-red-700' : 'text-marca'} /><p className={`cifra mt-2 text-2xl font-semibold sm:text-3xl ${rojo ? 'text-red-700' : ''}`}>{v}</p><p className="text-[11px] uppercase tracking-wider text-stone-500">{t}</p></div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, clave catastral, colonia…" /></div>
        <select className="campo !w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Empresa"><option value="">Todas las empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select>
        <select className="campo !w-auto" value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo"><option value="">Todos los tipos</option>{Object.entries(TIPOS_INM).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      </div>

      {vis.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin inmuebles" texto="Da de alta los terrenos, oficinas y bodegas para llevar su expediente y recibir avisos de predial, uso de suelo y protección civil." /></div> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {vis.map((i, k) => {
            const e = exps.get(i.id)!
            return (
              <Link key={i.id} to={`/inmuebles/${i.id}`} className={`tarjeta viva group min-w-0 animate-entrar overflow-hidden ${e.vencidos ? '!border-red-200' : ''}`} style={{ animationDelay: `${k * 30}ms` }}>
                <div className="relative h-32 overflow-hidden bg-gradient-to-br from-stone-100 to-transparent">
                  {i.foto ? <img src={i.foto} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-stone-300"><Building2 size={40} strokeWidth={1.2} /></div>}
                  <span className="absolute left-3 top-3 rounded-full bg-[#07080B]/80 px-2.5 py-0.5 text-[11px] font-medium text-tinta backdrop-blur">{TIPOS_INM[i.tipo]}</span>
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: i.empresas?.color ?? '#F9B234' }} />
                </div>
                <div className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-marca">{i.codigo}</p>
                    <p className="truncate font-medium">{i.nombre}</p>
                    <p className="truncate text-xs text-stone-500">{i.empresas?.nombre_corto || i.empresas?.nombre}{i.superficie_terreno ? ` · ${num(i.superficie_terreno)} m²` : ''}</p>
                    <p className="mt-1 text-[11px] text-stone-400">{e.tiene} de {e.total} documentos básicos{e.vencidos ? <span className="text-red-700"> · {e.vencidos} vencido{e.vencidos > 1 ? 's' : ''}</span> : e.porVencer ? <span className="text-amber-700"> · {e.porVencer} por vencer</span> : ''}</p>
                  </div>
                  <Anillo pct={e.pct} rojo={e.vencidos > 0} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
      {nuevo && <InmuebleModal onCerrar={() => setNuevo(false)} onListo={id => { setNuevo(false); nav(`/inmuebles/${id}`) }} />}
    </div>
  )
}

export function InmuebleDetalle() {
  const { id } = useParams()
  const { puedeEditar } = useAuth()
  const [i, setI] = useState<Inmueble | null | undefined>(undefined)
  const [docs, setDocs] = useState<Documento[]>([])
  const [editar, setEditar] = useState(false)
  const cargar = () => { supabase.from('inmuebles').select('*, empresas(nombre,nombre_corto,color)').eq('id', id!).maybeSingle().then(({ data }) => setI(data as unknown as Inmueble | null)) }
  useEffect(cargar, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (i === undefined) return <Cargando />
  if (!i) return <Aviso>No encontré este inmueble.</Aviso>
  const e = expediente(docs.filter(d => d.vigente))
  const datos: [string, string | null][] = [
    ['Tipo', TIPOS_INM[i.tipo]], ['Clasificación', i.clasificacion ? CLASIF[i.clasificacion] : null], ['Situación', i.situacion ? SITUACION[i.situacion] : null],
    ['Propietario', i.propietario], ['Clave catastral', i.clave_catastral], ['Terreno', i.superficie_terreno ? `${num(i.superficie_terreno)} m²` : null],
    ['Construcción', i.superficie_construccion ? `${num(i.superficie_construccion)} m²` : null], ['Entre calles', i.entre_calles], ['C.P.', i.cp],
  ]
  return (
    <div>
      <Link to="/inmuebles" className="mb-4 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-marca"><ArrowLeft size={15} />Inmuebles</Link>
      <div className="tarjeta relative mb-6 overflow-hidden">
        <div className="grid md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="relative h-48 bg-gradient-to-br from-stone-100 to-transparent md:h-full">
            {i.foto ? <img src={i.foto} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-stone-300"><Building2 size={56} strokeWidth={1.1} /></div>}
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-1" style={{ background: i.empresas?.color ?? '#F9B234' }} />
          </div>
          <div className="min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-marca">{i.codigo}</p>
                <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{i.nombre}</h1>
                <p className="mt-1 text-sm text-stone-500">{i.empresas?.nombre}</p>
                {direccion(i) && <p className="mt-2 flex items-start gap-1.5 text-sm text-stone-600"><MapPin size={15} className="mt-0.5 shrink-0 text-marca" />{direccion(i)}</p>}
              </div>
              <div className="flex items-center gap-3"><Anillo pct={e.pct} rojo={e.vencidos > 0} tam={72} /><span className="text-[11px] uppercase leading-tight tracking-wider text-stone-500">Expediente<br />básico</span></div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {datos.filter(([, v]) => v).map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[11px] uppercase tracking-wider text-stone-500">{k}</dt><dd className="truncate">{v}</dd></div>)}
            </dl>
            {i.servicios.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{SERVICIOS.filter(([k]) => i.servicios.includes(k)).map(([k, t, I]) => <span key={k} className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600"><I size={12} className="text-marca" />{t}</span>)}</div>}
            <div className="mt-5 flex flex-wrap gap-2">
              {i.latitud != null && <a className="btn-sec" href={linkMaps(i.latitud, i.longitud!)} target="_blank" rel="noreferrer"><ExternalLink size={15} />Ver en Google Maps</a>}
              {i.ubicacion_id && <Link className="btn-sec" to={`/activos?ubicacion=${i.ubicacion_id}`}><MapPin size={15} />Activos en este lugar</Link>}
              {puedeEditar && <button className="btn-sec" onClick={() => setEditar(true)}><Pencil size={15} />Editar</button>}
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        <DocumentosPanel empresaId={i.empresa_id} inmuebleId={i.id} onCambio={setDocs} />
        <aside className="h-fit space-y-4">
          <section className="tarjeta p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText size={16} className="text-marca" />Expediente básico</h2>
            <ul className="space-y-2">
              {BASICOS_INMUEBLE.map(t => {
                const d = docs.find(x => x.vigente && (x.tipo === t || (t === 'poliza_seguro' && x.tipo === 'seguro_danos')))
                const est = d ? estadoDoc(d.fecha_vencimiento, d.avisar_dias) : null
                const X = TIPOS_DOC[t]
                return (
                  <li key={t} className="flex items-center gap-2.5 text-sm">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${!d ? 'bg-stone-100 text-stone-400' : est!.nivel === 0 ? 'bg-red-50 text-red-700' : est!.nivel === 1 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><X.icono size={14} /></span>
                    <span className="min-w-0 flex-1 truncate">{X.texto}</span>
                    <span className={`text-[11px] ${!d ? 'text-stone-400' : est!.nivel === 0 ? 'text-red-700' : est!.nivel === 1 ? 'text-amber-700' : 'text-emerald-700'}`}>{!d ? 'Falta' : d.fecha_vencimiento ? est!.texto.replace('Vigente hasta ', 'hasta ') : 'Listo'}</span>
                  </li>
                )
              })}
            </ul>
          </section>
          {(i.colindancias || i.observaciones) && (
            <section className="tarjeta space-y-3 p-5 text-sm">
              {i.colindancias && <div><p className="text-[11px] uppercase tracking-wider text-stone-500">Colindancias</p><p className="whitespace-pre-line text-stone-600">{i.colindancias}</p></div>}
              {i.observaciones && <div><p className="text-[11px] uppercase tracking-wider text-stone-500">Observaciones</p><p className="whitespace-pre-line text-stone-600">{i.observaciones}</p></div>}
            </section>
          )}
        </aside>
      </div>
      {editar && <InmuebleModal inmueble={i} onCerrar={() => setEditar(false)} onListo={() => { setEditar(false); cargar() }} />}
    </div>
  )
}

function InmuebleModal({ inmueble, onCerrar, onListo }: { inmueble?: Inmueble; onCerrar: () => void; onListo: (id: string) => void }) {
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const { items: ubis } = useLista('ubicaciones', 'id,nombre,empresa_id')
  const base = { empresa_id: '', nombre: '', propietario: '', clave_catastral: '', superficie_terreno: '', superficie_construccion: '', calle: '', numero_ext: '', numero_int: '', manzana: '', lote: '', colonia: '',
    entre_calles: '', municipio: 'La Paz', estado: 'Baja California Sur', cp: '', tipo: 'terreno', clasificacion: 'urbana', situacion: '', colindancias: '', observaciones: '', ubicacion_id: '' }
  const [f, setF] = useState<Record<string, string>>(() => inmueble ? Object.fromEntries(Object.keys(base).map(k => [k, String((inmueble as unknown as Record<string, unknown>)[k] ?? '')])) : base)
  const [servicios, setServicios] = useState<string[]>(inmueble?.servicios ?? [])
  const [foto, setFoto] = useState<string | null>(inmueble?.foto ?? null)
  const [coord, setCoord] = useState(inmueble?.latitud != null ? `${inmueble.latitud}, ${inmueble.longitud}` : '')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!f.empresa_id && empresas.length) setF(x => ({ ...x, empresa_id: empresas[0].id })) }, [empresas, f.empresa_id])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }))
  const txt = (k: string, label: string, ph = '', cls = '') => <Campo label={label} className={cls}><input className="campo" value={f[k]} onChange={set(k)} placeholder={ph} /></Campo>

  async function guardar() {
    setError('')
    if (!f.nombre.trim()) return setError('Escribe el nombre del inmueble.')
    const c = coord.trim() ? coordenadasDe(coord) : null
    if (coord.trim() && !c) return setError('No entendí las coordenadas. Pega el enlace de Google Maps o los números (ej. 24.1426, -110.3128).')
    const datos: Record<string, unknown> = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]))
    datos.superficie_terreno = f.superficie_terreno ? Number(f.superficie_terreno) : null
    datos.superficie_construccion = f.superficie_construccion ? Number(f.superficie_construccion) : null
    Object.assign(datos, { servicios, foto, latitud: c?.lat ?? null, longitud: c?.lng ?? null, nombre: f.nombre.trim() })
    const r = inmueble ? await supabase.from('inmuebles').update(datos).eq('id', inmueble.id).select('id').single() : await supabase.from('inmuebles').insert(datos).select('id').single()
    if (r.error) return setError(mensajeError(r.error))
    onListo((r.data as { id: string }).id)
  }
  async function quitar() {
    const { error } = await supabase.from('inmuebles').update({ activo: false }).eq('id', inmueble!.id)
    if (error) return setError(mensajeError(error))
    location.hash = '#/inmuebles'
  }

  return (
    <Modal abierto titulo={inmueble ? `Editar ${inmueble.codigo}` : 'Nuevo inmueble'} onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <button onClick={() => input.current?.click()} className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl border border-dashed border-stone-300 hover:border-marca sm:w-44">
            {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full flex-col items-center justify-center gap-1 text-xs text-stone-400"><Camera size={22} />Foto del inmueble</span>}
          </button>
          <input ref={input} type="file" accept="image/*" hidden onChange={async e => { const a = e.target.files?.[0]; if (a) setFoto(await fotoProducto(a, 960)) }} />
          <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            {txt('nombre', 'Nombre *', 'Ej. Terreno El Centenario', 'sm:col-span-2')}
            <Campo label="Empresa"><select className="campo" value={f.empresa_id} onChange={set('empresa_id')}>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select></Campo>
            <Campo label="Tipo"><select className="campo" value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPOS_INM).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Clasificación"><select className="campo" value={f.clasificacion} onChange={set('clasificacion')}><option value="">—</option>{Object.entries(CLASIF).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
          <Campo label="Situación"><select className="campo" value={f.situacion} onChange={set('situacion')}><option value="">—</option>{Object.entries(SITUACION).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
          {txt('propietario', 'Propietario', 'A nombre de quién está')}
          {txt('clave_catastral', 'Clave catastral')}
          <Campo label="Terreno (m²)"><input className="campo cifra" type="number" min={0} value={f.superficie_terreno} onChange={set('superficie_terreno')} /></Campo>
          <Campo label="Construcción (m²)"><input className="campo cifra" type="number" min={0} value={f.superficie_construccion} onChange={set('superficie_construccion')} /></Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-6">
          {txt('calle', 'Calle', '', 'sm:col-span-3')}{txt('numero_ext', '# Ext.')}{txt('numero_int', '# Int.')}{txt('manzana', 'Manzana')}
          {txt('lote', 'Lote')}{txt('colonia', 'Colonia', '', 'sm:col-span-2')}{txt('cp', 'C.P.')}{txt('municipio', 'Municipio', '', 'sm:col-span-2')}
          {txt('entre_calles', 'Entre calles', '', 'sm:col-span-3')}{txt('estado', 'Estado', '', 'sm:col-span-3')}
        </div>
        <div>
          <span className="etiqueta">Servicios</span>
          <div className="flex flex-wrap gap-1.5">{SERVICIOS.map(([k, t, I]) => { const on = servicios.includes(k); return <button key={k} type="button" onClick={() => setServicios(s => on ? s.filter(x => x !== k) : [...s, k])} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${on ? 'border-marca bg-marca/10 text-marca' : 'border-stone-300 text-stone-600'}`}><I size={13} />{t}</button> })}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Ubicación en Google Maps"><input className="campo" value={coord} onChange={e => setCoord(e.target.value)} placeholder="Pega el enlace o 24.1426, -110.3128" /></Campo>
          <Campo label="También es lugar de activos (opcional)"><select className="campo" value={f.ubicacion_id} onChange={set('ubicacion_id')}><option value="">No</option>{ubis.filter(u => u.empresa_id === f.empresa_id).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
          <Campo label="Colindancias"><textarea className="campo" rows={2} value={f.colindancias} onChange={set('colindancias')} placeholder="Norte: 20 m con… Sur: …" /></Campo>
          <Campo label="Observaciones"><textarea className="campo" rows={2} value={f.observaciones} onChange={set('observaciones')} /></Campo>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex items-center justify-between gap-2">
          {inmueble ? <button className="text-sm text-stone-500 hover:text-red-700" onClick={quitar}>Ya no es de la empresa</button> : <span />}
          <div className="flex gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}>Guardar</button></div>
        </div>
      </div>
    </Modal>
  )
}
