import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, FileUp, Camera, Loader2, Check, Trash2, Plus, Search, UserRound, Tags, PenLine, ChevronLeft, FileText, Warehouse, RotateCcw } from 'lucide-react'
import { leerDocumento, type DocumentoLeido } from '../lib/ia'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nombreEmpleado } from '../lib/hooks'
import { Aviso, Campo } from '../components/ui'

type Renglon = { k: number; incluir: boolean; descripcion: string; marca: string; modelo: string; serie: string; eco: string; placa: string; categoria_id: string; cantidad: number }
type Empleado = { id: string; nombres: string; apellidos: string | null; puesto: string | null; empresa_id: string; empresas: { nombre: string; nombre_corto: string | null } | null }
type Empresa = { id: string; nombre: string; nombre_corto: string | null; rfc: string | null; razon_social: string | null }
type Cat = { id: string; nombre: string; es_vehiculo: boolean }

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const TIPO_DOC: Record<string, string> = { factura: 'Factura', bitacora: 'Bitácora', lista: 'Lista', remision: 'Remisión', foto: 'Foto', otro: 'Documento' }

function categoriaDe(nombre: string | null, cats: Cat[]): string {
  const n = norm(nombre)
  const sin: Record<string, string> = { telefonia: 'equipodecomunicacion', comunicacion: 'equipodecomunicacion', computo: 'equipodecomputo', topografia: 'equipodetopografia', vehiculo: 'vehiculos', maquinaria: 'maquinariapesada' }
  const objetivo = Object.entries(sin).find(([k]) => n.includes(k))?.[1] ?? n
  return (cats.find(c => norm(c.nombre) === objetivo) ?? cats.find(c => n && norm(c.nombre).includes(n)) ?? cats.find(c => norm(c.nombre) === 'equipomenor') ?? cats[0])?.id ?? ''
}
function empresaDe(doc: DocumentoLeido, empresas: Empresa[]): string {
  const rfc = norm(doc.empresa?.rfc), rs = norm(doc.empresa?.razon_social)
  if (rfc) { const e = empresas.find(x => norm(x.rfc) === rfc); if (e) return e.id }
  if (rs) {
    const e = empresas.find(x => [x.razon_social, x.nombre, x.nombre_corto].some(v => { const n = norm(v); return n.length > 3 && (rs.includes(n) || n.includes(rs)) }))
    if (e) return e.id
  }
  return ''
}

/** Alta inteligente: sube la factura, bitácora o una foto; la IA arma la lista y solo preguntamos a quién se entrega. */
export default function AltaInteligente() {
  const { perfil, puedeEditar } = useAuth()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [doc, setDoc] = useState<(DocumentoLeido & { vista?: string; nombre: string }) | null>(null)
  const [filas, setFilas] = useState<Renglon[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [empleado, setEmpleado] = useState<string | null>(null) // null = no ha elegido; '' = nadie
  const [q, setQ] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState<{ ids: string[]; codigos: string[]; mov: string | null } | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const camara = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('empresas').select('id,nombre,nombre_corto,rfc,razon_social').eq('activo', true).order('nombre').then(({ data }) => setEmpresas((data as Empresa[]) ?? []))
    supabase.from('categorias').select('id,nombre,es_vehiculo').eq('activo', true).order('nombre').then(({ data }) => setCats((data as Cat[]) ?? []))
    supabase.from('empleados').select('id,nombres,apellidos,puesto,empresa_id,empresas(nombre,nombre_corto)').eq('activo', true).order('nombres').limit(5000)
      .then(({ data }) => setEmpleados((data as unknown as Empleado[]) ?? []))
  }, [])

  async function leer(f?: File | null) {
    if (!f) return
    setLeyendo(true); setError(''); setDoc(null); setFilas([]); setEmpleado(null)
    try {
      const d = await leerDocumento(f, nota.trim() || undefined)
      let k = 0
      const fs: Renglon[] = d.equipos.map(e => ({
        k: k++, incluir: true, descripcion: e.descripcion ?? [e.marca, e.modelo].filter(Boolean).join(' '), marca: e.marca ?? '', modelo: e.modelo ?? '',
        serie: e.serie ?? '', eco: e.numero_economico ?? '', placa: e.placa ?? '', categoria_id: categoriaDe(e.categoria, cats), cantidad: Math.max(1, Math.min(200, Number(e.cantidad) || 1)),
      }))
      setDoc({ ...d, nombre: f.name }); setFilas(fs); setEmpresa(empresaDe(d, empresas))
      if (!fs.length) setError('No encontré equipos en el documento. Puedes agregarlos a mano abajo o probar con otra foto más clara.')
    } catch (e) { setError((e as Error).message) } finally { setLeyendo(false) }
  }

  const incluidos = filas.filter(f => f.incluir && f.descripcion.trim())
  const unidades = incluidos.reduce((s, f) => s + (f.serie.trim() ? 1 : f.cantidad), 0)
  const emp = empleados.find(e => e.id === empleado)
  const empresaFinal = empresa || emp?.empresa_id || ''
  const distinta = !!(emp && empresa && emp.empresa_id !== empresa)
  const t = norm(q)
  const lista = useMemo(() => empleados.filter(e => !t || norm(`${e.nombres} ${e.apellidos ?? ''} ${e.puesto ?? ''} ${e.empresas?.nombre_corto ?? ''}`).includes(t)).slice(0, 60), [empleados, t])
  const cambiar = (k: number, c: Partial<Renglon>) => setFilas(fs => fs.map(f => f.k === k ? { ...f, ...c } : f))

  async function crear() {
    if (!empresaFinal) return setError('Elige la empresa dueña del equipo.')
    setError(''); setGuardando(true)
    try {
      const [rm, rmo] = await Promise.all([supabase.from('marcas').select('id,nombre'), supabase.from('modelos').select('id,nombre,marca_id')])
      const marcas = ((rm.data ?? []) as { id: string; nombre: string }[]), modelos = ((rmo.data ?? []) as { id: string; nombre: string; marca_id: string }[])
      async function marcaId(nombre: string) {
        if (!nombre.trim()) return null
        const ya = marcas.find(m => norm(m.nombre) === norm(nombre)); if (ya) return ya.id
        const { data, error } = await supabase.from('marcas').insert({ nombre: nombre.trim() }).select('id,nombre').single()
        if (error) throw error
        marcas.push(data as { id: string; nombre: string }); return (data as { id: string }).id
      }
      async function modeloId(nombre: string, marca: string | null, f: Renglon) {
        if (!nombre.trim() || !marca) return null
        const ya = modelos.find(m => m.marca_id === marca && norm(m.nombre) === norm(nombre)); if (ya) return ya.id
        const { data, error } = await supabase.from('modelos').insert({ marca_id: marca, nombre: nombre.trim(), categoria_id: f.categoria_id || null, descripcion: f.descripcion.trim() || null }).select('id,nombre,marca_id').single()
        if (error) throw error
        modelos.push(data as { id: string; nombre: string; marca_id: string }); return (data as { id: string }).id
      }
      const origen = [doc ? TIPO_DOC[doc.tipo_documento ?? ''] ?? 'Documento' : null, doc?.folio, doc?.proveedor?.nombre, doc?.fecha].filter(Boolean).join(' · ')
      const nuevos: Record<string, unknown>[] = [], placas: (string | null)[] = []
      for (const f of incluidos) {
        const ma = await marcaId(f.marca), mo = await modeloId(f.modelo, ma, f)
        const n = f.serie.trim() ? 1 : f.cantidad
        for (let i = 0; i < n; i++) {
          nuevos.push({ empresa_id: empresaFinal, categoria_id: f.categoria_id, marca_id: ma, modelo_id: mo, descripcion: f.descripcion.trim(),
            serie: f.serie.trim() || null, numero_economico: f.eco.trim() || null, notas: origen ? `Alta inteligente desde ${origen}` : 'Alta inteligente' })
          placas.push(f.placa.trim() || null)
        }
      }
      const { data, error } = await supabase.from('activos').insert(nuevos).select('id,codigo')
      if (error) throw error
      const creados = (data as { id: string; codigo: string }[]) ?? []
      const conPlaca = creados.map((c, i) => ({ activo_id: c.id, placa: placas[i] })).filter(x => x.placa)
      if (conPlaca.length) await supabase.from('activo_vehiculo').upsert(conPlaca, { onConflict: 'activo_id' })
      let mov: string | null = null
      if (emp) {
        const r = await supabase.rpc('registrar_movimiento', {
          p_tipo: 'asignacion', p_empresa: empresaFinal, p_activos: creados.map(c => c.id), p_a_empleado: emp.id, p_a_ubicacion: null,
          p_entrega_nombre: perfil?.nombre ?? '', p_recibe_nombre: nombreEmpleado(emp), p_notas: origen || null, p_estados: {},
        })
        if (r.error) throw r.error
        mov = r.data as string
      }
      setHecho({ ids: creados.map(c => c.id), codigos: creados.map(c => c.codigo), mov })
    } catch (e) { setError(mensajeError(e)) } finally { setGuardando(false) }
  }

  function otra() { setHecho(null); setDoc(null); setFilas([]); setEmpleado(null); setEmpresa(''); setError(''); setQ('') }

  if (!puedeEditar) return <Aviso tipo="info">Solo Almacén y administradores pueden dar de alta activos.</Aviso>

  if (hecho) return (
    <div className="mx-auto max-w-2xl animate-entrar py-6 text-center">
      <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><Check size={38} /></div>
      <h1 className="text-3xl font-semibold">¡Listo! {hecho.codigos.length} activo(s) dados de alta</h1>
      <p className="mt-2 text-stone-500">{emp ? `Asignados a ${nombreEmpleado(emp)} · resguardo pendiente de firma` : 'Quedan disponibles en almacén'}</p>
      <div className="mx-auto mt-6 flex max-w-lg flex-wrap justify-center gap-2">{hecho.codigos.map(c => <span key={c} className="rounded-lg border border-marca/30 bg-marca/10 px-2.5 py-1 font-mono text-xs text-marca">{c}</span>)}</div>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {hecho.mov && <Link to={`/resguardos/${hecho.mov}`} className="btn-primario"><PenLine size={16} />Firmar resguardo</Link>}
        <Link to={`/etiquetas?ids=${hecho.ids.join(',')}`} className={hecho.mov ? 'btn-sec' : 'btn-primario'}><Tags size={16} />Imprimir etiquetas QR</Link>
        <button className="btn-sec" onClick={otra}><RotateCcw size={16} />Otro documento</button>
      </div>
    </div>
  )

  return (
    <div>
      <Link to="/alta" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ChevronLeft size={15} />Alta rápida</Link>
      <div className="mb-6">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-marca/30 bg-marca/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[.16em] text-marca"><Sparkles size={12} />Alta inteligente</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">Sube la factura, la bitácora o una foto</h1>
        <p className="mt-1 text-sm text-stone-500">La IA lee los equipos (marca, modelo, serie, placa) y la empresa. Tú solo revisas y dices a quién se le entrega.</p>
      </div>

      <input ref={archivo} type="file" accept="image/*,application/pdf" hidden onChange={e => { leer(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={e => { leer(e.target.files?.[0]); e.target.value = '' }} />

      {!doc && (
        <section className="tarjeta p-6"
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); leer(e.dataTransfer.files?.[0]) }}>
          <div className="grid place-items-center gap-4 rounded-2xl border-2 border-dashed border-stone-300 px-4 py-10 text-center">
            {leyendo ? <>
              <Loader2 size={36} className="animate-spin text-marca" />
              <p className="font-medium">Leyendo el documento…</p><p className="text-sm text-stone-500">Suele tardar entre 5 y 20 segundos.</p>
            </> : <>
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-marca/15 text-marca"><FileUp size={26} /></span>
              <div><p className="font-semibold">Arrastra aquí el archivo</p><p className="text-sm text-stone-500">Factura en PDF, foto de la factura, bitácora o lista de equipo, o foto de la etiqueta del equipo.</p></div>
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn-primario" onClick={() => archivo.current?.click()}><FileUp size={16} />Elegir archivo</button>
                <button className="btn-sec" onClick={() => camara.current?.click()}><Camera size={16} />Tomar foto</button>
              </div>
              <input className="campo max-w-md text-sm" value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional: una pista, ej. “son las laptops del área de TI”" />
            </>}
          </div>
          {error && <div className="mt-4"><Aviso>{error}</Aviso></div>}
        </section>
      )}

      {doc && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            <section className="tarjeta flex flex-wrap items-center gap-4 p-4">
              {doc.vista ? <img src={doc.vista} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" /> : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-stone-100 text-marca"><FileText size={26} /></span>}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-marca"><Sparkles size={12} />{TIPO_DOC[doc.tipo_documento ?? ''] ?? 'Documento'} · confianza {doc.confianza ?? 'media'}</p>
                <p className="truncate font-medium">{[doc.proveedor?.nombre, doc.folio && `Folio ${doc.folio}`, doc.fecha].filter(Boolean).join(' · ') || doc.nombre}</p>
                <p className="truncate text-xs text-stone-500">{doc.empresa?.razon_social ? `Para: ${doc.empresa.razon_social}${doc.empresa.rfc ? ` (${doc.empresa.rfc})` : ''}` : 'No se ve a qué empresa se facturó'}</p>
              </div>
              <button className="btn-sec" onClick={otra}><RotateCcw size={15} />Otro</button>
            </section>

            <section className="tarjeta overflow-hidden">
              <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
                <h2 className="text-sm font-semibold">Equipos encontrados <span className="ml-1 rounded-full bg-marca/15 px-2 py-0.5 text-xs text-marca">{unidades} unidad(es)</span></h2>
                <button className="btn-sec !py-1.5 text-xs" onClick={() => setFilas(fs => [...fs, { k: Date.now(), incluir: true, descripcion: '', marca: '', modelo: '', serie: '', eco: '', placa: '', categoria_id: categoriaDe(null, cats), cantidad: 1 }])}><Plus size={14} />Renglón</button>
              </div>
              <div className="divide-y divide-stone-100">
                {filas.map(f => {
                  const vehiculo = cats.find(c => c.id === f.categoria_id)?.es_vehiculo
                  return (
                    <div key={f.k} className={`grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 ${f.incluir ? '' : 'opacity-45'}`}>
                      <label className="col-span-full flex items-center gap-2">
                        <input type="checkbox" checked={f.incluir} onChange={e => cambiar(f.k, { incluir: e.target.checked })} />
                        <input className="campo !py-1.5 font-medium" value={f.descripcion} onChange={e => cambiar(f.k, { descripcion: e.target.value })} placeholder="Qué es" aria-label="Descripción" />
                        <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-stone-400 hover:text-red-700" onClick={() => setFilas(fs => fs.filter(x => x.k !== f.k))} aria-label="Quitar"><Trash2 size={15} /></button>
                      </label>
                      <Campo label="Marca"><input className="campo !py-1.5" value={f.marca} onChange={e => cambiar(f.k, { marca: e.target.value })} /></Campo>
                      <Campo label="Modelo"><input className="campo !py-1.5" value={f.modelo} onChange={e => cambiar(f.k, { modelo: e.target.value })} /></Campo>
                      <Campo label="Serie" className="col-span-2"><input className="campo !py-1.5 font-mono" value={f.serie} onChange={e => cambiar(f.k, { serie: e.target.value })} placeholder={f.cantidad > 1 ? 'Varias: déjalo vacío' : ''} /></Campo>
                      <Campo label="Categoría" className="col-span-2 sm:col-span-2"><select className="campo !py-1.5" value={f.categoria_id} onChange={e => cambiar(f.k, { categoria_id: e.target.value })}>{cats.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
                      {f.serie.trim()
                        ? <Campo label={vehiculo ? 'Placa' : 'No. económico'} className="col-span-2"><input className="campo !py-1.5" value={vehiculo ? f.placa : f.eco} onChange={e => cambiar(f.k, vehiculo ? { placa: e.target.value } : { eco: e.target.value })} /></Campo>
                        : <Campo label="Cantidad" className="col-span-2"><input className="campo !py-1.5" type="number" min={1} max={200} value={f.cantidad} onChange={e => cambiar(f.k, { cantidad: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })} /></Campo>}
                    </div>
                  )
                })}
                {!filas.length && <p className="p-4 text-sm text-stone-500">Sin renglones. Agrega uno con el botón de arriba.</p>}
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
            <section className="tarjeta p-4">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><UserRound size={16} className="text-marca" />¿A quién se le entrega?</h2>
              <p className="mb-3 text-xs text-stone-500">Se genera su resguardo para firmar. Si nadie, quedan disponibles.</p>
              <div className="relative mb-2"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !py-2 pl-9 text-sm" value={q} onChange={e => setQ(e.target.value)} placeholder="Busca empleado…" /></div>
              <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                <button onClick={() => setEmpleado('')} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${empleado === '' ? 'bg-marca/15 text-tinta ring-1 ring-marca/40' : 'hover:bg-stone-100'}`}><Warehouse size={15} className="text-stone-500" />Nadie, al almacén</button>
                {lista.map(e => (
                  <button key={e.id} onClick={() => setEmpleado(e.id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${empleado === e.id ? 'bg-marca/15 ring-1 ring-marca/40' : 'hover:bg-stone-100'}`}>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{nombreEmpleado(e)}</span><span className="block truncate text-[11px] text-stone-500">{[e.puesto, e.empresas?.nombre_corto || e.empresas?.nombre].filter(Boolean).join(' · ')}</span></span>
                    {empleado === e.id && <Check size={15} className="text-marca" />}
                  </button>
                ))}
                {!empleados.length && <p className="px-3 py-2 text-xs text-stone-500">Aún no hay empleados. <Link to="/empleados" className="text-marca hover:underline">Dar de alta</Link></p>}
              </div>
            </section>
            <section className="tarjeta space-y-3 p-4">
              <Campo label="Empresa dueña del equipo">
                <select className="campo" value={empresaFinal} onChange={e => setEmpresa(e.target.value)}>
                  <option value="">Elige…</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre_corto || e.nombre}</option>)}
                </select>
              </Campo>
              {empresa && doc.empresa?.razon_social && <p className="text-[11px] text-emerald-700">Detectada en el documento.</p>}
              {distinta && <div className="space-y-2"><Aviso>El documento es de {empresas.find(x => x.id === empresa)?.nombre_corto} y {nombreEmpleado(emp)} es de {emp?.empresas?.nombre_corto}. El resguardo tiene que ser de la misma empresa.</Aviso>
                <button className="btn-sec w-full text-xs" onClick={() => setEmpresa(emp!.empresa_id)}>Dar de alta a nombre de {emp?.empresas?.nombre_corto}</button></div>}
              {error && <Aviso>{error}</Aviso>}
              <button className="btn-primario w-full py-3" disabled={guardando || !incluidos.length || empleado === null || !empresaFinal || distinta} onClick={crear}>
                {guardando ? <><Loader2 size={16} className="animate-spin" />Creando…</> : <><Check size={16} />Dar de alta {unidades} activo(s)</>}
              </button>
              {empleado === null && <p className="text-center text-[11px] text-stone-500">Elige a quién se entrega (o “Nadie”).</p>}
            </section>
          </aside>
        </div>
      )}
    </div>
  )
}
