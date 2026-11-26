-- ───────────── 0034 · Contraseñas asignadas por el administrador principal (visibles hasta que el usuario la cambie) ─────────────
-- Cuando el administrador principal crea un usuario o le pone una contraseña nueva, se guarda una copia CIFRADA.
-- Solo el administrador principal puede verla y cada consulta queda en la bitácora.
-- En cuanto el usuario cambia su contraseña (desde su perfil o con "olvidé mi contraseña"), la copia se borra.

create table if not exists privado.secretos (clave text primary key, valor text not null, created_at timestamptz not null default now());
revoke all on privado.secretos from public, anon, authenticated;

-- Llave de cifrado: en Supabase Vault si está disponible; si no, en una tabla privada sin acceso desde la app.
do $$
declare k text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  begin
    if not exists (select 1 from vault.secrets where name = 'clave_contrasenas') then
      perform vault.create_secret(k, 'clave_contrasenas', 'Llave para cifrar las contraseñas asignadas por el administrador');
    end if;
  exception when others then
    insert into privado.secretos (clave, valor) values ('clave_contrasenas', k) on conflict (clave) do nothing;
  end;
end $$;

create or replace function privado.llave_contrasenas() returns text language plpgsql stable security definer set search_path = '' as $$
declare k text;
begin
  begin
    select decrypted_secret into k from vault.decrypted_secrets where name = 'clave_contrasenas' limit 1;
  exception when others then k := null;
  end;
  if k is null then select valor into k from privado.secretos where clave = 'clave_contrasenas'; end if;
  if k is null then raise exception 'Falta la llave de cifrado de contraseñas'; end if;
  return k;
end $$;
revoke all on function privado.llave_contrasenas() from public, anon, authenticated;

create table if not exists privado.contrasenas (
  perfil_id uuid primary key references auth.users(id) on delete cascade,
  cifrada bytea,
  asignada_at timestamptz,
  asignada_por uuid references auth.users(id) on delete set null,
  vigente boolean not null default false,
  cambiada_at timestamptz
);
revoke all on privado.contrasenas from public, anon, authenticated;
create index if not exists contrasenas_asignada_por on privado.contrasenas (asignada_por);

-- Guarda la copia cifrada y marca la transacción para que el trigger sepa que la puso el administrador
create or replace function privado.guardar_contrasena(p_id uuid, p_clave text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('gfm.clave_admin', p_id::text, true);
  insert into privado.contrasenas (perfil_id, cifrada, asignada_at, asignada_por, vigente, cambiada_at)
  values (p_id, extensions.pgp_sym_encrypt(p_clave, privado.llave_contrasenas()), now(), auth.uid(), true, null)
  on conflict (perfil_id) do update set cifrada = excluded.cifrada, asignada_at = now(), asignada_por = auth.uid(), vigente = true, cambiada_at = null;
end $$;
revoke all on function privado.guardar_contrasena(uuid, text) from public, anon, authenticated;

-- Si la contraseña cambia por otro camino (el usuario la cambió o la recuperó), se borra la copia
create or replace function privado.tg_contrasena_cambiada() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and coalesce(current_setting('gfm.clave_admin', true), '') <> new.id::text then
    update privado.contrasenas set cifrada = null, vigente = false, cambiada_at = now() where perfil_id = new.id and vigente;
  end if;
  return new;
end $$;
drop trigger if exists contrasena_cambiada on auth.users;
create trigger contrasena_cambiada after update of encrypted_password on auth.users for each row execute function privado.tg_contrasena_cambiada();

-- Poner contraseña nueva (solo el principal): ahora también guarda la copia
create or replace function public.admin_contrasena(p_id uuid, p_contrasena text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_super() then raise exception 'Solo el administrador principal puede hacer esto'; end if;
  if length(coalesce(p_contrasena, '')) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres'; end if;
  perform set_config('gfm.clave_admin', p_id::text, true);
  update auth.users set encrypted_password = extensions.crypt(p_contrasena, extensions.gen_salt('bf')), updated_at = now() where id = p_id;
  if not found then raise exception 'Usuario no encontrado'; end if;
  perform privado.guardar_contrasena(p_id, p_contrasena);
  insert into public.bitacora (tabla, registro_id, accion, despues) values ('perfiles', p_id, 'CONTRASEÑA ASIGNADA', jsonb_build_object('por', auth.uid()));
end $$;

-- Crear usuario: igual que antes y, si lo crea el principal, guarda la copia de la contraseña
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
  if privado.es_super() then perform privado.guardar_contrasena(uid, p_contrasena); end if;
  return uid;
end $$;


-- Ver la contraseña asignada (solo el principal; queda en bitácora)
create or replace function public.admin_ver_contrasena(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c privado.contrasenas;
begin
  if not privado.es_super() then raise exception 'Solo el administrador principal puede ver contraseñas'; end if;
  select * into c from privado.contrasenas where perfil_id = p_id;
  if c.perfil_id is null then return jsonb_build_object('estado', 'sin_dato'); end if;
  if not c.vigente or c.cifrada is null then return jsonb_build_object('estado', 'cambiada', 'cambiada_at', c.cambiada_at); end if;
  insert into public.bitacora (tabla, registro_id, accion, despues) values ('perfiles', p_id, 'CONTRASEÑA CONSULTADA', jsonb_build_object('por', auth.uid()));
  return jsonb_build_object('estado', 'visible', 'contrasena', extensions.pgp_sym_decrypt(c.cifrada, privado.llave_contrasenas()), 'asignada_at', c.asignada_at);
end $$;

-- Estado de cada usuario (sin mostrar contraseñas), para la lista de Usuarios
create or replace function public.admin_estado_contrasenas()
returns table (perfil_id uuid, estado text, asignada_at timestamptz, cambiada_at timestamptz) language plpgsql stable security definer set search_path = '' as $$
begin
  if not privado.es_super() then return; end if;
  return query select c.perfil_id, case when c.vigente and c.cifrada is not null then 'visible' else 'cambiada' end, c.asignada_at, c.cambiada_at from privado.contrasenas c;
end $$;

revoke all on function public.admin_ver_contrasena(uuid), public.admin_estado_contrasenas() from public, anon;
grant execute on function public.admin_ver_contrasena(uuid), public.admin_estado_contrasenas() to authenticated;
revoke execute on function public.admin_crear_usuario(text, text, text, text, public.rol_usuario, boolean, uuid[]), public.admin_contrasena(uuid, text) from public, anon;
grant execute on function public.admin_crear_usuario(text, text, text, text, public.rol_usuario, boolean, uuid[]), public.admin_contrasena(uuid, text) to authenticated;

select 'ok' as resultado;
