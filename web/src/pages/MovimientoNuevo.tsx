import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SelectorPrestamo } from '../components/Prestamo'
import { ArrowLeft, Search, X, Plus } from 'lucide-react'
import { supabase, mensajeError, TIPOS_MOV, BUCKET, type TipoMov, type Estatus } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista, nombreEmpleado } from '../lib/hooks'
import { Encabezado, Campo, Aviso, EstatusBadge } from '../components/ui'
import FirmaPad, { type FirmaPadRef } from '../components/FirmaPad'

type Act = { id: string; codigo: string; descripcion: string; estatus: Estatus; serie: string | null; numero_economico: string | null
  responsable: string | null; ubicacion: string | null; empresa_id: string; marca: string | null; modelo: string | null }

const ELEGIBLES: Record<TipoMov, Estatus[]> = {
  asignacion: ['disponible'],
  devolucion: ['asignado'],
  traspaso: ['disponible', 'asignado', 'mantenimiento'],
}

const AYUDA: Record<TipoMov, string> = {
  asignacion: 'Entrega de activos disponibles a un empleado. Quedan como "Asignado" bajo su resguardo.',
  devolucion: 'El empleado regresa activos. Quedan "Disponible" en la ubicación que elijas.',
  traspaso: 'Cambia la ubicación o el responsable de activos que ya están en uso.',
}

export default function MovimientoNuevo() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { perfil } = useAuth()
  const empresas = useLista('empresas')
  const ubicaciones = useLista('ubicaciones', 'id,nombre,empresa_id,tipo')
  const empleados = useLista('empleados', 'id,nombres,apellidos,empresa_id,puesto', 'nombres')

  const [tipo, setTipo] = useState<TipoMov>((sp.get('tipo') as TipoMov) || 'asignacion')
  const [empresa, setEmpresa] = useState('')
  const [sel, setSel] = useState<Act[]>([])
  const [estados, setEstados] = useState<Record<string, string>>({})
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<Act[]>([])
  const [aEmpleado, setAEmpleado] = useState('')
  const [aUbicacion, setAUbicacion] = useState('')
  const [entrega, setEntrega] = useState(perfil?.nombre ?? '')
  const [recibe, setRecibe] = useState('')
  const [notas, setNotas] = useState('')
  const [fechaDev, setFechaDev] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const firmaRecibe = useRef<FirmaPadRef>(null)
  const firmaEntrega = useRef<FirmaPadRef>(null)

  // activo(s) precargados desde la ficha
  useEffect(() => {
    const ids = sp.get('activos')
    if (!ids) return
    supabase.from('v_activos').select('*').in('id', ids.split(',')).then(({ data }) => {
      const a = (data as Act[]) ?? []
      const t = (sp.get('tipo') as TipoMov) || 'asignacion'
      const ok = a.filter(x => x.empresa_id === a[0]?.empresa_id && ELEGIBLES[t].includes(x.estatus))
      if (a.length) { setEmpresa(a[0].empresa_id); setSel(ok) }
    })
  }, [sp])

  // empresa y empleado precargados desde la ficha de empresa o de empleado
  useEffect(() => {
    if (sp.get('empresa')) setEmpresa(sp.get('empresa')!)
    if (sp.get('empleado')) setAEmpleado(sp.get('empleado')!)
  }, [sp])

  useEffect(() => { if (!empresa && empresas.items.length === 1) setEmpresa(empresas.items[0].id) }, [empresas.items, empresa])

  // al cambiar tipo, quitar seleccionados que ya no aplican
  useEffect(() => { setSel(s => s.filter(a => ELEGIBLES[tipo].includes(a.estatus))) }, [tipo])

  // nombre de quien recibe
  useEffect(() => {
    if (tipo === 'devolucion') { setRecibe(perfil?.nombre ?? ''); return }
    const e = empleados.items.find(x => x.id === aEmpleado)
    setRecibe(e ? nombreEmpleado(e as never) : '')
  }, [aEmpleado, tipo, empleados.items, perfil])

  useEffect(() => {
    if (tipo === 'devolucion') {
      const r = sel.map(a => a.responsable).filter(Boolean)
      if (r.length && r.every(x => x === r[0])) setEntrega(r[0]!)
    } else setEntrega(perfil?.nombre ?? '')
  }, [tipo, sel, perfil])

  // búsqueda de activos elegibles
  useEffect(() => {
    if (!empresa) { setResultados([]); return }
    const t = busca.replace(/[%,()"]/g, ' ').trim()
    const h = setTimeout(async () => {
      let q = supabase.from('v_activos').select('*').eq('empresa_id', empresa).in('estatus', ELEGIBLES[tipo]).order('codigo').limit(20)
      if (t) q = q.or(`codigo.ilike.%${t}%,descripcion.ilike.%${t}%,serie.ilike.%${t}%,numero_economico.ilike.%${t}%,responsable.ilike.%${t}%`)
      const { data } = await q
      setResultados((data as Act[]) ?? [])
    }, 250)
    return () => clearTimeout(h)
  }, [busca, empresa, tipo])

  const ubicVis = useMemo(() => ubicaciones.items.filter(u => u.empresa_id === empresa), [ubicaciones.items, empresa])
  const empVis = useMemo(() => empleados.items.filter(u => u.empresa_id === empresa), [empleados.items, empresa])
  const yaSel = new Set(sel.map(a => a.id))

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sel.length) { setError('Agrega al menos un activo.'); return }
    if (tipo === 'asignacion' && firmaRecibe.current?.vacio()) {
      if (!confirm('No hay firma de quien recibe. ¿Guardar de todos modos? Podrás firmar después desde la carta.')) return
    }
    setGuardando(true)
    try {
      const { data: id, error } = await supabase.rpc('registrar_movimiento', {
        p_tipo: tipo, p_empresa: empresa, p_activos: sel.map(a => a.id),
        p_a_empleado: aEmpleado || null, p_a_ubicacion: aUbicacion || null,
        p_entrega_nombre: entrega, p_recibe_nombre: recibe, p_notas: notas, p_estados: estados,
      })
      if (error) throw error
      const cambios: Record<string, string> = {}
      for (const [k, pad] of [['firma_recibe', firmaRecibe], ['firma_entrega', firmaEntrega]] as const) {
        const b = await pad.current?.blob()
        if (!b) continue
        const path = `${empresa}/movimientos/${id}/${k}.png`
        const up = await supabase.storage.from(BUCKET).upload(path, b, { contentType: 'image/png', upsert: true })
        if (!up.error) cambios[k] = path
      }
      if (fechaDev && tipo !== 'devolucion') cambios.fecha_devolucion = fechaDev
      if (Object.keys(cambios).length) await supabase.from('movimientos').update(cambios).eq('id', id)
      nav(`/resguardos/${id}`, { replace: true })
    } catch (err) {
      setError(mensajeError(err)); setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar}>
      <Link to="/resguardos" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Resguardos</Link>
      <Encabezado titulo="Nuevo movimiento" sub={AYUDA[tipo]} />

      <div className="mb-6 inline-flex rounded-lg border border-stone-300 bg-white p-1">
        {(Object.keys(TIPOS_MOV) as TipoMov[]).map(t => (
          <button key={t} type="button" onClick={() => setTipo(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tipo === t ? 'bg-marca text-[#120D04] shadow-[0_0_18px_-4px_rgb(249_178_52/.8)]' : 'text-stone-600 hover:bg-stone-100'}`}>
            {TIPOS_MOV[t].verbo}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="tarjeta p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="font-semibold">Activos ({sel.length})</h2>
              <select className="campo w-auto" value={empresa} onChange={e => { setEmpresa(e.target.value); setSel([]); setAEmpleado(''); setAUbicacion('') }}>
                <option value="">— Empresa —</option>{empresas.items.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </div>

            {sel.length > 0 && (
              <ul className="mb-4 divide-y divide-stone-100 rounded-lg border border-stone-200">
                {sel.map(a => (
                  <li key={a.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_14rem_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium"><span className="font-mono text-xs text-stone-500">{a.codigo}</span> · {a.descripcion}</p>
                      <p className="truncate text-xs text-stone-500">{[a.serie && `S/N ${a.serie}`, a.responsable, a.ubicacion].filter(Boolean).join(' · ')}</p>
                    </div>
                    <input className="campo py-1.5 text-xs" placeholder="Estado físico (opcional)" value={estados[a.id] ?? ''}
                      onChange={e => setEstados(s => ({ ...s, [a.id]: e.target.value }))} />
                    <button type="button" className="justify-self-end rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-rojo" aria-label="Quitar"
                      onClick={() => setSel(s => s.filter(x => x.id !== a.id))}><X size={16} /></button>
                  </li>
                ))}
              </ul>
            )}

            {empresa ? (
              <>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input className="campo pl-9" placeholder={`Buscar activos ${tipo === 'asignacion' ? 'disponibles' : tipo === 'devolucion' ? 'asignados' : 'en uso'}: código, descripción, serie${tipo !== 'asignacion' ? ', responsable' : ''}`}
                    value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
                <ul className="mt-2 max-h-72 divide-y divide-stone-100 overflow-y-auto">
                  {resultados.filter(a => !yaSel.has(a.id)).map(a => (
                    <li key={a.id}>
                      <button type="button" onClick={() => setSel(s => [...s, a])} className="flex w-full items-center gap-3 px-2 py-2 text-left hover:bg-stone-50">
                        <Plus size={15} className="shrink-0 text-marca-oscuro" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm"><span className="font-mono text-xs text-stone-500">{a.codigo}</span> · {a.descripcion}</span>
                          <span className="block truncate text-xs text-stone-500">{[a.marca, a.modelo, a.responsable, a.ubicacion].filter(Boolean).join(' · ')}</span>
                        </span>
                        <EstatusBadge estatus={a.estatus} />
                      </button>
                    </li>
                  ))}
                  {resultados.filter(a => !yaSel.has(a.id)).length === 0 && <li className="px-2 py-3 text-sm text-stone-500">No hay más activos que coincidan.</li>}
                </ul>
              </>
            ) : <p className="text-sm text-stone-500">Elige la empresa para buscar sus activos.</p>}
          </section>

          <section className="tarjeta p-5">
            <h2 className="mb-4 font-semibold">Firmas</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <Campo label="Entrega (nombre)"><input className="campo mb-3" value={entrega} onChange={e => setEntrega(e.target.value)} /></Campo>
                <FirmaPad ref={firmaEntrega} titulo="Firma de quien entrega" />
              </div>
              <div>
                <Campo label="Recibe (nombre)"><input className="campo mb-3" value={recibe} onChange={e => setRecibe(e.target.value)} /></Campo>
                <FirmaPad ref={firmaRecibe} titulo="Firma de quien recibe" />
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="tarjeta p-5">
            <h2 className="mb-4 font-semibold">Destino</h2>
            <div className="space-y-4">
              {tipo !== 'devolucion' && (
                <Campo label={tipo === 'asignacion' ? 'Se entrega a *' : 'Nuevo responsable'}>
                  <select className="campo" required={tipo === 'asignacion'} disabled={!empresa} value={aEmpleado} onChange={e => setAEmpleado(e.target.value)}>
                    <option value="">{tipo === 'traspaso' ? '— Mismo responsable —' : '— Selecciona —'}</option>
                    {empVis.map(o => <option key={o.id} value={o.id}>{nombreEmpleado(o as never)}{o.puesto ? ` · ${o.puesto}` : ''}</option>)}
                  </select>
                </Campo>
              )}
              <Campo label={tipo === 'devolucion' ? 'Regresa a *' : tipo === 'asignacion' ? 'Ubicación de uso' : 'Nueva ubicación'}>
                <select className="campo" required={tipo === 'devolucion'} disabled={!empresa} value={aUbicacion} onChange={e => setAUbicacion(e.target.value)}>
                  <option value="">{tipo === 'devolucion' ? '— Selecciona —' : '— Misma ubicación —'}</option>
                  {ubicVis.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </Campo>
              {tipo !== 'devolucion' && <SelectorPrestamo valor={fechaDev} onCambio={setFechaDev} />}
              <Campo label="Notas">
                <textarea className="campo" rows={3} placeholder="Motivo, accesorios entregados, observaciones…" value={notas} onChange={e => setNotas(e.target.value)} />
              </Campo>
            </div>
          </section>
          {error && <Aviso>{error}</Aviso>}
          <button className="btn-primario w-full" disabled={guardando || !sel.length}>
            {guardando ? 'Guardando…' : `${TIPOS_MOV[tipo].verbo} ${sel.length || ''} activo${sel.length === 1 ? '' : 's'}`}
          </button>
          <p className="text-xs text-stone-500">Al guardar se genera la carta responsiva con folio para imprimir.</p>
        </div>
      </div>
    </form>
  )
}
