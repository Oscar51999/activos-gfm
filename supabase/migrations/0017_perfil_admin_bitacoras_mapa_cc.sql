-- ───────────── 0017 · Perfil, administrador principal, apariencia y mapa por CC ─────────────

-- A. Perfil: foto, contacto, preferencias y administrador principal
alter table public.perfiles
  add column if not exists foto_path text,
  add column if not exists telefono text,
  add column if not exists puesto text,
  add column if not exists preferencias jsonb not null default '{}'::jsonb,
  add column if not exists es_super boolean not null default false;

update public.perfiles set es_super = true where upper(usuario) = 'OSCAR COTA';

create or replace function privado.es_super() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select es_super and activo from public.perfiles where id = auth.uid()), false)
$$;
grant execute on function privado.es_super() to authenticated;

-- Nadie se sube a administrador principal, y un admin normal no puede tocar al principal
create or replace function privado.tg_proteger_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    if new.es_super is distinct from old.es_super and not privado.es_super() then
      raise exception 'Solo el administrador principal puede cambiar ese permiso';
    end if;
    if old.es_super and old.id <> auth.uid() and not privado.es_super() then
      raise exception 'No puedes modificar al administrador principal';
    end if;
    if not privado.es_admin() then
      if new.rol is distinct from old.rol or new.activo is distinct from old.activo
         or new.todas_empresas is distinct from old.todas_empresas or new.empleado_id is distinct from old.empleado_id
         or new.usuario is distinct from old.usuario then
        raise exception 'Solo un administrador puede cambiar rol, acceso, usuario o empleado';
      end if;
    end if;
  end if;
  return new;
end $$;

-- Fotos de perfil (públicas; cada quien solo escribe en su carpeta)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('perfiles', 'perfiles', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists perfiles_foto_insert on storage.objects;
drop policy if exists perfiles_foto_update on storage.objects;
drop policy if exists perfiles_foto_delete on storage.objects;
create policy perfiles_foto_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'perfiles' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy perfiles_foto_update on storage.objects for update to authenticated
  using (bucket_id = 'perfiles' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy perfiles_foto_delete on storage.objects for delete to authenticated
  using (bucket_id = 'perfiles' and ((storage.foldername(name))[1] = (select auth.uid())::text or privado.es_super()));

-- B. Ajustes generales (apariencia de la app); los cambia solo el administrador principal
create table if not exists public.ajustes (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.ajustes enable row level security;
drop policy if exists ajustes_select on public.ajustes;
drop policy if exists ajustes_write on public.ajustes;
create policy ajustes_select on public.ajustes for select to authenticated using (true);
create policy ajustes_write on public.ajustes for all to authenticated using (privado.es_super()) with check (privado.es_super());
insert into public.ajustes (clave, valor) values ('apariencia', '{"acento":"#E2A64B","tema_defecto":"oscuro","densidad":"normal"}') on conflict do nothing;

-- C. Funciones de administración
-- Crear usuario con correo, usuario y contraseña (queda activo y confirmado)
create or replace function public.admin_crear_usuario(
  p_correo text, p_contrasena text, p_nombre text, p_usuario text default null,
  p_rol public.rol_usuario default 'consulta', p_todas_empresas boolean default false, p_empresas uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := gen_random_uuid(); correo text := lower(trim(p_correo)); usr text := nullif(upper(trim(coalesce(p_usuario, ''))), '');
begin
  if not privado.es_admin() then raise exception 'Solo un administrador puede crear usuarios'; end if;
  if correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'El correo no es válido'; end if;
  if length(coalesce(p_contrasena, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Escribe el nombre'; end if;
  if exists (select 1 from auth.users where lower(email) = correo) then raise exception 'Ya existe un usuario con ese correo'; end if;
  if usr is not null and exists (select 1 from public.perfiles where upper(usuario) = usr) then raise exception 'Ese nombre de usuario ya está en uso'; end if;
  if p_rol = 'admin' and not privado.es_super() then raise exception 'Solo el administrador principal puede crear administradores'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', correo,
    extensions.crypt(p_contrasena, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nombre', trim(p_nombre)), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', correo, 'email_verified', true), 'email', now(), now(), now());

  update public.perfiles set nombre = trim(p_nombre), usuario = usr, rol = p_rol, activo = true, todas_empresas = p_todas_empresas where id = uid;
  insert into public.perfil_empresas (perfil_id, empresa_id) select uid, e from unnest(coalesce(p_empresas, '{}')) e on conflict do nothing;
  return uid;
end $$;

-- Poner una contraseña nueva a otro usuario (solo el principal)
create or replace function public.admin_contrasena(p_id uuid, p_contrasena text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_super() then raise exception 'Solo el administrador principal puede hacer esto'; end if;
  if length(coalesce(p_contrasena, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_contrasena, extensions.gen_salt('bf')), updated_at = now() where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

-- Eliminar un usuario por completo (solo el principal; no a sí mismo)
create or replace function public.admin_eliminar_usuario(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_super() then raise exception 'Solo el administrador principal puede eliminar usuarios'; end if;
  if p_id = auth.uid() then raise exception 'No puedes eliminar tu propia cuenta'; end if;
  insert into public.bitacora (tabla, registro_id, accion, antes)
    select 'perfiles', p.id, 'DELETE', to_jsonb(p) from public.perfiles p where p.id = p_id;
  delete from auth.users where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
end $$;

-- Eliminar un activo definitivamente, con su historial de resguardos (solo el principal)
create or replace function public.admin_eliminar_activo(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_super() then raise exception 'Solo el administrador principal puede eliminar activos'; end if;
  delete from public.movimiento_activos where activo_id = p_id;
  delete from public.activos where id = p_id;
  if not found then raise exception 'Activo no encontrado'; end if;
end $$;

revoke execute on function public.admin_crear_usuario(text, text, text, text, public.rol_usuario, boolean, uuid[]),
  public.admin_contrasena(uuid, text), public.admin_eliminar_usuario(uuid), public.admin_eliminar_activo(uuid) from public, anon;
grant execute on function public.admin_crear_usuario(text, text, text, text, public.rol_usuario, boolean, uuid[]),
  public.admin_contrasena(uuid, text), public.admin_eliminar_usuario(uuid), public.admin_eliminar_activo(uuid) to authenticated;

-- D. Mapa: cada centro de costo de obra con su lugar (por el nombre)
alter table public.centros_costo
  add column if not exists latitud numeric(9,6),
  add column if not exists longitud numeric(9,6),
  add column if not exists lugar text,
  add column if not exists es_obra boolean not null default true,
  add column if not exists ubicacion_aprox boolean not null default false;

-- Lo administrativo no es obra (ADM, FNZ, CI…, GC…, históricos, ventas)
update public.centros_costo set es_obra = false
 where clave !~ '^[0-9]'
    or translate(upper(nombre), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') ~ '(HISTORICO|ADMINISTRACION DE PROYECTOS|RENTA DE ACTIVO|VENTA|INTERCOMPA|CALIBRACION|SUMINISTRO DE TARIMAS|SUMINISTROS COSTA PALMAS|^BN$)';

with reglas(orden, patron, lat, lng, lugar) as (values
  (1,  'TIJUANA',                                    32.514900, -117.038200, 'Tijuana, B.C.'),
  (2,  'ECATEPEC',                                   19.601300,  -99.050600, 'Ecatepec, Edo. Méx.'),
  (3,  'TLAPACOYA',                                  19.303600,  -98.913900, 'Ixtapaluca, Edo. Méx.'),
  (4,  'CASETA QRO',                                 20.588800, -100.389900, 'Querétaro, Qro.'),
  (5,  '(NUEVO LEON| NL$)',                          25.686600, -100.316100, 'Monterrey, N.L.'),
  (6,  'COZUMEL',                                    20.508300,  -86.945800, 'Cozumel, Q. Roo'),
  (7,  'OXTANKAH',                                   18.612500,  -88.248300, 'Chetumal, Q. Roo'),
  (8,  'QUINTANA ROO',                               21.161900,  -86.851500, 'Cancún, Q. Roo'),
  (9,  'NAYARIT',                                    20.747000, -105.333000, 'Riviera Nayarit'),
  (10, 'MANZANILLO',                                 19.052200, -104.315800, 'Manzanillo, Col.'),
  (11, 'COLIMA',                                     19.243300, -103.725000, 'Colima, Col.'),
  (12, 'MONTAGE',                                    22.952000, -109.804000, 'Corredor Los Cabos, B.C.S.'),
  (13, '(LOS CABOS|CABA )',                          22.890500, -109.916700, 'Los Cabos, B.C.S.'),
  (14, '(COSTA PALMAS|AMAN|CPMA|M13|M8|MAID STATION|YACHT|YATCH|SKY ROOM|EONE|PENINSULA|SPILLWAY|LIGHTHOUSE|BOH|PLAYA COLORADA|MARINA|CARCAMO SPA|50S|AYUDANTES|JORNALES|FILTRADO|AGUA POTABLE|MINISPLIT| CP$|^CP|OBRAS MENORES CP|OFICINAS CP)',
                                                     23.621500, -109.586000, 'Costa Palmas, La Ribera, B.C.S.'),
  (15, 'ABASOLO',                                    24.150000, -110.319000, 'La Paz, B.C.S.'),
  (16, '(LA RIBERA|SANTA CRUZ)',                     23.593700, -109.588000, 'La Ribera, B.C.S.'),
  (17, 'LA PAZ',                                     24.142600, -110.312800, 'La Paz, B.C.S.')
), primera as (
  select distinct on (c.id) c.id, r.lat, r.lng, r.lugar
    from public.centros_costo c join reglas r on translate(upper(c.nombre), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') ~ r.patron
   where c.es_obra and c.latitud is null
   order by c.id, r.orden
)
update public.centros_costo c set latitud = p.lat, longitud = p.lng, lugar = p.lugar, ubicacion_aprox = false
  from primera p where p.id = c.id;

-- Sin pista en el nombre: la sede de la empresa (marcado como aproximado; se ajusta en el mapa)
update public.centros_costo c set
  latitud  = case when e.nombre_corto in ('Vanguardia') then 23.621500 when e.nombre_corto = 'Santa Cruz Fid' then 23.593700 else 24.142600 end,
  longitud = case when e.nombre_corto in ('Vanguardia') then -109.586000 when e.nombre_corto = 'Santa Cruz Fid' then -109.588000 else -110.312800 end,
  lugar    = case when e.nombre_corto in ('Vanguardia') then 'Costa Palmas, La Ribera, B.C.S.' when e.nombre_corto = 'Santa Cruz Fid' then 'La Ribera, B.C.S.' else 'La Paz, B.C.S.' end,
  ubicacion_aprox = true
from public.empresas e
where e.id = c.empresa_id and c.es_obra and c.latitud is null;

-- Si alguien corrige las coordenadas de un CC, deja de ser "aproximado"
create or replace function privado.tg_cc_ubicacion() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.latitud is distinct from old.latitud or new.longitud is distinct from old.longitud) and new.ubicacion_aprox = old.ubicacion_aprox then
    new.ubicacion_aprox := false;
  end if;
  return new;
end $$;
drop trigger if exists cc_ubicacion on public.centros_costo;
create trigger cc_ubicacion before update on public.centros_costo for each row execute function privado.tg_cc_ubicacion();
