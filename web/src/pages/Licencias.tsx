import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ImportarLicencias } from '../components/Importadores'
import { Upload } from 'lucide-react'
import { KeyRound, Plus, Search, FileSpreadsheet, Pencil, UserPlus, Undo2, Laptop, AtSign, Check } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, nombreEmpleado, fecha } from '../lib/hooks'
import { libroExcel, descargar } from '../lib/excel'
import { Encabezado, Campo, Modal, Aviso, Cargando, Vacio } from '../components/ui'
import { BuscarActivo, BuscarEmpleado, type ActivoMini, type EmpleadoMini } from '../components/Buscadores'

export type Licencia = { id: string; empresa_id: string; empresa: string; nombre: string; fabricante: string | null; tipo: string; asientos: number | null; fecha_inicio: string | null
  fecha_vencimiento: string | null; renovacion_automatica: boolean; proveedor: string | null; referencia: string | null; notas: string | null; activo: boolean; usados: number; dias_restantes: number | null }
type Asig = { id: string; licencia_id: string; empleado_id: string | null; activo_id: string | null; cuenta: string | null; asignada: string; liberada: string | null; notas: string | null
  empleados: { nombres: string; apellidos: string | null; puesto: string | null } | null; activos: { codigo: string; descripcion: string } | null }

export const TIPOS_LIC: Record<string, string> = { suscripcion: 'Suscripción', perpetua: 'Perpetua', cuenta: 'Cuenta / correo', dominio: 'Dominio / hosting', otro: 'Otro' }
const SUGERIDOS = ['Microsoft 365 Business Basic', 'Microsoft 365 Business Standard', 'Windows 11 Pro', 'Office Hogar y Empresas', 'ESET Endpoint', 'AutoCAD', 'Adobe Acrobat Pro', 'Google Workspace', 'Antivirus', 'Correo corporativo']

export function vence(l: { fecha_vencimiento: string | null; dias_restantes: number | null }) {
  if (!l.fecha_vencimiento || l.dias_restantes == null) return { texto: 'Sin vencimiento', clase: 'bg-stone-100 text-stone-600 ring-stone-200' }
  if (l.dias_restantes < 0) return { texto: `Venció hace ${-l.dias_restantes} d`, clase: 'bg-red-50 text-red-700 ring-red-200' }
  if (l.dias_restantes <= 30) return { texto: `Vence en ${l.dias_restantes} d`, clase: 'bg-amber-50 text-amber-800 ring-amber-200' }
  return { texto: `Vence ${fecha(l.fecha_vencimiento)}`, clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
}

/** Licencias de software y cuentas: cuántos lugares hay, quién las usa y cuándo vencen. */
export default function Licencias() {
  const { puedeEditar } = useAuth()
  const [params] = useSearchParams()
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const [lista, setLista] = useState<Licencia[] | null>(null)
  const [q, setQ] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [filtro, setFiltro] = useState<'todas' | 'vencer' | 'llenas'>('todas')
  const [editar, setEditar] = useState<Licencia | 'nueva' | null>(null)
  const [abrir, setAbrir] = useState<Licencia | null>(null)
  const [n, setN] = useState(0)
  const [importar, setImportar] = useState(false)

  useEffect(() => {
    supabase.from('v_licencias').select('*').eq('activo', true).order('nombre').then(({ data }) => {
      const l = (data as Licencia[]) ?? []
      setLista(l)
      const id = params.get('id'); if (id && !abrir) { const x = l.find(y => y.id === id); if (x) setAbrir(x) }
      if (abrir) setAbrir(l.find(y => y.id === abrir.id) ?? null)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])

  const vis = useMemo(() => (lista ?? []).filter(l =>
    (!empresa || l.empresa_id === empresa) &&
    (!q || `${l.nombre} ${l.fabricante ?? ''} ${l.proveedor ?? ''} ${l.referencia ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
    (filtro === 'todas' || (filtro === 'vencer' ? l.dias_restantes != null && l.dias_restantes <= 30 : l.asientos != null && l.usados >= l.asientos))), [lista, q, empresa, filtro])

  const tot = useMemo(() => ({
    lugares: (lista ?? []).reduce((s, l) => s + (l.asientos ?? 0), 0), usados: (lista ?? []).reduce((s, l) => s + l.usados, 0),
    vencer: (lista ?? []).filter(l => l.dias_restantes != null && l.dias_restantes <= 30).length,
  }), [lista])

  async function excel() {
    const { data } = await supabase.from('licencia_asignaciones').select('*,empleados(nombres,apellidos,puesto),activos(codigo,descripcion)').is('liberada', null)
    const asig = (data as Asig[]) ?? []
    const nombre = new Map((lista ?? []).map(l => [l.id, l]))
    descargar(libroExcel<Licencia | Asig>([
      { nombre: 'Licencias', titulo: 'Licencias de software y cuentas', filas: vis, columnas: [
        { titulo: 'Licencia', valor: l => (l as Licencia).nombre, ancho: 34 }, { titulo: 'Fabricante', valor: l => (l as Licencia).fabricante },
        { titulo: 'Empresa', valor: l => (l as Licencia).empresa }, { titulo: 'Tipo', valor: l => TIPOS_LIC[(l as Licencia).tipo] },
        { titulo: 'Lugares', valor: l => (l as Licencia).asientos ?? 'Sin límite' }, { titulo: 'En uso', valor: l => (l as Licencia).usados },
        { titulo: 'Vence', valor: l => fecha((l as Licencia).fecha_vencimiento) }, { titulo: 'Renovación automática', valor: l => (l as Licencia).renovacion_automatica ? 'Sí' : 'No' },
        { titulo: 'Proveedor', valor: l => (l as Licencia).proveedor }, { titulo: 'Referencia', valor: l => (l as Licencia).referencia },
      ] },
      { nombre: 'Asignaciones', titulo: 'Quién usa cada licencia', filas: asig.filter(a => vis.some(l => l.id === a.licencia_id)), columnas: [
        { titulo: 'Licencia', valor: a => nombre.get((a as Asig).licencia_id)?.nombre, ancho: 34 }, { titulo: 'Empleado', valor: a => nombreEmpleado((a as Asig).empleados) },
        { titulo: 'Puesto', valor: a => (a as Asig).empleados?.puesto }, { titulo: 'Cuenta', valor: a => (a as Asig).cuenta },
        { titulo: 'Equipo', valor: a => (a as Asig).activos ? `${(a as Asig).activos!.codigo} ${(a as Asig).activos!.descripcion}` : '' }, { titulo: 'Desde', valor: a => fecha((a as Asig).asignada) },
      ] },
    ]), 'licencias.xlsx')
  }

  return (
    <div>
      <Encabezado titulo="Licencias y cuentas" sub="Software, suscripciones y cuentas: cuántos lugares hay, quién los usa y cuándo vencen."
        acciones={<>
          <button className="btn-sec" onClick={excel} disabled={!vis.length}><FileSpreadsheet size={16} />Excel</button>
          {puedeEditar && <button className="btn-sec" onClick={() => setImportar(true)}><Upload size={16} />Importar Excel</button>}
          {puedeEditar && <button className="btn-primario" onClick={() => setEditar('nueva')}><Plus size={16} />Nueva licencia</button>}
        </>} />
      {importar && <ImportarLicencias abierto onCerrar={() => setImportar(false)} onListo={() => { setImportar(false); setN(x => x + 1) }} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="tarjeta p-4"><p className="text-[11px] uppercase tracking-wider text-stone-500">Licencias</p><p className="cifra text-3xl font-semibold">{lista?.length ?? '—'}</p></div>
        <div className="tarjeta p-4"><p className="text-[11px] uppercase tracking-wider text-stone-500">Lugares en uso</p><p className="cifra text-3xl font-semibold">{tot.usados}<span className="text-base text-stone-400"> / {tot.lugares || '—'}</span></p></div>
        <button className="tarjeta p-4 text-left" onClick={() => setFiltro(filtro === 'vencer' ? 'todas' : 'vencer')}><p className="text-[11px] uppercase tracking-wider text-stone-500">Vencen en 30 días</p><p className={`cifra text-3xl font-semibold ${tot.vencer ? 'text-amber-600' : ''}`}>{tot.vencer}</p></button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !pl-9" placeholder="Buscar licencia, fabricante, proveedor…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="campo !w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas las empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select>
        <div className="flex overflow-hidden rounded-xl border border-stone-200 text-sm">
          {([['todas', 'Todas'], ['vencer', 'Por vencer'], ['llenas', 'Sin lugares']] as const).map(([k, t]) => <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-2 ${filtro === k ? 'bg-marca/15 text-marca' : 'text-stone-500 hover:bg-stone-100'}`}>{t}</button>)}
        </div>
      </div>

      {!lista ? <Cargando /> : vis.length === 0 ? <div className="tarjeta"><Vacio titulo={lista.length ? 'Nada con ese filtro' : 'Aún no hay licencias'} texto="Registra Microsoft 365, antivirus, AutoCAD, correos o dominios para saber quién los tiene y cuándo vencen."
        accion={puedeEditar && !lista.length ? <button className="btn-primario" onClick={() => setEditar('nueva')}><Plus size={16} />Nueva licencia</button> : undefined} /></div> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {vis.map(l => {
            const v = vence(l); const pct = l.asientos ? Math.min(100, Math.round(l.usados / l.asientos * 100)) : 0
            return (
              <button key={l.id} onClick={() => setAbrir(l)} className="tarjeta viva p-4 text-left transition hover:border-marca/40">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-marca/10 text-marca"><KeyRound size={18} /></span>
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{l.nombre}</p><p className="truncate text-xs text-stone-500">{[l.fabricante, l.empresa, TIPOS_LIC[l.tipo]].filter(Boolean).join(' · ')}</p></div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs"><span className="text-stone-500">{l.asientos == null ? `${l.usados} en uso · sin límite` : `${l.usados} de ${l.asientos} en uso`}</span>
                  <span className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${v.clase}`}>{v.texto}</span></div>
                {l.asientos != null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-marca'}`} style={{ width: `${pct}%` }} /></div>}
              </button>
            )
          })}
        </div>
      )}

      {editar && <EditarLicencia lic={editar === 'nueva' ? null : editar} empresas={empresas} onCerrar={() => setEditar(null)} onListo={() => { setEditar(null); setN(x => x + 1) }} />}
      {abrir && <DetalleLicencia lic={abrir} puedeEditar={puedeEditar} onCerrar={() => setAbrir(null)} onEditar={() => { setEditar(abrir) }} onCambio={() => setN(x => x + 1)} />}
    </div>
  )
}

function EditarLicencia({ lic, empresas, onCerrar, onListo }: { lic: Licencia | null; empresas: { id: string; nombre: string; nombre_corto?: unknown }[]; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({
    empresa_id: lic?.empresa_id ?? (empresas.length === 1 ? empresas[0].id : ''), nombre: lic?.nombre ?? '', fabricante: lic?.fabricante ?? '', tipo: lic?.tipo ?? 'suscripcion',
    asientos: lic?.asientos?.toString() ?? '', fecha_inicio: lic?.fecha_inicio ?? '', fecha_vencimiento: lic?.fecha_vencimiento ?? '', renovacion_automatica: lic?.renovacion_automatica ?? false,
    proveedor: lic?.proveedor ?? '', referencia: lic?.referencia ?? '', notas: lic?.notas ?? '',
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!f.empresa_id) return setError('Elige la empresa.')
    setGuardando(true)
    const fila = { ...f, nombre: f.nombre.trim(), fabricante: f.fabricante.trim() || null, asientos: f.asientos === '' ? null : Number(f.asientos), fecha_inicio: f.fecha_inicio || null,
      fecha_vencimiento: f.fecha_vencimiento || null, proveedor: f.proveedor.trim() || null, referencia: f.referencia.trim() || null, notas: f.notas.trim() || null }
    const { error } = lic ? await supabase.from('licencias_software').update(fila).eq('id', lic.id) : await supabase.from('licencias_software').insert(fila)
    setGuardando(false)
    if (error) setError(mensajeError(error)); else onListo()
  }
  async function archivar() {
    if (!lic) return
    if (lic.usados) return setError('Primero libera los lugares en uso.')
    const { error } = await supabase.from('licencias_software').update({ activo: false }).eq('id', lic.id)
    if (error) setError(mensajeError(error)); else onListo()
  }
  return (
    <Modal abierto titulo={lic ? 'Editar licencia' : 'Nueva licencia'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Licencia o cuenta *" className="sm:col-span-2"><input className="campo" required list="lic-sug" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Microsoft 365 Business Standard" />
            <datalist id="lic-sug">{SUGERIDOS.map(s => <option key={s} value={s} />)}</datalist></Campo>
          <Campo label="Empresa *"><select className="campo" required value={f.empresa_id} onChange={e => setF({ ...f, empresa_id: e.target.value })}><option value="">Elige…</option>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select></Campo>
          <Campo label="Tipo"><select className="campo" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS_LIC).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Campo>
          <Campo label="Fabricante"><input className="campo" value={f.fabricante} onChange={e => setF({ ...f, fabricante: e.target.value })} placeholder="Microsoft, ESET, Autodesk…" /></Campo>
          <Campo label="Lugares (vacío = sin límite)"><input className="campo" type="number" min="0" inputMode="numeric" value={f.asientos} onChange={e => setF({ ...f, asientos: e.target.value })} placeholder="Ej. 25" /></Campo>
          <Campo label="Inicio"><input className="campo" type="date" value={f.fecha_inicio} onChange={e => setF({ ...f, fecha_inicio: e.target.value })} /></Campo>
          <Campo label="Vencimiento / renovación"><input className="campo" type="date" value={f.fecha_vencimiento} onChange={e => setF({ ...f, fecha_vencimiento: e.target.value })} /></Campo>
          <Campo label="Proveedor"><input className="campo" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} /></Campo>
          <Campo label="Contrato, pedido o portal"><input className="campo" value={f.referencia} onChange={e => setF({ ...f, referencia: e.target.value })} placeholder="No. de contrato o tenant" /></Campo>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.renovacion_automatica} onChange={e => setF({ ...f, renovacion_automatica: e.target.checked })} />Se renueva sola</label>
          <Campo label="Notas" className="sm:col-span-2"><textarea className="campo" rows={2} value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} /></Campo>
        </div>
        <p className="text-xs text-stone-500">No guardes contraseñas ni claves de producto aquí; solo la referencia para encontrarlas.</p>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex flex-wrap justify-between gap-2">
          {lic ? <button type="button" className="btn-sec hover:!text-red-700" onClick={archivar}>Archivar</button> : <span />}
          <div className="flex gap-2"><button type="button" className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando}><Check size={15} />{guardando ? 'Guardando…' : 'Guardar'}</button></div>
        </div>
      </form>
    </Modal>
  )
}

function DetalleLicencia({ lic, puedeEditar, onCerrar, onEditar, onCambio }: { lic: Licencia; puedeEditar: boolean; onCerrar: () => void; onEditar: () => void; onCambio: () => void }) {
  const [asig, setAsig] = useState<Asig[] | null>(null)
  const [verLib, setVerLib] = useState(false)
  const [emp, setEmp] = useState<EmpleadoMini | null>(null)
  const [act, setAct] = useState<ActivoMini | null>(null)
  const [cuenta, setCuenta] = useState('')
  const [error, setError] = useState('')
  const [n, setN] = useState(0)
  useEffect(() => {
    supabase.from('licencia_asignaciones').select('*,empleados(nombres,apellidos,puesto),activos(codigo,descripcion)').eq('licencia_id', lic.id).order('asignada', { ascending: false })
      .then(({ data }) => setAsig((data as Asig[]) ?? []))
  }, [lic.id, n])
  const activas = (asig ?? []).filter(a => !a.liberada)
  const libres = lic.asientos == null ? null : lic.asientos - activas.length
  const v = vence(lic)

  async function asignar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!emp && !act && !cuenta.trim()) return setError('Elige un empleado, un equipo o escribe la cuenta.')
    const { error } = await supabase.from('licencia_asignaciones').insert({ licencia_id: lic.id, empleado_id: emp?.id ?? null, activo_id: act?.id ?? null, cuenta: cuenta.trim() || null })
    if (error) return setError(mensajeError(error))
    setEmp(null); setAct(null); setCuenta(''); setN(x => x + 1); onCambio()
  }
  async function liberar(a: Asig) {
    const { error } = await supabase.from('licencia_asignaciones').update({ liberada: new Date().toISOString().slice(0, 10) }).eq('id', a.id)
    if (error) setError(mensajeError(error)); else { setN(x => x + 1); onCambio() }
  }

  return (
    <Modal abierto titulo={lic.nombre} onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-600">{lic.empresa}</span>
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-600">{TIPOS_LIC[lic.tipo]}</span>
        <span className={`rounded-full px-2.5 py-0.5 ring-1 ring-inset ${v.clase}`}>{v.texto}{lic.renovacion_automatica ? ' · se renueva sola' : ''}</span>
        <span className="rounded-full bg-marca/15 px-2.5 py-0.5 font-medium text-marca">{libres == null ? `${activas.length} en uso` : `${libres} libre(s) de ${lic.asientos}`}</span>
        {puedeEditar && <button className="btn-sec ml-auto !px-3 !py-1.5 text-xs" onClick={onEditar}><Pencil size={13} />Editar</button>}
      </div>
      {(lic.proveedor || lic.referencia || lic.notas) && <p className="mb-4 text-sm text-stone-600">{[lic.proveedor && `Proveedor: ${lic.proveedor}`, lic.referencia && `Ref.: ${lic.referencia}`, lic.notas].filter(Boolean).join(' · ')}</p>}

      {puedeEditar && (libres == null || libres > 0) && (
        <form onSubmit={asignar} className="mb-5 rounded-xl border border-stone-200 p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium"><UserPlus size={15} className="text-marca" />Asignar un lugar</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Empleado"><BuscarEmpleado valor={emp} onElegir={setEmp} empresaId={lic.empresa_id} /></Campo>
            <Campo label="Equipo (opcional)"><BuscarActivo valor={act} onElegir={setAct} placeholder="Laptop o PC…" /></Campo>
            <Campo label="Cuenta o correo"><input className="campo" value={cuenta} onChange={e => setCuenta(e.target.value)} placeholder="nombre@empresa.com" /></Campo>
          </div>
          {error && <div className="mt-2"><Aviso>{error}</Aviso></div>}
          <div className="mt-3 flex justify-end"><button className="btn-primario"><Check size={15} />Asignar</button></div>
        </form>
      )}
      {libres === 0 && <div className="mb-4"><Aviso tipo="info">Todos los lugares están en uso. Libera uno o aumenta los lugares de la licencia.</Aviso></div>}

      {!asig ? <Cargando /> : activas.length === 0 ? <p className="py-6 text-center text-sm text-stone-500">Nadie la tiene asignada.</p> : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200">
          {activas.map(a => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.empleados ? <Link to={`/empleados/${a.empleado_id}`} className="hover:text-marca">{nombreEmpleado(a.empleados)}</Link> : a.cuenta || a.activos?.descripcion}</p>
                <p className="flex flex-wrap gap-x-3 truncate text-xs text-stone-500">
                  {a.cuenta && a.empleados && <span className="inline-flex items-center gap-1"><AtSign size={11} />{a.cuenta}</span>}
                  {a.activos && <span className="inline-flex items-center gap-1"><Laptop size={11} /><span className="font-mono">{a.activos.codigo}</span> {a.activos.descripcion}</span>}
                  <span>desde {fecha(a.asignada)}</span>
                </p>
              </div>
              {puedeEditar && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => liberar(a)}><Undo2 size={13} />Liberar</button>}
            </li>
          ))}
        </ul>
      )}
      {(asig ?? []).some(a => a.liberada) && (
        <div className="mt-4">
          <button className="text-xs text-stone-500 hover:text-marca" onClick={() => setVerLib(!verLib)}>{verLib ? 'Ocultar' : 'Ver'} historial ({(asig ?? []).filter(a => a.liberada).length})</button>
          {verLib && <ul className="mt-2 space-y-1 text-xs text-stone-500">{(asig ?? []).filter(a => a.liberada).map(a => <li key={a.id}>{nombreEmpleado(a.empleados) || a.cuenta || a.activos?.codigo} · {fecha(a.asignada)} → {fecha(a.liberada)}</li>)}</ul>}
        </div>
      )}
    </Modal>
  )
}
