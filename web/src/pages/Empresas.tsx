import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Boxes, Users, ClipboardSignature, PackagePlus, Pencil, Plus, ImagePlus, MapPin, Building2, ArrowUpRight, PenLine, Search } from 'lucide-react'
import { supabase, mensajeError, ESTATUS, TIPOS_UBICACION, type Estatus, type TipoMov } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { procesarLogo, type EmpresaLogo } from '../lib/logos'
import { Cargando, Modal, Campo, Aviso, EstatusBadge, Vacio } from '../components/ui'
import LogoEmpresa from '../components/LogoEmpresa'
import MapaMexico from '../components/MapaMexico'
import BuscadorEmpresa from '../components/BuscadorEmpresa'
import FotoActivo from '../components/FotoActivo'
import { ListaEmpleados, Avatar } from '../components/Empleados'
import { TipoBadge } from './Movimientos'

export type Empresa = EmpresaLogo & { id: string; razon_social: string | null; rfc: string | null; activo: boolean }
type Act = { id: string; codigo: string; descripcion: string; serie: string | null; estatus: Estatus; empresa_id: string; categoria: string; marca: string | null; modelo: string | null
  ubicacion: string | null; ubicacion_id: string | null; responsable: string | null; responsable_id: string | null; valor_referencia: number | null; foto_principal: string | null; modelo_foto: string | null }

const COLOR: Record<Estatus, string> = { disponible: '#34D399', asignado: '#38BDF8', mantenimiento: '#F9B234', siniestrado: '#FF5A5F', baja: '#6B7280' }

function BarraEstatus({ acts }: { acts: { estatus: Estatus }[] }) {
  const vivos = acts.filter(a => a.estatus !== 'baja'), total = vivos.length || 1
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-stone-100">
      {(['asignado', 'disponible', 'mantenimiento', 'siniestrado'] as Estatus[]).map(k => {
        const n = vivos.filter(a => a.estatus === k).length
        return n ? <span key={k} style={{ width: `${(n / total) * 100}%`, background: COLOR[k], animation: 'crecer .9s cubic-bezier(.2,.8,.2,1) both' }} className="origin-left" title={`${ESTATUS[k].texto}: ${n}`} /> : null
      })}
    </div>
  )
}

/** Pestaña Empresas: una tarjeta por empresa con su logo y lo esencial; desde aquí se entra a todo. */
export default function Empresas() {
  const { esAdmin, puedeResguardar } = useAuth()
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null)
  const [acts, setActs] = useState<Act[]>([])
  const [emps, setEmps] = useState<{ id: string; empresa_id: string }[]>([])
  const [pend, setPend] = useState<{ empresa_id: string }[]>([])
  const [modal, setModal] = useState(false)

  const cargar = () => {
    supabase.from('empresas').select('*').eq('activo', true).order('nombre').then(({ data }) => setEmpresas((data as Empresa[]) ?? []))
    supabase.from('v_activos').select('id,empresa_id,estatus,responsable_id,valor_referencia').limit(20000).then(({ data }) => setActs((data as Act[]) ?? []))
    supabase.from('empleados').select('id,empresa_id').eq('activo', true).limit(20000).then(({ data }) => setEmps((data as { id: string; empresa_id: string }[]) ?? []))
    supabase.from('v_movimientos').select('empresa_id').eq('firmado', false).eq('cancelado', false).then(({ data }) => setPend((data as { empresa_id: string }[]) ?? []))
  }
  useEffect(cargar, [])

  const datos = useMemo(() => (empresas ?? []).map(e => {
    const a = acts.filter(x => x.empresa_id === e.id && x.estatus !== 'baja')
    return { e, a, activos: a.length, asignados: a.filter(x => x.estatus === 'asignado').length, empleados: emps.filter(x => x.empresa_id === e.id).length,
      sinFirma: pend.filter(x => x.empresa_id === e.id).length, valor: a.reduce((s, x) => s + (x.valor_referencia ?? 0), 0) }
  }).sort((x, y) => y.activos - x.activos), [empresas, acts, emps, pend])

  if (!empresas) return <Cargando />
  const vis = datos
  const tot = { activos: datos.reduce((s, d) => s + d.activos, 0), empleados: emps.length, asignados: datos.reduce((s, d) => s + d.asignados, 0) }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-marca/30 bg-marca/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[.16em] text-marca"><Building2 size={12} />Empresas del grupo</p>
          <h1 className="text-3xl font-semibold sm:text-4xl">Empresas</h1>
          <p className="mt-1 text-sm text-stone-500">{empresas.length} empresas · {tot.activos} activos · {tot.empleados} empleados · {tot.asignados} activos asignados</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {esAdmin && <button className="btn-sec" onClick={() => setModal(true)}><Plus size={16} />Nueva empresa</button>}
        </div>
      </div>

      <div className="mb-6"><BuscadorEmpresa /></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {vis.map(({ e, a, activos, asignados, empleados, sinFirma }, i) => (
          <div key={e.id} className="tarjeta viva group flex min-w-0 animate-entrar flex-col overflow-hidden" style={{ animationDelay: `${i * 60}ms` }}>
            <Link to={`/empresas/${e.id}`} className="relative grid h-36 place-items-center overflow-hidden border-b border-stone-200 px-8">
              <span aria-hidden className="pointer-events-none absolute inset-0 opacity-60 transition duration-500 group-hover:opacity-100" style={{ background: `radial-gradient(18rem 9rem at 50% 110%, ${e.color || '#F9B234'}33, transparent 70%)` }} />
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${e.color || '#F9B234'}, transparent)` }} />
              <LogoEmpresa empresa={e} alto={52} ancho={240} className="relative transition duration-500 group-hover:scale-105" />
            </Link>
            <div className="flex flex-1 flex-col p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate font-semibold">{e.nombre}</p><p className="truncate text-xs text-stone-500">{e.razon_social || e.rfc || 'Razón social pendiente'}</p></div>
                <Link to={`/empresas/${e.id}`} className="text-stone-400 transition group-hover:text-marca" aria-label="Abrir"><ArrowUpRight size={18} /></Link>
              </div>
              <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                {([['Activos', activos, Boxes], ['Empleados', empleados, Users], ['Asignados', asignados, ClipboardSignature]] as const).map(([tt, n, I]) => (
                  <div key={tt} className="rounded-xl border border-stone-200 bg-stone-50 py-2.5">
                    <I size={14} className="mx-auto mb-1 text-marca" /><p className="cifra text-xl font-semibold">{n}</p><p className="text-[10px] uppercase tracking-wider text-stone-500">{tt}</p>
                  </div>
                ))}
              </div>
              <BarraEstatus acts={a} />
              {sinFirma > 0 && <Link to="/resguardos" className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-700"><PenLine size={12} />{sinFirma} resguardo(s) sin firma</Link>}
              <div className="mt-auto flex gap-2 pt-4">
                <Link to={`/empresas/${e.id}?tab=empleados`} className="btn-sec flex-1 !px-2 !py-2 text-xs"><Users size={14} />Empleados</Link>
                {puedeResguardar && <Link to={`/resguardos/nuevo?tipo=asignacion&empresa=${e.id}`} className="btn-sec flex-1 !px-2 !py-2 text-xs"><ClipboardSignature size={14} />Asignar</Link>}
                <Link to={`/empresas/${e.id}`} className="btn-primario flex-1 !px-2 !py-2 text-xs">Abrir</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8"><MapaMexico /></div>
      <EmpresaModal abierto={modal} onCerrar={() => setModal(false)} onGuardado={() => { setModal(false); cargar() }} />
    </div>
  )
}

/** Alta o edición de empresa, con su logo (se limpia el fondo y se genera la versión para fondo oscuro). */
export function EmpresaModal({ abierto, onCerrar, onGuardado, empresa }: { abierto: boolean; onCerrar: () => void; onGuardado: () => void; empresa?: Empresa | null }) {
  const [f, setF] = useState({ nombre: '', nombre_corto: '', razon_social: '', rfc: '', color: '#F9B234' })
  const [logo, setLogo] = useState<{ claro: string; oscuro: string } | null>(null)
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!abierto) return
    setError(''); setLogo(null)
    setF({ nombre: empresa?.nombre ?? '', nombre_corto: empresa?.nombre_corto ?? '', razon_social: empresa?.razon_social ?? '', rfc: empresa?.rfc ?? '', color: empresa?.color ?? '#F9B234' })
  }, [abierto, empresa])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(x => ({ ...x, [k]: e.target.value }))
  async function tomar(file?: File | null) {
    if (!file) return
    setProcesando(true)
    try { setLogo(await procesarLogo(file)) } catch { setError('No se pudo leer el logo.') } finally { setProcesando(false) }
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setGuardando(true); setError('')
    const datos: Record<string, unknown> = { nombre: f.nombre.trim(), nombre_corto: f.nombre_corto.trim() || null, razon_social: f.razon_social.trim() || null, rfc: f.rfc.trim().toUpperCase() || null, color: f.color }
    if (logo) { datos.logo_path = logo.claro; datos.logo_oscuro = logo.oscuro }
    const { error } = empresa ? await supabase.from('empresas').update(datos).eq('id', empresa.id) : await supabase.from('empresas').insert(datos)
    setGuardando(false)
    if (error) setError(mensajeError(error)); else onGuardado()
  }
  const vista: EmpresaLogo = { nombre: f.nombre || 'Empresa', nombre_corto: f.nombre_corto, color: f.color, logo_path: logo?.claro ?? empresa?.logo_path, logo_oscuro: logo?.oscuro ?? empresa?.logo_oscuro }
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={empresa ? 'Editar empresa' : 'Nueva empresa'} ancho="max-w-3xl">
      <form onSubmit={guardar} className="grid gap-6 sm:grid-cols-[16rem_1fr]">
        <div className="space-y-3">
          <span className="etiqueta">Logo</span>
          <button type="button" onClick={() => input.current?.click()} className="group relative grid h-32 w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-stone-300 px-4 transition hover:border-marca">
            <LogoEmpresa empresa={vista} alto={44} ancho={200} />
            <span className="absolute inset-0 grid place-items-center bg-black/70 text-xs text-stone-700 opacity-0 transition group-hover:opacity-100">{procesando ? 'Procesando…' : <span className="flex flex-col items-center gap-1"><ImagePlus size={22} className="text-marca" />Subir logo</span>}</span>
          </button>
          <div className="papel grid h-20 place-items-center rounded-2xl px-4"><LogoEmpresa empresa={vista} alto={34} ancho={200} variante="claro" /></div>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={e => tomar(e.target.files?.[0])} />
          <p className="text-[11px] text-stone-400">PNG o JPG. Quitamos el fondo blanco y generamos la versión para pantalla oscura (arriba) y para documentos (abajo).</p>
        </div>
        <div className="space-y-4">
          <Campo label="Nombre *"><input className="campo" required value={f.nombre} onChange={set('nombre')} /></Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nombre corto"><input className="campo" value={f.nombre_corto} onChange={set('nombre_corto')} placeholder="Ej. Vanguardia" /></Campo>
            <Campo label="RFC"><input className="campo uppercase" value={f.rfc} onChange={set('rfc')} /></Campo>
          </div>
          <Campo label="Razón social"><input className="campo" value={f.razon_social} onChange={set('razon_social')} placeholder="Para la carta responsiva" /></Campo>
          <Campo label="Color de acento"><div className="flex items-center gap-3"><input type="color" value={f.color} onChange={set('color')} className="h-10 w-14 cursor-pointer rounded-lg border border-stone-300 bg-transparent" /><span className="font-mono text-xs text-stone-500">{f.color}</span></div></Campo>
          {error && <Aviso>{error}</Aviso>}
          <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando || procesando}>{guardando ? 'Guardando…' : 'Guardar'}</button></div>
        </div>
      </form>
    </Modal>
  )
}

const TABS = [['resumen', 'Resumen'], ['empleados', 'Empleados'], ['activos', 'Activos'], ['ubicaciones', 'Ubicaciones']] as const
type Mov = { id: string; folio: string; tipo: TipoMov; fecha: string; recibe_nombre: string | null; a_empleado: string | null; a_ubicacion: string | null; firmado: boolean; num_activos: number }
type Ubi = { id: string; nombre: string; tipo: keyof typeof TIPOS_UBICACION; codigo: string | null; responsable: { nombres: string; apellidos: string | null } | null }

export function EmpresaDetalle() {
  const { id } = useParams()
  const [sp, setSp] = useSearchParams()
  const tab = (sp.get('tab') as typeof TABS[number][0]) || 'resumen'
  const { esAdmin, puedeEditar, puedeResguardar } = useAuth()
  const [e, setE] = useState<Empresa | null>(null)
  const [acts, setActs] = useState<Act[]>([])
  const [movs, setMovs] = useState<Mov[]>([])
  const [ubis, setUbis] = useState<Ubi[]>([])
  const [nEmp, setNEmp] = useState(0)
  const [editar, setEditar] = useState(false)
  const [q, setQ] = useState('')

  const cargar = () => {
    supabase.from('empresas').select('*').eq('id', id!).single().then(({ data }) => setE(data as Empresa))
    supabase.from('v_activos').select('*').eq('empresa_id', id!).order('codigo').limit(5000).then(({ data }) => setActs((data as Act[]) ?? []))
    supabase.from('v_movimientos').select('*').eq('empresa_id', id!).order('fecha', { ascending: false }).limit(6).then(({ data }) => setMovs((data as Mov[]) ?? []))
    supabase.from('ubicaciones').select('id,nombre,tipo,codigo,responsable:empleados(nombres,apellidos)').eq('empresa_id', id!).eq('activo', true).order('nombre').then(({ data }) => setUbis((data as unknown as Ubi[]) ?? []))
    supabase.from('empleados').select('id').eq('empresa_id', id!).eq('activo', true).then(({ data }) => setNEmp(data?.length ?? 0))
  }
  useEffect(cargar, [id])

  if (!e) return <Cargando />
  const color = e.color || '#F9B234'
  const vivos = acts.filter(a => a.estatus !== 'baja')
  const k = (s: Estatus) => vivos.filter(a => a.estatus === s).length
  const top = [...vivos.reduce((m, a) => { if (a.responsable_id) m.set(a.responsable_id, { n: (m.get(a.responsable_id)?.n ?? 0) + 1, nombre: a.responsable ?? '' }); return m }, new Map<string, { n: number; nombre: string }>())]
    .sort((x, y) => y[1].n - x[1].n).slice(0, 5)
  const porCat = [...vivos.reduce((m, a) => m.set(a.categoria, (m.get(a.categoria) ?? 0) + 1), new Map<string, number>())].sort((x, y) => y[1] - x[1])
  const t = q.trim().toLowerCase()

  return (
    <div>
      <Link to="/empresas" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Empresas</Link>
      <header className="tarjeta relative mb-6 overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(40rem 14rem at 15% 120%, ${color}2e, transparent 70%)` }} />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px" style={{ background: `linear-gradient(90deg, ${color}, transparent 70%)` }} />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center">
          <div className="grid h-28 w-full max-w-xs shrink-0 place-items-center rounded-2xl border border-stone-200 bg-stone-50 px-6"><LogoEmpresa empresa={e} alto={56} ancho={260} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold">{e.nombre}</h1>
            <p className="mt-1 text-sm text-stone-500">{[e.razon_social, e.rfc].filter(Boolean).join(' · ') || 'Razón social y RFC pendientes'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {puedeResguardar && <Link to={`/resguardos/nuevo?tipo=asignacion&empresa=${e.id}`} className="btn-primario"><ClipboardSignature size={16} />Asignar activos</Link>}
              {puedeEditar && <Link to={`/alta?empresa=${e.id}`} className="btn-sec"><PackagePlus size={16} />Alta de activos</Link>}
              {esAdmin && <button className="btn-sec" onClick={() => setEditar(true)}><Pencil size={16} />Editar empresa</button>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:w-80">
            {([['Activos', vivos.length], ['Asignados', k('asignado')], ['Empleados', nEmp]] as const).map(([tt, n]) => (
              <div key={tt} className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-center"><p className="cifra text-2xl font-semibold" style={{ color: tt === 'Activos' ? color : undefined }}>{n}</p><p className="text-[10px] uppercase tracking-wider text-stone-500">{tt}</p></div>
            ))}
          </div>
        </div>
      </header>

      <div className="mb-6"><BuscadorEmpresa empresaId={e.id} /></div>

      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50 p-1">
        {TABS.map(([kk, txt]) => (
          <button key={kk} onClick={() => setSp(kk === 'resumen' ? {} : { tab: kk }, { replace: true })}
            className={`relative flex-1 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${tab === kk ? 'bg-marca text-[#120D04] shadow-[0_0_20px_-6px_rgb(249_178_52/.8)]' : 'text-stone-500 hover:text-tinta'}`}>
            {txt}{kk === 'empleados' ? ` · ${nEmp}` : kk === 'activos' ? ` · ${vivos.length}` : kk === 'ubicaciones' ? ` · ${ubis.length}` : ''}
          </button>
        ))}
      </nav>

      <div key={tab} className="animate-entrar">
        {tab === 'resumen' && (
          <div className="grid gap-6 lg:grid-cols-3">
            <section className="tarjeta min-w-0 p-5">
              <h2 className="mb-4 text-sm font-semibold">Estatus</h2>
              <ul className="space-y-2">
                {(Object.keys(ESTATUS) as Estatus[]).map(s => (
                  <li key={s}><Link to={`/activos?empresa=${e.id}&estatus=${s}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-100">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[s], boxShadow: `0 0 8px ${COLOR[s]}` }} /><span className="flex-1 text-stone-600">{ESTATUS[s].texto}</span><span className="cifra font-semibold">{acts.filter(a => a.estatus === s).length}</span>
                  </Link></li>
                ))}
              </ul>
              <h2 className="mb-3 mt-6 text-sm font-semibold">Por categoría</h2>
              <ul className="space-y-2.5">
                {porCat.slice(0, 6).map(([c, n]) => (
                  <li key={c}><div className="mb-1 flex justify-between text-[13px]"><span className="truncate text-stone-600">{c}</span><span className="cifra">{n}</span></div>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-stone-100"><span className="block h-full origin-left rounded-full" style={{ width: `${(n / (porCat[0]?.[1] || 1)) * 100}%`, background: color, animation: 'crecer 1s cubic-bezier(.2,.8,.2,1) both' }} /></span></li>
                ))}
                {porCat.length === 0 && <li className="text-sm text-stone-500">Sin activos.</li>}
              </ul>
            </section>
            <section className="tarjeta min-w-0 p-5">
              <h2 className="mb-4 flex items-center justify-between text-sm font-semibold">Quién tiene más activos<button onClick={() => setSp({ tab: 'empleados' })} className="text-[11px] font-normal text-marca hover:underline">Ver empleados</button></h2>
              {top.length === 0 ? <p className="text-sm text-stone-500">Nadie tiene activos asignados todavía.</p> : (
                <ul className="space-y-2">{top.map(([eid, v], i) => (
                  <li key={eid}><Link to={`/empleados/${eid}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-stone-100">
                    <span className="w-4 text-center text-xs text-stone-400">{i + 1}</span><Avatar e={{ id: eid, nombres: v.nombre }} tam={34} /><span className="min-w-0 flex-1 truncate text-sm">{v.nombre}</span><span className="cifra text-lg font-semibold text-marca">{v.n}</span>
                  </Link></li>
                ))}</ul>
              )}
            </section>
            <section className="tarjeta min-w-0 p-5">
              <h2 className="mb-4 text-sm font-semibold">Últimos resguardos</h2>
              {movs.length === 0 ? <p className="text-sm text-stone-500">Sin movimientos.</p> : (
                <ul className="space-y-3">{movs.map(m => (
                  <li key={m.id}><Link to={`/resguardos/${m.id}`} className="group block">
                    <div className="flex items-center gap-2"><span className="font-mono text-xs text-stone-500 group-hover:text-marca">{m.folio}</span><TipoBadge tipo={m.tipo} />{!m.firmado && <PenLine size={12} className="text-amber-700" />}</div>
                    <p className="truncate text-sm">{m.num_activos} activo(s) · {m.recibe_nombre ?? m.a_empleado ?? m.a_ubicacion ?? '—'}</p>
                    <p className="text-[11px] text-stone-400">{new Date(m.fecha).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</p>
                  </Link></li>
                ))}</ul>
              )}
            </section>
          </div>
        )}

        {tab === 'empleados' && <ListaEmpleados empresaId={e.id} />}

        {tab === 'activos' && (
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <div className="relative min-w-0 flex-1 basis-60"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo pl-10" placeholder="Buscar código, producto, serie, responsable…" value={q} onChange={ev => setQ(ev.target.value)} /></div>
              <Link to={`/activos?empresa=${e.id}`} className="btn-sec">Abrir en Activos</Link>
              {puedeEditar && <Link to={`/alta?empresa=${e.id}`} className="btn-primario"><PackagePlus size={16} />Alta</Link>}
            </div>
            {acts.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin activos" texto="Da de alta los activos de esta empresa." /></div> : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {acts.filter(a => !t || [a.codigo, a.descripcion, a.serie, a.marca, a.modelo, a.responsable, a.ubicacion].some(x => x?.toLowerCase().includes(t))).map(a => (
                  <Link key={a.id} to={`/activos/${a.id}`} className="tarjeta viva group min-w-0 overflow-hidden">
                    <div className="relative"><FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} className="aspect-[4/3] w-full" icono={32} />
                      <span className="absolute left-2 top-2"><EstatusBadge estatus={a.estatus} /></span></div>
                    <div className="p-3">
                      <p className="font-mono text-[11px] text-marca">{a.codigo}</p>
                      <p className="truncate text-sm font-medium">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</p>
                      <p className="truncate text-[11px] text-stone-500">{a.responsable || a.ubicacion || 'Sin ubicación'}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'ubicaciones' && <div className="mb-5"><MapaMexico empresaId={id} /></div>}
        {tab === 'ubicaciones' && (
          ubis.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin ubicaciones" texto="Da de alta obras, almacenes y oficinas en Organización → Ubicaciones." accion={<Link className="btn-sec" to="/ubicaciones">Ir a Ubicaciones</Link>} /></div> : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {ubis.map(u => {
                const n = vivos.filter(a => a.ubicacion_id === u.id).length
                return (
                  <Link key={u.id} to={`/activos?empresa=${e.id}&ubicacion=${u.id}`} className="tarjeta viva flex items-center gap-4 p-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-marca"><MapPin size={20} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{u.nombre}</span>
                      <span className="block truncate text-xs text-stone-500">{TIPOS_UBICACION[u.tipo] ?? u.tipo}{u.codigo ? ` · ${u.codigo}` : ''}{u.responsable ? ` · ${[u.responsable.nombres, u.responsable.apellidos].filter(Boolean).join(' ')}` : ''}</span></span>
                    <span className="text-right"><span className="cifra block text-2xl font-semibold">{n}</span><span className="text-[10px] uppercase tracking-wider text-stone-500">activos</span></span>
                  </Link>
                )
              })}
            </div>
          )
        )}
      </div>
      <EmpresaModal abierto={editar} empresa={e} onCerrar={() => setEditar(false)} onGuardado={() => { setEditar(false); cargar() }} />
    </div>
  )
}
