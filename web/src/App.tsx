import { useState, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase, mensajeError } from './lib/supabase'
import Layout from './components/Layout'
import { Cargando, Aviso } from './components/ui'
import Login from './pages/Login'
import Tablero from './pages/Tablero'
import Activos from './pages/Activos'
import ActivoForm from './pages/ActivoForm'
import ActivoDetalle from './pages/ActivoDetalle'
import { AbrirQR } from './pages/AbrirQR'
const Etiquetas = lazy(() => import('./pages/Etiquetas'))
const Escanear = lazy(() => import('./pages/Escanear'))
import Usuarios from './pages/Usuarios'
import Movimientos from './pages/Movimientos'
import MovimientoNuevo from './pages/MovimientoNuevo'
import MovimientoDetalle from './pages/MovimientoDetalle'
import ResguardoEmpleado from './pages/ResguardoEmpleado'
import { Sucursales, Departamentos, Ubicaciones, Categorias, Marcas, Modelos, Proveedores, CodigosFalla, RequisitosOperacion } from './pages/Catalogos'
import Empresas, { EmpresaDetalle } from './pages/Empresas'
import Personal, { EmpleadoDetalle } from './pages/Personal'
import Productos, { ProductoDetalle } from './pages/Productos'
import Alta from './pages/Alta'
import Prestamos from './pages/Prestamos'
import Reportes from './pages/Reportes'
import Inventarios, { InventarioConteo } from './pages/Inventarios'
import QRPublico from './pages/QRPublico'
import Vigencias from './pages/Vigencias'
import Kits from './pages/Kits'
import Confirmaciones from './pages/Confirmaciones'
import Traspasos from './pages/Traspasos'
import { FirmaRemota, ConfirmacionRemota } from './pages/Publicas'
import Mantenimiento, { OrdenTrabajo } from './pages/Mantenimiento'
import Almacen from './pages/Almacen'
import Solicitudes from './pages/Solicitudes'
import Mapa from './pages/Mapa'
import Inmuebles, { InmuebleDetalle } from './pages/Inmuebles'
import Preguntar from './pages/Preguntar'
import Confiabilidad from './pages/Confiabilidad'
import Vales, { ValePublico } from './pages/Vales'
import { LogoFirme } from './components/Logo'

function Pendiente() {
  const { perfil, salir, recargarPerfil } = useAuth()
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="tarjeta max-w-md p-8 text-center">
        <LogoFirme className="mx-auto mb-6 h-12 w-auto text-[#fff]" />
        <h1 className="text-xl font-semibold">Tu cuenta está pendiente de activación</h1>
        <p className="mt-2 text-sm text-stone-600">Hola {perfil?.nombre}. Un administrador del Departamento de TI debe activar tu acceso y asignarte las empresas que verás.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn-sec" onClick={recargarPerfil}>Ya me activaron</button>
          <button className="btn-primario" onClick={salir}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  )
}

function SinPerfil() {
  const { salir, recargarPerfil } = useAuth()
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="tarjeta max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">No pudimos cargar tu perfil</h1>
        <p className="mt-2 text-sm text-stone-600">Revisa tu conexión e inténtalo de nuevo. Si sigue pasando, avisa al Departamento de TI.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn-sec" onClick={recargarPerfil}>Reintentar</button>
          <button className="btn-primario" onClick={salir}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  )
}

function CambiarContrasena() {
  const [p, setP] = useState('')
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null)
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: p })
    setMsg(error ? { t: 'error', m: mensajeError(error) } : { t: 'ok', m: 'Contraseña actualizada.' })
  }
  return (
    <form onSubmit={enviar} className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Cambiar contraseña</h1>
      <input className="campo" type="password" minLength={8} required placeholder="Nueva contraseña (mín. 8)" value={p} onChange={e => setP(e.target.value)} />
      {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}
      <button className="btn-primario w-full">Guardar</button>
    </form>
  )
}

function Rutas() {
  const { session, perfil, cargando, esAdmin } = useAuth()
  const [forzarLogin, setForzarLogin] = useState(false)
  if (cargando) return <div className="p-8"><Cargando /></div>
  if (!session) return forzarLogin ? <Login /> : (
    <Routes>
      <Route path="q/:qr" element={<QRPublico onEntrar={() => setForzarLogin(true)} />} />
      <Route path="firmar/:token" element={<FirmaRemota />} />
      <Route path="confirmar/:token" element={<ConfirmacionRemota />} />
      <Route path="vale/:token" element={<ValePublico />} />
      <Route path="*" element={<Login />} />
    </Routes>
  )
  if (!perfil) return <SinPerfil />
  if (!perfil.activo) return <Pendiente />
  return (
    <Routes>
      <Route path="firmar/:token" element={<FirmaRemota />} />
      <Route path="confirmar/:token" element={<ConfirmacionRemota />} />
      <Route path="vale/:token" element={<ValePublico />} />
      <Route element={<Layout />}>
        <Route index element={<Tablero />} />
        <Route path="activos" element={<Activos />} />
        <Route path="activos/nuevo" element={<ActivoForm />} />
        <Route path="activos/:id" element={<ActivoDetalle />} />
        <Route path="activos/:id/editar" element={<ActivoForm />} />
        <Route path="etiquetas" element={<Suspense fallback={<Cargando />}><Etiquetas /></Suspense>} />
        <Route path="escanear" element={<Suspense fallback={<Cargando />}><Escanear /></Suspense>} />
        <Route path="q/:qr" element={<AbrirQR />} />
        <Route path="resguardos" element={<Movimientos />} />
        <Route path="resguardos/nuevo" element={<MovimientoNuevo />} />
        <Route path="resguardos/:id" element={<MovimientoDetalle />} />
        <Route path="empleados/:id/resguardo" element={<ResguardoEmpleado />} />
        <Route path="ubicaciones" element={<Ubicaciones />} />
        <Route path="empleados" element={<Personal />} />
        <Route path="empleados/:id" element={<EmpleadoDetalle />} />
        <Route path="catalogo" element={<Productos />} />
        <Route path="catalogo/:id" element={<ProductoDetalle />} />
        <Route path="alta" element={<Alta />} />
        <Route path="prestamos" element={<Prestamos />} />
        <Route path="vigencias" element={<Vigencias />} />
        <Route path="kits" element={<Kits />} />
        <Route path="mantenimiento" element={<Mantenimiento />} />
        <Route path="mantenimiento/ot/:id" element={<OrdenTrabajo />} />
        <Route path="confirmaciones" element={<Confirmaciones />} />
        <Route path="almacen" element={<Almacen />} />
        <Route path="solicitudes" element={<Solicitudes />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="inmuebles" element={<Inmuebles />} />
        <Route path="preguntar" element={<Preguntar />} />
        <Route path="confiabilidad" element={<Confiabilidad />} />
        <Route path="vales" element={<Vales />} />
        <Route path="codigos-falla" element={<CodigosFalla />} />
        <Route path="requisitos" element={<RequisitosOperacion />} />
        <Route path="inmuebles/:id" element={<InmuebleDetalle />} />
        <Route path="traspasos" element={<Traspasos />} />
        <Route path="reportes" element={<Reportes />} />
        <Route path="inventarios" element={<Inventarios />} />
        <Route path="inventarios/:id" element={<InventarioConteo />} />
        <Route path="empresas/:id" element={<EmpresaDetalle />} />
        <Route path="departamentos" element={<Departamentos />} />
        <Route path="sucursales" element={<Sucursales />} />
        <Route path="empresas" element={<Empresas />} />
        <Route path="categorias" element={<Categorias />} />
        <Route path="marcas" element={<Marcas />} />
        <Route path="modelos" element={<Modelos />} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="cambiar-contrasena" element={<CambiarContrasena />} />
        {esAdmin && <Route path="usuarios" element={<Usuarios />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider><Rutas /></AuthProvider>
    </HashRouter>
  )
}
