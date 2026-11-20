/** Importadores desde Excel para cada base de datos del sistema (catálogos, empleados, activos, licencias, inmuebles, almacén). */
import { useEffect, useState } from 'react'
import { supabase, mensajeError } from '../lib/supabase'
import { nombreEmpleado } from '../lib/hooks'
import { CATEGORIAS_CONS, UNIDADES } from '../lib/almacen'
import ImportarExcel, { normal, aFecha, aNumero, aBool, type ColImport, type ResultadoImport, type Variante } from './ImportarExcel'
import type { CampoDef } from './Catalogo'

type R = Record<string, unknown> & { id: string }
type Filas = { n: number; datos: Record<string, string> }[]
type Base = { abierto: boolean; onCerrar: () => void; onListo: () => void }

/** Busca por nombre sin importar mayúsculas ni acentos (acepta varios nombres por registro). */
function indice(items: R[], ...nombres: ((r: R) => unknown)[]) {
  const m = new Map<string, R>()
  for (const it of items) for (const f of nombres) { const k = normal(f(it)); if (k && !m.has(k)) m.set(k, it) }
  return (v: string) => m.get(normal(v))
}
async function lista(tabla: string, select: string, soloActivos = true) {
  let q = supabase.from(tabla).select(select).limit(5000)
  if (soloActivos) q = q.eq('activo', true)
  const { data } = await q
  return (data as unknown as R[]) ?? []
}
const etqEmpresa = (e: R) => String(e.nombre_corto || e.nombre)

/** Inserta todo de un jalón; si algo falla, inserta uno por uno para decir qué renglón falló. */
async function insertar(tabla: string, filas: { n: number; fila: Record<string, unknown> }[], errores: ResultadoImport['errores']) {
  if (!filas.length) return 0
  const { error } = await supabase.from(tabla).insert(filas.map(f => f.fila))
  if (!error) return filas.length
  let ok = 0
  for (const f of filas) { const r = await supabase.from(tabla).insert(f.fila); if (r.error) errores.push({ fila: f.n, error: mensajeError(r.error) }); else ok++ }
  return ok
}

function useCargar<T>(abierto: boolean, fn: () => Promise<T>) {
  const [v, setV] = useState<T | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (abierto) fn().then(setV) }, [abierto])
  return v
}

// ─────────────────────── Catálogos genéricos (sucursales, ubicaciones, categorías, marcas, CC…) ───────────────────────
export function ImportarCatalogo({ abierto, onCerrar, onListo, tabla, titulo, campos, porEmpresa }: Base & { tabla: string; titulo: string; campos: CampoDef[]; porEmpresa?: boolean }) {
  const datos = useCargar(abierto, async () => {
    const empresas = porEmpresa ? await lista('empresas', 'id,nombre,nombre_corto,razon_social') : []
    const refs: Record<string, R[]> = {}
    for (const c of campos.filter(c => c.tipo === 'ref')) refs[c.key] = await lista(c.ref!.tabla, c.ref!.select ?? (c.ref!.porEmpresa ? 'id,nombre,empresa_id' : 'id,nombre'))
    return { empresas, refs }
  })
  const etq = (c: CampoDef, r: R) => c.ref?.etiqueta ? c.ref.etiqueta(r) : String(r.nombre ?? '')
  const columnas: ColImport[] = [
    ...(porEmpresa ? [{ key: 'empresa', titulo: 'Empresa', requerido: true, valores: datos?.empresas.map(etqEmpresa), ejemplo: datos?.empresas[0] ? etqEmpresa(datos.empresas[0]) : '' }] : []),
    ...campos.map<ColImport>(c => ({ key: c.key, titulo: c.label.replace(/\s*\(.*\)$/, ''), requerido: c.requerido,
      tipo: c.tipo === 'numero' ? 'numero' : c.tipo === 'bool' ? 'bool' : 'texto',
      valores: c.tipo === 'enum' || c.tipo === 'multi' ? Object.values(c.opciones ?? {}) : c.tipo === 'ref' ? [...new Set((datos?.refs[c.key] ?? []).map(r => etq(c, r)))] : undefined,
      ayuda: c.tipo === 'multi' ? 'Uno o varios, separados por coma' : c.tipo === 'ref' ? `Nombre tal como está en ${c.ref!.tabla.replace(/_/g, ' ')}` : undefined,
      ejemplo: c.tipo === 'bool' ? 'Sí' : c.tipo === 'enum' ? Object.values(c.opciones ?? {})[0] : undefined })),
  ]
  async function procesar(filas: Filas): Promise<ResultadoImport> {
    const errores: ResultadoImport['errores'] = []
    const emp = indice(datos?.empresas ?? [], e => e.nombre, e => e.nombre_corto, e => e.razon_social)
    const listas: { n: number; fila: Record<string, unknown> }[] = []
    for (const f of filas) {
      const fila: Record<string, unknown> = { activo: true }
      let error = ''
      if (porEmpresa) { const e = emp(f.datos.empresa); if (!e) error = `Empresa "${f.datos.empresa}" no existe`; else fila.empresa_id = e.id }
      for (const c of campos) {
        const v = f.datos[c.key] ?? ''
        if (c.tipo === 'numero') fila[c.key] = v ? aNumero(v) : null
        else if (c.tipo === 'bool') fila[c.key] = v ? aBool(v) : (c.defecto ?? false)
        else if (c.tipo === 'enum') { const k = Object.entries(c.opciones ?? {}).find(([k, t]) => normal(k) === normal(v) || normal(t) === normal(v))?.[0]; if (v && !k) error ||= `${c.label}: "${v}" no es válido`; fila[c.key] = k ?? c.defecto ?? null }
        else if (c.tipo === 'multi') fila[c.key] = v.split(/[,;]/).map(x => Object.entries(c.opciones ?? {}).find(([k, t]) => normal(k) === normal(x) || normal(t) === normal(x))?.[0]).filter(Boolean)
        else if (c.tipo === 'ref') {
          if (!v) { fila[c.key] = null; continue }
          const rs = (datos?.refs[c.key] ?? []).filter(r => !c.ref!.porEmpresa || !fila.empresa_id || r.empresa_id === fila.empresa_id)
          const r = rs.find(r => normal(etq(c, r)) === normal(v) || normal(r.nombre) === normal(v) || normal(r.clave) === normal(v))
          if (!r) error ||= `${c.label}: "${v}" no existe`; fila[c.key] = r?.id ?? null
        } else fila[c.key] = v || null
      }
      if (error) errores.push({ fila: f.n, error }); else listas.push({ n: f.n, fila })
    }
    const ok = await insertar(tabla, listas, errores)
    return { ok, errores }
  }
  return <ImportarExcel abierto={abierto} onCerrar={onCerrar} onListo={onListo} titulo={titulo.toLowerCase()} columnas={columnas} procesar={procesar} nombreArchivo={tabla.replace(/_/g, '-')} />
}

// ─────────────────────── Empleados ───────────────────────
export function ImportarEmpleadosExcel({ abierto, onCerrar, onListo, empresaId }: Base & { empresaId?: string }) {
  const datos = useCargar(abierto, async () => ({ empresas: await lista('empresas', 'id,nombre,nombre_corto,razon_social'), deptos: await lista('departamentos', 'id,nombre,empresa_id') }))
  const columnas: ColImport[] = [
    { key: 'empresa', titulo: 'Empresa', requerido: !empresaId, valores: datos?.empresas.map(etqEmpresa), ayuda: empresaId ? 'Si la dejas vacía se usa la empresa que estás viendo' : undefined, ejemplo: datos?.empresas[0] ? etqEmpresa(datos.empresas[0]) : '' },
    { key: 'nombres', titulo: 'Nombre(s)', requerido: true, ejemplo: 'Juan Carlos' }, { key: 'apellidos', titulo: 'Apellidos', ejemplo: 'Pérez López' },
    { key: 'codigo', titulo: 'No. de empleado', ejemplo: '1024' }, { key: 'puesto', titulo: 'Puesto', ejemplo: 'Residente de obra' },
    { key: 'depto', titulo: 'Departamento', ayuda: 'Si no existe en esa empresa, se crea', ejemplo: 'Obra' },
    { key: 'email', titulo: 'Correo', ejemplo: 'jperez@grupofirmedemexico.com' }, { key: 'telefono', titulo: 'Teléfono', ejemplo: '612 000 0000' },
  ]
  async function procesar(filas: Filas): Promise<ResultadoImport> {
    const errores: ResultadoImport['errores'] = []
    const emp = indice(datos?.empresas ?? [], e => e.nombre, e => e.nombre_corto, e => e.razon_social)
    const deptos = [...(datos?.deptos ?? [])]
    const listas: { n: number; fila: Record<string, unknown> }[] = []
    for (const f of filas) {
      const e = f.datos.empresa ? emp(f.datos.empresa) : empresaId ? { id: empresaId } as R : undefined
      if (!e) { errores.push({ fila: f.n, error: `Empresa "${f.datos.empresa}" no existe` }); continue }
      let depto: string | null = null
      if (f.datos.depto) {
        let d = deptos.find(x => x.empresa_id === e.id && normal(x.nombre) === normal(f.datos.depto))
        if (!d) { const r = await supabase.from('departamentos').insert({ empresa_id: e.id, nombre: f.datos.depto.trim() }).select('id,nombre,empresa_id').single(); if (r.data) { d = r.data as R; deptos.push(d) } }
        depto = d?.id ?? null
      }
      listas.push({ n: f.n, fila: { empresa_id: e.id, nombres: f.datos.nombres, apellidos: f.datos.apellidos || null, codigo: f.datos.codigo || null, puesto: f.datos.puesto || null,
        departamento_id: depto, email: f.datos.email || null, telefono: f.datos.telefono || null } })
    }
    return { ok: await insertar('empleados', listas, errores), errores }
  }
  return <ImportarExcel abierto={abierto} onCerrar={onCerrar} onListo={onListo} titulo="empleados" columnas={columnas} procesar={procesar} nombreArchivo="empleados" />
}

// ─────────────────────── Activos (plantilla según la categoría) ───────────────────────
const esComputo = (n: string) => /c[oó]mputo|laptop|computadora|escritorio|servidor|tablet|monitor|impresora/i.test(n)
const esTelefonia = (n: string) => /tel[eé]fon|celular|radio|smartphone/i.test(n)
const esMaquinaria = (n: string) => /maquinaria|retro|excavadora|cargador|compactador|grúa|grua|montacargas|tractor/i.test(n)
const EXTRA_NOTAS: Record<string, string> = { procesador: 'Procesador', ram: 'Memoria RAM', disco: 'Almacenamiento', so: 'Sistema operativo', imei: 'IMEI', linea: 'Número de línea', compania: 'Compañía' }

export function ImportarActivos({ abierto, onCerrar, onListo }: Base) {
  const datos = useCargar(abierto, async () => ({
    empresas: await lista('empresas', 'id,nombre,nombre_corto,razon_social'), categorias: await lista('categorias', 'id,nombre,padre_id,es_vehiculo'),
    marcas: await lista('marcas', 'id,nombre'), modelos: await lista('modelos', 'id,nombre,marca_id,categoria_id'),
    ubicaciones: await lista('ubicaciones', 'id,nombre,codigo,empresa_id'), empleados: await lista('empleados', 'id,nombres,apellidos,empresa_id'),
  }))
  const cats = datos?.categorias ?? []
  const nombreCat = (id: string) => cats.find(c => c.id === id)
  const variantes: Variante[] = cats.filter(c => c.padre_id || !cats.some(h => h.padre_id === c.id)).map(c => ({ id: c.id, nombre: String(c.nombre), grupo: c.padre_id ? String(nombreCat(String(c.padre_id))?.nombre ?? '') : 'Otros' }))
    .sort((a, b) => (a.grupo ?? '').localeCompare(b.grupo ?? '') || a.nombre.localeCompare(b.nombre))
  const tipoDe = (id: string) => {
    const c = nombreCat(id); if (!c) return { vehiculo: false, nombre: '' }
    const padre = c.padre_id ? nombreCat(String(c.padre_id)) : undefined
    const nombre = `${padre?.nombre ?? ''} ${c.nombre}`
    return { vehiculo: !!c.es_vehiculo || !!padre?.es_vehiculo, nombre, maquinaria: esMaquinaria(nombre), computo: esComputo(nombre), telefonia: esTelefonia(nombre) }
  }
  const columnas = (variante: string): ColImport[] => {
    const t = tipoDe(variante), c = nombreCat(variante)
    return [
      { key: 'empresa', titulo: 'Empresa', requerido: true, valores: datos?.empresas.map(etqEmpresa), ejemplo: datos?.empresas[0] ? etqEmpresa(datos.empresas[0]) : '' },
      { key: 'categoria', titulo: 'Categoría', requerido: !variante, valores: variantes.map(v => v.nombre), ayuda: variante ? `Si la dejas vacía se usa "${c?.nombre}"` : 'Tipo o subtipo de equipo', ejemplo: String(c?.nombre ?? 'Laptops') },
      { key: 'descripcion', titulo: 'Descripción', requerido: true, ejemplo: t.vehiculo ? 'Camioneta pick-up doble cabina' : t.computo ? 'Laptop 15.6" Core i7 16 GB' : 'Rotomartillo SDS' },
      { key: 'marca', titulo: 'Marca', ayuda: 'Si no existe, se crea', ejemplo: t.vehiculo ? 'Nissan' : t.computo ? 'Dell' : 'Bosch' },
      { key: 'modelo', titulo: 'Modelo', ayuda: 'Si no existe, se crea con esa marca y categoría', ejemplo: t.vehiculo ? 'NP300' : t.computo ? 'Inspiron 15' : 'GBH 2-28' },
      { key: 'serie', titulo: t.vehiculo ? 'VIN / No. de serie' : 'No. de serie', ejemplo: t.vehiculo ? '3N6AD33A0KK800001' : 'CRH6VB4' },
      { key: 'eco', titulo: 'No. económico', ejemplo: t.vehiculo ? 'CP-12' : '' },
      ...(t.vehiculo ? [
        { key: 'placa', titulo: 'Placa', ejemplo: 'CZ-1234-A' }, { key: 'anio', titulo: 'Año', tipo: 'numero' as const, ejemplo: '2024' }, { key: 'color', titulo: 'Color', ejemplo: 'Blanco' },
        { key: 'motor', titulo: 'No. de motor' }, { key: 'km', titulo: t.maquinaria ? 'Horómetro' : 'Kilometraje', tipo: 'numero' as const, ejemplo: t.maquinaria ? '6130' : '48250' },
        { key: 'combustible', titulo: 'Combustible', valores: ['Gasolina', 'Diésel', 'Gas LP', 'Eléctrico', 'Híbrido'], ejemplo: 'Diésel' },
        { key: 'transmision', titulo: 'Transmisión', valores: ['Manual', 'Automática'], ejemplo: 'Manual' }, { key: 'version', titulo: 'Versión', ejemplo: 'Doble cabina 4x4' },
        { key: 'tarjeta', titulo: 'Tarjeta de circulación' }, { key: 'poliza', titulo: 'Póliza de seguro', ejemplo: 'Qualitas 123456' },
      ] : []),
      ...(t.computo ? [{ key: 'procesador', titulo: 'Procesador', ejemplo: 'Core i7 1355U' }, { key: 'ram', titulo: 'Memoria RAM', ejemplo: '16 GB' }, { key: 'disco', titulo: 'Almacenamiento', ejemplo: 'SSD 512 GB' }, { key: 'so', titulo: 'Sistema operativo', ejemplo: 'Windows 11 Pro' }] : []),
      ...(t.telefonia ? [{ key: 'imei', titulo: 'IMEI', ejemplo: '356938035643809' }, { key: 'linea', titulo: 'Número de línea', ejemplo: '612 000 0000' }, { key: 'compania', titulo: 'Compañía', ejemplo: 'Telcel' }] : []),
      { key: 'ubicacion', titulo: 'Ubicación', valores: [...new Set((datos?.ubicaciones ?? []).map(u => String(u.nombre)))], ayuda: 'Nombre o código de la ubicación de esa empresa' },
      { key: 'responsable', titulo: 'Responsable', ayuda: 'Nombre completo del empleado (de cualquier empresa). Se genera su resguardo.', ejemplo: 'Juan Pérez López' },
      { key: 'fecha', titulo: 'Fecha de alta', tipo: 'fecha', ejemplo: '2026-11-20' }, { key: 'factura', titulo: 'Factura' },
      { key: 'valor', titulo: 'Valor de referencia', tipo: 'numero' }, { key: 'notas', titulo: 'Notas' },
    ]
  }
  async function procesar(filas: Filas, variante: string): Promise<ResultadoImport> {
    if (!datos) throw new Error('Cargando catálogos, intenta de nuevo.')
    const errores: ResultadoImport['errores'] = []
    const emp = indice(datos.empresas, e => e.nombre, e => e.nombre_corto, e => e.razon_social)
    const cat = indice(datos.categorias, c => c.nombre)
    const marcas = [...datos.marcas], modelos = [...datos.modelos]
    const persona = indice(datos.empleados, e => nombreEmpleado(e as never), e => `${e.apellidos ?? ''} ${e.nombres}`)
    const asignar = new Map<string, { empresa: string; empleado: string; nombre: string; ids: string[]; filas: number[] }>()
    let ok = 0, nuevas = 0
    for (const f of filas) {
      const d = f.datos
      try {
        const e = emp(d.empresa); if (!e) throw new Error(`Empresa "${d.empresa}" no existe`)
        const c = d.categoria ? cat(d.categoria) : nombreCat(variante); if (!c) throw new Error(d.categoria ? `Categoría "${d.categoria}" no existe` : 'Falta la categoría')
        let marcaId: string | null = null, modeloId: string | null = null
        if (d.marca) {
          let m = marcas.find(x => normal(x.nombre) === normal(d.marca))
          if (!m) { const r = await supabase.from('marcas').insert({ nombre: d.marca.trim(), sitio: /^[a-z0-9-]+$/i.test(d.marca.trim()) ? `${d.marca.trim().toLowerCase()}.com` : null }).select('id,nombre').single(); if (r.error) throw r.error; m = r.data as R; marcas.push(m); nuevas++ }
          marcaId = m.id
          if (d.modelo) {
            let mo = modelos.find(x => x.marca_id === marcaId && normal(x.nombre) === normal(d.modelo))
            if (!mo) { const r = await supabase.from('modelos').insert({ nombre: d.modelo.trim(), marca_id: marcaId, categoria_id: c.id, descripcion: d.descripcion }).select('id,nombre,marca_id,categoria_id').single(); if (r.error) throw r.error; mo = r.data as R; modelos.push(mo); nuevas++ }
            modeloId = mo.id
          }
        }
        const u = d.ubicacion ? datos.ubicaciones.find(x => x.empresa_id === e.id && (normal(x.nombre) === normal(d.ubicacion) || normal(x.codigo) === normal(d.ubicacion))) : undefined
        if (d.ubicacion && !u) throw new Error(`Ubicación "${d.ubicacion}" no existe en ${etqEmpresa(e)}`)
        const resp = d.responsable ? persona(d.responsable) : undefined
        if (d.responsable && !resp) throw new Error(`Empleado "${d.responsable}" no existe`)
        const extras = Object.entries(EXTRA_NOTAS).filter(([k]) => d[k]).map(([k, t]) => `${t}: ${d[k]}`)
        const notas = [extras.join(' · '), d.factura && `Factura ${d.factura}`, d.notas].filter(Boolean).join('\n') || null
        const r = await supabase.from('activos').insert({ empresa_id: e.id, categoria_id: c.id, marca_id: marcaId, modelo_id: modeloId, descripcion: d.descripcion.trim(),
          serie: d.serie || null, numero_economico: d.eco || null, ubicacion_id: u?.id ?? null, fecha_alta: aFecha(d.fecha) ?? undefined,
          valor_referencia: d.valor ? aNumero(d.valor) : null, notas }).select('id').single()
        if (r.error) throw r.error
        const id = (r.data as { id: string }).id
        const t = tipoDe(c.id)
        if (t.vehiculo && (d.placa || d.anio || d.color || d.motor || d.km || d.combustible || d.transmision || d.version || d.tarjeta || d.poliza)) {
          await supabase.from('activo_vehiculo').upsert({ activo_id: id, placa: d.placa?.toUpperCase() || null, anio: d.anio ? aNumero(d.anio) : null, color: d.color || null, numero_motor: d.motor || null,
            kilometraje: d.km ? aNumero(d.km) : null, combustible: d.combustible || null, transmision: d.transmision || null, version: d.version || null, tarjeta_circulacion: d.tarjeta || null, poliza: d.poliza || null }, { onConflict: 'activo_id' })
        }
        if (d.km && Number(aNumero(d.km)) > 0) await supabase.from('lecturas').insert({ activo_id: id, empresa_id: e.id, tipo: t.maquinaria ? 'horas' : 'km', valor: aNumero(d.km), nota: 'Importado de Excel' })
        if (resp) { const k = `${e.id}|${resp.id}`; const g = asignar.get(k) ?? { empresa: e.id, empleado: resp.id, nombre: nombreEmpleado(resp as never), ids: [], filas: [] }; g.ids.push(id); g.filas.push(f.n); asignar.set(k, g) }
        ok++
      } catch (err) { errores.push({ fila: f.n, error: mensajeError(err) }) }
    }
    const avisos: string[] = []
    let asignados = 0
    for (const g of asignar.values()) {
      const r = await supabase.rpc('registrar_movimiento', { p_tipo: 'asignacion', p_empresa: g.empresa, p_activos: g.ids, p_a_empleado: g.empleado, p_a_ubicacion: null,
        p_entrega_nombre: 'Departamento de TICS', p_recibe_nombre: g.nombre, p_notas: 'Importado de Excel', p_estados: {} })
      if (r.error) avisos.push(`No se pudo asignar a ${g.nombre} (filas ${g.filas.join(', ')}): ${mensajeError(r.error)}. Quedaron disponibles.`)
      else asignados += g.ids.length
    }
    if (asignados) avisos.unshift(`${asignados} quedaron asignados con su resguardo pendiente de firma.`)
    if (nuevas) avisos.push(`Se agregaron ${nuevas} marca(s) o modelo(s) nuevos al catálogo.`)
    return { ok, errores, avisos }
  }
  return <ImportarExcel abierto={abierto} onCerrar={onCerrar} onListo={onListo} titulo="activos" columnas={columnas} variantes={variantes} etiquetaVariante="Categoría del equipo"
    procesar={procesar} nombreArchivo="activos" />
}

// ─────────────────────── Licencias de software ───────────────────────
const TIPOS_LIC: Record<string, string> = { suscripcion: 'Suscripción', perpetua: 'Perpetua', cuenta: 'Cuenta / correo', dominio: 'Dominio / hosting', otro: 'Otro' }
export function ImportarLicencias({ abierto, onCerrar, onListo }: Base) {
  const datos = useCargar(abierto, async () => ({ empresas: await lista('empresas', 'id,nombre,nombre_corto,razon_social') }))
  const columnas: ColImport[] = [
    { key: 'empresa', titulo: 'Empresa', requerido: true, valores: datos?.empresas.map(etqEmpresa) },
    { key: 'nombre', titulo: 'Licencia o cuenta', requerido: true, ejemplo: 'Microsoft 365 Business Standard' }, { key: 'fabricante', titulo: 'Fabricante', ejemplo: 'Microsoft' },
    { key: 'tipo', titulo: 'Tipo', valores: Object.values(TIPOS_LIC), ejemplo: 'Suscripción' }, { key: 'asientos', titulo: 'Lugares', tipo: 'numero', ayuda: 'Vacío = sin límite', ejemplo: '25' },
    { key: 'inicio', titulo: 'Inicio', tipo: 'fecha' }, { key: 'vence', titulo: 'Vencimiento', tipo: 'fecha', ejemplo: '2027-01-31' },
    { key: 'auto', titulo: 'Se renueva sola', tipo: 'bool', ejemplo: 'No' }, { key: 'proveedor', titulo: 'Proveedor' }, { key: 'referencia', titulo: 'Contrato o referencia', ayuda: 'No pongas contraseñas ni claves de producto' }, { key: 'notas', titulo: 'Notas' },
  ]
  async function procesar(filas: Filas): Promise<ResultadoImport> {
    const errores: ResultadoImport['errores'] = []
    const emp = indice(datos?.empresas ?? [], e => e.nombre, e => e.nombre_corto, e => e.razon_social)
    const listas = filas.flatMap(f => {
      const d = f.datos, e = emp(d.empresa)
      if (!e) { errores.push({ fila: f.n, error: `Empresa "${d.empresa}" no existe` }); return [] }
      const tipo = Object.entries(TIPOS_LIC).find(([k, t]) => normal(k) === normal(d.tipo) || normal(t) === normal(d.tipo))?.[0] ?? 'suscripcion'
      return [{ n: f.n, fila: { empresa_id: e.id, nombre: d.nombre, fabricante: d.fabricante || null, tipo, asientos: d.asientos ? aNumero(d.asientos) : null, fecha_inicio: aFecha(d.inicio), fecha_vencimiento: aFecha(d.vence),
        renovacion_automatica: aBool(d.auto), proveedor: d.proveedor || null, referencia: d.referencia || null, notas: d.notas || null } }]
    })
    return { ok: await insertar('licencias_software', listas, errores), errores }
  }
  return <ImportarExcel abierto={abierto} onCerrar={onCerrar} onListo={onListo} titulo="licencias" columnas={columnas} procesar={procesar} nombreArchivo="licencias" />
}

// ─────────────────────── Inmuebles ───────────────────────
const TIPOS_INM: Record<string, string> = { terreno: 'Terreno', oficina: 'Oficina corporativa', bodega: 'Bodega', taller: 'Taller', campamento: 'Campamento', patio: 'Patio de maquinaria', casa_personal: 'Casa para personal', edificacion_proceso: 'Edificación en proceso' }
const CLASIF: Record<string, string> = { urbana: 'Urbana', suburbana: 'Suburbana', rustica: 'Rústica o rural' }
const SITUACION: Record<string, string> = { no_disponible: 'No disponible', en_proceso: 'En proceso', reserva: 'De reserva', en_desarrollo: 'En desarrollo', renta: 'En renta', oficina: 'Oficina', campamento: 'Campamento', empresa_socios: 'Empresa y/o socios' }
const SERV: Record<string, string> = { agua: 'Agua', luz: 'Luz', drenaje: 'Drenaje', internet: 'Internet', gas: 'Gas', pavimento: 'Pavimento' }
const clave = (m: Record<string, string>, v: string) => Object.entries(m).find(([k, t]) => normal(k) === normal(v) || normal(t) === normal(v))?.[0]
export function ImportarInmuebles({ abierto, onCerrar, onListo }: Base) {
  const datos = useCargar(abierto, async () => ({ empresas: await lista('empresas', 'id,nombre,nombre_corto,razon_social') }))
  const columnas: ColImport[] = [
    { key: 'empresa', titulo: 'Empresa', requerido: true, valores: datos?.empresas.map(etqEmpresa) }, { key: 'nombre', titulo: 'Nombre', requerido: true, ejemplo: 'Terreno El Centenario' },
    { key: 'tipo', titulo: 'Tipo', valores: Object.values(TIPOS_INM), ejemplo: 'Terreno' }, { key: 'propietario', titulo: 'Propietario' }, { key: 'catastral', titulo: 'Clave catastral' },
    { key: 'terreno', titulo: 'Superficie de terreno (m²)', tipo: 'numero' }, { key: 'construccion', titulo: 'Superficie de construcción (m²)', tipo: 'numero' },
    { key: 'calle', titulo: 'Calle' }, { key: 'numero', titulo: 'Número exterior' }, { key: 'colonia', titulo: 'Colonia' }, { key: 'municipio', titulo: 'Municipio', ejemplo: 'La Paz' },
    { key: 'estado', titulo: 'Estado', ejemplo: 'Baja California Sur' }, { key: 'cp', titulo: 'C.P.' },
    { key: 'clasificacion', titulo: 'Clasificación', valores: Object.values(CLASIF) }, { key: 'situacion', titulo: 'Situación', valores: Object.values(SITUACION) },
    { key: 'servicios', titulo: 'Servicios', valores: Object.values(SERV), ayuda: 'Separados por coma', ejemplo: 'Agua, Luz' },
    { key: 'latitud', titulo: 'Latitud', tipo: 'numero' }, { key: 'longitud', titulo: 'Longitud', tipo: 'numero' }, { key: 'observaciones', titulo: 'Observaciones' },
  ]
  async function procesar(filas: Filas): Promise<ResultadoImport> {
    const errores: ResultadoImport['errores'] = []
    const emp = indice(datos?.empresas ?? [], e => e.nombre, e => e.nombre_corto, e => e.razon_social)
    const listas = filas.flatMap(f => {
      const d = f.datos, e = emp(d.empresa)
      if (!e) { errores.push({ fila: f.n, error: `Empresa "${d.empresa}" no existe` }); return [] }
      return [{ n: f.n, fila: { empresa_id: e.id, nombre: d.nombre, tipo: clave(TIPOS_INM, d.tipo) ?? 'terreno', propietario: d.propietario || null, clave_catastral: d.catastral || null,
        superficie_terreno: d.terreno ? aNumero(d.terreno) : null, superficie_construccion: d.construccion ? aNumero(d.construccion) : null, calle: d.calle || null, numero_ext: d.numero || null,
        colonia: d.colonia || null, municipio: d.municipio || null, estado: d.estado || 'Baja California Sur', cp: d.cp || null, clasificacion: d.clasificacion ? clave(CLASIF, d.clasificacion) ?? null : null,
        situacion: d.situacion ? clave(SITUACION, d.situacion) ?? null : null, servicios: (d.servicios ?? '').split(/[,;]/).map(x => clave(SERV, x)).filter(Boolean),
        latitud: d.latitud ? aNumero(d.latitud) : null, longitud: d.longitud ? aNumero(d.longitud) : null, observaciones: d.observaciones || null } }]
    })
    return { ok: await insertar('inmuebles', listas, errores), errores }
  }
  return <ImportarExcel abierto={abierto} onCerrar={onCerrar} onListo={onListo} titulo="inmuebles" columnas={columnas} procesar={procesar} nombreArchivo="inmuebles" />
}

// ─────────────────────── Almacén (artículos y existencia inicial) ───────────────────────
export function ImportarConsumibles({ abierto, onCerrar, onListo }: Base) {
  const datos = useCargar(abierto, async () => ({ empresas: await lista('empresas', 'id,nombre,nombre_corto,razon_social'), ubicaciones: await lista('ubicaciones', 'id,nombre,codigo,empresa_id'), consumibles: await lista('consumibles', 'id,nombre,marca') }))
  const columnas: ColImport[] = [
    { key: 'nombre', titulo: 'Artículo', requerido: true, ejemplo: 'Casco de seguridad blanco' }, { key: 'categoria', titulo: 'Categoría', valores: CATEGORIAS_CONS, ejemplo: 'EPP' },
    { key: 'unidad', titulo: 'Unidad', valores: UNIDADES, ejemplo: 'pieza' }, { key: 'marca', titulo: 'Marca', ejemplo: 'MSA' }, { key: 'minimo', titulo: 'Existencia mínima', tipo: 'numero', ejemplo: '10' },
    { key: 'empresa', titulo: 'Empresa', valores: datos?.empresas.map(etqEmpresa), ayuda: 'Solo si vas a cargar existencia inicial' },
    { key: 'ubicacion', titulo: 'Almacén / ubicación', valores: [...new Set((datos?.ubicaciones ?? []).map(u => String(u.nombre)))] },
    { key: 'cantidad', titulo: 'Existencia inicial', tipo: 'numero', ejemplo: '50' }, { key: 'lote', titulo: 'Lote' },
  ]
  async function procesar(filas: Filas): Promise<ResultadoImport> {
    const errores: ResultadoImport['errores'] = []
    const emp = indice(datos?.empresas ?? [], e => e.nombre, e => e.nombre_corto, e => e.razon_social)
    const cons = [...(datos?.consumibles ?? [])]
    let ok = 0, entradas = 0
    for (const f of filas) {
      const d = f.datos
      try {
        let c = cons.find(x => normal(x.nombre) === normal(d.nombre) && normal(x.marca) === normal(d.marca))
        if (!c) {
          const r = await supabase.from('consumibles').insert({ nombre: d.nombre.trim(), categoria: CATEGORIAS_CONS.find(x => normal(x) === normal(d.categoria)) ?? (d.categoria || null),
            unidad: UNIDADES.find(x => normal(x) === normal(d.unidad)) ?? 'pieza', marca: d.marca || null, minimo: d.minimo ? aNumero(d.minimo) : 0 }).select('id,nombre,marca').single()
          if (r.error) throw r.error; c = r.data as R; cons.push(c)
        }
        const cant = d.cantidad ? Number(aNumero(d.cantidad)) : 0
        if (cant > 0) {
          const e = emp(d.empresa); if (!e) throw new Error(`Para la existencia inicial falta una empresa válida ("${d.empresa}")`)
          const u = d.ubicacion ? datos?.ubicaciones.find(x => x.empresa_id === e.id && (normal(x.nombre) === normal(d.ubicacion) || normal(x.codigo) === normal(d.ubicacion))) : undefined
          if (d.ubicacion && !u) throw new Error(`Ubicación "${d.ubicacion}" no existe en ${etqEmpresa(e)}`)
          const r = await supabase.from('movimientos_consumible').insert({ consumible_id: c.id, empresa_id: e.id, ubicacion_id: u?.id ?? null, tipo: 'entrada', cantidad: cant, lote: d.lote || null, notas: 'Existencia inicial (importada de Excel)' })
          if (r.error) throw r.error
          entradas++
        }
        ok++
      } catch (err) { errores.push({ fila: f.n, error: mensajeError(err) }) }
    }
    return { ok, errores, avisos: entradas ? [`${entradas} con existencia inicial registrada como entrada.`] : [] }
  }
  return <ImportarExcel abierto={abierto} onCerrar={onCerrar} onListo={onListo} titulo="artículos de almacén" columnas={columnas} procesar={procesar} nombreArchivo="almacen" />
}
