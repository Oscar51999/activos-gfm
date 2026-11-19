import { supabase } from './supabase'

export type Falta = { activo_id: string; codigo: string; requisito: string; tipo: string; bloquea: boolean }
type Req = { categoria_id: string | null; modelo_id: string | null; tipo_documento: string; descripcion: string; bloquear: boolean }
type Cat = { id: string; padre_id: string | null; es_vehiculo: boolean }

const hoy = () => new Date().toISOString().slice(0, 10)

async function base(empleadoId: string) {
  const [r, d, c] = await Promise.all([
    supabase.from('requisitos_operacion').select('categoria_id,modelo_id,tipo_documento,descripcion,bloquear').eq('activo', true),
    supabase.from('documentos').select('tipo,fecha_vencimiento').eq('empleado_id', empleadoId).eq('vigente', true),
    supabase.from('categorias').select('id,padre_id,es_vehiculo'),
  ])
  const tiene = new Set(((d.data ?? []) as { tipo: string; fecha_vencimiento: string | null }[]).filter(x => !x.fecha_vencimiento || x.fecha_vencimiento >= hoy()).map(x => x.tipo))
  return { reqs: (r.data ?? []) as Req[], tiene, cats: new Map(((c.data ?? []) as Cat[]).map(x => [x.id, x])) }
}

/** Qué le falta al empleado para un equipo de cierta categoría / modelo (licencia de manejo para vehículos, DC-3…). Igual que la regla del servidor. */
function faltantes(reqs: Req[], tiene: Set<string>, cats: Map<string, Cat>, categoriaId: string | null, modeloId: string | null) {
  const c = categoriaId ? cats.get(categoriaId) : undefined
  const aplica = reqs.filter(q => (q.modelo_id && q.modelo_id === modeloId) || (!q.modelo_id && q.categoria_id && (q.categoria_id === categoriaId || q.categoria_id === c?.padre_id)))
  if (c?.es_vehiculo && !aplica.some(q => q.tipo_documento === 'licencia_manejo' && q.bloquear)) aplica.push({ categoria_id: categoriaId, modelo_id: null, tipo_documento: 'licencia_manejo', descripcion: 'Licencia de manejo vigente', bloquear: true })
  return aplica.filter(q => !tiene.has(q.tipo_documento))
}

/** Revisa si un empleado tiene los documentos vigentes que piden los equipos que se le van a asignar (licencia, DC-3). */
export async function revisarRequisitos(activoIds: string[], empleadoId: string): Promise<Falta[]> {
  if (!activoIds.length || !empleadoId) return []
  const [{ reqs, tiene, cats }, a] = await Promise.all([base(empleadoId), supabase.from('activos').select('id,codigo,categoria_id,modelo_id').in('id', activoIds)])
  const out: Falta[] = []
  for (const x of (a.data ?? []) as { id: string; codigo: string; categoria_id: string | null; modelo_id: string | null }[])
    for (const q of faltantes(reqs, tiene, cats, x.categoria_id, x.modelo_id)) out.push({ activo_id: x.id, codigo: x.codigo, requisito: q.descripcion, tipo: q.tipo_documento, bloquea: q.bloquear })
  return out
}

/** Antes de dar de alta y asignar: ¿qué documentos le faltan al empleado para estas categorías/modelos? (solo los que bloquean) */
export async function faltanParaAsignar(empleadoId: string, equipos: { categoria_id: string | null; modelo_id?: string | null }[]): Promise<string[]> {
  if (!empleadoId || !equipos.length) return []
  const { reqs, tiene, cats } = await base(empleadoId)
  const set = new Set<string>()
  for (const e of equipos) for (const q of faltantes(reqs, tiene, cats, e.categoria_id, e.modelo_id ?? null)) if (q.bloquear) set.add(q.descripcion)
  return [...set]
}
