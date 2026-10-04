-- Fase 3A · Préstamos con fecha de regreso, reportes de falla desde el QR e inventario físico.
set lock_timeout = '8s';

-- ───────────── 1. Préstamos ─────────────
alter table public.movimientos add column if not exists fecha_devolucion date;  -- solo préstamos temporales

-- Activos asignados cuyo último movimiento fue un préstamo con fecha de regreso
create or replace view public.v_prestamos with (security_invoker = true) as
select a.id as activo_id, a.codigo, a.descripcion, a.serie, a.empresa_id, e.nombre as empresa,
       mo.nombre as modelo, ma2.nombre as marca, mo.foto_path as modelo_foto, a.foto_principal, c.nombre as categoria,
       m.id as movimiento_id, m.folio, m.fecha, m.fecha_devolucion,
       m.a_empleado_id as empleado_id, trim(coalesce(emp.nombres,'') || ' ' || coalesce(emp.apellidos,'')) as empleado,
       (m.fecha_devolucion - current_date) as dias_restantes
from public.activos a
join lateral (
  select mv.* from public.movimiento_activos x join public.movimientos mv on mv.id = x.movimiento_id
  where x.activo_id = a.id and not mv.cancelado order by mv.fecha desc limit 1
) m on true
join public.empresas e on e.id = a.empresa_id
join public.categorias c on c.id = a.categoria_id
left join public.modelos mo on mo.id = a.modelo_id
left join public.marcas ma2 on ma2.id = a.marca_id
left join public.empleados emp on emp.id = m.a_empleado_id
where a.estatus = 'asignado' and m.fecha_devolucion is not null and m.tipo in ('asignacion', 'traspaso');
grant select on public.v_prestamos to authenticated;
revoke all on public.v_prestamos from anon;

-- ───────────── 2. Reportes de falla ─────────────
create sequence if not exists public.reportes_folio_seq;
create table if not exists public.reportes (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('FAL-' || lpad(nextval('public.reportes_folio_seq')::text, 5, '0')),
  activo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  tipo text not null default 'falla' check (tipo in ('falla', 'dano', 'robo', 'extravio', 'otro')),
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  descripcion text not null,
  foto text,                             -- imagen comprimida (data URL)
  reporta_nombre text,                   -- quien reporta (aunque no tenga cuenta)
  reporta_contacto text,
  reportado_por uuid references auth.users(id) on delete set null default auth.uid(),
  estatus text not null default 'abierto' check (estatus in ('abierto', 'en_proceso', 'resuelto', 'descartado')),
  resolucion text,
  atendido_por uuid references auth.users(id) on delete set null,
  resuelto_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reportes_activo_idx on public.reportes (activo_id);
create index if not exists reportes_empresa_estatus_idx on public.reportes (empresa_id, estatus);
create trigger reportes_updated before update on public.reportes for each row execute function privado.tg_set_updated_at();
alter table public.reportes enable row level security;
create policy reportes_select on public.reportes for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy reportes_insert on public.reportes for insert to authenticated
  with check (privado.usuario_activo() and privado.tiene_empresa(empresa_id));
create policy reportes_update on public.reportes for update to authenticated
  using (privado.puede_resguardar() and privado.tiene_empresa(empresa_id))
  with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));

-- Datos mínimos de un activo por su QR, para quien escanea la etiqueta sin cuenta
create or replace function public.activo_por_qr(p_qr uuid)
returns table (codigo text, descripcion text, marca text, modelo text, empresa text, foto text)
language sql stable security definer set search_path = '' as $$
  select a.codigo, a.descripcion, m.nombre, mo.nombre, coalesce(e.nombre_corto, e.nombre), mo.foto_path
  from public.activos a
  join public.empresas e on e.id = a.empresa_id
  left join public.marcas m on m.id = a.marca_id
  left join public.modelos mo on mo.id = a.modelo_id
  where a.qr = p_qr and a.estatus <> 'baja'
$$;

-- Reporte desde la etiqueta QR (con o sin cuenta). Devuelve el folio.
create or replace function public.reportar_por_qr(p_qr uuid, p_tipo text, p_descripcion text, p_nombre text, p_contacto text, p_foto text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_activo uuid; v_empresa uuid; v_folio text;
begin
  if coalesce(trim(p_descripcion), '') = '' then raise exception 'Describe el problema'; end if;
  if length(p_descripcion) > 2000 or length(coalesce(p_foto, '')) > 1500000 then raise exception 'El reporte es demasiado grande'; end if;
  select id, empresa_id into v_activo, v_empresa from public.activos where qr = p_qr and estatus <> 'baja';
  if v_activo is null then raise exception 'Etiqueta no reconocida'; end if;
  -- límite simple contra abuso: máximo 5 reportes abiertos por activo en 24 h
  if (select count(*) from public.reportes where activo_id = v_activo and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Este activo ya tiene varios reportes recientes';
  end if;
  insert into public.reportes (activo_id, empresa_id, tipo, prioridad, descripcion, foto, reporta_nombre, reporta_contacto, reportado_por)
  values (v_activo, v_empresa, coalesce(nullif(p_tipo, ''), 'falla'),
          case when p_tipo in ('robo', 'extravio') then 'alta' else 'media' end,
          trim(p_descripcion), p_foto, nullif(trim(p_nombre), ''), nullif(trim(p_contacto), ''), auth.uid())
  returning folio into v_folio;
  return v_folio;
end $$;
grant execute on function public.activo_por_qr(uuid) to anon, authenticated;
grant execute on function public.reportar_por_qr(uuid, text, text, text, text, text) to anon, authenticated;

-- ───────────── 3. Inventario físico ─────────────
create sequence if not exists public.inventarios_folio_seq;
create table if not exists public.inventarios (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('INV-' || lpad(nextval('public.inventarios_folio_seq')::text, 4, '0')),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  ubicacion_id uuid references public.ubicaciones(id) on delete set null,   -- null = toda la empresa
  nombre text not null,
  estatus text not null default 'abierto' check (estatus in ('abierto', 'cerrado')),
  notas text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  cerrado_at timestamptz,
  resumen jsonb                                                             -- conteos al cerrar
);
create table if not exists public.inventario_lecturas (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references public.inventarios(id) on delete cascade,
  activo_id uuid references public.activos(id) on delete set null,
  leido text not null,                    -- lo que se escaneó o tecleó
  estado_fisico text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (inventario_id, activo_id)
);
create index if not exists inventarios_empresa_idx on public.inventarios (empresa_id);
create index if not exists inventario_lecturas_inv_idx on public.inventario_lecturas (inventario_id);
alter table public.inventarios enable row level security;
alter table public.inventario_lecturas enable row level security;
create policy inventarios_select on public.inventarios for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy inventarios_insert on public.inventarios for insert to authenticated with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));
create policy inventarios_update on public.inventarios for update to authenticated
  using (privado.puede_resguardar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));
create policy lecturas_select on public.inventario_lecturas for select to authenticated
  using (exists (select 1 from public.inventarios i where i.id = inventario_id and privado.tiene_empresa(i.empresa_id)));
create policy lecturas_insert on public.inventario_lecturas for insert to authenticated
  with check (exists (select 1 from public.inventarios i where i.id = inventario_id and i.estatus = 'abierto'
                      and privado.puede_resguardar() and privado.tiene_empresa(i.empresa_id)));
create policy lecturas_delete on public.inventario_lecturas for delete to authenticated
  using (exists (select 1 from public.inventarios i where i.id = inventario_id and i.estatus = 'abierto'
                 and privado.puede_resguardar() and privado.tiene_empresa(i.empresa_id)));
