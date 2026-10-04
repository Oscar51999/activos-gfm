-- Fase 3C · Control de personal: kits por puesto, baja de empleado, confirmación de resguardo y firma a distancia
-- por enlace, y traspasos entre empresas con aprobación.
set lock_timeout = '8s';

-- ───────────── Baja de empleado ─────────────
alter table public.empleados
  add column if not exists fecha_baja date,
  add column if not exists motivo_baja text;

-- ───────────── Kits por puesto ─────────────
create table if not exists public.kits (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  puesto text,                         -- puesto al que se sugiere
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.kits(id) on delete cascade,
  modelo_id uuid not null references public.modelos(id) on delete cascade,
  cantidad int not null default 1 check (cantidad between 1 and 50),
  unique (kit_id, modelo_id)
);
alter table public.kits enable row level security;
alter table public.kit_items enable row level security;
create policy kits_select on public.kits for select to authenticated using (privado.usuario_activo());
create policy kits_write on public.kits for all to authenticated using (privado.puede_editar()) with check (privado.puede_editar());
create policy kit_items_select on public.kit_items for select to authenticated using (privado.usuario_activo());
create policy kit_items_write on public.kit_items for all to authenticated using (privado.puede_editar()) with check (privado.puede_editar());

-- ───────────── Firma a distancia ─────────────
alter table public.movimientos
  add column if not exists token_firma uuid unique,
  add column if not exists firmado_remoto_at timestamptz;

-- Detalle mínimo de un resguardo para quien abre el enlace de firma (sin cuenta)
create or replace function public.resguardo_por_token(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'folio', m.folio, 'tipo', m.tipo, 'fecha', m.fecha, 'fecha_devolucion', m.fecha_devolucion,
    'empresa', coalesce(e.razon_social, e.nombre), 'recibe', m.recibe_nombre, 'entrega', m.entrega_nombre, 'notas', m.notas,
    'firmado', m.firma_recibe is not null,
    'activos', coalesce((select jsonb_agg(jsonb_build_object('codigo', a.codigo, 'descripcion', a.descripcion, 'marca', ma.nombre, 'modelo', mo.nombre,
                                  'serie', a.serie, 'estado', x.estado_fisico, 'foto', mo.foto_path) order by a.codigo)
                         from public.movimiento_activos x join public.activos a on a.id = x.activo_id
                         left join public.marcas ma on ma.id = a.marca_id left join public.modelos mo on mo.id = a.modelo_id
                         where x.movimiento_id = m.id), '[]'::jsonb))
  from public.movimientos m join public.empresas e on e.id = m.empresa_id
  where m.token_firma = p_token and not m.cancelado
$$;

create or replace function public.firmar_resguardo(p_token uuid, p_firma text, p_nombre text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_folio text;
begin
  if p_firma is null or p_firma not like 'data:image/png;base64,%' or length(p_firma) > 400000 then raise exception 'Firma no válida'; end if;
  select id, folio into v_id, v_folio from public.movimientos where token_firma = p_token and not cancelado and firma_recibe is null;
  if v_id is null then raise exception 'Este enlace ya se usó o no es válido'; end if;
  update public.movimientos set firma_recibe = p_firma, firmado_remoto_at = now(),
         recibe_nombre = coalesce(nullif(trim(p_nombre), ''), recibe_nombre), token_firma = null
  where id = v_id;
  return v_folio;
end $$;

-- ───────────── Confirmación periódica de resguardo ─────────────
create table if not exists public.confirmaciones (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  activos jsonb not null,                 -- foto de lo que tenía al pedirla: [{id,codigo,descripcion,marca,modelo,serie}]
  estatus text not null default 'pendiente' check (estatus in ('pendiente', 'confirmado', 'con_diferencias', 'cancelado')),
  comentario text,
  faltantes jsonb,                        -- códigos que dijo no tener
  firma text,
  respondido_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists confirmaciones_empleado_idx on public.confirmaciones (empleado_id);
alter table public.confirmaciones enable row level security;
create policy confirmaciones_select on public.confirmaciones for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy confirmaciones_insert on public.confirmaciones for insert to authenticated with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));
create policy confirmaciones_update on public.confirmaciones for update to authenticated
  using (privado.puede_resguardar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));

create or replace function public.confirmacion_por_token(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('empleado', trim(coalesce(emp.nombres,'') || ' ' || coalesce(emp.apellidos,'')), 'empresa', coalesce(e.nombre_corto, e.nombre),
                            'activos', c.activos, 'estatus', c.estatus, 'fecha', c.created_at)
  from public.confirmaciones c join public.empleados emp on emp.id = c.empleado_id join public.empresas e on e.id = c.empresa_id
  where c.token = p_token and c.estatus <> 'cancelado'
$$;

create or replace function public.responder_confirmacion(p_token uuid, p_faltantes jsonb, p_comentario text, p_firma text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_firma is not null and (p_firma not like 'data:image/png;base64,%' or length(p_firma) > 400000) then raise exception 'Firma no válida'; end if;
  select id into v_id from public.confirmaciones where token = p_token and estatus = 'pendiente';
  if v_id is null then raise exception 'Esta confirmación ya se respondió o no es válida'; end if;
  update public.confirmaciones set
    estatus = case when coalesce(jsonb_array_length(p_faltantes), 0) > 0 or coalesce(trim(p_comentario), '') <> '' then 'con_diferencias' else 'confirmado' end,
    faltantes = case when coalesce(jsonb_array_length(p_faltantes), 0) > 0 then p_faltantes end,
    comentario = nullif(trim(left(p_comentario, 1000)), ''), firma = p_firma, respondido_at = now()
  where id = v_id;
  return 'ok';
end $$;

grant execute on function public.resguardo_por_token(uuid), public.firmar_resguardo(uuid, text, text),
  public.confirmacion_por_token(uuid), public.responder_confirmacion(uuid, jsonb, text, text) to anon, authenticated;

-- ───────────── Traspasos entre empresas ─────────────
create sequence if not exists public.traspasos_empresa_seq;
create table if not exists public.traspasos_empresa (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('TRE-' || lpad(nextval('public.traspasos_empresa_seq')::text, 5, '0')),
  de_empresa_id uuid not null references public.empresas(id),
  a_empresa_id uuid not null references public.empresas(id),
  a_ubicacion_id uuid references public.ubicaciones(id) on delete set null,
  activos uuid[] not null,
  motivo text,
  estatus text not null default 'pendiente' check (estatus in ('pendiente', 'aprobado', 'rechazado')),
  respuesta text,
  solicitado_por uuid references auth.users(id) on delete set null default auth.uid(),
  resuelto_por uuid references auth.users(id) on delete set null,
  resuelto_at timestamptz,
  created_at timestamptz not null default now(),
  check (de_empresa_id <> a_empresa_id)
);
alter table public.traspasos_empresa enable row level security;
create policy tre_select on public.traspasos_empresa for select to authenticated using (privado.tiene_empresa(de_empresa_id) or privado.tiene_empresa(a_empresa_id));
create policy tre_insert on public.traspasos_empresa for insert to authenticated with check (privado.puede_editar() and privado.tiene_empresa(de_empresa_id));

-- Solo un administrador aprueba o rechaza; al aprobar, los activos cambian de empresa y quedan disponibles.
create or replace function public.resolver_traspaso_empresa(p_id uuid, p_aprobar boolean, p_respuesta text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.traspasos_empresa;
begin
  if not privado.es_admin() then raise exception 'Solo un administrador puede aprobar traspasos entre empresas'; end if;
  select * into t from public.traspasos_empresa where id = p_id and estatus = 'pendiente' for update;
  if t.id is null then raise exception 'La solicitud ya fue resuelta'; end if;
  if p_aprobar then
    if exists (select 1 from public.activos where id = any(t.activos) and (empresa_id <> t.de_empresa_id or estatus = 'asignado')) then
      raise exception 'Algún activo cambió de empresa o está asignado; devuélvelo antes de traspasar';
    end if;
    update public.activos set empresa_id = t.a_empresa_id, ubicacion_id = t.a_ubicacion_id, responsable_id = null,
           estatus = case when estatus in ('baja', 'mantenimiento', 'siniestrado') then estatus else 'disponible' end
    where id = any(t.activos);
  end if;
  update public.traspasos_empresa set estatus = case when p_aprobar then 'aprobado' else 'rechazado' end,
         respuesta = nullif(trim(p_respuesta), ''), resuelto_por = auth.uid(), resuelto_at = now()
  where id = p_id;
end $$;
revoke execute on function public.resolver_traspaso_empresa(uuid, boolean, text) from public, anon;
grant execute on function public.resolver_traspaso_empresa(uuid, boolean, text) to authenticated;
