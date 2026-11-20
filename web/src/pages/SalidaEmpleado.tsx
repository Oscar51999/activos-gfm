import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, Undo2, KeyRound, Boxes, CheckCircle2, CircleAlert, FileCheck2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nombreEmpleado, fecha } from '../lib/hooks'
import { nombresUsuarios } from '../lib/nombresUsuarios'
import { Cargando, Aviso, Campo } from '../components/ui'
import { LogoFirme } from '../components/Logo'

type Emp = { id: string; nombres: string; apellidos: string | null; puesto: string | null; codigo: string | null; activo: boolean; empresa_id: string; empresas: { nombre: string; razon_social: string | null } | null }
type Act = { id: string; codigo: string; descripcion: string; serie: string | null; marca: string | null; modelo: string | null; ubicacion: string | null }
type Lic = { id: string; cuenta: string | null; asignada: string; licencias_software: { nombre: string } | null; activos: { codigo: string } | null }
type Carta = { id: string; folio: string; devueltos: { codigo: string; descripcion: string; fecha: string }[]; observaciones: string | null; emitida_por: string | null; created_at: string }

/** Salida de un empleado: revisa que no deba equipo ni licencias y emite la carta de no adeudo. */
export default function SalidaEmpleado() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { puedeResguardar, puedeEditar } = useAuth()
  const [emp, setEmp] = useState<Emp | null>(null)
  const [acts, setActs] = useState<Act[] | null>(null)
  const [lics, setLics] = useState<Lic[] | null>(null)
  const [cartas, setCartas] = useState<Carta[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [f, setF] = useState({ observaciones: '', darBaja: true, motivo: '' })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [n, setN] = useState(0)

  useEffect(() => {
    supabase.from('empleados').select('id,nombres,apellidos,puesto,codigo,activo,empresa_id,empresas(nombre,razon_social)').eq('id', id!).single().then(({ data }) => setEmp(data as unknown as Emp))
    supabase.from('v_activos').select('id,codigo,descripcion,serie,marca,modelo,ubicacion').eq('responsable_id', id!).neq('estatus', 'baja').order('codigo').then(({ data }) => setActs((data as Act[]) ?? []))
    supabase.from('licencia_asignaciones').select('id,cuenta,asignada,licencias_software(nombre),activos(codigo)').eq('empleado_id', id!).is('liberada', null).then(({ data }) => setLics((data as unknown as Lic[]) ?? []))
    supabase.from('cartas_no_adeudo').select('*').eq('empleado_id', id!).order('created_at', { ascending: false }).then(({ data }) => setCartas((data as Carta[]) ?? []))
    nombresUsuarios().then(setNombres)
  }, [id, n])

  if (!emp || !acts || !lics) return <Cargando />
  const nombre = nombreEmpleado(emp)
  const limpio = acts.length === 0 && lics.length === 0
  const carta = cartas.find(c => c.id === params.get('carta'))

  async function liberarTodas() {
    setError('')
    const { error } = await supabase.from('licencia_asignaciones').update({ liberada: new Date().toISOString().slice(0, 10), notas: 'Liberada por salida del empleado' }).in('id', lics!.map(l => l.id))
    if (error) setError(mensajeError(error)); else setN(x => x + 1)
  }
  async function emitir() {
    setError(''); setEnviando(true)
    const { data, error } = await supabase.rpc('emitir_carta_no_adeudo', { p_empleado: emp!.id, p_observaciones: f.observaciones, p_dar_baja: f.darBaja, p_motivo: f.motivo })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    setParams({ carta: data as string }); setN(x => x + 1)
  }

  if (carta) return <CartaNoAdeudo carta={carta} emp={emp} emisor={nombres[carta.emitida_por ?? ''] ?? ''} onVolver={() => setParams({})} />

  return (
    <div className="mx-auto max-w-4xl">
      <Link to={`/empleados/${emp.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />{nombre}</Link>
      <h1 className="text-2xl font-semibold sm:text-3xl">Salida del empleado</h1>
      <p className="mb-6 mt-1 text-sm text-stone-500">{[emp.puesto, emp.empresas?.nombre].filter(Boolean).join(' · ')}. Antes de emitir la carta de no adeudo debe entregar todo su equipo y liberar sus licencias.</p>

      <div className={`mb-5 flex items-center gap-3 rounded-2xl border p-4 ${limpio ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
        {limpio ? <CheckCircle2 size={22} /> : <CircleAlert size={22} />}
        <p className="text-sm font-medium">{limpio ? 'No debe nada. Ya puedes emitir la carta de no adeudo.' : `Tiene pendiente: ${[acts.length && `${acts.length} activo(s)`, lics.length && `${lics.length} licencia(s) o cuenta(s)`].filter(Boolean).join(' y ')}.`}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="tarjeta p-4">
          <h2 className="mb-3 flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><Boxes size={15} className="text-marca" />Equipo a su cargo · {acts.length}</span>
            {puedeResguardar && acts.length > 0 && <Link className="btn-sec !px-3 !py-1.5 text-xs" to={`/resguardos/nuevo?tipo=devolucion&activos=${acts.map(a => a.id).join(',')}`}><Undo2 size={13} />Recibir todo</Link>}</h2>
          {acts.length === 0 ? <p className="text-sm text-emerald-700">Entregó todo su equipo.</p> : (
            <ul className="space-y-1">{acts.map(a => <li key={a.id}><Link to={`/activos/${a.id}`} className="flex gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-100"><span className="font-mono text-xs text-stone-500">{a.codigo}</span><span className="min-w-0 flex-1 truncate">{a.descripcion}</span></Link></li>)}</ul>
          )}
        </section>
        <section className="tarjeta p-4">
          <h2 className="mb-3 flex items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><KeyRound size={15} className="text-marca" />Licencias y cuentas · {lics.length}</span>
            {puedeEditar && lics.length > 0 && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={liberarTodas}><Undo2 size={13} />Liberar todas</button>}</h2>
          {lics.length === 0 ? <p className="text-sm text-emerald-700">No tiene licencias ni cuentas a su nombre.</p> : (
            <ul className="space-y-1">{lics.map(l => <li key={l.id} className="rounded-lg px-2 py-1.5 text-sm"><span className="block truncate">{l.licencias_software?.nombre}</span><span className="block truncate text-xs text-stone-500">{[l.cuenta, l.activos?.codigo, `desde ${fecha(l.asignada)}`].filter(Boolean).join(' · ')}</span></li>)}</ul>
          )}
          {lics.length > 0 && !puedeEditar && <p className="mt-2 text-xs text-stone-500">Un supervisor debe liberarlas.</p>}
        </section>
      </div>

      {puedeResguardar && (
        <section className="tarjeta mt-4 space-y-4 p-5">
          <h2 className="flex items-center gap-2 font-semibold"><FileCheck2 size={17} className="text-marca" />Carta de no adeudo de equipo</h2>
          <Campo label="Observaciones (opcional)"><textarea className="campo" rows={2} value={f.observaciones} onChange={e => setF({ ...f, observaciones: e.target.value })} placeholder="Ej. Entregó la laptop con cargador y mochila en buen estado." /></Campo>
          {emp.activo && <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.darBaja} onChange={e => setF({ ...f, darBaja: e.target.checked })} />Dar de baja al empleado en el mismo paso</label>
            {f.darBaja && <input className="campo" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} placeholder="Motivo (renuncia, término de obra…)" />}
          </div>}
          {error && <Aviso>{error}</Aviso>}
          <div className="flex justify-end"><button className="btn-primario" disabled={!limpio || enviando} onClick={emitir}><FileCheck2 size={16} />{enviando ? 'Emitiendo…' : 'Emitir carta'}</button></div>
        </section>
      )}

      {cartas.length > 0 && (
        <section className="tarjeta mt-4 p-4">
          <h2 className="mb-2 text-sm font-semibold">Cartas emitidas</h2>
          <ul className="space-y-1">{cartas.map(c => <li key={c.id}><button onClick={() => setParams({ carta: c.id })} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-100"><span className="font-mono text-xs text-marca">{c.folio}</span><span className="flex-1">{fecha(c.created_at)} · {nombres[c.emitida_por ?? ''] ?? '—'}</span><Printer size={14} className="text-stone-400" /></button></li>)}</ul>
        </section>
      )}
    </div>
  )
}

function CartaNoAdeudo({ carta, emp, emisor, onVolver }: { carta: Carta; emp: Emp; emisor: string; onVolver: () => void }) {
  const nombre = nombreEmpleado(emp)
  const empresa = emp.empresas?.razon_social || emp.empresas?.nombre || ''
  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onVolver} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Salida de {nombre}</button>
        <button className="btn-primario" onClick={() => window.print()}><Printer size={16} />Imprimir carta</button>
      </div>
      <article className="papel tarjeta mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed print:border-0 print:p-0">
        <header className="mb-6 flex items-start justify-between border-b-2 border-tinta pb-4">
          <div className="flex items-center gap-3"><LogoFirme className="h-9 w-auto text-black" /><div><p className="font-semibold">{empresa}</p><p className="text-xs text-stone-500">Departamento de TICS</p></div></div>
          <div className="text-right text-xs"><p className="font-mono text-sm font-semibold">{carta.folio}</p><p>{new Date(carta.created_at).toLocaleDateString('es-MX', { dateStyle: 'long' })}</p></div>
        </header>
        <h2 className="mb-6 text-center text-base font-semibold uppercase tracking-wide">Carta de no adeudo de equipo</h2>
        <p className="mb-4">A quien corresponda:</p>
        <p className="mb-4">
          Por medio de la presente, el Departamento de TICS hace constar que <b>{nombre}</b>{emp.puesto ? `, quien se desempeñó como ${emp.puesto}` : ''}{emp.codigo ? ` (No. de empleado ${emp.codigo})` : ''} en <b>{empresa}</b>,
          a la fecha de esta carta <b>no tiene a su cargo</b> equipo de cómputo, telefonía, herramienta, vehículos ni otros activos de la empresa, y no tiene licencias de software ni cuentas
          asignadas a su nombre en el control de activos.
        </p>
        {carta.devueltos.length > 0 && <>
          <p className="mb-2">En los últimos 90 días entregó lo siguiente:</p>
          <table className="mb-4 w-full border-collapse text-xs">
            <thead><tr className="border-y border-stone-400 bg-stone-50 text-left"><th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Código</th><th className="px-2 py-1.5">Descripción</th><th className="px-2 py-1.5">Fecha de entrega</th></tr></thead>
            <tbody>{carta.devueltos.map((d, i) => <tr key={i} className="border-b border-stone-200"><td className="px-2 py-1.5">{i + 1}</td><td className="whitespace-nowrap px-2 py-1.5 font-mono">{d.codigo}</td><td className="px-2 py-1.5">{d.descripcion}</td><td className="px-2 py-1.5">{fecha(d.fecha)}</td></tr>)}</tbody>
          </table>
        </>}
        {carta.observaciones && <p className="mb-4"><b>Observaciones:</b> {carta.observaciones}</p>}
        <p className="mb-4">Se extiende la presente para los fines que al interesado convengan.</p>
        <div className="mt-20 grid grid-cols-3 gap-6 text-center text-xs">
          <div className="border-t border-tinta pt-1"><p className="font-medium">{emisor}&nbsp;</p><p className="text-stone-500">Departamento de TICS</p></div>
          <div className="border-t border-tinta pt-1"><p className="font-medium">{nombre}</p><p className="text-stone-500">Empleado</p></div>
          <div className="border-t border-tinta pt-1"><p className="font-medium">&nbsp;</p><p className="text-stone-500">Recursos Humanos</p></div>
        </div>
      </article>
    </div>
  )
}
