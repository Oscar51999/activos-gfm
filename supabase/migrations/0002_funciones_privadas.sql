create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;
alter function public.mi_rol() set schema privado;
alter function public.puede_editar() set schema privado;
alter function public.es_admin() set schema privado;
alter function public.tiene_empresa(uuid) set schema privado;
alter function public.usuario_activo() set schema privado;
alter function public.tg_bitacora() set schema privado;
alter function public.tg_nuevo_usuario() set schema privado;
alter function public.tg_proteger_perfil() set schema privado;
alter function public.tg_set_updated_at() set schema privado;
create or replace function privado.tg_proteger_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then
    if new.rol is distinct from old.rol or new.activo is distinct from old.activo
       or new.todas_empresas is distinct from old.todas_empresas or new.empleado_id is distinct from old.empleado_id then
      raise exception 'Solo un administrador puede cambiar rol, acceso o empleado';
    end if;
  end if;
  return new;
end $$;
grant usage on schema privado to supabase_auth_admin;
grant execute on function privado.tg_nuevo_usuario() to supabase_auth_admin;
