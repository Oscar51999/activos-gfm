-- Roles (19 nov 2026): Supervisor tiene todo menos usuarios y permisos; Almacén opera (resguardos, préstamos, vales, inventarios)
-- pero ya no da de alta ni edita activos ni catálogos.
create or replace function privado.puede_editar()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select rol in ('admin','supervisor') from public.perfiles where id = auth.uid() and activo), false)
$$;
