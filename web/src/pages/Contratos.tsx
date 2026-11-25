import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSignature, Plus, Search, Pencil, FileSpreadsheet, X, Laptop, Trash2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, fecha } from '../lib/hooks'
import { libroExcel, descargar } from '../lib/excel'
import { Encabezado, Campo, Modal, Aviso, Cargando, Vacio } from '../components/ui'
import { BuscarActivo, type ActivoMini } from '../components/Buscadores'

export type Contrato = { id: string; empresa_id: string; empresa: string; proveedor_id: string | null; proveedor_txt: string | null; proveedor: string | null; tipo: string; nombre: string
  numero: string | null; inicio: string | null; vencimiento: string | null; avisar_dias: number; renovacion_automatica: boolean; contacto: string | null; notas: string | null; activo: boolean
  dias_restantes: number | null; estado: 'vencido' | 'por_vencer' | 'vigente' | 'sin_fecha'; equipos: number }

export const TIPOS_CONTRATO: Record<string, string> = { soporte: 'Soporte técnico', mantenimiento: 'Mantenimiento', arrendamiento: 'Arrendamiento', poliza: 'Póliza de seguro',
  garantia_extendida: 'Garantía extendida', servicio: 'Servicio', licencia: 'Licenciamiento', otro: 'Otro' }

export function estadoContrato(c: Pick<Contrato, 'estado' | 'dias_restantes' | 'vencimiento'>) {
  if (c.estado === 'sin_fecha') return { texto: 'Sin vencimiento', clase: 'bg-stone-100 text-stone-600 ring-stone-200' }
  if (c.estado === 'vencido') return { texto: `Venció hace ${-(c.dias_restantes ?? 0)} d`, clase: 'bg-red-50 text-red-700 ring-red-200' }
  if (c.estado === 'por_vencer') return { texto: `Vence en ${c.dias_restantes} d`, clase: 'bg-amber-50 text-amber-800 ring-amber-200' }
  return { texto: `Vence ${fecha(c.vencimiento)}`, clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
}

/** Contratos de soporte, mantenimiento, arrendamiento y pólizas: qué equipos cubren y cuándo vencen (sin montos). */
export default function Contratos() {
  const { puedeEditar } = useAuth()
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const [lista, setLista] = useState<Contrato[] | null>(null)
  const [q, setQ] = useState(''); const [tipo, setTipo] = useState(''); const [estado, setEstado] = useState(''); const [empresa, setEmpresa] = useState('')
  const [editar, setEditar] = useState<Contrato | 'nuevo' | null>(null)
  const [n, setN] = useState(0)

  useEffect(() => { supabase.from('v_contratos').select('*').eq('activo', true).order('vencimiento', { nullsFirst: false }).then(({ data }) => setLista((data as Contrato[]) ?? [])) }, [n])

  const vis = useMemo(() => (lista ?? []).filter(c => (!tipo || c.tipo === tipo) && (!estado || c.estado === estado) && (!empresa || c.empresa_id === empresa)
    && (!q || `${c.nombre} ${c.numero ?? ''} ${c.proveedor ?? ''} ${c.contacto ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [lista, q, tipo, estado, empresa])
  if (!lista) return <Cargando />
  const cuenta = (e: string) => lista.filter(c => c.estado === e).length

  function excel() {
    descargar(libroExcel<Contrato>([{ nombre: 'Contratos', columnas: [
      { titulo: 'Contrato', valor: c => c.nombre, ancho: 32 }, { titulo: 'Tipo', valor: c => TIPOS_CONTRATO[c.tipo] ?? c.tipo, ancho: 18 }, { titulo: 'Empresa', valor: c => c.empresa, ancho: 24 },
      { titulo: 'Proveedor', valor: c => c.proveedor, ancho: 24 }, { titulo: 'Número / póliza', valor: c => c.numero, ancho: 18 }, { titulo: 'Inicio', valor: c => c.inicio },
      { titulo: 'Vencimiento', valor: c => c.vencimiento }, { titulo: 'Días restantes', valor: c => c.dias_restantes }, { titulo: 'Renovación automática', valor: c => c.renovacion_automatica ? 'Sí' : 'No' },
      { titulo: 'Equipos cubiertos', valor: c => c.equipos }, { titulo: 'Contacto', valor: c => c.contacto, ancho: 26 }, { titulo: 'Notas', valor: c => c.notas, ancho: 30 }],
      filas: vis }]), `contratos-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      <Encabezado titulo="Contratos y pólizas" sub="Soporte, mantenimiento, arrendamiento, pólizas de seguro y garantías extendidas: qué equipos cubren y cuándo vencen. Avisa por correo antes del vencimiento."
        acciones={<div className="flex gap-2"><button className="btn-sec" onClick={excel} disabled={!vis.length}><FileSpreadsheet size={16} />Excel</button>
          {puedeEditar && <button className="btn-primario" onClick={() => setEditar('nuevo')}><Plus size={16} />Nuevo contrato</button>}</div>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['vigente', 'Vigentes', ''], ['por_vencer', 'Por vencer', 'text-amber-700'], ['vencido', 'Vencidos', 'text-red-700'], ['sin_fecha', 'Sin vencimiento', '']] as const).map(([e, t, c]) => (
          <button key={e} onClick={() => setEstado(x => x === e ? '' : e)} className={`tarjeta p-4 text-left transition hover:border-marca/50 ${estado === e ? 'ring-2 ring-marca' : ''}`}>
            <p className={`cifra text-3xl font-semibold ${cuenta(e) ? c : ''}`}>{cuenta(e)}</p><p className="text-xs text-stone-500">{t}</p></button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !pl-9" placeholder="Buscar contrato, número, proveedor…" value={q} onChange={e => setQ(e.target.value)} /></label>
        <select className="campo !w-auto" value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos los tipos</option>{Object.entries(TIPOS_CONTRATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="campo !w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas las empresas</option>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select>
      </div>

      {vis.length === 0 ? <Vacio titulo={lista.length ? 'Nada con esos filtros' : 'Sin contratos todavía'} texto="Da de alta los contratos de soporte, arrendamiento de equipo, pólizas de seguro de vehículos y garantías extendidas para que el sistema te avise antes de que venzan."
        accion={puedeEditar && !lista.length ? <button className="btn-primario" onClick={() => setEditar('nuevo')}><Plus size={16} />Nuevo contrato</button> : undefined} /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {vis.map(c => { const est = estadoContrato(c); return (
            <article key={c.id} className="tarjeta flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-marca">{TIPOS_CONTRATO[c.tipo] ?? c.tipo}</p><h3 className="font-semibold leading-snug">{c.nombre}</h3></div>
                {puedeEditar && <button aria-label="Editar" className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-marca" onClick={() => setEditar(c)}><Pencil size={15} /></button>}
              </div>
              <p className="text-sm text-stone-600">{c.proveedor || 'Sin proveedor'}{c.numero ? <span className="text-stone-400"> · No. {c.numero}</span> : null}</p>
              <p className="text-xs text-stone-500">{c.empresa}{c.inicio ? ` · desde ${fecha(c.inicio)}` : ''}</p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${est.clase}`}>{est.texto}</span>
                {c.renovacion_automatica && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 ring-1 ring-sky-200">Se renueva solo</span>}
                <span className="inline-flex items-center gap-1 text-[11px] text-stone-500"><Laptop size={12} />{c.equipos} equipo{c.equipos === 1 ? '' : 's'}</span>
              </div>
            </article>) })}
        </div>
      )}
      {editar && <EditarContrato c={editar === 'nuevo' ? null : editar} empresas={empresas} onCerrar={() => setEditar(null)} onListo={() => { setEditar(null); setN(x => x + 1) }} />}
    </div>
  )
}

type Cubierto = { id: string; codigo: string; descripcion: string }

function EditarContrato({ c, empresas, onCerrar, onListo }: { c: Contrato | null; empresas: { id: string; nombre: string; nombre_corto?: unknown }[]; onCerrar: () => void; onListo: () => void }) {
  const { items: proveedores } = useLista('proveedores', 'id,nombre')
  const [f, setF] = useState({ empresa_id: c?.empresa_id ?? (empresas.length === 1 ? empresas[0].id : ''), nombre: c?.nombre ?? '', tipo: c?.tipo ?? 'soporte',
    proveedor_id: c?.proveedor_id ?? '', proveedor_txt: c?.proveedor_txt ?? '', numero: c?.numero ?? '', inicio: c?.inicio ?? '', vencimiento: c?.vencimiento ?? '',
    avisar_dias: String(c?.avisar_dias ?? 30), renovacion_automatica: c?.renovacion_automatica ?? false, contacto: c?.contacto ?? '', notas: c?.notas ?? '' })
  const [equipos, setEquipos] = useState<Cubierto[]>([])
  const [orig, setOrig] = useState<string[]>([])
  const [buscar, setBuscar] = useState<ActivoMini | null>(null)
  const [err, setErr] = useState(''); const [guardando, setGuardando] = useState(false); const [borrar, setBorrar] = useState(false)

  useEffect(() => {
    if (!c) return
    supabase.from('contrato_activos').select('activo_id, activos(id,codigo,descripcion)').eq('contrato_id', c.id).then(({ data }) => {
      const l = ((data ?? []) as unknown as { activos: Cubierto | null }[]).map(r => r.activos).filter((x): x is Cubierto => !!x)
      setEquipos(l); setOrig(l.map(x => x.id))
    })
  }, [c])
  useEffect(() => { if (buscar) { setEquipos(l => l.some(x => x.id === buscar.id) ? l : [...l, { id: buscar.id, codigo: buscar.codigo, descripcion: buscar.descripcion }]); setBuscar(null) } }, [buscar])

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!f.empresa_id || !f.nombre.trim()) { setErr('Empresa y nombre son obligatorios.'); return }
    if (f.inicio && f.vencimiento && f.vencimiento < f.inicio) { setErr('El vencimiento no puede ser antes del inicio.'); return }
    setGuardando(true)
    const fila = { empresa_id: f.empresa_id, nombre: f.nombre.trim(), tipo: f.tipo, proveedor_id: f.proveedor_id || null, proveedor_txt: f.proveedor_id ? null : (f.proveedor_txt.trim() || null),
      numero: f.numero.trim() || null, inicio: f.inicio || null, vencimiento: f.vencimiento || null, avisar_dias: Math.min(365, Math.max(0, Number(f.avisar_dias) || 30)),
      renovacion_automatica: f.renovacion_automatica, contacto: f.contacto.trim() || null, notas: f.notas.trim() || null, updated_at: new Date().toISOString() }
    const r = c ? await supabase.from('contratos').update(fila).eq('id', c.id).select('id').single() : await supabase.from('contratos').insert(fila).select('id').single()
    if (r.error) { setGuardando(false); setErr(mensajeError(r.error)); return }
    const id = (r.data as { id: string }).id, ids = equipos.map(x => x.id)
    const quitar = orig.filter(x => !ids.includes(x)), poner = ids.filter(x => !orig.includes(x))
    if (quitar.length) { const { error } = await supabase.from('contrato_activos').delete().eq('contrato_id', id).in('activo_id', quitar); if (error) { setGuardando(false); setErr(mensajeError(error)); return } }
    if (poner.length) { const { error } = await supabase.from('contrato_activos').insert(poner.map(a => ({ contrato_id: id, activo_id: a }))); if (error) { setGuardando(false); setErr(mensajeError(error)); return } }
    setGuardando(false); onListo()
  }
  async function eliminar() {
    if (!c) return
    const { error } = await supabase.from('contratos').update({ activo: false }).eq('id', c.id)
    if (error) setErr(mensajeError(error)); else onListo()
  }

  return (
    <Modal abierto titulo={c ? 'Editar contrato' : 'Nuevo contrato'} onCerrar={onCerrar} ancho="max-w-3xl">
      <form onSubmit={guardar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombre del contrato *" className="sm:col-span-2"><input className="campo" required placeholder="Soporte de impresoras, póliza de flotilla 2027…" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo>
          <Campo label="Tipo"><select className="campo" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS_CONTRATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo label="Empresa *"><select className="campo" required value={f.empresa_id} onChange={e => setF({ ...f, empresa_id: e.target.value })}><option value="">Elige…</option>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select></Campo>
          <Campo label="Proveedor"><select className="campo" value={f.proveedor_id} onChange={e => setF({ ...f, proveedor_id: e.target.value })}><option value="">Otro (escribir)</option>{proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
          {!f.proveedor_id ? <Campo label="Nombre del proveedor"><input className="campo" value={f.proveedor_txt} onChange={e => setF({ ...f, proveedor_txt: e.target.value })} /></Campo> : <div className="hidden sm:block" />}
          <Campo label="Número de contrato o póliza"><input className="campo" value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} /></Campo>
          <Campo label="Contacto del proveedor"><input className="campo" placeholder="Nombre, teléfono o correo" value={f.contacto} onChange={e => setF({ ...f, contacto: e.target.value })} /></Campo>
          <Campo label="Inicio"><input type="date" className="campo" value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} /></Campo>
          <Campo label="Vencimiento"><input type="date" className="campo" value={f.vencimiento} onChange={e => setF({ ...f, vencimiento: e.target.value })} /></Campo>
          <Campo label="Avisar con (días de anticipación)"><input type="number" min={0} max={365} className="campo" value={f.avisar_dias} onChange={e => setF({ ...f, avisar_dias: e.target.value })} /></Campo>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.renovacion_automatica} onChange={e => setF({ ...f, renovacion_automatica: e.target.checked })} />Se renueva automáticamente</label>
          <Campo label="Notas" className="sm:col-span-2"><textarea className="campo" rows={2} placeholder="Qué cubre, exclusiones, cómo pedir servicio…" value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} /></Campo>
        </div>
        <div className="rounded-xl border border-stone-200 p-3">
          <p className="mb-2 text-sm font-medium">Equipos que cubre ({equipos.length})</p>
          <BuscarActivo valor={buscar} onElegir={setBuscar} placeholder="Agregar equipo por código, serie o placa…" />
          {equipos.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">{equipos.map(x => (
            <li key={x.id} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-0.5 pl-2.5 pr-1 text-xs"><span className="font-mono text-marca">{x.codigo}</span> {x.descripcion}
              <button type="button" aria-label="Quitar" className="rounded-full p-0.5 hover:bg-stone-200" onClick={() => setEquipos(l => l.filter(y => y.id !== x.id))}><X size={12} /></button></li>))}</ul>}
        </div>
        {err && <Aviso>{err}</Aviso>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {c ? (borrar ? <span className="flex items-center gap-2 text-sm">¿Quitar este contrato?<button type="button" className="btn-sec !text-red-600" onClick={eliminar}>Sí, quitar</button><button type="button" className="btn-sec" onClick={() => setBorrar(false)}>No</button></span>
            : <button type="button" className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-red-600" onClick={() => setBorrar(true)}><Trash2 size={14} />Quitar contrato</button>) : <span />}
          <div className="flex gap-2"><button type="button" className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button></div>
        </div>
      </form>
    </Modal>
  )
}

/** Contratos y pólizas que cubren un equipo, en su ficha. */
export function ContratosActivo({ activoId }: { activoId: string }) {
  const [l, setL] = useState<Contrato[] | null>(null)
  useEffect(() => {
    supabase.from('contrato_activos').select('contrato_id').eq('activo_id', activoId).then(async ({ data }) => {
      const ids = (data ?? []).map((r: { contrato_id: string }) => r.contrato_id)
      if (!ids.length) { setL([]); return }
      const { data: cs } = await supabase.from('v_contratos').select('*').in('id', ids).eq('activo', true)
      setL((cs as Contrato[]) ?? [])
    })
  }, [activoId])
  if (!l || !l.length) return null
  return (
    <section className="tarjeta p-5">
      <h2 className="mb-3 flex items-center justify-between gap-2 font-semibold"><span className="flex items-center gap-2"><FileSignature size={17} className="text-marca" />Contratos y pólizas</span><Link to="/contratos" className="text-xs font-normal text-marca hover:underline">Ver todos</Link></h2>
      <ul className="space-y-2">{l.map(c => { const est = estadoContrato(c); return (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="min-w-0"><b className="font-medium">{c.nombre}</b><span className="block text-xs text-stone-500">{TIPOS_CONTRATO[c.tipo]} · {c.proveedor || 'Sin proveedor'}{c.contacto ? ` · ${c.contacto}` : ''}</span></span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${est.clase}`}>{est.texto}</span></li>) })}</ul>
    </section>
  )
}
