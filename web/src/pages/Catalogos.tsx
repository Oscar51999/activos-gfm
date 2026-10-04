import { Link } from 'react-router-dom'
import Catalogo from '../components/Catalogo'
import { TIPOS_UBICACION } from '../lib/supabase'
import { nombreEmpleado } from '../lib/hooks'

type R = Record<string, unknown>
const emp = (f: R) => (f.empresas as { nombre?: string } | null)?.nombre ?? '—'
const activo = (f: R) => f.activo === false ? <span className="text-xs text-stone-400">Inactivo</span> : <span className="text-xs text-emerald-700">Activo</span>
const refEmpleado = { tabla: 'empleados', select: 'id,nombres,apellidos,empresa_id', etiqueta: (r: R) => nombreEmpleado(r as never), porEmpresa: true }

export function Empresas() {
  return <Catalogo tabla="empresas" titulo="Empresas" sub="Razones sociales del grupo." soloAdmin
    campos={[
      { key: 'nombre', label: 'Nombre corto', requerido: true },
      { key: 'razon_social', label: 'Razón social' },
      { key: 'rfc', label: 'RFC' },
    ]}
    columnas={[{ key: 'nombre', label: 'Nombre' }, { key: 'razon_social', label: 'Razón social' }, { key: 'rfc', label: 'RFC' }, { key: 'activo', label: 'Estado', render: activo }]}
    buscarEn={['nombre', 'razon_social', 'rfc']} />
}

export function Sucursales() {
  return <Catalogo tabla="sucursales" titulo="Sucursales" sub="Sedes de cada empresa." porEmpresa select="*,empresas(nombre)"
    campos={[{ key: 'nombre', label: 'Nombre', requerido: true, completo: true }]}
    columnas={[{ key: 'nombre', label: 'Sucursal' }, { key: 'empresa', label: 'Empresa', render: emp }]} />
}

export function Departamentos() {
  return <Catalogo tabla="departamentos" titulo="Departamentos" porEmpresa select="*,empresas(nombre)"
    campos={[{ key: 'nombre', label: 'Nombre', requerido: true, completo: true }]}
    columnas={[{ key: 'nombre', label: 'Departamento' }, { key: 'empresa', label: 'Empresa', render: emp }]} />
}

export function Empleados() {
  return <Catalogo tabla="empleados" titulo="Empleados" sub="Personas que pueden tener activos bajo resguardo." porEmpresa
    select="*,empresas(nombre),departamentos(nombre)" orden="nombres"
    campos={[
      { key: 'nombres', label: 'Nombre(s)', requerido: true },
      { key: 'apellidos', label: 'Apellidos' },
      { key: 'codigo', label: 'No. de empleado' },
      { key: 'puesto', label: 'Puesto' },
      { key: 'departamento_id', label: 'Departamento', tipo: 'ref', ref: { tabla: 'departamentos', porEmpresa: true } },
      { key: 'email', label: 'Correo', tipo: 'email' },
      { key: 'telefono', label: 'Teléfono', tipo: 'tel' },
    ]}
    columnas={[
      { key: 'nombre', label: 'Nombre', render: f => nombreEmpleado(f as never) },
      { key: 'codigo', label: 'No.' },
      { key: 'puesto', label: 'Puesto' },
      { key: 'depto', label: 'Departamento', render: f => (f.departamentos as { nombre?: string } | null)?.nombre ?? '—' },
      { key: 'empresa', label: 'Empresa', render: emp },
      { key: 'resg', label: 'Activos', render: f => <Link to={`/empleados/${f.id}/resguardo`} className="text-sm font-medium text-marca-oscuro hover:underline">Ver resguardo</Link> },
    ]}
    buscarEn={['nombres', 'apellidos', 'codigo', 'puesto']} />
}

export function Ubicaciones() {
  return <Catalogo tabla="ubicaciones" titulo="Ubicaciones" sub="Obras, almacenes, oficinas y patios donde están los activos." porEmpresa
    select="*,empresas(nombre),responsable:empleados(nombres,apellidos)"
    campos={[
      { key: 'nombre', label: 'Nombre', requerido: true },
      { key: 'tipo', label: 'Tipo', tipo: 'enum', opciones: TIPOS_UBICACION, requerido: true, defecto: 'obra' },
      { key: 'codigo', label: 'Código / # de obra' },
      { key: 'responsable_id', label: 'Responsable', tipo: 'ref', ref: refEmpleado },
      { key: 'direccion', label: 'Dirección', completo: true },
      { key: 'latitud', label: 'Latitud', tipo: 'numero' },
      { key: 'longitud', label: 'Longitud', tipo: 'numero' },
    ]}
    columnas={[
      { key: 'nombre', label: 'Ubicación' },
      { key: 'tipo', label: 'Tipo', render: f => TIPOS_UBICACION[f.tipo as keyof typeof TIPOS_UBICACION] },
      { key: 'codigo', label: 'Código' },
      { key: 'resp', label: 'Responsable', render: f => nombreEmpleado(f.responsable as never) || '—' },
      { key: 'empresa', label: 'Empresa', render: emp },
    ]}
    buscarEn={['nombre', 'codigo', 'direccion']} />
}

export function Categorias() {
  return <Catalogo tabla="categorias" titulo="Categorías" sub="Tipos de activo. Marca como vehículo las que llevan placa o kilometraje."
    select="*,padre:padre_id(nombre)"
    campos={[
      { key: 'nombre', label: 'Nombre', requerido: true },
      { key: 'padre_id', label: 'Pertenece a (opcional)', tipo: 'ref', ref: { tabla: 'categorias' } },
      { key: 'es_vehiculo', label: 'Es vehículo o maquinaria con motor', tipo: 'bool' },
    ]}
    columnas={[
      { key: 'nombre', label: 'Categoría' },
      { key: 'padre', label: 'Pertenece a', render: f => (f.padre as { nombre?: string } | null)?.nombre ?? '—' },
      { key: 'es_vehiculo', label: 'Vehículo', render: f => f.es_vehiculo ? 'Sí' : 'No' },
    ]} />
}

export function Marcas() {
  return <Catalogo tabla="marcas" titulo="Marcas"
    campos={[{ key: 'nombre', label: 'Marca', requerido: true, completo: true }]}
    columnas={[{ key: 'nombre', label: 'Marca' }, { key: 'activo', label: 'Estado', render: activo }]} />
}

export function Modelos() {
  return <Catalogo tabla="modelos" titulo="Modelos" select="*,marcas(nombre)"
    campos={[
      { key: 'marca_id', label: 'Marca', tipo: 'ref', ref: { tabla: 'marcas' }, requerido: true },
      { key: 'nombre', label: 'Modelo', requerido: true },
    ]}
    columnas={[{ key: 'nombre', label: 'Modelo' }, { key: 'marca', label: 'Marca', render: f => (f.marcas as { nombre?: string } | null)?.nombre ?? '—' }]} />
}

export function Proveedores() {
  return <Catalogo tabla="proveedores" titulo="Proveedores" sub="Talleres, aseguradoras y agencias que dan servicio a los activos."
    campos={[
      { key: 'nombre', label: 'Nombre', requerido: true },
      { key: 'rfc', label: 'RFC' },
      { key: 'tipos', label: 'Tipo', tipo: 'multi', opciones: { taller: 'Taller', aseguradora: 'Aseguradora', agencia: 'Agencia', otro: 'Otro' }, completo: true },
      { key: 'contacto', label: 'Contacto' },
      { key: 'telefono', label: 'Teléfono', tipo: 'tel' },
      { key: 'email', label: 'Correo', tipo: 'email' },
    ]}
    columnas={[
      { key: 'nombre', label: 'Proveedor' },
      { key: 'tipos', label: 'Tipo', render: f => ((f.tipos as string[]) ?? []).join(', ') || '—' },
      { key: 'contacto', label: 'Contacto' },
      { key: 'telefono', label: 'Teléfono' },
    ]}
    buscarEn={['nombre', 'rfc', 'contacto']} />
}
