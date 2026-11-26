import{o as e}from"./rolldown-runtime-C0FnF6B9.js";import{n as t,r as n,t as r}from"./createLucideIcon-DXNl85ux.js";import{A as i,B as a,F as o,H as s,I as c,L as l,N as u,S as d,T as f,V as p,_ as m,b as h,n as g,t as _,v,w as y,x as b,y as x,z as S}from"./index-35lJ4SGU.js";var C={name:`plug-zap`,size:24,node:[[`path`,{d:`M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z`,key:`goz73y`}],[`path`,{d:`m2 22 3-3`,key:`19mgm9`}],[`path`,{d:`M7.5 13.5 10 11`,key:`7xgeeb`}],[`path`,{d:`M10.5 16.5 13 14`,key:`10btkg`}],[`path`,{d:`m18 3-4 4h6l-4 4`,key:`16psg9`}]],aliases:[`plug-zap-2`]};C.node;var w=r(C),T=e(n(),1),E=`/**
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
  var texto = 'Pendientes del ' + hoy + '\\n';
  (d.secciones || []).forEach(function (s) {
    cuerpo += '<h3 style="margin:18px 0 8px;font-size:15px;border-left:4px solid ' + AMBAR + ';padding-left:8px">' + esc(s.titulo)
      + ' <span style="color:#8A8E95;font-weight:normal">(' + s.items.length + ')</span></h3>';
    texto += '\\n' + s.titulo + '\\n';
    s.items.forEach(function (it) {
      var rojo = it.urgente ? '#C62828' : '#5B5F66';
      cuerpo += '<table role="presentation" width="100%" style="border-collapse:collapse;border-bottom:1px solid #EEECE6"><tr>'
        + '<td style="padding:8px 4px;font-size:13px"><b>' + esc(it.texto) + '</b><br><span style="color:' + rojo + '">' + esc(it.detalle) + '</span></td>'
        + '<td style="padding:8px 4px;text-align:right;white-space:nowrap"><a href="' + esc(it.url) + '" style="background:' + AMBAR + ';color:' + TINTA + ';text-decoration:none;font-size:12px;font-weight:bold;padding:6px 10px;border-radius:8px">Abrir</a></td>'
        + '</tr></table>';
      texto += '- ' + it.texto + ' · ' + it.detalle + ' · ' + it.url + '\\n';
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
    body: datos.texto + (datos.url ? '\\n\\n' + datos.url : ''),
    name: REMITENTE
  });
}
`,D=t();function O(){let{esAdmin:e,perfil:t}=S(),[n,r]=(0,T.useState)(null),[C,O]=(0,T.useState)([]),[k,A]=(0,T.useState)({url:``,secreto:``}),[j,M]=(0,T.useState)(null),[N,P]=(0,T.useState)(``),[F,I]=(0,T.useState)(void 0),[L,R]=(0,T.useState)(!1),z=()=>{p.rpc(`avisos_estado`).then(({data:e,error:t})=>{t?M({ok:!1,t:a(t)}):r(e)}),p.from(`perfiles`).select(`id,nombre,email,avisos_correo,avisos,avisos_activos,activo`).eq(`activo`,!0).order(`nombre`).then(({data:e})=>O(e??[]))};if((0,T.useEffect)(z,[]),(0,T.useEffect)(()=>{!N&&t&&P(t.id)},[t,N]),(0,T.useEffect)(()=>{N&&(I(void 0),p.rpc(`avisos_vista_previa`,{p_perfil:N}).then(({data:e})=>I(e??null)))},[N]),!e)return(0,D.jsx)(`div`,{className:`tarjeta`,children:(0,D.jsx)(b,{titulo:`Solo administradores`,texto:`Pide al administrador que configure los avisos por correo.`})});if(!n)return j?(0,D.jsx)(m,{children:j.t}):(0,D.jsx)(x,{});let B=n.url&&n.secreto;async function V(e){e.preventDefault(),M(null);let{error:t}=await p.rpc(`avisos_configurar`,{p_url:k.url||null,p_secreto:k.secreto||null});if(t){M({ok:!1,t:a(t)});return}A({url:``,secreto:``}),M({ok:!0,t:`Guardado. Ahora manda una prueba para confirmar que llega.`}),z()}async function H(e){M(null);let{data:t,error:n}=await p.rpc(`avisos_enviar_ahora`,{p_perfil:e?null:N});if(n){M({ok:!1,t:a(n)});return}M({ok:!0,t:e?`Se mandaron ${t} correo(s) con pendientes.`:`Prueba enviada a ${C.find(e=>e.id===N)?.avisos_correo||C.find(e=>e.id===N)?.email}. Revisa la bandeja (y Spam).`}),z()}async function U(){try{await navigator.clipboard.writeText(E),R(!0),setTimeout(()=>R(!1),2500)}catch{}}let W=_.map(e=>({...e,quienes:C.filter(t=>t.avisos?.includes(e.id))}));return(0,D.jsxs)(`div`,{className:`mx-auto max-w-5xl`,children:[(0,D.jsx)(h,{titulo:`Avisos por correo`,sub:`Cada mañana (7:30 a.m.) le llega a cada quien un correo con lo pendiente de los temas que atiende. Robo, extravío y equipo fuera de su lugar se avisan al momento.`}),(0,D.jsxs)(`div`,{className:`mb-5 grid gap-3 sm:grid-cols-3`,children:[(0,D.jsxs)(`div`,{className:`tarjeta flex items-center gap-3 p-4 ${B?``:`!border-amber-300`}`,children:[B?(0,D.jsx)(c,{className:`text-emerald-600`}):(0,D.jsx)(y,{className:`text-amber-600`}),(0,D.jsxs)(`div`,{children:[(0,D.jsx)(`p`,{className:`text-xs text-stone-500`,children:`Envío de correos`}),(0,D.jsx)(`p`,{className:`font-medium`,children:B?`Conectado`:`Falta conectar`})]})]}),(0,D.jsxs)(`div`,{className:`tarjeta flex items-center gap-3 p-4`,children:[(0,D.jsx)(l,{className:`text-marca`}),(0,D.jsxs)(`div`,{children:[(0,D.jsx)(`p`,{className:`text-xs text-stone-500`,children:`Resumen diario`}),(0,D.jsx)(`p`,{className:`font-medium`,children:n.programado?`7:30 a.m. todos los días`:`No programado`})]})]}),(0,D.jsxs)(`div`,{className:`tarjeta flex items-center gap-3 p-4`,children:[(0,D.jsx)(i,{className:`text-marca`}),(0,D.jsxs)(`div`,{className:`min-w-0`,children:[(0,D.jsx)(`p`,{className:`text-xs text-stone-500`,children:`Último envío`}),(0,D.jsx)(`p`,{className:`truncate text-sm font-medium`,children:n.ultimo?new Date(n.ultimo.split(` · `)[0]).toLocaleString(`es-MX`,{dateStyle:`medium`,timeStyle:`short`})+` · `+(n.ultimo.split(` · `)[1]??``):`Todavía no`})]})]})]}),j&&(0,D.jsx)(`div`,{className:`mb-4`,children:(0,D.jsx)(m,{tipo:j.ok?`ok`:`error`,children:j.t})}),(0,D.jsxs)(`div`,{className:`grid gap-5 lg:grid-cols-2 *:min-w-0`,children:[(0,D.jsxs)(`section`,{className:`tarjeta p-5`,children:[(0,D.jsxs)(`h2`,{className:`mb-1 flex items-center gap-2 font-semibold`,children:[(0,D.jsx)(d,{size:17,className:`text-marca`}),`Quién recibe qué`]}),(0,D.jsxs)(`p`,{className:`mb-3 text-xs text-stone-500`,children:[`Se asigna en `,(0,D.jsx)(s,{to:`/usuarios`,className:`text-marca hover:underline`,children:`Usuarios`}),` → editar → “Encargado de”.`]}),(0,D.jsx)(`ul`,{className:`divide-y divide-stone-100`,children:W.map(e=>(0,D.jsxs)(`li`,{className:`py-2`,children:[(0,D.jsx)(`p`,{className:`text-sm font-medium`,children:e.t}),(0,D.jsx)(`p`,{className:`text-xs text-stone-500`,children:e.quienes.length?e.quienes.map(e=>e.nombre+(e.avisos_activos?``:` (pausado)`)).join(`, `):(0,D.jsx)(`span`,{className:`text-amber-700`,children:`Nadie asignado`})})]},e.id))})]}),(0,D.jsxs)(`section`,{className:`tarjeta p-5`,children:[(0,D.jsxs)(`h2`,{className:`mb-3 flex items-center gap-2 font-semibold`,children:[(0,D.jsx)(u,{size:17,className:`text-marca`}),`Así le llegaría hoy`]}),(0,D.jsx)(`select`,{className:`campo mb-3`,value:N,onChange:e=>P(e.target.value),children:C.map(e=>(0,D.jsxs)(`option`,{value:e.id,children:[e.nombre,` · `,(e.avisos??[]).map(g).join(`, `)||`sin temas`]},e.id))}),F===void 0?(0,D.jsx)(x,{}):!F||F.total===0?(0,D.jsx)(`p`,{className:`rounded-xl bg-stone-50 p-4 text-sm text-stone-500`,children:`No tiene pendientes hoy (o no tiene temas asignados). No se le manda correo.`}):(0,D.jsxs)(`div`,{className:`max-h-[26rem] space-y-3 overflow-auto rounded-xl border border-stone-200 p-3`,children:[(0,D.jsxs)(`p`,{className:`text-xs text-stone-500`,children:[`Para: `,(0,D.jsx)(`b`,{children:F.para}),` · `,F.total,` aviso(s)`]}),F.secciones.map(e=>(0,D.jsxs)(`div`,{children:[(0,D.jsxs)(`p`,{className:`mb-1 border-l-4 border-marca pl-2 text-sm font-semibold`,children:[e.titulo,` `,(0,D.jsxs)(`span`,{className:`font-normal text-stone-500`,children:[`(`,e.items.length,`)`]})]}),(0,D.jsx)(`ul`,{className:`space-y-1`,children:e.items.map((e,t)=>(0,D.jsxs)(`li`,{className:`text-xs`,children:[(0,D.jsx)(`b`,{children:e.texto}),` — `,(0,D.jsx)(`span`,{className:e.urgente?`text-red-600`:`text-stone-500`,children:e.detalle})]},t))})]},e.modulo))]}),(0,D.jsxs)(`div`,{className:`mt-3 flex flex-wrap gap-2`,children:[(0,D.jsxs)(`button`,{className:`btn-sec`,disabled:!B,onClick:()=>H(!1),children:[(0,D.jsx)(f,{size:15}),`Mandarle esta prueba`]}),(0,D.jsxs)(`button`,{className:`btn-sec`,disabled:!B,onClick:()=>H(!0),children:[(0,D.jsx)(i,{size:15}),`Mandar el resumen a todos ahora`]})]})]})]}),(0,D.jsxs)(`section`,{className:`tarjeta mt-5 p-5`,children:[(0,D.jsxs)(`h2`,{className:`mb-1 flex items-center gap-2 font-semibold`,children:[(0,D.jsx)(w,{size:17,className:`text-marca`}),B?`Cambiar la conexión`:`Conectar el envío de correos`]}),(0,D.jsxs)(`ol`,{className:`mb-4 list-decimal space-y-1 pl-5 text-sm text-stone-600`,children:[(0,D.jsxs)(`li`,{children:[`Entra a `,(0,D.jsx)(`b`,{children:`script.google.com`}),` con la cuenta de la empresa y crea un proyecto nuevo “Avisos ERP Activos”. Pega el código de abajo.`]}),(0,D.jsxs)(`li`,{children:[`En `,(0,D.jsx)(`b`,{children:`Configuración del proyecto → Propiedades del script`}),` agrega `,(0,D.jsx)(`code`,{className:`rounded bg-stone-100 px-1`,children:`SECRETO`}),` con una clave que tú inventes (12 caracteres o más).`]}),(0,D.jsxs)(`li`,{children:[(0,D.jsx)(`b`,{children:`Implementar → Nueva implementación → Aplicación web`}),`, ejecutar como `,(0,D.jsx)(`b`,{children:`Yo`}),`, acceso `,(0,D.jsx)(`b`,{children:`Cualquier persona`}),`. Autoriza y copia la URL que termina en `,(0,D.jsx)(`b`,{children:`/exec`}),`.`]}),(0,D.jsx)(`li`,{children:`Pega aquí la URL y la misma clave, guarda y manda una prueba.`})]}),(0,D.jsxs)(`form`,{onSubmit:V,className:`grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end`,children:[(0,D.jsx)(v,{label:n.url?`URL del Apps Script (ya guardada; deja vacío para no cambiarla)`:`URL del Apps Script`,children:(0,D.jsx)(`input`,{className:`campo font-mono text-xs`,placeholder:`https://script.google.com/macros/s/…/exec`,value:k.url,onChange:e=>A({...k,url:e.target.value})})}),(0,D.jsx)(v,{label:n.secreto?`Clave (ya guardada)`:`Clave SECRETO`,children:(0,D.jsx)(`input`,{className:`campo`,type:`password`,autoComplete:`new-password`,placeholder:`La misma del Apps Script`,value:k.secreto,onChange:e=>A({...k,secreto:e.target.value})})}),(0,D.jsx)(`button`,{className:`btn-primario`,disabled:!k.url&&!k.secreto,children:`Guardar`})]}),(0,D.jsx)(`p`,{className:`mt-2 text-[11px] text-stone-400`,children:`La clave se guarda protegida en la base de datos y no se vuelve a mostrar.`}),(0,D.jsxs)(`details`,{className:`mt-4`,children:[(0,D.jsx)(`summary`,{className:`cursor-pointer text-sm font-medium text-marca`,children:`Ver el código del Apps Script`}),(0,D.jsxs)(`div`,{className:`relative mt-2`,children:[(0,D.jsxs)(`button`,{type:`button`,className:`btn-sec absolute right-2 top-2 !px-2 !py-1 text-xs`,onClick:U,children:[(0,D.jsx)(o,{size:13}),L?`Copiado`:`Copiar`]}),(0,D.jsx)(`pre`,{className:`max-h-80 overflow-auto rounded-xl bg-stone-900 p-4 text-[11px] leading-relaxed text-stone-100`,children:E})]})]})]})]})}export{O as default};