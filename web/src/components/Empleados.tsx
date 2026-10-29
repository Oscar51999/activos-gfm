import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, UserPlus, FileSpreadsheet, ClipboardSignature, ChevronRight, ChevronDown, Check, Undo2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nombreEmpleado } from '../lib/hooks'
import { Modal, Campo, Aviso, Cargando, Vacio } from './ui'
import FotoActivo from './FotoActivo'
import { DesasignarModal, type ActAsignado } from './Desasignar'

export type Empleado = { id: string; empresa_id: string; codigo: string | null; nombres: string; apellidos: string | null; puesto: string | null
  departamento_id: string | null; email: string | null; telefono: string | null; activo: boolean; departamentos?: { nombre: string } | null; empresas?: { nombre: string; nombre_corto?: string | null } | null }
type ActMini = ActAsignado & { responsable_id: string | null }

const PALETA = ['#F9B234', '#38BDF8', '#34D399', '#A78BFA', '#FB7185', '#F472B6', '#2DD4BF', '#FACC15']
export function colorPersona(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETA[h % PALETA.length] }
export function Avatar({ e, tam = 40 }: { e: { id: string; nombres: string; apellidos?: string | null }; tam?: number }) {
  const ini = nombreEmpleado(e).split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  const c = colorPersona(e.id)
  return <span className="grid shrink-0 place-items-center rounded-full font-display font-bold" style={{ width: tam, height: tam, fontSize: tam * 0.36, color: c, background: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}55` }}>{ini}</span>
}

/** Directorio de empleados con lo que trae cada uno. Sirve para una empresa o para todo el grupo. */
export function ListaEmpleados({ empresaId, recargarFuera }: { empresaId?: string; recargarFuera?: number }) {
  const { puedeEditar, puedeResguardar } = useAuth()
  const [lista, setLista] = useState<Empleado[] | null>(null)
  const [acts, setActs] = useState<ActMini[]>([])
  const [q, setQ] = useState('')
  const [depto, setDepto] = useState('')
  const [soloCon, setSoloCon] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const [importar, setImportar] = useState(false)
  const [n, setN] = useState(0)
  const [abierto, setAbierto] = useState<Set<string>>(new Set())
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [quitar, setQuitar] = useState<{ e: Empleado; acts: ActMini[] } | null>(null)

  useEffect(() => {
    let a = supabase.from('empleados').select('*,departamentos(nombre),empresas(nombre,nombre_corto)').eq('activo', true).order('nombres')
    if (empresaId) a = a.eq('empresa_id', empresaId)
    a.then(({ data }) => setLista((data as unknown as Empleado[]) ?? []))
    let b = supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,serie,numero_economico,estatus,empresa_id,ubicacion_id,ubicacion,responsable_id,foto_principal,modelo_foto,categoria').neq('estatus', 'baja').limit(20000)
    if (empresaId) b = b.eq('empresa_id', empresaId)
    b.then(({ data }) => setActs((data as ActMini[]) ?? []))
  }, [empresaId, n, recargarFuera])

  const porEmp = useMemo(() => {
    const m = new Map<string, ActMini[]>()
    acts.forEach(a => { if (!a.responsable_id) return; m.set(a.responsable_id, [...(m.get(a.responsable_id) ?? []), a]) })
    return m
  }, [acts])
  const deptos = useMemo(() => [...new Set((lista ?? []).map(e => e.departamentos?.nombre).filter(Boolean) as string[])].sort(), [lista])

  if (!lista) return <Cargando />
  const t = q.trim().toLowerCase()
  const vis = lista.filter(e => (!depto || e.departamentos?.nombre === depto) && (!soloCon || porEmp.has(e.id))
    && (!t || [nombreEmpleado(e), e.puesto, e.codigo, e.email].some(x => x?.toLowerCase().includes(t))
      || (porEmp.get(e.id) ?? []).some(a => [a.codigo, a.descripcion, a.marca, a.modelo, a.serie, a.numero_economico].some(x => x?.toLowerCase().includes(t)))))
  const conActivos = lista.filter(e => porEmp.has(e.id)).length

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="campo pl-10" placeholder="Buscar persona, puesto, o lo que trae (código, marca, serie)…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {deptos.length > 0 && <select className="campo w-auto" value={depto} onChange={e => setDepto(e.target.value)}><option value="">Todos los departamentos</option>{deptos.map(d => <option key={d}>{d}</option>)}</select>}
        <button onClick={() => setSoloCon(s => !s)} className={`rounded-xl border px-3 py-2.5 text-sm transition ${soloCon ? 'border-marca bg-marca/10 text-marca' : 'border-stone-300 text-stone-600'}`}>Con activos ({conActivos})</button>
        {puedeEditar && <>
          <button className="btn-sec" onClick={() => setImportar(true)}><FileSpreadsheet size={16} />Importar de Excel</button>
          <button className="btn-primario" onClick={() => setNuevo(true)}><UserPlus size={16} />Nuevo empleado</button>
        </>}
      </div>
      <p className="mb-3 text-xs text-stone-500">{vis.length} de {lista.length} empleados · {conActivos} con activos a su cargo</p>

      {vis.length === 0 ? <div className="tarjeta"><Vacio titulo={lista.length ? 'Sin coincidencias' : 'Sin empleados todavía'} texto={lista.length ? undefined : 'Agrega uno por uno o pega tu lista desde Excel.'} /></div> : (
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {vis.map((e, i) => {
            const suyos = porEmp.get(e.id) ?? []
            return (
              <div key={e.id} className="tarjeta viva group min-w-0 animate-entrar p-4" style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}>
                <Link to={`/empleados/${e.id}`} className="flex items-center gap-3">
                  <Avatar e={e} tam={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium group-hover:text-marca">{nombreEmpleado(e)}</p>
                    <p className="truncate text-xs text-stone-500">{[e.puesto, e.departamentos?.nombre].filter(Boolean).join(' · ') || 'Sin puesto'}</p>
                    {!empresaId && <p className="truncate text-[11px] text-stone-400">{e.empresas?.nombre_corto || e.empresas?.nombre}</p>}
                  </div>
                  <div className="text-right"><p className={`cifra text-2xl font-semibold ${suyos.length ? 'text-marca' : 'text-stone-400'}`}>{suyos.length}</p><p className="text-[10px] uppercase tracking-wider text-stone-400">activos</p></div>
                </Link>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {suyos.slice(0, 5).map(a => <FotoActivo key={a.id} foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} icono={14} className="h-8 w-8 rounded-lg ring-2 ring-[#0D0F14]" />)}
                    {suyos.length > 5 && <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-100 text-[10px] text-stone-600 ring-2 ring-[#0D0F14]">+{suyos.length - 5}</span>}
                  </div>
                  <div className="ml-auto flex gap-1.5">
                    {puedeResguardar && <Link to={`/resguardos/nuevo?tipo=asignacion&empresa=${e.empresa_id}&empleado=${e.id}`} title="Asignar activos" className="grid h-8 w-8 place-items-center rounded-lg border border-stone-300 text-stone-500 transition hover:border-marca hover:text-marca"><ClipboardSignature size={15} /></Link>}
                    <Link to={`/empleados/${e.id}`} title="Ver ficha" className="grid h-8 w-8 place-items-center rounded-lg border border-stone-300 text-stone-500 transition hover:border-marca hover:text-marca"><ChevronRight size={16} /></Link>
                  </div>
                </div>
                {suyos.length > 0 && (
                  <button onClick={() => setAbierto(s => { const x = new Set(s); if (x.has(e.id)) x.delete(e.id); else x.add(e.id); return x })}
                    className="mt-3 flex w-full items-center justify-between rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-500 transition hover:border-marca/50 hover:text-tinta" aria-expanded={abierto.has(e.id)}>
                    {abierto.has(e.id) ? 'Ocultar lo asignado' : `Ver lo asignado (${suyos.length})`}<ChevronDown size={14} className={`transition ${abierto.has(e.id) ? 'rotate-180' : ''}`} />
                  </button>
                )}
                {abierto.has(e.id) && (() => {
                  const sel = suyos.filter(a => marcados.has(a.id))
                  return (
                    <div className="mt-2 animate-entrar">
                      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200">
                        {suyos.map(a => (
                          <li key={a.id} className="flex items-center gap-2 p-2">
                            {puedeResguardar && <input type="checkbox" className="accent-[#F9B234]" checked={marcados.has(a.id)} disabled={a.estatus !== 'asignado'} aria-label={`Seleccionar ${a.codigo}`}
                              onChange={() => setMarcados(s => { const x = new Set(s); if (x.has(a.id)) x.delete(a.id); else x.add(a.id); return x })} />}
                            <FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} icono={13} className="h-9 w-10 shrink-0 rounded-md" />
                            <Link to={`/activos/${a.id}`} className="min-w-0 flex-1 hover:text-marca">
                              <span className="block font-mono text-[10px] text-marca">{a.codigo}</span>
                              <span className="block truncate text-xs">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</span>
                              <span className="block truncate text-[10px] text-stone-400">{[a.serie && `S/N ${a.serie}`, a.numero_economico, a.estatus !== 'asignado' && a.estatus.replace('_', ' ')].filter(Boolean).join(' · ') || a.ubicacion || a.categoria}</span>
                            </Link>
                            {puedeResguardar && a.estatus === 'asignado' && <button onClick={() => setQuitar({ e, acts: [a] })} title="Desasignar" aria-label={`Desasignar ${a.codigo}`}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-red-600"><Undo2 size={14} /></button>}
                          </li>
                        ))}
                      </ul>
                      {puedeResguardar && (
                        <div className="mt-2 flex gap-2">
                          <button className="btn-sec flex-1 !px-2 !py-1.5 text-xs" disabled={!sel.length} onClick={() => setQuitar({ e, acts: sel })}><Undo2 size={13} />Desasignar {sel.length || ''} seleccionados</button>
                          <button className="btn-sec flex-1 !px-2 !py-1.5 text-xs" onClick={() => setQuitar({ e, acts: suyos })}>Desasignar todo</button>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
      {quitar && <DesasignarModal empleado={quitar.e} activos={quitar.acts} onCerrar={() => setQuitar(null)}
        onListo={() => { setQuitar(null); setMarcados(new Set()); setN(x => x + 1) }} />}
      <EmpleadoModal abierto={nuevo} empresaId={empresaId} onCerrar={() => setNuevo(false)} onGuardado={() => { setNuevo(false); setN(x => x + 1) }} />
      <ImportarEmpleados abierto={importar} empresaId={empresaId} onCerrar={() => setImportar(false)} onListo={() => { setImportar(false); setN(x => x + 1) }} />
    </div>
  )
}

type Opc = { id: string; nombre: string; empresa_id?: string }
function useOpciones(empresaId?: string) {
  const [empresas, setEmpresas] = useState<Opc[]>([])
  const [deptos, setDeptos] = useState<Opc[]>([])
  const cargar = () => {
    supabase.from('empresas').select('id,nombre').eq('activo', true).order('nombre').then(({ data }) => setEmpresas((data as Opc[]) ?? []))
    supabase.from('departamentos').select('id,nombre,empresa_id').eq('activo', true).order('nombre').then(({ data }) => setDeptos((data as Opc[]) ?? []))
  }
  useEffect(cargar, [empresaId])
  return { empresas, deptos, cargar }
}

/** Alta o edición de un empleado. */
export function EmpleadoModal({ abierto, onCerrar, onGuardado, empresaId, empleado }: {
  abierto: boolean; onCerrar: () => void; onGuardado: () => void; empresaId?: string; empleado?: Empleado | null
}) {
  const { empresas, deptos } = useOpciones(empresaId)
  const vacio = { empresa_id: empresaId ?? '', nombres: '', apellidos: '', codigo: '', puesto: '', departamento_id: '', email: '', telefono: '' }
  const [f, setF] = useState(vacio)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    if (!abierto) return
    setError('')
    setF(empleado ? { empresa_id: empleado.empresa_id, nombres: empleado.nombres, apellidos: empleado.apellidos ?? '', codigo: empleado.codigo ?? '', puesto: empleado.puesto ?? '',
      departamento_id: empleado.departamento_id ?? '', email: empleado.email ?? '', telefono: empleado.telefono ?? '' } : { ...vacio, empresa_id: empresaId ?? (empresas.length === 1 ? empresas[0].id : '') })
  }, [abierto, empleado]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(x => ({ ...x, [k]: e.target.value }))

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setError(''); setGuardando(true)
    const datos = { ...f, apellidos: f.apellidos || null, codigo: f.codigo || null, puesto: f.puesto || null, departamento_id: f.departamento_id || null, email: f.email || null, telefono: f.telefono || null }
    const { error } = empleado ? await supabase.from('empleados').update(datos).eq('id', empleado.id) : await supabase.from('empleados').insert(datos)
    setGuardando(false)
    if (error) setError(mensajeError(error)); else onGuardado()
  }
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={empleado ? 'Editar empleado' : 'Nuevo empleado'}>
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        {!empresaId && <Campo label="Empresa *" className="sm:col-span-2"><select className="campo" required value={f.empresa_id} onChange={set('empresa_id')}><option value="">— Elige —</option>{empresas.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>}
        <Campo label="Nombre(s) *"><input className="campo" required autoFocus value={f.nombres} onChange={set('nombres')} /></Campo>
        <Campo label="Apellidos"><input className="campo" value={f.apellidos} onChange={set('apellidos')} /></Campo>
        <Campo label="Puesto"><input className="campo" value={f.puesto} onChange={set('puesto')} placeholder="Ej. Residente de obra" /></Campo>
        <Campo label="Departamento"><select className="campo" value={f.departamento_id} onChange={set('departamento_id')}><option value="">—</option>{deptos.filter(d => d.empresa_id === f.empresa_id).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></Campo>
        <Campo label="No. de empleado"><input className="campo" value={f.codigo} onChange={set('codigo')} /></Campo>
        <Campo label="Teléfono"><input className="campo" type="tel" value={f.telefono} onChange={set('telefono')} /></Campo>
        <Campo label="Correo" className="sm:col-span-2"><input className="campo" type="email" value={f.email} onChange={set('email')} /></Campo>
        {error && <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button></div>
      </form>
    </Modal>
  )
}

const COLS = ['Nombre(s)', 'Apellidos', 'Puesto', 'Departamento', 'No. empleado', 'Correo', 'Teléfono'] as const
type Renglon = { nombres: string; apellidos: string; puesto: string; depto: string; codigo: string; email: string; telefono: string }

/** Pegar una tabla de Excel (copiar → pegar) y dar de alta muchos empleados de un jalón. */
export function ImportarEmpleados({ abierto, onCerrar, onListo, empresaId }: { abierto: boolean; onCerrar: () => void; onListo: () => void; empresaId?: string }) {
  const { empresas, deptos } = useOpciones(empresaId)
  const [empresa, setEmpresa] = useState(empresaId ?? '')
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(0)
  useEffect(() => { if (abierto) { setTexto(''); setError(''); setOk(0); setEmpresa(empresaId ?? '') } }, [abierto, empresaId])

  const renglones = useMemo<Renglon[]>(() => texto.split(/\r?\n/).map(l => l.split('\t').map(c => c.trim())).filter(c => c[0])
    .filter((c, i) => !(i === 0 && /nombre/i.test(c[0])))
    .map(c => ({ nombres: c[0] ?? '', apellidos: c[1] ?? '', puesto: c[2] ?? '', depto: c[3] ?? '', codigo: c[4] ?? '', email: c[5] ?? '', telefono: c[6] ?? '' })), [texto])

  async function importar() {
    if (!empresa) { setError('Elige la empresa.'); return }
    setError(''); setGuardando(true)
    try {
      const mapa = new Map(deptos.filter(d => d.empresa_id === empresa).map(d => [d.nombre.toLowerCase(), d.id]))
      const faltan = [...new Set(renglones.map(r => r.depto).filter(d => d && !mapa.has(d.toLowerCase())))]
      if (faltan.length) {
        const { data, error } = await supabase.from('departamentos').insert(faltan.map(nombre => ({ nombre, empresa_id: empresa }))).select('id,nombre')
        if (error) throw error
        ;(data as Opc[]).forEach(d => mapa.set(d.nombre.toLowerCase(), d.id))
      }
      const filas = renglones.map(r => ({ empresa_id: empresa, nombres: r.nombres, apellidos: r.apellidos || null, puesto: r.puesto || null,
        departamento_id: r.depto ? mapa.get(r.depto.toLowerCase()) ?? null : null, codigo: r.codigo || null, email: r.email || null, telefono: r.telefono || null }))
      const { error } = await supabase.from('empleados').insert(filas)
      if (error) throw error
      setOk(filas.length)
    } catch (e) { setError(mensajeError(e)) } finally { setGuardando(false) }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Importar empleados desde Excel" ancho="max-w-4xl">
      {ok ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><Check size={30} /></div>
          <p className="text-lg font-semibold">{ok} empleados agregados</p>
          <button className="btn-primario mt-6" onClick={onListo}>Listo</button>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="grid gap-2 text-sm sm:grid-cols-3">
            {['En Excel, acomoda las columnas en este orden', 'Selecciona los renglones y copia (Ctrl+C)', 'Pega aquí abajo (Ctrl+V) y revisa'].map((p, i) => (
              <li key={p} className="flex gap-2 rounded-xl border border-stone-200 p-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-marca text-xs font-bold text-[#120D04]">{i + 1}</span><span className="text-stone-600">{p}</span></li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-1.5">{COLS.map((c, i) => <span key={c} className="rounded-md border border-stone-300 bg-stone-50 px-2 py-1 font-mono text-[11px] text-stone-600">{String.fromCharCode(65 + i)} · {c}</span>)}</div>
          {!empresaId && <Campo label="Empresa *"><select className="campo" value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">— Elige —</option>{empresas.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>}
          <textarea className="campo font-mono text-xs" rows={renglones.length ? 4 : 8} value={texto} onChange={e => setTexto(e.target.value)}
            placeholder={'Pega aquí. Ejemplo:\nJuan\tPérez López\tResidente de obra\tObra\t1024\tjperez@empresa.mx\t612 000 0000'} />
          {renglones.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-xl border border-stone-200">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="sticky top-0 bg-[#12151B]"><tr className="text-left text-stone-500"><th className="px-3 py-2">#</th>{COLS.map(c => <th key={c} className="px-3 py-2">{c}</th>)}</tr></thead>
                <tbody className="divide-y divide-stone-100">{renglones.map((r, i) => (
                  <tr key={i}><td className="px-3 py-1.5 text-stone-400">{i + 1}</td><td className="px-3 py-1.5 font-medium">{r.nombres}</td><td className="px-3 py-1.5">{r.apellidos}</td><td className="px-3 py-1.5">{r.puesto}</td><td className="px-3 py-1.5">{r.depto}</td><td className="px-3 py-1.5">{r.codigo}</td><td className="px-3 py-1.5">{r.email}</td><td className="px-3 py-1.5">{r.telefono}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {error && <Aviso>{error}</Aviso>}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-stone-500">{renglones.length ? `${renglones.length} empleado(s) listos. Los departamentos que no existan se crean solos.` : 'La primera fila puede ser el encabezado; se ignora.'}</p>
            <div className="flex gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button><button className="btn-primario" disabled={!renglones.length || guardando} onClick={importar}>{guardando ? 'Importando…' : `Importar ${renglones.length || ''}`}</button></div>
          </div>
        </div>
      )}
    </Modal>
  )
}
