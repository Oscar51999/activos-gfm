// Aviso por correo de vencimientos y pendientes del sistema de activos.
// Lo dispara el horario semanal (con el encabezado x-alertas-secreto) o un administrador desde la app.
// Variables: RESEND_API_KEY (para enviar), ALERTAS_REMITENTE (ej. "Activos GF <activos@gfmexico.mx>"),
//            ALERTAS_SECRETO (para el horario), APP_URL (link del sistema). Sin RESEND_API_KEY solo devuelve la vista previa.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ETIQUETA: Record<string, string> = {
  poliza_seguro: 'Póliza de seguro', tarjeta_circulacion: 'Tarjeta de circulación', verificacion: 'Verificación', calibracion: 'Calibración',
  garantia: 'Garantía', arrendamiento: 'Arrendamiento', permiso: 'Permiso', licencia_manejo: 'Licencia de manejo', certificacion: 'Certificación', otro: 'Documento',
  predial: 'Predial', constancias: 'Constancia', licencia_funcionamiento: 'Licencia de funcionamiento', uso_suelo: 'Uso de suelo', pc_dictamen: 'Protección Civil (dictamen)',
  pc_primeros_auxilios: 'Protección Civil (primeros auxilios)', medio_ambiente: 'Medio ambiente', fumigacion: 'Fumigación', residuos: 'Recolección de residuos', pipc: 'PIPC',
  licencia_construccion: 'Licencia de construcción', seguro_danos: 'Seguro de daños patrimoniales',
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-alertas-secreto' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const fecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!, servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(url, servicio)

  // ¿quién llama? horario (secreto) o un administrador con sesión
  const secreto = Deno.env.get('ALERTAS_SECRETO')
  let autorizado = !!secreto && req.headers.get('x-alertas-secreto') === secreto
  if (!autorizado) {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data } = await db.auth.getUser(token)
    if (data.user) {
      const { data: p } = await db.from('perfiles').select('rol,activo').eq('id', data.user.id).single()
      autorizado = !!p?.activo && p.rol === 'admin'
    }
  }
  if (!autorizado) return json({ error: 'No autorizado' }, 401)

  const hoy = new Date(); const iso = (d: Date) => d.toISOString().slice(0, 10)
  const [docs, prest, reps, dest] = await Promise.all([
    db.from('v_vigencias').select('tipo,numero,fecha_vencimiento,dias_restantes,estado,empresa_corto,activo_codigo,marca,modelo,placa,activo_descripcion,empleado,inmueble_codigo,inmueble').neq('estado', 'vigente').order('fecha_vencimiento'),
    db.from('v_prestamos').select('codigo,marca,modelo,descripcion,empleado,fecha_devolucion,empresa').lt('fecha_devolucion', iso(hoy)).order('fecha_devolucion'),
    db.from('reportes').select('folio,tipo,prioridad,descripcion,created_at,activos(codigo,descripcion)').in('estatus', ['abierto', 'en_proceso']).order('created_at'),
    db.from('perfiles').select('email,nombre').eq('activo', true).in('rol', ['admin', 'almacen']),
  ])
  const vencidos = (docs.data ?? []).filter(d => d.estado === 'vencido'), porVencer = (docs.data ?? []).filter(d => d.estado === 'por_vencer')
  const resumen = { documentos_vencidos: vencidos.length, documentos_por_vencer: porVencer.length, prestamos_vencidos: prest.data?.length ?? 0, reportes_abiertos: reps.data?.length ?? 0 }
  const correos = (dest.data ?? []).map(d => d.email).filter(Boolean) as string[]
  const total = Object.values(resumen).reduce((a, b) => a + b, 0)

  const app = Deno.env.get('APP_URL') ?? ''
  const fila = (c: string[], rojo = false) => `<tr>${c.map((x, i) => `<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;${i === c.length - 1 && rojo ? 'color:#c0262d;font-weight:600' : ''}">${x}</td>`).join('')}</tr>`
  const tabla = (t: string, cab: string[], filas: string[]) => filas.length ? `<h3 style="font:600 15px Arial;margin:22px 0 8px">${t}</h3><table style="border-collapse:collapse;width:100%;font-family:Arial">` +
    `<tr>${cab.map(h => `<th style="text-align:left;padding:6px 10px;font-size:11px;color:#777;text-transform:uppercase;border-bottom:2px solid #F9B234">${h}</th>`).join('')}</tr>${filas.join('')}</table>` : ''
  const queEs = (d: Record<string, string | null>) => d.activo_codigo ? `${esc(d.activo_codigo)} · ${esc([d.marca, d.modelo].filter(Boolean).join(' ') || d.activo_descripcion)}${d.placa ? ' · ' + esc(d.placa) : ''}` : d.inmueble ? `${esc(d.inmueble_codigo)} · ${esc(d.inmueble)}` : esc(d.empleado)
  const html = `<div style="max-width:680px;margin:auto;font-family:Arial;color:#1E1719">
    <div style="background:#0B0D11;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><b style="color:#F9B234">Grupo Empresarial Firme</b> · Control de activos</div>
    <div style="padding:20px 22px;border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px">
    <p style="font-size:15px">Resumen del ${fecha(iso(hoy))}: <b>${resumen.documentos_vencidos}</b> documentos vencidos, <b>${resumen.documentos_por_vencer}</b> por vencer, <b>${resumen.prestamos_vencidos}</b> préstamos vencidos y <b>${resumen.reportes_abiertos}</b> reportes de falla abiertos.</p>
    ${tabla('Documentos vencidos', ['Documento', 'De', 'Empresa', 'Venció'], vencidos.map(d => fila([esc(ETIQUETA[d.tipo] ?? d.tipo) + (d.numero ? ' ' + esc(d.numero) : ''), queEs(d), esc(d.empresa_corto), fecha(d.fecha_vencimiento)], true)))}
    ${tabla('Por vencer', ['Documento', 'De', 'Empresa', 'Vence'], porVencer.map(d => fila([esc(ETIQUETA[d.tipo] ?? d.tipo), queEs(d), esc(d.empresa_corto), `${fecha(d.fecha_vencimiento)} (${d.dias_restantes} días)`])))}
    ${tabla('Préstamos vencidos', ['Activo', 'Lo tiene', 'Debía regresar'], (prest.data ?? []).map(p => fila([`${esc(p.codigo)} · ${esc([p.marca, p.modelo].filter(Boolean).join(' ') || p.descripcion)}`, esc(p.empleado), fecha(p.fecha_devolucion)], true)))}
    ${tabla('Reportes de falla abiertos', ['Folio', 'Activo', 'Problema', 'Prioridad'], (reps.data ?? []).map((r: Record<string, any>) => fila([esc(r.folio), esc(r.activos?.codigo), esc(r.descripcion).slice(0, 90), esc(r.prioridad)], r.prioridad === 'alta')))}
    ${app ? `<p style="margin-top:24px"><a href="${esc(app)}" style="background:#F9B234;color:#120D04;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Abrir el sistema</a></p>` : ''}
    </div></div>`

  const llave = Deno.env.get('RESEND_API_KEY')
  if (!llave || !correos.length || total === 0) return json({ enviado: false, motivo: !llave ? 'Falta configurar RESEND_API_KEY' : !correos.length ? 'No hay administradores con correo' : 'No hay pendientes', resumen, destinatarios: correos })
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('ALERTAS_REMITENTE') ?? 'Activos Grupo Firme <onboarding@resend.dev>', to: correos,
      subject: `Activos: ${resumen.documentos_vencidos} vencidos, ${resumen.documentos_por_vencer} por vencer, ${resumen.prestamos_vencidos} préstamos vencidos`, html }),
  })
  return json({ enviado: r.ok, resumen, destinatarios: correos, respuesta: r.ok ? undefined : await r.text() }, r.ok ? 200 : 502)
})
