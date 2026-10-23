import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Wrench, PlayCircle, CheckCircle2, XCircle, User, Phone, Clock, Image as ImageIcon } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Cargando, Vacio, Aviso, Modal, Campo } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import { TIPOS_REPORTE, type TipoReporte } from '../components/ReportarFalla'

type Estatus = 'abierto' | 'en_proceso' | 'resuelto' | 'descartado'
export type Reporte = { id: string; folio: string; activo_id: string; empresa_id: string; tipo: TipoReporte; prioridad: 'baja' | 'media' | 'alta'; descripcion: string; foto: string | null
  reporta_nombre: string | null; reporta_contacto: string | null; estatus: Estatus; resolucion: string | null; created_at: string; resuelto_at: string | null; origen?: string | null; ticket_externo?: string | null
  activos: { codigo: string; descripcion: string; estatus: string; foto_principal: string | null; empresas: { nombre: string; nombre_corto: string | null } | null; modelos: { nombre: string; foto_path: string | null } | null; categorias: { nombre: string } | null } | null }

export const ESTATUS_REP: Record<Estatus, { texto: string; clase: string }> = {
  abierto: { texto: 'Abierto', clase: 'bg-red-50 text-red-700 ring-red-200' },
  en_proceso: { texto: 'En proceso', clase: 'bg-amber-50 text-amber-800 ring-amber-200' },
  resuelto: { texto: 'Resuelto', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  descartado: { texto: 'Descartado', clase: 'bg-stone-100 text-stone-600 ring-stone-200' },
}
const PRIO = { alta: 'text-red-700', media: 'text-amber-700', baja: 'text-stone-500' }
const hace = (f: string) => { const m = Math.round((Date.now() - new Date(f).getTime()) / 60000); return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días` }
const SELECT = '*, activos(codigo,descripcion,estatus,foto_principal,empresas(nombre,nombre_corto),modelos(nombre,foto_path),categorias(nombre))'

/** Bandeja de reportes de falla, daño, robo o extravío que llegan desde las etiquetas QR. */
export default function Reportes() {
  const { puedeResguardar, puedeEditar } = useAuth()
  const nav = useNavigate()
  const [lista, setLista] = useState<Reporte[] | null>(null)
  const [filtro, setFiltro] = useState<'activos' | Estatus | 'todos'>('activos')
  const [resolver, setResolver] = useState<Reporte | null>(null)
  const [nota, setNota] = useState('')
  const [foto, setFoto] = useState<string | null>(null)
  const [error, setError] = useState('')

  const cargar = () => { supabase.from('reportes').select(SELECT).order('created_at', { ascending: false }).limit(500).then(({ data }) => setLista((data as unknown as Reporte[]) ?? [])) }
  useEffect(cargar, [])

  async function cambiar(r: Reporte, datos: Partial<Reporte>, mtto = false) {
    setError('')
    const { error } = await supabase.from('reportes').update(datos).eq('id', r.id)
    if (error) { setError(mensajeError(error)); return }
    if (mtto) {
      const e2 = await supabase.from('activos').update({ estatus: 'mantenimiento' }).eq('id', r.activo_id)
      if (e2.error) setError(mensajeError(e2.error))
    }
    cargar()
  }

  if (!lista) return <Cargando />
  const n = (e: Estatus) => lista.filter(r => r.estatus === e).length
  const vis = lista.filter(r => filtro === 'todos' ? true : filtro === 'activos' ? r.estatus === 'abierto' || r.estatus === 'en_proceso' : r.estatus === filtro)
    .sort((a, b) => filtro === 'activos' ? (['alta', 'media', 'baja'].indexOf(a.prioridad) - ['alta', 'media', 'baja'].indexOf(b.prioridad)) || b.created_at.localeCompare(a.created_at) : 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">Reportes de falla</h1>
        <p className="mt-1 text-sm text-stone-500">Llegan cuando alguien escanea la etiqueta QR de un activo y toca “Reportar un problema”, aunque no tenga cuenta.</p>
      </div>
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50 p-1">
        {([['activos', `Por atender · ${n('abierto') + n('en_proceso')}`], ['abierto', `Abiertos · ${n('abierto')}`], ['en_proceso', `En proceso · ${n('en_proceso')}`], ['resuelto', `Resueltos · ${n('resuelto')}`], ['todos', 'Todos']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${filtro === k ? 'bg-marca text-[#120D04]' : 'text-stone-500 hover:text-tinta'}`}>{t}</button>
        ))}
      </div>
      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}

      {vis.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin reportes aquí" texto="Cuando alguien reporte un problema desde una etiqueta QR, aparecerá en esta bandeja." /></div> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {vis.map((r, i) => {
            const T = TIPOS_REPORTE[r.tipo] ?? TIPOS_REPORTE.otro
            const a = r.activos
            return (
              <article key={r.id} className={`tarjeta min-w-0 animate-entrar p-4 ${r.estatus === 'abierto' && r.prioridad === 'alta' ? '!border-red-200' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 ${PRIO[r.prioridad]}`}><T.icono size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-stone-500">{r.folio}</span>
                      {r.origen === 'mesa_ayuda' && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">Mesa de ayuda{r.ticket_externo ? ` · ${r.ticket_externo}` : ''}</span>}
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ESTATUS_REP[r.estatus].clase}`}>{ESTATUS_REP[r.estatus].texto}</span>
                      <span className={`text-[11px] font-medium uppercase ${PRIO[r.prioridad]}`}>● {r.prioridad}</span>
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-stone-400"><Clock size={11} />{hace(r.created_at)}</span>
                    </div>
                    <p className="mt-1 font-medium">{T.texto}: <span className="font-normal text-stone-600">{r.descripcion}</span></p>
                  </div>
                </div>
                <div className="mt-3 flex gap-3">
                  {a && <Link to={`/activos/${r.activo_id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-stone-200 p-2 hover:border-marca/50">
                    <FotoActivo foto={a.foto_principal} fotoModelo={a.modelos?.foto_path} categoria={a.categorias?.nombre} className="h-12 w-14 shrink-0 rounded-lg" icono={18} />
                    <span className="min-w-0"><span className="block font-mono text-[11px] text-marca">{a.codigo}</span><span className="block truncate text-sm">{a.modelos?.nombre ? `${a.descripcion} · ${a.modelos.nombre}` : a.descripcion}</span><span className="block truncate text-[11px] text-stone-500">{a.empresas?.nombre_corto || a.empresas?.nombre}</span></span>
                  </Link>}
                  {r.foto && <a href={r.foto} target="_blank" rel="noreferrer" className="relative h-[68px] w-20 shrink-0 overflow-hidden rounded-xl border border-stone-200" title="Ver foto"><img src={r.foto} alt="" className="h-full w-full object-cover" /><ImageIcon size={12} className="absolute bottom-1 right-1 text-[#fff]" /></a>}
                </div>
                {(r.reporta_nombre || r.reporta_contacto) && <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-stone-500">{r.reporta_nombre && <span className="inline-flex items-center gap-1"><User size={12} />{r.reporta_nombre}</span>}{r.reporta_contacto && <span className="inline-flex select-all items-center gap-1"><Phone size={12} />{r.reporta_contacto}</span>}</p>}
                {r.resolucion && <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{r.resolucion}</p>}
                {puedeResguardar && (r.estatus === 'abierto' || r.estatus === 'en_proceso') && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-stone-200 pt-3">
                    {r.estatus === 'abierto' && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => cambiar(r, { estatus: 'en_proceso' })}><PlayCircle size={14} />Atender</button>}
                    {puedeEditar && a?.estatus !== 'mantenimiento' && r.tipo !== 'robo' && r.tipo !== 'extravio' && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => cambiar(r, { estatus: 'en_proceso' }, true)}><Wrench size={14} />Mandar a mantenimiento</button>}
                    {r.tipo !== 'robo' && r.tipo !== 'extravio' && <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => nav(`/mantenimiento?nuevo=1&activo=${r.activo_id}&reporte=${r.id}`)}><Wrench size={14} />Orden de trabajo</button>}
                    <button className="btn-primario !px-3 !py-1.5 text-xs" onClick={() => { setResolver(r); setNota(''); setFoto(null) }}><CheckCircle2 size={14} />Resolver</button>
                    <button className="ml-auto inline-flex items-center gap-1 px-2 text-xs text-stone-500 hover:text-red-700" onClick={() => cambiar(r, { estatus: 'descartado' })}><XCircle size={14} />Descartar</button>
                    <select className="campo !w-auto !py-1 text-xs" value={r.prioridad} onChange={e => cambiar(r, { prioridad: e.target.value as Reporte['prioridad'] })} aria-label="Prioridad">
                      <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
                    </select>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <Modal abierto={!!resolver} onCerrar={() => setResolver(null)} titulo={`Resolver ${resolver?.folio ?? ''}`}>
        <div className="space-y-4">
          <Campo label="¿Qué se hizo?"><textarea className="campo" rows={3} autoFocus value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. Se cambió el cable de corriente; ya funciona." /></Campo>
          {foto && <img src={foto} alt="" className="h-24 rounded-lg" />}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-sec" onClick={() => setResolver(null)}>Cancelar</button>
            {resolver?.activos?.estatus === 'mantenimiento' && puedeEditar && (
              <button className="btn-sec" onClick={async () => { const r = resolver!; await supabase.from('activos').update({ estatus: 'disponible' }).eq('id', r.activo_id).eq('estatus', 'mantenimiento'); await cambiar(r, { estatus: 'resuelto', resolucion: nota || 'Resuelto', resuelto_at: new Date().toISOString() }); setResolver(null) }}>
                Resolver y regresar a disponible
              </button>
            )}
            <button className="btn-primario" onClick={async () => { await cambiar(resolver!, { estatus: 'resuelto', resolucion: nota || 'Resuelto', resuelto_at: new Date().toISOString() }); setResolver(null) }}>Marcar resuelto</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
