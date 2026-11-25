import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Fuel, Plus, AlertTriangle, TrendingDown, TrendingUp, FileSpreadsheet, Trash2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Encabezado, Cargando, Vacio, Aviso, Campo } from '../components/ui'
import { BuscarActivo, type ActivoMini } from '../components/Buscadores'
import { libroExcel, descargar } from '../lib/excel'

type Carga = { id: string; activo_id: string; fecha: string; litros: number; lectura: number | null; tipo_lectura: 'km' | 'horas'; lleno: boolean; operador: string | null; estacion: string | null; notas: string | null
  codigo: string; descripcion: string; placa: string | null; numero_economico: string | null; recorrido: number | null; rendimiento: number | null }
type Unidad = { activo_id: string; codigo: string; descripcion: string; placa: string | null; numero_economico: string | null; tipo_lectura: 'km' | 'horas'; cargas: number; litros: number
  ultima_carga: string; promedio: number | null; ultimo: number | null; con_rendimiento: number }

const unidadRend = (t: string) => t === 'horas' ? 'h/L' : 'km/L'
const num = (n: number | null | undefined, d = 1) => n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: d })
const fecha = (s: string) => new Date(s).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const rendimientoBajo = (u: Pick<Unidad, 'ultimo' | 'promedio' | 'con_rendimiento'>) => u.con_rendimiento >= 3 && u.ultimo != null && u.promedio != null && u.ultimo < u.promedio * 0.75

/** Cargas de combustible de vehículos y maquinaria: litros y kilometraje (sin montos). Calcula el rendimiento y avisa cuando baja. */
export default function Combustible() {
  const { puedeEditar, perfil } = useAuth()
  const [cargas, setCargas] = useState<Carga[] | null>(null)
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [activo, setActivo] = useState<ActivoMini | null>(null)
  const [f, setF] = useState({ litros: '', lectura: '', tipo: 'km' as 'km' | 'horas', lleno: true, operador: '', estacion: '', notas: '' })
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [ver, setVer] = useState<string>('')

  const cargar = () => {
    supabase.from('v_cargas_combustible').select('*').order('fecha', { ascending: false }).limit(300).then(({ data }) => setCargas((data as Carga[]) ?? []))
    supabase.from('v_rendimiento_unidades').select('*').order('ultima_carga', { ascending: false }).then(({ data }) => setUnidades((data as Unidad[]) ?? []))
  }
  useEffect(cargar, [])
  useEffect(() => { if (perfil?.nombre && !f.operador) setF(x => ({ ...x, operador: perfil.nombre })) }, [perfil]) // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null)
    if (!activo) { setMsg({ ok: false, t: 'Elige el vehículo o la máquina.' }); return }
    const litros = Number(f.litros.replace(',', '.'))
    if (!(litros > 0)) { setMsg({ ok: false, t: 'Escribe los litros que se cargaron.' }); return }
    const lectura = f.lectura ? Number(f.lectura.replace(/[,\s]/g, '')) : null
    const ult = unidades.find(u => u.activo_id === activo.id && u.tipo_lectura === f.tipo)
    const prev = cargas?.find(c => c.activo_id === activo.id && c.tipo_lectura === f.tipo && c.lectura != null)
    if (lectura != null && prev?.lectura != null && lectura < prev.lectura) { setMsg({ ok: false, t: `La lectura no puede ser menor a la de la carga anterior (${num(prev.lectura, 0)} ${f.tipo}).` }); return }
    setGuardando(true)
    const { error } = await supabase.from('cargas_combustible').insert({ activo_id: activo.id, empresa_id: activo.empresa_id, litros, lectura, tipo_lectura: f.tipo, lleno: f.lleno,
      operador: f.operador.trim() || null, estacion: f.estacion.trim() || null, notas: f.notas.trim() || null })
    setGuardando(false)
    if (error) { setMsg({ ok: false, t: mensajeError(error) }); return }
    const rend = lectura != null && prev?.lectura != null && f.lleno ? (lectura - prev.lectura) / litros : null
    setMsg({ ok: true, t: `Carga registrada${rend ? `: ${num(rend, 2)} ${unidadRend(f.tipo)}${ult?.promedio ? ` (su promedio es ${num(ult.promedio, 2)})` : ''}` : ''}.` })
    setF({ ...f, litros: '', lectura: '', notas: '' }); setActivo(null); cargar()
  }
  async function borrar(c: Carga) {
    const { error } = await supabase.from('cargas_combustible').delete().eq('id', c.id)
    if (error) setMsg({ ok: false, t: mensajeError(error) }); else cargar()
  }
  function excel() {
    descargar(libroExcel<Carga>([{ nombre: 'Cargas', columnas: [
      { titulo: 'Fecha', valor: c => fecha(c.fecha), ancho: 18 }, { titulo: 'Código', valor: c => c.codigo, ancho: 12 }, { titulo: 'Unidad', valor: c => c.descripcion, ancho: 30 },
      { titulo: 'Placa', valor: c => c.placa }, { titulo: 'Litros', valor: c => c.litros }, { titulo: 'Lectura', valor: c => c.lectura }, { titulo: 'Tipo', valor: c => c.tipo_lectura },
      { titulo: 'Recorrido', valor: c => c.recorrido }, { titulo: 'Rendimiento', valor: c => c.rendimiento }, { titulo: 'Tanque lleno', valor: c => c.lleno ? 'Sí' : 'No' },
      { titulo: 'Operador', valor: c => c.operador, ancho: 22 }, { titulo: 'Estación', valor: c => c.estacion, ancho: 20 }, { titulo: 'Notas', valor: c => c.notas, ancho: 30 }],
      filas: vis }]), `combustible-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const vis = useMemo(() => (cargas ?? []).filter(c => !ver || c.activo_id === ver), [cargas, ver])
  if (!cargas) return <Cargando />
  const bajos = unidades.filter(rendimientoBajo)
  const litrosMes = cargas.filter(c => Date.now() - new Date(c.fecha).getTime() < 30 * 864e5).reduce((s, c) => s + Number(c.litros), 0)

  return (
    <div>
      <Encabezado titulo="Combustible" sub="Registra cada carga con sus litros y el kilometraje u horómetro. El sistema calcula el rendimiento de cada unidad y avisa cuando consume de más."
        acciones={<button className="btn-sec" onClick={excel} disabled={!vis.length}><FileSpreadsheet size={16} />Excel</button>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['Litros últimos 30 días', num(litrosMes, 0), ''], ['Cargas registradas', String(cargas.length), ''], ['Unidades con registro', String(unidades.length), ''], ['Rendimiento bajo', String(bajos.length), bajos.length ? 'text-red-700' : '']] as const).map(([t, v, c]) => (
          <div key={t} className="tarjeta p-4"><p className={`cifra text-3xl font-semibold ${c}`}>{v}</p><p className="text-xs text-stone-500">{t}</p></div>
        ))}
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-[24rem_1fr] *:min-w-0">
        <form onSubmit={guardar} className="tarjeta space-y-3 p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Fuel size={17} className="text-marca" />Registrar carga</h2>
          <Campo label="Vehículo o máquina"><BuscarActivo valor={activo} onElegir={setActivo} soloVehiculos placeholder="Placa, No. económico o código…" /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Litros *"><input className="campo" inputMode="decimal" placeholder="45.5" value={f.litros} onChange={e => setF({ ...f, litros: e.target.value })} /></Campo>
            <Campo label={f.tipo === 'km' ? 'Kilometraje' : 'Horómetro'}><input className="campo" inputMode="numeric" placeholder={f.tipo === 'km' ? '48250' : '6130'} value={f.lectura} onChange={e => setF({ ...f, lectura: e.target.value })} /></Campo>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={f.tipo === 'km'} onChange={() => setF({ ...f, tipo: 'km' })} />Kilómetros</label>
            <label className="flex items-center gap-2"><input type="radio" checked={f.tipo === 'horas'} onChange={() => setF({ ...f, tipo: 'horas' })} />Horas (maquinaria)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.lleno} onChange={e => setF({ ...f, lleno: e.target.checked })} />Tanque lleno</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Operador"><input className="campo" value={f.operador} onChange={e => setF({ ...f, operador: e.target.value })} /></Campo>
            <Campo label="Estación"><input className="campo" placeholder="Opcional" value={f.estacion} onChange={e => setF({ ...f, estacion: e.target.value })} /></Campo>
          </div>
          <Campo label="Notas"><input className="campo" placeholder="Opcional" value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} /></Campo>
          {msg && <Aviso tipo={msg.ok ? 'ok' : 'error'}>{msg.t}</Aviso>}
          <button className="btn-primario w-full justify-center" disabled={guardando}><Plus size={16} />{guardando ? 'Guardando…' : 'Registrar carga'}</button>
          <p className="text-[11px] text-stone-400">El rendimiento se calcula entre dos cargas con tanque lleno. La lectura también actualiza el kilometraje del vehículo y su plan de mantenimiento.</p>
        </form>

        <section className="tarjeta overflow-hidden">
          <h2 className="p-5 pb-2 font-semibold">Rendimiento por unidad</h2>
          {unidades.length === 0 ? <div className="p-5 pt-0"><Vacio titulo="Sin cargas todavía" texto="Registra la primera carga de cada unidad para empezar a medir su rendimiento." /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-2">Unidad</th><th className="px-3 py-2 text-right">Cargas</th><th className="px-3 py-2 text-right">Litros</th><th className="px-3 py-2 text-right">Promedio</th><th className="px-3 py-2 text-right">Último</th><th className="px-3 py-2" /></tr></thead>
                <tbody className="divide-y divide-stone-100">{unidades.map(u => {
                  const bajo = rendimientoBajo(u), sube = u.con_rendimiento >= 3 && u.ultimo != null && u.promedio != null && u.ultimo > u.promedio * 1.1
                  return (
                    <tr key={u.activo_id + u.tipo_lectura} className={`cursor-pointer hover:bg-stone-50 ${ver === u.activo_id ? 'bg-marca/10' : ''}`} onClick={() => setVer(v => v === u.activo_id ? '' : u.activo_id)}>
                      <td className="px-5 py-2"><Link to={`/activos/${u.activo_id}`} onClick={e => e.stopPropagation()} className="font-mono text-xs text-marca hover:underline">{u.codigo}</Link> <span className="font-medium">{u.placa || u.numero_economico || ''}</span><span className="block truncate text-xs text-stone-500">{u.descripcion}</span></td>
                      <td className="cifra px-3 py-2 text-right">{u.cargas}</td><td className="cifra px-3 py-2 text-right">{num(u.litros, 0)}</td>
                      <td className="cifra px-3 py-2 text-right">{num(u.promedio, 2)} <span className="text-xs text-stone-400">{unidadRend(u.tipo_lectura)}</span></td>
                      <td className={`cifra px-3 py-2 text-right ${bajo ? 'font-semibold text-red-600' : ''}`}>{num(u.ultimo, 2)}</td>
                      <td className="px-3 py-2">{bajo ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-700"><TrendingDown size={12} />Consume de más</span> : sube ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><TrendingUp size={12} />Mejor</span> : null}</td>
                    </tr>)
                })}</tbody>
              </table>
            </div>
          )}
          {bajos.length > 0 && <p className="m-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertTriangle size={15} className="shrink-0" />Un rendimiento 25% menor a su promedio puede ser falla mecánica, llantas bajas, mala conducción o una carga mal registrada. Revísalo con el operador.</p>}
        </section>
      </div>

      <section className="tarjeta overflow-hidden">
        <h2 className="flex flex-wrap items-center justify-between gap-2 p-5 pb-2 font-semibold">Cargas{ver ? ' de la unidad elegida' : ' recientes'}{ver && <button className="text-xs font-normal text-marca hover:underline" onClick={() => setVer('')}>Ver todas</button>}</h2>
        {vis.length === 0 ? <p className="p-5 pt-0 text-sm text-stone-500">Sin cargas.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-2">Fecha</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2 text-right">Litros</th><th className="px-3 py-2 text-right">Lectura</th><th className="px-3 py-2 text-right">Recorrido</th><th className="px-3 py-2 text-right">Rendimiento</th><th className="px-3 py-2">Operador</th><th /></tr></thead>
            <tbody className="divide-y divide-stone-100">{vis.slice(0, 120).map(c => (
              <tr key={c.id}>
                <td className="whitespace-nowrap px-5 py-2 text-xs text-stone-500">{fecha(c.fecha)}</td>
                <td className="px-3 py-2"><span className="font-mono text-xs text-marca">{c.codigo}</span> {c.placa || c.numero_economico || c.descripcion}</td>
                <td className="cifra px-3 py-2 text-right">{num(c.litros, 2)}</td>
                <td className="cifra px-3 py-2 text-right">{num(c.lectura, 0)} <span className="text-xs text-stone-400">{c.tipo_lectura}</span></td>
                <td className="cifra px-3 py-2 text-right">{num(c.recorrido, 0)}</td>
                <td className="cifra px-3 py-2 text-right">{c.rendimiento != null ? `${num(c.rendimiento, 2)} ${unidadRend(c.tipo_lectura)}` : <span className="text-xs text-stone-400">{c.lleno ? '—' : 'no se llenó'}</span>}</td>
                <td className="px-3 py-2 text-xs text-stone-500">{c.operador}</td>
                <td className="px-2">{puedeEditar && <button aria-label="Borrar carga" title="Borrar" className="text-stone-400 hover:text-red-600" onClick={() => borrar(c)}><Trash2 size={14} /></button>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  )
}

/** Resumen de combustible en la ficha de un vehículo. */
export function CombustibleActivo({ activoId }: { activoId: string }) {
  const [u, setU] = useState<Unidad | null | undefined>(undefined)
  const [ult, setUlt] = useState<Carga[]>([])
  useEffect(() => {
    supabase.from('v_rendimiento_unidades').select('*').eq('activo_id', activoId).limit(1).maybeSingle().then(({ data }) => setU((data as Unidad) ?? null))
    supabase.from('v_cargas_combustible').select('*').eq('activo_id', activoId).order('fecha', { ascending: false }).limit(5).then(({ data }) => setUlt((data as Carga[]) ?? []))
  }, [activoId])
  if (u === undefined) return null
  return (
    <section className="tarjeta p-5">
      <h2 className="mb-3 flex items-center justify-between gap-2 font-semibold"><span className="flex items-center gap-2"><Fuel size={17} className="text-marca" />Combustible</span><Link to="/combustible" className="text-xs font-normal text-marca hover:underline">Registrar carga</Link></h2>
      {!u ? <p className="text-sm text-stone-500">Sin cargas registradas.</p> : <>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-stone-50 p-2"><p className="cifra text-lg font-semibold">{num(u.promedio, 2)}</p><p className="text-[10px] text-stone-500">promedio {unidadRend(u.tipo_lectura)}</p></div>
          <div className="rounded-xl bg-stone-50 p-2"><p className={`cifra text-lg font-semibold ${rendimientoBajo(u) ? 'text-red-600' : ''}`}>{num(u.ultimo, 2)}</p><p className="text-[10px] text-stone-500">última carga</p></div>
          <div className="rounded-xl bg-stone-50 p-2"><p className="cifra text-lg font-semibold">{num(u.litros, 0)}</p><p className="text-[10px] text-stone-500">litros en {u.cargas} cargas</p></div>
        </div>
        <ul className="space-y-1 text-xs text-stone-500">{ult.map(c => <li key={c.id} className="flex justify-between"><span>{fecha(c.fecha)}</span><span className="cifra">{num(c.litros, 1)} L · {num(c.lectura, 0)} {c.tipo_lectura}{c.rendimiento != null ? ` · ${num(c.rendimiento, 2)} ${unidadRend(c.tipo_lectura)}` : ''}</span></li>)}</ul>
      </>}
    </section>
  )
}
