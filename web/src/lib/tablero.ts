/** Secciones del tablero principal que cada usuario puede ocultar, mostrar y reordenar. */
export type Seccion = { id: string; t: string; d: string; mitad?: boolean; editar?: boolean; subs?: [string, string][] }

export const SECCIONES: Seccion[] = [
  { id: 'inicio', t: 'Inicio rápido', d: 'Tus accesos directos, lo último que abriste y las novedades', subs: [['accesos', 'Accesos directos'], ['recientes', 'Accesos recientes'], ['novedades', 'Novedades']] },
  { id: 'kpis', t: 'Indicadores principales', d: 'Totales grandes de activos', subs: [['total', 'Activos registrados'], ['valor', 'Valor de referencia'], ['sinresp', 'Sin responsable'], ['mtto', 'En mantenimiento']] },
  { id: 'atencion', t: 'Pendientes por atender', d: 'Tarjetas de alerta con su número', subs: [['docs', 'Documentos vencidos'], ['prestamos', 'Préstamos vencidos'], ['reportes', 'Reportes de falla'], ['mantenimiento', 'Mantenimientos vencidos'], ['servicios', 'Servicios vencidos'], ['solicitudes', 'Solicitudes por aprobar'], ['almacen', 'Material bajo mínimo']] },
  { id: 'servicios', t: 'Servicios por pagar', d: 'Luz, agua, predial… de los inmuebles que vencen en 15 días' },
  { id: 'empresas', t: 'Empresas', d: 'Logos con el número de activos de cada una' },
  { id: 'estatus', t: 'Distribución por estatus', d: 'Anillo de disponibles, asignados, mantenimiento…', mitad: true },
  { id: 'actividad', t: 'Actividad reciente', d: 'Últimos resguardos, devoluciones y traspasos', mitad: true },
  { id: 'graficas', t: 'Gráficas', d: 'Barras de activos por grupo', subs: [['empresa', 'Por empresa'], ['categoria', 'Por categoría'], ['ubicacion', 'Por ubicación']] },
]

export type PrefTablero = { orden: string[]; ocultos: string[] }
export const DEFECTO_TABLERO: PrefTablero = { orden: SECCIONES.map(s => s.id), ocultos: [] }

/** Une lo guardado con las secciones actuales (si se agregan secciones nuevas, aparecen al final). */
export function prefTablero(guardado?: Partial<PrefTablero> | null): PrefTablero {
  const orden = (guardado?.orden ?? []).filter(id => SECCIONES.some(s => s.id === id))
  for (const s of SECCIONES) if (!orden.includes(s.id)) orden.push(s.id)
  return { orden, ocultos: guardado?.ocultos ?? [] }
}
