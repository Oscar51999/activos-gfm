import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PackageMinus, Plus, Trash2, ShieldAlert, Cog } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Aviso, Modal, Campo } from './ui'
import { num, plural, type Consumible, type Existencia } from '../lib/almacen'

type Mov = { id: string; cantidad: number; lote: string | null; created_at: string; consumibles: { nombre: string; unidad: string } | null; ubicaciones: { nombre: string } | null }
type Lote = { consumible_id: string; ubicacion_id: string | null; lote: string | null; caducidad: string | null; existencia: number }

/** Refacciones que salen del almacén para una orden de trabajo (se descuentan de la existencia). */
export function RefaccionesOT({ otId, folio, empresaId, abierta }: { otId: string; folio: string; empresaId: string; abierta: boolean }) {
  const { puedeResguardar } = useAuth()
  const [movs, setMovs] = useState<Mov[]>([])
  const [agregar, setAgregar] = useState(false)
  const cargar = () => { supabase.from('movimientos_consumible').select('id,cantidad,lote,created_at,consumibles(nombre,unidad),ubicaciones(nombre)').eq('ot_id', otId).eq('tipo', 'salida').order('created_at').then(({ data }) => setMovs((data as unknown as Mov[]) ?? [])) }
  useEffect(cargar, [otId]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="tarjeta p-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><PackageMinus size={17} className="text-marca" />Refacciones del almacén</h2>
        {puedeResguardar && abierta && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => setAgregar(true)}><Plus size={14} />Sacar del almacén</button>}</div>
      {movs.length === 0 ? <p className="text-sm text-stone-500">Ninguna. Lo que saques aquí se descuenta del almacén y queda ligado a esta orden.</p> : (
        <ul className="space-y-1.5 text-sm">{movs.map(m => <li key={m.id} className="flex items-center gap-2"><span className="cifra w-10 text-right font-semibold">{num(m.cantidad)}</span><span className="min-w-0 flex-1 truncate">{m.consumibles?.nombre} <span className="text-xs text-stone-500">{m.consumibles ? plural(m.consumibles.unidad, m.cantidad) : ''}{m.lote ? ` · lote ${m.lote}` : ''}</span></span><span className="text-[11px] text-stone-400">{m.ubicaciones?.nombre}</span></li>)}</ul>
      )}
      {agregar && <SacarRefaccion otId={otId} folio={folio} empresaId={empresaId} onCerrar={() => setAgregar(false)} onListo={() => { setAgregar(false); cargar() }} />}
    </section>
  )
}

function SacarRefaccion({ otId, folio, empresaId, onCerrar, onListo }: { otId: string; folio: string; empresaId: string; onCerrar: () => void; onListo: () => void }) {
  const [cons, setCons] = useState<Consumible[]>([])
  const [ex, setEx] = useState<Existencia[]>([])
  const [lotes, setLotes] = useState<Lote[]>([])
  const [c, setC] = useState(''), [lugar, setLugar] = useState(''), [lote, setLote] = useState(''), [cant, setCant] = useState('1')
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.from('consumibles').select('*').eq('activo', true).order('nombre').then(({ data }) => setCons((data as Consumible[]) ?? []))
    supabase.from('v_existencias').select('*').eq('empresa_id', empresaId).then(({ data }) => setEx(((data as Existencia[]) ?? []).filter(e => Number(e.existencia) > 0)))
    supabase.from('v_lotes').select('consumible_id,ubicacion_id,lote,caducidad,existencia').eq('empresa_id', empresaId).then(({ data }) => setLotes((data as Lote[]) ?? []))
  }, [empresaId])
  const lugares = ex.filter(e => e.consumible_id === c)
  const lotesAqui = lotes.filter(l => l.consumible_id === c && (l.ubicacion_id ?? '') === lugar && Number(l.existencia) > 0).sort((a, b) => (a.caducidad ?? '9999').localeCompare(b.caducidad ?? '9999'))
  useEffect(() => { setLugar(lugares[0]?.ubicacion_id ?? '') }, [c]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLote(lotesAqui[0]?.lote ?? '') }, [c, lugar]) // eslint-disable-line react-hooks/exhaustive-deps
  const hay = Number(lugares.find(l => (l.ubicacion_id ?? '') === lugar)?.existencia ?? 0)
  async function guardar() {
    const n = Number(cant)
    if (!c) return setError('Elige la refacción.')
    if (!(n > 0)) return setError('Cantidad inválida.')
    if (n > hay) return setError(`Solo hay ${num(hay)} en ese lugar.`)
    const { error } = await supabase.from('movimientos_consumible').insert({ consumible_id: c, empresa_id: empresaId, ubicacion_id: lugar || null, tipo: 'salida', cantidad: n, lote: lote || null, ot_id: otId, notas: `Orden de trabajo ${folio}` })
    if (error) return setError(mensajeError(error))
    onListo()
  }
  return (
    <Modal abierto titulo={`Refacción para ${folio}`} onCerrar={onCerrar} ancho="max-w-md">
      <div className="space-y-3">
        <Campo label="Refacción"><select className="campo" value={c} onChange={e => setC(e.target.value)}><option value="">Elige…</option>{cons.filter(x => ex.some(e => e.consumible_id === x.id)).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
        {c && <Campo label="De dónde sale"><select className="campo" value={lugar} onChange={e => setLugar(e.target.value)}>{lugares.map(l => <option key={l.ubicacion_id ?? ''} value={l.ubicacion_id ?? ''}>{l.ubicacion ?? 'Sin lugar'} · hay {num(l.existencia)}</option>)}</select></Campo>}
        {lotesAqui.length > 0 && <Campo label="Lote (primero el que caduca antes)"><select className="campo" value={lote} onChange={e => setLote(e.target.value)}>{lotesAqui.map(l => <option key={l.lote ?? ''} value={l.lote ?? ''}>{l.lote ?? 'Sin lote'} · {num(l.existencia)}{l.caducidad ? ` · caduca ${l.caducidad}` : ''}</option>)}</select></Campo>}
        <Campo label="Cantidad"><input className="campo cifra" type="number" min={0} step="any" value={cant} onChange={e => setCant(e.target.value)} /></Campo>
        {cons.length > 0 && ex.length === 0 && <Aviso tipo="info">No hay existencias en el almacén de esta empresa.</Aviso>}
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}><PackageMinus size={16} />Sacar</button></div>
      </div>
    </Modal>
  )
}

type Pieza = { id: string; modelo_id: string | null; activo_id: string | null; consumible_id: string; cantidad_minima: number; notas: string | null; consumibles: { nombre: string; unidad: string } | null }

/** Piezas críticas que deben estar en almacén para un equipo (por producto o por unidad), con su existencia en la empresa. */
export function PiezasCriticas({ activoId, modeloId, empresaId }: { activoId: string; modeloId: string | null; empresaId: string }) {
  const { puedeEditar } = useAuth()
  const [piezas, setPiezas] = useState<Pieza[]>([])
  const [ex, setEx] = useState<Existencia[]>([])
  const [nueva, setNueva] = useState(false)
  const [cons, setCons] = useState<Consumible[]>([])
  const [f, setF] = useState({ consumible_id: '', cantidad_minima: '1', para: (modeloId ? 'modelo' : 'activo') as 'modelo' | 'activo' })
  const [error, setError] = useState('')
  const cargar = () => {
    const filtro = modeloId ? `activo_id.eq.${activoId},modelo_id.eq.${modeloId}` : `activo_id.eq.${activoId}`
    supabase.from('piezas_criticas').select('*,consumibles(nombre,unidad)').or(filtro).then(({ data }) => setPiezas((data as unknown as Pieza[]) ?? []))
    supabase.from('v_existencias').select('*').eq('empresa_id', empresaId).then(({ data }) => setEx((data as Existencia[]) ?? []))
  }
  useEffect(cargar, [activoId, modeloId, empresaId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (nueva && !cons.length) supabase.from('consumibles').select('*').eq('activo', true).order('nombre').then(({ data }) => setCons((data as Consumible[]) ?? [])) }, [nueva, cons.length])
  const hay = (cid: string) => ex.filter(e => e.consumible_id === cid).reduce((s, e) => s + Number(e.existencia), 0)
  async function guardar() {
    if (!f.consumible_id) return setError('Elige la pieza.')
    const { error } = await supabase.from('piezas_criticas').insert({ consumible_id: f.consumible_id, cantidad_minima: Number(f.cantidad_minima) || 1, modelo_id: f.para === 'modelo' ? modeloId : null, activo_id: f.para === 'activo' ? activoId : null })
    if (error) return setError(mensajeError(error))
    setNueva(false); cargar()
  }
  if (!piezas.length && !puedeEditar) return null
  const faltan = piezas.filter(p => hay(p.consumible_id) < Number(p.cantidad_minima))
  return (
    <section className={`tarjeta p-5 ${faltan.length ? '!border-amber-200' : ''}`}>
      <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Cog size={17} className="text-marca" />Piezas críticas en almacén</h2>
        {puedeEditar && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => { setNueva(true); setError('') }}><Plus size={14} />Agregar</button>}</div>
      {piezas.length === 0 ? <p className="text-sm text-stone-500">Define las refacciones que siempre deben estar a la mano para este equipo (filtros, mangueras, bandas). Avisa cuando falten.</p> : (
        <ul className="space-y-1.5 text-sm">
          {piezas.map(p => { const h = hay(p.consumible_id), bajo = h < Number(p.cantidad_minima); return (
            <li key={p.id} className="flex items-center gap-2">
              {bajo ? <ShieldAlert size={14} className="shrink-0 text-amber-600" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}
              <span className="min-w-0 flex-1 truncate">{p.consumibles?.nombre} <span className="text-[11px] text-stone-400">{p.modelo_id ? 'todo el modelo' : 'esta unidad'}</span></span>
              <span className={`cifra shrink-0 whitespace-nowrap text-xs ${bajo ? 'text-amber-700' : 'text-stone-500'}`}>hay {num(h)} / mín. {num(p.cantidad_minima)}</span>
              {puedeEditar && <button className="p-1 text-stone-400 hover:text-red-700" aria-label="Quitar" onClick={async () => { await supabase.from('piezas_criticas').delete().eq('id', p.id); cargar() }}><Trash2 size={13} /></button>}
            </li>
          ) })}
        </ul>
      )}
      {faltan.length > 0 && <Link to="/almacen?bajo=1" className="mt-3 inline-block text-xs text-amber-700 underline">Faltan {faltan.length} pieza(s): revisa el almacén</Link>}
      {nueva && (
        <Modal abierto titulo="Pieza crítica" onCerrar={() => setNueva(false)} ancho="max-w-md">
          <div className="space-y-3">
            <Campo label="Refacción del almacén"><select className="campo" value={f.consumible_id} onChange={e => setF({ ...f, consumible_id: e.target.value })}><option value="">Elige…</option>{cons.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Mínimo a tener"><input className="campo cifra" type="number" min={1} value={f.cantidad_minima} onChange={e => setF({ ...f, cantidad_minima: e.target.value })} /></Campo>
              <Campo label="Aplica a"><select className="campo" value={f.para} onChange={e => setF({ ...f, para: e.target.value as 'modelo' | 'activo' })}>{modeloId && <option value="modelo">Todo el modelo</option>}<option value="activo">Solo esta unidad</option></select></Campo>
            </div>
            <p className="text-xs text-stone-500">Si la refacción no existe, da de alta el artículo en Almacén → Nuevo artículo.</p>
            {error && <Aviso>{error}</Aviso>}
            <div className="flex justify-end gap-2"><button className="btn-sec" onClick={() => setNueva(false)}>Cancelar</button><button className="btn-primario" onClick={guardar}>Guardar</button></div>
          </div>
        </Modal>
      )}
    </section>
  )
}
