// Recibe incidentes de otro sistema (por ejemplo la mesa de ayuda de TI) y los convierte en un reporte de falla del activo.
// POST con encabezado  x-integracion-secreto: <INTEGRACION_SECRETO>  y cuerpo JSON:
//   { "activo": "ACT-00012" | No. económico | serie | EPC RFID | URL del QR,
//     "descripcion": "No enciende", "prioridad": "baja|media|alta", "tipo": "falla|dano|robo|extravio|otro",
//     "ticket": "MDA-1234", "reporta_nombre": "Juan Pérez", "reporta_contacto": "juan@..." }
// Si el mismo "ticket" llega dos veces, regresa el reporte que ya existe (no duplica).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-integracion-secreto', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405)
  const secreto = Deno.env.get('INTEGRACION_SECRETO')
  if (!secreto) return json({ error: 'Falta configurar INTEGRACION_SECRETO en el proyecto' }, 503)
  if (req.headers.get('x-integracion-secreto') !== secreto) return json({ error: 'No autorizado' }, 401)

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json({ error: 'El cuerpo debe ser JSON' }, 400) }
  const ident = txt(b.activo, 300), descripcion = txt(b.descripcion, 2000)
  if (!ident) return json({ error: 'Falta "activo" (código, No. económico, serie, EPC o URL del QR)' }, 400)
  if (!descripcion) return json({ error: 'Falta "descripcion"' }, 400)
  const prioridad = ['baja', 'media', 'alta'].includes(String(b.prioridad)) ? String(b.prioridad) : 'media'
  const tipo = ['falla', 'dano', 'robo', 'extravio', 'otro'].includes(String(b.tipo)) ? String(b.tipo) : 'falla'
  const ticket = txt(b.ticket, 80)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  if (ticket) {
    const { data: ya } = await db.from('reportes').select('id,folio,estatus').eq('ticket_externo', ticket).maybeSingle()
    if (ya) return json({ ok: true, duplicado: true, reporte: ya })
  }

  // Buscar el activo por QR, EPC, código, No. económico o serie
  const qr = ident.match(UUID)?.[0]?.toLowerCase()
  const up = ident.toUpperCase().replace(/[,()"]/g, '')
  const q = db.from('activos').select('id,codigo,empresa_id,descripcion').neq('estatus', 'baja').limit(2)
  const { data: encontrados, error: e1 } = qr ? await q.eq('qr', qr)
    : /^[0-9A-F]{24}$/.test(up) ? await q.eq('rfid_epc', up)
    : await q.or(`codigo.eq.${up},numero_economico.eq.${up},serie.eq.${up}`)
  if (e1) return json({ error: e1.message }, 500)
  if (!encontrados?.length) return json({ error: `No encontré un activo con "${ident}"` }, 404)
  if (encontrados.length > 1) return json({ error: `"${ident}" coincide con varios activos; manda el código ACT-…` }, 409)
  const a = encontrados[0]

  const { data, error } = await db.from('reportes').insert({
    activo_id: a.id, empresa_id: a.empresa_id, tipo, prioridad, descripcion,
    reporta_nombre: txt(b.reporta_nombre, 120) ?? 'Mesa de ayuda', reporta_contacto: txt(b.reporta_contacto, 160),
    reportado_por: null, origen: 'mesa_ayuda', ticket_externo: ticket,
  }).select('id,folio,estatus').single()
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, reporte: data, activo: { codigo: a.codigo, descripcion: a.descripcion } }, 201)
})
