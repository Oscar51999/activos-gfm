import { supabase } from './supabase'

export type Falta = { activo_id: string; codigo: string; requisito: string; tipo: string; bloquea: boolean }

/** Revisa si un empleado tiene los documentos vigentes que piden los equipos que se le van a asignar (licencia, DC-3). */
export async function revisarRequisitos(activoIds: string[], empleadoId: string): Promise<Falta[]> {
  if (!activoIds.length || !empleadoId) return []
  const [a, r, d] = await Promise.all([
    supabase.from('activos').select('id,codigo,categoria_id,modelo_id').in('id', activoIds),
    supabase.from('requisitos_operacion').select('categoria_id,modelo_id,tipo_documento,descripcion,bloquear').eq('activo', true),
    supabase.from('documentos').select('tipo,fecha_vencimiento').eq('empleado_id', empleadoId).eq('vigente', true),
  ])
  const reqs = (r.data ?? []) as { categoria_id: string | null; modelo_id: string | null; tipo_documento: string; descripcion: string; bloquear: boolean }[]
  if (!reqs.length) return []
  const hoy = new Date().toISOString().slice(0, 10)
  const tiene = new Set(((d.data ?? []) as { tipo: string; fecha_vencimiento: string | null }[]).filter(x => !x.fecha_vencimiento || x.fecha_vencimiento >= hoy).map(x => x.tipo))
  const out: Falta[] = []
  for (const x of (a.data ?? []) as { id: string; codigo: string; categoria_id: string | null; modelo_id: string | null }[]) {
    for (const q of reqs.filter(q => (q.modelo_id && q.modelo_id === x.modelo_id) || (!q.modelo_id && q.categoria_id === x.categoria_id))) {
      if (!tiene.has(q.tipo_documento)) out.push({ activo_id: x.id, codigo: x.codigo, requisito: q.descripcion, tipo: q.tipo_documento, bloquea: q.bloquear })
    }
  }
  return out
}
