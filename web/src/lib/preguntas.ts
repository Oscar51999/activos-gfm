import { supabase } from './supabase'
import { bajoMinimo, num, plural, type Existencia } from './almacen'
import { TIPOS_DOC } from '../components/Documentos'

/** Respuesta: texto con [enlaces](#/ruta), **negritas** y listas "- ". */
export type Respuesta = { texto: string; fuente: 'ia' | 'local'; consultas?: string[] }

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const lista = (xs: string[], max = 12) => xs.slice(0, max).map(x => `- ${x}`).join('\n') + (xs.length > max ? `\n- … y ${xs.length - max} más` : '')
const ESTATUS: Record<string, string> = { disponible: 'disponible', disponibles: 'disponible', libres: 'disponible', asignado: 'asignado', asignados: 'asignado', mantenimiento: 'mantenimiento', taller: 'mantenimiento', siniestrado: 'siniestrado', siniestrados: 'siniestrado', baja: 'baja', bajas: 'baja' }
const VACIAS = new Set('el la los las un una unos unas de del en y o que cual cuales cuantos cuantas hay tiene tienen tengo esta estan donde quien quienes me dime dame muestra ver lista activos activo equipos equipo cosas por para con a al se su sus mi mis hoy todos todas'.split(' '))
type Act = { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; estatus: string; empresa: string; categoria: string | null; ubicacion: string | null; responsable: string | null; responsable_id: string | null; numero_economico: string | null; placa: string | null }
const etiqueta = (a: Act) => `[${a.codigo}](#/activos/${a.id}) ${[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}`

/** Intérprete sencillo para las preguntas más comunes. Funciona sin IA y sin costo; se usa si la IA no está configurada o no hay señal. */
export async function responderLocal(pregunta: string): Promise<Respuesta> {
  const p = sinAcentos(pregunta)
  const r = (texto: string): Respuesta => ({ texto, fuente: 'local' })
  const hoy = hoyISO()

  if (/(costo|precio|cuanto cuesta|factura|pago|valor en pesos)/.test(p)) return r('Este sistema solo controla activos; costos, facturas y pagos se llevan en otro programa.')

  if (/prestam|regresar|devolver|deben regresar/.test(p)) {
    const { data } = await supabase.from('v_prestamos').select('activo_id,codigo,descripcion,empleado,fecha_devolucion').order('fecha_devolucion')
    const xs = (data ?? []) as { activo_id: string; codigo: string; descripcion: string; empleado: string; fecha_devolucion: string }[]
    const venc = xs.filter(x => x.fecha_devolucion < hoy)
    if (!xs.length) return r('No hay préstamos con fecha de regreso.')
    return r(`Hay **${xs.length}** préstamo(s); **${venc.length}** ya debió regresar.\n${lista((venc.length ? venc : xs).map(x => `[${x.codigo}](#/activos/${x.activo_id}) ${x.descripcion} · ${x.empleado} · ${x.fecha_devolucion < hoy ? 'debió regresar' : 'regresa'} el ${x.fecha_devolucion}`))}`)
  }
  if (/vence|vencid|vigenc|poliza|seguro|predial|licencia|verificacion|tarjeta de circulacion|uso de suelo|proteccion civil/.test(p)) {
    const dias = Number(p.match(/(\d+)\s*dias/)?.[1] ?? 30)
    const { data } = await supabase.from('v_vigencias').select('tipo,numero,fecha_vencimiento,activo_id,activo_codigo,activo_descripcion,empleado,empleado_id,inmueble_id,inmueble').order('fecha_vencimiento')
    const lim = new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10)
    const xs = ((data ?? []) as { tipo: string; fecha_vencimiento: string; activo_id: string | null; activo_codigo: string | null; activo_descripcion: string | null; empleado: string | null; empleado_id: string | null; inmueble_id: string | null; inmueble: string | null }[])
      .filter(x => x.fecha_vencimiento <= lim)
    if (!xs.length) return r(`Nada vence en los próximos ${dias} días.`)
    const de = (x: typeof xs[number]) => x.activo_id ? `[${x.activo_codigo}](#/activos/${x.activo_id}) ${x.activo_descripcion}` : x.inmueble_id ? `[${x.inmueble}](#/inmuebles/${x.inmueble_id})` : `[${x.empleado}](#/empleados/${x.empleado_id})`
    const venc = xs.filter(x => x.fecha_vencimiento < hoy).length
    return r(`**${venc}** documento(s) vencido(s) y **${xs.length - venc}** que vencen en ${dias} días:\n${lista(xs.map(x => `${TIPOS_DOC[x.tipo]?.texto ?? x.tipo} de ${de(x)} · ${x.fecha_vencimiento < hoy ? 'venció' : 'vence'} ${x.fecha_vencimiento}`))}\n\nVer todo en [Vigencias](#/vigencias).`)
  }
  if (/mantenim|servicio|preventiv|afinacion/.test(p)) {
    const { data } = await supabase.from('v_mantenimiento').select('activo_id,codigo,descripcion,plan,restante,disparo,estado').neq('estado', 'ok').order('restante')
    const xs = (data ?? []) as { activo_id: string; codigo: string; descripcion: string; plan: string; restante: number; disparo: string; estado: string }[]
    if (!xs.length) return r('Todos los preventivos están al día.')
    const u = (x: typeof xs[number]) => x.disparo === 'horas' ? 'h' : x.disparo === 'km' ? 'km' : 'días'
    return r(`**${xs.filter(x => x.estado === 'vencido').length}** servicio(s) vencido(s) y **${xs.filter(x => x.estado === 'proximo').length}** próximos:\n${lista(xs.map(x => `[${x.codigo}](#/activos/${x.activo_id}) ${x.descripcion} · ${x.plan} · ${x.restante < 0 ? `pasado por ${num(-x.restante)} ${u(x)}` : `faltan ${num(x.restante)} ${u(x)}`}`))}`)
  }
  if (/reporte|falla|descompuest|danad|robo|extravi/.test(p)) {
    const { data } = await supabase.from('reportes').select('folio,tipo,prioridad,descripcion,activo_id,activos(codigo)').in('estatus', ['abierto', 'en_proceso']).order('created_at', { ascending: false })
    const xs = (data ?? []) as unknown as { folio: string; prioridad: string; descripcion: string; activo_id: string; activos: { codigo: string } | null }[]
    if (!xs.length) return r('No hay reportes de falla abiertos.')
    return r(`Hay **${xs.length}** reporte(s) por atender:\n${lista(xs.map(x => `${x.folio} · [${x.activos?.codigo}](#/activos/${x.activo_id}) · ${x.prioridad} · ${x.descripcion}`))}\n\nIr a [Reportes](#/reportes).`)
  }
  if (/minimo|surtir|almacen|existencia|cuantos (cascos|chalecos|guantes|discos|brocas|lentes|botas)|consumible|epp/.test(p)) {
    const { data } = await supabase.from('v_existencias').select('*')
    const ex = (data ?? []) as Existencia[]
    const palabra = p.match(/(cascos?|chalecos?|guantes?|discos?|brocas?|lentes|botas?|cinta)/)?.[1]?.replace(/s$/, '')
    if (palabra) {
      const m = ex.filter(e => sinAcentos(e.nombre).includes(palabra))
      if (!m.length) return r(`No encontré "${palabra}" en el almacén.`)
      const total = m.reduce((s, e) => s + Number(e.existencia), 0)
      return r(`Hay **${num(total)}** ${plural(m[0].unidad, total)} de ${m[0].nombre}:\n${lista(m.map(e => `${e.ubicacion ?? 'sin lugar'} (${e.empresa}): ${num(e.existencia)}`))}`)
    }
    const b = bajoMinimo(ex)
    return r(b.length ? `**${b.length}** artículo(s) bajo mínimo:\n${lista(b.map(t => `${t.nombre} · ${t.empresa}: ${num(t.total)} de ${num(t.minimo)}`))}\n\nIr a [Almacén](#/almacen?bajo=1).` : 'Todo el material está por arriba de su mínimo.')
  }
  if (/solicitud|pidieron|pedidos/.test(p)) {
    const { data } = await supabase.from('solicitudes').select('folio,estatus,solicitante,motivo').in('estatus', ['pendiente', 'aprobada']).order('created_at', { ascending: false })
    const xs = (data ?? []) as { folio: string; estatus: string; solicitante: string | null; motivo: string | null }[]
    return r(xs.length ? `**${xs.filter(x => x.estatus === 'pendiente').length}** por aprobar y **${xs.filter(x => x.estatus === 'aprobada').length}** por entregar:\n${lista(xs.map(x => `${x.folio} · ${x.estatus === 'pendiente' ? 'por aprobar' : 'por entregar'} · ${x.solicitante ?? ''}${x.motivo ? ' · ' + x.motivo : ''}`))}\n\nIr a [Solicitudes](#/solicitudes).` : 'No hay solicitudes abiertas.')
  }
  if (/inmueble|terreno|bodega|predio/.test(p) && !/donde esta/.test(p)) {
    const { data } = await supabase.from('inmuebles').select('id,codigo,nombre,superficie_terreno').eq('activo', true).order('codigo')
    const xs = (data ?? []) as { id: string; codigo: string; nombre: string; superficie_terreno: number | null }[]
    return r(`Hay **${xs.length}** inmueble(s):\n${lista(xs.map(x => `[${x.codigo}](#/inmuebles/${x.id}) ${x.nombre}${x.superficie_terreno ? ` · ${num(x.superficie_terreno)} m²` : ''}`))}`)
  }

  // activos: quién tiene / qué tiene / dónde está / cuántos
  const { data } = await supabase.from('v_activos').select('id,codigo,descripcion,marca,modelo,serie,estatus,empresa,categoria,ubicacion,responsable,responsable_id,numero_economico,placa').neq('estatus', 'baja').limit(20000)
  const acts = (data ?? []) as Act[]
  const codigo = pregunta.match(/act-?\s?0*(\d+)/i)
  if (codigo) {
    const a = acts.find(x => Number(x.codigo.replace(/\D/g, '')) === Number(codigo[1]))
    return r(a ? `${etiqueta(a)} está **${a.estatus}**${a.responsable ? `, lo tiene **${a.responsable}**` : ''}${a.ubicacion ? ` en ${a.ubicacion}` : ''} (${a.empresa}).` : 'No encontré ese código.')
  }
  const { data: emps } = await supabase.from('empleados').select('id,nombres,apellidos').eq('activo', true)
  const persona = ((emps ?? []) as { id: string; nombres: string; apellidos: string | null }[]).find(e => {
    const n = sinAcentos(e.nombres).split(' ')[0], a = sinAcentos(e.apellidos ?? '').split(' ')[0]
    return (n.length > 2 && new RegExp(`\\b${n}\\b`).test(p)) || (a.length > 3 && new RegExp(`\\b${a}\\b`).test(p))
  })
  if (persona && /(tiene|asignad|resguardo|de )/.test(p)) {
    const xs = acts.filter(a => a.responsable_id === persona.id)
    const nombre = `${persona.nombres} ${persona.apellidos ?? ''}`.trim()
    return r(xs.length ? `[${nombre}](#/empleados/${persona.id}) tiene **${xs.length}** activo(s):\n${lista(xs.map(etiqueta))}` : `[${nombre}](#/empleados/${persona.id}) no tiene activos asignados.`)
  }
  const estatus = Object.entries(ESTATUS).find(([k]) => new RegExp(`\\b${k}\\b`).test(p))?.[1]
  const palabras = p.replace(/[^a-z0-9ñ\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !VACIAS.has(w) && !ESTATUS[w])
  const coincide = (a: Act) => palabras.every(w => { const raiz = w.replace(/(es|s)$/, ''); return sinAcentos([a.descripcion, a.marca, a.modelo, a.categoria, a.empresa, a.ubicacion, a.serie, a.numero_economico, a.placa].filter(Boolean).join(' ')).includes(raiz) })
  const xs = acts.filter(a => (!estatus || a.estatus === estatus) && (palabras.length === 0 || coincide(a)))
  if (/quien tiene|quien trae/.test(p)) return r(xs.length ? lista(xs.map(a => `${etiqueta(a)} · ${a.responsable ?? 'nadie (está ' + a.estatus + ')'}`)) : 'No encontré ese equipo.')
  if (/donde esta|donde estan|ubicacion de/.test(p)) return r(xs.length ? lista(xs.map(a => `${etiqueta(a)} · ${a.ubicacion ?? 'sin ubicación'}${a.responsable ? ' · ' + a.responsable : ''}`)) : 'No encontré ese equipo.')
  if (!xs.length && estatus) {
    const otros = acts.filter(a => palabras.length > 0 && coincide(a))
    if (otros.length) {
      const por: Record<string, number> = {}
      for (const a of otros) por[a.estatus] = (por[a.estatus] ?? 0) + 1
      return r(`Ninguna está ${estatus}. Hay **${otros.length}** en total: ${Object.entries(por).map(([e, n]) => `${n} ${e}`).join(', ')}.\n${lista(otros.map(a => `${etiqueta(a)} · ${a.estatus}${a.responsable ? ' · ' + a.responsable : ''}`))}`)
    }
  }
  if (!xs.length) return r('No encontré activos con esas palabras. Prueba con la marca, el modelo, el código (ACT-000012) o el nombre de un empleado.')
  if (/cuant/.test(p) || xs.length > 12) {
    const por: Record<string, number> = {}
    for (const a of xs) por[a.empresa] = (por[a.empresa] ?? 0) + 1
    return r(`Son **${xs.length}** activo(s)${estatus ? ` ${estatus}${xs.length === 1 ? '' : 's'}` : ''}:\n${lista(Object.entries(por).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e}: ${n}`))}${xs.length <= 12 ? '\n\n' + lista(xs.map(etiqueta)) : ''}`)
  }
  return r(`Encontré **${xs.length}**:\n${lista(xs.map(a => `${etiqueta(a)} · ${a.estatus}${a.responsable ? ' · ' + a.responsable : ''}`))}`)
}

/** Pregunta a la IA (función `preguntar`); si no está disponible, contesta el intérprete local. */
export async function preguntar(pregunta: string, historial: { rol: 'usuario' | 'asistente'; texto: string }[]): Promise<Respuesta> {
  if (navigator.onLine !== false) {
    try {
      const { data, error } = await supabase.functions.invoke('preguntar', { body: { pregunta, historial } })
      if (!error && (data as { respuesta?: string })?.respuesta) return { texto: (data as { respuesta: string }).respuesta, fuente: 'ia', consultas: (data as { consultas?: string[] }).consultas }
    } catch { /* sin IA: sigue el intérprete local */ }
  }
  return responderLocal(pregunta)
}
