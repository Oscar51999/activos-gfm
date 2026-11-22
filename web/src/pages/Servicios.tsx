import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, Plus, Search, Check, Pencil, FileSpreadsheet, FileText, Upload, Landmark } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, fecha } from '../lib/hooks'
import { libroExcel, descargar } from '../lib/excel'
import { pdfTabla } from '../lib/pdf'
import { Encabezado, Campo, Modal, Cargando, Vacio } from '../components/ui'
import { TIPOS_PAGO, PERIODOS, dinero, estadoPago, EditarPago, RegistrarPago, verComprobante, type Pago } from '../components/InmuebleExtras'
import { ImportarServicios } from '../components/Importadores'

export type Servicio = Pago & { inmueble: string; inmueble_codigo: string; empresa: string; dias_restantes: number }
const GRUPOS: { k: string; t: string; f: (d: number) => boolean; c: string }[] = [
  { k: 'vencidos', t: 'Vencidos', f: d => d < 0, c: 'text-red-700' },
  { k: 'semana', t: 'Esta semana', f: d => d >= 0 && d <= 7, c: 'text-amber-700' },
  { k: 'mes', t: 'En los próximos 30 días', f: d => d > 7 && d <= 30, c: '' },
  { k: 'despues', t: 'Más adelante', f: d => d > 30, c: 'text-stone-500' },
]

/** Todos los servicios por pagar de los inmuebles (luz, agua, predial, internet…), con su vencimiento, comprobante e historial. */
export default function Servicios() {
  const { puedeEditar } = useAuth()
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const { items: inmuebles } = useLista('inmuebles', 'id,nombre,codigo,empresa_id')
  const [lista, setLista] = useState<Servicio[] | null>(null)
  const [tab, setTab] = useState<'pendientes' | 'pagados'>('pendientes')
  const [q, setQ] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [inmueble, setInmueble] = useState('')
  const [tipo, setTipo] = useState('')
  const [pagar, setPagar] = useState<Servicio | null>(null)
  const [editar, setEditar] = useState<Partial<Servicio> | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [importar, setImportar] = useState(false)
  const [n, setN] = useState(0)

  useEffect(() => {
    setLista(null)
    supabase.from('v_servicios_inmuebles').select('*').eq('pagado', tab === 'pagados').order(tab === 'pagados' ? 'pagado_at' : 'fecha_limite', { ascending: tab !== 'pagados' }).limit(2000)
      .then(({ data }) => setLista((data as Servicio[]) ?? []))
  }, [tab, n])

  const vis = useMemo(() => (lista ?? []).filter(s => (!empresa || s.empresa_id === empresa) && (!inmueble || s.inmueble_id === inmueble) && (!tipo || s.tipo === tipo)
    && (!q || `${s.concepto} ${s.inmueble} ${s.proveedor ?? ''} ${s.cuenta ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [lista, empresa, inmueble, tipo, q])
  const conteo = (k: string) => vis.filter(s => GRUPOS.find(g => g.k === k)!.f(s.dias_restantes)).length
  const recargar = () => setN(x => x + 1)

  const cols = [
    { titulo: 'Servicio', valor: (s: Servicio) => s.concepto, ancho: 24 }, { titulo: 'Tipo', valor: (s: Servicio) => TIPOS_PAGO[s.tipo]?.t ?? s.tipo, ancho: 16 },
    { titulo: 'Inmueble', valor: (s: Servicio) => s.inmueble, ancho: 28 }, { titulo: 'Empresa', valor: (s: Servicio) => s.empresa, ancho: 18 },
    { titulo: 'A quién se paga', valor: (s: Servicio) => s.proveedor ?? '', ancho: 16 }, { titulo: 'No. de servicio', valor: (s: Servicio) => s.cuenta ?? '', ancho: 16 },
    { titulo: 'Cada cuándo', valor: (s: Servicio) => PERIODOS[s.periodicidad]?.[0] ?? '', ancho: 12 }, { titulo: 'Vence', valor: (s: Servicio) => fecha(s.fecha_limite), ancho: 12 },
    ...(tab === 'pagados' ? [{ titulo: 'Pagado', valor: (s: Servicio) => fecha(s.pagado_at), ancho: 12 }, { titulo: 'Referencia', valor: (s: Servicio) => s.referencia_pago ?? '', ancho: 16 }]
      : [{ titulo: 'Estado', valor: (s: Servicio) => estadoPago(s).t, ancho: 18 }]),
    { titulo: 'Monto aprox.', valor: (s: Servicio) => dinero(s.monto), ancho: 12 },
  ]
  const excel = () => descargar(libroExcel<Servicio>([{ nombre: tab === 'pagados' ? 'Pagados' : 'Por pagar', titulo: `Servicios de inmuebles · ${tab === 'pagados' ? 'pagados' : 'por pagar'}`, columnas: cols, filas: vis }]), `servicios-${tab}.xlsx`)
  const pdf = () => pdfTabla<Servicio>({ titulo: tab === 'pagados' ? 'Servicios pagados' : 'Servicios por pagar', subtitulo: `${vis.length} servicio(s) de inmuebles`, horizontal: true, nombre: `servicios-${tab}`,
    columnas: cols.filter(c => !['Empresa', 'Monto aprox.'].includes(c.titulo)), filas: vis,
    grupos: tab === 'pendientes' ? GRUPOS.map(g => ({ titulo: g.t, filas: vis.filter(s => g.f(s.dias_restantes)) })) : undefined })

  const fila = (s: Servicio) => {
    const T = TIPOS_PAGO[s.tipo] ?? TIPOS_PAGO.otro, e = estadoPago(s)
    return (
      <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-marca/10 text-marca"><T.i size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{s.concepto} <Link to={`/inmuebles/${s.inmueble_id}`} className="font-normal text-stone-500 hover:text-marca">· {s.inmueble}</Link></p>
          <p className="truncate text-xs text-stone-500">{[s.empresa, s.proveedor, s.cuenta && `No. ${s.cuenta}`, PERIODOS[s.periodicidad]?.[0], dinero(s.monto)].filter(Boolean).join(' · ')}</p>
        </div>
        {tab === 'pagados' ? (
          <span className="flex items-center gap-2 text-xs text-emerald-700">Pagado {fecha(s.pagado_at)}{s.referencia_pago ? ` · Ref. ${s.referencia_pago}` : ''}{s.comprobante && <button className="text-marca underline" onClick={() => verComprobante(s.comprobante!)}>Comprobante</button>}</span>
        ) : <>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${e.c}`}>{e.t}</span>
          {puedeEditar && <>
            <button className="btn-sec !px-2.5 !py-1.5 text-xs" onClick={() => setPagar(s)}><Check size={14} />Pagado</button>
            <button className="rounded p-1 text-stone-400 hover:text-tinta" onClick={() => setEditar(s)} aria-label="Editar"><Pencil size={14} /></button>
          </>}
        </>}
      </li>
    )
  }

  return (
    <div>
      <Encabezado titulo="Servicios por pagar" sub="Luz, agua, predial, internet y demás servicios de cada inmueble: qué vence, qué ya se pagó y su comprobante."
        acciones={<>
          <button className="btn-sec" onClick={excel} disabled={!vis.length}><FileSpreadsheet size={16} />Excel</button>
          <button className="btn-sec" onClick={pdf} disabled={!vis.length}><FileText size={16} />PDF</button>
          {puedeEditar && <button className="btn-sec" onClick={() => setImportar(true)}><Upload size={16} />Importar Excel</button>}
          {puedeEditar && <button className="btn-primario" onClick={() => setNuevo(true)}><Plus size={16} />Agregar servicio</button>}
        </>} />

      {tab === 'pendientes' && lista && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {GRUPOS.map(g => <div key={g.k} className="tarjeta p-4"><p className="text-[11px] uppercase tracking-wider text-stone-500">{g.t}</p><p className={`cifra text-3xl font-semibold ${conteo(g.k) ? g.c : ''}`}>{conteo(g.k)}</p></div>)}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex overflow-hidden rounded-xl border border-stone-200 text-sm">
          {([['pendientes', 'Por pagar'], ['pagados', 'Pagados']] as const).map(([k, t]) => <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 ${tab === k ? 'bg-marca/15 text-marca' : 'text-stone-500 hover:bg-stone-100'}`}>{t}</button>)}
        </div>
        <div className="relative min-w-[200px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !pl-9" placeholder="Buscar servicio, inmueble, cuenta…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="campo !w-auto" value={empresa} onChange={e => { setEmpresa(e.target.value); setInmueble('') }}><option value="">Todas las empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select>
        <select className="campo !w-auto" value={inmueble} onChange={e => setInmueble(e.target.value)}><option value="">Todos los inmuebles</option>{inmuebles.filter(i => !empresa || i.empresa_id === empresa).map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select>
        <select className="campo !w-auto" value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos los servicios</option>{Object.entries(TIPOS_PAGO).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select>
      </div>

      {!lista ? <Cargando /> : vis.length === 0 ? <div className="tarjeta"><Vacio titulo={tab === 'pagados' ? 'Sin pagos registrados' : 'No hay servicios por pagar'} texto="Agrega los servicios de cada inmueble aquí o desde la ficha del inmueble (botón Servicios del inmueble)."
        accion={puedeEditar && tab === 'pendientes' ? <button className="btn-primario" onClick={() => setNuevo(true)}><Plus size={16} />Agregar servicio</button> : undefined} /></div>
        : tab === 'pendientes' ? (
          <div className="space-y-4">
            {GRUPOS.map(g => { const xs = vis.filter(s => g.f(s.dias_restantes)); return xs.length ? (
              <section key={g.k}><h2 className={`mb-2 text-sm font-semibold ${g.c}`}>{g.t} <span className="text-stone-400">· {xs.length}</span></h2><ul className="tarjeta divide-y divide-stone-200">{xs.map(fila)}</ul></section>
            ) : null })}
          </div>
        ) : <ul className="tarjeta divide-y divide-stone-200">{vis.map(fila)}</ul>}

      {pagar && <RegistrarPago pago={pagar} onCerrar={() => setPagar(null)} onListo={() => { setPagar(null); recargar() }} />}
      {editar && <EditarPago pago={editar} inmuebleId={editar.inmueble_id!} empresaId={editar.empresa_id!} onCerrar={() => setEditar(null)} onListo={() => { setEditar(null); recargar() }} />}
      {nuevo && <ElegirInmueble inmuebles={inmuebles as unknown as { id: string; nombre: string; codigo: string; empresa_id: string }[]} onCerrar={() => setNuevo(false)} onElegir={i => { setNuevo(false); setEditar({ inmueble_id: i.id, empresa_id: i.empresa_id, tipo: 'luz', periodicidad: 'bimestral', fecha_limite: new Date().toISOString().slice(0, 10) }) }} />}
      {importar && <ImportarServicios abierto onCerrar={() => setImportar(false)} onListo={() => { setImportar(false); recargar() }} />}
    </div>
  )
}

function ElegirInmueble({ inmuebles, onCerrar, onElegir }: { inmuebles: { id: string; nombre: string; codigo: string; empresa_id: string }[]; onCerrar: () => void; onElegir: (i: { id: string; empresa_id: string }) => void }) {
  const [id, setId] = useState('')
  return (
    <Modal abierto titulo="¿De qué inmueble es el servicio?" onCerrar={onCerrar} ancho="max-w-md">
      {inmuebles.length === 0 ? <p className="text-sm text-stone-500">Primero registra el inmueble en <Link to="/inmuebles" className="text-marca underline">Inmuebles</Link>.</p> : <>
        <Campo label="Inmueble"><select className="campo" value={id} onChange={e => setId(e.target.value)}><option value="">— Elige —</option>{inmuebles.map(i => <option key={i.id} value={i.id}>{i.codigo} · {i.nombre}</option>)}</select></Campo>
        <div className="mt-4 flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={!id} onClick={() => onElegir(inmuebles.find(i => i.id === id)!)}><Landmark size={15} />Seguir</button></div>
      </>}
    </Modal>
  )
}

/** Tarjeta del tablero: lo que vence en los próximos días. */
export function ServiciosProximos() {
  const { puedeEditar } = useAuth()
  const [lista, setLista] = useState<Servicio[] | null>(null)
  const [pagar, setPagar] = useState<Servicio | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    const en15 = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10)
    supabase.from('v_servicios_inmuebles').select('*').eq('pagado', false).lte('fecha_limite', en15).order('fecha_limite').limit(8).then(({ data }) => setLista((data as Servicio[]) ?? []))
  }, [n])
  return (
    <section className="tarjeta p-5">
      <h2 className="mb-3 flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><Receipt size={15} className="text-marca" />Servicios por pagar · próximos 15 días</span><Link to="/servicios" className="text-[11px] font-normal text-marca hover:underline">Ver todos</Link></h2>
      {!lista ? <p className="text-xs text-stone-500">Cargando…</p> : lista.length === 0 ? <p className="text-sm text-stone-500">Nada por vencer en los próximos 15 días.</p> : (
        <ul className="grid gap-2 md:grid-cols-2">
          {lista.map(s => { const T = TIPOS_PAGO[s.tipo] ?? TIPOS_PAGO.otro, e = estadoPago(s); return (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-marca/10 text-marca"><T.i size={15} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{s.concepto} · {s.inmueble}</span><span className={`block text-[11px] ${e.c.includes('red') ? 'text-red-700' : e.c.includes('amber') ? 'text-amber-700' : 'text-stone-500'}`}>{e.t}</span></span>
              {puedeEditar && <button className="btn-sec !px-2 !py-1 text-[11px]" onClick={() => setPagar(s)}><Check size={12} />Pagado</button>}
            </li>
          ) })}
        </ul>
      )}
      {pagar && <RegistrarPago pago={pagar} onCerrar={() => setPagar(null)} onListo={() => { setPagar(null); setN(x => x + 1) }} />}
    </section>
  )
}
