/**
 * Avisos por correo · Control de Activos · Grupo Firme
 * Recibe del ERP (Supabase) el resumen diario y los avisos inmediatos, y manda un correo por persona.
 *
 * Instalación (una sola vez):
 *  1. script.google.com → Proyecto nuevo "Avisos ERP Activos" con la cuenta oscarcota@grupofirmedemexico.com. Pega este código.
 *  2. Configuración del proyecto (engrane) → Propiedades del script → Agregar: SECRETO = (la clave que tú inventes, 12+ caracteres).
 *  3. Implementar → Nueva implementación → Tipo: Aplicación web → Ejecutar como: Yo · Acceso: Cualquier persona → Implementar → autorizar.
 *  4. Copia la URL que termina en /exec y pégala, junto con la misma clave, en el ERP: Organización → Avisos por correo.
 */

var REMITENTE = 'Control de Activos · Grupo Firme';
var AMBAR = '#F9B234', TINTA = '#0B0D11';

function doGet() {
  return ContentService.createTextOutput('Avisos ERP Activos: en línea');
}

function doPost(e) {
  var datos;
  try { datos = JSON.parse(e.postData.contents); } catch (err) { return respuesta({ ok: false, error: 'JSON inválido' }); }
  var secreto = PropertiesService.getScriptProperties().getProperty('SECRETO');
  if (!secreto || datos.secreto !== secreto) return respuesta({ ok: false, error: 'Clave incorrecta' });

  var enviados = 0, errores = [];
  (datos.destinatarios || []).forEach(function (d) {
    if (!d || !d.para) return;
    try {
      if (datos.tipo === 'inmediato') enviarInmediato(d, datos);
      else enviarResumen(d, datos);
      enviados++;
    } catch (err) { errores.push(d.para + ': ' + err); }
  });
  return respuesta({ ok: true, enviados: enviados, errores: errores });
}

function respuesta(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function esc(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function marco(titulo, subtitulo, cuerpo, appUrl) {
  return '<div style="background:#F3F1EC;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:' + TINTA + '">'
    + '<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E4E1DA">'
    + '<div style="background:' + TINTA + ';padding:18px 22px;border-bottom:4px solid ' + AMBAR + '">'
    + '<div style="color:' + AMBAR + ';font-size:11px;letter-spacing:2px;text-transform:uppercase">Grupo Firme · Control de activos</div>'
    + '<div style="color:#fff;font-size:20px;font-weight:bold;margin-top:4px">' + esc(titulo) + '</div>'
    + (subtitulo ? '<div style="color:#C9CCD1;font-size:13px;margin-top:2px">' + esc(subtitulo) + '</div>' : '')
    + '</div><div style="padding:18px 22px">' + cuerpo + '</div>'
    + '<div style="padding:12px 22px;background:#FBFAF7;border-top:1px solid #E4E1DA;font-size:11px;color:#8A8E95">'
    + 'Recibes este correo por los temas que atiendes en el ERP. Para dejar de recibirlo, entra a '
    + (appUrl ? '<a href="' + esc(appUrl) + '/perfil" style="color:#A8701A">Mi perfil</a>' : 'Mi perfil') + ' o pídelo al Departamento de TICS.</div>'
    + '</div></div>';
}

function enviarResumen(d, datos) {
  var total = d.total || 0;
  var hoy = Utilities.formatDate(new Date(), 'America/Mazatlan', 'dd/MM/yyyy');
  var cuerpo = '<p style="margin:0 0 14px;font-size:14px">Hola ' + esc((d.nombre || '').split(' ')[0]) + ', esto es lo que tienes pendiente hoy:</p>';
  var texto = 'Pendientes del ' + hoy + '\n';
  (d.secciones || []).forEach(function (s) {
    cuerpo += '<h3 style="margin:18px 0 8px;font-size:15px;border-left:4px solid ' + AMBAR + ';padding-left:8px">' + esc(s.titulo)
      + ' <span style="color:#8A8E95;font-weight:normal">(' + s.items.length + ')</span></h3>';
    texto += '\n' + s.titulo + '\n';
    s.items.forEach(function (it) {
      var rojo = it.urgente ? '#C62828' : '#5B5F66';
      cuerpo += '<table role="presentation" width="100%" style="border-collapse:collapse;border-bottom:1px solid #EEECE6"><tr>'
        + '<td style="padding:8px 4px;font-size:13px"><b>' + esc(it.texto) + '</b><br><span style="color:' + rojo + '">' + esc(it.detalle) + '</span></td>'
        + '<td style="padding:8px 4px;text-align:right;white-space:nowrap"><a href="' + esc(it.url) + '" style="background:' + AMBAR + ';color:' + TINTA + ';text-decoration:none;font-size:12px;font-weight:bold;padding:6px 10px;border-radius:8px">Abrir</a></td>'
        + '</tr></table>';
      texto += '- ' + it.texto + ' · ' + it.detalle + ' · ' + it.url + '\n';
    });
  });
  if (!total) cuerpo += '<p style="color:#2E7D32">Sin pendientes por ahora. 👍</p>';
  MailApp.sendEmail({
    to: d.para,
    subject: (total ? total + ' pendiente(s)' : 'Sin pendientes') + ' · Activos Grupo Firme · ' + hoy,
    htmlBody: marco('Tus pendientes de hoy', hoy + ' · ' + total + ' aviso(s)', cuerpo, datos.app_url),
    body: texto,
    name: REMITENTE
  });
}

function enviarInmediato(d, datos) {
  var cuerpo = '<p style="font-size:14px;white-space:pre-line;margin:0 0 16px">' + esc(datos.texto) + '</p>'
    + (datos.url ? '<a href="' + esc(datos.url) + '" style="background:' + AMBAR + ';color:' + TINTA + ';text-decoration:none;font-weight:bold;padding:10px 16px;border-radius:10px;display:inline-block">Ver en el ERP</a>' : '');
  MailApp.sendEmail({
    to: d.para,
    subject: '⚠ ' + datos.asunto,
    htmlBody: marco(datos.asunto, 'Aviso inmediato', cuerpo, datos.app_url),
    body: datos.texto + (datos.url ? '\n\n' + datos.url : ''),
    name: REMITENTE
  });
}
