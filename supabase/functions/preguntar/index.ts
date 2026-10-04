// Preguntas en español sobre los activos. Claude decide qué consultas hacer; las consultas corren con la sesión
// de quien pregunta, así que solo ve lo que sus permisos (RLS) le dejan ver. Solo lectura.
// Secretos: ANTHROPIC_API_KEY (obligatorio), ANTHROPIC_MODEL (opcional).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const hoy = () => new Date().toISOString().slice(0, 10)
const masDias = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const lim = (n: unknown, def = 25) => Math.min(100, Math.max(1, Number(n) || def))

type Args = Record<string, unknown>
const HERRAMIENTAS = [
  { name: 'buscar_activos', description: 'Busca activos (equipos, vehículos, herramienta). Regresa código, descripción, marca, modelo, serie, estatus, empresa, ubicación y responsable.',
    input_schema: { type: 'object', properties: { texto: { type: 'string', description: 'palabras a buscar en código, descripción, marca, modelo, serie, placa o No. económico' },
      empresa: { type: 'string' }, estatus: { type: 'string', enum: ['disponible', 'asignado', 'mantenimiento', 'siniestrado', 'baja'] }, categoria: { type: 'string' },
      ubicacion: { type: 'string' }, responsable: { type: 'string' }, limite: { type: 'number' } } } },
  { name: 'contar_activos', description: 'Cuenta activos agrupados por estatus, empresa, categoría, ubicación o marca, con filtros opcionales.',
    input_schema: { type: 'object', properties: { agrupar_por: { type: 'string', enum: ['estatus', 'empresa', 'categoria', 'ubicacion', 'marca', 'modelo'] }, empresa: { type: 'string' }, estatus: { type: 'string' }, texto: { type: 'string' } }, required: ['agrupar_por'] } },
  { name: 'empleado', description: 'Busca empleados por nombre y regresa sus datos y los activos que tiene asignados.',
    input_schema: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] } },
  { name: 'prestamos', description: 'Préstamos temporales con fecha de regreso.', input_schema: { type: 'object', properties: { solo_vencidos: { type: 'boolean' } } } },
  { name: 'vigencias', description: 'Documentos con vencimiento (pólizas, tarjetas, verificaciones, licencias, predial, uso de suelo, protección civil…).',
    input_schema: { type: 'object', properties: { estado: { type: 'string', enum: ['vencido', 'por_vencer', 'vigente'] }, dias: { type: 'number', description: 'vencen en los próximos N días' }, texto: { type: 'string' } } } },
  { name: 'mantenimiento', description: 'Programa de mantenimiento preventivo por equipo.', input_schema: { type: 'object', properties: { estado: { type: 'string', enum: ['vencido', 'proximo', 'ok'] } } } },
  { name: 'reportes', description: 'Reportes de falla, daño, robo o extravío.', input_schema: { type: 'object', properties: { estatus: { type: 'string', enum: ['abierto', 'en_proceso', 'resuelto', 'descartado'] } } } },
  { name: 'almacen', description: 'Existencias de consumibles del almacén (EPP, brocas, discos) por empresa y lugar.', input_schema: { type: 'object', properties: { texto: { type: 'string' }, bajo_minimo: { type: 'boolean' } } } },
  { name: 'solicitudes', description: 'Solicitudes de equipo o material.', input_schema: { type: 'object', properties: { estatus: { type: 'string', enum: ['pendiente', 'aprobada', 'rechazada', 'entregada', 'cancelada'] } } } },
  { name: 'inmuebles', description: 'Inmuebles de las empresas (terrenos, oficinas, bodegas) con datos generales.', input_schema: { type: 'object', properties: { texto: { type: 'string' } } } },
]

async function ejecutar(sb: SupabaseClient, nombre: string, a: Args): Promise<unknown> {
  const like = (s: unknown) => `%${String(s).replace(/[%,()]/g, ' ').trim()}%`
  switch (nombre) {
    case 'buscar_activos': {
      let q = sb.from('v_activos').select('id,codigo,descripcion,marca,modelo,serie,numero_economico,placa,estatus,empresa,categoria,ubicacion,responsable').limit(lim(a.limite))
      if (a.texto) q = q.or(['codigo', 'descripcion', 'marca', 'modelo', 'serie', 'numero_economico', 'placa'].map(c => `${c}.ilike.${like(a.texto)}`).join(','))
      if (a.empresa) q = q.ilike('empresa', like(a.empresa))
      if (a.estatus) q = q.eq('estatus', a.estatus)
      if (a.categoria) q = q.ilike('categoria', like(a.categoria))
      if (a.ubicacion) q = q.ilike('ubicacion', like(a.ubicacion))
      if (a.responsable) q = q.ilike('responsable', like(a.responsable))
      return (await q).data
    }
    case 'contar_activos': {
      let q = sb.from('v_activos').select('estatus,empresa,categoria,ubicacion,marca,modelo,descripcion').limit(20000)
      if (a.empresa) q = q.ilike('empresa', like(a.empresa))
      if (a.estatus) q = q.eq('estatus', a.estatus)
      if (a.texto) q = q.or(['descripcion', 'marca', 'modelo'].map(c => `${c}.ilike.${like(a.texto)}`).join(','))
      const filas = ((await q).data ?? []) as Record<string, string | null>[]
      const g: Record<string, number> = {}
      for (const f of filas) { const k = f[String(a.agrupar_por)] ?? 'Sin dato'; g[k] = (g[k] ?? 0) + 1 }
      return { total: filas.length, grupos: g }
    }
    case 'empleado': {
      const { data } = await sb.from('empleados').select('id,nombres,apellidos,puesto,empresas(nombre_corto,nombre)').or(`nombres.ilike.${like(a.nombre)},apellidos.ilike.${like(a.nombre)}`).limit(5)
      const out = []
      for (const e of (data ?? []) as { id: string }[]) out.push({ ...e, activos: (await sb.from('v_activos').select('id,codigo,descripcion,marca,modelo,serie').eq('responsable_id', e.id)).data })
      return out
    }
    case 'prestamos': { let q = sb.from('v_prestamos').select('activo_id,codigo,descripcion,empleado,fecha_devolucion,empresa').order('fecha_devolucion'); if (a.solo_vencidos) q = q.lt('fecha_devolucion', hoy()); return (await q).data }
    case 'vigencias': {
      let q = sb.from('v_vigencias').select('tipo,numero,emisor,fecha_vencimiento,estado,empresa_corto,activo_id,activo_codigo,activo_descripcion,placa,empleado,inmueble_id,inmueble').order('fecha_vencimiento').limit(60)
      if (a.estado) q = q.eq('estado', a.estado)
      if (a.dias) q = q.lte('fecha_vencimiento', masDias(Number(a.dias))).gte('fecha_vencimiento', hoy())
      return (await q).data
    }
    case 'mantenimiento': { let q = sb.from('v_mantenimiento').select('activo_id,codigo,descripcion,plan,restante,disparo,estado,empresa,ot_folio').order('restante').limit(60); if (a.estado) q = q.eq('estado', a.estado); return (await q).data }
    case 'reportes': { let q = sb.from('reportes').select('folio,tipo,prioridad,descripcion,estatus,created_at,activo_id,activos(codigo,descripcion)').order('created_at', { ascending: false }).limit(40); if (a.estatus) q = q.eq('estatus', a.estatus); else q = q.in('estatus', ['abierto', 'en_proceso']); return (await q).data }
    case 'almacen': {
      let q = sb.from('v_existencias').select('nombre,unidad,minimo,empresa,ubicacion,existencia')
      if (a.texto) q = q.ilike('nombre', like(a.texto))
      const filas = ((await q).data ?? []) as { nombre: string; empresa: string; minimo: number; existencia: number }[]
      if (!a.bajo_minimo) return filas
      const t: Record<string, { nombre: string; empresa: string; minimo: number; total: number }> = {}
      for (const f of filas) { const k = f.nombre + '|' + f.empresa; t[k] ??= { nombre: f.nombre, empresa: f.empresa, minimo: Number(f.minimo), total: 0 }; t[k].total += Number(f.existencia) }
      return Object.values(t).filter(x => x.minimo > 0 && x.total < x.minimo)
    }
    case 'solicitudes': { let q = sb.from('solicitudes').select('folio,estatus,items,motivo,fecha_necesaria,solicitante,created_at').order('created_at', { ascending: false }).limit(40); if (a.estatus) q = q.eq('estatus', a.estatus); return (await q).data }
    case 'inmuebles': { let q = sb.from('inmuebles').select('id,codigo,nombre,tipo,superficie_terreno,superficie_construccion,colonia,municipio,clave_catastral').eq('activo', true).limit(40); if (a.texto) q = q.or(`nombre.ilike.${like(a.texto)},colonia.ilike.${like(a.texto)},codigo.ilike.${like(a.texto)}`); return (await q).data }
  }
  return { error: 'herramienta desconocida' }
}

const SISTEMA = `Eres el asistente del sistema de control de activos de Grupo Empresarial Firme (constructora en La Paz, B.C.S.).
Responde en español de México, breve y directo. Usa las herramientas para consultar datos reales; nunca inventes cifras.
Este sistema no maneja dinero: si preguntan por costos, facturas o pagos, di que eso está fuera del sistema.
Cuando menciones un activo, enlázalo así: [ACT-000123](#/activos/<id>). Empleado: [Nombre](#/empleados/<id>). Inmueble: [INM-0001](#/inmuebles/<id>).
Usa listas cortas con "- " cuando haya varios elementos. Hoy es ${hoy()}.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Falta configurar ANTHROPIC_API_KEY en los secretos de la función.' }, 503)
    const auth = req.headers.get('Authorization') ?? ''
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { pregunta, historial = [] } = await req.json() as { pregunta: string; historial?: { rol: 'usuario' | 'asistente'; texto: string }[] }
    if (!pregunta?.trim()) return json({ error: 'Escribe tu pregunta.' }, 400)
    const mensajes: unknown[] = [...historial.slice(-6).map(h => ({ role: h.rol === 'usuario' ? 'user' : 'assistant', content: h.texto })), { role: 'user', content: pregunta.slice(0, 1000) }]
    const consultas: string[] = []
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5', max_tokens: 1200, system: SISTEMA, tools: HERRAMIENTAS, messages: mensajes }),
      })
      if (!r.ok) return json({ error: `El servicio de IA respondió ${r.status}.` }, 502)
      const out = await r.json() as { stop_reason: string; content: { type: string; text?: string; id?: string; name?: string; input?: Args }[] }
      mensajes.push({ role: 'assistant', content: out.content })
      const usos = out.content.filter(c => c.type === 'tool_use')
      if (out.stop_reason !== 'tool_use' || usos.length === 0) return json({ respuesta: out.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim(), consultas })
      const resultados = []
      for (const u of usos) {
        consultas.push(u.name!)
        let res: unknown
        try { res = await ejecutar(sb, u.name!, u.input ?? {}) } catch (e) { res = { error: (e as Error).message } }
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(res).slice(0, 20000) })
      }
      mensajes.push({ role: 'user', content: resultados })
    }
    return json({ respuesta: 'La pregunta necesitó demasiadas consultas. Intenta hacerla más específica.', consultas })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
