import { createClient } from '@supabase/supabase-js'
import { fetchConCola, configurar, sincronizar } from './sinSenal'

// Clave publicable: segura en el navegador; la seguridad real vive en las políticas RLS de la base de datos.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://vbdpackixppvnujcwrog.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_VeOTdYTzIouJSc3l-FPV-Q_-AYHAWw2'

export const supabase = createClient(url, key, {
  global: { fetch: fetchConCola },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    // en la vista previa se usa memoria en lugar de localStorage
    ...((window as unknown as { __DEMO_STORAGE?: object }).__DEMO_STORAGE ? { storage: (window as unknown as { __DEMO_STORAGE: never }).__DEMO_STORAGE } : {}) },
})

;(window as unknown as { __SB_KEY: string }).__SB_KEY = key
configurar((...a) => fetch(...a), async () => (await supabase.auth.getSession()).data.session?.access_token ?? null)
setTimeout(() => { sincronizar() }, 3000)

export const BUCKET = 'activos'

export type Rol = 'admin' | 'almacen' | 'supervisor' | 'consulta'
export type Estatus = 'disponible' | 'asignado' | 'mantenimiento' | 'siniestrado' | 'baja'

export const ESTATUS: Record<Estatus, { texto: string; clase: string }> = {
  disponible: { texto: 'Disponible', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  asignado: { texto: 'Asignado', clase: 'bg-sky-50 text-sky-700 ring-sky-200' },
  mantenimiento: { texto: 'En mantenimiento', clase: 'bg-amber-50 text-amber-800 ring-amber-200' },
  siniestrado: { texto: 'Siniestrado', clase: 'bg-red-50 text-red-700 ring-red-200' },
  baja: { texto: 'Baja', clase: 'bg-stone-100 text-stone-600 ring-stone-200' },
}

export const ROLES: Record<Rol, string> = {
  admin: 'Administrador',
  almacen: 'Almacén (captura)',
  supervisor: 'Supervisor (consulta y resguardos)',
  consulta: 'Solo consulta',
}

export const TIPOS_UBICACION = {
  obra: 'Obra', almacen: 'Almacén', oficina: 'Oficina', patio: 'Patio de maquinaria', taller: 'Taller', sitio: 'Sitio',
} as const

export function mensajeError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (m.includes('row-level security')) return 'No tienes permiso para esta acción.'
  if (m.includes('duplicate key')) return 'Ya existe un registro con ese valor.'
  if (m.includes('asignado_requiere_responsable')) return 'Un activo asignado necesita un responsable.'
  if (m.includes('violates foreign key') && m.includes('delete')) return 'No se puede borrar: hay registros que lo usan.'
  if (m.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('Failed to fetch')) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.'
  return m
}

export type TipoMov = 'asignacion' | 'devolucion' | 'traspaso'
export const TIPOS_MOV: Record<TipoMov, { texto: string; verbo: string; clase: string }> = {
  asignacion: { texto: 'Asignación', verbo: 'Asignar', clase: 'bg-sky-50 text-sky-700 ring-sky-200' },
  devolucion: { texto: 'Devolución', verbo: 'Devolver', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  traspaso: { texto: 'Traspaso', verbo: 'Traspasar', clase: 'bg-violet-50 text-violet-700 ring-violet-200' },
}
