import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Plus, Search, Trash2, PackagePlus, Tags, PenLine, Sparkles, ClipboardPaste, UserRound, MapPin, Camera, Loader2, ScanText, FileUp, Car, MessageSquareText, AlertTriangle } from 'lucide-react'
import { leerEtiqueta, buscarProducto, type Lectura } from '../lib/ia'
import { faltanParaAsignar } from '../lib/requisitos'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, nombreEmpleado } from '../lib/hooks'
import { Aviso, Cargando, Campo } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import ProductoModal, { type Producto } from '../components/ProductoModal'
import LogoEmpresa from '../components/LogoEmpresa'
import type { EmpresaLogo } from '../lib/logos'

type Fila = { serie: string; eco: string; placa?: string; anio?: string; color?: string; motor?: string; km?: string; comentario?: string }
type Empresa = EmpresaLogo & { id: string }
const PASOS = ['Producto', 'Unidades', 'Destino'] as const

/** Alta rápida en 3 pasos: qué es, cuántas (series) y a dónde o a quién. */
export default function Alta() {
  const [sp] = useSearchParams()
  const { perfil } = useAuth()
  const [paso, setPaso] = useState(0)
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const ubicaciones = useLista('ubicaciones', 'id,nombre,empresa_id,tipo')
  const empleados = useLista('empleados', 'id,nombres,apellidos,empresa_id,puesto', 'nombres')

  const [prod, setProd] = useState<Producto | null>(null)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(false)
  const [empresa, setEmpresa] = useState(sp.get('empresa') ?? '')
  const [filas, setFilas] = useState<Fila[]>([{ serie: '', eco: '' }])
  const [valor, setValor] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [empleado, setEmpleado] = useState('')
  const [notas, setNotas] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaAlta, setFechaAlta] = useState(new Date().toISOString().slice(0, 10))
  const [factura, setFactura] = useState('')
  const [sinSerie, setSinSerie] = useState(false)
  const [faltan, setFaltan] = useState<string[]>([])
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState<{ ids: string[]; codigos: string[]; mov: string | null } | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [errorIA, setErrorIA] = useState('')
  const camara = useRef<HTMLInputElement>(null)
  async function leerFoto(f?: File | null) {
    if (!f || !productos) return
    setLeyendo(true); setErrorIA(''); setLectura(null)
    try {
      const l = await leerEtiqueta(f)
      setLectura(l)
      const p = buscarProducto(productos, l)
      if (l.serie) setFilas(fs => fs[0] && !fs[0].serie ? [{ ...fs[0], serie: l.serie! }, ...fs.slice(1)] : [...fs.filter(x => x.serie || x.eco), { serie: l.serie!, eco: '' }])
      if (p) { setProd(p); setPaso(1) }
    } catch (e) { setErrorIA((e as Error).message) } finally { setLeyendo(false) }
  }
  const inicialProd = useMemo(() => lectura ? { marca: lectura.marca ?? '', modelo: lectura.modelo ?? '', descripcion: lectura.descripcion ?? '', categoria: lectura.categoria ?? '', foto: lectura.foto } : undefined, [lectura])
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const [enfocar, setEnfocar] = useState<number | null>(null)
  useEffect(() => { if (enfocar != null && refs.current[enfocar]) { refs.current[enfocar]!.focus(); setEnfocar(null) } }, [enfocar, filas])
  // ¿El empleado tiene la licencia o certificación que pide este equipo?
  useEffect(() => {
    let vivo = true
    if (!empleado || !prod) { setFaltan([]); return }
    faltanParaAsignar(empleado, [{ categoria_id: prod.categoria_id, modelo_id: prod.id }]).then(f => { if (vivo) setFaltan(f) })
    return () => { vivo = false }
  }, [empleado, prod])

  useEffect(() => {
    supabase.from('modelos').select('*,marcas(nombre),categorias(nombre,es_vehiculo)').eq('activo', true).order('nombre').then(({ data }) => {
      const l = (data as unknown as Producto[]) ?? []
      setProductos(l)
      const pre = sp.get('producto') && l.find(p => p.id === sp.get('producto'))
      if (pre) { setProd(pre); setPaso(1) }
    })
    supabase.from('empresas').select('id,nombre,nombre_corto,logo_path,logo_oscuro,color').eq('activo', true).order('nombre')
      .then(({ data }) => { const l = (data as Empresa[]) ?? []; setEmpresas(l); if (!sp.get('empresa') && l.length === 1) setEmpresa(l[0].id) })
  }, [sp])

  const validas = filas.filter(f => f.serie.trim() || f.eco.trim() || f.placa?.trim() || f.comentario?.trim())
  const cantidad = Math.max(validas.length, filas.length === 1 && !filas[0].serie && !filas[0].eco ? 1 : validas.length)
  const repetidas = useMemo(() => {
    const vistos = new Set<string>(), rep = new Set<string>()
    for (const f of filas) { const s = f.serie.trim().toUpperCase(); if (!s) continue; if (vistos.has(s)) rep.add(s); vistos.add(s) }
    return rep
  }, [filas])

  function pegar(i: number, e: React.ClipboardEvent<HTMLInputElement>, campo: keyof Fila) {
    const txt = e.clipboardData.getData('text')
    if (!/[\n\t]/.test(txt)) return
    e.preventDefault()
    const lineas = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    setFilas(fs => {
      const nuevas = [...fs]
      lineas.forEach((l, k) => {
        const [a, b] = l.split('\t')
        const fila = { ...(nuevas[i + k] ?? { serie: '', eco: '' }) }
        if (campo === 'serie') { fila.serie = a ?? ''; if (b !== undefined) fila.eco = b } else fila.eco = a ?? ''
        nuevas[i + k] = fila
      })
      return nuevas
    })
  }
  function tecla(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (i === filas.length - 1) setFilas(f => [...f, { serie: '', eco: '' }])
    setEnfocar(i + 1)
  }

  async function guardar() {
    if (!prod || !empresa) return
    setError(''); setGuardando(true)
    try {
      if (!prod.categoria_id) throw new Error('Este producto no tiene categoría. Edítalo en el Catálogo y vuelve a intentar.')
      const lista = validas.length ? validas : [{ serie: '', eco: '' }]
      const filasBD = lista.map(f => ({
        empresa_id: empresa, categoria_id: prod.categoria_id, marca_id: prod.marca_id, modelo_id: prod.id,
        descripcion: descripcion.trim() || descDefecto,
        serie: f.serie.trim() || null, numero_economico: f.eco.trim() || null, fecha_alta: fechaAlta || undefined,
        ubicacion_id: ubicacion || null, valor_referencia: valor ? Number(valor) : null,
        notas: [f.comentario?.trim(), factura.trim() && `Factura ${factura.trim()}`, notas.trim()].filter(Boolean).join(' · ') || null,
      }))
      const { data, error } = await supabase.from('activos').insert(filasBD).select('id,codigo')
      if (error) throw error
      const creados = (data as { id: string; codigo: string }[]) ?? []
      if (esVehiculo) {
        const veh = creados.map((c, i) => ({ activo_id: c.id, placa: lista[i].placa?.trim().toUpperCase() || null, anio: lista[i].anio ? Number(lista[i].anio) : null, color: lista[i].color?.trim() || null,
          numero_motor: lista[i].motor?.trim() || null, kilometraje: lista[i].km ? Number(lista[i].km) : null }))
        const rv = await supabase.from('activo_vehiculo').upsert(veh, { onConflict: 'activo_id' })
        if (rv.error) throw rv.error
        const kms = creados.map((c, i) => ({ activo_id: c.id, empresa_id: empresa, tipo: 'km', valor: Number(lista[i].km), nota: 'Kilometraje al dar de alta' })).filter(x => x.valor > 0)
        if (kms.length) await supabase.from('lecturas').insert(kms)
      }
      let mov: string | null = null
      if (empleado) {
        const emp = empleados.items.find(x => x.id === empleado)
        const r = await supabase.rpc('registrar_movimiento', {
          p_tipo: 'asignacion', p_empresa: empresa, p_activos: creados.map(c => c.id), p_a_empleado: empleado, p_a_ubicacion: ubicacion || null,
          p_entrega_nombre: perfil?.nombre ?? '', p_recibe_nombre: nombreEmpleado(emp as never), p_notas: notas.trim() || null, p_estados: {},
        })
        if (r.error) throw r.error
        mov = r.data as string
      }
      setHecho({ ids: creados.map(c => c.id), codigos: creados.map(c => c.codigo), mov })
    } catch (e) { setError(mensajeError(e)) } finally { setGuardando(false) }
  }

  function reiniciar() { setHecho(null); setPaso(0); setProd(null); setFilas([{ serie: '', eco: '' }]); setValor(''); setEmpleado(''); setNotas(''); setDescripcion(''); setFactura(''); setSinSerie(false) }

  if (!productos) return <Cargando />

  if (hecho) return (
    <div className="mx-auto max-w-2xl animate-entrar py-6 text-center">
      <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 shadow-[0_0_60px_-10px_rgb(52_211_153/.7)]"><Check size={38} /></div>
      <h1 className="text-3xl font-semibold">¡Listo! {hecho.codigos.length} activo(s) dados de alta</h1>
      <p className="mt-2 text-stone-500">{prod?.marcas?.nombre} {prod?.nombre}{hecho.mov ? ' · asignados con resguardo pendiente de firma' : ''}</p>
      <div className="mx-auto mt-6 flex max-w-lg flex-wrap justify-center gap-2">
        {hecho.codigos.map(c => <span key={c} className="rounded-lg border border-marca/30 bg-marca/10 px-2.5 py-1 font-mono text-xs text-marca">{c}</span>)}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {hecho.mov && <Link to={`/resguardos/${hecho.mov}`} className="btn-primario"><PenLine size={16} />Firmar resguardo</Link>}
        <Link to={`/etiquetas?ids=${hecho.ids.join(',')}`} className={hecho.mov ? 'btn-sec' : 'btn-primario'}><Tags size={16} />Imprimir etiquetas QR</Link>
        <button className="btn-sec" onClick={reiniciar}><PackagePlus size={16} />Dar de alta más</button>
        {prod && <Link to={`/catalogo/${prod.id}`} className="btn-sec">Ver producto</Link>}
      </div>
    </div>
  )

  const t = q.trim().toLowerCase()
  const lista = productos.filter(p => !t || [p.nombre, p.marcas?.nombre, p.descripcion, p.categorias?.nombre].some(x => x?.toLowerCase().includes(t)))
  const emp = empresas.find(e => e.id === empresa)
  const ubis = ubicaciones.items.filter(u => (u as { empresa_id?: string }).empresa_id === empresa)
  const emps = empleados.items.filter(u => (u as { empresa_id?: string }).empresa_id === empresa)
  const esVehiculo = !!(prod?.categorias as { es_vehiculo?: boolean } | null | undefined)?.es_vehiculo
  const descDefecto = prod ? (prod.descripcion || `${prod.categorias?.nombre ? prod.categorias.nombre.replace(/s$/, '') + ' ' : ''}${prod.marcas?.nombre ?? ''} ${prod.nombre}`.trim()) : ''
  const sinSerieN = (validas.length ? validas : filas).filter(f => !f.serie.trim()).length
  const puedeSeguir = paso === 0 ? !!prod : paso === 1 ? !!empresa && repetidas.size === 0 && (sinSerieN === 0 || sinSerie) : true

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-marca/30 bg-marca/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[.16em] text-marca"><Sparkles size={12} />Alta rápida</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">Dar de alta activos</h1>
        </div>
        <Link to="/activos/nuevo" className="text-sm text-stone-500 hover:text-marca">Alta detallada (vehículos, valor, notas) →</Link>
      </div>

      {/* Pasos */}
      <ol className="mb-8 grid grid-cols-3 gap-2">
        {PASOS.map((n, i) => (
          <li key={n}>
            <button disabled={i > paso && !(i === 1 && prod) && !(i === 2 && prod && empresa)} onClick={() => setPaso(i)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition disabled:cursor-not-allowed ${i === paso ? 'border-marca bg-marca/10 shadow-[0_0_24px_-10px_rgb(226_166_75/.8)]' : i < paso ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200'}`}>
              <span className={`mb-1 grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${i === paso ? 'bg-marca text-[#120D04]' : i < paso ? 'bg-emerald-400 text-[#06281b]' : 'bg-stone-100 text-stone-500'}`}>{i < paso ? <Check size={13} /> : i + 1}</span>
              <span className="block text-sm font-medium">{n}</span>
              <span className="hidden truncate text-[11px] text-stone-500 sm:block">{i === 0 ? (prod ? `${prod.marcas?.nombre} ${prod.nombre}` : '¿Qué vas a dar de alta?') : i === 1 ? (emp ? `${cantidad} en ${emp.nombre_corto || emp.nombre}` : '¿Cuántas y de qué empresa?') : '¿Dónde o a quién?'}</span>
            </button>
          </li>
        ))}
      </ol>

      <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={e => { leerFoto(e.target.files?.[0]); e.target.value = '' }} />
      {(leyendo || lectura || errorIA) && (
        <div className={`tarjeta mb-6 flex animate-entrar flex-wrap items-center gap-4 p-4 ${errorIA ? '!border-red-200' : '!border-marca/40'}`}>
          {lectura?.foto && <img src={lectura.foto} alt="" className="h-16 w-20 shrink-0 rounded-lg object-cover" />}
          {leyendo ? <p className="flex items-center gap-2 text-sm"><Loader2 size={18} className="animate-spin text-marca" />Leyendo la etiqueta…</p>
            : errorIA ? <p className="min-w-0 flex-1 text-sm text-red-700">No se pudo leer la foto: {errorIA}</p>
            : lectura && (() => { const p = buscarProducto(productos, lectura); return (
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-marca"><Sparkles size={12} />Leído de la foto · confianza {lectura.confianza ?? 'media'}</p>
                <p className="truncate font-medium">{[lectura.marca, lectura.modelo].filter(Boolean).join(' ') || lectura.descripcion || 'Sin marca ni modelo visibles'}</p>
                <p className="text-xs text-stone-500">{lectura.serie ? <>Serie <span className="font-mono text-tinta">{lectura.serie}</span> {paso === 1 ? 'ya está en la lista' : 'se agregó a la lista'}</> : 'No se vio número de serie'}{p ? ` · producto encontrado en el catálogo` : ''}</p>
              </div>
            ) })()}
          {!leyendo && lectura && !buscarProducto(productos, lectura) && (lectura.marca || lectura.modelo) && <button className="btn-primario" onClick={() => setModal(true)}><Plus size={16} />Crear “{[lectura.marca, lectura.modelo].filter(Boolean).join(' ')}”</button>}
          {!leyendo && <button className="btn-sec" onClick={() => camara.current?.click()}><Camera size={16} />Otra foto</button>}
        </div>
      )}

      {paso === 0 && (
        <section className="animate-entrar">
          <Link to="/alta/inteligente" className="viva group mb-3 flex w-full items-center gap-4 rounded-2xl border border-marca/60 bg-gradient-to-r from-marca/20 via-marca/5 to-transparent p-4 text-left transition hover:border-marca">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#EBB866] to-[#CF9336] text-[#120D04]"><FileUp size={24} /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">Alta inteligente: sube la factura, bitácora o una foto</span><span className="block text-sm text-stone-500">La IA arma todo el alta (varios equipos a la vez) y solo te pregunta a quién se entrega.</span></span>
            <Sparkles size={18} className="shrink-0 text-marca transition group-hover:rotate-12" />
          </Link>
          <button onClick={() => camara.current?.click()} disabled={leyendo} className="viva group mb-5 flex w-full items-center gap-4 rounded-2xl border border-marca/40 bg-gradient-to-r from-marca/15 via-marca/5 to-transparent p-4 text-left transition hover:border-marca">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#EBB866] to-[#CF9336] text-[#120D04] shadow-[0_8px_30px_-8px_rgb(226_166_75/.8)]"><ScanText size={24} /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">Tomar foto de la etiqueta</span><span className="block text-sm text-stone-500">La IA lee marca, modelo y número de serie, y busca el producto en el catálogo.</span></span>
            <Sparkles size={18} className="shrink-0 text-marca transition group-hover:rotate-12" />
          </button>
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 basis-60">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input className="campo pl-10" autoFocus placeholder="Busca el producto: marca, modelo, tipo…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <button className="btn-sec" onClick={() => setModal(true)}><Plus size={16} />Producto nuevo</button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {lista.map(p => (
              <button key={p.id} onClick={() => { setProd(p); setPaso(1) }}
                className={`tarjeta viva group min-w-0 overflow-hidden text-left ${prod?.id === p.id ? '!border-marca ring-2 ring-marca/40' : ''}`}>
                <FotoActivo fotoModelo={p.foto_path} categoria={p.categorias?.nombre} className="aspect-[4/3] w-full" icono={36} />
                <div className="p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-marca">{p.marcas?.nombre}</p>
                  <p className="truncate text-sm font-semibold">{p.nombre}</p>
                  <p className="truncate text-[11px] text-stone-500">{p.descripcion || p.categorias?.nombre}</p>
                </div>
              </button>
            ))}
            <button onClick={() => setModal(true)} className="grid min-h-40 place-items-center rounded-2xl border-2 border-dashed border-stone-300 p-4 text-center text-sm text-stone-500 transition hover:border-marca hover:text-marca">
              <span className="flex flex-col items-center gap-2"><Plus size={24} />¿No está?<br />Créalo aquí</span>
            </button>
          </div>
        </section>
      )}

      {paso === 1 && prod && (
        <section className="grid animate-entrar gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            <div className="tarjeta p-5">
              <h2 className="mb-3 text-sm font-semibold">¿De qué empresa?</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {empresas.map(e => (
                  <button key={e.id} onClick={() => { setEmpresa(e.id); setUbicacion(''); setEmpleado('') }}
                    className={`grid h-20 place-items-center rounded-xl border px-3 transition ${empresa === e.id ? 'border-marca bg-marca/10 ring-2 ring-marca/30' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'}`} title={e.nombre}>
                    <LogoEmpresa empresa={e} alto={34} ancho={150} />
                  </button>
                ))}
              </div>
            </div>
            <div className="tarjeta space-y-4 p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText size={16} className="text-marca" />Descripción y datos de compra</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Descripción" className="sm:col-span-2"><input className="campo" value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder={descDefecto} /></Campo>
                <Campo label="Fecha de alta / compra"><input className="campo" type="date" value={fechaAlta} onChange={e => setFechaAlta(e.target.value)} /></Campo>
                <Campo label="Factura o folio de compra"><input className="campo" value={factura} onChange={e => setFactura(e.target.value)} placeholder="A-4821" /></Campo>
                <Campo label="Comentarios para todas las unidades" className="sm:col-span-2"><textarea className="campo" rows={2} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Accesorios incluidos, garantía, estado, observaciones…" /></Campo>
              </div>
            </div>
            <div className="tarjeta p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold">{esVehiculo && <Car size={16} className="text-marca" />}{esVehiculo ? 'Unidades (VIN, placas y datos del vehículo)' : 'Números de serie'} <span className="ml-1 rounded-full bg-marca/15 px-2 py-0.5 text-xs text-marca">{cantidad} unidad(es)</span></h2>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-500"><ClipboardPaste size={13} />Puedes pegar una columna de Excel · Enter agrega renglón</span>
              </div>
              <div className="space-y-3">
                {filas.map((f, i) => {
                  const rep = f.serie.trim() && repetidas.has(f.serie.trim().toUpperCase())
                  const set = (c: Partial<Fila>) => setFilas(fs => fs.map((x, k) => k === i ? { ...x, ...c } : x))
                  return (
                    <div key={i} className="rounded-xl border border-stone-200 p-3">
                      <div className="mb-2 flex items-center justify-between"><span className="cifra text-xs font-semibold text-stone-500">Unidad {i + 1}</span>
                        <button className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 hover:text-red-700 disabled:opacity-30" disabled={filas.length === 1} onClick={() => setFilas(fs => fs.filter((_, k) => k !== i))} aria-label="Quitar unidad"><Trash2 size={14} /></button></div>
                      <div className={`grid gap-2 ${esVehiculo ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                        <Campo label={esVehiculo ? 'VIN / No. de serie *' : 'No. de serie *'}><input ref={el => { refs.current[i] = el }} className={`campo font-mono ${rep ? '!border-red-200 !bg-red-50' : ''}`} placeholder={esVehiculo ? '17 caracteres' : 'Ej. PF3XYZ12'} value={f.serie}
                          onChange={e => set({ serie: e.target.value })} onPaste={e => pegar(i, e, 'serie')} onKeyDown={e => tecla(i, e)} /></Campo>
                        <Campo label="No. económico"><input className="campo" placeholder="Opcional" value={f.eco} onChange={e => set({ eco: e.target.value })} onPaste={e => pegar(i, e, 'eco')} onKeyDown={e => tecla(i, e)} /></Campo>
                        {esVehiculo && <>
                          <Campo label="Placas"><input className="campo uppercase" value={f.placa ?? ''} onChange={e => set({ placa: e.target.value })} placeholder="CY-12-345" /></Campo>
                          <Campo label="Año (modelo)"><input className="campo" type="number" min="1980" max="2100" value={f.anio ?? ''} onChange={e => set({ anio: e.target.value })} placeholder="2024" /></Campo>
                          <Campo label="Color"><input className="campo" value={f.color ?? ''} onChange={e => set({ color: e.target.value })} placeholder="Blanco" /></Campo>
                          <Campo label="No. de motor"><input className="campo font-mono" value={f.motor ?? ''} onChange={e => set({ motor: e.target.value })} /></Campo>
                          <Campo label="Kilometraje actual"><input className="campo" type="number" min="0" value={f.km ?? ''} onChange={e => set({ km: e.target.value })} placeholder="0" /></Campo>
                        </>}
                        <Campo label="Comentario de esta unidad" className={esVehiculo ? 'sm:col-span-2' : 'sm:col-span-2'}><input className="campo" value={f.comentario ?? ''} onChange={e => set({ comentario: e.target.value })} placeholder="Rayón en la tapa, trae cargador…" /></Campo>
                      </div>
                    </div>
                  )
                })}
              </div>
              {repetidas.size > 0 && <div className="mt-3"><Aviso>Hay series repetidas: {[...repetidas].join(', ')}</Aviso></div>}
              {sinSerieN > 0 && (
                <label className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <input type="checkbox" className="mt-0.5" checked={sinSerie} onChange={e => setSinSerie(e.target.checked)} />
                  <span>{sinSerieN} unidad(es) sin número de serie. Márcalo si de verdad no tienen (herramienta menor, mobiliario) para poder seguir.</span>
                </label>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-sec !py-1.5 text-xs" onClick={() => setFilas(f => [...f, { serie: '', eco: '' }])}><Plus size={14} />Unidad</button>
                <button className="btn-sec !py-1.5 text-xs" onClick={() => setFilas(f => [...f, ...Array.from({ length: 5 }, () => ({ serie: '', eco: '' }))])}><Plus size={14} />5 unidades</button>
              </div>
            </div>
          </div>
          <aside className="space-y-4">
            <div className="tarjeta overflow-hidden">
              <FotoActivo fotoModelo={prod.foto_path} categoria={prod.categorias?.nombre} className="aspect-[4/3] w-full" icono={48} />
              <div className="p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-marca">{prod.marcas?.nombre}</p><p className="font-semibold">{prod.nombre}</p><p className="text-xs text-stone-500">{prod.categorias?.nombre}</p>
                <button className="mt-2 text-xs text-marca hover:underline" onClick={() => setPaso(0)}>Cambiar producto</button></div>
            </div>
            <Campo label="Valor de referencia por unidad (opcional)"><input className="campo" type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="$" /></Campo>
          </aside>
        </section>
      )}

      {paso === 2 && prod && emp && (
        <section className="grid animate-entrar gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            <div className="tarjeta p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MapPin size={16} className="text-marca" />¿Dónde va a estar?</h2>
              <select className="campo" value={ubicacion} onChange={e => setUbicacion(e.target.value)}>
                <option value="">— Sin ubicación por ahora —</option>
                {ubis.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
            <div className="tarjeta p-5">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><UserRound size={16} className="text-marca" />¿Se entrega a alguien?</h2>
              <p className="mb-3 text-xs text-stone-500">Si eliges a un empleado, se genera su resguardo con folio para firmar. Si no, quedan como disponibles.</p>
              <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                <button onClick={() => setEmpleado('')} className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${!empleado ? 'border-marca bg-marca/10' : 'border-stone-200 hover:bg-stone-50'}`}>
                  <span className="font-medium">Nadie todavía</span><span className="block text-xs text-stone-500">Quedan disponibles en almacén</span>
                </button>
                {emps.map(e => (
                  <button key={e.id} onClick={() => setEmpleado(e.id)} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${empleado === e.id ? 'border-marca bg-marca/10' : 'border-stone-200 hover:bg-stone-50'}`}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-100 text-[11px] font-bold text-marca">{nombreEmpleado(e as never).split(' ').slice(0, 2).map(p => p[0]).join('')}</span>
                    <span className="min-w-0"><span className="block truncate font-medium">{nombreEmpleado(e as never)}</span><span className="block truncate text-xs text-stone-500">{(e as { puesto?: string }).puesto ?? ''}</span></span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <aside className="tarjeta h-fit p-5">
            <h2 className="mb-4 text-sm font-semibold">Resumen</h2>
            <div className="mb-4 grid place-items-center rounded-xl border border-stone-200 py-3"><LogoEmpresa empresa={emp} alto={32} ancho={170} /></div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-stone-500">Producto</dt><dd className="truncate text-right">{prod.marcas?.nombre} {prod.nombre}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-stone-500">Unidades</dt><dd className="cifra text-lg font-semibold text-marca">{cantidad}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-stone-500">Ubicación</dt><dd className="truncate text-right">{ubis.find(u => u.id === ubicacion)?.nombre ?? '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-stone-500">Se entrega a</dt><dd className="truncate text-right">{empleado ? nombreEmpleado(emps.find(e => e.id === empleado) as never) : 'Nadie'}</dd></div>
            </dl>
            {faltan.length > 0 && <div className="mt-4"><Aviso><span className="flex gap-2"><AlertTriangle size={16} className="shrink-0" /><span>No se puede entregar a {nombreEmpleado(emps.find(e => e.id === empleado) as never)}: le falta {faltan.join(', ').toLowerCase()}. Súbela en su ficha (<Link to={`/empleados/${empleado}`} className="underline">Empleados → Documentos</Link>) o elige otra persona.</span></span></Aviso></div>}
            {error && <div className="mt-4"><Aviso>{error}</Aviso></div>}
            <button className="btn-primario mt-5 w-full py-3" disabled={guardando || faltan.length > 0} onClick={guardar}>
              {guardando ? 'Guardando…' : <><Check size={16} />Dar de alta {cantidad} activo(s)</>}
            </button>
          </aside>
        </section>
      )}

      {/* navegación entre pasos */}
      <div className="mt-8 flex justify-between">
        <button className="btn-sec" disabled={paso === 0} onClick={() => setPaso(p => p - 1)}><ChevronLeft size={16} />Atrás</button>
        {paso < 2 && <button className="btn-primario" disabled={!puedeSeguir} onClick={() => setPaso(p => p + 1)}>Siguiente<ChevronRight size={16} /></button>}
      </div>

      <ProductoModal inicial={inicialProd} abierto={modal} onCerrar={() => setModal(false)}
        onGuardado={p => { setModal(false); setProductos(l => [p, ...(l ?? [])]); setProd(p); setPaso(1) }} />
    </div>
  )
}
