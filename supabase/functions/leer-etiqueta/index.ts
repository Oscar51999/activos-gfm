// Lee la foto de una etiqueta o placa de equipo y regresa marca, modelo, serie y tipo de equipo.
// Usa la API de Claude (visión). Requiere el secreto ANTHROPIC_API_KEY; ANTHROPIC_MODEL es opcional.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const INSTRUCCIONES = `Eres el asistente de almacén de una constructora en México. Te paso la foto de un equipo o de su etiqueta/placa de datos.
Devuelve SOLO un objeto JSON con estas llaves (usa null si no se ve con claridad; no inventes):
{"marca": "", "modelo": "", "serie": "", "categoria": "", "descripcion": "", "otros_textos": [], "confianza": "alta|media|baja"}
- "serie": el número de serie (S/N, Serial, No. de serie, VIN si es vehículo). Copia exacto, respeta letras y ceros.
- "categoria": una de: Vehículos, Maquinaria pesada, Herramienta, Equipo de cómputo, Equipo de topografía, Equipo menor, Telefonía, Seguridad, Mobiliario, Otro.
- "descripcion": nombre corto en español de qué es (ej. "Rotomartillo SDS Plus", "Laptop 14 pulgadas").
- "otros_textos": otros números útiles que aparezcan (modelo comercial, part number, año).`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Falta configurar ANTHROPIC_API_KEY en los secretos de la función.' }, 503)
    const { imagen } = await req.json() as { imagen?: string }
    const m = imagen?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/)
    if (!m) return json({ error: 'Manda la foto como data URL (jpeg, png o webp).' }, 400)
    if (m[2].length > 6_000_000) return json({ error: 'La foto es demasiado grande.' }, 413)
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5', max_tokens: 600,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: INSTRUCCIONES },
        ] }],
      }),
    })
    if (!r.ok) return json({ error: `El servicio de lectura respondió ${r.status}.`, detalle: (await r.text()).slice(0, 300) }, 502)
    const out = await r.json() as { content: { type: string; text?: string }[] }
    const texto = out.content.filter(c => c.type === 'text').map(c => c.text).join('')
    const j = texto.match(/\{[\s\S]*\}/)
    if (!j) return json({ error: 'No pude leer datos en la foto.', texto }, 422)
    return json(JSON.parse(j[0]))
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
