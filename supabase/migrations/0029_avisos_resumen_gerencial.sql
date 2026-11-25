-- ───────────── 0029 · Tema de avisos "gerencia": resumen diario de lo que hizo el equipo ─────────────
set lock_timeout = '8s';

-- Lo pendiente de un usuario, agrupado por lo que atiende. Sin montos.
create or replace function privado.pendientes(p_perfil uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p public.perfiles; u text := coalesce(privado.ajuste('app_url'), '');
  secs jsonb := '[]'::jsonb; items jsonb; m text;
begin
  select * into p from public.perfiles where id = p_perfil;
  if p.id is null then return null; end if;

  foreach m in array p.avisos loop
    items := null;
    if m = 'inmuebles' then
      select jsonb_agg(x order by x->>'orden') into items from (
        select jsonb_build_object('texto', s.concepto || ' · ' || coalesce(s.inmueble, ''), 'detalle', 'Servicio por pagar: ' || privado.dias_txt(s.dias_restantes),
               'url', u || '/inmuebles/' || s.inmueble_id, 'urgente', s.dias_restantes < 0, 'orden', lpad((s.dias_restantes + 1000)::text, 5, '0')) x
          from public.v_servicios_inmuebles s
         where not s.pagado and s.fecha_limite is not null and s.dias_restantes <= 5 and s.empresa_id in (select privado.empresas_de(p.id))
        union all
        select jsonb_build_object('texto', initcap(replace(v.tipo, '_', ' ')) || ' · ' || coalesce(v.inmueble, ''), 'detalle', 'Documento: ' || privado.dias_txt(v.dias_restantes),
               'url', u || '/inmuebles/' || v.inmueble_id, 'urgente', v.estado = 'vencido', 'orden', lpad((v.dias_restantes + 1000)::text, 5, '0'))
          from public.v_vigencias v
         where v.inmueble_id is not null and v.estado <> 'vigente' and v.empresa_id in (select privado.empresas_de(p.id))
        limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Inmuebles y servicios', 'items', items); end if;

    elsif m = 'vehiculos' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', initcap(replace(v.tipo, '_', ' ')) || ' · ' || coalesce(v.placa, v.numero_economico, v.activo_codigo) || ' ' || coalesce(v.marca, '') || ' ' || coalesce(v.modelo, ''),
               'detalle', 'Documento del vehículo: ' || privado.dias_txt(v.dias_restantes), 'url', u || '/activos/' || v.activo_id, 'urgente', v.estado = 'vencido') x
          from public.v_vigencias v join public.activos a on a.id = v.activo_id join public.categorias c on c.id = a.categoria_id
         where c.es_vehiculo and v.estado <> 'vigente' and a.estatus <> 'baja' and v.empresa_id in (select privado.empresas_de(p.id))
        union all
        select jsonb_build_object('texto', mt.plan || ' · ' || mt.codigo || ' ' || coalesce(mt.marca, '') || ' ' || coalesce(mt.modelo, ''),
               'detalle', case when mt.estado = 'vencido' then 'Mantenimiento vencido' else 'Mantenimiento próximo' end, 'url', u || '/activos/' || mt.activo_id, 'urgente', mt.estado = 'vencido')
          from public.v_mantenimiento mt join public.activos a on a.id = mt.activo_id join public.categorias c on c.id = a.categoria_id
         where c.es_vehiculo and mt.estado in ('vencido', 'proximo') and mt.ot_abierta is null and mt.empresa_id in (select privado.empresas_de(p.id))
        union all
        select jsonb_build_object('texto', a.codigo || ' · ' || a.descripcion, 'detalle', 'Checklist con fallas de ' || coalesce(ck.operador, 'operador') || ' (' || to_char(ck.created_at at time zone 'America/Mazatlan', 'DD/MM HH24:MI') || ')',
               'url', u || '/activos/' || a.id, 'urgente', true)
          from public.checklists ck join public.activos a on a.id = ck.activo_id join public.categorias c on c.id = a.categoria_id
         where c.es_vehiculo and not ck.todo_ok and ck.created_at > now() - interval '24 hours' and ck.empresa_id in (select privado.empresas_de(p.id))
        limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Vehículos y maquinaria', 'items', items); end if;

    elsif m = 'mantenimiento' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', mt.plan || ' · ' || mt.codigo || ' ' || coalesce(mt.descripcion, ''),
               'detalle', case when mt.estado = 'vencido' then 'Mantenimiento vencido' else 'Mantenimiento próximo' end, 'url', u || '/activos/' || mt.activo_id, 'urgente', mt.estado = 'vencido') x
          from public.v_mantenimiento mt join public.activos a on a.id = mt.activo_id join public.categorias c on c.id = a.categoria_id
         where not c.es_vehiculo and mt.estado in ('vencido', 'proximo') and mt.ot_abierta is null and mt.empresa_id in (select privado.empresas_de(p.id))
        limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Mantenimiento de equipo', 'items', items); end if;

    elsif m = 'documentos' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', initcap(replace(v.tipo, '_', ' ')) || ' · ' || coalesce(nullif(v.empleado, ''), v.activo_codigo || ' ' || coalesce(v.activo_descripcion, ''), v.empresa),
               'detalle', privado.dias_txt(v.dias_restantes), 'url', u || '/vigencias', 'urgente', v.estado = 'vencido') x
          from public.v_vigencias v left join public.activos a on a.id = v.activo_id left join public.categorias c on c.id = a.categoria_id
         where v.estado <> 'vigente' and v.inmueble_id is null and not coalesce(c.es_vehiculo, false) and v.empresa_id in (select privado.empresas_de(p.id))
        limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Documentos y vigencias', 'items', items); end if;

    elsif m = 'resguardos' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', mv.folio || ' · ' || coalesce(mv.recibe_nombre, 'sin nombre'), 'detalle', 'Resguardo sin firmar desde el ' || to_char(mv.fecha at time zone 'America/Mazatlan', 'DD/MM/YYYY'),
               'url', u || '/resguardos/' || mv.id, 'urgente', mv.fecha < now() - interval '7 days') x
          from public.movimientos mv
         where mv.firma_recibe is null and not mv.cancelado and mv.fecha < now() - interval '1 day' and mv.empresa_id in (select privado.empresas_de(p.id))
         order by mv.fecha limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Resguardos por firmar', 'items', items); end if;

    elsif m = 'prestamos' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', pr.codigo || ' · ' || pr.descripcion || ' · ' || coalesce(pr.empleado, ''), 'detalle', 'Devolución: ' || privado.dias_txt(pr.dias_restantes),
               'url', u || '/prestamos', 'urgente', pr.dias_restantes < 0) x
          from public.v_prestamos pr
         where pr.dias_restantes <= 1 and pr.empresa_id in (select privado.empresas_de(p.id))
         order by pr.dias_restantes limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Préstamos por devolver', 'items', items); end if;

    elsif m = 'reportes' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', r.folio || ' · ' || a.codigo || ' ' || a.descripcion, 'detalle', initcap(replace(r.tipo, '_', ' ')) || ': ' || left(r.descripcion, 140),
               'url', u || '/reportes', 'urgente', r.prioridad = 'alta') x
          from public.reportes r join public.activos a on a.id = r.activo_id
         where r.estatus in ('abierto', 'en_proceso') and r.empresa_id in (select privado.empresas_de(p.id))
         order by (r.prioridad = 'alta') desc, r.created_at desc limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Reportes de falla abiertos', 'items', items); end if;

    elsif m = 'almacen' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', ex.nombre || coalesce(' · ' || ex.ubicacion, ''), 'detalle', 'Quedan ' || trim(to_char(ex.existencia, 'FM999999990.##')) || ' ' || coalesce(ex.unidad, '') || ' (mínimo ' || trim(to_char(ex.minimo, 'FM999999990.##')) || ')',
               'url', u || '/almacen', 'urgente', ex.existencia <= 0) x
          from public.v_existencias ex
         where ex.minimo > 0 and ex.existencia < ex.minimo and ex.empresa_id in (select privado.empresas_de(p.id))
        limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Material bajo mínimo', 'items', items); end if;

    elsif m = 'solicitudes' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', s.folio || ' · ' || coalesce(s.solicitante, ''), 'detalle', coalesce(left(s.motivo, 140), 'Solicitud por aprobar'),
               'url', u || '/solicitudes', 'urgente', s.fecha_necesaria is not null and s.fecha_necesaria <= current_date) x
          from public.solicitudes s
         where s.estatus = 'pendiente' and s.empresa_id in (select privado.empresas_de(p.id))
         order by s.created_at limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Solicitudes por aprobar', 'items', items); end if;

    elsif m = 'licencias' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', l.nombre || coalesce(' · ' || l.fabricante, ''), 'detalle', privado.dias_txt(l.dias_restantes), 'url', u || '/licencias', 'urgente', l.dias_restantes < 0) x
          from public.v_licencias l
         where l.activo and l.fecha_vencimiento is not null and l.dias_restantes <= 30 and l.dias_restantes >= -30 and l.empresa_id in (select privado.empresas_de(p.id))
        limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Licencias por vencer', 'items', items); end if;

    elsif m = 'garantias' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', a.codigo || ' · ' || a.descripcion, 'detalle', 'Garantía ' || privado.dias_txt(a.garantia_hasta - current_date), 'url', u || '/activos/' || a.id, 'urgente', false) x
          from public.activos a
         where a.estatus <> 'baja' and a.garantia_hasta between current_date and current_date + 30 and a.empresa_id in (select privado.empresas_de(p.id))
         order by a.garantia_hasta limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Garantías por vencer', 'items', items); end if;

    elsif m = 'gerencia' then
      select jsonb_agg(x order by (x->>'orden')) into items from (
        -- actividades del equipo: avances y terminadas por persona en las últimas 24 h
        select jsonb_build_object('orden', '1' || coalesce(pf.nombre, ''), 'texto', coalesce(pf.nombre, 'Sin nombre') || ' · actividades',
               'detalle', count(*) || ' avance(s) registrados' || case when count(*) filter (where av.estatus = 'listo') > 0 then ', ' || count(*) filter (where av.estatus = 'listo') || ' terminada(s)' else '' end
                 || case when count(*) filter (where av.estatus = 'atorado') > 0 then ', ' || count(*) filter (where av.estatus = 'atorado') || ' atorada(s)' else '' end,
               'url', u || '/actividades', 'urgente', count(*) filter (where av.estatus = 'atorado') > 0) x
          from public.actividad_avances av join public.actividades ac on ac.id = av.actividad_id
          left join public.perfiles pf on pf.id = av.autor_id
         where av.created_at > now() - interval '24 hours' and (ac.empresa_id is null or ac.empresa_id in (select privado.empresas_de(p.id)))
         group by pf.nombre
        union all
        select jsonb_build_object('orden', '2', 'texto', 'Actividades atrasadas o atoradas',
               'detalle', count(*) filter (where ac.fecha_fin < current_date) || ' con fecha vencida y ' || count(*) filter (where ac.estatus = 'atorado') || ' atorada(s)',
               'url', u || '/actividades', 'urgente', true)
          from public.actividades ac
         where ac.estatus <> 'listo' and (ac.fecha_fin < current_date or ac.estatus = 'atorado') and (ac.empresa_id is null or ac.empresa_id in (select privado.empresas_de(p.id)))
        having count(*) > 0
        union all
        -- quién trabajó en el sistema
        select jsonb_build_object('orden', '3' || coalesce(pf.nombre, ''), 'texto', coalesce(pf.nombre, 'Usuario') || ' · movimientos en el sistema',
               'detalle', count(*) || ' registro(s): ' || string_agg(distinct replace(b.tabla, '_', ' '), ', '), 'url', u || '/', 'urgente', false)
          from public.bitacora b join public.perfiles pf on pf.id = b.usuario_id
         where b.fecha > now() - interval '24 hours'
         group by pf.nombre
        union all
        select jsonb_build_object('orden', '4', 'texto', 'Resguardos',
               'detalle', count(*) filter (where mv.tipo = 'asignacion') || ' entrega(s), ' || count(*) filter (where mv.tipo = 'devolucion') || ' devolución(es), ' || count(*) filter (where mv.tipo = 'traspaso') || ' traspaso(s)',
               'url', u || '/resguardos', 'urgente', false)
          from public.movimientos mv where not mv.cancelado and mv.created_at > now() - interval '24 hours' and mv.empresa_id in (select privado.empresas_de(p.id))
        having count(*) > 0
        union all
        select jsonb_build_object('orden', '5', 'texto', 'Activos', 'detalle',
               (select count(*) from public.bitacora b where b.tabla = 'activos' and b.accion = 'INSERT' and b.fecha > now() - interval '24 hours') || ' alta(s) · '
               || (select count(*) from public.bajas_activos ba where ba.created_at > now() - interval '24 hours' and ba.empresa_id in (select privado.empresas_de(p.id))) || ' baja(s) solicitadas',
               'url', u || '/activos', 'urgente', false)
         where exists (select 1 from public.bitacora b where b.tabla = 'activos' and b.accion = 'INSERT' and b.fecha > now() - interval '24 hours')
            or exists (select 1 from public.bajas_activos ba where ba.created_at > now() - interval '24 hours')
        union all
        select jsonb_build_object('orden', '6', 'texto', 'Reportes de falla',
               'detalle', count(*) filter (where r.created_at > now() - interval '24 hours') || ' nuevo(s), ' || count(*) filter (where r.resuelto_at > now() - interval '24 hours') || ' resuelto(s), '
                 || count(*) filter (where r.estatus in ('abierto', 'en_proceso')) || ' abiertos en total',
               'url', u || '/reportes', 'urgente', count(*) filter (where r.estatus in ('abierto', 'en_proceso') and r.prioridad = 'alta') > 0)
          from public.reportes r where r.empresa_id in (select privado.empresas_de(p.id))
        having count(*) filter (where r.created_at > now() - interval '24 hours' or r.resuelto_at > now() - interval '24 hours' or r.estatus in ('abierto', 'en_proceso')) > 0
        union all
        select jsonb_build_object('orden', '7', 'texto', 'Mantenimiento',
               'detalle', count(*) filter (where ot.estatus = 'terminada' and ot.updated_at > now() - interval '24 hours') || ' orden(es) terminadas, '
                 || count(*) filter (where ot.estatus in ('abierta', 'en_proceso', 'espera_refaccion')) || ' abiertas',
               'url', u || '/mantenimiento', 'urgente', false)
          from public.ordenes_trabajo ot where ot.empresa_id in (select privado.empresas_de(p.id))
        having count(*) filter (where ot.estatus in ('abierta', 'en_proceso', 'espera_refaccion') or ot.updated_at > now() - interval '24 hours') > 0
        union all
        select jsonb_build_object('orden', '8', 'texto', 'Servicios de inmuebles',
               'detalle', count(*) filter (where ip.pagado and ip.pagado_at >= current_date - 1) || ' pagado(s) · ' || count(*) filter (where not ip.pagado and ip.fecha_limite < current_date) || ' vencido(s) sin pagar',
               'url', u || '/servicios', 'urgente', count(*) filter (where not ip.pagado and ip.fecha_limite < current_date) > 0)
          from public.inmueble_pagos ip where ip.empresa_id in (select privado.empresas_de(p.id))
        having count(*) filter (where (ip.pagado and ip.pagado_at >= current_date - 1) or (not ip.pagado and ip.fecha_limite < current_date)) > 0
        union all
        select jsonb_build_object('orden', '9', 'texto', 'Solicitudes de equipo o material',
               'detalle', count(*) filter (where s.created_at > now() - interval '24 hours') || ' nueva(s), ' || count(*) filter (where s.estatus = 'pendiente') || ' por aprobar',
               'url', u || '/solicitudes', 'urgente', false)
          from public.solicitudes s where s.empresa_id in (select privado.empresas_de(p.id))
        having count(*) filter (where s.created_at > now() - interval '24 hours' or s.estatus = 'pendiente') > 0
      ) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Resumen de la operación (últimas 24 h)', 'items', items); end if;
    elsif m = 'escaneos' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', a.codigo || ' · ' || a.descripcion, 'detalle', 'Escaneado a ' || e.distancia_km || ' km de su ubicación por ' || e.quien || ' (' || to_char(e.created_at at time zone 'America/Mazatlan', 'DD/MM HH24:MI') || ')',
               'url', u || '/activos/' || a.id, 'urgente', true) x
          from public.escaneos e join public.activos a on a.id = e.activo_id
         where e.lejos and e.created_at > now() - interval '24 hours' and e.empresa_id in (select privado.empresas_de(p.id))
         order by e.created_at desc limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Equipo escaneado lejos de su lugar', 'items', items); end if;
    end if;
  end loop;

  -- Lo personal: resguardos a su nombre por firmar y préstamos suyos vencidos (si el usuario está ligado a un empleado)
  if p.empleado_id is not null then
    select jsonb_agg(x) into items from (
      select jsonb_build_object('texto', mv.folio, 'detalle', 'Tienes este resguardo por firmar', 'url', u || '/firmar/' || mv.token_firma, 'urgente', false) x
        from public.movimientos mv where mv.a_empleado_id = p.empleado_id and mv.firma_recibe is null and not mv.cancelado and mv.token_firma is not null
      union all
      select jsonb_build_object('texto', pr.codigo || ' · ' || pr.descripcion, 'detalle', 'Préstamo a tu nombre: ' || privado.dias_txt(pr.dias_restantes), 'url', u || '/mis-equipos', 'urgente', pr.dias_restantes < 0)
        from public.v_prestamos pr where pr.empleado_id = p.empleado_id and pr.dias_restantes <= 1
      limit 20) t;
    if items is not null then secs := jsonb_build_object('modulo', 'personal', 'titulo', 'Lo tuyo', 'items', items) || '[]'::jsonb || secs; end if;
  end if;

  return jsonb_build_object('para', coalesce(nullif(trim(p.avisos_correo), ''), p.email), 'nombre', p.nombre,
    'total', (select coalesce(sum(jsonb_array_length(s->'items')), 0) from jsonb_array_elements(secs) s), 'secciones', secs);
end $$;


select 'ok' as resultado;
