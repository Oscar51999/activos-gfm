import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RefreshCcw, ScanLine, Camera, CheckCircle2, XCircle, MapPinned, Info, Grid3x3 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, fecha } from '../lib/hooks'
import { coincideLectura, separarLecturas, esEPC, leerQR, leerPosicion } from '../lib/qr'
import { Encabezado, Cargando, Vacio, Aviso } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
const Camara = lazy(() => import('../components/CamaraQR'))

type Item = { activo_id: string; codigo: string; descripcion: string; serie: string | null; rfid_epc: string | null; qr: string; numero_economico: string | null
  empresa_id: string; empresa: string; ubicacion_id: string | null; ubicacion: string | null; posicion: string | null; categoria: string; clase_abc: 'A' | 'B' | 'C'
  cada_dias: number; ultimo: string | null; proximo: string; marca: string | null; modelo: string | null; modelo_foto: string | null; foto_principal: string | null; responsable: string | null }
type Conteo = { id: string; activo_id: string; encontrado: boolean; ubicacion_ok: boolean | null; metodo: string; created_at: string }
type Evento = { t: string; ok: boolean; texto: string }

const hoy = () => new Date().toISOString().slice(0, 10)
const masDias = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)
const CLASE = { A: 'bg-red-50 text-red-700 ring-red-200', B: 'bg-amber-50 text-amber-800 ring-amber-200', C: 'bg-stone-50 text-stone-600 ring-stone-200' }

/** Conteo cíclico ABC: en vez de un inventario anual completo, cada día se cuenta un poco. Lo valioso (A) cada 30 días, B cada 90, C cada 180. */
export default function ConteoCiclico() {
  const { puedeResguardar } = useAuth()
  const [sp] = useSearchParams()
  const [empresa, setEmpresa] = useState('')
  const [ubi, setUbi] = useState(sp.get('ubicacion') ?? '')
  const [clase, setClase] = useState('')
  const [items, setItems] = useState<Item[] | null>(null)
  const [conteos, setConteos] = useState<Conteo[]>([])
  const [texto, setTexto] = useState('')
  const [camara, setCamara] = useState(false)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [error, setError] = useState('')
  const [hechos, setHechos] = useState<Set<string>>(new Set())
  const input = useRef<HTMLInputElement>(null)
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const { items: ubis } = useLista('ubicaciones', 'id,nombre,empresa_id,tipo')

  const cargar = useCallback(async () => {
    const [v, c] = await Promise.all([
      supabase.from('v_conteo_ciclico').select('*').order('proximo').limit(20000),
      supabase.from('conteos_ciclicos').select('id,activo_id,encontrado,ubicacion_ok,metodo,created_at').gte('created_at', new Date(Date.now() - 90 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(5000),
    ])
    setItems((v.data as Item[]) ?? []); setConteos((c.data as Conteo[]) ?? [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const filtrados = useMemo(() => (items ?? []).filter(i => (!empresa || i.empresa_id === empresa) && (!ubi || i.ubicacion_id === ubi) && (!clase || i.clase_abc === clase)), [items, empresa, ubi, clase])
  const tocan = useMemo(() => filtrados.filter(i => i.proximo <= masDias(7) && !hechos.has(i.activo_id)), [filtrados, hechos])
  const vencidos = tocan.filter(i => i.proximo <= hoy()).length
  const kpi = useMemo(() => {
    const ids = new Set(filtrados.map(i => i.activo_id))
    const c = conteos.filter(x => ids.has(x.activo_id))
    const exactos = c.filter(x => x.encontrado && x.ubicacion_ok !== false).length
    return { total: c.length, precision: c.length ? exactos / c.length : null, faltantes: c.filter(x => !x.encontrado).length, malUbicados: c.filter(x => x.encontrado && x.ubicacion_ok === false).length }
  }, [filtrados, conteos])
  const porClase = (k: 'A' | 'B' | 'C') => filtrados.filter(i => i.clase_abc === k).length

  const nota = (ok: boolean, t: string) => setEventos(e => [{ t: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), ok, texto: t }, ...e].slice(0, 30))

  async function guardar(i: Item, encontrado: boolean, metodo: 'qr' | 'rfid' | 'manual') {
    setError('')
    const ubicacion_ok = encontrado ? (ubi ? i.ubicacion_id === ubi : null) : null
    const { error } = await supabase.from('conteos_ciclicos').insert({ activo_id: i.activo_id, empresa_id: i.empresa_id, ubicacion_esperada_id: i.ubicacion_id, encontrado, ubicacion_ok, metodo })
    if (error) { setError(mensajeError(error)); return }
    setHechos(h => new Set(h).add(i.activo_id))
    setConteos(c => [{ id: crypto.randomUUID(), activo_id: i.activo_id, encontrado, ubicacion_ok, metodo, created_at: new Date().toISOString() }, ...c])
    nota(encontrado && ubicacion_ok !== false, encontrado ? `${i.codigo} · ${i.descripcion}${ubicacion_ok === false ? ` — está registrado en ${i.ubicacion ?? 'otra ubicación'}` : ''}` : `${i.codigo} marcado como NO encontrado`)
  }

  async function registrar(valor: string) {
    const v = valor.trim()
    if (!v || !items) return
    if (leerPosicion(v)) { nota(true, 'Etiqueta de posición leída: ahora escanea lo que hay en ella.'); return }
    const metodo = esEPC(v) ? 'rfid' : leerQR(v) ? 'qr' : 'manual'
    const i = items.find(x => (!empresa || x.empresa_id === empresa) && coincideLectura(x, v))
    if (!i) { nota(false, `"${v}" no corresponde a ningún activo`); return }
    if (hechos.has(i.activo_id)) { nota(true, `${i.codigo} ya estaba contado`); return }
    await guardar(i, true, metodo)
  }

  return (
    <div>
      <Encabezado titulo="Conteo cíclico" sub="Cuenta un poco cada día en lugar de parar todo para el inventario anual. Clase A cada 30 días, B cada 90 y C cada 180."
        acciones={<><Link className="btn-sec" to="/posiciones"><Grid3x3 size={16} />Posiciones</Link><button className="btn-sec" onClick={() => { setHechos(new Set()); cargar() }}><RefreshCcw size={16} />Actualizar</button></>} />

      <div className="tarjeta mb-5 grid gap-3 p-4 sm:grid-cols-3">
        <select className="campo" value={empresa} onChange={e => { setEmpresa(e.target.value); setUbi('') }} aria-label="Empresa">
          <option value="">Todas las empresas</option>
          {empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}
        </select>
        <select className="campo" value={ubi} onChange={e => setUbi(e.target.value)} aria-label="Ubicación que estás contando">
          <option value="">Todas las ubicaciones</option>
          {ubis.filter(u => !empresa || u.empresa_id === empresa).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <select className="campo" value={clase} onChange={e => setClase(e.target.value)} aria-label="Clase">
          <option value="">Clases A, B y C</option>
          <option value="A">Solo A (cada 30 días)</option>
          <option value="B">Solo B (cada 90 días)</option>
          <option value="C">Solo C (cada 180 días)</option>
        </select>
      </div>

      {items === null ? <Cargando /> : <>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi titulo="Toca contar (7 días)" valor={String(tocan.length)} pie={vencidos ? `${vencidos} ya vencidos` : 'al corriente'} alerta={vencidos > 0} />
          <Kpi titulo="Precisión 90 días" valor={kpi.precision == null ? '—' : `${Math.round(kpi.precision * 1000) / 10}%`} pie={`${kpi.total} conteos`} alerta={kpi.precision != null && kpi.precision < 0.95} />
          <Kpi titulo="No encontrados" valor={String(kpi.faltantes)} pie="en 90 días" alerta={kpi.faltantes > 0} />
          <Kpi titulo="Activos por clase" valor={`${porClase('A')} · ${porClase('B')} · ${porClase('C')}`} pie="A · B · C" />
        </div>

        {puedeResguardar && (
          <div className="tarjeta mb-5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Contar ahora</h2>
              <button className="btn-sec" onClick={() => setCamara(!camara)}><Camera size={16} />{camara ? 'Cerrar cámara' : 'Usar cámara'}</button>
            </div>
            {!ubi && <p className="mb-3 flex items-start gap-1.5 text-xs text-stone-500"><Info size={14} className="mt-0.5 shrink-0" />Elige arriba la ubicación donde estás para que el sistema también revise que cada cosa esté en su lugar.</p>}
            {camara && <Suspense fallback={<Cargando texto="Abriendo cámara…" />}><Camara onLeer={registrar} /></Suspense>}
            <form onSubmit={e => { e.preventDefault(); registrar(texto); setTexto(''); input.current?.focus() }} className="mt-2 flex gap-2">
              <input ref={input} className="campo font-mono" placeholder="Escanea QR o RFID, o escribe código, serie o No. económico y Enter" value={texto} onChange={e => setTexto(e.target.value)}
                onPaste={e => { const xs = separarLecturas(e.clipboardData.getData('text')); if (xs.length > 1) { e.preventDefault(); (async () => { for (const x of xs) await registrar(x) })() } }} />
              <button className="btn-primario"><ScanLine size={16} />Registrar</button>
            </form>
            {eventos.length > 0 && (
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
                {eventos.map((e, k) => <li key={k} className={`flex gap-2 ${e.ok ? 'text-emerald-700' : 'text-red-700'}`}><span className="font-mono text-xs text-stone-400">{e.t}</span>{e.texto}</li>)}
              </ul>
            )}
            {error && <div className="mt-3"><Aviso>{error}</Aviso></div>}
          </div>
        )}

        <h2 className="etiqueta">Pendientes de contar</h2>
        {tocan.length === 0 ? <Vacio titulo="Nada pendiente" texto={filtrados.length ? 'Todo lo de este filtro está contado a tiempo.' : 'No hay activos con este filtro.'} /> : (
          <ul className="tarjeta divide-y divide-stone-200">
            {tocan.slice(0, 300).map(i => {
              const vencido = i.proximo <= hoy()
              const fuera = ubi && i.ubicacion_id !== ubi
              return (
                <li key={i.activo_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <FotoActivo foto={i.foto_principal} fotoModelo={i.modelo_foto} categoria={i.categoria} className="h-11 w-11 shrink-0 rounded-lg" icono={18} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <Link to={`/activos/${i.activo_id}`} className="font-mono hover:text-marca">{i.codigo}</Link>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${CLASE[i.clase_abc]}`}>{i.clase_abc}</span>
                      <span className="truncate">{i.descripcion}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-stone-500">
                      <span className="inline-flex items-center gap-1"><MapPinned size={12} />{i.ubicacion ?? 'Sin ubicación'}{i.posicion ? ` · ${i.posicion}` : ''}</span>
                      {i.responsable && <span>{i.responsable}</span>}
                      <span>Último: {i.ultimo ? fecha(i.ultimo) : 'nunca'}</span>
                      <span className={vencido ? 'font-medium text-red-700' : ''}>{vencido ? 'Vencido' : 'Toca'} {fecha(i.proximo)}</span>
                      {fuera && <span className="text-amber-700">registrado en otra ubicación</span>}
                    </p>
                  </div>
                  {puedeResguardar && <div className="flex gap-2">
                    <button className="btn-sec !px-2.5" onClick={() => guardar(i, true, 'manual')} title="Lo vi"><CheckCircle2 size={16} className="text-emerald-600" />Está</button>
                    <button className="btn-sec !px-2.5" onClick={() => guardar(i, false, 'manual')} title="No lo encontré"><XCircle size={16} className="text-red-600" />No está</button>
                  </div>}
                </li>
              )
            })}
          </ul>
        )}
        {tocan.length > 300 && <p className="mt-2 text-xs text-stone-500">Mostrando 300 de {tocan.length}. Filtra por ubicación para ver el resto.</p>}
      </>}
    </div>
  )
}

function Kpi({ titulo, valor, pie, alerta }: { titulo: string; valor: string; pie: string; alerta?: boolean }) {
  return (
    <div className="tarjeta p-4">
      <p className="etiqueta">{titulo}</p>
      <p className={`text-2xl font-semibold tabular-nums ${alerta ? 'text-red-700' : ''}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-stone-500">{pie}</p>
    </div>
  )
}
