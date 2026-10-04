import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, Boxes, ClipboardSignature, MapPin, Users, Tags, Building2, Truck, UserCog, ScanLine, LogOut,
  X, Factory, Briefcase, Search, PanelLeftClose, PanelLeftOpen, Menu, KeyRound, PackageSearch, PackagePlus, CalendarClock, Siren, ClipboardCheck, FileClock, ShieldCheck, Repeat, Package, Wrench, Warehouse, Inbox, Map as MapaIcono, Landmark, Sparkles, Download,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { ROLES, supabase } from '../lib/supabase'
import { LogoFirme, MonogramaFirme } from './Logo'
import Comandos, { type Destino } from './Comandos'
import { avisosAlmacen } from '../lib/almacen'
import { escuchar, pendientes, sincronizar, estaMandando } from '../lib/sinSenal'

type Entrada = { to: string; icono: typeof Boxes; texto: string; fin?: boolean; alerta?: 'prestamos' | 'reportes' | 'vigencias' | 'mantenimiento' | 'solicitudes' | 'almacen' }
const grupos: { titulo: string; items: Entrada[] }[] = [
  { titulo: 'Operación', items: [
    { to: '/', icono: LayoutDashboard, texto: 'Tablero', fin: true },
    { to: '/preguntar', icono: Sparkles, texto: 'Pregúntale' },
    { to: '/empresas', icono: Building2, texto: 'Empresas' },
    { to: '/activos', icono: Boxes, texto: 'Activos' },
    { to: '/catalogo', icono: PackageSearch, texto: 'Catálogo' },
    { to: '/resguardos', icono: ClipboardSignature, texto: 'Resguardos' },
    { to: '/solicitudes', icono: Inbox, texto: 'Solicitudes', alerta: 'solicitudes' },
    { to: '/almacen', icono: Warehouse, texto: 'Almacén', alerta: 'almacen' },
    { to: '/mapa', icono: MapaIcono, texto: 'Mapa de obras' },
    { to: '/escanear', icono: ScanLine, texto: 'Escanear QR' },
  ] },
  { titulo: 'Control', items: [
    { to: '/mantenimiento', icono: Wrench, texto: 'Mantenimiento', alerta: 'mantenimiento' },
    { to: '/vigencias', icono: FileClock, texto: 'Vigencias', alerta: 'vigencias' },
    { to: '/prestamos', icono: CalendarClock, texto: 'Préstamos', alerta: 'prestamos' },
    { to: '/reportes', icono: Siren, texto: 'Reportes de falla', alerta: 'reportes' },
    { to: '/inventarios', icono: ClipboardCheck, texto: 'Inventario físico' },
    { to: '/confirmaciones', icono: ShieldCheck, texto: 'Confirmaciones' },
    { to: '/traspasos', icono: Repeat, texto: 'Traspasos entre empresas' },
  ] },
  { titulo: 'Organización', items: [
    { to: '/empleados', icono: Users, texto: 'Empleados' },
    { to: '/inmuebles', icono: Landmark, texto: 'Inmuebles' },
    { to: '/ubicaciones', icono: MapPin, texto: 'Ubicaciones' },
    { to: '/departamentos', icono: Briefcase, texto: 'Departamentos' },
    { to: '/sucursales', icono: Factory, texto: 'Sucursales' },
  ] },
  { titulo: 'Catálogos', items: [
    { to: '/kits', icono: Package, texto: 'Kits por puesto' },
    { to: '/categorias', icono: Tags, texto: 'Categorías' },
    { to: '/marcas', icono: Tags, texto: 'Marcas' },
    { to: '/proveedores', icono: Truck, texto: 'Proveedores' },
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
  const { perfil, esAdmin, salir } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [compacto, setCompacto] = useState(() => leer('gfm.menu') === 'compacto')
  const [buscar, setBuscar] = useState(false)
  const loc = useLocation()
  useReflejo()
  const [alertas, setAlertas] = useState({ prestamos: 0, reportes: 0, vigencias: 0, mantenimiento: 0, solicitudes: 0, almacen: 0 })
  useEffect(() => {
    const hoy = new Date(); const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    Promise.all([
      supabase.from('v_prestamos').select('activo_id').lt('fecha_devolucion', iso),
      supabase.from('reportes').select('id').eq('estatus', 'abierto'),
      supabase.from('v_vigencias').select('id').lt('fecha_vencimiento', iso),
      supabase.from('v_mantenimiento').select('plan_id').eq('estado', 'vencido'),
      avisosAlmacen(),
    ]).then(([p, r, v, m, a]) => setAlertas({ prestamos: p.data?.length ?? 0, reportes: r.data?.length ?? 0, vigencias: v.data?.length ?? 0, mantenimiento: m.data?.length ?? 0, solicitudes: a.pendientes, almacen: a.bajo }))
  }, [loc.pathname])

  const todos = useMemo(() => [...grupos, ...(esAdmin ? [{ titulo: 'Administración', items: [{ to: '/usuarios', icono: UserCog, texto: 'Usuarios' }] }] : [])], [esAdmin])
  const destinos = useMemo<Destino[]>(() => [
    ...todos.flatMap(g => g.items.map(i => ({ to: i.to, texto: i.texto, icono: i.icono, grupo: g.titulo }))),
    { to: '/alta', texto: 'Alta de activos', icono: PackagePlus, grupo: 'Acción' },
    { to: '/resguardos/nuevo', texto: 'Nuevo resguardo', icono: ClipboardSignature, grupo: 'Acción' },
    { to: '/etiquetas', texto: 'Imprimir etiquetas QR', icono: Tags, grupo: 'Acción' },
    { to: '/inventarios', texto: 'Nuevo conteo de inventario', icono: ClipboardCheck, grupo: 'Acción' },
    { to: '/solicitudes', texto: 'Pedir equipo o material', icono: Inbox, grupo: 'Acción' },
  ], [todos])
  const actual = destinos.find(d => d.to !== '/' && loc.pathname.startsWith(d.to)) ?? destinos[0]

  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscar(b => !b) } }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [])
  useEffect(() => { setAbierto(false) }, [loc.pathname])

  const alternar = () => setCompacto(c => { guardar('gfm.menu', c ? 'amplio' : 'compacto'); return !c })
  const iniciales = (perfil?.nombre ?? '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

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
                  {isActive && <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-marca shadow-[0_0_14px_2px_rgb(249_178_52/.7)]" />}
                  <i.icono size={18} className={`shrink-0 transition ${isActive ? 'text-marca drop-shadow-[0_0_6px_rgb(249_178_52/.8)]' : 'group-hover:text-marca'}`} />
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
      <div className={`flex items-center gap-3 rounded-xl p-2 ${mini ? 'justify-center' : ''}`}>
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-marca to-[#B87708] text-xs font-bold text-[#120D04]">
          {iniciales}<span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0B0D11] bg-emerald-400 animate-pulso" />
        </span>
        {!mini && <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-sm">{perfil?.nombre}</p><p className="text-[11px] text-marca/90">{perfil && ROLES[perfil.rol]}</p></div>}
      </div>
      <div className={`mt-1 flex ${mini ? 'flex-col items-center' : ''} gap-1`}>
        <Link to="/cambiar-contrasena" title="Cambiar contraseña" className="flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs text-stone-500 hover:bg-stone-100 hover:text-tinta"><KeyRound size={15} />{!mini && 'Contraseña'}</Link>
        <button onClick={salir} title="Cerrar sesión" className="flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs text-stone-500 hover:bg-red-50 hover:text-red-700"><LogOut size={15} />{!mini && 'Salir'}</button>
      </div>
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
      <aside className={`no-print relative hidden shrink-0 flex-col border-r border-stone-200 bg-[#0A0C10]/80 backdrop-blur-xl transition-[width] duration-300 lg:flex ${compacto ? 'w-[76px]' : 'w-64'}`}>
        <div className={`flex h-20 items-center ${compacto ? 'justify-center' : 'px-6'}`}>
          {compacto ? <MonogramaFirme className="h-8 w-auto text-[#fff]" /> : <LogoFirme className="h-9 w-auto text-[#fff]" />}
        </div>
        {!compacto && <p className="-mt-3 mb-3 px-6 text-[10px] font-medium uppercase tracking-[.22em] text-marca">Control de activos</p>}
        {nav(compacto)}
        {pie(compacto)}
        <button onClick={alternar} aria-label={compacto ? 'Expandir menú' : 'Compactar menú'}
          className="absolute -right-3 top-24 grid h-6 w-6 place-items-center rounded-full border border-stone-300 bg-[#12151B] text-stone-500 transition hover:border-marca hover:text-marca">
          {compacto ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
        </button>
      </aside>

      {/* Menú deslizable en móvil */}
      <div className={`no-print fixed inset-0 z-50 lg:hidden ${abierto ? '' : 'pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ${abierto ? 'opacity-100' : 'opacity-0'}`} onClick={() => setAbierto(false)} />
        <aside className={`relative flex h-full w-72 flex-col border-r border-stone-200 bg-[#0A0C10] transition-transform duration-300 ${abierto ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex h-20 items-center justify-between px-6">
            <LogoFirme className="h-8 w-auto text-[#fff]" />
            <button className="text-stone-500" onClick={() => setAbierto(false)} aria-label="Cerrar menú"><X size={20} /></button>
          </div>
          {nav(false)}{pie(false)}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-stone-200 bg-[#06070A]/70 px-4 backdrop-blur-xl sm:px-6">
          <button className="lg:hidden" onClick={() => setAbierto(true)} aria-label="Abrir menú"><Menu size={22} /></button>
          <MonogramaFirme className="h-6 w-auto text-[#fff] lg:hidden" />
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
          <div key={loc.pathname} className="mx-auto max-w-7xl animate-entrar p-4 sm:p-6 lg:p-8"><Outlet /></div>
        </main>

        {/* Barra inferior en móvil con botón central de escaneo */}
        <nav className="no-print fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 items-end rounded-2xl border border-stone-300 bg-[#0D0F14]/90 px-2 pb-[calc(.5rem+env(safe-area-inset-bottom,0px))] pt-2 backdrop-blur-xl lg:hidden">
          {movil.map(m => (
            <NavLink key={m.to} to={m.to} end={m.fin} className={({ isActive }) => `flex flex-col items-center gap-1 text-[10px] ${isActive ? 'text-marca' : 'text-stone-500'}`}>
              {m.centro
                ? <span className="-mt-7 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-[#FFC95A] to-[#E9A11E] text-[#120D04] shadow-[0_8px_30px_-6px_rgb(249_178_52/.8)] ring-4 ring-[#06070A]"><m.icono size={24} /></span>
                : <m.icono size={20} />}
              {m.texto}
            </NavLink>
          ))}
          <button onClick={() => setBuscar(true)} className="flex flex-col items-center gap-1 text-[10px] text-stone-500"><Search size={20} />Buscar</button>
        </nav>
      </div>

      <Comandos abierto={buscar} onCerrar={() => setBuscar(false)} destinos={destinos} />
    </div>
  )
}
