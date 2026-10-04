import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Undo2, CalendarPlus, Check, X, AlarmClock, Hourglass, CalendarDays } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Cargando, Vacio, Aviso } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import { Avatar } from '../components/Empleados'
import { PrestamoBadge, diasPara, fechaCorta, isoDia } from '../components/Prestamo'

export type Prestamo = { activo_id: string; codigo: string; descripcion: string; serie: string | null; empresa_id: string; empresa: string; modelo: string | null; marca: string | null
  modelo_foto: string | null; foto_principal: string | null; categoria: string; movimiento_id: string; folio: string; fecha: string; fecha_devolucion: string; empleado_id: string | null; empleado: string | null }

const FILTROS = [['vencidos', 'Vencidos', AlarmClock], ['pronto', 'Regresan en 3 días', Hourglass], ['todos', 'Todos', CalendarDays]] as const

/** Préstamos temporales: lo que debe regresar y lo que ya se pasó de fecha. */
export default function Prestamos() {
  const { puedeResguardar } = useAuth()
  const [lista, setLista] = useState<Prestamo[] | null>(null)
  const [filtro, setFiltro] = useState<typeof FILTROS[number][0]>('todos')
  const [extender, setExtender] = useState<string | null>(null)
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState('')

  const cargar = () => { supabase.from('v_prestamos').select('*').order('fecha_devolucion').then(({ data }) => setLista((data as Prestamo[]) ?? [])) }
  useEffect(cargar, [])
  useEffect(() => { if (lista && lista.some(p => diasPara(p.fecha_devolucion) < 0) && filtro === 'todos') setFiltro('vencidos') }, [lista]) // eslint-disable-line react-hooks/exhaustive-deps

  async function guardarExtension(p: Prestamo) {
    setError('')
    const { error } = await supabase.from('movimientos').update({ fecha_devolucion: nueva }).eq('id', p.movimiento_id)
    if (error) { setError(mensajeError(error)); return }
    setExtender(null); cargar()
  }

  if (!lista) return <Cargando />
  const venc = lista.filter(p => diasPara(p.fecha_devolucion) < 0)
  const pronto = lista.filter(p => { const n = diasPara(p.fecha_devolucion); return n >= 0 && n <= 3 })
  const vis = filtro === 'vencidos' ? venc : filtro === 'pronto' ? pronto : lista
  const conteo = { vencidos: venc.length, pronto: pronto.length, todos: lista.length }
  const manana = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDia(d) })()

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Préstamos</h1>
          <p className="mt-1 text-sm text-stone-500">Activos entregados con fecha de regreso. Para prestar algo, haz un resguardo y elige “¿Hasta cuándo?”.</p>
        </div>
        {puedeResguardar && <Link to="/resguardos/nuevo?tipo=asignacion" className="btn-primario"><CalendarClock size={16} />Nuevo préstamo</Link>}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        {FILTROS.map(([k, t, I]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`tarjeta p-4 text-left transition ${filtro === k ? '!border-marca ring-2 ring-marca/30' : 'hover:border-stone-300'}`}>
            <I size={18} className={k === 'vencidos' && conteo.vencidos ? 'text-red-700' : 'text-marca'} />
            <p className={`cifra mt-2 text-3xl font-semibold ${k === 'vencidos' && conteo.vencidos ? 'text-red-700' : ''}`}>{conteo[k]}</p>
            <p className="text-[11px] uppercase tracking-wider text-stone-500">{t}</p>
          </button>
        ))}
      </div>
      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}

      {vis.length === 0 ? <div className="tarjeta"><Vacio titulo={filtro === 'vencidos' ? 'Nada vencido' : 'Sin préstamos aquí'} texto={filtro === 'vencidos' ? 'Todo lo prestado está dentro de su fecha.' : 'Cuando prestes un activo con fecha de regreso, aparecerá aquí.'} /></div> : (
        <div className="space-y-3">
          {vis.map((p, i) => {
            const n = diasPara(p.fecha_devolucion)
            return (
              <div key={p.activo_id} className={`tarjeta flex min-w-0 animate-entrar flex-col gap-4 p-4 sm:flex-row sm:items-center ${n < 0 ? '!border-red-200' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
                <Link to={`/activos/${p.activo_id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <FotoActivo foto={p.foto_principal} fotoModelo={p.modelo_foto} categoria={p.categoria} className="h-16 w-20 shrink-0 rounded-xl" icono={22} />
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-marca">{p.codigo}</p>
                    <p className="truncate font-medium">{[p.marca, p.modelo].filter(Boolean).join(' ') || p.descripcion}</p>
                    <p className="truncate text-xs text-stone-500">{p.empresa} · prestado el {fechaCorta(p.fecha)} · {p.folio}</p>
                  </div>
                </Link>
                {p.empleado_id && <Link to={`/empleados/${p.empleado_id}`} className="flex items-center gap-2 sm:w-52"><Avatar e={{ id: p.empleado_id, nombres: p.empleado ?? '' }} tam={32} /><span className="truncate text-sm">{p.empleado}</span></Link>}
                <div className="sm:w-48"><PrestamoBadge fecha={p.fecha_devolucion} /></div>
                {puedeResguardar && (
                  extender === p.activo_id ? (
                    <div className="flex items-center gap-1.5">
                      <input type="date" className="campo !w-auto !py-1.5 text-xs" min={manana} value={nueva} onChange={e => setNueva(e.target.value)} />
                      <button className="grid h-8 w-8 place-items-center rounded-lg bg-marca text-[#120D04] disabled:opacity-40" disabled={!nueva} onClick={() => guardarExtension(p)} aria-label="Guardar"><Check size={15} /></button>
                      <button className="grid h-8 w-8 place-items-center rounded-lg border border-stone-300 text-stone-500" onClick={() => setExtender(null)} aria-label="Cancelar"><X size={15} /></button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button className="btn-sec !px-3 !py-1.5 text-xs" onClick={() => { setExtender(p.activo_id); setNueva(manana) }}><CalendarPlus size={14} />Extender</button>
                      <Link to={`/resguardos/nuevo?tipo=devolucion&activos=${p.activo_id}`} className="btn-primario !px-3 !py-1.5 text-xs"><Undo2 size={14} />Regresó</Link>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
