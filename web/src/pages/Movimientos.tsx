import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, PenLine } from 'lucide-react'
import { supabase, mensajeError, TIPOS_MOV, type TipoMov } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useLista } from '../lib/hooks'
import { Encabezado, Cargando, Vacio, Aviso } from '../components/ui'

type Mov = { id: string; folio: string; tipo: TipoMov; fecha: string; empresa: string; a_empleado: string | null; a_ubicacion: string | null
  recibe_nombre: string | null; entrega_nombre: string | null; firmado: boolean; num_activos: number }

export function TipoBadge({ tipo }: { tipo: TipoMov }) {
  const t = TIPOS_MOV[tipo]
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${t.clase}`}>{t.texto}</span>
}

export default function Movimientos() {
  const { puedeResguardar } = useAuth()
  const nav = useNavigate()
  const empresas = useLista('empresas')
  const [filas, setFilas] = useState<Mov[] | null>(null)
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [sinFirma, setSinFirma] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = setTimeout(async () => {
      let qy = supabase.from('v_movimientos').select('*').order('fecha', { ascending: false }).limit(200)
      if (tipo) qy = qy.eq('tipo', tipo)
      if (empresa) qy = qy.eq('empresa_id', empresa)
      if (sinFirma) qy = qy.eq('firmado', false)
      const t = q.replace(/[%,()"]/g, ' ').trim()
      if (t) qy = qy.or(`folio.ilike.%${t}%,a_empleado.ilike.%${t}%,recibe_nombre.ilike.%${t}%,entrega_nombre.ilike.%${t}%,a_ubicacion.ilike.%${t}%`)
      const { data, error } = await qy
      if (error) setError(mensajeError(error))
      setFilas((data as Mov[]) ?? [])
    }, 250)
    return () => clearTimeout(h)
  }, [q, tipo, empresa, sinFirma])

  return (
    <div>
      <Encabezado titulo="Resguardos" sub="Asignaciones, devoluciones y traspasos con su carta responsiva."
        acciones={puedeResguardar && <Link className="btn-primario" to="/resguardos/nuevo"><Plus size={16} />Nuevo movimiento</Link>} />
      <div className="tarjeta">
        <div className="grid gap-3 border-b border-stone-200 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input className="campo pl-9" placeholder="Folio, empleado, ubicación…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select className="campo" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos los tipos</option>{Object.entries(TIPOS_MOV).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select>
          <select className="campo" value={empresa} onChange={e => setEmpresa(e.target.value)}>
            <option value="">Todas las empresas</option>{empresas.items.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-stone-600"><input type="checkbox" checked={sinFirma} onChange={e => setSinFirma(e.target.checked)} />Solo sin firma</label>
        </div>
        {error && <div className="p-3"><Aviso>{error}</Aviso></div>}
        {!filas ? <div className="px-4"><Cargando /></div> : filas.length === 0 ? (
          <Vacio titulo="Sin movimientos" texto="Aquí aparecerá cada entrega, devolución o traspaso de activos."
            accion={puedeResguardar && <Link className="btn-sec" to="/resguardos/nuevo"><Plus size={16} />Registrar el primero</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="px-4 py-2.5 font-medium">Folio</th><th className="px-4 py-2.5 font-medium">Fecha</th><th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Entrega → Recibe</th><th className="px-4 py-2.5 font-medium">Destino</th><th className="px-4 py-2.5 text-right font-medium">Activos</th><th className="px-4 py-2.5 font-medium">Firma</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filas.map(m => (
                  <tr key={m.id} className="cursor-pointer hover:bg-stone-50" onClick={() => nav(`/resguardos/${m.id}`)}>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{m.folio}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{new Date(m.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-2.5"><TipoBadge tipo={m.tipo} /></td>
                    <td className="px-4 py-2.5">{m.entrega_nombre ?? '—'} <span className="text-stone-400">→</span> {m.recibe_nombre ?? m.a_empleado ?? '—'}</td>
                    <td className="px-4 py-2.5"><p>{m.a_ubicacion ?? '—'}</p><p className="text-xs text-stone-500">{m.empresa}</p></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{m.num_activos}</td>
                    <td className="px-4 py-2.5">{m.firmado ? <span className="text-emerald-700">Firmado</span> : <span className="inline-flex items-center gap-1 text-amber-700"><PenLine size={13} />Pendiente</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
