-- Fase 5 · Almacén de consumibles (artículos sin serie, por cantidad) y solicitudes de equipo con aprobación.
-- Sin costos: solo cantidades.
set lock_timeout = '8s';

-- ───────────── Consumibles ─────────────
create table if not exists public.consumibles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text,                       -- EPP, Herramienta menor, Papelería, Limpieza…
  unidad text not null default 'pieza', -- pieza, par, caja, litro, metro, rollo
  marca text,
  foto text,                            -- data URL
  minimo numeric(12,2) not null default 0,   -- existencia mínima por empresa
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.consumibles enable row level security;
create policy consumibles_select on public.consumibles for select to authenticated using (privado.usuario_activo());
create policy consumibles_write on public.consumibles for all to authenticated using (privado.puede_editar()) with check (privado.puede_editar());

create table if not exists public.movimientos_consumible (
  id uuid primary key default gen_random_uuid(),
  consumible_id uuid not null references public.consumibles(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ubicacion_id uuid references public.ubicaciones(id) on delete set null,
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  cantidad numeric(12,2) not null,       -- entrada/salida positivas; ajuste con signo
  empleado_id uuid references public.empleados(id) on delete set null,   -- a quién se entregó
  solicitud_id uuid,
  notas text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (tipo = 'ajuste' or cantidad > 0)
);
create index if not exists mov_cons_idx on public.movimientos_consumible (consumible_id, empresa_id, ubicacion_id);
create index if not exists mov_cons_emp_idx on public.movimientos_consumible (empleado_id);
alter table public.movimientos_consumible enable row level security;
create policy movcons_select on public.movimientos_consumible for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy movcons_insert on public.movimientos_consumible for insert to authenticated with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));

-- Existencia por consumible, empresa y lugar
create or replace view public.v_existencias with (security_invoker = true) as
select m.consumible_id, c.nombre, c.categoria, c.unidad, c.marca, c.foto, c.minimo,
       m.empresa_id, coalesce(e.nombre_corto, e.nombre) as empresa, m.ubicacion_id, u.nombre as ubicacion,
       sum(case when m.tipo = 'salida' then -m.cantidad else m.cantidad end) as existencia,
       max(m.created_at) as ultimo_movimiento
from public.movimientos_consumible m
join public.consumibles c on c.id = m.consumible_id
join public.empresas e on e.id = m.empresa_id
left join public.ubicaciones u on u.id = m.ubicacion_id
where c.activo
group by m.consumible_id, c.nombre, c.categoria, c.unidad, c.marca, c.foto, c.minimo, m.empresa_id, e.nombre_corto, e.nombre, m.ubicacion_id, u.nombre;
grant select on public.v_existencias to authenticated;
revoke all on public.v_existencias from anon;

-- ───────────── Solicitudes de equipo ─────────────
create sequence if not exists public.solicitudes_seq;
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('SOL-' || lpad(nextval('public.solicitudes_seq')::text, 5, '0')),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  empleado_id uuid references public.empleados(id) on delete set null,    -- para quién es
  ubicacion_id uuid references public.ubicaciones(id) on delete set null, -- a dónde va
  items jsonb not null,          -- [{"tipo":"producto","modelo_id":…,"cantidad":1} | {"tipo":"consumible","consumible_id":…,"cantidad":10} | {"tipo":"libre","descripcion":"…","cantidad":1}]
  motivo text,
  fecha_necesaria date,
  estatus text not null default 'pendiente' check (estatus in ('pendiente', 'aprobada', 'rechazada', 'entregada', 'cancelada')),
  respuesta text,
  resuelto_por uuid references auth.users(id) on delete set null,
  resuelto_at timestamptz,
  movimiento_id uuid references public.movimientos(id) on delete set null,   -- resguardo con que se entregó
  entregado_at timestamptz,
  solicitante text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists solicitudes_estatus_idx on public.solicitudes (empresa_id, estatus);
alter table public.solicitudes enable row level security;
create policy solicitudes_select on public.solicitudes for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy solicitudes_insert on public.solicitudes for insert to authenticated with check (privado.usuario_activo() and privado.tiene_empresa(empresa_id) and estatus = 'pendiente');
create policy solicitudes_update on public.solicitudes for update to authenticated
  using (privado.tiene_empresa(empresa_id) and (privado.puede_resguardar() or (created_by = auth.uid() and estatus = 'pendiente')))
  with check (privado.tiene_empresa(empresa_id) and (privado.puede_resguardar() or estatus = 'cancelada'));  -- quien solicita solo puede cancelar
