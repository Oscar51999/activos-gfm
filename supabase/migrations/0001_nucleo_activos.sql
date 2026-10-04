-- Sistema de control de activos · Grupo Firme
-- Fase 1: núcleo, catálogos, activos, bitácora y seguridad (RLS)

create extension if not exists pgcrypto;

-- ───────────── Tipos ─────────────
create type public.rol_usuario as enum ('admin', 'almacen', 'supervisor', 'consulta');
create type public.estatus_activo as enum ('disponible', 'asignado', 'mantenimiento', 'siniestrado', 'baja');
create type public.tipo_ubicacion as enum ('obra', 'almacen', 'oficina', 'patio', 'taller', 'sitio');

-- ───────────── Utilidades ─────────────
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────── Organización ─────────────
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  razon_social text,
  rfc text,
  activo boolean not null default true,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sucursales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nombre text not null,
  activo boolean not null default true,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nombre text not null,
  activo boolean not null default true,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.empleados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  codigo text,
  nombres text not null,
  apellidos text,
  puesto text,
  departamento_id uuid references public.departamentos(id) on delete set null,
  email text,
  telefono text,
  activo boolean not null default true,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ubicaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  sucursal_id uuid references public.sucursales(id) on delete set null,
  tipo public.tipo_ubicacion not null default 'obra',
  codigo text,
  nombre text not null,
  direccion text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  responsable_id uuid references public.empleados(id) on delete set null,
  activo boolean not null default true,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── Usuarios del sistema ─────────────
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text,
  rol public.rol_usuario not null default 'consulta',
  activo boolean not null default false,
  todas_empresas boolean not null default false,
  empleado_id uuid references public.empleados(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.perfil_empresas (
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  primary key (perfil_id, empresa_id)
);

-- ───────────── Catálogos globales ─────────────
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  padre_id uuid references public.categorias(id) on delete restrict,
  es_vehiculo boolean not null default false,
  activo boolean not null default true,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.modelos (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas(id) on delete restrict,
  nombre text not null,
  activo boolean not null default true,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marca_id, nombre)
);

create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rfc text,
  tipos text[] not null default '{}',  -- taller, aseguradora, agencia, otro
  contacto text,
  telefono text,
  email text,
  activo boolean not null default true,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────── Activos ─────────────
create sequence public.activos_folio_seq;

create table public.activos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('ACT-' || lpad(nextval('public.activos_folio_seq')::text, 6, '0')),
  qr uuid not null unique default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  categoria_id uuid not null references public.categorias(id) on delete restrict,
  marca_id uuid references public.marcas(id) on delete set null,
  modelo_id uuid references public.modelos(id) on delete set null,
  descripcion text not null,
  serie text,
  numero_economico text,
  ubicacion_id uuid references public.ubicaciones(id) on delete set null,
  responsable_id uuid references public.empleados(id) on delete set null,
  estatus public.estatus_activo not null default 'disponible',
  valor_referencia numeric(14,2),
  fecha_alta date not null default current_date,
  foto_principal text,
  notas text,
  legacy_id text unique,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asignado_requiere_responsable
    check (estatus <> 'asignado' or responsable_id is not null)
);

create table public.activo_vehiculo (
  activo_id uuid primary key references public.activos(id) on delete cascade,
  placa text,
  anio int check (anio between 1950 and 2100),
  color text,
  cilindros int,
  combustible text,
  transmision text,
  capacidad_tanque numeric(8,2),
  pasajeros int,
  kilometraje numeric(12,1),
  updated_at timestamptz not null default now()
);

create table public.activo_fotos (
  id uuid primary key default gen_random_uuid(),
  activo_id uuid not null references public.activos(id) on delete cascade,
  path text not null,
  descripcion text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- Índices
create index on public.sucursales (empresa_id);
create index on public.departamentos (empresa_id);
create index on public.empleados (empresa_id);
create index on public.empleados (departamento_id);
create index on public.ubicaciones (empresa_id);
create index on public.ubicaciones (sucursal_id);
create index on public.ubicaciones (responsable_id);
create index on public.perfiles (empleado_id);
create index on public.perfil_empresas (empresa_id);
create index on public.categorias (padre_id);
create index on public.modelos (marca_id);
create index on public.activos (empresa_id);
create index on public.activos (categoria_id);
create index on public.activos (marca_id);
create index on public.activos (modelo_id);
create index on public.activos (ubicacion_id);
create index on public.activos (responsable_id);
create index on public.activos (estatus);
create index on public.activos (created_by);
create index on public.activo_fotos (activo_id);
create index on public.activo_fotos (created_by);

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['empresas','sucursales','departamentos','empleados','ubicaciones','perfiles',
                           'categorias','marcas','modelos','proveedores','activos','activo_vehiculo']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;

-- ───────────── Bitácora (auditoría) ─────────────
create table public.bitacora (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id uuid,
  accion text not null,
  usuario_id uuid default auth.uid(),
  antes jsonb,
  despues jsonb,
  fecha timestamptz not null default now()
);
create index on public.bitacora (tabla, registro_id);
create index on public.bitacora (fecha desc);

create or replace function public.tg_bitacora()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
  if tg_op = 'DELETE' then
    rid := (to_jsonb(old) ->> case when tg_table_name = 'activo_vehiculo' then 'activo_id' else 'id' end)::uuid;
    insert into public.bitacora (tabla, registro_id, accion, antes) values (tg_table_name, rid, tg_op, to_jsonb(old));
    return old;
  else
    rid := (to_jsonb(new) ->> case when tg_table_name = 'activo_vehiculo' then 'activo_id' else 'id' end)::uuid;
    insert into public.bitacora (tabla, registro_id, accion, antes, despues)
    values (tg_table_name, rid, tg_op, case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
    return new;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['empresas','ubicaciones','empleados','perfiles','categorias','proveedores','activos','activo_vehiculo']
  loop
    execute format('create trigger bitacora after insert or update or delete on public.%I
                    for each row execute function public.tg_bitacora()', t);
  end loop;
end $$;

-- ───────────── Funciones de seguridad ─────────────
create or replace function public.mi_rol()
returns public.rol_usuario language sql stable security definer set search_path = '' as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.puede_editar()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select rol in ('admin','almacen') from public.perfiles where id = auth.uid() and activo), false)
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select rol = 'admin' from public.perfiles where id = auth.uid() and activo), false)
$$;

create or replace function public.tiene_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and p.activo
      and (p.todas_empresas or p.rol = 'admin'
           or exists (select 1 from public.perfil_empresas pe where pe.perfil_id = p.id and pe.empresa_id = p_empresa))
  )
$$;

create or replace function public.usuario_activo()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select activo from public.perfiles where id = auth.uid()), false)
$$;

revoke execute on function public.mi_rol(), public.puede_editar(), public.es_admin(),
  public.tiene_empresa(uuid), public.usuario_activo() from public, anon;
grant execute on function public.mi_rol(), public.puede_editar(), public.es_admin(),
  public.tiene_empresa(uuid), public.usuario_activo() to authenticated;
revoke execute on function public.tg_bitacora(), public.tg_set_updated_at() from public, anon, authenticated;

-- Alta automática de perfil: el primer usuario es admin activo; los demás quedan inactivos
create or replace function public.tg_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare primero boolean;
begin
  select not exists (select 1 from public.perfiles) into primero;
  insert into public.perfiles (id, nombre, email, rol, activo, todas_empresas)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
          new.email,
          case when primero then 'admin'::public.rol_usuario else 'consulta'::public.rol_usuario end,
          primero, primero);
  return new;
end $$;
revoke execute on function public.tg_nuevo_usuario() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_nuevo_usuario();

-- Un usuario no puede subirse de rol ni activarse a sí mismo
create or replace function public.tg_proteger_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    if new.rol is distinct from old.rol or new.activo is distinct from old.activo
       or new.todas_empresas is distinct from old.todas_empresas or new.empleado_id is distinct from old.empleado_id then
      raise exception 'Solo un administrador puede cambiar rol, acceso o empleado';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.tg_proteger_perfil() from public, anon, authenticated;
create trigger proteger_perfil before update on public.perfiles
  for each row execute function public.tg_proteger_perfil();

-- ───────────── RLS ─────────────
alter table public.empresas enable row level security;
alter table public.sucursales enable row level security;
alter table public.departamentos enable row level security;
alter table public.empleados enable row level security;
alter table public.ubicaciones enable row level security;
alter table public.perfiles enable row level security;
alter table public.perfil_empresas enable row level security;
alter table public.categorias enable row level security;
alter table public.marcas enable row level security;
alter table public.modelos enable row level security;
alter table public.proveedores enable row level security;
alter table public.activos enable row level security;
alter table public.activo_vehiculo enable row level security;
alter table public.activo_fotos enable row level security;
alter table public.bitacora enable row level security;

-- Empresas: ver las propias; solo admin edita
create policy empresas_select on public.empresas for select to authenticated using (public.tiene_empresa(id));
create policy empresas_insert on public.empresas for insert to authenticated with check (public.es_admin());
create policy empresas_update on public.empresas for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- Tablas por empresa: ver si tiene la empresa; editar admin/almacén con la empresa
do $$
declare t text;
begin
  foreach t in array array['sucursales','departamentos','empleados','ubicaciones','activos']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.tiene_empresa(empresa_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.puede_editar() and public.tiene_empresa(empresa_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.puede_editar() and public.tiene_empresa(empresa_id)) with check (public.puede_editar() and public.tiene_empresa(empresa_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.es_admin())', t);
  end loop;
end $$;

-- Catálogos globales: cualquier usuario activo ve; admin/almacén edita
do $$
declare t text;
begin
  foreach t in array array['categorias','marcas','modelos','proveedores']
  loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.usuario_activo())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.puede_editar())', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.puede_editar()) with check (public.puede_editar())', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.es_admin())', t);
  end loop;
end $$;

-- Detalle de vehículo y fotos: siguen al activo
create policy vehiculo_select on public.activo_vehiculo for select to authenticated
  using (exists (select 1 from public.activos a where a.id = activo_id and public.tiene_empresa(a.empresa_id)));
create policy vehiculo_write on public.activo_vehiculo for all to authenticated
  using (public.puede_editar() and exists (select 1 from public.activos a where a.id = activo_id and public.tiene_empresa(a.empresa_id)))
  with check (public.puede_editar() and exists (select 1 from public.activos a where a.id = activo_id and public.tiene_empresa(a.empresa_id)));

create policy fotos_select on public.activo_fotos for select to authenticated
  using (exists (select 1 from public.activos a where a.id = activo_id and public.tiene_empresa(a.empresa_id)));
create policy fotos_insert on public.activo_fotos for insert to authenticated
  with check (public.puede_editar() and exists (select 1 from public.activos a where a.id = activo_id and public.tiene_empresa(a.empresa_id)));
create policy fotos_delete on public.activo_fotos for delete to authenticated
  using (public.puede_editar() and exists (select 1 from public.activos a where a.id = activo_id and public.tiene_empresa(a.empresa_id)));

-- Perfiles: cada quien ve el suyo, admin ve todos; admin edita todo, el usuario solo su nombre
create policy perfiles_select on public.perfiles for select to authenticated using (id = auth.uid() or public.es_admin());
create policy perfiles_update on public.perfiles for update to authenticated
  using (id = auth.uid() or public.es_admin()) with check (id = auth.uid() or public.es_admin());

create policy perfil_empresas_select on public.perfil_empresas for select to authenticated using (perfil_id = auth.uid() or public.es_admin());
create policy perfil_empresas_write on public.perfil_empresas for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Bitácora: solo lectura para admin (la escriben los triggers)
create policy bitacora_select on public.bitacora for select to authenticated using (public.es_admin());

-- ───────────── Vista de lista de activos ─────────────
create view public.v_activos with (security_invoker = true) as
select a.id, a.codigo, a.qr, a.descripcion, a.serie, a.numero_economico, a.estatus,
       a.valor_referencia, a.fecha_alta, a.foto_principal, a.updated_at,
       a.empresa_id, e.nombre as empresa,
       a.categoria_id, c.nombre as categoria, c.es_vehiculo,
       a.marca_id, m.nombre as marca, a.modelo_id, mo.nombre as modelo,
       a.ubicacion_id, u.nombre as ubicacion, u.tipo as ubicacion_tipo,
       a.responsable_id, trim(coalesce(emp.nombres,'') || ' ' || coalesce(emp.apellidos,'')) as responsable,
       v.placa
from public.activos a
join public.empresas e on e.id = a.empresa_id
join public.categorias c on c.id = a.categoria_id
left join public.marcas m on m.id = a.marca_id
left join public.modelos mo on mo.id = a.modelo_id
left join public.ubicaciones u on u.id = a.ubicacion_id
left join public.empleados emp on emp.id = a.responsable_id
left join public.activo_vehiculo v on v.activo_id = a.id;

grant select on public.v_activos to authenticated;
revoke all on public.v_activos from anon;

-- ───────────── Storage: fotos de activos ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activos', 'activos', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Ruta: <empresa_id>/<activo_id>/<archivo>
create policy activos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'activos' and public.tiene_empresa(((storage.foldername(name))[1])::uuid));
create policy activos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'activos' and public.puede_editar() and public.tiene_empresa(((storage.foldername(name))[1])::uuid));
create policy activos_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'activos' and public.puede_editar() and public.tiene_empresa(((storage.foldername(name))[1])::uuid));
