import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, UserPlus, Undo2, ArrowLeftRight, Siren, FileText, ClipboardCheck, Building2, Pencil, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Evento = { fecha: string; icono: LucideIcon; color: string; titulo: string; detalle?: string; to?: string }
const MOV: Record<string, [LucideIcon, string, string]> = { asignacion: [UserPlus, '#38BDF8', 'Asignado'], devolucion: [Undo2, '#34D399', 'Devuelto'], traspaso: [ArrowLeftRight, '#A78BFA', 'Traspaso'] }
const CAMPO: Record<string, string> = { estatus: 'estatus', ubicacion_id: 'ubicación', responsable_id: 'responsable', descripcion: 'descripción', serie: 'serie', numero_economico: 'No. económico', empresa_id: 'empresa', notas: 'notas', valor_referencia: 'valor' }

/** Todo lo que le ha pasado a un activo, en orden: alta, resguardos, reportes, documentos, conteos y cambios. */
export default function LineaTiempo({ activoId, alta }: { activoId: string; alta: string }) {
  const [ev, setEv] = useState<Evento[] | null>(null)
  const [todos, setTodos] = useState(false)
  useEffect(() => {
    Promise.all([
      supabase.from('movimiento_activos').select('estado_fisico, movimientos(id,folio,tipo,fecha,recibe_nombre,entrega_nombre,cancelado,fecha_devolucion)').eq('activo_id', activoId),
      supabase.from('reportes').select('id,folio,tipo,descripcion,estatus,created_at,resuelto_at,resolucion').eq('activo_id', activoId),
      supabase.from('documentos').select('id,tipo,numero,created_at,renovado_de').eq('activo_id', activoId),
      supabase.from('inventario_lecturas').select('created_at, inventarios(id,folio,nombre)').eq('activo_id', activoId),
      supabase.from('bitacora').select('id,accion,fecha,antes,despues').eq('tabla', 'activos').eq('registro_id', activoId).eq('accion', 'UPDATE').order('fecha', { ascending: false }).limit(30),
    ]).then(([m, r, d, i, b]) => {
      const out: Evento[] = [{ fecha: alta, icono: Sparkles, color: '#F9B234', titulo: 'Alta en el sistema' }]
      for (const x of (m.data ?? []) as unknown as { estado_fisico: string | null; movimientos: { id: string; folio: string; tipo: string; fecha: string; recibe_nombre: string | null; entrega_nombre: string | null; cancelado: boolean; fecha_devolucion: string | null } | null }[]) {
        const mv = x.movimientos; if (!mv || mv.cancelado) continue
        const [I, c, t] = MOV[mv.tipo] ?? MOV.traspaso
        out.push({ fecha: mv.fecha, icono: I, color: c, titulo: `${t}${mv.tipo === 'asignacion' && mv.recibe_nombre ? ` a ${mv.recibe_nombre}` : mv.tipo === 'devolucion' && mv.entrega_nombre ? ` por ${mv.entrega_nombre}` : ''}`, detalle: [mv.folio, mv.fecha_devolucion ? 'préstamo' : null, x.estado_fisico].filter(Boolean).join(' · '), to: `/resguardos/${mv.id}` })
      }
      for (const x of (r.data ?? []) as { folio: string; descripcion: string; created_at: string; resuelto_at: string | null; resolucion: string | null }[]) {
        out.push({ fecha: x.created_at, icono: Siren, color: '#FF5A5F', titulo: `Reporte ${x.folio}`, detalle: x.descripcion, to: '/reportes' })
        if (x.resuelto_at) out.push({ fecha: x.resuelto_at, icono: Siren, color: '#34D399', titulo: `Resuelto ${x.folio}`, detalle: x.resolucion ?? undefined, to: '/reportes' })
      }
      for (const x of (d.data ?? []) as { tipo: string; numero: string | null; created_at: string; renovado_de: string | null }[])
        out.push({ fecha: x.created_at, icono: FileText, color: '#94A3B8', titulo: `${x.renovado_de ? 'Renovado' : 'Documento'}: ${x.tipo.replace(/_/g, ' ')}`, detalle: x.numero ?? undefined })
      for (const x of (i.data ?? []) as unknown as { created_at: string; inventarios: { id: string; folio: string; nombre: string } | null }[])
        out.push({ fecha: x.created_at, icono: ClipboardCheck, color: '#2DD4BF', titulo: 'Contado en inventario', detalle: x.inventarios ? `${x.inventarios.folio} · ${x.inventarios.nombre}` : undefined, to: x.inventarios ? `/inventarios/${x.inventarios.id}` : undefined })
      for (const x of (b.data ?? []) as { fecha: string; antes: Record<string, unknown> | null; despues: Record<string, unknown> | null }[]) {
        const cambios = Object.keys(CAMPO).filter(k => x.antes && x.despues && JSON.stringify(x.antes[k]) !== JSON.stringify(x.despues[k]))
        if (!cambios.length || cambios.every(k => k === 'responsable_id' || k === 'estatus' || k === 'ubicacion_id')) continue   // ya cubiertos por resguardos
        out.push({ fecha: x.fecha, icono: cambios.includes('empresa_id') ? Building2 : Pencil, color: '#78716C', titulo: cambios.includes('empresa_id') ? 'Cambió de empresa' : 'Datos editados', detalle: cambios.map(k => CAMPO[k]).join(', ') })
      }
      setEv(out.sort((a, b) => b.fecha.localeCompare(a.fecha)))
    })
  }, [activoId, alta])

  if (!ev) return null
  const vis = todos ? ev : ev.slice(0, 7)
  return (
    <section className="tarjeta p-5">
      <h2 className="mb-4 font-semibold">Línea de tiempo</h2>
      <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-stone-300">
        {vis.map((e, k) => {
          const contenido = <>
            <p className="text-sm font-medium group-hover:text-marca">{e.titulo}</p>
            {e.detalle && <p className="line-clamp-2 text-xs text-stone-500">{e.detalle}</p>}
            <p className="text-[11px] text-stone-400">{new Date(e.fecha).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</p>
          </>
          return (
            <li key={k} className="relative pl-10">
              <span className="absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full border-2 border-[#0B0D11]" style={{ background: `${e.color}26`, color: e.color, boxShadow: `0 0 12px -2px ${e.color}88` }}><e.icono size={13} /></span>
              {e.to ? <Link to={e.to} className="group block">{contenido}</Link> : <div>{contenido}</div>}
            </li>
          )
        })}
      </ol>
      {ev.length > 7 && <button className="mt-4 text-xs text-marca hover:underline" onClick={() => setTodos(t => !t)}>{todos ? 'Ver menos' : `Ver los ${ev.length} eventos`}</button>}
    </section>
  )
}
