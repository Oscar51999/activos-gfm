import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Zap, History, Bell, Settings2, Check, PackagePlus, ScanLine, ClipboardSignature, Boxes, Users, Wrench, BookOpenText, Map as MapaIcono, Tags, CalendarCheck, Landmark, FileClock, Siren,
  Sparkles, Inbox, Warehouse, Truck, Receipt, Car, KeyRound, Archive, BarChart3, ShieldCheck, UserRound, CalendarClock as Agenda, Nfc, type LucideIcon,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { recientes } from '../lib/recientes'
import { Modal } from './ui'

type Acceso = { to: string; texto: string; icono: LucideIcon; editar?: boolean; resguardar?: boolean }
const ACCESOS: Acceso[] = [
  { to: '/alta', texto: 'Alta de activos', icono: PackagePlus, editar: true },
  { to: '/alta/inteligente', texto: 'Alta con factura', icono: Sparkles, editar: true },
  { to: '/escanear', texto: 'Escanear QR', icono: ScanLine },
  { to: '/etiquetas-nfc', texto: 'Ligar stickers NFC', icono: Nfc, editar: true },
  { to: '/resguardos/nuevo', texto: 'Nuevo resguardo', icono: ClipboardSignature, resguardar: true },
  { to: '/activos', texto: 'Activos', icono: Boxes },
  { to: '/empleados', texto: 'Empleados', icono: Users },
  { to: '/mantenimiento', texto: 'Mantenimiento', icono: Wrench },
  { to: '/bitacoras', texto: 'Bitácoras', icono: BookOpenText },
  { to: '/mapa', texto: 'Mapa de obras', icono: MapaIcono },
  { to: '/marcas', texto: 'Marcas y modelos', icono: Tags },
  { to: '/actividades', texto: 'Actividades', icono: CalendarCheck, editar: true },
  { to: '/inmuebles', texto: 'Inmuebles', icono: Landmark },
  { to: '/vigencias', texto: 'Vigencias', icono: FileClock },
  { to: '/reportes', texto: 'Reportes de falla', icono: Siren },
  { to: '/solicitudes', texto: 'Solicitudes', icono: Inbox },
  { to: '/almacen', texto: 'Almacén', icono: Warehouse },
  { to: '/vales', texto: 'Vales de salida', icono: Truck },
  { to: '/mis-equipos', texto: 'Mis equipos', icono: UserRound },
  { to: '/reservas', texto: 'Reservar equipo', icono: Agenda },
  { to: '/checklist-vehicular', texto: 'Checklist vehicular', icono: Car },
  { to: '/licencias', texto: 'Licencias y cuentas', icono: KeyRound },
  { to: '/bajas', texto: 'Bajas de activos', icono: Archive },
  { to: '/indicadores', texto: 'Indicadores', icono: BarChart3, editar: true },
]
const DEFECTO = ['/alta', '/escanear', '/resguardos/nuevo', '/activos', '/mantenimiento', '/actividades']

type Novedad = { t: string; texto: string; sub: string; to: string; icono: LucideIcon; color: string }
const hace = (f: string) => {
  const m = Math.round((Date.now() - new Date(f).getTime()) / 60000)
  if (m < 0) { const d = Math.ceil(-m / 1440); return d <= 1 ? 'mañana' : `en ${d} días` }
  if (m < 60) return `hace ${Math.max(1, m)} min`; if (m < 1440) return `hace ${Math.round(m / 60)} h`; return `hace ${Math.round(m / 1440)} días`
}

/** Arriba del tablero: mis accesos directos, lo último que abrí y novedades del sistema. */
export default function InicioRapido({ ver = { accesos: true, recientes: true, novedades: true } }: { ver?: { accesos: boolean; recientes: boolean; novedades: boolean } }) {
  const { perfil, puedeEditar, puedeResguardar, recargarPerfil } = useAuth()
  const [editando, setEditando] = useState(false)
  const [novedades, setNovedades] = useState<Novedad[] | null>(null)
  const permitidos = ACCESOS.filter(a => (!a.editar || puedeEditar) && (!a.resguardar || puedeResguardar))
  const elegidos = ((perfil?.preferencias as { accesos?: string[] } | null)?.accesos ?? DEFECTO).map(to => permitidos.find(a => a.to === to)).filter(Boolean) as Acceso[]
  const rec = recientes().slice(0, 6)

  useEffect(() => {
    const en7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
    Promise.all([
      supabase.from('activos').select('id,codigo,descripcion,created_at').order('created_at', { ascending: false }).limit(4),
      supabase.from('movimientos').select('id,folio,tipo,fecha,recibe_nombre').eq('cancelado', false).order('fecha', { ascending: false }).limit(4),
      supabase.from('reportes').select('id,folio,descripcion,created_at').order('created_at', { ascending: false }).limit(3),
      puedeEditar && perfil ? supabase.from('actividades').select('id,titulo,fecha_fin,estatus').eq('responsable_id', perfil.id).neq('estatus', 'listo').not('fecha_fin', 'is', null).lte('fecha_fin', en7).order('fecha_fin').limit(4) : Promise.resolve({ data: [] }),
      supabase.from('inmueble_pagos').select('id,concepto,fecha_limite,inmueble_id,inmuebles(nombre)').eq('pagado', false).lte('fecha_limite', en7).order('fecha_limite').limit(4),
      supabase.from('v_licencias').select('id,nombre,fecha_vencimiento').eq('activo', true).not('fecha_vencimiento', 'is', null).lte('dias_restantes', 30).order('fecha_vencimiento').limit(4),
      supabase.from('activos').select('id,codigo,descripcion,garantia_hasta').gte('garantia_hasta', new Date().toISOString().slice(0, 10)).lte('garantia_hasta', new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)).order('garantia_hasta').limit(3),
      puedeEditar ? supabase.from('bajas_activos').select('id,folio,created_at,activos(descripcion)').eq('estatus', 'pendiente').order('created_at', { ascending: false }).limit(3) : Promise.resolve({ data: [] }),
    ]).then(([a, m, r, act, pg, lic, gar, bj]) => {
      const n: Novedad[] = [
        ...((a.data ?? []) as { id: string; codigo: string; descripcion: string; created_at: string }[]).map(x => ({ t: x.created_at, texto: `Alta: ${x.descripcion}`, sub: x.codigo, to: `/activos/${x.id}`, icono: PackagePlus, color: 'text-emerald-700 bg-emerald-50' })),
        ...((m.data ?? []) as { id: string; folio: string; tipo: string; fecha: string; recibe_nombre: string | null }[]).map(x => ({ t: x.fecha, texto: `${x.tipo === 'asignacion' ? 'Asignación' : x.tipo === 'devolucion' ? 'Devolución' : 'Traspaso'}${x.recibe_nombre ? ` a ${x.recibe_nombre}` : ''}`, sub: x.folio, to: `/resguardos/${x.id}`, icono: ClipboardSignature, color: 'text-sky-700 bg-sky-50' })),
        ...((r.data ?? []) as { id: string; folio: string; descripcion: string; created_at: string }[]).map(x => ({ t: x.created_at, texto: `Falla: ${x.descripcion}`, sub: x.folio, to: '/reportes', icono: Siren, color: 'text-red-700 bg-red-50' })),
        ...((act.data ?? []) as { id: string; titulo: string; fecha_fin: string }[]).map(x => ({ t: x.fecha_fin + 'T09:00', texto: `Tu actividad: ${x.titulo}`, sub: `entrega ${new Date(x.fecha_fin + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`, to: '/actividades', icono: CalendarCheck, color: 'text-violet-700 bg-violet-50' })),
        ...((pg.data ?? []) as unknown as { id: string; concepto: string; fecha_limite: string; inmueble_id: string; inmuebles: { nombre: string } | null }[]).map(x => ({ t: x.fecha_limite + 'T09:00', texto: `Pagar ${x.concepto}`, sub: `${x.inmuebles?.nombre ?? ''} · vence ${new Date(x.fecha_limite + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`, to: `/inmuebles/${x.inmueble_id}`, icono: Receipt, color: 'text-amber-800 bg-amber-50' })),
        ...((lic.data ?? []) as { id: string; nombre: string; fecha_vencimiento: string }[]).map(x => ({ t: x.fecha_vencimiento + 'T09:00', texto: `Renovar ${x.nombre}`, sub: `licencia · vence ${new Date(x.fecha_vencimiento + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`, to: `/licencias?id=${x.id}`, icono: KeyRound, color: 'text-amber-800 bg-amber-50' })),
        ...((gar.data ?? []) as { id: string; codigo: string; descripcion: string; garantia_hasta: string }[]).map(x => ({ t: x.garantia_hasta + 'T09:00', texto: `Garantía por vencer: ${x.descripcion}`, sub: `${x.codigo} · vence ${new Date(x.garantia_hasta + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`, to: `/activos/${x.id}`, icono: ShieldCheck, color: 'text-sky-700 bg-sky-50' })),
        ...((bj.data ?? []) as unknown as { id: string; folio: string; created_at: string; activos: { descripcion: string } | null }[]).map(x => ({ t: x.created_at, texto: `Autorizar baja: ${x.activos?.descripcion ?? ''}`, sub: x.folio, to: '/bajas', icono: Archive, color: 'text-red-700 bg-red-50' })),
      ]
      // primero lo que viene (actividades y pagos por vencer), luego lo más reciente
      const futuro = n.filter(x => new Date(x.t).getTime() > Date.now() - 864e5 && (x.icono === CalendarCheck || x.icono === Receipt || x.icono === KeyRound || x.icono === Archive || x.icono === ShieldCheck))
      const pasado = n.filter(x => !futuro.includes(x)).sort((a, b) => b.t.localeCompare(a.t))
      setNovedades([...futuro, ...pasado].slice(0, 8))
    })
  }, [puedeEditar, perfil])

  async function guardarAccesos(lista: string[]) {
    if (!perfil) return
    await supabase.from('perfiles').update({ preferencias: { ...(perfil.preferencias ?? {}), accesos: lista } }).eq('id', perfil.id)
    await recargarPerfil(); setEditando(false)
  }

  return (
    <div className={`grid items-start gap-4 [&>*]:min-w-0 ${[ver.accesos, ver.recientes, ver.novedades].filter(Boolean).length === 3 ? 'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)]' : [ver.accesos, ver.recientes, ver.novedades].filter(Boolean).length === 2 ? 'lg:grid-cols-2' : ''}`}>
      {ver.accesos && <section className="tarjeta p-4">
        <h2 className="mb-3 flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><Zap size={15} className="text-marca" />Accesos directos</span>
          <button onClick={() => setEditando(true)} className="text-stone-400 hover:text-marca" aria-label="Elegir accesos directos" title="Elegir accesos"><Settings2 size={15} /></button></h2>
        <div className="grid grid-cols-3 gap-2">
          {elegidos.map(a => (
            <Link key={a.to} to={a.to} className="group flex flex-col items-center gap-1.5 rounded-xl border border-stone-200 px-2 py-3 text-center text-[11px] leading-tight transition hover:border-marca/50 hover:bg-marca/5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-marca/10 text-marca transition group-hover:scale-105"><a.icono size={18} /></span>{a.texto}
            </Link>
          ))}
        </div>
      </section>}
      {ver.recientes && <section className="tarjeta p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History size={15} className="text-marca" />Accesos recientes</h2>
        {rec.length === 0 ? <p className="text-xs text-stone-500">Aquí aparece lo último que abras.</p> : (
          <ul className="space-y-1">
            {rec.map(r => <li key={r.to}><Link to={r.to} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-100"><span className="min-w-0 flex-1 truncate">{r.texto}</span><span className="shrink-0 text-[10px] uppercase tracking-wider text-stone-400">{r.tipo}</span></Link></li>)}
          </ul>
        )}
      </section>}
      {ver.novedades && <section className="tarjeta p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Bell size={15} className="text-marca" />Novedades</h2>
        {!novedades ? <p className="text-xs text-stone-500">Cargando…</p> : novedades.length === 0 ? <p className="text-xs text-stone-500">Sin novedades por ahora.</p> : (
          <ul className="space-y-1">
            {novedades.map((x, i) => (
              <li key={i}><Link to={x.to} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-stone-100">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${x.color}`}><x.icono size={14} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm">{x.texto}</span><span className="block truncate text-[11px] text-stone-500">{x.sub} · {hace(x.t)}</span></span>
              </Link></li>
            ))}
          </ul>
        )}
      </section>}
      {editando && <ElegirAccesos permitidos={permitidos} actuales={elegidos.map(a => a.to)} onCerrar={() => setEditando(false)} onGuardar={guardarAccesos} />}
    </div>
  )
}

function ElegirAccesos({ permitidos, actuales, onCerrar, onGuardar }: { permitidos: Acceso[]; actuales: string[]; onCerrar: () => void; onGuardar: (l: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(actuales)
  const cambiar = (to: string) => setSel(s => s.includes(to) ? s.filter(x => x !== to) : s.length >= 9 ? s : [...s, to])
  return (
    <Modal abierto titulo="Mis accesos directos" onCerrar={onCerrar} ancho="max-w-lg">
      <p className="mb-3 text-sm text-stone-500">Elige hasta 9. Se guardan en tu perfil.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {permitidos.map(a => {
          const on = sel.includes(a.to)
          return <button key={a.to} onClick={() => cambiar(a.to)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${on ? 'border-marca bg-marca/10' : 'border-stone-200 hover:border-stone-300'}`}><a.icono size={15} className="shrink-0 text-marca" /><span className="min-w-0 flex-1 truncate">{a.texto}</span>{on && <Check size={14} className="text-marca" />}</button>
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={() => onGuardar(sel)}><Check size={15} />Guardar</button></div>
    </Modal>
  )
}
