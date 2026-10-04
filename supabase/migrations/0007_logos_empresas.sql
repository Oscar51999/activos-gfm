-- Logos de las empresas del grupo (incluidos en la app en src/assets/logos) y color de acento.
alter table public.empresas add column if not exists logo_oscuro text;
update public.empresas e set nombre_corto = v.c, color = v.col, logo_path = v.l, logo_oscuro = v.l from (values
  ('Grupo Firme de México', 'Firme México', '#E8352B', 'app:firme-mexico'),
  ('Control de Ingeniería y Servicios Añadidos', 'CISA', '#5B9BD5', 'app:cisa'),
  ('Construcciones y Terracerías Vanguardia', 'Vanguardia', '#C8D400', 'app:vanguardia'),
  ('Comercializadora Mupo', 'MUPO', '#8DC63F', 'app:mupo'),
  ('Proyectos y Desarrollos Punta Cortez', 'Punta Cortez', '#FBBA16', 'app:punta-cortez'),
  ('Grupo Empresarial Firme', 'Grupo Firme', '#F9B234', 'app:grupo-firme'),
  ('Inmobiliaria Atardecer de La Paz', 'Atardecer', '#F28C38', null)
) v(nombre, c, col, l) where e.nombre = v.nombre;
insert into public.empresas (nombre, nombre_corto, color, logo_path, logo_oscuro)
select 'Grupo Santa Cruz Desarrollos', 'Santa Cruz', '#C2552B', 'app:santacruz', 'app:santacruz'
where not exists (select 1 from public.empresas where nombre ilike '%santa cruz%');
