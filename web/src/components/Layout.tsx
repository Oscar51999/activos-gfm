import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, Boxes, ClipboardSignature, MapPin, Users, Tags, Building2, Truck, UserCog, ScanLine, LogOut,
  X, Factory, CalendarCheck, Sun, Moon, UserRound, ShieldAlert, ChevronUp, BookOpenText, Briefcase, Search, PanelLeftClose, PanelLeftOpen, Menu, KeyRound, PackageSearch, PackagePlus, CalendarClock, Siren, ClipboardCheck, FileClock, ShieldCheck, Repeat, Package, Wrench, Warehouse, Inbox, Map as MapaIcono, Landmark, Sparkles, Download, Activity, Truck as Camion, ListTree, IdCard, Hash, RefreshCcw, Grid3x3, Car, Archive, BarChart3, Receipt, Nfc, MailCheck, Headset, Fuel, FileSignature, Hourglass, Route, Leaf,
} from 'lucide-react'
import { useAuth, fotoPerfil } from '../lib/auth'
import { aplicarTema, temaActual, type Tema } from '../lib/tema'
import AsistenteFlotante from './AsistenteFlotante'
import { registrarReciente } from '../lib/recientes'
import { ROLES, supabase } from '../lib/supabase'
import { LogoFirme, MonogramaFirme } from './Logo'
import Comandos, { type Destino } from './Comandos'
import { avisosAlmacen } from '../lib/almacen'
import { SugerenciaInstalar } from './Instalar'
import { rastreador } from '../lib/viaje'
import { PieLegal } from '../pages/Legal'
import ErrorBoundary from './ErrorBoundary'
import { escuchar, pendientes, sincronizar, estaMandando } from '../lib/sinSenal'

type Entrada = { to: string; icono: typeof Boxes; texto: string; fin?: boolean; alerta?: 'prestamos' | 'reportes' | 'vigencias' | 'mantenimiento' | 'solicitudes' | 'almacen' | 'servicios' }
const grupos: { titulo: string; items: Entrada[] }[] = [
  { titulo: 'Operación', items: [
    { to: '/', icono: LayoutDashboard, texto: 'Tablero', fin: true },
    { to: '/mis-equipos', icono: UserRound, texto: 'Mis equipos' },
    { to: '/reservas', icono: CalendarClock, texto: 'Reservas de equipo' },
    { to: '/preguntar', icono: Sparkles, texto: 'Pregúntale' },
    { to: '/empresas', icono: Building2, texto: 'Empresas' },
    { to: '/activos', icono: Boxes, texto: 'Activos' },
    { to: '/catalogo', icono: PackageSearch, texto: 'Catálogo' },
    { to: '/resguardos', icono: ClipboardSignature, texto: 'Resguardos' },
    { to: '/solicitudes', icono: Inbox, texto: 'Solicitudes', alerta: 'solicitudes' },
    { to: '/almacen', icono: Warehouse, texto: 'Almacén', alerta: 'almacen' },
    { to: '/mapa', icono: MapaIcono, texto: 'Mapa de obras' },
    { to: '/bitacoras', icono: BookOpenText, texto: 'Bitácoras' },
    { to: '/escanear', icono: ScanLine, texto: 'Escanear QR' },
    { to: '/etiquetas-nfc', icono: Nfc, texto: 'Etiquetas NFC' },
  ] },
  { titulo: 'Control', items: [
    { to: '/mantenimiento', icono: Wrench, texto: 'Mantenimiento', alerta: 'mantenimiento' },
    { to: '/checklist-vehicular', icono: Car, texto: 'Checklist vehicular' },
    { to: '/confiabilidad', icono: Activity, texto: 'Confiabilidad' },
    { to: '/vales', icono: Camion, texto: 'Vales de salida' },
    { to: '/vigencias', icono: FileClock, texto: 'Vigencias', alerta: 'vigencias' },
    { to: '/prestamos', icono: CalendarClock, texto: 'Préstamos', alerta: 'prestamos' },
    { to: '/reportes', icono: Siren, texto: 'Reportes de falla', alerta: 'reportes' },
    { to: '/tickets', icono: Headset, texto: 'Mesa de ayuda' },
    { to: '/combustible', icono: Fuel, texto: 'Combustible' },
    { to: '/viajes', icono: Route, texto: 'Bitácora de viajes' },
    { to: '/huella-carbono', icono: Leaf, texto: 'Huella de carbono' },
    { to: '/licencias', icono: KeyRound, texto: 'Licencias y cuentas' },
    { to: '/contratos', icono: FileSignature, texto: 'Contratos y pólizas' },
    { to: '/renovacion', icono: Hourglass, texto: 'Renovación de equipo' },
    { to: '/bajas', icono: Archive, texto: 'Bajas de activos' },
    { to: '/inventarios', icono: ClipboardCheck, texto: 'Inventario físico' },
    { to: '/conteo-ciclico', icono: RefreshCcw, texto: 'Conteo cíclico' },
    { to: '/posiciones', icono: Grid3x3, texto: 'Posiciones de almacén' },
    { to: '/confirmaciones', icono: ShieldCheck, texto: 'Confirmaciones' },
    { to: '/traspasos', icono: Repeat, texto: 'Traspasos entre empresas' },
  ] },
  { titulo: 'Organización', items: [
    { to: '/empleados', icono: Users, texto: 'Empleados' },
    { to: '/inmuebles', icono: Landmark, texto: 'Inmuebles' },
    { to: '/servicios', icono: Receipt, texto: 'Servicios por pagar', alerta: 'servicios' },
    { to: '/ubicaciones', icono: MapPin, texto: 'Ubicaciones' },
    { to: '/departamentos', icono: Briefcase, texto: 'Departamentos' },
    { to: '/sucursales', icono: Factory, texto: 'Sucursales' },
  ] },
  { titulo: 'Catálogos', items: [
    { to: '/kits', icono: Package, texto: 'Kits por puesto' },
    { to: '/requisitos', icono: IdCard, texto: 'Requisitos para operar' },
    { to: '/codigos-falla', icono: ListTree, texto: 'Códigos de falla' },
    { to: '/categorias', icono: Tags, texto: 'Categorías' },
    { to: '/marcas', icono: Tags, texto: 'Marcas y modelos' },
    { to: '/proveedores', icono: Truck, texto: 'Proveedores' },
    { to: '/centros-costo', icono: Hash, texto: 'Centros de costo' },
  ] },
]

const leer = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

/** Estado de la conexión y capturas guardadas en el equipo. */
function Conexion() {
  const [enLinea, setEnLinea] = useState(navigator.onLine !== false)
  const [n, setN] = useState(pendientes().length)
  const [mandando, setMandando] = useState(false)
  useEffect(() => {
    const f = () => { setEnLinea(navigator.onLine !== false); setN(pendientes().length); setMandando(estaMandando()) }
    window.addEventListener('online', f); window.addEventListener('offline', f)
    const quitar = escuchar(f)
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); quitar() }
  }, [])
  if (!enLinea) return (
    <span className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800" title="Puedes seguir consultando lo último que se cargó; los conteos y entregas se guardan y se mandan al volver la señal.">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Sin señal{n ? ` · ${n} por mandar` : ''}
    </span>
  )
  if (n) return (
    <button onClick={() => sincronizar()} className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-700">
      <span className={`h-1.5 w-1.5 rounded-full bg-sky-400 ${mandando ? 'animate-pulso' : ''}`} />{mandando ? 'Mandando…' : `${n} por mandar`}
    </button>
  )
  return (
    <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700 xl:flex">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulso" />En línea
    </span>
  )
}

function Instalar({ mini }: { mini: boolean }) {
  const [listo, setListo] = useState(() => !!(window as unknown as { __instalar?: Event }).__instalar)
  useEffect(() => { const f = () => setListo(true); window.addEventListener('gfm-instalable', f); return () => window.removeEventListener('gfm-instalable', f) }, [])
  if (!listo) return null
  return (
    <button title="Instalar la app en este equipo" onClick={async () => { const e = (window as unknown as { __instalar?: { prompt: () => Promise<void> } }).__instalar; await e?.prompt(); setListo(false) }}
      className="mb-1 flex w-full items-center justify-center gap-2 rounded-lg border border-marca/40 bg-marca/10 px-2 py-2 text-xs font-medium text-marca hover:bg-marca/20"><Download size={15} />{!mini && 'Instalar app'}</button>
  )
}

function Reloj() {
  const [ahora, setAhora] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(t) }, [])
  return (
    <span className="hidden text-right leading-tight md:block">
      <span className="cifra block text-sm text-tinta">{ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="block text-[10px] uppercase tracking-wider text-stone-400">{ahora.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
    </span>
  )
}

/** Reflejo que sigue al cursor en cualquier tarjeta .viva */
function useReflejo() {
  useEffect(() => {
    const f = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.viva') as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${e.clientX - r.left}px`); el.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    document.addEventListener('pointermove', f, { passive: true })
    return () => document.removeEventListener('pointermove', f)
  }, [])
}

export default function Layout() {
  const { esAdmin, esSuper, puedeEditar } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [compacto, setCompacto] = useState(() => leer('gfm.menu') === 'compacto')
  const [buscar, setBuscar] = useState(false)
  const loc = useLocation()
  useReflejo()
  const [alertas, setAlertas] = useState({ prestamos: 0, reportes: 0, vigencias: 0, mantenimiento: 0, solicitudes: 0, almacen: 0, servicios: 0 })
  useEffect(() => {
    const hoy = new Date(); const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    Promise.all([
      supabase.from('v_prestamos').select('activo_id').lt('fecha_devolucion', iso),
      supabase.from('reportes').select('id').eq('estatus', 'abierto'),
      supabase.from('v_vigencias').select('id').lt('fecha_vencimiento', iso),
      supabase.from('v_mantenimiento').select('plan_id').eq('estado', 'vencido'),
      supabase.from('inmueble_pagos').select('id').eq('pagado', false).lt('fecha_limite', iso),
      avisosAlmacen(),
    ]).then(([p, r, v, m, sv, a]) => setAlertas({ prestamos: p.data?.length ?? 0, reportes: r.data?.length ?? 0, vigencias: v.data?.length ?? 0, mantenimiento: m.data?.length ?? 0, solicitudes: a.pendientes, almacen: a.bajo, servicios: sv.data?.length ?? 0 }))
  }, [loc.pathname])

  const todos = useMemo(() => [...grupos, ...(puedeEditar ? [{ titulo: 'Administración', items: [
    { to: '/actividades', icono: CalendarCheck, texto: 'Actividades' },
    { to: '/indicadores', icono: BarChart3, texto: 'Indicadores' },
    ...(esAdmin ? [{ to: '/usuarios', icono: UserCog, texto: 'Usuarios' }, { to: '/avisos', icono: MailCheck, texto: 'Avisos por correo' }] : []),
    ...(esSuper ? [{ to: '/admin', icono: ShieldAlert, texto: 'Panel de administrador' }] : []),
  ] }] : [])], [puedeEditar, esAdmin, esSuper])
  const destinos = useMemo<Destino[]>(() => [
    ...todos.flatMap(g => g.items.map(i => ({ to: i.to, texto: i.texto, icono: i.icono, grupo: g.titulo }))),
    { to: '/alta', texto: 'Alta de activos', icono: PackagePlus, grupo: 'Acción' },
    { to: '/alta/inteligente', texto: 'Alta inteligente (factura o foto)', icono: Sparkles, grupo: 'Acción' },
    { to: '/resguardos/nuevo', texto: 'Nuevo resguardo', icono: ClipboardSignature, grupo: 'Acción' },
    { to: '/etiquetas', texto: 'Imprimir etiquetas QR', icono: Tags, grupo: 'Acción' },
    { to: '/etiquetas-nfc', texto: 'Ligar stickers NFC', icono: Nfc, grupo: 'Acción' },
    { to: '/inventarios', texto: 'Nuevo conteo de inventario', icono: ClipboardCheck, grupo: 'Acción' },
    { to: '/solicitudes', texto: 'Pedir equipo o material', icono: Inbox, grupo: 'Acción' },
    { to: '/perfil', texto: 'Mi perfil', icono: UserRound, grupo: 'Cuenta' },
    { to: '/cambiar-contrasena', texto: 'Cambiar contraseña', icono: KeyRound, grupo: 'Cuenta' },
  ], [todos])
  const actual = destinos.find(d => d.to !== '/' && loc.pathname.startsWith(d.to)) ?? destinos[0]

  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscar(b => !b) } }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [])
  useEffect(() => { setAbierto(false) }, [loc.pathname])
  useEffect(() => { if (actual && actual.to !== '/' && loc.pathname === actual.to) registrarReciente(actual.to, actual.texto, actual.grupo ?? '') }, [loc.pathname, actual])

  const alternar = () => setCompacto(c => { guardar('gfm.menu', c ? 'amplio' : 'compacto'); return !c })

  const nav = (mini: boolean) => (
    <nav className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-3 py-2">
      {todos.map(g => (
        <div key={g.titulo}>
          {mini ? <div className="mx-auto mb-2 h-px w-6 bg-stone-300" /> : <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-stone-400">{g.titulo}</p>}
          <div className="space-y-0.5">
            {g.items.map(i => (
              <NavLink key={i.to} to={i.to} end={i.fin} title={mini ? i.texto : undefined}
                className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl py-2 text-sm transition ${mini ? 'justify-center px-0' : 'px-3'} ${isActive ? 'bg-gradient-to-r from-marca/20 to-marca/0 text-tinta' : 'text-stone-500 hover:bg-stone-100 hover:text-tinta'}`}>
                {({ isActive }) => <>
                  {isActive && <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-marca shadow-[0_0_14px_2px_rgb(226_166_75/.7)]" />}
                  <i.icono size={18} className={`shrink-0 transition ${isActive ? 'text-marca drop-shadow-[0_0_6px_rgb(226_166_75/.8)]' : 'group-hover:text-marca'}`} />
                  {!mini && <span className="truncate">{i.texto}</span>}
                  {i.alerta && alertas[i.alerta] > 0 && (mini
                    ? <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                    : <span className="ml-auto rounded-full bg-red-500/90 px-1.5 text-[10px] font-bold leading-4 text-[#fff]">{alertas[i.alerta]}</span>)}
                </>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )

  const pie = (mini: boolean) => (
    <div className="border-t border-stone-200 p-3">
      <Instalar mini={mini} />
      <MenuPerfil mini={mini} />
    </div>
  )

  const movil = [
    { to: '/', icono: LayoutDashboard, texto: 'Tablero', fin: true },
    { to: '/empresas', icono: Building2, texto: 'Empresas' },
    { to: '/escanear', icono: ScanLine, texto: 'Escanear', centro: true },
    { to: '/resguardos', icono: ClipboardSignature, texto: 'Resguardos' },
  ]

  return (
    <div className="flex h-full">
      {/* Menú lateral escritorio */}
      <aside className={`no-print relative hidden shrink-0 flex-col border-r border-stone-200 bg-barra/80 backdrop-blur-xl transition-[width] duration-300 lg:flex ${compacto ? 'w-[76px]' : 'w-64'}`}>
        <div className={`flex h-20 items-center ${compacto ? 'justify-center' : 'px-6'}`}>
          {compacto ? <MonogramaFirme className="h-8 w-auto text-tinta" /> : <LogoFirme className="h-9 w-auto text-tinta" />}
        </div>
        {!compacto && <p className="-mt-3 mb-3 px-6 text-[10px] font-medium uppercase tracking-[.22em] text-marca">Control de activos</p>}
        {nav(compacto)}
        {pie(compacto)}
        <button onClick={alternar} aria-label={compacto ? 'Expandir menú' : 'Compactar menú'}
          className="absolute -right-3 top-24 grid h-6 w-6 place-items-center rounded-full border border-stone-300 bg-panel text-stone-500 transition hover:border-marca hover:text-marca">
          {compacto ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
        </button>
      </aside>

      {/* Menú deslizable en móvil */}
      <div className={`no-print fixed inset-0 z-50 lg:hidden ${abierto ? '' : 'pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ${abierto ? 'opacity-100' : 'opacity-0'}`} onClick={() => setAbierto(false)} />
        <aside className={`relative flex h-full w-72 flex-col border-r border-stone-200 bg-barra transition-transform duration-300 ${abierto ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex h-20 items-center justify-between px-6">
            <LogoFirme className="h-8 w-auto text-tinta" />
            <button className="text-stone-500" onClick={() => setAbierto(false)} aria-label="Cerrar menú"><X size={20} /></button>
          </div>
          {nav(false)}{pie(false)}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-stone-200 bg-fondo/70 px-4 backdrop-blur-xl sm:px-6">
          <button className="lg:hidden" onClick={() => setAbierto(true)} aria-label="Abrir menú"><Menu size={22} /></button>
          <MonogramaFirme className="h-6 w-auto text-tinta lg:hidden" />
          <div className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
            <span className="text-stone-400">{actual.grupo}</span><span className="text-stone-300">/</span>
            <span className="truncate font-medium">{actual.texto}</span>
          </div>
          <button onClick={() => setBuscar(true)}
            className="ml-auto flex h-10 min-w-0 items-center gap-2 rounded-xl border border-stone-300 bg-stone-50 px-3 text-sm text-stone-400 transition hover:border-marca/60 hover:text-tinta sm:w-72 lg:w-96">
            <Search size={16} className="shrink-0 text-marca" />
            <span className="hidden truncate sm:inline">Buscar activo, empleado…</span>
            <kbd className="ml-auto hidden rounded-md border border-stone-300 px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <Conexion />
          <Reloj />
        </header>

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          <div key={loc.pathname} className="mx-auto max-w-7xl animate-entrar p-4 sm:p-6 lg:p-8"><SugerenciaInstalar />{loc.pathname !== '/viajes' && <ViajeActivo />}<ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary><PieLegal className="mt-12 pb-24 lg:pb-2" /></div>
        </main>

        {/* Barra inferior en móvil con botón central de escaneo */}
        <nav className="no-print fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 items-end rounded-2xl border border-stone-300 bg-panel/90 px-2 pb-[calc(.5rem+env(safe-area-inset-bottom,0px))] pt-2 backdrop-blur-xl lg:hidden">
          {movil.map(m => (
            <NavLink key={m.to} to={m.to} end={m.fin} className={({ isActive }) => `flex flex-col items-center gap-1 text-[10px] ${isActive ? 'text-marca' : 'text-stone-500'}`}>
              {m.centro
                ? <span className="-mt-7 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-[#EBB866] to-[#CF9336] text-[#120D04] shadow-[0_8px_30px_-6px_rgb(226_166_75/.8)] ring-4 ring-fondo"><m.icono size={24} /></span>
                : <m.icono size={20} />}
              {m.texto}
            </NavLink>
          ))}
          <button onClick={() => setBuscar(true)} className="flex flex-col items-center gap-1 text-[10px] text-stone-500"><Search size={20} />Buscar</button>
        </nav>
      </div>

      <Comandos abierto={buscar} onCerrar={() => setBuscar(false)} destinos={destinos} />
      {!loc.pathname.startsWith('/preguntar') && !loc.pathname.startsWith('/alta') && <AsistenteFlotante />}
    </div>
  )
}

/** Avatar con menú: ver perfil, tema, contraseña, administración (solo el administrador principal) y salir. */
export function MenuPerfil({ mini }: { mini: boolean }) {
  const { perfil, esSuper, salir } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [tema, setTema] = useState<Tema>(temaActual())
  const caja = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  useEffect(() => { setAbierto(false) }, [loc.pathname])
  useEffect(() => {
    if (!abierto) return
    const f = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', f); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k) }
  }, [abierto])
  async function cambiarTema() {
    const t: Tema = tema === 'claro' ? 'oscuro' : 'claro'
    aplicarTema(t); setTema(t)
    if (perfil) await supabase.from('perfiles').update({ preferencias: { ...(perfil.preferencias ?? {}), tema: t } }).eq('id', perfil.id)
  }
  const iniciales = (perfil?.nombre ?? '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  const foto = fotoPerfil(perfil)
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-100 hover:text-tinta'
  return (
    <div ref={caja} className="relative">
      <button onClick={() => setAbierto(a => !a)} aria-expanded={abierto} aria-haspopup="menu" title={mini ? perfil?.nombre : undefined}
        className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-stone-100 ${mini ? 'justify-center' : ''} ${abierto ? 'bg-stone-100' : ''}`}>
        <Avatar foto={foto} iniciales={iniciales} />
        {!mini && <>
          <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-sm">{perfil?.nombre}</p><p className="truncate text-[11px] text-marca">{perfil?.es_super ? 'Administrador principal' : perfil && ROLES[perfil.rol]}</p></div>
          <ChevronUp size={15} className={`shrink-0 text-stone-400 transition ${abierto ? '' : 'rotate-180'}`} />
        </>}
      </button>
      {abierto && (
        <div role="menu" className={`absolute bottom-full z-50 mb-2 w-64 rounded-2xl border border-stone-300 bg-panel p-1.5 shadow-2xl ${mini ? 'left-0' : 'inset-x-0 w-auto'}`}>
          <div className="mb-1 flex items-center gap-3 border-b border-stone-200 px-3 pb-3 pt-2">
            <Avatar foto={foto} iniciales={iniciales} grande />
            <div className="min-w-0 leading-tight"><p className="truncate text-sm font-medium">{perfil?.nombre}</p><p className="truncate font-mono text-[10px] text-stone-500">{perfil?.usuario || perfil?.email}</p></div>
          </div>
          <Link role="menuitem" to="/perfil" className={item}><UserRound size={15} />Ver mi perfil</Link>
          <button role="menuitem" onClick={cambiarTema} className={item}>{tema === 'claro' ? <Moon size={15} /> : <Sun size={15} />}{tema === 'claro' ? 'Modo oscuro' : 'Modo claro'}</button>
          <Link role="menuitem" to="/cambiar-contrasena" className={item}><KeyRound size={15} />Cambiar contraseña</Link>
          <Link role="menuitem" to="/bitacoras" className={item}><BookOpenText size={15} />Bitácoras</Link>
          {esSuper && <Link role="menuitem" to="/admin" className={`${item} !text-marca`}><ShieldAlert size={15} />Administración</Link>}
          <div className="my-1 h-px bg-stone-200" />
          <button role="menuitem" onClick={salir} className={`${item} hover:!bg-red-50 hover:!text-red-700`}><LogOut size={15} />Cerrar sesión</button>
        </div>
      )}
    </div>
  )
}

export function Avatar({ foto, iniciales, grande }: { foto: string | null; iniciales: string; grande?: boolean }) {
  const t = grande ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'
  return (
    <span className={`relative grid aspect-square shrink-0 place-items-center rounded-full bg-gradient-to-br from-marca to-[#9C6B24] font-bold text-[#120D04] ${t}`}>
      {foto ? <img src={foto} alt="" className="absolute inset-0 h-full w-full rounded-full object-cover" /> : iniciales}
      {!grande && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-barra bg-emerald-400" />}
    </span>
  )
}

/** Si este teléfono tiene un viaje en curso, sigue rastreándolo en cualquier pantalla y lo recuerda con una franja. */
function ViajeActivo() {
  const [e, setE] = useState(rastreador.estado)
  useEffect(() => rastreador.escuchar(setE), [])
  useEffect(() => { if (rastreador.estado.viajeId) rastreador.iniciar(rastreador.estado.viajeId, rastreador.estado.km, rastreador.estado.puntos) }, [])
  if (!e.viajeId) return null
  return (
    <Link to="/viajes" className="no-print mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-300/50 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
      <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Viaje en curso · {e.km.toLocaleString('es-MX', { maximumFractionDigits: 1 })} km por GPS</span>
      <span className="text-xs font-medium">Ver o terminar</span>
    </Link>
  )
}
