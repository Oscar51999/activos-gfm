import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Plus, Check, X, Building2, Search } from 'lucide-react'
import { supabase, mensajeError, type Estatus } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Cargando, Vacio, Modal, Campo, Aviso, EstatusBadge } from '../components/ui'
import LogoEmpresa from '../components/LogoEmpresa'
import FotoActivo from '../components/FotoActivo'
import type { EmpresaLogo } from '../lib/logos'

type Emp = EmpresaLogo & { id: string }
type Tre = { id: string; folio: string; de_empresa_id: string; a_empresa_id: string; a_ubicacion_id: string | null; activos: string[]; motivo: string | null; estatus: 'pendiente' | 'aprobado' | 'rechazado'; respuesta: string | null; created_at: string; resuelto_at: string | null }
type Act = { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; estatus: Estatus; empresa_id: string; categoria: string; foto_principal: string | null; modelo_foto: string | null }

/** Traspasos de activos entre empresas del grupo, con aprobación de un administrador. */
export default function Traspasos() {
  const { esAdmin, puedeEditar } = useAuth()
  const [sp] = useSearchParams()
  const [lista, setLista] = useState<Tre[] | null>(null)
  const [empresas, setEmpresas] = useState<Emp[]>([])
  const [acts, setActs] = useState<Record<string, Act>>({})
  const [nuevo, setNuevo] = useState(!!sp.get('activo'))
  const [resolver, setResolver] = useState<{ t: Tre; aprobar: boolean } | null>(null)
  const [resp, setResp] = useState('')
  const [error, setError] = useState('')

  const cargar = () => {
    supabase.from('traspasos_empresa').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      const l = (data as Tre[]) ?? []; setLista(l)
      const ids = [...new Set(l.flatMap(t => t.activos))]
      if (ids.length) supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,serie,estatus,empresa_id,categoria,foto_principal,modelo_foto').in('id', ids).then(({ data: a }) => setActs(Object.fromEntries(((a as Act[]) ?? []).map(x => [x.id, x]))))
    })
  }
  useEffect(() => {
    cargar()
    supabase.from('empresas').select('id,nombre,nombre_corto,logo_path,logo_oscuro,color').eq('activo', true).order('nombre').then(({ data }) => setEmpresas((data as Emp[]) ?? []))
  }, [])

  async function confirmar() {
    if (!resolver) return
    setError('')
    const { error } = await supabase.rpc('resolver_traspaso_empresa', { p_id: resolver.t.id, p_aprobar: resolver.aprobar, p_respuesta: resp })
    if (error) { setError(mensajeError(error)); return }
    setResolver(null); setResp(''); cargar()
  }

  if (!lista) return <Cargando />
  const emp = (id: string) => empresas.find(e => e.id === id)
  const pend = lista.filter(t => t.estatus === 'pendiente')
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Traspasos entre empresas</h1>
          <p className="mt-1 text-sm text-stone-500">Cuando un activo pasa de una empresa del grupo a otra. Lo solicita almacén y lo aprueba un administrador.</p>
        </div>
        {puedeEditar && <button className="btn-primario" onClick={() => setNuevo(true)}><Plus size={16} />Solicitar traspaso</button>}
      </div>
      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}
      {lista.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin traspasos" texto="Cuando una retro o una camioneta cambie de empresa, regístralo aquí para que quede autorizado." /></div> : (
        <div className="space-y-3">
          {pend.length > 0 && <h2 className="text-[11px] font-semibold uppercase tracking-[.16em] text-amber-700">Por aprobar · {pend.length}</h2>}
          {lista.map((t, i) => {
            const de = emp(t.de_empresa_id), a = emp(t.a_empresa_id)
            return (
              <div key={t.id} className={`tarjeta min-w-0 animate-entrar p-4 ${t.estatus === 'pendiente' ? '!border-amber-200' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-mono text-xs text-stone-500">{t.folio}</span>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-32 place-items-center rounded-xl border border-stone-200 bg-stone-50 px-2">{de && <LogoEmpresa empresa={de} alto={22} ancho={110} />}</span>
                    <ArrowRight size={18} className="text-marca" />
                    <span className="grid h-12 w-32 place-items-center rounded-xl border border-stone-200 bg-stone-50 px-2">{a && <LogoEmpresa empresa={a} alto={22} ancho={110} />}</span>
                  </div>
                  <span className={`ml-auto inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.estatus === 'pendiente' ? 'bg-amber-50 text-amber-800 ring-amber-200' : t.estatus === 'aprobado' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>{t.estatus === 'pendiente' ? 'Por aprobar' : t.estatus === 'aprobado' ? 'Aprobado' : 'Rechazado'}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.activos.map(id => { const x = acts[id]; return x ? (
                    <Link key={id} to={`/activos/${id}`} className="flex items-center gap-2 rounded-lg border border-stone-200 py-1 pl-1 pr-3 text-xs hover:border-marca">
                      <FotoActivo foto={x.foto_principal} fotoModelo={x.modelo_foto} categoria={x.categoria} className="h-7 w-8 rounded" icono={12} /><span className="font-mono text-marca">{x.codigo}</span><span className="max-w-[12rem] truncate">{[x.marca, x.modelo].filter(Boolean).join(' ') || x.descripcion}</span>
                    </Link>) : null })}
                </div>
                {t.motivo && <p className="mt-2 text-sm text-stone-600">Motivo: {t.motivo}</p>}
                {t.respuesta && <p className="mt-1 text-xs text-stone-500">Respuesta: {t.respuesta}</p>}
                {esAdmin && t.estatus === 'pendiente' && (
                  <div className="mt-3 flex gap-2 border-t border-stone-200 pt-3">
                    <button className="btn-primario !px-3 !py-1.5 text-xs" onClick={() => { setResolver({ t, aprobar: true }); setResp('') }}><Check size={14} />Aprobar</button>
                    <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => { setResolver({ t, aprobar: false }); setResp('') }}><X size={14} />Rechazar</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <Modal abierto={!!resolver} onCerrar={() => setResolver(null)} titulo={resolver?.aprobar ? 'Aprobar traspaso' : 'Rechazar traspaso'}>
        <div className="space-y-4">
          {resolver?.aprobar && <p className="text-sm text-stone-500">Los {resolver.t.activos.length} activo(s) pasan a <b className="text-tinta">{emp(resolver.t.a_empresa_id)?.nombre}</b> y quedan disponibles, sin responsable.</p>}
          <Campo label="Comentario (opcional)"><input className="campo" value={resp} onChange={e => setResp(e.target.value)} /></Campo>
          {error && <Aviso>{error}</Aviso>}
          <div className="flex justify-end gap-2"><button className="btn-sec" onClick={() => setResolver(null)}>Cancelar</button><button className="btn-primario" onClick={confirmar}>{resolver?.aprobar ? 'Aprobar' : 'Rechazar'}</button></div>
        </div>
      </Modal>
      {nuevo && <NuevoTraspaso empresas={empresas} activoInicial={sp.get('activo') ?? undefined} onCerrar={() => setNuevo(false)} onListo={() => { setNuevo(false); cargar() }} />}
    </div>
  )
}

function NuevoTraspaso({ empresas, activoInicial, onCerrar, onListo }: { empresas: Emp[]; activoInicial?: string; onCerrar: () => void; onListo: () => void }) {
  const [de, setDe] = useState('')
  const [a, setA] = useState('')
  const [ubic, setUbic] = useState('')
  const [motivo, setMotivo] = useState('')
  const [acts, setActs] = useState<Act[]>([])
  const [ubis, setUbis] = useState<{ id: string; nombre: string; empresa_id: string }[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set(activoInicial ? [activoInicial] : []))
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    supabase.from('ubicaciones').select('id,nombre,empresa_id').eq('activo', true).order('nombre').then(({ data }) => setUbis((data as never) ?? []))
    if (activoInicial) supabase.from('activos').select('empresa_id').eq('id', activoInicial).single().then(({ data }) => setDe((data as { empresa_id: string } | null)?.empresa_id ?? ''))
  }, [activoInicial])
  useEffect(() => {
    if (!de) { setActs([]); return }
    supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,serie,estatus,empresa_id,categoria,foto_principal,modelo_foto').eq('empresa_id', de).in('estatus', ['disponible', 'mantenimiento', 'asignado']).order('codigo').then(({ data }) => setActs((data as Act[]) ?? []))
  }, [de])
  const t = q.trim().toLowerCase()
  async function enviar() {
    setError('')
    const { error } = await supabase.from('traspasos_empresa').insert({ de_empresa_id: de, a_empresa_id: a, a_ubicacion_id: ubic || null, activos: [...sel], motivo: motivo.trim() || null })
    if (error) setError(mensajeError(error)); else onListo()
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Solicitar traspaso entre empresas" ancho="max-w-3xl">
      <div className="space-y-4">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Campo label="De la empresa"><select className="campo" value={de} onChange={e => { setDe(e.target.value); setSel(new Set()) }}><option value="">— Elige —</option>{empresas.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
          <ArrowRight className="mb-3 hidden text-marca sm:block" />
          <Campo label="A la empresa"><select className="campo" value={a} onChange={e => { setA(e.target.value); setUbic('') }}><option value="">— Elige —</option>{empresas.filter(x => x.id !== de).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
        </div>
        {a && <Campo label="Ubicación en la nueva empresa"><select className="campo" value={ubic} onChange={e => setUbic(e.target.value)}><option value="">— Sin ubicación —</option>{ubis.filter(u => u.empresa_id === a).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>}
        {de && (
          <div>
            <div className="mb-2 flex items-center justify-between"><span className="etiqueta mb-0">Activos ({sel.size})</span>
              <div className="relative w-56"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo !py-1.5 pl-8 text-xs" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} /></div></div>
            <ul className="max-h-64 space-y-1 overflow-y-auto">{acts.filter(x => !t || [x.codigo, x.descripcion, x.marca, x.modelo, x.serie].some(y => y?.toLowerCase().includes(t))).map(x => (
              <li key={x.id}><label className={`flex items-center gap-3 rounded-lg border px-2 py-1.5 ${x.estatus === 'asignado' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-stone-50'} ${sel.has(x.id) ? 'border-marca/60' : 'border-stone-200'}`}>
                <input type="checkbox" className="accent-[#F9B234]" disabled={x.estatus === 'asignado'} checked={sel.has(x.id)} onChange={() => setSel(s => { const n = new Set(s); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n })} />
                <span className="font-mono text-[11px] text-marca">{x.codigo}</span><span className="min-w-0 flex-1 truncate text-sm">{[x.marca, x.modelo].filter(Boolean).join(' ') || x.descripcion}</span><EstatusBadge estatus={x.estatus} />
              </label></li>
            ))}</ul>
            <p className="mt-1 text-[11px] text-stone-400">Los asignados se deben devolver antes de traspasar.</p>
          </div>
        )}
        <Campo label="Motivo"><input className="campo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Se necesita en la obra PC-03 de Punta Cortez" /></Campo>
        {error && <Aviso>{error}</Aviso>}
        <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={!de || !a || !sel.size} onClick={enviar}><Building2 size={16} />Solicitar</button></div>
      </div>
    </Modal>
  )
}
