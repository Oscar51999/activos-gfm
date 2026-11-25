/** Temas de los que se encarga cada usuario: definen qué avisos le llegan por correo. */
export const MODULOS: { id: string; t: string; d: string }[] = [
  { id: 'gerencia', t: 'Resumen gerencial', d: 'Cada mañana: lo que hizo el equipo en 24 h (actividades por persona, resguardos, fallas, mantenimiento, pagos y solicitudes)' },
  { id: 'inmuebles', t: 'Inmuebles y servicios', d: 'Luz, agua, renta, internet por pagar y documentos de inmuebles' },
  { id: 'vehiculos', t: 'Vehículos y maquinaria', d: 'Seguros, tarjetas, verificaciones, mantenimientos y checklists con fallas' },
  { id: 'mantenimiento', t: 'Mantenimiento de equipo', d: 'Mantenimientos vencidos o próximos (no vehículos)' },
  { id: 'resguardos', t: 'Resguardos', d: 'Resguardos que no se han firmado' },
  { id: 'prestamos', t: 'Préstamos', d: 'Equipo prestado que ya debió regresar' },
  { id: 'reportes', t: 'Reportes de falla', d: 'Fallas abiertas; robo y extravío al momento' },
  { id: 'almacen', t: 'Almacén', d: 'Material por debajo del mínimo' },
  { id: 'solicitudes', t: 'Solicitudes', d: 'Solicitudes de equipo o material por aprobar' },
  { id: 'licencias', t: 'Licencias y cuentas', d: 'Licencias por vencer' },
  { id: 'garantias', t: 'Garantías', d: 'Garantías que vencen en 30 días' },
  { id: 'documentos', t: 'Documentos y vigencias', d: 'Documentos de personal y de equipo por vencer' },
  { id: 'escaneos', t: 'Equipo fuera de su lugar', d: 'Al momento: equipo escaneado a más de 5 km de su obra' },
]
export const nombreModulo = (id: string) => MODULOS.find(m => m.id === id)?.t ?? id

export type Pendientes = { para: string | null; nombre: string; total: number; secciones: { modulo: string; titulo: string; items: { texto: string; detalle: string; url: string; urgente: boolean }[] }[] }
