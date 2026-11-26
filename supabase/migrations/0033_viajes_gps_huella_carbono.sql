-- ───────────── 0033 · Bitácora de viajes con GPS (cuadre con combustible) y huella de carbono ─────────────
-- Sin montos. El operador inicia y termina el viaje desde su celular; el recorrido GPS se compara con el odómetro
-- y con las cargas de combustible. Con los litros cargados se calculan las emisiones de CO₂.

-- ═════════════ A. Viajes ═════════════
alter table public.lecturas drop constraint if exists lecturas_origen_check;
alter table public.lecturas add constraint lecturas_origen_check check (origen = any (array['manual', 'checklist', 'orden', 'combustible', 'viaje']));

create or replace function privado.km_entre(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 6371 * 2 * asin(least(1, sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

create table if not exists public.viajes (
  id uuid primary key default gen_random_uuid(),
  activo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  perfil_id uuid references auth.users(id) on delete set null default auth.uid(),
  operador text, motivo text, destino text,
  inicio timestamptz not null default now(), fin timestamptz,
  km_inicio numeric(12,1) check (km_inicio is null or km_inicio >= 0),
  km_fin numeric(12,1) check (km_fin is null or km_fin >= 0),
  lat_inicio double precision, lng_inicio double precision, lat_fin double precision, lng_fin double precision,
  km_gps numeric(10,2) not null default 0, puntos int not null default 0,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'terminado', 'cancelado')),
  notas text,
  created_at timestamptz not null default now(),
  constraint viajes_km_orden check (km_fin is null or km_inicio is null or km_fin >= km_inicio)
);
create unique index if not exists viajes_uno_en_curso on public.viajes (activo_id) where estado = 'en_curso';
create index if not exists viajes_activo_inicio on public.viajes (activo_id, inicio desc);
create index if not exists viajes_empresa on public.viajes (empresa_id);
create index if not exists viajes_perfil on public.viajes (perfil_id);

create table if not exists public.viaje_puntos (
  id bigint generated always as identity primary key,
  viaje_id uuid not null references public.viajes(id) on delete cascade,
  t timestamptz not null, lat double precision not null, lng double precision not null, precision_m numeric(8,1)
);
create index if not exists viaje_puntos_viaje on public.viaje_puntos (viaje_id, t);

alter table public.viajes enable row level security;
alter table public.viaje_puntos enable row level security;
drop policy if exists viajes_select on public.viajes;
create policy viajes_select on public.viajes for select to authenticated using (privado.tiene_empresa(empresa_id));
drop policy if exists viajes_editar on public.viajes;
create policy viajes_editar on public.viajes for update to authenticated using (privado.puede_editar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));
drop policy if exists viajes_borrar on public.viajes;
create policy viajes_borrar on public.viajes for delete to authenticated using (privado.puede_editar() and privado.tiene_empresa(empresa_id));
drop policy if exists viaje_puntos_select on public.viaje_puntos;
create policy viaje_puntos_select on public.viaje_puntos for select to authenticated
  using (exists (select 1 from public.viajes v where v.id = viaje_id and privado.tiene_empresa(v.empresa_id)));
revoke all on public.viajes, public.viaje_puntos from anon;
grant select, update, delete on public.viajes to authenticated;
grant select on public.viaje_puntos to authenticated;

-- Iniciar un viaje (una unidad solo puede tener un viaje en curso)
create or replace function public.viaje_iniciar(p_activo uuid, p_km numeric default null, p_motivo text default null, p_destino text default null,
  p_operador text default null, p_lat double precision default null, p_lng double precision default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v_id uuid; v_quien text; v_ult numeric; v_otro text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para registrar el viaje.'; end if;
  select a.empresa_id into v_emp from public.activos a where a.id = p_activo and a.estatus <> 'baja';
  if v_emp is null or not privado.tiene_empresa(v_emp) then raise exception 'No tienes acceso a esta unidad.'; end if;
  select coalesce(v.operador, 'otro usuario') into v_otro from public.viajes v where v.activo_id = p_activo and v.estado = 'en_curso';
  if found then raise exception 'Esta unidad ya tiene un viaje en curso (%). Termínalo antes de iniciar otro.', v_otro; end if;
  if p_km is not null then
    select max(l.valor) into v_ult from public.lecturas l where l.activo_id = p_activo and l.tipo = 'km';
    if v_ult is not null and p_km < v_ult then raise exception 'El kilometraje (%) es menor al último registrado (% km).', p_km, v_ult; end if;
  end if;
  select p.nombre into v_quien from public.perfiles p where p.id = auth.uid();
  insert into public.viajes (activo_id, empresa_id, operador, motivo, destino, km_inicio, lat_inicio, lng_inicio)
  values (p_activo, v_emp, coalesce(nullif(trim(p_operador), ''), v_quien), nullif(trim(p_motivo), ''), nullif(trim(p_destino), ''), p_km, p_lat, p_lng)
  returning id into v_id;
  if p_lat is not null and p_lng is not null then
    insert into public.viaje_puntos (viaje_id, t, lat, lng) values (v_id, now(), p_lat, p_lng);
    update public.viajes set puntos = 1 where id = v_id;
  end if;
  if p_km is not null then
    insert into public.lecturas (activo_id, empresa_id, tipo, valor, fecha, origen, registrado_por, nota)
    values (p_activo, v_emp, 'km', p_km, now(), 'viaje', auth.uid(), 'Inicio de viaje');
  end if;
  return v_id;
end $$;

-- Agregar puntos GPS (en lotes). Ignora lecturas imprecisas (>100 m), saltos menores a 25 m y velocidades imposibles (>180 km/h).
create or replace function public.viaje_agregar_puntos(p_viaje uuid, p_puntos jsonb)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v public.viajes; ult record; pt record; d double precision; horas double precision; suma double precision := 0; n int := 0;
begin
  select * into v from public.viajes where id = p_viaje;
  if v.id is null or v.estado <> 'en_curso' then raise exception 'El viaje no está en curso.'; end if;
  if v.perfil_id is distinct from auth.uid() and not (privado.puede_editar() and privado.tiene_empresa(v.empresa_id)) then raise exception 'Este viaje lo inició otra persona.'; end if;
  select t, lat, lng into ult from public.viaje_puntos where viaje_id = p_viaje order by t desc, id desc limit 1;
  for pt in
    select (x->>'t')::timestamptz as t, (x->>'lat')::double precision as lat, (x->>'lng')::double precision as lng, nullif(x->>'p', '')::numeric as p
      from jsonb_array_elements(coalesce(p_puntos, '[]'::jsonb)) x
     where (x->>'lat') is not null and (x->>'lng') is not null and coalesce(nullif(x->>'p', '')::numeric, 0) <= 100
     order by 1
  loop
    if pt.lat not between -90 and 90 or pt.lng not between -180 and 180 or pt.t > now() + interval '5 minutes' or pt.t < v.inicio - interval '5 minutes' then continue; end if;
    if ult.t is null then
      insert into public.viaje_puntos (viaje_id, t, lat, lng, precision_m) values (p_viaje, pt.t, pt.lat, pt.lng, pt.p); ult := pt; n := n + 1; continue;
    end if;
    if pt.t <= ult.t then continue; end if;
    d := privado.km_entre(ult.lat, ult.lng, pt.lat, pt.lng);
    if d < 0.025 then continue; end if;
    horas := extract(epoch from pt.t - ult.t) / 3600;
    if horas > 0 and d / horas > 180 then continue; end if;
    insert into public.viaje_puntos (viaje_id, t, lat, lng, precision_m) values (p_viaje, pt.t, pt.lat, pt.lng, pt.p);
    suma := suma + d; n := n + 1; ult := pt;
  end loop;
  update public.viajes set km_gps = round((km_gps + suma)::numeric, 2), puntos = puntos + n where id = p_viaje returning km_gps into suma;
  return suma;
end $$;

-- Terminar el viaje
create or replace function public.viaje_terminar(p_viaje uuid, p_km numeric default null, p_lat double precision default null, p_lng double precision default null, p_notas text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.viajes;
begin
  select * into v from public.viajes where id = p_viaje;
  if v.id is null or v.estado <> 'en_curso' then raise exception 'El viaje no está en curso.'; end if;
  if v.perfil_id is distinct from auth.uid() and not (privado.puede_editar() and privado.tiene_empresa(v.empresa_id)) then raise exception 'Este viaje lo inició otra persona.'; end if;
  if p_km is not null and v.km_inicio is not null and p_km < v.km_inicio then raise exception 'El kilometraje final (%) es menor al inicial (%).', p_km, v.km_inicio; end if;
  if p_lat is not null and p_lng is not null then
    perform public.viaje_agregar_puntos(p_viaje, jsonb_build_array(jsonb_build_object('t', now(), 'lat', p_lat, 'lng', p_lng)));
  end if;
  update public.viajes set fin = now(), km_fin = p_km, lat_fin = p_lat, lng_fin = p_lng, estado = 'terminado',
         notas = coalesce(nullif(trim(p_notas), ''), notas) where id = p_viaje returning * into v;
  if p_km is not null then
    insert into public.lecturas (activo_id, empresa_id, tipo, valor, fecha, origen, registrado_por, nota)
    values (v.activo_id, v.empresa_id, 'km', p_km, now(), 'viaje', auth.uid(), 'Fin de viaje · ' || v.km_gps || ' km por GPS');
  end if;
  return jsonb_build_object('km_gps', v.km_gps, 'km_odometro', v.km_fin - v.km_inicio, 'minutos', round(extract(epoch from v.fin - v.inicio) / 60));
end $$;

create or replace function public.viaje_cancelar(p_viaje uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.viajes;
begin
  select * into v from public.viajes where id = p_viaje;
  if v.id is null or v.estado <> 'en_curso' then raise exception 'El viaje no está en curso.'; end if;
  if v.perfil_id is distinct from auth.uid() and not (privado.puede_editar() and privado.tiene_empresa(v.empresa_id)) then raise exception 'Este viaje lo inició otra persona.'; end if;
  update public.viajes set estado = 'cancelado', fin = now() where id = p_viaje;
end $$;

revoke all on function public.viaje_iniciar(uuid, numeric, text, text, text, double precision, double precision) from public, anon;
revoke all on function public.viaje_agregar_puntos(uuid, jsonb) from public, anon;
revoke all on function public.viaje_terminar(uuid, numeric, double precision, double precision, text) from public, anon;
revoke all on function public.viaje_cancelar(uuid) from public, anon;
grant execute on function public.viaje_iniciar(uuid, numeric, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.viaje_agregar_puntos(uuid, jsonb) to authenticated;
grant execute on function public.viaje_terminar(uuid, numeric, double precision, double precision, text) to authenticated;
grant execute on function public.viaje_cancelar(uuid) to authenticated;

create or replace view public.v_viajes with (security_invoker = true) as
select v.*, a.codigo, a.descripcion, av.placa, a.numero_economico, e.nombre as empresa,
       (v.km_fin - v.km_inicio) as km_odometro,
       round(extract(epoch from coalesce(v.fin, now()) - v.inicio) / 60) as minutos
  from public.viajes v
  join public.activos a on a.id = v.activo_id
  join public.empresas e on e.id = v.empresa_id
  left join public.activo_vehiculo av on av.activo_id = v.activo_id;
grant select on public.v_viajes to authenticated;

-- Cuadre: lo que marcó el odómetro entre dos cargas contra los km por GPS de los viajes registrados en ese lapso
create or replace view public.v_cuadre_combustible with (security_invoker = true) as
with c as (
  select cc.*, lag(cc.fecha) over w as fecha_ant, lag(cc.lectura) over w as lectura_ant
    from public.cargas_combustible cc
   where cc.tipo_lectura = 'km'
  window w as (partition by cc.activo_id order by cc.fecha, cc.lectura)
)
select c.id, c.activo_id, c.empresa_id, c.fecha, c.fecha_ant, a.codigo, a.descripcion, av.placa, a.numero_economico, c.litros, c.operador,
       (c.lectura - c.lectura_ant) as recorrido, coalesce(vj.viajes, 0) as viajes, coalesce(vj.km_gps, 0) as km_gps,
       case when c.lectura is null or c.lectura_ant is null then 'sin_lectura'
            when coalesce(vj.viajes, 0) = 0 then 'sin_viajes'
            when abs((c.lectura - c.lectura_ant) - vj.km_gps) > greatest(20, (c.lectura - c.lectura_ant) * 0.25) then 'revisar'
            else 'cuadra' end as estado
  from c
  join public.activos a on a.id = c.activo_id
  left join public.activo_vehiculo av on av.activo_id = c.activo_id
  left join lateral (select count(*) as viajes, round(sum(v.km_gps), 1) as km_gps from public.viajes v
                      where v.activo_id = c.activo_id and v.estado = 'terminado' and v.inicio >= c.fecha_ant and v.fin <= c.fecha) vj on true
 where c.fecha_ant is not null;
grant select on public.v_cuadre_combustible to authenticated;

-- ═════════════ B. Huella de carbono ═════════════
create table if not exists public.factores_emision (
  combustible text primary key check (combustible in ('gasolina', 'diesel', 'gas_lp')),
  nombre text not null,
  kg_co2_litro numeric(6,3) not null check (kg_co2_litro > 0 and kg_co2_litro < 10),
  fuente text,
  updated_at timestamptz not null default now()
);
insert into public.factores_emision (combustible, nombre, kg_co2_litro, fuente) values
  ('gasolina', 'Gasolina', 2.310, 'Factor de referencia IPCC (combustión). Ajustable.'),
  ('diesel', 'Diésel', 2.680, 'Factor de referencia IPCC (combustión). Ajustable.'),
  ('gas_lp', 'Gas LP', 1.610, 'Factor de referencia IPCC (combustión). Ajustable.')
on conflict (combustible) do nothing;
alter table public.factores_emision enable row level security;
drop policy if exists factores_select on public.factores_emision;
create policy factores_select on public.factores_emision for select to authenticated using (true);
drop policy if exists factores_editar on public.factores_emision;
create policy factores_editar on public.factores_emision for update to authenticated using (privado.puede_editar()) with check (privado.puede_editar());
revoke all on public.factores_emision from anon;
grant select, update on public.factores_emision to authenticated;

create or replace function privado.tipo_combustible(t text) returns text language sql immutable set search_path = '' as $$
  select case when t ~* 'di[eé]sel|diesel' then 'diesel'
              when t ~* '(^|[^a-z])lp([^a-z]|$)|gas lp|licuado|propano' then 'gas_lp'
              when t ~* 'gasolina|magna|premium|regular|nafta' then 'gasolina' end
$$;
grant execute on function privado.tipo_combustible(text) to authenticated;

-- Emisiones por carga. Si no se sabe el combustible: diésel para maquinaria (horómetro) y gasolina para vehículos (supuesto = true).
create or replace view public.v_huella_carbono with (security_invoker = true) as
select c.id, c.activo_id, c.empresa_id, e.nombre as empresa, c.fecha,
       date_trunc('month', c.fecha at time zone 'America/Mazatlan')::date as mes,
       a.codigo, a.descripcion, av.placa, a.numero_economico, cat.nombre as categoria, c.litros, c.tipo_lectura,
       x.tipo as combustible, x.supuesto, f.kg_co2_litro, round(c.litros * f.kg_co2_litro, 1) as kg_co2
  from public.cargas_combustible c
  join public.activos a on a.id = c.activo_id
  join public.empresas e on e.id = c.empresa_id
  left join public.categorias cat on cat.id = a.categoria_id
  left join public.activo_vehiculo av on av.activo_id = c.activo_id
  cross join lateral (select coalesce(privado.tipo_combustible(c.combustible), privado.tipo_combustible(av.combustible),
                                      case when c.tipo_lectura = 'horas' then 'diesel' else 'gasolina' end) as tipo,
                             (privado.tipo_combustible(c.combustible) is null and privado.tipo_combustible(av.combustible) is null) as supuesto) x
  join public.factores_emision f on f.combustible = x.tipo;
grant select on public.v_huella_carbono to authenticated;

-- ═════════════ C. Avisos de vehículos: cargas que no cuadran con los viajes y viajes sin terminar ═════════════
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
        union all
        select jsonb_build_object('texto', r.codigo || ' · ' || coalesce(r.placa, r.numero_economico, r.descripcion),
               'detalle', 'Rendimiento bajo: ' || r.ultimo || case when r.tipo_lectura = 'km' then ' km/L' else ' h/L' end || ' (su promedio es ' || r.promedio || ')',
               'url', u || '/combustible', 'urgente', true)
          from public.v_rendimiento_unidades r
         where r.con_rendimiento >= 3 and r.ultimo < r.promedio * 0.75 and r.ultima_carga > now() - interval '7 days' and r.empresa_id in (select privado.empresas_de(p.id))
        union all
        select jsonb_build_object('texto', q.codigo || ' · ' || coalesce(q.placa, q.numero_economico, q.descripcion),
               'detalle', 'Carga de ' || q.litros || ' L que no cuadra: el odómetro marca ' || q.recorrido || ' km y el GPS de los viajes ' || q.km_gps || ' km',
               'url', u || '/viajes', 'urgente', true)
          from public.v_cuadre_combustible q
         where q.estado = 'revisar' and q.fecha > now() - interval '7 days' and q.empresa_id in (select privado.empresas_de(p.id))
        union all
        select jsonb_build_object('texto', vj.codigo || ' · ' || coalesce(vj.placa, vj.numero_economico, vj.descripcion),
               'detalle', 'Viaje sin terminar desde hace ' || round(vj.minutos / 60) || ' h (' || coalesce(vj.operador, 'operador') || ')',
               'url', u || '/viajes', 'urgente', false)
          from public.v_viajes vj
         where vj.estado = 'en_curso' and vj.inicio < now() - interval '12 hours' and vj.empresa_id in (select privado.empresas_de(p.id))
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
        select jsonb_build_object('orden', '85', 'texto', 'Mesa de ayuda',
               'detalle', count(*) filter (where tk.creado > now() - interval '24 hours') || ' ticket(s) nuevo(s), ' || count(*) filter (where tk.estado in ('pendiente', 'en_proceso')) || ' abiertos',
               'url', u || '/tickets', 'urgente', count(*) filter (where tk.estado in ('pendiente', 'en_proceso') and tk.urgencia ~* 'alta|cr[ií]tica') > 0)
          from public.tickets_ayuda tk where tk.empresa_id is null or tk.empresa_id in (select privado.empresas_de(p.id))
        having count(*) filter (where tk.creado > now() - interval '24 hours' or tk.estado in ('pendiente', 'en_proceso')) > 0        union all
        select jsonb_build_object('orden', '9', 'texto', 'Solicitudes de equipo o material',
               'detalle', count(*) filter (where s.created_at > now() - interval '24 hours') || ' nueva(s), ' || count(*) filter (where s.estatus = 'pendiente') || ' por aprobar',
               'url', u || '/solicitudes', 'urgente', false)
          from public.solicitudes s where s.empresa_id in (select privado.empresas_de(p.id))
        having count(*) filter (where s.created_at > now() - interval '24 hours' or s.estatus = 'pendiente') > 0
      ) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Resumen de la operación (últimas 24 h)', 'items', items); end if;
    elsif m = 'contratos' then
      select jsonb_agg(x) into items from (
        select jsonb_build_object('texto', ct.nombre || coalesce(' · ' || ct.proveedor, ''), 'detalle', initcap(replace(ct.tipo, '_', ' ')) || ': ' || privado.dias_txt(ct.dias_restantes)
                 || case when ct.renovacion_automatica then ' (se renueva sola)' else '' end || case when ct.equipos > 0 then ' · cubre ' || ct.equipos || ' equipo(s)' else '' end,
               'url', u || '/contratos', 'urgente', ct.estado = 'vencido' and not ct.renovacion_automatica) x
          from public.v_contratos ct
         where ct.activo and ct.estado in ('vencido', 'por_vencer') and ct.dias_restantes >= -60 and ct.empresa_id in (select privado.empresas_de(p.id))
         order by ct.vencimiento limit 40) t;
      if items is not null then secs := secs || jsonb_build_object('modulo', m, 'titulo', 'Contratos y pólizas por vencer', 'items', items); end if;

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
