import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Camera, X } from 'lucide-react'
import { supabase, ESTATUS, mensajeError, type Estatus } from '../lib/supabase'
import { useLista, nombreEmpleado } from '../lib/hooks'
import { subirFoto } from '../lib/fotos'
import { Encabezado, Campo, Aviso, Cargando } from '../components/ui'
import { OpcionesCategoria, NuevoEnLinea, asegurarMarca } from '../components/CatalogoEnLinea'

type Activo = {
  id?: string; empresa_id: string; categoria_id: string; descripcion: string; marca_id: string | null; modelo_id: string | null
  serie: string | null; numero_economico: string | null; ubicacion_id: string | null; responsable_id: string | null
  estatus: Estatus; valor_referencia: number | string | null; fecha_alta: string; notas: string | null; foto_principal?: string | null
  garantia_hasta?: string | null; garantia_proveedor?: string | null; garantia_notas?: string | null; reservable?: boolean
}
type Vehiculo = { placa: string | null; anio: number | string | null; color: string | null; cilindros: number | string | null; combustible: string | null
  transmision: string | null; capacidad_tanque: number | string | null; pasajeros: number | string | null; kilometraje: number | string | null
  numero_motor?: string | null; version?: string | null; tipo_licencia?: string | null; tarjeta_circulacion?: string | null; poliza?: string | null }

const VEH_VACIO: Vehiculo = { placa: '', anio: '', color: '', cilindros: '', combustible: '', transmision: '', capacidad_tanque: '', pasajeros: '', kilometraje: '', numero_motor: '', version: '', tipo_licencia: '', tarjeta_circulacion: '', poliza: '' }

export default function ActivoForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const empresas = useLista('empresas')
  const categorias = useLista('categorias', 'id,nombre,es_vehiculo,padre_id')
  const marcas = useLista('marcas')
  const modelos = useLista('modelos', 'id,nombre,marca_id,categoria_id,descripcion')
  const ubicaciones = useLista('ubicaciones', 'id,nombre,empresa_id,tipo')
  const empleados = useLista('empleados', 'id,nombres,apellidos,empresa_id', 'nombres')
  const [a, setA] = useState<Activo | null>(null)
  const [v, setV] = useState<Vehiculo>(VEH_VACIO)
  const [fotos, setFotos] = useState<File[]>([])
  const [todasEmp, setTodasEmp] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!id) {
      setA({ empresa_id: '', categoria_id: '', descripcion: '', marca_id: null, modelo_id: null, serie: '', numero_economico: '', ubicacion_id: null,
        responsable_id: null, estatus: 'disponible', valor_referencia: '', fecha_alta: new Date().toISOString().slice(0, 10), notas: '' })
      return
    }
    Promise.all([
      supabase.from('activos').select('*').eq('id', id).single(),
      supabase.from('activo_vehiculo').select('*').eq('activo_id', id).maybeSingle(),
    ]).then(([ra, rv]) => {
      if (ra.error) { setError(mensajeError(ra.error)); return }
      setA(ra.data as Activo)
      if (rv.data) setV(rv.data as Vehiculo)
    })
  }, [id])

  // empresa por defecto cuando cargan
  useEffect(() => {
    if (a && !a.empresa_id && empresas.items.length === 1) setA({ ...a, empresa_id: empresas.items[0].id })
  }, [empresas.items, a])

  const esVehiculo = useMemo(() => !!categorias.items.find(c => c.id === a?.categoria_id)?.es_vehiculo, [categorias.items, a?.categoria_id])
  if (!a) return error ? <Aviso>{error}</Aviso> : <Cargando />

  const set = <K extends keyof Activo>(k: K, val: Activo[K]) => setA(s => {
    const n = { ...s!, [k]: val }
    if (k === 'empresa_id') { n.ubicacion_id = null; n.responsable_id = null }
    if (k === 'marca_id') n.modelo_id = null
    if (k === 'modelo_id' && val) {
      const m = modelos.items.find(x => x.id === val) as { categoria_id?: string | null; descripcion?: string | null; nombre: string } | undefined
      if (m?.categoria_id && !n.categoria_id) n.categoria_id = m.categoria_id
      if (!n.descripcion.trim()) n.descripcion = m?.descripcion || `${marcas.items.find(x => x.id === n.marca_id)?.nombre ?? ''} ${m?.nombre ?? ''}`.trim()
    }
    if (k === 'responsable_id') {
      if (val && n.estatus === 'disponible') n.estatus = 'asignado'
      if (!val && n.estatus === 'asignado') n.estatus = 'disponible'
    }
    return n
  })
  const setVeh = (k: keyof Vehiculo, val: string) => setV(s => ({ ...s, [k]: val }))

  // Se crean aquí mismo y quedan en el catálogo (Marcas y modelos, Catálogo de productos) para todos
  async function nuevaCategoria(nombre: string, padre?: string) {
    const padreCat = categorias.items.find(c => c.id === padre) as { es_vehiculo?: boolean } | undefined
    const { data, error } = await supabase.from('categorias').insert({ nombre, padre_id: padre || null, es_vehiculo: !!padreCat?.es_vehiculo }).select('id').single()
    if (error) return mensajeError(error)
    await categorias.recargar(); set('categoria_id', (data as { id: string }).id); return null
  }
  async function nuevaMarca(nombre: string) {
    try { const id = await asegurarMarca(nombre, marcas.items); await marcas.recargar(); set('marca_id', id); return null } catch (e) { return (e as Error).message }
  }
  async function nuevoModelo(nombre: string) {
    if (!a?.marca_id) return 'Primero elige la marca.'
    const marca = marcas.items.find(m => m.id === a.marca_id)?.nombre ?? ''
    const cat = categorias.items.find(c => c.id === a.categoria_id)?.nombre
    const { data, error } = await supabase.from('modelos').insert({ nombre, marca_id: a.marca_id, categoria_id: a.categoria_id || null,
      descripcion: `${cat ? cat.replace(/s$/, '') + ' ' : ''}${marca} ${nombre}`.trim() }).select('id').single()
    if (error) return mensajeError(error)
    await modelos.recargar(); set('modelo_id', (data as { id: string }).id); return null
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setError('')
    const limpio = (x: unknown) => (typeof x === 'string' ? (x.trim() === '' ? null : x.trim()) : x ?? null)
    const num = (x: unknown) => (x === '' || x == null ? null : Number(x))
    const datos = {
      empresa_id: a!.empresa_id, categoria_id: a!.categoria_id, descripcion: a!.descripcion.trim(),
      marca_id: a!.marca_id || null, modelo_id: a!.modelo_id || null, serie: limpio(a!.serie), numero_economico: limpio(a!.numero_economico),
      ubicacion_id: a!.ubicacion_id || null, responsable_id: a!.responsable_id || null, estatus: a!.estatus,
      valor_referencia: num(a!.valor_referencia), fecha_alta: a!.fecha_alta, notas: limpio(a!.notas),
      garantia_hasta: a!.garantia_hasta || null, garantia_proveedor: limpio(a!.garantia_proveedor ?? null), garantia_notas: limpio(a!.garantia_notas ?? null), reservable: !!a!.reservable,
    }
    try {
      let activoId = id
      if (id) {
        const { error } = await supabase.from('activos').update(datos).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('activos').insert(datos).select('id').single()
        if (error) throw error
        activoId = data.id
      }
      if (esVehiculo) {
        const { error } = await supabase.from('activo_vehiculo').upsert({
          activo_id: activoId, placa: limpio(v.placa), anio: num(v.anio), color: limpio(v.color), cilindros: num(v.cilindros),
          combustible: limpio(v.combustible), transmision: limpio(v.transmision), capacidad_tanque: num(v.capacidad_tanque),
          pasajeros: num(v.pasajeros), kilometraje: num(v.kilometraje),
          numero_motor: limpio(v.numero_motor ?? null), version: limpio(v.version ?? null), tipo_licencia: limpio(v.tipo_licencia ?? null), tarjeta_circulacion: limpio(v.tarjeta_circulacion ?? null), poliza: limpio(v.poliza ?? null),
        })
        if (error) throw error
        // el kilometraje también queda como lectura para que el mantenimiento por km lo tome
        const km = num(v.kilometraje)
        if (km != null && km > 0) {
          const { data: ult } = await supabase.from('lecturas').select('valor').eq('activo_id', activoId!).eq('tipo', 'km').order('valor', { ascending: false }).limit(1)
          const u = (ult?.[0] as { valor: number } | undefined)?.valor
          if (u == null || km > u) await supabase.from('lecturas').insert({ activo_id: activoId, empresa_id: a!.empresa_id, tipo: 'km', valor: km, nota: id ? 'Actualizado al editar' : 'Kilometraje al dar de alta' })
        }
      }
      let principal = a!.foto_principal ?? null
      for (const f of fotos) {
        const path = await subirFoto(a!.empresa_id, activoId!, f)
        if (!principal) principal = path
      }
      if (principal && principal !== a!.foto_principal) await supabase.from('activos').update({ foto_principal: principal }).eq('id', activoId!)
      nav(`/activos/${activoId}`, { replace: true })
    } catch (err) {
      setError(mensajeError(err)); setGuardando(false)
    }
  }

  const ubicVis = ubicaciones.items.filter(u => u.empresa_id === a.empresa_id)
  const empVis = empleados.items.filter(u => todasEmp || u.empresa_id === a.empresa_id || u.id === a.responsable_id)
  const nomEmpresa = (eid: unknown) => empresas.items.find(x => x.id === eid)?.nombre ?? ''
  const modVis = modelos.items.filter(m => m.marca_id === a.marca_id)

  return (
    <form onSubmit={guardar}>
      <Link to={id ? `/activos/${id}` : '/activos'} className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Volver</Link>
      <Encabezado titulo={id ? 'Editar activo' : 'Nuevo activo'} sub={id ? undefined : 'El código y el QR se generan solos al guardar.'} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="tarjeta p-5">
            <h2 className="mb-4 font-semibold">Identificación</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Empresa *">
                <select className="campo" required value={a.empresa_id} onChange={e => set('empresa_id', e.target.value)}>
                  <option value="">— Selecciona —</option>{empresas.items.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Categoría *">
                <div className="relative flex gap-2">
                  <select className="campo" required value={a.categoria_id} onChange={e => set('categoria_id', e.target.value)}>
                    <option value="">— Selecciona —</option><OpcionesCategoria items={categorias.items} />
                  </select>
                  <NuevoEnLinea etiqueta="Nuevo tipo o subtipo" placeholder="Ej. Radios portátiles" onCrear={nuevaCategoria}
                    extra={{ etiqueta: 'Es un tipo nuevo (sin grupo)', opciones: categorias.items.filter(c => !c.padre_id).map(c => ({ id: c.id, nombre: `Dentro de: ${c.nombre}` })) }} />
                </div>
              </Campo>
              <Campo label="Descripción *" className="sm:col-span-2">
                <input className="campo" required placeholder="Ej. Camioneta pick-up doble cabina, Retroexcavadora, Laptop" value={a.descripcion} onChange={e => set('descripcion', e.target.value)} />
              </Campo>
              <Campo label="Marca">
                <div className="relative flex gap-2">
                  <select className="campo" value={a.marca_id ?? ''} onChange={e => set('marca_id', e.target.value || null)}>
                    <option value="">—</option>{marcas.items.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </select>
                  <NuevoEnLinea etiqueta="Nueva marca" placeholder="Ej. Hikvision" onCrear={nuevaMarca} />
                </div>
              </Campo>
              <Campo label="Modelo">
                <div className="relative flex gap-2">
                  <select className="campo" value={a.modelo_id ?? ''} disabled={!a.marca_id} onChange={e => set('modelo_id', e.target.value || null)}>
                    <option value="">—</option>{modVis.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </select>
                  <NuevoEnLinea etiqueta="Nuevo modelo" placeholder="Ej. DS-2CD1043" deshabilitado={!a.marca_id} onCrear={nuevoModelo} />
                </div>
              </Campo>
              <Campo label="Número de serie"><input className="campo" value={a.serie ?? ''} onChange={e => set('serie', e.target.value)} /></Campo>
              <Campo label="Número económico"><input className="campo" value={a.numero_economico ?? ''} onChange={e => set('numero_economico', e.target.value)} /></Campo>
            </div>
          </section>

          {esVehiculo && (
            <section className="tarjeta p-5">
              <h2 className="mb-4 font-semibold">Datos del vehículo</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo label="Placa"><input className="campo uppercase" value={v.placa ?? ''} onChange={e => setVeh('placa', e.target.value.toUpperCase())} /></Campo>
                <Campo label="Año"><input className="campo" type="number" min={1950} max={2100} value={v.anio ?? ''} onChange={e => setVeh('anio', e.target.value)} /></Campo>
                <Campo label="Color"><input className="campo" value={v.color ?? ''} onChange={e => setVeh('color', e.target.value)} /></Campo>
                <Campo label="Combustible">
                  <select className="campo" value={v.combustible ?? ''} onChange={e => setVeh('combustible', e.target.value)}>
                    <option value="">—</option><option>Gasolina</option><option>Diésel</option><option>Gas LP</option><option>Eléctrico</option><option>Híbrido</option>
                  </select>
                </Campo>
                <Campo label="Transmisión">
                  <select className="campo" value={v.transmision ?? ''} onChange={e => setVeh('transmision', e.target.value)}>
                    <option value="">—</option><option>Manual</option><option>Automática</option>
                  </select>
                </Campo>
                <Campo label="Kilometraje / horómetro actual"><input className="campo" type="number" step="0.1" value={v.kilometraje ?? ''} onChange={e => setVeh('kilometraje', e.target.value)} /></Campo>
                <Campo label="Cilindros"><input className="campo" type="number" value={v.cilindros ?? ''} onChange={e => setVeh('cilindros', e.target.value)} /></Campo>
                <Campo label="Pasajeros"><input className="campo" type="number" value={v.pasajeros ?? ''} onChange={e => setVeh('pasajeros', e.target.value)} /></Campo>
                <Campo label="Capacidad de tanque (L)"><input className="campo" type="number" step="0.1" value={v.capacidad_tanque ?? ''} onChange={e => setVeh('capacidad_tanque', e.target.value)} /></Campo>
                <Campo label="Versión"><input className="campo" value={v.version ?? ''} onChange={e => setVeh('version', e.target.value)} placeholder="Doble cabina 4x4" /></Campo>
                <Campo label="No. de motor"><input className="campo font-mono" value={v.numero_motor ?? ''} onChange={e => setVeh('numero_motor', e.target.value.toUpperCase())} /></Campo>
                <Campo label="Licencia que pide"><select className="campo" value={v.tipo_licencia ?? ''} onChange={e => setVeh('tipo_licencia', e.target.value)}><option value="">—</option>{['A', 'B', 'C', 'D', 'E', 'Federal'].map(x => <option key={x} value={x}>Tipo {x}</option>)}</select></Campo>
                <Campo label="Tarjeta de circulación"><input className="campo" value={v.tarjeta_circulacion ?? ''} onChange={e => setVeh('tarjeta_circulacion', e.target.value)} placeholder="No. de tarjeta" /></Campo>
                <Campo label="Póliza de seguro"><input className="campo" value={v.poliza ?? ''} onChange={e => setVeh('poliza', e.target.value)} placeholder="Aseguradora y no. de póliza" /></Campo>
              </div>
            </section>
          )}

          <section className="tarjeta p-5">
            <h2 className="mb-4 font-semibold">Notas</h2>
            <textarea className="campo" rows={3} placeholder="Estado físico, accesorios, observaciones…" value={a.notas ?? ''} onChange={e => set('notas', e.target.value)} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="tarjeta p-5">
            <h2 className="mb-4 font-semibold">Dónde está y quién lo tiene</h2>
            <div className="space-y-4">
              <Campo label="Ubicación">
                <select className="campo" value={a.ubicacion_id ?? ''} disabled={!a.empresa_id} onChange={e => set('ubicacion_id', e.target.value || null)}>
                  <option value="">—</option>{ubicVis.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </Campo>
              <Campo label="Responsable">
                <select className="campo" value={a.responsable_id ?? ''} disabled={!a.empresa_id} onChange={e => set('responsable_id', e.target.value || null)}>
                  <option value="">— Sin responsable —</option>{empVis.map(o => <option key={o.id} value={o.id}>{nombreEmpleado(o as never)}{o.empresa_id !== a.empresa_id ? ` · ${nomEmpresa(o.empresa_id)}` : ''}</option>)}
                </select>
              </Campo>
                <label className="-mt-2 flex items-center gap-2 text-xs text-stone-500"><input type="checkbox" checked={todasEmp} onChange={e => setTodasEmp(e.target.checked)} />Ver empleados de todas las empresas</label>
              <Campo label="Estatus">
                <select className="campo" value={a.estatus} onChange={e => set('estatus', e.target.value as Estatus)}>
                  {Object.entries(ESTATUS).map(([k, x]) => <option key={k} value={k}>{x.texto}</option>)}
                </select>
              </Campo>
              {a.empresa_id && (ubicVis.length === 0 || empVis.length === 0) && (
                <p className="text-xs text-stone-500">Esta empresa aún no tiene {ubicVis.length === 0 ? 'ubicaciones' : 'empleados'}. Agrégalos en Organización.</p>
              )}
            </div>
          </section>

          <section className="tarjeta p-5">
            <h2 className="mb-4 font-semibold">Alta</h2>
            <div className="space-y-4">
              <Campo label="Fecha de alta"><input className="campo" type="date" required value={a.fecha_alta} onChange={e => set('fecha_alta', e.target.value)} /></Campo>
              <Campo label="Valor de referencia (MXN)"><input className="campo" type="number" step="0.01" min={0} value={a.valor_referencia ?? ''} onChange={e => set('valor_referencia', e.target.value)} /></Campo>
            </div>
          </section>

          <section className="tarjeta p-5">
            <h2 className="mb-4 font-semibold">Garantía y uso compartido</h2>
            <div className="space-y-4">
              <Campo label="Garantía hasta"><input className="campo" type="date" value={a.garantia_hasta ?? ''} onChange={e => set('garantia_hasta', e.target.value || null)} /></Campo>
              <Campo label="Con quién se hace válida"><input className="campo" value={a.garantia_proveedor ?? ''} onChange={e => set('garantia_proveedor', e.target.value)} placeholder="Dell, distribuidor, agencia…" /></Campo>
              <Campo label="Notas de garantía"><input className="campo" value={a.garantia_notas ?? ''} onChange={e => set('garantia_notas', e.target.value)} placeholder="Teléfono, no. de caso, qué cubre" /></Campo>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!a.reservable} onChange={e => set('reservable', e.target.checked)} />Se puede reservar (equipo compartido)</label>
          </section>

          <section className="tarjeta p-5">
            <h2 className="mb-3 font-semibold">Fotos</h2>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-300 p-5 text-center text-sm text-stone-500 hover:border-marca">
              <Camera size={22} />
              <span>Tomar o subir fotos</span>
              <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                onChange={e => setFotos(f => [...f, ...Array.from(e.target.files ?? [])])} />
            </label>
            {fotos.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{fotos.map((f, i) => <span key={i} className="relative"><img src={URL.createObjectURL(f)} alt="" className="aspect-square w-full rounded-lg object-cover" /><button type="button" onClick={() => setFotos(x => x.filter((_, k) => k !== i))} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white" aria-label="Quitar"><X size={12} /></button></span>)}</div>}
            {fotos.length > 0 && <p className="mt-2 text-xs text-stone-600">{fotos.length} foto(s) se subirán al guardar.</p>}
          </section>
        </div>
      </div>

      {error && <div className="mt-6"><Aviso>{error}</Aviso></div>}
      <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t border-stone-200 bg-stone-50/95 py-4">
        <Link to={id ? `/activos/${id}` : '/activos'} className="btn-sec">Cancelar</Link>
        <button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar activo'}</button>
      </div>
    </form>
  )
}
