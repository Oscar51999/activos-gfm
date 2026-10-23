import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ScanLine, Plus, ArrowLeft, CheckCircle2, AlertTriangle, MapPinned, HelpCircle, Keyboard, Camera, Lock, Trash2, MoveRight, ClipboardCheck } from 'lucide-react'
import { supabase, mensajeError, type Estatus } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { coincideLectura, separarLecturas } from '../lib/qr'
import { Cargando, Vacio, Aviso, Modal, Campo, EstatusBadge } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import LogoEmpresa from '../components/LogoEmpresa'
import type { EmpresaLogo } from '../lib/logos'
const Camara = lazy(() => import('../components/CamaraQR'))

type Inv = { id: string; folio: string; empresa_id: string; ubicacion_id: string | null; nombre: string; estatus: 'abierto' | 'cerrado'; created_at: string; cerrado_at: string | null
  resumen: { esperados: number; encontrados: number; faltantes: number; fuera: number; desconocidos: number } | null
  empresas?: EmpresaLogo | null; ubicaciones?: { nombre: string } | null }
type Act = { id: string; codigo: string; qr: string; rfid_epc?: string | null; descripcion: string; serie: string | null; numero_economico: string | null; estatus: Estatus; ubicacion_id: string | null; ubicacion: string | null
  responsable: string | null; marca: string | null; modelo: string | null; categoria: string; foto_principal: string | null; modelo_foto: string | null }
type Lectura = { id: string; activo_id: string | null; leido: string; created_at: string }

/** Lista de conteos físicos. */
export default function Inventarios() {
  const { puedeResguardar } = useAuth()
  const nav = useNavigate()
  const [lista, setLista] = useState<Inv[] | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [empresas, setEmpresas] = useState<(EmpresaLogo & { id: string })[]>([])
  const [ubis, setUbis] = useState<{ id: string; nombre: string; empresa_id: string }[]>([])
  const [f, setF] = useState({ empresa: '', ubicacion: '', nombre: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('inventarios').select('*,empresas(nombre,nombre_corto,logo_path,logo_oscuro,color),ubicaciones(nombre)').order('created_at', { ascending: false }).then(({ data }) => setLista((data as unknown as Inv[]) ?? []))
    supabase.from('empresas').select('id,nombre,nombre_corto,logo_path,logo_oscuro,color').eq('activo', true).order('nombre').then(({ data }) => setEmpresas((data as (EmpresaLogo & { id: string })[]) ?? []))
    supabase.from('ubicaciones').select('id,nombre,empresa_id').eq('activo', true).order('nombre').then(({ data }) => setUbis((data as { id: string; nombre: string; empresa_id: string }[]) ?? []))
  }, [])

  async function crear(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const ub = ubis.find(u => u.id === f.ubicacion)
    const emp = empresas.find(x => x.id === f.empresa)
    const nombre = f.nombre.trim() || `Conteo ${ub?.nombre ?? emp?.nombre_corto ?? emp?.nombre ?? ''} · ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`
    const { data, error } = await supabase.from('inventarios').insert({ empresa_id: f.empresa, ubicacion_id: f.ubicacion || null, nombre }).select('id').single()
    if (error) { setError(mensajeError(error)); return }
    nav(`/inventarios/${(data as { id: string }).id}`)
  }

  if (!lista) return <Cargando />
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Inventario físico</h1>
          <p className="mt-1 text-sm text-stone-500">Camina la obra o el almacén escaneando etiquetas. Al final sabes qué está, qué falta y qué está en otro lugar.</p>
        </div>
        {puedeResguardar && <button className="btn-primario" onClick={() => { setNuevo(true); setF({ empresa: empresas.length === 1 ? empresas[0].id : '', ubicacion: '', nombre: '' }) }}><Plus size={16} />Nuevo conteo</button>}
      </div>
      {lista.length === 0 ? <div className="tarjeta"><Vacio titulo="Aún no hay conteos" texto="Crea el primero: elige la empresa y la obra o almacén que vas a revisar." /></div> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((i, k) => {
            const r = i.resumen
            return (
              <Link key={i.id} to={`/inventarios/${i.id}`} className="tarjeta viva min-w-0 animate-entrar p-5" style={{ animationDelay: `${k * 40}ms` }}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-stone-500">{i.folio}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${i.estatus === 'abierto' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>{i.estatus === 'abierto' ? <><ScanLine size={11} />En curso</> : <><Lock size={11} />Cerrado</>}</span>
                </div>
                <p className="truncate font-semibold">{i.nombre}</p>
                <p className="truncate text-xs text-stone-500">{i.ubicaciones?.nombre ?? 'Toda la empresa'} · {new Date(i.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</p>
                {i.empresas && <div className="my-3 flex h-10 items-center"><LogoEmpresa empresa={i.empresas} alto={24} ancho={130} className="!justify-start" /></div>}
                {r && <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-emerald-50 py-1.5 text-emerald-700"><b className="cifra block text-base">{r.encontrados}</b>encontrados</div>
                  <div className="rounded-lg bg-red-50 py-1.5 text-red-700"><b className="cifra block text-base">{r.faltantes}</b>faltan</div>
                  <div className="rounded-lg bg-amber-50 py-1.5 text-amber-800"><b className="cifra block text-base">{r.fuera}</b>fuera de lugar</div>
                </div>}
              </Link>
            )
          })}
        </div>
      )}
      <Modal abierto={nuevo} onCerrar={() => setNuevo(false)} titulo="Nuevo conteo">
        <form onSubmit={crear} className="space-y-4">
          <Campo label="Empresa *"><select className="campo" required value={f.empresa} onChange={e => setF({ ...f, empresa: e.target.value, ubicacion: '' })}><option value="">— Elige —</option>{empresas.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
          <Campo label="¿Qué lugar vas a revisar?"><select className="campo" value={f.ubicacion} onChange={e => setF({ ...f, ubicacion: e.target.value })} disabled={!f.empresa}><option value="">Toda la empresa</option>{ubis.filter(u => u.empresa_id === f.empresa).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
          <Campo label="Nombre (opcional)"><input className="campo" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Se arma solo con el lugar y la fecha" /></Campo>
          {error && <Aviso>{error}</Aviso>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-sec" onClick={() => setNuevo(false)}>Cancelar</button><button className="btn-primario"><ScanLine size={16} />Empezar a contar</button></div>
        </form>
      </Modal>
    </div>
  )
}

type Pestaña = 'faltantes' | 'encontrados' | 'fuera' | 'desconocidos'

/** Pantalla de conteo: escanear, ver avance y cerrar. */
export function InventarioConteo() {
  const { id } = useParams()
  const { puedeResguardar, puedeEditar } = useAuth()
  const [inv, setInv] = useState<Inv | null>(null)
  const [esperados, setEsperados] = useState<Act[]>([])
  const [todos, setTodos] = useState<Act[]>([])
  const [lecturas, setLecturas] = useState<Lectura[]>([])
  const [texto, setTexto] = useState('')
  const [camara, setCamara] = useState(false)
  const [pest, setPest] = useState<Pestaña>('faltantes')
  const [flash, setFlash] = useState<{ tipo: 'ok' | 'fuera' | 'repetido' | 'error'; msg: string } | null>(null)
  const [cerrar, setCerrar] = useState(false)
  const [mover, setMover] = useState(true)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('inventarios').select('*,empresas(nombre,nombre_corto,logo_path,logo_oscuro,color),ubicaciones(nombre)').eq('id', id!).single().then(({ data }) => {
      const i = data as unknown as Inv; setInv(i)
      supabase.from('v_activos').select('id,codigo,qr,rfid_epc,descripcion,serie,numero_economico,estatus,ubicacion_id,ubicacion,responsable,marca,modelo,categoria,foto_principal,modelo_foto')
        .eq('empresa_id', i.empresa_id).neq('estatus', 'baja').limit(10000).then(({ data: a }) => {
          const l = (a as Act[]) ?? []; setTodos(l); setEsperados(i.ubicacion_id ? l.filter(x => x.ubicacion_id === i.ubicacion_id) : l)
        })
    })
    supabase.from('inventario_lecturas').select('id,activo_id,leido,created_at').eq('inventario_id', id!).order('created_at', { ascending: false }).then(({ data }) => setLecturas((data as Lectura[]) ?? []))
  }, [id])

  const porId = useMemo(() => new Map(todos.map(a => [a.id, a])), [todos])
  const leidos = useMemo(() => new Set(lecturas.map(l => l.activo_id).filter(Boolean) as string[]), [lecturas])
  const espIds = useMemo(() => new Set(esperados.map(a => a.id)), [esperados])
  const encontrados = esperados.filter(a => leidos.has(a.id))
  const faltantes = esperados.filter(a => !leidos.has(a.id))
  const fuera = [...leidos].filter(x => !espIds.has(x)).map(x => porId.get(x)).filter(Boolean) as Act[]
  const desconocidos = lecturas.filter(l => !l.activo_id)
  const avance = esperados.length ? Math.round((encontrados.length / esperados.length) * 100) : 0
  const abierto = inv?.estatus === 'abierto' && puedeResguardar

  function sonar(ok: boolean) {
    try { const c = new AudioContext(); const o = c.createOscillator(); const g = c.createGain(); o.frequency.value = ok ? 880 : 220; g.gain.value = 0.06; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.12) } catch { /* sin audio */ }
    try { navigator.vibrate?.(ok ? 40 : [60, 40, 60]) } catch { /* sin vibración */ }
  }

  async function registrar(valor: string) {
    const t = valor.trim(); if (!t || !inv) return
    const a = todos.find(x => coincideLectura(x, t))
    if (a && leidos.has(a.id)) { setFlash({ tipo: 'repetido', msg: `${a.codigo} ya estaba contado` }); sonar(false); return }
    const { data, error } = await supabase.from('inventario_lecturas').insert({ inventario_id: inv.id, activo_id: a?.id ?? null, leido: t }).select('id,activo_id,leido,created_at').single()
    if (error) { setFlash({ tipo: 'error', msg: mensajeError(error) }); sonar(false); return }
    setLecturas(l => [data as Lectura, ...l])
    if (!a) { setFlash({ tipo: 'error', msg: `“${t}” no corresponde a ningún activo de esta empresa` }); sonar(false) }
    else if (!espIds.has(a.id)) { setFlash({ tipo: 'fuera', msg: `${a.codigo} · ${a.marca ?? ''} ${a.modelo ?? a.descripcion} — debería estar en ${a.ubicacion ?? 'sin ubicación'}` }); sonar(false) }
    else { setFlash({ tipo: 'ok', msg: `${a.codigo} · ${[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}` }); sonar(true) }
  }

  async function quitar(l: Lectura) {
    const { error } = await supabase.from('inventario_lecturas').delete().eq('id', l.id)
    if (!error) setLecturas(x => x.filter(y => y.id !== l.id))
  }

  async function confirmarCierre() {
    if (!inv) return
    setError('')
    if (mover && puedeEditar && inv.ubicacion_id && fuera.length) {
      const { error } = await supabase.from('activos').update({ ubicacion_id: inv.ubicacion_id }).in('id', fuera.map(a => a.id))
      if (error) { setError(mensajeError(error)); return }
    }
    const resumen = { esperados: esperados.length, encontrados: encontrados.length, faltantes: faltantes.length, fuera: fuera.length, desconocidos: desconocidos.length }
    const { error } = await supabase.from('inventarios').update({ estatus: 'cerrado', cerrado_at: new Date().toISOString(), resumen }).eq('id', inv.id)
    if (error) { setError(mensajeError(error)); return }
    setInv({ ...inv, estatus: 'cerrado', resumen }); setCerrar(false)
  }

  if (!inv) return <Cargando />
  const listas: Record<Pestaña, Act[]> = { faltantes, encontrados, fuera, desconocidos: [] }
  const R = 54, C = 2 * Math.PI * R

  return (
    <div>
      <Link to="/inventarios" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Inventario físico</Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs text-stone-500">{inv.folio} · {inv.empresas?.nombre}</p>
          <h1 className="truncate text-2xl font-semibold sm:text-3xl">{inv.nombre}</h1>
          <p className="text-sm text-stone-500">{inv.ubicaciones?.nombre ?? 'Toda la empresa'} · {inv.estatus === 'abierto' ? 'en curso' : `cerrado el ${new Date(inv.cerrado_at!).toLocaleDateString('es-MX', { dateStyle: 'medium' })}`}</p>
        </div>
        {abierto && <button className="btn-primario" onClick={() => setCerrar(true)}><ClipboardCheck size={16} />Terminar conteo</button>}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="tarjeta min-w-0 p-5">
          {abierto ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><ScanLine size={16} className="text-marca" />Escanear</h2>
                <div className="flex gap-1 rounded-xl border border-stone-200 p-1">
                  <button onClick={() => { setCamara(false); setTimeout(() => input.current?.focus(), 50) }} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${!camara ? 'bg-marca text-[#120D04]' : 'text-stone-500'}`}><Keyboard size={13} />Código / lector</button>
                  <button onClick={() => setCamara(true)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${camara ? 'bg-marca text-[#120D04]' : 'text-stone-500'}`}><Camera size={13} />Cámara</button>
                </div>
              </div>
              {camara && <Suspense fallback={<Cargando texto="Abriendo cámara…" />}><Camara onLeer={registrar} /></Suspense>}
              <form onSubmit={e => { e.preventDefault(); registrar(texto); setTexto('') }} className="mt-3 flex gap-2">
                <input ref={input} autoFocus className="campo font-mono" placeholder="Escanea QR o RFID, o escribe código, serie o No. económico y Enter" value={texto} onChange={e => setTexto(e.target.value)}
                  onPaste={e => { const xs = separarLecturas(e.clipboardData.getData('text')); if (xs.length > 1) { e.preventDefault(); (async () => { for (const x of xs) await registrar(x) })() } }} list="codigos-inv" />
                <datalist id="codigos-inv">{faltantes.slice(0, 200).map(a => <option key={a.id} value={a.codigo}>{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</option>)}</datalist>
                <button className="btn-primario">Contar</button>
              </form>
              {flash && (
                <div key={lecturas.length + flash.msg} className={`mt-3 flex animate-entrar items-center gap-3 rounded-xl border px-4 py-3 text-sm ${flash.tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : flash.tipo === 'fuera' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                  {flash.tipo === 'ok' ? <CheckCircle2 size={20} /> : flash.tipo === 'fuera' ? <MapPinned size={20} /> : <AlertTriangle size={20} />}
                  <span className="min-w-0"><b className="block">{flash.tipo === 'ok' ? 'Encontrado' : flash.tipo === 'fuera' ? 'Está en otro lugar' : flash.tipo === 'repetido' ? 'Repetido' : 'No reconocido'}</b><span className="block truncate">{flash.msg}</span></span>
                </div>
              )}
              <p className="mt-3 text-[11px] text-stone-400">Funciona con la cámara del celular, con un lector de códigos USB/Bluetooth o tecleando el código.</p>
            </>
          ) : inv.resumen ? (
            <div>
              <h2 className="mb-4 text-sm font-semibold">Resultado del conteo</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([['Esperados', inv.resumen.esperados, ''], ['Encontrados', inv.resumen.encontrados, 'text-emerald-700'], ['Faltantes', inv.resumen.faltantes, 'text-red-700'], ['Fuera de lugar', inv.resumen.fuera, 'text-amber-700']] as const).map(([t, n, c]) => (
                  <div key={t} className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center"><p className={`cifra text-3xl font-semibold ${c}`}>{n}</p><p className="text-[10px] uppercase tracking-wider text-stone-500">{t}</p></div>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-stone-500">Solo almacén, supervisores y administradores pueden contar.</p>}
        </section>

        <aside className="tarjeta flex flex-col items-center justify-center p-5">
          <div className="relative h-36 w-36">
            <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
              <circle cx="64" cy="64" r={R} fill="none" stroke="rgb(255 255 255 / .07)" strokeWidth="10" />
              <circle cx="64" cy="64" r={R} fill="none" stroke="#34D399" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(avance / 100) * C} ${C}`} style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)', filter: 'drop-shadow(0 0 6px #34D39988)' }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center"><div><p className="cifra text-3xl font-semibold">{avance}%</p><p className="text-[10px] uppercase tracking-wider text-stone-400">avance</p></div></div>
          </div>
          <p className="mt-3 text-sm"><b className="cifra text-emerald-700">{encontrados.length}</b> de <b className="cifra">{esperados.length}</b> esperados</p>
          <div className="mt-3 flex gap-4 text-xs text-stone-500"><span><b className="text-amber-700">{fuera.length}</b> fuera de lugar</span><span><b className="text-red-700">{desconocidos.length}</b> no reconocidos</span></div>
        </aside>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50 p-1">
        {([['faltantes', `Faltan · ${faltantes.length}`, AlertTriangle], ['encontrados', `Encontrados · ${encontrados.length}`, CheckCircle2], ['fuera', `Fuera de lugar · ${fuera.length}`, MapPinned], ['desconocidos', `No reconocidos · ${desconocidos.length}`, HelpCircle]] as const).map(([k, t, I]) => (
          <button key={k} onClick={() => setPest(k)} className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${pest === k ? 'bg-marca text-[#120D04]' : 'text-stone-500 hover:text-tinta'}`}><I size={14} />{t}</button>
        ))}
      </div>

      {pest === 'desconocidos' ? (
        desconocidos.length === 0 ? <div className="tarjeta"><Vacio titulo="Nada raro" texto="Todo lo escaneado corresponde a un activo registrado." /></div> : (
          <ul className="tarjeta divide-y divide-stone-100">{desconocidos.map(l => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm"><HelpCircle size={16} className="text-red-700" /><span className="flex-1 truncate font-mono">{l.leido}</span><span className="text-xs text-stone-400">{new Date(l.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
              {abierto && <button onClick={() => quitar(l)} className="text-stone-400 hover:text-red-700" aria-label="Quitar"><Trash2 size={15} /></button>}</li>
          ))}</ul>
        )
      ) : listas[pest].length === 0 ? (
        <div className="tarjeta"><Vacio titulo={pest === 'faltantes' ? (esperados.length ? '¡Todo encontrado!' : 'No hay activos esperados aquí') : 'Nada todavía'} texto={pest === 'faltantes' && esperados.length ? 'Todos los activos esperados ya se contaron.' : undefined} /></div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {listas[pest].map(a => {
            const l = lecturas.find(x => x.activo_id === a.id)
            return (
              <div key={a.id} className="tarjeta flex min-w-0 items-center gap-3 p-3">
                <FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} className="h-12 w-14 shrink-0 rounded-lg" icono={18} />
                <Link to={`/activos/${a.id}`} className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] text-marca">{a.codigo}</p>
                  <p className="truncate text-sm">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</p>
                  <p className="truncate text-[11px] text-stone-500">{pest === 'fuera' ? <>Registrado en {a.ubicacion ?? 'sin ubicación'} <MoveRight size={10} className="inline" /> {inv.ubicaciones?.nombre}</> : a.responsable || a.ubicacion || 'Sin ubicación'}</p>
                </Link>
                <EstatusBadge estatus={a.estatus} />
                {abierto && l && <button onClick={() => quitar(l)} className="text-stone-400 hover:text-red-700" aria-label="Quitar lectura"><Trash2 size={15} /></button>}
                {abierto && pest === 'faltantes' && <button onClick={() => registrar(a.codigo)} className="rounded-lg border border-stone-300 px-2 py-1 text-[11px] text-stone-500 hover:border-marca hover:text-marca">Lo vi</button>}
              </div>
            )
          })}
        </div>
      )}

      <Modal abierto={cerrar} onCerrar={() => setCerrar(false)} titulo="Terminar conteo">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-emerald-50 py-3 text-emerald-700"><b className="cifra block text-2xl">{encontrados.length}</b>encontrados</div>
            <div className="rounded-xl bg-red-50 py-3 text-red-700"><b className="cifra block text-2xl">{faltantes.length}</b>faltan</div>
            <div className="rounded-xl bg-amber-50 py-3 text-amber-800"><b className="cifra block text-2xl">{fuera.length}</b>fuera de lugar</div>
          </div>
          {inv.ubicacion_id && fuera.length > 0 && puedeEditar && (
            <label className="flex items-start gap-3 rounded-xl border border-stone-200 p-3 text-sm">
              <input type="checkbox" className="mt-1 accent-[#F9B234]" checked={mover} onChange={e => setMover(e.target.checked)} />
              <span>Actualizar la ubicación de los {fuera.length} activo(s) fuera de lugar a <b>{inv.ubicaciones?.nombre}</b>, porque ahí se encontraron.</span>
            </label>
          )}
          {faltantes.length > 0 && <p className="text-xs text-stone-500">Los faltantes quedan en el resultado para darles seguimiento. No se cambia su estatus.</p>}
          {error && <Aviso>{error}</Aviso>}
          <div className="flex justify-end gap-2"><button className="btn-sec" onClick={() => setCerrar(false)}>Seguir contando</button><button className="btn-primario" onClick={confirmarCierre}><Lock size={16} />Cerrar conteo</button></div>
        </div>
      </Modal>
    </div>
  )
}
