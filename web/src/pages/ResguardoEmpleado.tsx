import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Undo2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nombreEmpleado, moneda } from '../lib/hooks'
import { Cargando, Aviso, Vacio } from '../components/ui'
import type { ActivoFila } from './Activos'
import { LogoFirme } from '../components/Logo'

type Emp = { id: string; nombres: string; apellidos: string | null; puesto: string | null; codigo: string | null; empresas: { nombre: string; razon_social: string | null } | null }

/** Todos los activos que hoy tiene un empleado, listo para imprimir como resguardo consolidado. */
export default function ResguardoEmpleado() {
  const { id } = useParams()
  const { puedeResguardar } = useAuth()
  const [emp, setEmp] = useState<Emp | null>(null)
  const [activos, setActivos] = useState<(ActivoFila & { valor_referencia: number | null })[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('empleados').select('id,nombres,apellidos,puesto,codigo,empresas(nombre,razon_social)').eq('id', id!).single(),
      supabase.from('v_activos').select('*').eq('responsable_id', id!).neq('estatus', 'baja').order('codigo'),
    ]).then(([re, ra]) => {
      if (re.error) setError(mensajeError(re.error))
      setEmp(re.data as unknown as Emp); setActivos((ra.data as never) ?? [])
    })
  }, [id])

  if (error) return <Aviso>{error}</Aviso>
  if (!emp || !activos) return <Cargando />
  const nombre = nombreEmpleado(emp)
  const empresa = emp.empresas?.razon_social || emp.empresas?.nombre || ''
  const total = activos.reduce((s, a) => s + (a.valor_referencia ?? 0), 0)

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/empleados" className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Empleados</Link>
          <h1 className="text-2xl font-semibold">Resguardo vigente · {nombre}</h1>
          <p className="text-sm text-stone-500">{activos.length} activo(s) a su cargo hoy.</p>
        </div>
        <div className="flex gap-2">
          {puedeResguardar && activos.length > 0 && (
            <Link className="btn-sec" to={`/resguardos/nuevo?tipo=devolucion&activos=${activos.map(a => a.id).join(',')}`}><Undo2 size={16} />Devolver todo</Link>
          )}
          <button className="btn-primario" onClick={() => window.print()} disabled={!activos.length}><Printer size={16} />Imprimir</button>
        </div>
      </div>

      {activos.length === 0 ? <div className="tarjeta"><Vacio titulo="Sin activos a su cargo" texto="Este empleado no tiene activos asignados en este momento." /></div> : (
        <article className="papel tarjeta mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed print:border-0 print:p-0">
          <header className="mb-6 flex items-start justify-between border-b-2 border-tinta pb-4">
            <div className="flex items-center gap-3">
              <LogoFirme className="h-9 w-auto text-black" />
              <div><p className="font-semibold">{empresa}</p><p className="text-xs text-stone-500">Control de activos</p></div>
            </div>
            <p className="text-right text-xs">{new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })}</p>
          </header>
          <h2 className="mb-4 text-center text-base font-semibold uppercase tracking-wide">Resguardo vigente de activos</h2>
          <p className="mb-4">
            <b>{nombre}</b>{emp.puesto ? `, ${emp.puesto}` : ''}{emp.codigo ? ` (No. ${emp.codigo})` : ''}, reconoce tener bajo su resguardo los activos de <b>{empresa}</b> que
            se listan a continuación, y se compromete a cuidarlos, usarlos solo para su trabajo, reportar cualquier daño, pérdida o robo y devolverlos cuando se le soliciten.
          </p>
          <div className="mb-4 overflow-x-auto print:overflow-visible"><table className="w-full min-w-[520px] border-collapse text-xs print:min-w-0">
            <thead><tr className="border-y border-stone-400 bg-stone-50 text-left">
              <th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Código</th><th className="px-2 py-1.5">Descripción</th><th className="px-2 py-1.5">Serie / No. econ.</th><th className="px-2 py-1.5">Ubicación</th>
            </tr></thead>
            <tbody>
              {activos.map((a, i) => (
                <tr key={a.id} className="border-b border-stone-200">
                  <td className="px-2 py-1.5">{i + 1}</td><td className="whitespace-nowrap px-2 py-1.5 font-mono">{a.codigo}</td>
                  <td className="px-2 py-1.5">{a.descripcion}{a.marca ? <span className="text-stone-500"> · {[a.marca, a.modelo].filter(Boolean).join(' ')}</span> : null}</td>
                  <td className="px-2 py-1.5">{[a.serie, a.numero_economico].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="px-2 py-1.5">{a.ubicacion ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="mb-10 text-xs text-stone-500">Total: {activos.length} activo(s){total ? ` · valor de referencia ${moneda(total)}` : ''}.</p>
          <div className="mt-12 grid grid-cols-2 gap-10 text-center">
            <div className="border-t border-tinta pt-1"><p className="font-medium">&nbsp;</p><p className="text-xs text-stone-500">Entrega (empresa)</p></div>
            <div className="border-t border-tinta pt-1"><p className="font-medium">{nombre}</p><p className="text-xs text-stone-500">Recibe</p></div>
          </div>
        </article>
      )}
    </div>
  )
}
