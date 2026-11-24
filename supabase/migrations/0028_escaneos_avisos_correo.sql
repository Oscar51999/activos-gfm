-- ───────────── 0028 · Escaneos con ubicación ("visto por última vez") y avisos por correo según lo que atiende cada usuario ─────────────
set lock_timeout = '8s';

-- Extensiones para programar el envío diario y llamar al Apps Script que manda los correos
do $$ begin
  begin create extension if not exists pg_net with schema extensions; exception when others then raise notice 'pg_net: %', sqlerrm; end;
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron: %', sqlerrm; end;
end $$;

-- ═════════════ A. Escaneos ═════════════
create table if not exists public.escaneos (
  id uuid primary key default gen_random_uuid(),
  activo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  perfil_id uuid references public.perfiles(id) on delete set null,
  quien text not null default 'Sin sesión',
  origen text not null default 'etiqueta' check (origen in ('etiqueta', 'lector', 'nfc_celular', 'camara')),
  latitud numeric(9,6), longitud numeric(9,6), precision_m integer,
  distancia_km numeric(9,2),
  lejos boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists escaneos_activo_fecha on public.escaneos (activo_id, created_at desc);
create index if not exists escaneos_lejos on public.escaneos (created_at desc) where lejos;
alter table public.escaneos enable row level security;
drop policy if exists escaneos_select on public.escaneos;
create policy escaneos_select on public.escaneos for select to authenticated using (privado.tiene_empresa(empresa_id));
-- sin políticas de escritura: solo se registra con la función de abajo

-- Último escaneo de cada equipo y, aparte, el último lugar conocido (el último escaneo que sí traía ubicación)
create or replace view public.v_ultimo_escaneo with (security_invoker = true) as
select distinct on (e.activo_id) e.activo_id, e.empresa_id, e.created_at, e.quien, e.origen,
       g.latitud, g.longitud, g.precision_m, g.distancia_km, g.lejos, g.created_at as ubicado_at, g.quien as ubicado_por
from public.escaneos e
left join lateral (select x.latitud, x.longitud, x.precision_m, x.distancia_km, x.lejos, x.created_at, x.quien from public.escaneos x
                    where x.activo_id = e.activo_id and x.latitud is not null order by x.created_at desc limit 1) g on true
order by e.activo_id, e.created_at desc;
grant select on public.v_ultimo_escaneo to authenticated;

-- ═════════════ B. Avisos por correo ═════════════
alter table public.perfiles
  add column if not exists avisos text[] not null default '{}',
  add column if not exists avisos_correo text,
  add column if not exists avisos_activos boolean not null default true;

-- Solo un administrador decide de qué se encarga cada quien; cada usuario sí puede pausar sus propios avisos
create or replace function privado.tg_proteger_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not privado.es_admin() then
    if new.rol is distinct from old.rol or new.activo is distinct from old.activo
       or new.todas_empresas is distinct from old.todas_empresas or new.empleado_id is distinct from old.empleado_id
       or new.avisos is distinct from old.avisos or new.avisos_correo is distinct from old.avisos_correo then
      raise exception 'Solo un administrador puede cambiar rol, acceso, empleado o avisos';
    end if;
  end if;
  return new;
end $$;

create table if not exists privado.ajustes (clave text primary key, valor text, updated_at timestamptz not null default now());
revoke all on privado.ajustes from public;
insert into privado.ajustes (clave, valor) values ('app_url', 'https://activos.gfmexico.mx/#') on conflict (clave) do nothing;
create or replace function privado.ajuste(p text) returns text language sql stable security definer set search_path = '' as $$
  select valor from privado.ajustes where clave = p
$$;
create or replace function privado.poner_ajuste(p text, v text) returns void language sql security definer set search_path = '' as $$
  insert into privado.ajustes (clave, valor, updated_at) values (p, v, now()) on conflict (clave) do update set valor = excluded.valor, updated_at = now()
$$;

-- Empresas que ve un perfil (sin depender de la sesión: el envío corre programado)
create or replace function privado.empresas_de(p_perfil uuid) returns setof uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.empresas e, public.perfiles p
   where p.id = p_perfil and (p.todas_empresas or p.rol = 'admin')
  union
  select pe.empresa_id from public.perfil_empresas pe where pe.perfil_id = p_perfil
$$;

create or replace function privado.dias_txt(d integer) returns text language sql immutable as $$
  select case when d is null then '' when d < -1 then 'venció hace ' || (-d) || ' días' when d = -1 then 'venció ayer'
              when d = 0 then 'vence hoy' when d = 1 then 'vence mañana' else 'vence en ' || d || ' días' end
$$;

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

-- Manda el resumen a todos (o a uno). Devuelve a cuántos se les envió.
create or replace function privado.enviar_resumen(p_solo uuid default null, p_aunque_vacio boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare url text := privado.ajuste('avisos_url'); sec text := privado.ajuste('avisos_secreto'); lista jsonb := '[]'::jsonb; r record; j jsonb;
begin
  if url is null or sec is null then
    perform privado.poner_ajuste('avisos_ultimo', now()::text || ' · falta conectar el Apps Script');
    return 0;
  end if;
  for r in select id from public.perfiles
            where activo and avisos_activos and coalesce(nullif(trim(avisos_correo), ''), email) is not null
              and (p_solo is not null and id = p_solo or p_solo is null and (cardinality(avisos) > 0 or empleado_id is not null)) loop
    j := privado.pendientes(r.id);
    if (j->>'total')::int > 0 or p_aunque_vacio then lista := lista || jsonb_build_array(j); end if;
  end loop;
  if jsonb_array_length(lista) > 0 then
    perform net.http_post(url := url, body := jsonb_build_object('secreto', sec, 'tipo', 'resumen', 'app_url', privado.ajuste('app_url'), 'destinatarios', lista),
                          headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 60000);
  end if;
  perform privado.poner_ajuste('avisos_ultimo', now()::text || ' · ' || jsonb_array_length(lista) || ' correo(s)');
  return jsonb_array_length(lista);
end $$;

-- Aviso al momento (robo, extravío, equipo escaneado lejos): a quienes atienden ese tema en esa empresa
create or replace function privado.aviso_inmediato(p_modulo text, p_empresa uuid, p_asunto text, p_texto text, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
declare url text := privado.ajuste('avisos_url'); sec text := privado.ajuste('avisos_secreto'); dest jsonb;
begin
  if url is null or sec is null then return; end if;
  select jsonb_agg(jsonb_build_object('para', coalesce(nullif(trim(p.avisos_correo), ''), p.email), 'nombre', p.nombre)) into dest
    from public.perfiles p
   where p.activo and p.avisos_activos and p_modulo = any (p.avisos) and coalesce(nullif(trim(p.avisos_correo), ''), p.email) is not null
     and p_empresa in (select privado.empresas_de(p.id));
  if dest is null then return; end if;
  perform net.http_post(url := url, body := jsonb_build_object('secreto', sec, 'tipo', 'inmediato', 'app_url', privado.ajuste('app_url'), 'asunto', p_asunto, 'texto', p_texto,
                          'url', coalesce(privado.ajuste('app_url'), '') || p_url, 'destinatarios', dest),
                        headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 30000);
exception when others then raise warning 'aviso_inmediato: %', sqlerrm;  -- un aviso fallido nunca debe impedir guardar el reporte
end $$;

create or replace function privado.tg_reporte_aviso() returns trigger language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  if new.tipo in ('robo', 'extravio') then
    select codigo, descripcion into a from public.activos where id = new.activo_id;
    perform privado.aviso_inmediato('reportes', new.empresa_id,
      'Reporte de ' || case when new.tipo = 'robo' then 'ROBO' else 'EXTRAVÍO' end || ' · ' || a.codigo,
      a.codigo || ' · ' || a.descripcion || E'\n' || new.descripcion || E'\nReportó: ' || coalesce(new.reporta_nombre, 'usuario del sistema'), '/reportes');
  end if;
  return new;
end $$;
drop trigger if exists reportes_aviso on public.reportes;
create trigger reportes_aviso after insert on public.reportes for each row execute function privado.tg_reporte_aviso();

-- ═════════════ C. Registrar un escaneo (con o sin sesión) ═════════════
create or replace function public.registrar_escaneo(p_qr uuid default null, p_activo uuid default null, p_origen text default 'etiqueta',
                                                    p_lat numeric default null, p_lng numeric default null, p_precision integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; hay boolean := false; uid uuid := auth.uid(); v_quien text; v_lat numeric; v_lng numeric; v_dist numeric; v_lejos boolean := false; v_previo uuid;
begin
  if p_qr is not null then
    select ac.id, ac.empresa_id, ac.codigo, ac.descripcion, ub.latitud ulat, ub.longitud ulng, ub.nombre unom into a
      from public.activos ac left join public.ubicaciones ub on ub.id = ac.ubicacion_id where ac.qr = p_qr and ac.estatus <> 'baja';
    hay := found;
  elsif p_activo is not null and uid is not null then
    select ac.id, ac.empresa_id, ac.codigo, ac.descripcion, ub.latitud ulat, ub.longitud ulng, ub.nombre unom into a
      from public.activos ac left join public.ubicaciones ub on ub.id = ac.ubicacion_id where ac.id = p_activo and privado.tiene_empresa(ac.empresa_id);
    hay := found;
  end if;
  if not hay then return null; end if;

  if p_lat between -90 and 90 and p_lng between -180 and 180 and not (p_lat = 0 and p_lng = 0) then v_lat := round(p_lat, 6); v_lng := round(p_lng, 6); end if;
  if uid is not null then select nullif(trim(nombre), '') into v_quien from public.perfiles where id = uid; end if;
  v_quien := coalesce(v_quien, 'Sin sesión');

  -- límites: el mismo equipo por la misma persona cuenta una vez cada 10 min; sin sesión, máximo 30 al día por equipo
  select id into v_previo from public.escaneos
   where activo_id = a.id and created_at > now() - interval '10 minutes' and (perfil_id = uid or uid is null and perfil_id is null)
   order by created_at desc limit 1;
  if v_previo is not null then
    if v_lat is not null then update public.escaneos set latitud = v_lat, longitud = v_lng, precision_m = p_precision where id = v_previo and latitud is null; end if;
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;
  if uid is null and (select count(*) from public.escaneos where activo_id = a.id and perfil_id is null and created_at > now() - interval '24 hours') >= 30 then
    return jsonb_build_object('ok', false);
  end if;

  if v_lat is not null and a.ulat is not null then
    v_dist := round((6371 * 2 * asin(sqrt(power(sin(radians(v_lat - a.ulat) / 2), 2) + cos(radians(a.ulat)) * cos(radians(v_lat)) * power(sin(radians(v_lng - a.ulng) / 2), 2))))::numeric, 2);
    v_lejos := v_dist > 5 and coalesce(p_precision, 0) < 2000;
  end if;

  insert into public.escaneos (activo_id, empresa_id, perfil_id, quien, origen, latitud, longitud, precision_m, distancia_km, lejos)
  values (a.id, a.empresa_id, uid, v_quien, coalesce(nullif(p_origen, ''), 'etiqueta'), v_lat, v_lng, p_precision, v_dist, v_lejos);

  if v_lejos and not exists (select 1 from public.escaneos e where e.activo_id = a.id and e.lejos and e.created_at > now() - interval '12 hours' and e.created_at < now() - interval '1 second') then
    perform privado.aviso_inmediato('escaneos', a.empresa_id, 'Equipo escaneado lejos de su lugar · ' || a.codigo,
      a.codigo || ' · ' || a.descripcion || E'\nSe escaneó a ' || v_dist || ' km de ' || coalesce(a.unom, 'su ubicación') || E'.\nEscaneó: ' || v_quien
      || E'\nUbicación: https://maps.google.com/?q=' || v_lat || ',' || v_lng, '/activos/' || a.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.registrar_escaneo(uuid, uuid, text, numeric, numeric, integer) from public;
grant execute on function public.registrar_escaneo(uuid, uuid, text, numeric, numeric, integer) to anon, authenticated;

-- ═════════════ D. Lo que usa la pantalla "Avisos por correo" (solo administrador) ═════════════
create or replace function public.avisos_configurar(p_url text default null, p_secreto text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then raise exception 'Solo un administrador'; end if;
  if nullif(trim(p_url), '') is not null then
    if trim(p_url) !~ '^https://script\.google\.com/' then raise exception 'La URL debe ser la de la implementación del Apps Script (https://script.google.com/…/exec)'; end if;
    perform privado.poner_ajuste('avisos_url', trim(p_url));
  end if;
  if nullif(trim(p_secreto), '') is not null then
    if length(trim(p_secreto)) < 12 then raise exception 'La clave debe tener al menos 12 caracteres'; end if;
    perform privado.poner_ajuste('avisos_secreto', trim(p_secreto));
  end if;
end $$;

create or replace function public.avisos_estado()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare prog boolean := false;
begin
  if not privado.es_admin() then raise exception 'Solo un administrador'; end if;
  begin execute 'select exists (select 1 from cron.job where jobname = ''avisos-diarios'')' into prog; exception when others then prog := false; end;
  return jsonb_build_object('url', privado.ajuste('avisos_url') is not null, 'secreto', privado.ajuste('avisos_secreto') is not null,
    'ultimo', privado.ajuste('avisos_ultimo'), 'programado', prog);
end $$;

create or replace function public.avisos_vista_previa(p_perfil uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_perfil is not null and p_perfil <> auth.uid() and not privado.es_admin() then raise exception 'Solo un administrador'; end if;
  return privado.pendientes(coalesce(p_perfil, auth.uid()));
end $$;

create or replace function public.avisos_enviar_ahora(p_perfil uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then raise exception 'Solo un administrador'; end if;
  if privado.ajuste('avisos_url') is null or privado.ajuste('avisos_secreto') is null then raise exception 'Primero conecta el Apps Script (URL y clave)'; end if;
  return privado.enviar_resumen(p_perfil, p_perfil is not null);
end $$;

revoke execute on function public.avisos_configurar(text, text), public.avisos_estado(), public.avisos_vista_previa(uuid), public.avisos_enviar_ahora(uuid) from public, anon;
grant execute on function public.avisos_configurar(text, text), public.avisos_estado(), public.avisos_vista_previa(uuid), public.avisos_enviar_ahora(uuid) to authenticated;

-- ═════════════ E. Envío diario 7:30 a.m. hora de La Paz (14:30 UTC) ═════════════
do $$ begin
  begin perform cron.unschedule('avisos-diarios'); exception when others then null; end;
  perform cron.schedule('avisos-diarios', '30 14 * * *', 'select privado.enviar_resumen()');
exception when others then raise notice 'cron: %', sqlerrm;
end $$;

select 'ok' as resultado;
