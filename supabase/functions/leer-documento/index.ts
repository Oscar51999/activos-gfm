// Alta inteligente: lee una factura, bitácora, lista o foto (imagen o PDF) y regresa los equipos que trae.
// Usa la API de Claude (visión y PDF). Requiere el secreto ANTHROPIC_API_KEY; ANTHROPIC_MODEL es opcional.
// Solo control de activos: no se extraen precios ni importes.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const INSTRUCCIONES = `Eres el asistente de almacén y TI de un grupo constructor en México. Te paso un documento: puede ser una factura (CFDI),
una bitácora o lista de equipo, una orden de compra, una nota de remisión o la foto de un equipo o de su etiqueta.
Tu trabajo es sacar los EQUIPOS / ACTIVOS que se van a dar de alta. No extraigas precios, importes, IVA ni totales.
Ignora renglones que sean servicios, fletes, envíos, garantías extendidas, licencias de software o consumibles (papel, tóner, cables sueltos).

Devuelve SOLO un objeto JSON (sin texto antes ni después) con esta forma; usa null si algo no se ve claro y no inventes:
{
  "tipo_documento": "factura|bitacora|lista|remision|foto|otro",
  "empresa": {"razon_social": "", "rfc": ""},
  "proveedor": {"nombre": "", "rfc": ""},
  "folio": "", "fecha": "AAAA-MM-DD",
  "equipos": [
    {"descripcion": "", "marca": "", "modelo": "", "serie": "", "numero_economico": "", "placa": "",
     "categoria": "", "cantidad": 1, "notas": ""}
  ],
  "observaciones": "", "confianza": "alta|media|baja"
}
Reglas:
- "empresa": a quién se le factura o quién es dueño del equipo (en un CFDI, el receptor). "proveedor": quien vende (el emisor).
- Un renglón por equipo distinto. Si el documento trae varias series del mismo modelo, pon un renglón por serie con cantidad 1.
  Si trae cantidad mayor a 1 sin series, deja un renglón con esa cantidad y serie null.
- "serie": S/N, número de serie, IMEI o VIN (vehículos). Cópialo exacto.
- "categoria": una de: Vehículos, Maquinaria pesada, Herramienta, Equipo de cómputo, Equipo de comunicación, Equipo de topografía, Equipo menor, Mobiliario.
- "descripcion": nombre corto en español de qué es (ej. "Laptop 14 pulgadas", "Camioneta pick-up doble cabina", "Estación total").
- "modelo": el modelo comercial (ej. "ThinkPad E14 Gen 5", "Hilux 2024", "TS07"). "marca": solo la marca (ej. "Lenovo", "Toyota", "Leica").`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Falta configurar ANTHROPIC_API_KEY en los secretos de las funciones de Supabase.' }, 503)
    const { archivo, nota } = await req.json() as { archivo?: string; nota?: string }
    const m = archivo?.match(/^data:(image\/(?:jpeg|png|webp|gif)|application\/pdf);base64,(.+)$/)
    if (!m) return json({ error: 'Manda el archivo como imagen (jpg, png, webp) o PDF.' }, 400)
    if (m[2].length > 14_000_000) return json({ error: 'El archivo es demasiado grande (máx. ~10 MB).' }, 413)
    const bloque = m[1] === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: m[2] } }
      : { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5', max_tokens: 4000,
        messages: [{ role: 'user', content: [bloque, { type: 'text', text: INSTRUCCIONES + (nota ? `\n\nNota de quien sube el documento: ${String(nota).slice(0, 500)}` : '') }] }],
      }),
    })
    if (!r.ok) return json({ error: `El servicio de lectura respondió ${r.status}.`, detalle: (await r.text()).slice(0, 300) }, 502)
    const out = await r.json() as { content: { type: string; text?: string }[] }
    const texto = out.content.filter(c => c.type === 'text').map(c => c.text).join('')
    const j = texto.match(/\{[\s\S]*\}/)
    if (!j) return json({ error: 'No encontré equipos en el documento.', texto: texto.slice(0, 500) }, 422)
    const datos = JSON.parse(j[0])
    if (!Array.isArray(datos.equipos)) datos.equipos = []
    return json(datos)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
