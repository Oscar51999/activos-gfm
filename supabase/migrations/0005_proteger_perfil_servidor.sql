create or replace function privado.tg_proteger_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- sin auth.uid() = operación del servidor (panel de Supabase, mantenimiento): permitida
  if auth.uid() is not null and not privado.es_admin() then
    if new.rol is distinct from old.rol or new.activo is distinct from old.activo
       or new.todas_empresas is distinct from old.todas_empresas or new.empleado_id is distinct from old.empleado_id then
      raise exception 'Solo un administrador puede cambiar rol, acceso o empleado';
    end if;
  end if;
  return new;
end $$;
