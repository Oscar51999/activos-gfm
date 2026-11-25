-- ───────────── 0032 · Mesa de ayuda ligada al equipo (solo lectura), combustible y rendimiento, contratos y pólizas, vida útil y plan de renovación ─────────────
set lock_timeout = '8s';

-- Convierte texto a fecha sin tronar (las fechas de la Mesa de ayuda vienen como texto)
create or replace function privado.a_fecha(t text) returns timestamptz language plpgsql immutable as $$
begin
  if t is null or btrim(t) = '' then return null; end if;
  return t::timestamptz;
exception when others then
  begin return to_timestamp(t, 'DD/MM/YYYY HH24:MI:SS'); exception when others then return null; end;
end $$;

-- ═════════════ A. Mesa de ayuda (se LEE la lista de tickets; la Mesa de ayuda no se modifica) ═════════════
create table if not exists public.tickets_ayuda (
  id text primary key,                         -- IT-00063
  creado timestamptz, nombre text, area text, categoria text, urgencia text, contacto text, descripcion text,
  estado text, notas text, empresa_txt text, ubicacion_txt text, imagenes int not null default 0,
  empresa_id uuid references public.empresas(id) on delete set null,
  activo_id uuid references public.activos(id) on delete set null,
  ligado_manual boolean not null default false,
  sincronizado_at timestamptz not null default now()
);
create index if not exists tickets_ayuda_activo on public.tickets_ayuda (activo_id);
create index if not exists tickets_ayuda_empresa on public.tickets_ayuda (empresa_id);
create index if not exists tickets_ayuda_creado on public.tickets_ayuda (creado desc);
alter table public.tickets_ayuda enable row level security;
drop policy if exists tickets_select on public.tickets_ayuda;
create policy tickets_select on public.tickets_ayuda for select to authenticated using (empresa_id is null or privado.tiene_empresa(empresa_id));
drop policy if exists tickets_update on public.tickets_ayuda;
create policy tickets_update on public.tickets_ayuda for update to authenticated
  using (privado.puede_editar() and (empresa_id is null or privado.tiene_empresa(empresa_id))) with check (privado.puede_editar());
-- Solo se puede cambiar a qué equipo está ligado; el resto viene de la Mesa de ayuda
revoke update on public.tickets_ayuda from authenticated;
grant update (activo_id, ligado_manual) on public.tickets_ayuda to authenticated;

insert into privado.ajustes (clave, valor) values
  ('mesa_url', 'https://script.google.com/macros/s/AKfycbxYs8v7ExRmBH2vH5G7lYEhfy0_h4_p21GauiWcwvaHiiAL4HkSftcfXLYg3lL9mFf6CQ/exec')
on conflict (clave) do update set valor = excluded.valor;

-- Busca el equipo del ticket: código ACT-, serie, No. económico o sticker escritos en el texto; si no, el único equipo asignado a esa persona
create or replace function privado.equipo_de_ticket(p_texto text, p_nombre text, p_empresa uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare r uuid; t text := upper(coalesce(p_texto, ''));
begin
  select a.id into r from public.activos a where a.estatus <> 'baja' and t like '%' || upper(a.codigo) || '%' limit 1;
  if r is not null then return r; end if;
  select a.id into r from public.activos a
   where a.estatus <> 'baja' and ((length(a.serie) >= 5 and t like '%' || upper(a.serie) || '%') or (length(a.numero_economico) >= 4 and t like '%' || upper(a.numero_economico) || '%'))
   order by (p_empresa is not null and a.empresa_id = p_empresa) desc limit 1;
  if r is not null then return r; end if;
  if coalesce(btrim(p_nombre), '') <> '' then
    select min(a.id::text)::uuid into r from public.activos a join public.empleados e on e.id = a.responsable_id
     where a.estatus = 'asignado' and upper(btrim(e.nombres || ' ' || coalesce(e.apellidos, ''))) = upper(btrim(p_nombre))
    having count(*) = 1;
  end if;
  return r;
end $$;

-- Procesa la última respuesta de la Mesa de ayuda y pide la siguiente (corre cada 15 min)
create or replace function privado.mesa_sync() returns integer language plpgsql security definer set search_path = '' as $$
declare req bigint := nullif(privado.ajuste('mesa_req'), '')::bigint; resp record; j jsonb; t jsonb; n int := 0; emp uuid; url text := privado.ajuste('mesa_url');
begin
  if req is not null then
    select status_code, content into resp from net._http_response where id = req;
    if resp.status_code = 200 then
      begin j := resp.content::jsonb; exception when others then j := null; end;
      if j is not null and (j->>'ok')::boolean then
        for t in select * from jsonb_array_elements(coalesce(j->'tickets', '[]'::jsonb)) loop
          continue when coalesce(t->>'id', '') = '';
          select e.id into emp from public.empresas e where upper(e.nombre) = upper(btrim(t->>'empresa')) or upper(coalesce(e.nombre_corto, '')) = upper(btrim(t->>'empresa')) limit 1;
          insert into public.tickets_ayuda as x (id, creado, nombre, area, categoria, urgencia, contacto, descripcion, estado, notas, empresa_txt, ubicacion_txt, imagenes, empresa_id, activo_id, sincronizado_at)
          values (t->>'id', privado.a_fecha(t->>'creado'), t->>'nombre', t->>'area', t->>'categoria', t->>'urgencia', t->>'contacto', t->>'descripcion', t->>'estado', t->>'notas',
                  t->>'empresa', t->>'ubicacion', coalesce(jsonb_array_length(case when jsonb_typeof(t->'imagenes') = 'array' then t->'imagenes' else '[]'::jsonb end), 0), emp,
                  privado.equipo_de_ticket(coalesce(t->>'descripcion', '') || ' ' || coalesce(t->>'notas', ''), t->>'nombre', emp), now())
          on conflict (id) do update set creado = coalesce(excluded.creado, x.creado), nombre = excluded.nombre, area = excluded.area, categoria = excluded.categoria, urgencia = excluded.urgencia,
            contacto = excluded.contacto, descripcion = excluded.descripcion, estado = excluded.estado, notas = excluded.notas, empresa_txt = excluded.empresa_txt, ubicacion_txt = excluded.ubicacion_txt,
            imagenes = excluded.imagenes, empresa_id = excluded.empresa_id, sincronizado_at = now(),
            activo_id = case when x.ligado_manual then x.activo_id else coalesce(x.activo_id, excluded.activo_id) end;
          n := n + 1;
        end loop;
        -- tickets borrados en la Mesa de ayuda: se quitan también aquí
        delete from public.tickets_ayuda where id not in (select x->>'id' from jsonb_array_elements(coalesce(j->'tickets', '[]'::jsonb)) x where x->>'id' is not null);
        perform privado.poner_ajuste('mesa_ultimo', now()::text || ' · ' || n || ' ticket(s)');
      end if;
    end if;
  end if;
  if url is not null then
    perform privado.poner_ajuste('mesa_req', net.http_get(url := url || '?action=list', timeout_milliseconds := 30000)::text);
  end if;
  return n;
exception when others then
  perform privado.poner_ajuste('mesa_ultimo', now()::text || ' · error: ' || left(sqlerrm, 120));
  return -1;
end $$;

create or replace function public.mesa_sincronizar() returns jsonb language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not privado.puede_editar() then raise exception 'Sin permiso'; end if;
  n := privado.mesa_sync();
  return jsonb_build_object('procesados', n, 'ultimo', privado.ajuste('mesa_ultimo'));
end $$;
revoke execute on function public.mesa_sincronizar() from public, anon;
grant execute on function public.mesa_sincronizar() to authenticated;

-- ═════════════ B. Combustible y rendimiento ═════════════
alter table public.lecturas drop constraint if exists lecturas_origen_check;
alter table public.lecturas add constraint lecturas_origen_check check (origen = any (array['manual', 'checklist', 'orden', 'combustible']));

create table if not exists public.cargas_combustible (
  id uuid primary key default gen_random_uuid(),
  activo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade,
  fecha timestamptz not null default now(),
  litros numeric(10,2) not null check (litros > 0 and litros < 2000),
  lectura numeric(12,1) check (lectura is null or lectura >= 0),
  tipo_lectura text not null default 'km' check (tipo_lectura in ('km', 'horas')),
  combustible text, lleno boolean not null default true, estacion text, operador text,
  empleado_id uuid references public.empleados(id) on delete set null,
  foto text, notas text,
  registrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists cargas_activo_fecha on public.cargas_combustible (activo_id, fecha desc);
create index if not exists cargas_empresa on public.cargas_combustible (empresa_id);
create index if not exists cargas_empleado on public.cargas_combustible (empleado_id);
create index if not exists cargas_registrado on public.cargas_combustible (registrado_por);
alter table public.cargas_combustible enable row level security;
drop policy if exists cargas_select on public.cargas_combustible;
create policy cargas_select on public.cargas_combustible for select to authenticated using (privado.tiene_empresa(empresa_id));
drop policy if exists cargas_insert on public.cargas_combustible;
create policy cargas_insert on public.cargas_combustible for insert to authenticated with check (privado.tiene_empresa(empresa_id));
drop policy if exists cargas_update on public.cargas_combustible;
create policy cargas_update on public.cargas_combustible for update to authenticated using (privado.puede_editar() and privado.tiene_empresa(empresa_id));
drop policy if exists cargas_delete on public.cargas_combustible;
create policy cargas_delete on public.cargas_combustible for delete to authenticated using (privado.puede_editar() and privado.tiene_empresa(empresa_id));

create or replace function privado.tg_carga_combustible() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select empresa_id into new.empresa_id from public.activos where id = new.activo_id;
  if tg_op = 'INSERT' and new.lectura is not null then
    insert into public.lecturas (activo_id, empresa_id, tipo, valor, fecha, origen, registrado_por, nota)
    values (new.activo_id, new.empresa_id, new.tipo_lectura, new.lectura, new.fecha, 'combustible', auth.uid(), 'Carga de combustible · ' || new.litros || ' L');
  end if;
  return new;
end $$;
drop trigger if exists cargas_combustible_tg on public.cargas_combustible;
create trigger cargas_combustible_tg before insert or update of activo_id, lectura on public.cargas_combustible for each row execute function privado.tg_carga_combustible();

-- Rendimiento entre cargas: distancia desde la carga anterior / litros de esta carga (cuando se llenó el tanque)
create or replace view public.v_cargas_combustible with (security_invoker = true) as
select c.*, a.codigo, a.descripcion, v.placa, a.numero_economico,
       c.lectura - lag(c.lectura) over w as recorrido,
       case when c.lleno and c.lectura is not null and lag(c.lectura) over w is not null and c.lectura > lag(c.lectura) over w
            then round((c.lectura - lag(c.lectura) over w) / c.litros, 2) end as rendimiento
  from public.cargas_combustible c
  join public.activos a on a.id = c.activo_id
  left join public.activo_vehiculo v on v.activo_id = c.activo_id
window w as (partition by c.activo_id, c.tipo_lectura order by c.fecha, c.lectura);
grant select on public.v_cargas_combustible to authenticated;

create or replace view public.v_rendimiento_unidades with (security_invoker = true) as
select activo_id, empresa_id, codigo, descripcion, placa, numero_economico, tipo_lectura,
       count(*) as cargas, sum(litros) as litros, max(fecha) as ultima_carga,
       round(avg(rendimiento), 2) as promedio,
       (array_agg(rendimiento order by fecha desc) filter (where rendimiento is not null))[1] as ultimo,
       count(rendimiento) as con_rendimiento
  from public.v_cargas_combustible
 group by activo_id, empresa_id, codigo, descripcion, placa, numero_economico, tipo_lectura;
grant select on public.v_rendimiento_unidades to authenticated;

-- ═════════════ C. Contratos y pólizas de proveedores (sin montos) ═════════════
create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  proveedor_txt text,
  tipo text not null default 'servicio' check (tipo in ('soporte', 'mantenimiento', 'arrendamiento', 'poliza', 'garantia_extendida', 'servicio', 'licencia', 'otro')),
  nombre text not null, numero text,
  inicio date, vencimiento date,
  avisar_dias int not null default 30 check (avisar_dias between 0 and 365),
  renovacion_automatica boolean not null default false,
  contacto text, notas text,
  activo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.contrato_activos (
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  activo_id uuid not null references public.activos(id) on delete cascade,
  primary key (contrato_id, activo_id)
);
create index if not exists contratos_empresa on public.contratos (empresa_id);
create index if not exists contratos_proveedor on public.contratos (proveedor_id);
create index if not exists contratos_created_by on public.contratos (created_by);
create index if not exists contrato_activos_activo on public.contrato_activos (activo_id);
alter table public.contratos enable row level security;
alter table public.contrato_activos enable row level security;
drop policy if exists contratos_select on public.contratos;
create policy contratos_select on public.contratos for select to authenticated using (privado.tiene_empresa(empresa_id));
drop policy if exists contratos_write on public.contratos;
create policy contratos_write on public.contratos for all to authenticated
  using (privado.puede_editar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));
drop policy if exists contrato_activos_select on public.contrato_activos;
create policy contrato_activos_select on public.contrato_activos for select to authenticated
  using (exists (select 1 from public.contratos c where c.id = contrato_id and privado.tiene_empresa(c.empresa_id)));
drop policy if exists contrato_activos_write on public.contrato_activos;
create policy contrato_activos_write on public.contrato_activos for all to authenticated
  using (privado.puede_editar() and exists (select 1 from public.contratos c where c.id = contrato_id and privado.tiene_empresa(c.empresa_id)))
  with check (privado.puede_editar() and exists (select 1 from public.contratos c where c.id = contrato_id and privado.tiene_empresa(c.empresa_id)));

create or replace view public.v_contratos with (security_invoker = true) as
select c.*, e.nombre as empresa, coalesce(p.nombre, c.proveedor_txt) as proveedor,
       (c.vencimiento - current_date) as dias_restantes,
       case when c.vencimiento is null then 'sin_fecha' when c.vencimiento < current_date then 'vencido'
            when c.vencimiento <= current_date + c.avisar_dias then 'por_vencer' else 'vigente' end as estado,
       (select count(*) from public.contrato_activos ca where ca.contrato_id = c.id) as equipos
  from public.contratos c
  join public.empresas e on e.id = c.empresa_id
  left join public.proveedores p on p.id = c.proveedor_id;
grant select on public.v_contratos to authenticated;

-- ═════════════ D. Vida útil y plan de renovación ═════════════
alter table public.categorias add column if not exists vida_util_anios numeric(4,1) check (vida_util_anios is null or (vida_util_anios > 0 and vida_util_anios <= 50));
update public.categorias set vida_util_anios = case
    when nombre ~* 'laptop|port[aá]til|c[oó]mputo|computadora|escritorio|cpu|tablet|ipad' then 4
    when nombre ~* 'servidor|red|switch|router|monitor|impresora|multifuncional|proyector|nas' then 5
    when nombre ~* 'celular|tel[eé]fon|smartphone|radio' then 3
    when nombre ~* 'pick|sed[aá]n|cami[oó]n|camioneta|veh[ií]culo|auto|moto|van' then 6
    when nombre ~* 'maquinaria|retro|excavadora|cargador|compactador|gr[uú]a|montacargas|tractor|motoconform|vibro' then 10
    when nombre ~* 'topograf|estaci[oó]n total|nivel|gps|dron' then 7
    when nombre ~* 'el[eé]ctrica|taladro|rotomartillo|esmeriladora|generador|soldadora|compresor' then 5
    when nombre ~* 'herramienta' then 4
    when nombre ~* 'mobiliario|mueble|silla|escritorio' then 10
    when nombre ~* 'seguridad|epp|casco' then 2
    else null end
 where vida_util_anios is null;

create or replace view public.v_renovacion with (security_invoker = true) as
select a.id, a.codigo, a.descripcion, a.serie, a.numero_economico, a.estatus, a.empresa_id, e.nombre as empresa,
       a.categoria_id, c.nombre as categoria, m.nombre as marca, mo.nombre as modelo,
       u.nombre as ubicacion, trim(coalesce(emp.nombres, '') || ' ' || coalesce(emp.apellidos, '')) as responsable,
       a.fecha_alta as fecha_base,
       coalesce(c.vida_util_anios, pc.vida_util_anios) as vida_util,
       (a.fecha_alta + make_interval(months => (coalesce(c.vida_util_anios, pc.vida_util_anios) * 12)::int))::date as fin_vida,
       round(((current_date - a.fecha_alta) / 365.25)::numeric, 1) as anios_uso,
       case when coalesce(c.vida_util_anios, pc.vida_util_anios) is null or a.fecha_alta is null then 'sin_dato'
            when (a.fecha_alta + make_interval(months => (coalesce(c.vida_util_anios, pc.vida_util_anios) * 12)::int))::date < current_date then 'cumplida'
            when (a.fecha_alta + make_interval(months => (coalesce(c.vida_util_anios, pc.vida_util_anios) * 12)::int))::date <= current_date + 365 then 'proximo_anio'
            else 'vigente' end as estado_vida
  from public.activos a
  join public.empresas e on e.id = a.empresa_id
  join public.categorias c on c.id = a.categoria_id
  left join public.categorias pc on pc.id = c.padre_id
  left join public.marcas m on m.id = a.marca_id
  left join public.modelos mo on mo.id = a.modelo_id
  left join public.ubicaciones u on u.id = a.ubicacion_id
  left join public.empleados emp on emp.id = a.responsable_id
 where a.estatus <> 'baja';
grant select on public.v_renovacion to authenticated;


-- ═════════════ Avisos: rendimiento bajo (vehículos), contratos por vencer y mesa de ayuda en el resumen gerencial ═════════════
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
        union all
        select jsonb_build_object('texto', r.codigo || ' · ' || coalesce(r.placa, r.numero_economico, r.descripcion),
               'detalle', 'Rendimiento bajo: ' || r.ultimo || case when r.tipo_lectura = 'km' then ' km/L' else ' h/L' end || ' (su promedio es ' || r.promedio || ')',
               'url', u || '/combustible', 'urgente', true)
          from public.v_rendimiento_unidades r
         where r.con_rendimiento >= 3 and r.ultimo < r.promedio * 0.75 and r.ultima_carga > now() - interval '7 days' and r.empresa_id in (select privado.empresas_de(p.id))
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


-- ═════════════ E. Programación: leer la Mesa de ayuda cada 15 minutos ═════════════
do $$ begin
  begin perform cron.unschedule('mesa-ayuda-sync'); exception when others then null; end;
  perform cron.schedule('mesa-ayuda-sync', '*/15 * * * *', 'select privado.mesa_sync()');
exception when others then raise notice 'cron: %', sqlerrm;
end $$;
select privado.mesa_sync();

select 'ok' as resultado;
