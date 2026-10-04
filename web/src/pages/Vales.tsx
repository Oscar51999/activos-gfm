import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Truck, Plus, Search, ArrowRight, Clock, CheckCircle2, Ban, ShieldCheck, Printer, MapPin, Package, LogOut, LogIn, AlertTriangle } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista } from '../lib/hooks'
import { Cargando, Vacio, Aviso, Modal, Campo } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import EnviarEnlace, { urlPublica } from '../components/Enlace'
import { LogoFirme } from '../components/Logo'
import { fechaCorta, isoDia } from '../components/Prestamo'

type Estatus = 'emitido' | 'en_transito' | 'recibido' | 'cancelado'
type Vale = { id: string; folio: string; token: string; empresa_id: string; origen_id: string | null; destino_id: string | null; activos: string[]; material: { descripcion: string; cantidad: number }[]
  transportista: string | null; vehiculo: string | null; motivo: string | null; vigencia: string; estatus: Estatus; salida_at: string | null; salida_por: string | null; recibido_at: string | null; recibido_por: string | null
  observaciones: string | null; created_at: string; empresas: { nombre: string; nombre_corto: string | null } | null; origen: { nombre: string } | null; destino: { nombre: string } | null }
type Mini = { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; numero_economico: string | null; ubicacion_id: string | null; ubicacion: string | null; estatus: string; modelo_foto: string | null; foto_principal: string | null; categoria: string | null }

export const EST_VALE: Record<Estatus, { texto: string; clase: string; icono: typeof Clock }> = {
  emitido: { texto: 'Emitido · no ha salido', clase: 'bg-sky-50 text-sky-700 ring-sky-200', icono: Clock },
  en_transito: { texto: 'En camino', clase: 'bg-amber-50 text-amber-800 ring-amber-200', icono: Truck },
  recibido: { texto: 'Recibido', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icono: CheckCircle2 },
  cancelado: { texto: 'Cancelado', clase: 'bg-stone-100 text-stone-600 ring-stone-200', icono: Ban },
}
const SEL = '*, empresas(nombre,nombre_corto), origen:origen_id(nombre), destino:destino_id(nombre)'
const hora = (f: string) => new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Vales de salida: lo que sale de una obra o almacén hacia otra, revisado por vigilancia con el QR del vale. */
export default function Vales() {
  const { puedeResguardar } = useAuth()
  const [lista, setLista] = useState<Vale[] | null>(null)
  const [filtro, setFiltro] = useState<'abiertos' | Estatus | 'todos'>('abiertos')
  const [nuevo, setNuevo] = useState(false)
  const [ver, setVer] = useState<Vale | null>(null)
  const cargar = () => { supabase.from('vales_salida').select(SEL).order('created_at', { ascending: false }).limit(500).then(({ data }) => setLista((data as unknown as Vale[]) ?? [])) }
  useEffect(cargar, [])
  if (!lista) return <Cargando />
  const n = (e: Estatus) => lista.filter(v => v.estatus === e).length
  const vis = lista.filter(v => filtro === 'todos' ? true : filtro === 'abiertos' ? v.estatus === 'emitido' || v.estatus === 'en_transito' : v.estatus === filtro)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Vales de salida</h1>
          <p className="mt-1 text-sm text-stone-500">Para mover equipo entre obras. Vigilancia escanea el QR del vale en la caseta al salir y al llegar; al recibirlo, el equipo cambia de ubicación solo.</p>
        </div>
        {puedeResguardar && <button className="btn-primario" onClick={() => setNuevo(true)}><Plus size={16} />Nuevo vale</button>}
      </div>
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50 p-1">
        {([['abiertos', `Abiertos · ${n('emitido') + n('en_transito')}`], ['emitido', `Por salir · ${n('emitido')}`], ['en_transito', `En camino · ${n('en_transito')}`], ['recibido', `Recibidos · ${n('recibido')}`], ['todos', 'Todos']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${filtro === k ? 'bg-marca text-[#120D04]' : 'text-stone-500 hover:text-tinta'}`}>{t}</button>
        ))}
      </div>
      {vis.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin vales aquí" texto="Haz un vale cuando un equipo salga de una obra o almacén hacia otro lugar." /></div> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {vis.map((v, i) => { const E = EST_VALE[v.estatus]; const vencido = v.estatus === 'emitido' && v.vigencia < isoDia(new Date()); return (
            <button key={v.id} onClick={() => setVer(v)} className="tarjeta viva min-w-0 animate-entrar p-4 text-left" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-stone-500">{v.folio}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${E.clase}`}><E.icono size={11} />{E.texto}</span>
                {vencido && <span className="inline-flex items-center gap-1 text-[11px] text-red-700"><AlertTriangle size={11} />Vencido</span>}
                <span className="ml-auto text-[11px] text-stone-400">{v.empresas?.nombre_corto || v.empresas?.nombre}</span>
              </div>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium"><span className="truncate">{v.origen?.nombre ?? '—'}</span><ArrowRight size={14} className="shrink-0 text-marca" /><span className="truncate">{v.destino?.nombre ?? '—'}</span></p>
              <p className="mt-1 text-xs text-stone-500">{v.activos.length} equipo(s){v.material.length ? ` · ${v.material.length} material` : ''}{v.transportista ? ` · lleva ${v.transportista}` : ''}{v.vehiculo ? ` · ${v.vehiculo}` : ''}</p>
              <p className="mt-1 text-[11px] text-stone-400">{v.salida_at ? `Salió ${hora(v.salida_at)} (${v.salida_por})` : `Válido hasta ${fechaCorta(v.vigencia)}`}{v.recibido_at ? ` · llegó ${hora(v.recibido_at)} (${v.recibido_por})` : ''}</p>
            </button>
          ) })}
        </div>
      )}
      {nuevo && <NuevoVale onCerrar={() => setNuevo(false)} onListo={v => { setNuevo(false); cargar(); setVer(v) }} />}
      {ver && <VerVale vale={ver} onCerrar={() => setVer(null)} onCambio={() => { setVer(null); cargar() }} />}
    </div>
  )
}

function NuevoVale({ onCerrar, onListo }: { onCerrar: () => void; onListo: (v: Vale) => void }) {
  const { items: empresas } = useLista('empresas', 'id,nombre,nombre_corto')
  const { items: ubis } = useLista('ubicaciones', 'id,nombre,empresa_id')
  const [empresa, setEmpresa] = useState('')
  const [origen, setOrigen] = useState('')
  const [destino, setDestino] = useState('')
  const [acts, setActs] = useState<Mini[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [material, setMaterial] = useState('')
  const [f, setF] = useState({ transportista: '', vehiculo: '', motivo: '', vigencia: isoDia(new Date(Date.now() + 2 * 864e5)) })
  const [error, setError] = useState('')
  useEffect(() => { if (!empresa && empresas.length) setEmpresa(empresas[0].id) }, [empresas, empresa])
  useEffect(() => {
    if (!empresa) return
    supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,serie,numero_economico,ubicacion_id,ubicacion,estatus,modelo_foto,foto_principal,categoria').eq('empresa_id', empresa).neq('estatus', 'baja').order('codigo').limit(3000)
      .then(({ data }) => setActs((data as Mini[]) ?? []))
  }, [empresa])
  const vis = useMemo(() => acts.filter(a => (!origen || a.ubicacion_id === origen) && (!q || [a.codigo, a.descripcion, a.marca, a.modelo, a.serie, a.numero_economico].some(x => x?.toLowerCase().includes(q.toLowerCase())))).slice(0, 80), [acts, origen, q])

  async function guardar() {
    setError('')
    if (!origen || !destino) return setError('Elige de dónde sale y a dónde va.')
    if (origen === destino) return setError('El destino debe ser distinto al origen.')
    const mat = material.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^(\d+(?:\.\d+)?)\s*[x×]?\s+(.+)$/i); return m ? { cantidad: Number(m[1]), descripcion: m[2] } : { cantidad: 1, descripcion: l } })
    if (!sel.length && !mat.length) return setError('Agrega al menos un equipo o material.')
    const { data, error } = await supabase.from('vales_salida').insert({ empresa_id: empresa, origen_id: origen, destino_id: destino, activos: sel, material: mat, transportista: f.transportista || null, vehiculo: f.vehiculo || null, motivo: f.motivo || null, vigencia: f.vigencia, estatus: 'emitido' }).select(SEL).single()
    if (error) return setError(mensajeError(error))
    onListo(data as unknown as Vale)
  }
  const ubisE = ubis.filter(u => u.empresa_id === empresa)
  return (
    <Modal abierto titulo="Nuevo vale de salida" onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Empresa"><select className="campo" value={empresa} onChange={e => { setEmpresa(e.target.value); setOrigen(''); setDestino(''); setSel([]) }}>{empresas.map(e => <option key={e.id} value={e.id}>{(e.nombre_corto as string) || e.nombre}</option>)}</select></Campo>
          <Campo label="Sale de"><select className="campo" value={origen} onChange={e => { setOrigen(e.target.value); setSel([]) }}><option value="">Elige…</option>{ubisE.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
          <Campo label="Va a"><select className="campo" value={destino} onChange={e => setDestino(e.target.value)}><option value="">Elige…</option>{ubisE.filter(u => u.id !== origen).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2"><span className="etiqueta !mb-0">Equipo que sale {sel.length ? `· ${sel.length}` : ''}</span>
            <div className="relative w-56 max-w-full"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !py-1.5 !pl-8 text-sm" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" /></div></div>
          <div className="grid max-h-60 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {!origen && <p className="py-4 text-sm text-stone-500 sm:col-span-2">Elige primero de dónde sale para ver el equipo que está ahí.</p>}
            {origen && vis.length === 0 && <p className="py-4 text-sm text-stone-500 sm:col-span-2">No hay equipo registrado en ese lugar.</p>}
            {origen && vis.map(a => (
              <label key={a.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-1.5 text-sm transition ${sel.includes(a.id) ? 'border-marca bg-marca/10' : 'border-stone-200'}`}>
                <input type="checkbox" className="accent-[#F9B234]" checked={sel.includes(a.id)} onChange={e => setSel(s => e.target.checked ? [...s, a.id] : s.filter(x => x !== a.id))} />
                <FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} className="h-8 w-10 shrink-0 rounded-md" icono={13} />
                <span className="min-w-0"><span className="block font-mono text-[10px] text-marca">{a.codigo}</span><span className="block truncate text-xs">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</span></span>
              </label>
            ))}
          </div>
        </div>
        <Campo label="Material o herramienta menor (un renglón por cosa, ej. “10 cascos”)"><textarea className="campo" rows={2} value={material} onChange={e => setMaterial(e.target.value)} placeholder={'10 cascos\n2 rollos de cinta de precaución'} /></Campo>
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo label="Quién lo lleva"><input className="campo" value={f.transportista} onChange={e => setF({ ...f, transportista: e.target.value })} /></Campo>
          <Campo label="Vehículo / placas"><input className="campo" value={f.vehiculo} onChange={e => setF({ ...f, vehiculo: e.target.value })} placeholder="CT-014 · CZ-1234-A" /></Campo>
          <Campo label="Válido hasta"><input className="campo" type="date" value={f.vigencia} onChange={e => setF({ ...f, vigencia: e.target.value })} /></Campo>
          <Campo label="Motivo"><input className="campo" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} /></Campo>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" onClick={guardar}><Truck size={16} />Emitir vale</button></div>
      </div>
    </Modal>
  )
}

function VerVale({ vale: v, onCerrar, onCambio }: { vale: Vale; onCerrar: () => void; onCambio: () => void }) {
  const { puedeResguardar } = useAuth()
  const [acts, setActs] = useState<Mini[]>([])
  useEffect(() => { if (v.activos.length) supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,serie,numero_economico,ubicacion_id,ubicacion,estatus,modelo_foto,foto_principal,categoria').in('id', v.activos).then(({ data }) => setActs((data as Mini[]) ?? [])) }, [v])
  const url = urlPublica(`vale/${v.token}`)
  const E = EST_VALE[v.estatus]
  async function cancelar() { await supabase.from('vales_salida').update({ estatus: 'cancelado' }).eq('id', v.id); onCambio() }
  return (
    <Modal abierto titulo={`Vale ${v.folio}`} onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${E.clase}`}><E.icono size={12} />{E.texto}</span><span className="text-xs text-stone-500">Válido hasta {fechaCorta(v.vigencia)}</span></div>
        <div id="vale-imprimible" className="papel rounded-2xl p-5 text-[#1E1719]">
          <div className="flex items-start justify-between gap-4">
            <div><LogoFirme className="h-7 w-auto text-[#1E1719]" /><p className="mt-2 text-[11px] uppercase tracking-wider text-stone-500">Vale de salida de equipo</p><p className="font-mono text-lg font-bold">{v.folio}</p></div>
            <div className="rounded-lg bg-white p-1.5"><QRCodeSVG value={url} size={104} marginSize={0} /></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500">Sale de</p><p className="font-medium">{v.origen?.nombre}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500">Va a</p><p className="font-medium">{v.destino?.nombre}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500">Lo lleva</p><p>{v.transportista ?? '—'} {v.vehiculo ? `· ${v.vehiculo}` : ''}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-stone-500">Empresa</p><p>{v.empresas?.nombre}</p></div>
          </div>
          <table className="mt-4 w-full text-xs"><thead><tr className="border-b border-stone-300 text-left text-[10px] uppercase tracking-wider text-stone-500"><th className="py-1">Código</th><th>Equipo</th><th>Serie / Eco.</th></tr></thead>
            <tbody>{acts.map(a => <tr key={a.id} className="border-b border-stone-200"><td className="py-1 font-mono">{a.codigo}</td><td>{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</td><td>{[a.serie, a.numero_economico].filter(Boolean).join(' · ')}</td></tr>)}
              {v.material.map((m, i) => <tr key={'m' + i} className="border-b border-stone-200"><td className="py-1">{m.cantidad}</td><td colSpan={2}>{m.descripcion}</td></tr>)}</tbody></table>
          {v.motivo && <p className="mt-3 text-xs text-stone-600">Motivo: {v.motivo}</p>}
          <p className="mt-3 text-[10px] text-stone-500">Vigilancia: escanea el QR para registrar la salida y la llegada.</p>
        </div>
        {(v.salida_at || v.recibido_at) && <div className="space-y-1 text-xs text-stone-500">{v.salida_at && <p className="flex items-center gap-1.5"><LogOut size={13} />Salió {hora(v.salida_at)} · revisó {v.salida_por}</p>}{v.recibido_at && <p className="flex items-center gap-1.5"><LogIn size={13} />Llegó {hora(v.recibido_at)} · recibió {v.recibido_por}</p>}{v.observaciones && <p>Observaciones: {v.observaciones}</p>}</div>}
        {v.estatus !== 'recibido' && v.estatus !== 'cancelado' && <EnviarEnlace url={url} mensaje={`Vale de salida ${v.folio}: ${v.origen?.nombre} → ${v.destino?.nombre}. Muéstralo en la caseta.`} compacto />}
        <div className="flex flex-wrap justify-between gap-2">
          {puedeResguardar && v.estatus === 'emitido' ? <button className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-red-700" onClick={cancelar}><Ban size={14} />Cancelar vale</button> : <span />}
          <div className="flex gap-2"><a className="btn-sec" href={url} target="_blank" rel="noreferrer"><ShieldCheck size={16} />Vista de caseta</a><button className="btn-sec" onClick={() => window.print()}><Printer size={16} />Imprimir</button></div>
        </div>
      </div>
    </Modal>
  )
}

type ValePub = { folio: string; estatus: Estatus; vigencia: string; motivo: string | null; transportista: string | null; vehiculo: string | null; empresa: string; origen: string | null; destino: string | null
  material: { descripcion: string; cantidad: number }[]; salida_at: string | null; salida_por: string | null; recibido_at: string | null; recibido_por: string | null; emitido_at: string
  activos: { codigo: string; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; eco: string | null; foto: string | null }[] }

/** Lo que ve vigilancia en la caseta al escanear el QR del vale (sin cuenta). */
export function ValePublico() {
  const { token } = useParams()
  const [v, setV] = useState<ValePub | null | undefined>(undefined)
  const [nombre, setNombre] = useState('')
  const [obs, setObs] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const cargar = () => { supabase.rpc('vale_por_token', { p_token: token }).then(({ data }) => setV((data as ValePub) ?? null)) }
  useEffect(cargar, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  async function marcar(accion: 'salida' | 'llegada') {
    setMsg(null)
    const { data, error } = await supabase.rpc('marcar_vale', { p_token: token, p_accion: accion, p_nombre: nombre, p_observaciones: obs })
    if (error) return setMsg({ ok: false, t: mensajeError(error) })
    setMsg({ ok: true, t: data as string }); setObs(''); cargar()
  }
  if (v === undefined) return <div className="p-8"><Cargando /></div>
  const vencido = v && v.estatus === 'emitido' && v.vigencia < isoDia(new Date())
  return (
    <div className="min-h-full px-4 py-8">
      <div className="mx-auto max-w-lg space-y-4">
        <LogoFirme className="h-8 w-auto text-[#fff]" />
        {!v ? <Aviso>Este vale no existe. No dejes salir el equipo.</Aviso> : <>
          <div className={`tarjeta p-5 ${v.estatus === 'cancelado' || vencido ? '!border-red-200' : ''}`}>
            <div className="flex items-center justify-between gap-2"><p className="font-mono text-lg font-bold">{v.folio}</p><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${EST_VALE[v.estatus].clase}`}>{EST_VALE[v.estatus].texto}</span></div>
            {(v.estatus === 'cancelado' || vencido) && <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700"><AlertTriangle size={16} />{v.estatus === 'cancelado' ? 'Vale cancelado: no dejes salir el equipo.' : `Vale vencido el ${fechaCorta(v.vigencia)}: pide uno nuevo.`}</p>}
            <p className="mt-3 flex items-center gap-2 text-base font-medium"><MapPin size={16} className="text-marca" />{v.origen}<ArrowRight size={15} className="text-marca" />{v.destino}</p>
            <p className="mt-1 text-sm text-stone-500">{v.empresa}{v.transportista ? ` · lo lleva ${v.transportista}` : ''}{v.vehiculo ? ` · ${v.vehiculo}` : ''}</p>
            <ul className="mt-4 space-y-1.5">
              {v.activos.map(a => (
                <li key={a.codigo} className="flex items-center gap-3 rounded-xl border border-stone-200 p-2">
                  <FotoActivo fotoModelo={a.foto} className="h-12 w-14 shrink-0 rounded-lg" icono={18} />
                  <span className="min-w-0"><span className="block font-mono text-xs text-marca">{a.codigo}</span><span className="block truncate text-sm font-medium">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</span><span className="block text-xs text-stone-500">{[a.serie && `Serie ${a.serie}`, a.eco && `Eco ${a.eco}`].filter(Boolean).join(' · ')}</span></span>
                </li>
              ))}
              {v.material.map((m, i) => <li key={i} className="flex items-center gap-2 px-2 text-sm"><Package size={14} className="text-stone-400" /><span className="cifra font-semibold">{m.cantidad}</span>{m.descripcion}</li>)}
            </ul>
            {v.salida_at && <p className="mt-3 text-xs text-stone-500">Salió {hora(v.salida_at)} · revisó {v.salida_por}</p>}
            {v.recibido_at && <p className="text-xs text-stone-500">Llegó {hora(v.recibido_at)} · recibió {v.recibido_por}</p>}
          </div>
          {(v.estatus === 'emitido' && !vencido) || v.estatus === 'en_transito' ? (
            <div className="tarjeta space-y-3 p-5">
              <h2 className="font-semibold">{v.estatus === 'emitido' ? 'Caseta de salida' : 'Caseta de llegada'}</h2>
              <p className="text-sm text-stone-500">Revisa que lo que sale coincida con la lista (código o número económico en la etiqueta).</p>
              <input className="campo" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre" />
              <input className="campo" value={obs} onChange={e => setObs(e.target.value)} placeholder="Observaciones (opcional)" />
              {msg && <Aviso tipo={msg.ok ? 'ok' : 'error'}>{msg.t}</Aviso>}
              <button className="btn-primario w-full" onClick={() => marcar(v.estatus === 'emitido' ? 'salida' : 'llegada')}>{v.estatus === 'emitido' ? <><LogOut size={16} />Registrar salida</> : <><LogIn size={16} />Registrar llegada</>}</button>
              {v.estatus === 'emitido' && <button className="w-full text-xs text-stone-500 underline" onClick={() => marcar('llegada')}>Estoy en la caseta de destino y no registraron la salida</button>}
            </div>
          ) : msg && <Aviso tipo={msg.ok ? 'ok' : 'error'}>{msg.t}</Aviso>}
          <p className="text-center text-[11px] text-stone-400">Grupo Empresarial Firme · Control de activos</p>
          <Link to="/" className="block text-center text-xs text-stone-500 hover:text-marca">Soy del equipo</Link>
        </>}
      </div>
    </div>
  )
}
