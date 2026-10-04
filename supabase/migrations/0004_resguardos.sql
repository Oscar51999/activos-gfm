-- Fase 2: resguardos (asignación, devolución, traspaso) con firma e historial

create type public.tipo_movimiento as enum ('asignacion', 'devolucion', 'traspaso');

create or replace function privado.puede_resguardar()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select rol in ('admin','almacen','supervisor') from public.perfiles where id = auth.uid() and activo), false)
$$;
revoke execute on function privado.puede_resguardar() from public, anon;
grant execute on function privado.puede_resguardar() to authenticated;

create sequence public.movimientos_folio_seq;

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('RES-' || lpad(nextval('public.movimientos_folio_seq')::text, 6, '0')),
  tipo public.tipo_movimiento not null,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  fecha timestamptz not null default now(),
  a_empleado_id uuid references public.empleados(id) on delete set null,
  a_ubicacion_id uuid references public.ubicaciones(id) on delete set null,
  entrega_nombre text,
  recibe_nombre text,
  notas text,
  firma_recibe text,     -- ruta en storage
  firma_entrega text,    -- ruta en storage
  documento text,        -- carta firmada escaneada (opcional)
  cancelado boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.movimiento_activos (
  movimiento_id uuid not null references public.movimientos(id) on delete cascade,
  activo_id uuid not null references public.activos(id) on delete restrict,
  responsable_anterior_id uuid references public.empleados(id) on delete set null,
  ubicacion_anterior_id uuid references public.ubicaciones(id) on delete set null,
  estatus_anterior public.estatus_activo not null,
  estado_fisico text,
  primary key (movimiento_id, activo_id)
);

create index on public.movimientos (empresa_id);
create index on public.movimientos (a_empleado_id);
create index on public.movimientos (a_ubicacion_id);
create index on public.movimientos (fecha desc);
create index on public.movimientos (created_by);
create index on public.movimiento_activos (activo_id);
create index on public.movimiento_activos (responsable_anterior_id);
create index on public.movimiento_activos (ubicacion_anterior_id);

create trigger bitacora after insert or update or delete on public.movimientos
  for each row execute function privado.tg_bitacora();

alter table public.movimientos enable row level security;
alter table public.movimiento_activos enable row level security;

create policy movimientos_select on public.movimientos for select to authenticated using (privado.tiene_empresa(empresa_id));
-- alta solo por la función registrar_movimiento; aquí solo se adjuntan firmas/documento o se cancela
create policy movimientos_update on public.movimientos for update to authenticated
  using (privado.puede_resguardar() and privado.tiene_empresa(empresa_id))
  with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));

create policy movimiento_activos_select on public.movimiento_activos for select to authenticated
  using (exists (select 1 from public.movimientos m where m.id = movimiento_id and privado.tiene_empresa(m.empresa_id)));

-- Storage: los supervisores también suben firmas (ruta <empresa>/movimientos/<id>/...)
create policy activos_storage_insert_firmas on storage.objects for insert to authenticated
  with check (bucket_id = 'activos' and (storage.foldername(name))[2] = 'movimientos'
              and privado.puede_resguardar() and privado.tiene_empresa(((storage.foldername(name))[1])::uuid));

-- Registro atómico: valida, guarda el movimiento con sus líneas y actualiza los activos
create or replace function public.registrar_movimiento(
  p_tipo public.tipo_movimiento,
  p_empresa uuid,
  p_activos uuid[],
  p_a_empleado uuid default null,
  p_a_ubicacion uuid default null,
  p_entrega_nombre text default null,
  p_recibe_nombre text default null,
  p_notas text default null,
  p_estados jsonb default '{}'::jsonb   -- { "<activo_id>": "estado físico" }
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_a record;
  v_n int;
begin
  if not privado.puede_resguardar() then raise exception 'No tienes permiso para registrar resguardos'; end if;
  if not privado.tiene_empresa(p_empresa) then raise exception 'No tienes acceso a esa empresa'; end if;
  if p_activos is null or cardinality(p_activos) = 0 then raise exception 'Selecciona al menos un activo'; end if;

  if p_a_empleado is not null and not exists (select 1 from public.empleados where id = p_a_empleado and empresa_id = p_empresa and activo) then
    raise exception 'El empleado no pertenece a la empresa';
  end if;
  if p_a_ubicacion is not null and not exists (select 1 from public.ubicaciones where id = p_a_ubicacion and empresa_id = p_empresa and activo) then
    raise exception 'La ubicación no pertenece a la empresa';
  end if;

  if p_tipo = 'asignacion' and p_a_empleado is null then raise exception 'La asignación necesita a quién se entrega'; end if;
  if p_tipo = 'devolucion' and p_a_ubicacion is null then raise exception 'La devolución necesita a dónde regresa el activo'; end if;
  if p_tipo = 'traspaso' and p_a_empleado is null and p_a_ubicacion is null then raise exception 'El traspaso necesita un nuevo responsable o una nueva ubicación'; end if;

  select count(*) into v_n from public.activos where id = any(p_activos) and empresa_id = p_empresa;
  if v_n <> cardinality(p_activos) then raise exception 'Todos los activos deben ser de la misma empresa'; end if;

  for v_a in select id, codigo, estatus from public.activos where id = any(p_activos) for update loop
    if p_tipo = 'asignacion' and v_a.estatus <> 'disponible' then
      raise exception '% no está disponible (estatus: %)', v_a.codigo, v_a.estatus;
    elsif p_tipo = 'devolucion' and v_a.estatus <> 'asignado' then
      raise exception '% no está asignado', v_a.codigo;
    elsif p_tipo = 'traspaso' and v_a.estatus in ('baja','siniestrado') then
      raise exception '% está en %', v_a.codigo, v_a.estatus;
    end if;
  end loop;

  insert into public.movimientos (tipo, empresa_id, a_empleado_id, a_ubicacion_id, entrega_nombre, recibe_nombre, notas)
  values (p_tipo, p_empresa, p_a_empleado, p_a_ubicacion, nullif(trim(p_entrega_nombre),''), nullif(trim(p_recibe_nombre),''), nullif(trim(p_notas),''))
  returning id into v_id;

  insert into public.movimiento_activos (movimiento_id, activo_id, responsable_anterior_id, ubicacion_anterior_id, estatus_anterior, estado_fisico)
  select v_id, a.id, a.responsable_id, a.ubicacion_id, a.estatus, nullif(trim(p_estados ->> a.id::text), '')
  from public.activos a where a.id = any(p_activos);

  update public.activos a set
    responsable_id = case
      when p_tipo = 'asignacion' then p_a_empleado
      when p_tipo = 'devolucion' then null
      else coalesce(p_a_empleado, a.responsable_id) end,
    ubicacion_id = coalesce(p_a_ubicacion, a.ubicacion_id),
    estatus = case
      when p_tipo = 'asignacion' then 'asignado'::public.estatus_activo
      when p_tipo = 'devolucion' then 'disponible'::public.estatus_activo
      when p_a_empleado is not null and a.estatus = 'disponible' then 'asignado'::public.estatus_activo
      else a.estatus end
  where a.id = any(p_activos);

  return v_id;
end $$;
revoke execute on function public.registrar_movimiento(public.tipo_movimiento, uuid, uuid[], uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.registrar_movimiento(public.tipo_movimiento, uuid, uuid[], uuid, uuid, text, text, text, jsonb) to authenticated;

-- Vista de movimientos para listas
create view public.v_movimientos with (security_invoker = true) as
select m.id, m.folio, m.tipo, m.fecha, m.empresa_id, e.nombre as empresa, m.cancelado,
       m.a_empleado_id, trim(coalesce(emp.nombres,'') || ' ' || coalesce(emp.apellidos,'')) as a_empleado,
       m.a_ubicacion_id, u.nombre as a_ubicacion, m.recibe_nombre, m.entrega_nombre,
       (m.firma_recibe is not null) as firmado,
       (select count(*) from public.movimiento_activos ma where ma.movimiento_id = m.id) as num_activos,
       p.nombre as capturo
from public.movimientos m
join public.empresas e on e.id = m.empresa_id
left join public.empleados emp on emp.id = m.a_empleado_id
left join public.ubicaciones u on u.id = m.a_ubicacion_id
left join public.perfiles p on p.id = m.created_by;
grant select on public.v_movimientos to authenticated;
revoke all on public.v_movimientos from anon;
