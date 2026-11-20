import { supabase } from './supabase'

let cache: Promise<Record<string, string>> | null = null
/** id de usuario → nombre, para mostrar quién pidió, autorizó o emitió algo. */
export function nombresUsuarios(): Promise<Record<string, string>> {
  if (!cache) cache = Promise.resolve(supabase.rpc('nombres_usuarios')).then(({ data }) => Object.fromEntries(((data ?? []) as { id: string; nombre: string }[]).map(p => [p.id, p.nombre])))
    .catch(() => { cache = null; return {} })
  return cache
}
