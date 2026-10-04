import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Warehouse, PackagePlus, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, ArrowRightLeft, Search, AlertTriangle, Camera, Pencil, HardHat, History, Package } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, nombreEmpleado } from '../lib/hooks'
import { fotoProducto } from '../lib/logos'
import { Cargando, Vacio, Aviso, Modal, Campo } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import { type Consumible, type Existencia, CATEGORIAS_CONS, UNIDADES, num, plural, totales } from '../lib/almacen'

type Mov = { id: string; tipo: 'entrada' | 'salida' | 'ajuste'; cantidad: number; notas: string | null; created_at: string; empresa_id: string; solicitud_id: string | null
  consumibles: { nombre: string; unidad: string } | null; empleados: { nombres: string; apellidos: string | null } | null; ubicaciones: { nombre: string } | null; empresas: { nombre: string; nombre_corto: string | null } | null }
type Accion = 'entrada' | 'salida' | 'ajuste' | 'traspaso'
const ACCIONES: Record<Accion, { texto: string; icono: typeof ArrowDownToLine; ayuda: string }> = {
  entrada: { texto: 'Entrada', icono: ArrowDownToLine, ayuda: 'Llegó material al almacén.' },
  salida: { texto: 'Entregar', icono: ArrowUpFromLine, ayuda: 'Se entrega a un empleado o se manda a obra. Queda en su expediente.' },
  traspaso: { texto: 'Mover', icono: ArrowRightLeft, ayuda: 'Pasa de un lugar a otro de la misma empresa.' },
  ajuste: { texto: 'Ajustar', icono: SlidersHorizontal, ayuda: 'Escribe lo que contaste y se corrige la diferencia.' },
}
const TIPO_MOV = { entrada: ['Entrada', 'text-emerald-700'], salida: ['Salida', 'text-amber-700'], ajuste: ['Ajuste', 'text-sky-700'] } as const

/** Almacén de consumibles: artículos sin número de serie que se controlan por cantidad (cascos, chalecos, brocas, discos…). */
export default function Almacen() {
  const { puedeEditar, puedeResguardar } = useAuth()
  const [qs, setQs] = useSearchParams()
  const tab = (qs.get('tab') as 'existencias' | 'catalogo' | 'movimientos') || 'existencias'
  const [empresa, setEmpresa] = useState(qs.get('empresa') ?? '')
  const [buscar, setBuscar] = useState('')
  const [soloBajo, setSoloBajo] = useState(qs.get('bajo') === '1')
  const [cons, setCons] = useState<Consumible[] | null>(null)
  const [ex, setEx] = useState<Existencia[]>([])
  const [movs, setMovs] = useState<Mov[]>([])
  const [mov, setMov] = useState<{ accion: Accion; consumible?: string; ubicacion?: string | null; empresa?: string } | null>(null)
  const [editar, setEditar] = useState<Consumible | 'nuevo' | null>(null)
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto,color')

  const cargar = () => {
    supabase.from('consumibles').select('*').eq('activo', true).order('nombre').then(({ data }) => setCons((data as Consumible[]) ?? []))
    supabase.from('v_existencias').select('*').then(({ data }) => setEx((data as Existencia[]) ?? []))
    supabase.from('movimientos_consumible').select('*, consumibles(nombre,unidad), empleados(nombres,apellidos), ubicaciones(nombre), empresas(nombre,nombre_corto)').order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => setMovs((data as unknown as Mov[]) ?? []))
  }
  useEffect(cargar, [])

  const exE = useMemo(() => ex.filter(e => !empresa || e.empresa_id === empresa), [ex, empresa])
  const tot = useMemo(() => totales(exE), [exE])
  const bajos = tot.filter(t => t.minimo > 0 && t.total < t.minimo)

  if (!cons) return <Cargando />
  const q = buscar.trim().toLowerCase()
  const visibles = cons.filter(c => !q || [c.nombre, c.categoria, c.marca].some(x => x?.toLowerCase().includes(q)))
    .filter(c => !soloBajo || bajos.some(b => b.consumible_id === c.id))
  const cambiarTab = (t: string) => { const n = new URLSearchParams(qs); n.set('tab', t); setQs(n, { replace: true }) }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Almacén</h1>
          <p className="mt-1 text-sm text-stone-500">Material que se controla por cantidad, sin número de serie: EPP, brocas, discos, consumibles de obra.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeEditar && <button className="btn-sec" onClick={() => setEditar('nuevo')}><PackagePlus size={16} />Nuevo artículo</button>}
          {puedeResguardar && <button className="btn-primario" onClick={() => setMov({ accion: 'entrada', empresa: empresa || undefined })}><ArrowDownToLine size={16} />Registrar entrada</button>}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador icono={Package} titulo="Artículos" valor={cons.length} />
        <Indicador icono={Warehouse} titulo="Lugares con existencia" valor={new Set(exE.filter(e => Number(e.existencia) > 0).map(e => e.ubicacion_id ?? 'x')).size} />
        <button onClick={() => { setSoloBajo(!soloBajo); cambiarTab('existencias') }} className="text-left">
          <Indicador icono={AlertTriangle} titulo="Bajo mínimo" valor={bajos.length} rojo={bajos.length > 0} activo={soloBajo} />
        </button>
        <Indicador icono={ArrowUpFromLine} titulo="Entregas este mes" valor={movs.filter(m => m.tipo === 'salida' && m.created_at.slice(0, 7) === new Date().toISOString().slice(0, 7) && (!empresa || m.empresa_id === empresa)).length} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-2xl border border-stone-200 bg-stone-50 p-1">
          {([['existencias', 'Existencias'], ['catalogo', 'Artículos'], ['movimientos', 'Movimientos']] as const).map(([k, t]) => (
            <button key={k} onClick={() => cambiarTab(k)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${tab === k ? 'bg-marca text-[#120D04]' : 'text-stone-500 hover:text-tinta'}`}>{t}</button>
          ))}
        </div>
        <select className="campo !w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}
        </select>
        {tab !== 'movimientos' && <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="campo !pl-9" placeholder="Buscar casco, broca, disco…" value={buscar} onChange={e => setBuscar(e.target.value)} />
        </div>}
      </div>

      {bajos.length > 0 && tab === 'existencias' && !soloBajo && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} />
          <span className="min-w-0 flex-1">{bajos.slice(0, 3).map(b => `${b.nombre} (${b.empresa}: ${num(b.total)} de ${num(b.minimo)})`).join(' · ')}{bajos.length > 3 ? ` y ${bajos.length - 3} más` : ''}</span>
          <button className="text-xs font-medium underline" onClick={() => setSoloBajo(true)}>Ver solo estos</button>
        </div>
      )}

      {tab === 'existencias' && (visibles.length === 0
        ? <div className="tarjeta"><Vacio titulo={soloBajo ? 'Nada bajo mínimo' : 'Sin artículos'} texto={soloBajo ? 'Todo está por arriba de su mínimo.' : 'Da de alta los artículos que se controlan por cantidad.'} /></div>
        : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c, i) => {
            const lugares = exE.filter(e => e.consumible_id === c.id && Number(e.existencia) !== 0)
            const total = lugares.reduce((s, e) => s + Number(e.existencia), 0)
            const porEmp = tot.filter(t => t.consumible_id === c.id)
            const bajo = porEmp.some(t => t.minimo > 0 && t.total < t.minimo)
            const pct = c.minimo > 0 ? Math.min(100, (total / (c.minimo * Math.max(1, porEmp.length) * 2)) * 100) : 100
            return (
              <article key={c.id} className={`tarjeta viva min-w-0 animate-entrar p-4 ${bajo ? '!border-red-200' : ''}`} style={{ animationDelay: `${i * 25}ms` }}>
                <div className="flex gap-3">
                  <FotoActivo fotoModelo={c.foto} categoria={c.categoria === 'EPP' ? 'seguridad' : 'herramienta'} className="h-16 w-16 shrink-0 rounded-xl" icono={22} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.nombre}</p>
                    <p className="truncate text-xs text-stone-500">{[c.categoria, c.marca].filter(Boolean).join(' · ') || '—'}</p>
                    <p className="mt-1 flex items-baseline gap-1.5"><span className={`cifra text-2xl font-semibold ${bajo ? 'text-red-700' : ''}`}>{num(total)}</span><span className="text-xs text-stone-500">{plural(c.unidad, total)}</span>
                      {c.minimo > 0 && <span className="ml-auto text-[11px] text-stone-400">mín. {num(c.minimo)} por empresa</span>}</p>
                  </div>
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${bajo ? 'bg-red-500' : 'bg-marca'}`} style={{ width: `${pct}%` }} /></div>
                <ul className="mt-3 space-y-1 text-xs">
                  {lugares.length === 0 && <li className="text-stone-400">Sin existencia registrada</li>}
                  {lugares.slice(0, 4).map(l => (
                    <li key={(l.ubicacion_id ?? '') + l.empresa_id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-stone-600">{l.ubicacion ?? 'Sin lugar'} <span className="text-stone-400">· {l.empresa}</span></span>
                      <span className="cifra font-medium">{num(l.existencia)}</span>
                      {puedeResguardar && <button title="Entregar desde aquí" className="rounded p-0.5 text-stone-400 hover:text-marca" onClick={() => setMov({ accion: 'salida', consumible: c.id, ubicacion: l.ubicacion_id, empresa: l.empresa_id })}><ArrowUpFromLine size={13} /></button>}
                    </li>
                  ))}
                  {lugares.length > 4 && <li className="text-stone-400">y {lugares.length - 4} lugares más</li>}
                </ul>
                {puedeResguardar && (
                  <div className="mt-3 flex flex-wrap gap-1 border-t border-stone-200 pt-3">
                    {(Object.keys(ACCIONES) as Accion[]).map(a => { const A = ACCIONES[a]; return (
                      <button key={a} className="btn-sec !px-2.5 !py-1.5 text-xs" onClick={() => setMov({ accion: a, consumible: c.id, empresa: empresa || lugares[0]?.empresa_id, ubicacion: lugares[0]?.ubicacion_id })}><A.icono size={13} />{A.texto}</button>
                    ) })}
                  </div>
                )}
              </article>
            )
          })}
        </div>)}

      {tab === 'catalogo' && (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-wider text-stone-500"><th className="p-3">Artículo</th><th className="p-3">Categoría</th><th className="p-3">Unidad</th><th className="p-3 text-right">Mínimo por empresa</th><th className="p-3 text-right">Existencia</th><th className="p-3" /></tr></thead>
            <tbody>
              {visibles.map(c => (
                <tr key={c.id} className="border-b border-stone-100 last:border-0">
                  <td className="p-3"><span className="flex items-center gap-3"><FotoActivo fotoModelo={c.foto} className="h-9 w-9 shrink-0 rounded-lg" icono={15} /><span className="min-w-0"><span className="block truncate font-medium">{c.nombre}</span><span className="block text-xs text-stone-500">{c.marca}</span></span></span></td>
                  <td className="p-3 text-stone-600">{c.categoria ?? '—'}</td>
                  <td className="p-3 text-stone-600">{c.unidad}</td>
                  <td className="cifra p-3 text-right">{num(c.minimo)}</td>
                  <td className="cifra p-3 text-right">{num(exE.filter(e => e.consumible_id === c.id).reduce((s, e) => s + Number(e.existencia), 0))}</td>
                  <td className="p-3 text-right">{puedeEditar && <button className="rounded p-1 text-stone-400 hover:text-marca" onClick={() => setEditar(c)} aria-label="Editar"><Pencil size={15} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'movimientos' && (() => {
        const lista = movs.filter(m => !empresa || m.empresa_id === empresa)
        return lista.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin movimientos" texto="Aquí verás entradas, entregas y ajustes." /></div> : (
          <div className="tarjeta divide-y divide-stone-100">
            {lista.map(m => { const [t, cl] = TIPO_MOV[m.tipo]; const signo = m.tipo === 'salida' ? -1 : 1; return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className={`w-16 shrink-0 text-xs font-medium uppercase ${cl}`}>{t}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.consumibles?.nombre}</span>
                  <span className="block truncate text-xs text-stone-500">{[m.ubicaciones?.nombre, m.empresas?.nombre_corto || m.empresas?.nombre, m.empleados ? `para ${nombreEmpleado(m.empleados)}` : null, m.notas].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={`cifra text-base font-semibold ${signo * m.cantidad < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{signo * m.cantidad > 0 ? '+' : ''}{num(signo * m.cantidad)}</span>
                <span className="w-24 text-right text-[11px] text-stone-400">{new Date(m.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
              </div>
            ) })}
          </div>
        )
      })()}

      {mov && <MovimientoConsumible inicial={mov} consumibles={cons} existencias={ex} onCerrar={() => setMov(null)} onListo={() => { setMov(null); cargar() }} />}
      {editar && <ConsumibleModal consumible={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} onListo={() => { setEditar(null); cargar() }} />}
    </div>
  )
}

function Indicador({ icono: I, titulo, valor, rojo, activo }: { icono: typeof Package; titulo: string; valor: number; rojo?: boolean; activo?: boolean }) {
  return (
    <div className={`tarjeta h-full p-4 ${rojo ? '!border-red-200' : ''} ${activo ? 'ring-2 ring-marca/40' : ''}`}>
      <I size={18} className={rojo ? 'text-red-700' : 'text-marca'} />
      <p className={`cifra mt-2 text-3xl font-semibold ${rojo ? 'text-red-700' : ''}`}>{valor}</p>
      <p className="text-[11px] uppercase tracking-wider text-stone-500">{titulo}</p>
    </div>
  )
}

/** Entrada, entrega, traspaso o ajuste de un consumible. */
export function MovimientoConsumible({ inicial, consumibles, existencias, onCerrar, onListo }: {
  inicial: { accion: Accion; consumible?: string; ubicacion?: string | null; empresa?: string; empleado?: string }
  consumibles: Consumible[]; existencias: Existencia[]; onCerrar: () => void; onListo: () => void
}) {
  const [accion, setAccion] = useState<Accion>(inicial.accion)
  const [consumible, setConsumible] = useState(inicial.consumible ?? '')
  const [empresa, setEmpresa] = useState(inicial.empresa ?? '')
  const [ubicacion, setUbicacion] = useState(inicial.ubicacion ?? '')
  const [destino, setDestino] = useState('')
  const [empleado, setEmpleado] = useState(inicial.empleado ?? '')
  const [cantidad, setCantidad] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const { items: ubis } = useLista('ubicaciones', 'id,nombre,empresa_id,tipo')
  const { items: emps } = useLista('empleados', 'id,nombre:nombres,apellidos,empresa_id,puesto', 'nombres')
  useEffect(() => { if (!empresa && empresas.length) setEmpresa(empresas[0].id) }, [empresas, empresa])

  const c = consumibles.find(x => x.id === consumible)
  const hay = (u: string) => existencias.filter(e => e.consumible_id === consumible && e.empresa_id === empresa && (e.ubicacion_id ?? '') === u).reduce((s, e) => s + Number(e.existencia), 0)
  const disponible = hay(ubicacion)
  const ubisE = ubis.filter(u => u.empresa_id === empresa)
  const n = Number(cantidad)
  const A = ACCIONES[accion]

  async function guardar() {
    setError('')
    if (!c) return setError('Elige el artículo.')
    if (!empresa) return setError('Elige la empresa.')
    if (!(n >= 0) || cantidad === '' || (accion !== 'ajuste' && n <= 0)) return setError('Escribe una cantidad válida.')
    if ((accion === 'salida' || accion === 'traspaso') && n > disponible) return setError(`Solo hay ${num(disponible)} ${plural(c.unidad, disponible)} en ese lugar.`)
    if (accion === 'traspaso' && (!destino || destino === ubicacion)) return setError('Elige un destino distinto.')
    const base = { consumible_id: c.id, empresa_id: empresa, ubicacion_id: ubicacion || null, notas: notas || null }
    let filas: Record<string, unknown>[] = []
    if (accion === 'entrada') filas = [{ ...base, tipo: 'entrada', cantidad: n }]
    if (accion === 'salida') filas = [{ ...base, tipo: 'salida', cantidad: n, empleado_id: empleado || null }]
    if (accion === 'traspaso') filas = [{ ...base, tipo: 'salida', cantidad: n, notas: `Traspaso a ${ubis.find(u => u.id === destino)?.nombre}${notas ? ' · ' + notas : ''}` }, { ...base, ubicacion_id: destino, tipo: 'entrada', cantidad: n, notas: `Traspaso desde ${ubis.find(u => u.id === ubicacion)?.nombre ?? 'sin lugar'}${notas ? ' · ' + notas : ''}` }]
    if (accion === 'ajuste') { const dif = n - disponible; if (dif === 0) return onListo(); filas = [{ ...base, tipo: 'ajuste', cantidad: dif, notas: `Conteo: ${num(n)} (antes ${num(disponible)})${notas ? ' · ' + notas : ''}` }] }
    setGuardando(true)
    const { error } = await supabase.from('movimientos_consumible').insert(filas)
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    onListo()
  }

  return (
    <Modal abierto titulo={`${A.texto} material`} onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-1 rounded-2xl border border-stone-200 bg-stone-50 p-1">
          {(Object.keys(ACCIONES) as Accion[]).map(a => { const X = ACCIONES[a]; return (
            <button key={a} onClick={() => setAccion(a)} className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-xs font-medium transition ${accion === a ? 'bg-marca text-[#120D04]' : 'text-stone-500 hover:text-tinta'}`}><X.icono size={16} />{X.texto}</button>
          ) })}
        </div>
        <p className="text-xs text-stone-500">{A.ayuda}</p>
        <Campo label="Artículo">
          <select className="campo" value={consumible} onChange={e => setConsumible(e.target.value)}>
            <option value="">Elige…</option>
            {consumibles.map(x => <option key={x.id} value={x.id}>{x.nombre}{x.marca ? ` · ${x.marca}` : ''}</option>)}
          </select>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Empresa">
            <select className="campo" value={empresa} onChange={e => { setEmpresa(e.target.value); setUbicacion(''); setDestino(''); setEmpleado('') }}>
              {empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}
            </select>
          </Campo>
          <Campo label={accion === 'traspaso' ? 'Desde' : accion === 'entrada' ? '¿A dónde llega?' : 'Lugar'}>
            <select className="campo" value={ubicacion} onChange={e => setUbicacion(e.target.value)}>
              <option value="">Sin lugar</option>
              {ubisE.map(u => <option key={u.id} value={u.id}>{u.nombre}{c ? ` (${num(hay(u.id))})` : ''}</option>)}
            </select>
          </Campo>
        </div>
        {accion === 'traspaso' && <Campo label="Hacia"><select className="campo" value={destino} onChange={e => setDestino(e.target.value)}><option value="">Elige…</option>{ubisE.filter(u => u.id !== ubicacion).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>}
        {accion === 'salida' && <Campo label="¿A quién se entrega? (opcional)"><select className="campo" value={empleado} onChange={e => setEmpleado(e.target.value)}><option value="">A la obra / sin persona</option>{emps.filter(x => x.empresa_id === empresa).map(x => <option key={x.id} value={x.id}>{x.nombre} {x.apellidos as string}{x.puesto ? ` · ${x.puesto}` : ''}</option>)}</select></Campo>}
        <Campo label={accion === 'ajuste' ? '¿Cuántos contaste?' : 'Cantidad'}>
          <div className="flex items-center gap-2">
            <input className="campo cifra !text-lg" type="number" min={0} step="any" inputMode="decimal" value={cantidad} onChange={e => setCantidad(e.target.value)} autoFocus />
            <span className="shrink-0 text-sm text-stone-500">{c ? plural(c.unidad, n || 2) : ''}</span>
          </div>
          {c && accion !== 'entrada' && <span className="mt-1 block text-xs text-stone-500">Hay {num(disponible)} en este lugar{accion === 'ajuste' && cantidad !== '' ? ` · diferencia ${n - disponible > 0 ? '+' : ''}${num(n - disponible)}` : ''}</span>}
        </Campo>
        <Campo label="Notas"><input className="campo" value={notas} onChange={e => setNotas(e.target.value)} placeholder={accion === 'entrada' ? 'Ej. Remisión 4521' : 'Opcional'} /></Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando} onClick={guardar}><A.icono size={16} />{guardando ? 'Guardando…' : A.texto}</button></div>
      </div>
    </Modal>
  )
}

function ConsumibleModal({ consumible, onCerrar, onListo }: { consumible: Consumible | null; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({ nombre: consumible?.nombre ?? '', categoria: consumible?.categoria ?? 'EPP', unidad: consumible?.unidad ?? 'pieza', marca: consumible?.marca ?? '', minimo: String(consumible?.minimo ?? 0), foto: consumible?.foto ?? null as string | null })
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  async function guardar() {
    if (!f.nombre.trim()) return setError('Escribe el nombre.')
    const datos = { nombre: f.nombre.trim(), categoria: f.categoria || null, unidad: f.unidad, marca: f.marca || null, minimo: Number(f.minimo) || 0, foto: f.foto }
    const { error } = consumible ? await supabase.from('consumibles').update(datos).eq('id', consumible.id) : await supabase.from('consumibles').insert(datos)
    if (error) return setError(mensajeError(error))
    onListo()
  }
  async function quitar() {
    const { error } = await supabase.from('consumibles').update({ activo: false }).eq('id', consumible!.id)
    if (error) return setError(mensajeError(error))
    onListo()
  }
  return (
    <Modal abierto titulo={consumible ? 'Editar artículo' : 'Nuevo artículo de almacén'} onCerrar={onCerrar} ancho="max-w-lg">
      <div className="space-y-4">
        <div className="flex gap-4">
          <button onClick={() => input.current?.click()} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-dashed border-stone-300 hover:border-marca">
            {f.foto ? <img src={f.foto} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-stone-400"><Camera size={22} /></span>}
          </button>
          <input ref={input} type="file" accept="image/*" hidden onChange={async e => { const a = e.target.files?.[0]; if (a) setF({ ...f, foto: await fotoProducto(a, 480) }) }} />
          <div className="min-w-0 flex-1 space-y-3">
            <Campo label="Nombre"><input className="campo" value={f.nombre} onChange={set('nombre')} placeholder="Ej. Casco de seguridad blanco" autoFocus /></Campo>
            <Campo label="Marca"><input className="campo" value={f.marca} onChange={set('marca')} placeholder="Opcional" /></Campo>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Campo label="Categoría"><select className="campo" value={f.categoria} onChange={set('categoria')}>{CATEGORIAS_CONS.map(x => <option key={x}>{x}</option>)}</select></Campo>
          <Campo label="Unidad"><select className="campo" value={f.unidad} onChange={set('unidad')}>{UNIDADES.map(x => <option key={x}>{x}</option>)}</select></Campo>
          <Campo label="Mínimo"><input className="campo cifra" type="number" min={0} value={f.minimo} onChange={set('minimo')} /></Campo>
        </div>
        <p className="text-xs text-stone-500"><HardHat size={12} className="mr-1 inline" />El mínimo se cuida por empresa: si una empresa baja de esa cantidad, sale el aviso en el tablero.</p>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-between gap-2">
          {consumible ? <button className="text-sm text-stone-500 hover:text-red-700" onClick={quitar}>Ya no se maneja</button> : <span />}
          <div className="flex gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}>Guardar</button></div>
        </div>
      </div>
    </Modal>
  )
}

/** Lo que se le ha entregado del almacén a un empleado (EPP y consumibles). Se usa en su expediente. */
export function EntregasEmpleado({ empleadoId }: { empleadoId: string }) {
  const [lista, setLista] = useState<Mov[] | null>(null)
  useEffect(() => {
    supabase.from('movimientos_consumible').select('*, consumibles(nombre,unidad), ubicaciones(nombre), empresas(nombre,nombre_corto)').eq('empleado_id', empleadoId).eq('tipo', 'salida').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setLista((data as unknown as Mov[]) ?? []))
  }, [empleadoId])
  if (!lista || lista.length === 0) return null
  return (
    <section className="tarjeta p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><HardHat size={16} className="text-marca" />Entregado del almacén<Link to="/almacen?tab=movimientos" className="ml-auto text-[11px] font-normal text-marca hover:underline"><History size={12} className="mr-1 inline" />Almacén</Link></h3>
      <ul className="space-y-1.5 text-sm">
        {lista.map(m => (
          <li key={m.id} className="flex items-center gap-2">
            <span className="cifra w-10 shrink-0 text-right font-semibold">{num(m.cantidad)}</span>
            <span className="min-w-0 flex-1 truncate">{m.consumibles?.nombre} <span className="text-xs text-stone-500">{m.consumibles ? plural(m.consumibles.unidad, m.cantidad) : ''}</span></span>
            <span className="text-[11px] text-stone-400">{new Date(m.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
