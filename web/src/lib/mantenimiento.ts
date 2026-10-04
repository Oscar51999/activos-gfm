export type EstatusOT = 'abierta' | 'en_proceso' | 'espera_refaccion' | 'terminada' | 'cancelada'
export const ESTATUS_OT: Record<EstatusOT, { texto: string; clase: string; color: string }> = {
  abierta: { texto: 'Por iniciar', clase: 'bg-sky-50 text-sky-700 ring-sky-200', color: '#38BDF8' },
  en_proceso: { texto: 'En proceso', clase: 'bg-amber-50 text-amber-800 ring-amber-200', color: '#F9B234' },
  espera_refaccion: { texto: 'Espera refacción', clase: 'bg-violet-50 text-violet-700 ring-violet-200', color: '#A78BFA' },
  terminada: { texto: 'Terminada', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200', color: '#34D399' },
  cancelada: { texto: 'Cancelada', clase: 'bg-stone-100 text-stone-600 ring-stone-200', color: '#6B7280' },
}
export const DISPARO = { dias: 'días', km: 'km', horas: 'horas' } as const
export type Disparo = keyof typeof DISPARO

export type TipoEquipo = 'vehiculo' | 'maquinaria' | 'otro'
export function tipoEquipo(categoria?: string | null, esVehiculo?: boolean | null): TipoEquipo {
  const c = (categoria ?? '').toLowerCase()
  if (c.includes('maquinaria')) return 'maquinaria'
  if (esVehiculo || c.includes('vehíc') || c.includes('vehic')) return 'vehiculo'
  return 'otro'
}
export const unidadLectura = (t: TipoEquipo) => t === 'maquinaria' ? 'horas' : 'km'

/** Puntos del checklist diario según el tipo de equipo. */
export const PUNTOS: Record<TipoEquipo, string[]> = {
  vehiculo: ['Llantas y presión', 'Luces y direccionales', 'Frenos', 'Nivel de aceite', 'Nivel de anticongelante', 'Limpiaparabrisas', 'Cinturones', 'Extintor y señalamientos', 'Tarjeta de circulación y póliza a bordo', 'Limpieza'],
  maquinaria: ['Fugas de aceite o hidráulico', 'Nivel de aceite de motor', 'Nivel hidráulico', 'Llantas u orugas', 'Uñas, cucharón y pernos', 'Luces y alarma de reversa', 'Cinturón de seguridad', 'Espejos y cristales', 'Extintor', 'Engrasado'],
  otro: ['Enciende y funciona', 'Sin daños visibles', 'Accesorios completos', 'Limpio'],
}
