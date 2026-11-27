-- ───────────── 0035 · Equipos de trabajo con su propio calendario y tareas ─────────────
-- Un equipo agrupa usuarios (ej. Administración). Cada equipo tiene sus actividades: tablero, calendario y kanban.
-- Los miembros del equipo ven y trabajan las actividades de su equipo aunque su rol sea "Almacén" o "Solo consulta".

create table if not exists public.equipos_trabajo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 2 and 60),
  descripcion text,
  color text not null default '#E2A64B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  activo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists equipos_trabajo_nombre on public.equipos_trabajo (lower(trim(nombre))) where activo;
create index if not exists equipos_trabajo_created_by on public.equipos_trabajo (created_by);

create table if not exists public.equipo_miembros (
  equipo_id uuid not null references public.equipos_trabajo(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  es_lider boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (equipo_id, perfil_id)
);
create index if not exists equipo_miembros_perfil on public.equipo_miembros (perfil_id);

alter table public.actividades add column if not exists equipo_id uuid references public.equipos_trabajo(id) on delete set null;
create index if not exists actividades_equipo on public.actividades (equipo_id);

create or replace function privado.es_miembro(p_equipo uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select p_equipo is not null and exists (select 1 from public.equipo_miembros m where m.equipo_id = p_equipo and m.perfil_id = auth.uid())
$$;
create or replace function privado.es_lider(p_equipo uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select p_equipo is not null and exists (select 1 from public.equipo_miembros m where m.equipo_id = p_equipo and m.perfil_id = auth.uid() and m.es_lider)
$$;
grant execute on function privado.es_miembro(uuid), privado.es_lider(uuid) to authenticated;

alter table public.equipos_trabajo enable row level security;
alter table public.equipo_miembros enable row level security;
drop policy if exists equipos_select on public.equipos_trabajo;
create policy equipos_select on public.equipos_trabajo for select to authenticated using (privado.puede_editar() or privado.es_miembro(id));
drop policy if exists equipos_admin on public.equipos_trabajo;
create policy equipos_admin on public.equipos_trabajo for all to authenticated using (privado.es_admin()) with check (privado.es_admin());
drop policy if exists equipos_lider on public.equipos_trabajo;
create policy equipos_lider on public.equipos_trabajo for update to authenticated using (privado.es_lider(id)) with check (privado.es_lider(id));
drop policy if exists miembros_select on public.equipo_miembros;
create policy miembros_select on public.equipo_miembros for select to authenticated using (privado.puede_editar() or privado.es_miembro(equipo_id));
drop policy if exists miembros_admin on public.equipo_miembros;
create policy miembros_admin on public.equipo_miembros for all to authenticated using (privado.es_admin() or privado.es_lider(equipo_id)) with check (privado.es_admin() or privado.es_lider(equipo_id));
revoke all on public.equipos_trabajo, public.equipo_miembros from anon;
grant select, insert, update, delete on public.equipos_trabajo, public.equipo_miembros to authenticated;

-- Actividades: además de supervisores y administradores, los miembros del equipo trabajan las de su equipo
drop policy if exists actividades_equipo on public.actividades;
create policy actividades_equipo on public.actividades for all to authenticated
  using (privado.es_miembro(equipo_id)) with check (privado.es_miembro(equipo_id));
drop policy if exists actividad_avances_equipo on public.actividad_avances;
create policy actividad_avances_equipo on public.actividad_avances for all to authenticated
  using (exists (select 1 from public.actividades a where a.id = actividad_id and privado.es_miembro(a.equipo_id)))
  with check (exists (select 1 from public.actividades a where a.id = actividad_id and privado.es_miembro(a.equipo_id)));

-- Personas de un equipo (para asignar tareas), visible para sus miembros y para supervisores
create or replace function public.miembros_equipo(p_equipo uuid)
returns table (id uuid, nombre text, foto_path text, rol public.rol_usuario, es_lider boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nombre, p.foto_path, p.rol, m.es_lider from public.equipo_miembros m join public.perfiles p on p.id = m.perfil_id
   where m.equipo_id = p_equipo and p.activo and (privado.puede_editar() or privado.es_miembro(p_equipo)) order by m.es_lider desc, p.nombre
$$;
revoke execute on function public.miembros_equipo(uuid) from public, anon;
grant execute on function public.miembros_equipo(uuid) to authenticated;

-- Resumen de cada equipo visible: miembros y tareas abiertas, atoradas y vencidas
create or replace view public.v_equipos_trabajo with (security_invoker = true) as
select e.*,
  (select count(*) from public.equipo_miembros m where m.equipo_id = e.id) as miembros,
  (select count(*) from public.actividades a where a.equipo_id = e.id and a.estatus <> 'listo') as abiertas,
  (select count(*) from public.actividades a where a.equipo_id = e.id and a.estatus = 'atorado') as atoradas,
  (select count(*) from public.actividades a where a.equipo_id = e.id and a.estatus <> 'listo' and a.fecha_fin < current_date) as vencidas,
  (select count(*) from public.actividades a where a.equipo_id = e.id and a.estatus = 'listo') as listas,
  exists (select 1 from public.equipo_miembros m where m.equipo_id = e.id and m.perfil_id = auth.uid()) as soy_miembro
  from public.equipos_trabajo e where e.activo;
grant select on public.v_equipos_trabajo to authenticated;

-- Primer equipo: Administración, con los usuarios actuales (Oscar como líder)
do $$
declare v uuid;
begin
  if not exists (select 1 from public.equipos_trabajo where lower(nombre) = 'administración' and activo) then
    insert into public.equipos_trabajo (nombre, descripcion, color, created_by)
    values ('Administración', 'Gerencia, TICS, activos, patrimonio y administración', '#1F6FEB', (select id from public.perfiles where usuario = 'OSCAR COTA'))
    returning id into v;
    insert into public.equipo_miembros (equipo_id, perfil_id, es_lider)
    select v, p.id, coalesce(p.usuario = 'OSCAR COTA', false) from public.perfiles p where p.activo
    on conflict do nothing;
  end if;
end $$;

select 'ok' as resultado;
