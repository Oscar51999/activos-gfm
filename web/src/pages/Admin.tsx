import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ShieldAlert, Users, Palette, Trash2, History, Search, Check, Sun, Moon, Gauge } from 'lucide-react'
import { supabase, mensajeError, ESTATUS, type Estatus } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ACENTOS, aplicarApariencia, type Apariencia, type Tema } from '../lib/tema'
import { fecha } from '../lib/hooks'
import { Aviso, Campo, Cargando, Modal } from '../components/ui'
import Usuarios from './Usuarios'

const PESTANAS = [
  { k: 'resumen', t: 'Resumen', i: Gauge },
  { k: 'usuarios', t: 'Usuarios y permisos', i: Users },
  { k: 'apariencia', t: 'Apariencia', i: Palette },
  { k: 'activos', t: 'Eliminar activos', i: Trash2 },
  { k: 'historial', t: 'Historial de cambios', i: History },
] as const
type Pestana = typeof PESTANAS[number]['k']

/** Panel del administrador principal (solo OSCAR COTA). */
export default function Admin() {
  const { esSuper } = useAuth()
  const [sp, setSp] = useSearchParams()
  const tab = (PESTANAS.find(p => p.k === sp.get('tab'))?.k ?? 'resumen') as Pestana
  if (!esSuper) return <Navigate to="/" replace />
  return (
    <div>
      <div className="mb-6">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-marca/30 bg-marca/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[.16em] text-marca"><ShieldAlert size={12} />Administrador principal</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">Administración</h1>
        <p className="mt-1 text-sm text-stone-500">Usuarios, permisos, apariencia del sistema y acciones que no se pueden deshacer. Solo tú ves esta sección.</p>
      </div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-stone-200">
        {PESTANAS.map(p => (
          <button key={p.k} onClick={() => setSp({ tab: p.k }, { replace: true })}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition ${tab === p.k ? 'border-marca text-tinta' : 'border-transparent text-stone-500 hover:text-tinta'}`}><p.i size={15} />{p.t}</button>
        ))}
      </div>
      {tab === 'resumen' && <Resumen ir={k => setSp({ tab: k }, { replace: true })} />}
      {tab === 'usuarios' && <Usuarios />}
      {tab === 'apariencia' && <AparienciaPanel />}
      {tab === 'activos' && <EliminarActivos />}
      {tab === 'historial' && <Historial />}
    </div>
  )
}

function Resumen({ ir }: { ir: (k: Pestana) => void }) {
  const [n, setN] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    const contar = (t: string) => supabase.from(t).select('*', { count: 'exact', head: true })
    Promise.all([
      contar('perfiles'), contar('perfiles').eq('activo', false),
      contar('activos'), contar('empleados'), contar('centros_costo'), contar('bitacora'),
    ]).then(([u, p, a, e, c, b]) => setN({ usuarios: u.count ?? 0, pendientes: p.count ?? 0, activos: a.count ?? 0, empleados: e.count ?? 0, cc: c.count ?? 0, cambios: b.count ?? 0 }))
  }, [])
  if (!n) return <Cargando />
  const tiles: [string, number, Pestana | string][] = [['Usuarios', n.usuarios, 'usuarios'], ['Esperan activación', n.pendientes, 'usuarios'], ['Activos', n.activos, '/activos'], ['Empleados', n.empleados, '/empleados'], ['Centros de costo', n.cc, '/centros-costo'], ['Cambios registrados', n.cambios, 'historial']]
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map(([t, v, d]) => {
        const cuerpo = <><p className="text-xs uppercase tracking-wider text-stone-500">{t}</p><p className="cifra mt-1 text-3xl font-semibold">{v.toLocaleString('es-MX')}</p></>
        return d.startsWith('/')
          ? <Link key={t} to={d} className="tarjeta viva p-5">{cuerpo}</Link>
          : <button key={t} onClick={() => ir(d as Pestana)} className="tarjeta viva p-5 text-left">{cuerpo}</button>
      })}
    </div>
  )
}

function AparienciaPanel() {
  const { apariencia, setApariencia } = useAuth()
  const [a, setA] = useState<Apariencia>(apariencia)
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null)
  useEffect(() => { setA(apariencia) }, [apariencia])
  const probar = (x: Apariencia) => { setA(x); aplicarApariencia(x) }
  async function guardar() {
    setMsg(null)
    const { error } = await supabase.from('ajustes').upsert({ clave: 'apariencia', valor: a, updated_at: new Date().toISOString() }, { onConflict: 'clave' })
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    setApariencia(a); setMsg({ t: 'ok', m: 'Guardado. Todos lo verán la próxima vez que abran el sistema.' })
  }
  return (
    <div className="max-w-3xl space-y-5">
      <section className="tarjeta p-5">
        <h3 className="font-semibold">Color de acento</h3>
        <p className="mb-4 text-sm text-stone-500">El color de botones, enlaces y resaltados para todos los usuarios.</p>
        <div className="flex flex-wrap gap-2">
          {ACENTOS.map(c => (
            <button key={c.hex} onClick={() => probar({ ...a, acento: c.hex })} title={c.nombre}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${a.acento === c.hex ? 'border-marca bg-marca/10' : 'border-stone-200 hover:border-stone-300'}`}>
              <span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: c.hex }}>{a.acento === c.hex && <Check size={12} className="text-[#120D04]" />}</span>{c.nombre}
            </button>
          ))}
          <label className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm">Otro <input type="color" value={a.acento ?? '#E2A64B'} onChange={e => probar({ ...a, acento: e.target.value })} className="h-6 w-8 cursor-pointer bg-transparent" /></label>
        </div>
      </section>
      <section className="tarjeta grid gap-4 p-5 sm:grid-cols-2">
        <Campo label="Tema para quien no ha elegido">
          <div className="flex gap-2">
            {([['oscuro', 'Oscuro', Moon], ['claro', 'Claro', Sun]] as const).map(([t, n, I]) => (
              <button key={t} onClick={() => setA({ ...a, tema_defecto: t as Tema })} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm ${(a.tema_defecto ?? 'oscuro') === t ? 'border-marca bg-marca/10' : 'border-stone-200'}`}><I size={15} />{n}</button>
            ))}
          </div>
        </Campo>
        <Campo label="Tamaño de letra y espacios">
          <div className="flex gap-2">
            {([['normal', 'Normal'], ['compacta', 'Compacto']] as const).map(([d, n]) => (
              <button key={d} onClick={() => probar({ ...a, densidad: d })} className={`flex-1 rounded-xl border px-3 py-2 text-sm ${(a.densidad ?? 'normal') === d ? 'border-marca bg-marca/10' : 'border-stone-200'}`}>{n}</button>
            ))}
          </div>
        </Campo>
      </section>
      {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}
      <div className="flex justify-end gap-2">
        <button className="btn-sec" onClick={() => probar({ acento: '#E2A64B', tema_defecto: 'oscuro', densidad: 'normal' })}>Restablecer</button>
        <button className="btn-primario" onClick={guardar}><Check size={15} />Guardar para todos</button>
      </div>
    </div>
  )
}

type ActivoMin = { id: string; codigo: string; descripcion: string; empresa: string; categoria: string; estatus: Estatus; serie: string | null }
function EliminarActivos() {
  const [q, setQ] = useState('')
  const [filas, setFilas] = useState<ActivoMin[] | null>(null)
  const [sel, setSel] = useState<ActivoMin | null>(null)
  const [txt, setTxt] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  async function buscar(e?: React.FormEvent) {
    e?.preventDefault()
    const t = q.trim().replace(/[%,()]/g, ' ')
    let c = supabase.from('v_activos').select('id,codigo,descripcion,empresa,categoria,estatus,serie').order('codigo').limit(50)
    if (t) c = c.or(`codigo.ilike.%${t}%,descripcion.ilike.%${t}%,serie.ilike.%${t}%,numero_economico.ilike.%${t}%`)
    const { data } = await c
    setFilas((data as ActivoMin[]) ?? [])
  }
  useEffect(() => { buscar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function eliminar() {
    if (!sel) return
    setError('')
    const { error } = await supabase.rpc('admin_eliminar_activo', { p_id: sel.id })
    if (error) return setError(mensajeError(error))
    setOk(`${sel.codigo} se eliminó.`); setSel(null); setTxt(''); buscar()
  }
  return (
    <div className="space-y-4">
      <Aviso tipo="info">Para equipo que salió de la empresa usa <b>Baja</b> en el activo: conserva el historial. Eliminar es para capturas por error o duplicadas y borra también sus resguardos.</Aviso>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      <form onSubmit={buscar} className="flex gap-2">
        <span className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder="Código, descripción, serie o número económico" /></span>
        <button className="btn-sec">Buscar</button>
      </form>
      {!filas ? <Cargando /> : filas.length === 0 ? <p className="text-sm text-stone-500">Sin resultados.</p> : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-500"><tr><th className="px-4 py-2.5 font-medium">Código</th><th className="px-4 py-2.5 font-medium">Descripción</th><th className="px-4 py-2.5 font-medium">Empresa</th><th className="px-4 py-2.5 font-medium">Estatus</th><th /></tr></thead>
            <tbody className="divide-y divide-stone-100">
              {filas.map(f => (
                <tr key={f.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2.5 font-mono text-xs"><Link to={`/activos/${f.id}`} className="hover:text-marca">{f.codigo}</Link></td>
                  <td className="px-4 py-2.5">{f.descripcion}<span className="block text-xs text-stone-500">{f.categoria}{f.serie ? ` · S/N ${f.serie}` : ''}</span></td>
                  <td className="px-4 py-2.5 text-stone-600">{f.empresa}</td>
                  <td className="px-4 py-2.5 text-xs">{ESTATUS[f.estatus]?.texto}</td>
                  <td className="px-2"><button className="rounded p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-700" aria-label={`Eliminar ${f.codigo}`} onClick={() => { setSel(f); setTxt(''); setError(''); setOk('') }}><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal abierto={!!sel} titulo="Eliminar activo" onCerrar={() => setSel(null)} ancho="max-w-md">
        {sel && <div className="space-y-4">
          <Aviso>Se borra <b>{sel.codigo} · {sel.descripcion}</b> con sus fotos, documentos y resguardos. No se puede deshacer.</Aviso>
          <Campo label={`Escribe ${sel.codigo} para confirmar`}><input className="campo font-mono" value={txt} onChange={e => setTxt(e.target.value)} autoFocus /></Campo>
          {error && <Aviso>{error}</Aviso>}
          <div className="flex justify-end gap-2"><button className="btn-sec" onClick={() => setSel(null)}>Cancelar</button><button className="btn-peligro" disabled={txt.trim().toUpperCase() !== sel.codigo.toUpperCase()} onClick={eliminar}><Trash2 size={15} />Eliminar</button></div>
        </div>}
      </Modal>
    </div>
  )
}

type Cambio = { id: number; tabla: string; registro_id: string | null; accion: string; usuario_id: string | null; antes: Record<string, unknown> | null; despues: Record<string, unknown> | null; fecha: string }
const TABLAS: Record<string, string> = { activos: 'Activo', empleados: 'Empleado', perfiles: 'Usuario', empresas: 'Empresa', ubicaciones: 'Ubicación', categorias: 'Categoría', proveedores: 'Proveedor', activo_vehiculo: 'Vehículo' }
const ACCION: Record<string, [string, string]> = { INSERT: ['Alta', 'text-emerald-700'], UPDATE: ['Cambio', 'text-sky-700'], DELETE: ['Borrado', 'text-red-700'] }
const IGNORAR = new Set(['updated_at', 'created_at', 'id', 'qr'])

function Historial() {
  const [filas, setFilas] = useState<Cambio[] | null>(null)
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [tabla, setTabla] = useState('')
  const [limite, setLimite] = useState(100)
  useEffect(() => {
    let q = supabase.from('bitacora').select('*').order('fecha', { ascending: false }).limit(limite)
    if (tabla) q = q.eq('tabla', tabla)
    q.then(({ data }) => setFilas((data as Cambio[]) ?? []))
    supabase.from('perfiles').select('id,nombre').then(({ data }) => setNombres(Object.fromEntries(((data ?? []) as { id: string; nombre: string }[]).map(p => [p.id, p.nombre]))))
  }, [tabla, limite])
  const titulo = (c: Cambio) => { const r = c.despues ?? c.antes ?? {}; return String(r.codigo ?? r.nombre ?? [r.nombres, r.apellidos].filter(Boolean).join(' ') ?? r.descripcion ?? '') || c.registro_id?.slice(0, 8) }
  const cambios = (c: Cambio) => c.accion !== 'UPDATE' || !c.antes || !c.despues ? [] : Object.keys(c.despues).filter(k => !IGNORAR.has(k) && JSON.stringify(c.antes![k]) !== JSON.stringify(c.despues![k]))
  const corto = (v: unknown) => { const s = v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 40 ? s.slice(0, 40) + '…' : s }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setTabla('')} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${!tabla ? 'bg-marca/15 text-marca ring-marca/40' : 'text-stone-500 ring-stone-200'}`}>Todo</button>
        {Object.entries(TABLAS).map(([k, v]) => <button key={k} onClick={() => setTabla(k)} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${tabla === k ? 'bg-marca/15 text-marca ring-marca/40' : 'text-stone-500 ring-stone-200'}`}>{v}</button>)}
      </div>
      {!filas ? <Cargando /> : filas.length === 0 ? <p className="text-sm text-stone-500">Aún no hay cambios registrados.</p> : (
        <ul className="tarjeta divide-y divide-stone-100">
          {filas.map(c => {
            const [a, cls] = ACCION[c.accion] ?? [c.accion, '']
            const ks = cambios(c)
            return (
              <li key={c.id} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="w-32 shrink-0 text-xs text-stone-500">{fecha(c.fecha)} {new Date(c.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="min-w-0 flex-1">
                  <span className={`font-medium ${cls}`}>{a}</span> · {TABLAS[c.tabla] ?? c.tabla} <b className="font-medium">{titulo(c)}</b>
                  {ks.length > 0 && <span className="mt-0.5 block text-xs text-stone-500">{ks.slice(0, 4).map(k => `${k}: ${corto(c.antes![k])} → ${corto(c.despues![k])}`).join(' · ')}{ks.length > 4 ? ` · +${ks.length - 4}` : ''}</span>}
                </span>
                <span className="text-xs text-stone-500">{c.usuario_id ? nombres[c.usuario_id] ?? 'Usuario eliminado' : 'Sistema'}</span>
              </li>
            )
          })}
        </ul>
      )}
      {filas && filas.length >= limite && <button className="btn-sec" onClick={() => setLimite(l => l + 200)}>Ver más</button>}
    </div>
  )
}
