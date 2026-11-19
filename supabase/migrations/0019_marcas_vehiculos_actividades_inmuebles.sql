-- ───────────── 0019 · Marcas con logo y subtipos, control de vehículos, actividades, inmuebles ─────────────

-- A. Marcas con logo y tipos de producto en dos niveles (tipo → subtipo)
alter table public.marcas add column if not exists logo text;          -- data URL subido por el usuario
alter table public.marcas add column if not exists sitio text;         -- dominio para el logo automático (ej. lenovo.com)

insert into public.categorias (nombre, padre_id, es_vehiculo)
select v.hijo, p.id, p.es_vehiculo
  from (values
    ('Equipo de cómputo', 'Laptops'), ('Equipo de cómputo', 'Computadoras de escritorio'), ('Equipo de cómputo', 'Monitores'),
    ('Equipo de cómputo', 'Impresoras y multifuncionales'), ('Equipo de cómputo', 'Tablets'), ('Equipo de cómputo', 'Redes (switch, router, AP)'),
    ('Equipo de cómputo', 'No-break y energía'), ('Equipo de cómputo', 'Proyectores y pantallas'), ('Equipo de cómputo', 'Accesorios de cómputo'),
    ('Equipo de comunicación', 'Radios'), ('Equipo de comunicación', 'Celulares'), ('Equipo de comunicación', 'Teléfonos de oficina'), ('Equipo de comunicación', 'Antenas y repetidores'),
    ('Equipo de topografía', 'Estaciones totales'), ('Equipo de topografía', 'Niveles'), ('Equipo de topografía', 'GPS / GNSS'), ('Equipo de topografía', 'Drones'),
    ('Herramienta', 'Herramienta eléctrica'), ('Herramienta', 'Herramienta manual'), ('Herramienta', 'Soldadoras'), ('Herramienta', 'Compresores'), ('Herramienta', 'Generadores'),
    ('Maquinaria pesada', 'Retroexcavadoras'), ('Maquinaria pesada', 'Excavadoras'), ('Maquinaria pesada', 'Motoconformadoras'), ('Maquinaria pesada', 'Compactadores'),
    ('Maquinaria pesada', 'Cargadores'), ('Maquinaria pesada', 'Grúas y montacargas'),
    ('Mobiliario', 'Escritorios'), ('Mobiliario', 'Sillas'), ('Mobiliario', 'Archiveros y libreros'), ('Mobiliario', 'Mesas'),
    ('Vehículos', 'Pick-up'), ('Vehículos', 'Sedán'), ('Vehículos', 'SUV'), ('Vehículos', 'Camiones'), ('Vehículos', 'Motocicletas'), ('Vehículos', 'Remolques'),
    ('Equipo menor', 'Bombas'), ('Equipo menor', 'Revolvedoras'), ('Equipo menor', 'Vibradores'), ('Equipo menor', 'Cortadoras')
  ) v(padre, hijo)
  join public.categorias p on p.nombre = v.padre and p.padre_id is null
 where not exists (select 1 from public.categorias c where c.padre_id = p.id and c.nombre = v.hijo);

-- B. Vehículos: más datos y licencia obligatoria para asignar
alter table public.activo_vehiculo
  add column if not exists numero_motor text,
  add column if not exists version text,
  add column if not exists tipo_licencia text,           -- A, B, C, D, E (la que pide la unidad)
  add column if not exists tarjeta_circulacion text,
  add column if not exists poliza text;

-- Requisito base: todo vehículo pide licencia de manejo vigente
insert into public.requisitos_operacion (categoria_id, tipo_documento, descripcion, bloquear)
select c.id, 'licencia_manejo', 'Licencia de manejo vigente', true from public.categorias c
 where c.nombre = 'Vehículos' and c.padre_id is null
   and not exists (select 1 from public.requisitos_operacion r where r.categoria_id = c.id and r.tipo_documento = 'licencia_manejo');

-- El servidor no deja asignar un equipo si el empleado no tiene el documento que pide (licencia, DC-3)
create or replace function privado.tg_requisitos_resguardo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m record; a record; falta text;
begin
  select tipo, a_empleado_id into m from public.movimientos where id = new.movimiento_id;
  if m.a_empleado_id is null or m.tipo = 'devolucion' then return new; end if;
  select ac.codigo, ac.descripcion, ac.categoria_id, ac.modelo_id, c.padre_id, c.es_vehiculo into a
    from public.activos ac join public.categorias c on c.id = ac.categoria_id where ac.id = new.activo_id;
  select x.req into falta from (
    select r.descripcion as req, r.tipo_documento as td from public.requisitos_operacion r
     where r.activo and r.bloquear and (r.modelo_id = a.modelo_id or (r.modelo_id is null and r.categoria_id in (a.categoria_id, a.padre_id)))
    union all
    select 'Licencia de manejo vigente', 'licencia_manejo' where a.es_vehiculo
  ) x
  where not exists (select 1 from public.documentos d where d.empleado_id = m.a_empleado_id and d.vigente and d.tipo = x.td
                      and (d.fecha_vencimiento is null or d.fecha_vencimiento >= current_date))
  limit 1;
  if falta is not null then
    raise exception 'No se puede asignar % (%): el empleado no tiene %. Súbela en su ficha (Empleados → Documentos).', a.codigo, a.descripcion, lower(falta);
  end if;
  return new;
end $$;
drop trigger if exists requisitos_resguardo on public.movimiento_activos;
create trigger requisitos_resguardo before insert on public.movimiento_activos for each row execute function privado.tg_requisitos_resguardo();

-- C. Mantenimiento: el plan dice si es preventivo o correctivo programado
alter table public.planes_mantenimiento add column if not exists tipo text not null default 'preventivo' check (tipo in ('preventivo', 'correctivo'));
alter table public.planes_mantenimiento add column if not exists notas text;

-- D. Actividades (tablero tipo Monday) para supervisores y administradores
create table if not exists public.actividades (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  grupo text not null default 'General',
  descripcion text,
  estatus text not null default 'pendiente' check (estatus in ('pendiente', 'en_curso', 'atorado', 'listo')),
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta', 'urgente')),
  responsable_id uuid references public.perfiles(id) on delete set null,
  empresa_id uuid references public.empresas(id) on delete set null,
  fecha_inicio date,
  fecha_fin date,
  avance int not null default 0 check (avance between 0 and 100),
  orden int not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists actividades_fecha_idx on public.actividades (fecha_fin);
alter table public.actividades enable row level security;
drop policy if exists actividades_all on public.actividades;
create policy actividades_all on public.actividades for all to authenticated using (privado.puede_editar()) with check (privado.puede_editar());
drop trigger if exists actividades_updated on public.actividades;
create trigger actividades_updated before update on public.actividades for each row execute function privado.tg_set_updated_at();

-- E. Inmuebles: pagos pendientes (servicios, predial…) y fallas
create table if not exists public.inmueble_pagos (
  id uuid primary key default gen_random_uuid(),
  inmueble_id uuid not null references public.inmuebles(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  concepto text not null,
  tipo text not null default 'otro' check (tipo in ('luz', 'agua', 'predial', 'internet', 'telefono', 'gas', 'renta', 'mantenimiento', 'seguro', 'vigilancia', 'basura', 'otro')),
  proveedor text,                 -- CFE, OOMSAPAS, Telmex, municipio…
  cuenta text,                    -- no. de servicio, contrato o clave
  periodicidad text not null default 'mensual' check (periodicidad in ('unico', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual')),
  monto numeric(14,2),
  fecha_limite date not null,
  pagado boolean not null default false,
  pagado_at date,
  notas text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists inmueble_pagos_idx on public.inmueble_pagos (inmueble_id, pagado, fecha_limite);
alter table public.inmueble_pagos enable row level security;
drop policy if exists inm_pagos_select on public.inmueble_pagos;
drop policy if exists inm_pagos_write on public.inmueble_pagos;
create policy inm_pagos_select on public.inmueble_pagos for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy inm_pagos_write on public.inmueble_pagos for all to authenticated
  using (privado.puede_editar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));

create table if not exists public.inmueble_fallas (
  id uuid primary key default gen_random_uuid(),
  inmueble_id uuid not null references public.inmuebles(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  titulo text not null,
  descripcion text,
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  estatus text not null default 'abierta' check (estatus in ('abierta', 'en_proceso', 'resuelta')),
  foto text,
  resolucion text,
  reportado_por uuid references auth.users(id) on delete set null default auth.uid(),
  resuelta_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists inmueble_fallas_idx on public.inmueble_fallas (inmueble_id, estatus);
alter table public.inmueble_fallas enable row level security;
drop policy if exists inm_fallas_select on public.inmueble_fallas;
drop policy if exists inm_fallas_insert on public.inmueble_fallas;
drop policy if exists inm_fallas_update on public.inmueble_fallas;
create policy inm_fallas_select on public.inmueble_fallas for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy inm_fallas_insert on public.inmueble_fallas for insert to authenticated with check (privado.usuario_activo() and privado.tiene_empresa(empresa_id));
create policy inm_fallas_update on public.inmueble_fallas for update to authenticated
  using (privado.puede_resguardar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));

-- F. Lista de usuarios para asignar actividades (los supervisores no leen la tabla perfiles completa)
create or replace function public.usuarios_para_asignar()
returns table (id uuid, nombre text, foto_path text, rol public.rol_usuario)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nombre, p.foto_path, p.rol from public.perfiles p
   where p.activo and privado.puede_editar() order by p.nombre
$$;
revoke execute on function public.usuarios_para_asignar() from public, anon;
grant execute on function public.usuarios_para_asignar() to authenticated;
