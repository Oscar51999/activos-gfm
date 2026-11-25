-- ───────────── 0031 · Revisión general: quitar a "anónimo" funciones que solo usa gente con sesión, e índices para todas las llaves foráneas ─────────────
set lock_timeout = '8s';

-- Estas funciones ya validan la sesión por dentro; además se les quita el permiso a quien no ha iniciado sesión
revoke execute on function public.emitir_carta_no_adeudo from public, anon;
revoke execute on function public.resolver_baja from public, anon;
revoke execute on function public.resolver_merma from public, anon;
revoke execute on function public.registrar_checklist_vehicular from public, anon;
grant execute on function public.emitir_carta_no_adeudo, public.resolver_baja, public.resolver_merma, public.registrar_checklist_vehicular to authenticated;

-- Índice para cada llave foránea que no lo tenga (acelera filtros, borrados y uniones)
do $$
declare r record; n int := 0;
begin
  for r in
    select c.conrelid::regclass as tabla, a.attname as col
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
       and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    execute format('create index if not exists %I on %s (%I)', left(replace(r.tabla::text, 'public.', '') || '_' || r.col || '_fk', 63), r.tabla, r.col);
    n := n + 1;
  end loop;
  raise notice '% índices creados', n;
end $$;

select 'ok' as resultado;
