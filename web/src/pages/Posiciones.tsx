import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Grid3x3, Plus, Printer, Trash2, Boxes, Package, Search, X } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Encabezado, Cargando, Vacio, Aviso, Modal, Campo } from '../components/ui'
import { num, plural, type Existencia } from '../lib/almacen'

type Ubi = { id: string; nombre: string; empresa_id: string; tipo: string }
type Pos = { id: string; empresa_id: string; ubicacion_id: string; pasillo: string | null; rack: string | null; nivel: string | null; posicion: string | null; codigo: string; descripcion: string | null; activo: boolean }
type ActPos = { id: string; codigo: string; descripcion: string; posicion_id: string | null; ubicacion_id: string | null }
type ConsPos = { consumible_id: string; ubicacion_id: string; posicion_id: string; empresa_id: string }

const letras = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i))
const dos = (n: number) => String(n).padStart(2, '0')

/** Posiciones dentro de un almacén (pasillo · rack · nivel): dónde está cada cosa para encontrarla rápido y contarla. */
export default function Posiciones() {
  const { puedeEditar } = useAuth()
  const [sp, setSp] = useSearchParams()
  const [ubis, setUbis] = useState<Ubi[]>([])
  const [ubi, setUbi] = useState(sp.get('ubicacion') ?? '')
  const [pos, setPos] = useState<Pos[] | null>(null)
  const [acts, setActs] = useState<ActPos[]>([])
  const [cpos, setCpos] = useState<ConsPos[]>([])
  const [ex, setEx] = useState<Existencia[]>([])
  const [generar, setGenerar] = useState(false)
  const [abierta, setAbierta] = useState<Pos | null>(null)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    supabase.from('ubicaciones').select('id,nombre,empresa_id,tipo').eq('activo', true).order('nombre').then(({ data }) => {
      const l = (data as Ubi[]) ?? []
      setUbis(l.sort((a, b) => (a.tipo === 'almacen' ? 0 : 1) - (b.tipo === 'almacen' ? 0 : 1) || a.nombre.localeCompare(b.nombre)))
    })
  }, [])

  // Si llegaron escaneando la etiqueta de una posición: abre su almacén y la posición.
  useEffect(() => {
    const id = sp.get('pos')
    if (!id) return
    supabase.from('posiciones').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) { setUbi((data as Pos).ubicacion_id); setAbierta(data as Pos) }
    })
  }, [sp])

  const cargar = useCallback(async () => {
    if (!ubi) { setPos([]); return }
    setPos(null)
    const [p, a, c, e] = await Promise.all([
      supabase.from('posiciones').select('*').eq('ubicacion_id', ubi).order('codigo'),
      supabase.from('activos').select('id,codigo,descripcion,posicion_id,ubicacion_id').eq('ubicacion_id', ubi).neq('estatus', 'baja').order('codigo').limit(5000),
      supabase.from('consumible_posiciones').select('*').eq('ubicacion_id', ubi),
      supabase.from('v_existencias').select('*').eq('ubicacion_id', ubi),
    ])
    setPos((p.data as Pos[]) ?? []); setActs((a.data as ActPos[]) ?? []); setCpos((c.data as ConsPos[]) ?? []); setEx((e.data as Existencia[]) ?? [])
  }, [ubi])
  useEffect(() => { cargar() }, [cargar])

  const elegirUbi = (id: string) => { setUbi(id); const n = new URLSearchParams(); if (id) n.set('ubicacion', id); setSp(n, { replace: true }) }
  const ubiSel = ubis.find(u => u.id === ubi)
  const sinPos = acts.filter(a => !a.posicion_id).length
  const pasillos = useMemo(() => {
    const m = new Map<string, Pos[]>()
    for (const p of (pos ?? []).filter(p => !filtro || p.codigo.toLowerCase().includes(filtro.toLowerCase()) || (p.descripcion ?? '').toLowerCase().includes(filtro.toLowerCase())))
      m.set(p.pasillo || '—', [...(m.get(p.pasillo || '—') ?? []), p])
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [pos, filtro])

  return (
    <div>
      <Encabezado titulo="Posiciones de almacén" sub="Pasillo · rack · nivel. Imprime la etiqueta de cada posición y pégala en el anaquel: al escanearla sabes qué debe haber ahí."
        acciones={ubi ? <>
          <Link className="btn-sec" to={`/etiquetas?tipo=posiciones&ubicacion=${ubi}`}><Printer size={16} />Etiquetas</Link>
          {puedeEditar && <button className="btn-primario" onClick={() => setGenerar(true)}><Plus size={16} />Crear posiciones</button>}
        </> : undefined} />

      <div className="tarjeta mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_1fr]">
        <Campo label="Almacén o ubicación">
          <select className="campo" value={ubi} onChange={e => elegirUbi(e.target.value)}>
            <option value="">Elige…</option>
            {ubis.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.tipo === 'almacen' ? ' · almacén' : ''}</option>)}
          </select>
        </Campo>
        {ubi && <Campo label="Buscar posición"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="campo pl-9" placeholder="A-03-2 o descripción" value={filtro} onChange={e => setFiltro(e.target.value)} /></div></Campo>}
      </div>

      {!ubi ? <Vacio titulo="Elige un almacén" texto="Las posiciones se crean por almacén. Cada una se puede imprimir como etiqueta QR para el anaquel." />
        : pos === null ? <Cargando />
        : pos.length === 0 ? <Vacio titulo={`${ubiSel?.nombre ?? 'Este lugar'} aún no tiene posiciones`} texto="Créalas en serie: por ejemplo pasillos A a C, 4 racks y 3 niveles = 36 posiciones."
            accion={puedeEditar ? <button className="btn-primario" onClick={() => setGenerar(true)}><Plus size={16} />Crear posiciones</button> : undefined} />
        : <>
          <div className="mb-4 flex flex-wrap gap-3 text-sm text-stone-500">
            <span><b className="text-tinta">{pos.length}</b> posiciones</span>
            <span><b className="text-tinta">{acts.length - sinPos}</b> de {acts.length} activos acomodados</span>
            {sinPos > 0 && <span className="text-amber-700">{sinPos} {plural('activo', sinPos)} sin posición</span>}
          </div>
          <div className="space-y-5">
            {pasillos.map(([pas, lista]) => (
              <section key={pas}>
                <h2 className="etiqueta">Pasillo {pas}</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {lista.map(p => {
                    const na = acts.filter(a => a.posicion_id === p.id).length, nc = cpos.filter(c => c.posicion_id === p.id).length
                    return (
                      <button key={p.id} onClick={() => setAbierta(p)} className={`tarjeta p-3 text-left transition hover:border-marca/50 ${!p.activo ? 'opacity-50' : ''}`}>
                        <p className="font-mono text-sm font-semibold">{p.codigo}</p>
                        <p className="mt-0.5 truncate text-xs text-stone-500">{p.descripcion || [p.rack && `Rack ${p.rack}`, p.nivel && `nivel ${p.nivel}`].filter(Boolean).join(' · ') || '—'}</p>
                        <p className="mt-2 flex gap-3 text-xs text-stone-500">
                          <span className="inline-flex items-center gap-1"><Boxes size={12} />{na}</span>
                          <span className="inline-flex items-center gap-1"><Package size={12} />{nc}</span>
                        </p>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </>}

      {generar && ubiSel && <GenerarPosiciones ubi={ubiSel} existentes={pos ?? []} onCerrar={() => setGenerar(false)} onListo={() => { setGenerar(false); cargar() }} />}
      {abierta && <DetallePosicion p={abierta} acts={acts} cpos={cpos} ex={ex} puedeEditar={puedeEditar}
        onCerrar={() => { setAbierta(null); if (sp.get('pos')) { const n = new URLSearchParams(sp); n.delete('pos'); setSp(n, { replace: true }) } }} onCambio={cargar} />}
    </div>
  )
}

function GenerarPosiciones({ ubi, existentes, onCerrar, onListo }: { ubi: Ubi; existentes: Pos[]; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({ pasillos: 2, racks: 4, niveles: 3, posiciones: 1 })
  const [una, setUna] = useState({ codigo: '', descripcion: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const filas = useMemo(() => {
    const out: Omit<Pos, 'id' | 'activo'>[] = []
    for (const pa of letras(Math.min(26, Math.max(1, f.pasillos))))
      for (let r = 1; r <= Math.max(1, f.racks); r++)
        for (let n = 1; n <= Math.max(1, f.niveles); n++)
          for (let p = 1; p <= Math.max(1, f.posiciones); p++)
            out.push({ empresa_id: ubi.empresa_id, ubicacion_id: ubi.id, pasillo: pa, rack: dos(r), nivel: String(n), posicion: f.posiciones > 1 ? String(p) : null,
              codigo: `${pa}-${dos(r)}-${n}${f.posiciones > 1 ? `-${p}` : ''}`, descripcion: null })
    return out
  }, [f, ubi])
  const nuevas = filas.filter(x => !existentes.some(e => e.codigo === x.codigo))

  async function guardar(lista: Omit<Pos, 'id' | 'activo'>[]) {
    if (!lista.length) return
    setGuardando(true); setError('')
    const { error } = await supabase.from('posiciones').upsert(lista, { onConflict: 'ubicacion_id,codigo', ignoreDuplicates: true })
    setGuardando(false)
    if (error) setError(mensajeError(error)); else onListo()
  }

  const n = (k: keyof typeof f) => <input type="number" min={1} max={k === 'pasillos' ? 26 : 50} className="campo" value={f[k]} onChange={e => setF({ ...f, [k]: Number(e.target.value) || 1 })} />
  return (
    <Modal abierto titulo={`Crear posiciones · ${ubi.nombre}`} onCerrar={onCerrar}>
      <div className="space-y-5">
        <div>
          <p className="mb-3 text-sm text-stone-500">En serie: el código queda como <span className="font-mono text-tinta">pasillo-rack-nivel</span>, por ejemplo <span className="font-mono text-tinta">A-03-2</span>.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo label="Pasillos (A, B…)">{n('pasillos')}</Campo>
            <Campo label="Racks por pasillo">{n('racks')}</Campo>
            <Campo label="Niveles por rack">{n('niveles')}</Campo>
            <Campo label="Huecos por nivel">{n('posiciones')}</Campo>
          </div>
          <p className="mt-3 text-sm text-stone-500">Se crearán <b className="text-tinta">{num(nuevas.length)}</b> posiciones nuevas{filas.length !== nuevas.length ? ` (${filas.length - nuevas.length} ya existían)` : ''}: {nuevas.slice(0, 4).map(x => x.codigo).join(', ')}{nuevas.length > 4 ? '…' : ''}</p>
          <button className="btn-primario mt-3" disabled={guardando || !nuevas.length || nuevas.length > 3000} onClick={() => guardar(nuevas)}><Grid3x3 size={16} />Crear {num(nuevas.length)}</button>
        </div>
        <div className="border-t border-stone-200 pt-4">
          <p className="etiqueta">O una sola, con el nombre que quieras</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <input className="campo font-mono" placeholder="PATIO-1, JAULA, CAJA-FUERTE" value={una.codigo} onChange={e => setUna({ ...una, codigo: e.target.value.toUpperCase() })} />
            <input className="campo" placeholder="Descripción (opcional)" value={una.descripcion} onChange={e => setUna({ ...una, descripcion: e.target.value })} />
            <button className="btn-sec" disabled={guardando || !una.codigo.trim()} onClick={() => guardar([{ empresa_id: ubi.empresa_id, ubicacion_id: ubi.id, pasillo: null, rack: null, nivel: null, posicion: null, codigo: una.codigo.trim(), descripcion: una.descripcion.trim() || null }])}>Agregar</button>
          </div>
        </div>
        {error && <Aviso>{error}</Aviso>}
      </div>
    </Modal>
  )
}

function DetallePosicion({ p, acts, cpos, ex, puedeEditar, onCerrar, onCambio }: {
  p: Pos; acts: ActPos[]; cpos: ConsPos[]; ex: Existencia[]; puedeEditar: boolean; onCerrar: () => void; onCambio: () => void
}) {
  const [error, setError] = useState('')
  const [agregar, setAgregar] = useState('')
  const [cons, setCons] = useState('')
  const [desc, setDesc] = useState(p.descripcion ?? '')
  const aqui = acts.filter(a => a.posicion_id === p.id)
  const consAqui = cpos.filter(c => c.posicion_id === p.id)
  const libres = acts.filter(a => a.posicion_id !== p.id)
  const consLibres = ex.filter(e => !consAqui.some(c => c.consumible_id === e.consumible_id))

  async function run(q: PromiseLike<{ error: unknown }>) {
    setError('')
    const { error } = await q
    if (error) setError(mensajeError(error)); else onCambio()
  }
  const ponerActivo = (texto: string) => {
    const t = texto.trim().toUpperCase()
    const a = libres.find(x => x.codigo === t) ?? libres.find(x => `${x.codigo} · ${x.descripcion}`.toUpperCase() === t)
    if (!a) { setError(`"${texto}" no es un activo de este almacén.`); return }
    setAgregar('')
    run(supabase.from('activos').update({ posicion_id: p.id }).eq('id', a.id))
  }

  return (
    <Modal abierto titulo={`Posición ${p.codigo}`} onCerrar={onCerrar}>
      <div className="space-y-5">
        {puedeEditar && (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input className="campo" placeholder="Descripción (ej. Cascos y chalecos)" value={desc} onChange={e => setDesc(e.target.value)} />
            <button className="btn-sec" disabled={desc === (p.descripcion ?? '')} onClick={() => run(supabase.from('posiciones').update({ descripcion: desc.trim() || null }).eq('id', p.id))}>Guardar</button>
            <button className="btn-sec" onClick={() => run(supabase.from('posiciones').update({ activo: !p.activo }).eq('id', p.id)).then(onCerrar)}>{p.activo ? 'Desactivar' : 'Reactivar'}</button>
          </div>
        )}

        <section>
          <h3 className="etiqueta flex items-center gap-1.5"><Boxes size={13} />Activos aquí · {aqui.length}</h3>
          {aqui.length === 0 ? <p className="text-sm text-stone-500">Ninguno.</p> : (
            <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200">
              {aqui.map(a => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Link to={`/activos/${a.id}`} className="font-mono font-medium hover:text-marca">{a.codigo}</Link>
                  <span className="min-w-0 flex-1 truncate text-stone-500">{a.descripcion}</span>
                  {puedeEditar && <button className="rounded p-1 text-stone-400 hover:text-red-600" aria-label="Quitar de la posición" onClick={() => run(supabase.from('activos').update({ posicion_id: null }).eq('id', a.id))}><X size={15} /></button>}
                </li>
              ))}
            </ul>
          )}
          {puedeEditar && libres.length > 0 && (
            <form className="mt-2 flex gap-2" onSubmit={e => { e.preventDefault(); ponerActivo(agregar) }}>
              <input className="campo font-mono" list="pos-libres" placeholder="Escanea o escribe el código del activo" value={agregar} onChange={e => setAgregar(e.target.value)} />
              <datalist id="pos-libres">{libres.map(a => <option key={a.id} value={a.codigo}>{a.descripcion}</option>)}</datalist>
              <button className="btn-sec" disabled={!agregar.trim()}>Acomodar</button>
            </form>
          )}
        </section>

        <section>
          <h3 className="etiqueta flex items-center gap-1.5"><Package size={13} />Material y consumibles aquí · {consAqui.length}</h3>
          {consAqui.length === 0 ? <p className="text-sm text-stone-500">Ninguno.</p> : (
            <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200">
              {consAqui.map(c => {
                const e = ex.find(x => x.consumible_id === c.consumible_id)
                return (
                  <li key={c.consumible_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{e?.nombre ?? 'Artículo'}</span>
                    {e && <span className="text-stone-500">{num(e.existencia)} {plural(e.unidad, e.existencia)}</span>}
                    {puedeEditar && <button className="rounded p-1 text-stone-400 hover:text-red-600" aria-label="Quitar de la posición"
                      onClick={() => run(supabase.from('consumible_posiciones').delete().eq('consumible_id', c.consumible_id).eq('ubicacion_id', c.ubicacion_id))}><Trash2 size={14} /></button>}
                  </li>
                )
              })}
            </ul>
          )}
          {puedeEditar && consLibres.length > 0 && (
            <div className="mt-2 flex gap-2">
              <select className="campo" value={cons} onChange={e => setCons(e.target.value)}>
                <option value="">Elige un artículo con existencia en este almacén…</option>
                {consLibres.map(e => <option key={e.consumible_id} value={e.consumible_id}>{e.nombre} · {num(e.existencia)} {plural(e.unidad, e.existencia)}</option>)}
              </select>
              <button className="btn-sec" disabled={!cons} onClick={() => { const c = cons; setCons(''); run(supabase.from('consumible_posiciones').upsert({ consumible_id: c, ubicacion_id: p.ubicacion_id, posicion_id: p.id, empresa_id: p.empresa_id }, { onConflict: 'consumible_id,ubicacion_id' })) }}>Guardar aquí</button>
            </div>
          )}
        </section>

        <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-4">
          <Link className="btn-sec" to={`/etiquetas?tipo=posiciones&ubicacion=${p.ubicacion_id}`}><Printer size={16} />Imprimir etiquetas</Link>
          <Link className="btn-sec" to={`/conteo-ciclico?ubicacion=${p.ubicacion_id}`}>Contar este almacén</Link>
        </div>
        {error && <Aviso>{error}</Aviso>}
      </div>
    </Modal>
  )
}
