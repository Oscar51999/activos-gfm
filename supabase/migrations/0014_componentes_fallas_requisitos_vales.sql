-- Fase 7 · Ideas de SAP PM/EHS: componentes montados, catálogo de fallas, requisitos para operar y vales de salida.
set lock_timeout = '8s';

-- ───────────── 1. Componentes / aditamentos (estructura de equipo) ─────────────
alter table public.activos add column if not exists montado_en uuid references public.activos(id) on delete set null;
alter table public.activos drop constraint if exists activo_no_montado_en_si_mismo;
alter table public.activos add constraint activo_no_montado_en_si_mismo check (montado_en is null or montado_en <> id);
create index if not exists activos_montado_idx on public.activos (montado_en) where montado_en is not null;

create table if not exists public.montajes (
  id uuid primary key default gen_random_uuid(),
  componente_id uuid not null references public.activos(id) on delete cascade,
  equipo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  montado_at timestamptz not null default now(),
  desmontado_at timestamptz,
  lectura numeric(14,2),               -- horas/km del equipo al montar
  notas text,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index if not exists montajes_equipo_idx on public.montajes (equipo_id);
create index if not exists montajes_comp_idx on public.montajes (componente_id);
alter table public.montajes enable row level security;
create policy montajes_select on public.montajes for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy montajes_write on public.montajes for all to authenticated
  using (privado.puede_editar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));

-- ───────────── 2. Catálogo de fallas (daño / causa / acción) ─────────────
create table if not exists public.codigos_falla (
  id uuid primary key default gen_random_uuid(),
  grupo text not null check (grupo in ('dano', 'causa', 'accion')),
  codigo text not null,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (grupo, codigo)
);
alter table public.codigos_falla enable row level security;
create policy codigos_falla_select on public.codigos_falla for select to authenticated using (privado.usuario_activo());
create policy codigos_falla_write on public.codigos_falla for all to authenticated using (privado.puede_editar()) with check (privado.puede_editar());

alter table public.ordenes_trabajo add column if not exists dano_id uuid references public.codigos_falla(id) on delete set null;
alter table public.ordenes_trabajo add column if not exists causa_id uuid references public.codigos_falla(id) on delete set null;
alter table public.ordenes_trabajo add column if not exists accion_id uuid references public.codigos_falla(id) on delete set null;
alter table public.ordenes_trabajo add column if not exists paro boolean not null default true;   -- ¿el equipo quedó parado mientras duró la orden?

insert into public.codigos_falla (grupo, codigo, nombre) values
  ('dano', 'D01', 'Fuga de aceite o hidráulico'), ('dano', 'D02', 'Falla eléctrica'), ('dano', 'D03', 'No arranca'), ('dano', 'D04', 'Sobrecalentamiento'),
  ('dano', 'D05', 'Llanta o tren de rodaje'), ('dano', 'D06', 'Golpe o daño estructural'), ('dano', 'D07', 'Desgaste de pieza'), ('dano', 'D08', 'Pantalla o equipo de cómputo'),
  ('dano', 'D09', 'Calibración fuera de rango'), ('dano', 'D10', 'Ruido o vibración anormal'),
  ('causa', 'C01', 'Desgaste normal por uso'), ('causa', 'C02', 'Falta de mantenimiento'), ('causa', 'C03', 'Mala operación'), ('causa', 'C04', 'Defecto de fábrica'),
  ('causa', 'C05', 'Accidente o golpe'), ('causa', 'C06', 'Condiciones de obra (polvo, agua, calor)'), ('causa', 'C07', 'Pieza de mala calidad'), ('causa', 'C08', 'Causa desconocida'),
  ('accion', 'A01', 'Reemplazo de pieza'), ('accion', 'A02', 'Reparación en sitio'), ('accion', 'A03', 'Ajuste o calibración'), ('accion', 'A04', 'Limpieza y lubricación'),
  ('accion', 'A05', 'Envío a taller externo'), ('accion', 'A06', 'Garantía con proveedor'), ('accion', 'A07', 'Capacitación al operador')
on conflict (grupo, codigo) do nothing;

-- ───────────── 3. Requisitos para operar (calificación del operador) ─────────────
create table if not exists public.requisitos_operacion (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references public.categorias(id) on delete cascade,
  modelo_id uuid references public.modelos(id) on delete cascade,
  tipo_documento text not null check (tipo_documento in ('licencia_manejo', 'certificacion')),
  descripcion text not null,          -- ej. "Licencia tipo E", "DC-3 operador de retroexcavadora"
  bloquear boolean not null default true,   -- false = solo avisa
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  check (categoria_id is not null or modelo_id is not null)
);
alter table public.requisitos_operacion enable row level security;
create policy requisitos_select on public.requisitos_operacion for select to authenticated using (privado.usuario_activo());
create policy requisitos_write on public.requisitos_operacion for all to authenticated using (privado.puede_editar()) with check (privado.puede_editar());

-- ───────────── 4. Vales de salida (traslado entre obras, revisado en caseta) ─────────────
create sequence if not exists public.vales_seq;
create table if not exists public.vales_salida (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('VS-' || lpad(nextval('public.vales_seq')::text, 5, '0')),
  token uuid not null unique default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  origen_id uuid references public.ubicaciones(id) on delete set null,
  destino_id uuid references public.ubicaciones(id) on delete set null,
  activos uuid[] not null default '{}',
  material jsonb not null default '[]',   -- [{"descripcion":"…","cantidad":n}]
  transportista text,
  vehiculo text,                           -- placas o No. económico del vehículo que lo lleva
  motivo text,
  vigencia date not null default (current_date + 2),
  estatus text not null default 'emitido' check (estatus in ('emitido', 'en_transito', 'recibido', 'cancelado')),
  salida_at timestamptz, salida_por text,
  recibido_at timestamptz, recibido_por text, observaciones text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists vales_estatus_idx on public.vales_salida (empresa_id, estatus);
alter table public.vales_salida enable row level security;
create policy vales_select on public.vales_salida for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy vales_insert on public.vales_salida for insert to authenticated with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id) and estatus = 'emitido');
create policy vales_update on public.vales_salida for update to authenticated
  using (privado.puede_resguardar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));

-- Lo que ve vigilancia al escanear el QR del vale (sin cuenta)
create or replace function public.vale_por_token(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'folio', v.folio, 'estatus', v.estatus, 'vigencia', v.vigencia, 'motivo', v.motivo, 'transportista', v.transportista, 'vehiculo', v.vehiculo,
    'empresa', coalesce(e.nombre_corto, e.nombre), 'origen', o.nombre, 'destino', d.nombre, 'material', v.material,
    'salida_at', v.salida_at, 'salida_por', v.salida_por, 'recibido_at', v.recibido_at, 'recibido_por', v.recibido_por, 'emitido_at', v.created_at,
    'activos', coalesce((select jsonb_agg(jsonb_build_object('codigo', a.codigo, 'descripcion', a.descripcion, 'marca', ma.nombre, 'modelo', mo.nombre, 'serie', a.serie, 'eco', a.numero_economico, 'foto', mo.foto_path) order by a.codigo)
      from public.activos a left join public.marcas ma on ma.id = a.marca_id left join public.modelos mo on mo.id = a.modelo_id where a.id = any (v.activos)), '[]'::jsonb))
  from public.vales_salida v join public.empresas e on e.id = v.empresa_id
  left join public.ubicaciones o on o.id = v.origen_id left join public.ubicaciones d on d.id = v.destino_id
  where v.token = p_token
$$;

-- Vigilancia registra la salida en la caseta de origen o la llegada en destino. Al llegar, los activos quedan en el destino.
create or replace function public.marcar_vale(p_token uuid, p_accion text, p_nombre text, p_observaciones text)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.vales_salida%rowtype;
begin
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Escribe tu nombre'; end if;
  select * into v from public.vales_salida where token = p_token for update;
  if v.id is null then raise exception 'Vale no reconocido'; end if;
  if v.estatus = 'cancelado' then raise exception 'Este vale fue cancelado'; end if;
  if p_accion = 'salida' then
    if v.estatus <> 'emitido' then raise exception 'La salida ya se registró'; end if;
    if v.vigencia < current_date then raise exception 'El vale venció el %; pide uno nuevo', v.vigencia; end if;
    update public.vales_salida set estatus = 'en_transito', salida_at = now(), salida_por = left(trim(p_nombre), 120),
      observaciones = nullif(left(trim(coalesce(p_observaciones, '')), 500), '') where id = v.id;
    return 'Salida registrada';
  elsif p_accion = 'llegada' then
    if v.estatus = 'recibido' then raise exception 'La llegada ya se registró'; end if;
    update public.vales_salida set estatus = 'recibido', recibido_at = now(), recibido_por = left(trim(p_nombre), 120),
      salida_at = coalesce(salida_at, now()),
      observaciones = concat_ws(' · ', observaciones, nullif(left(trim(coalesce(p_observaciones, '')), 500), '')) where id = v.id;
    if v.destino_id is not null then
      update public.activos set ubicacion_id = v.destino_id where id = any (v.activos) and empresa_id = v.empresa_id and estatus <> 'baja';
    end if;
    return 'Llegada registrada';
  end if;
  raise exception 'Acción no válida';
end $$;
grant execute on function public.vale_por_token(uuid) to anon, authenticated;
grant execute on function public.marcar_vale(uuid, text, text, text) to anon, authenticated;
