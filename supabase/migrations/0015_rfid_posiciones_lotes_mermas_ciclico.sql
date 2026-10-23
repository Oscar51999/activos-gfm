-- Fase 8 · Inventario de clase mundial: RFID, posiciones en almacén, lotes y caducidad, mermas con aprobación,
-- repuestos para mantenimiento, conteo cíclico ABC y material en tránsito. Sin montos.
set lock_timeout = '8s';

-- ───────────── A. RFID y posiciones físicas ─────────────
alter table public.activos add column if not exists rfid_epc text;
create unique index if not exists activos_rfid_epc_uq on public.activos (rfid_epc) where rfid_epc is not null;

-- EPC de 96 bits (24 hex): prefijo "47464D" (GFM en ASCII) + número del código ACT en hexadecimal
create or replace function privado.epc_de_codigo(p_codigo text) returns text language sql immutable set search_path = '' as $$
  select '47464D' || lpad(upper(to_hex(nullif(substring(p_codigo from '\d+'), '')::bigint)), 18, '0')
$$;
create or replace function privado.tg_activo_epc() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.rfid_epc is null or new.rfid_epc = '' then new.rfid_epc := privado.epc_de_codigo(new.codigo); end if;
  new.rfid_epc := upper(new.rfid_epc);
  return new;
end $$;
drop trigger if exists activos_epc on public.activos;
create trigger activos_epc before insert or update of codigo, rfid_epc on public.activos for each row execute function privado.tg_activo_epc();
update public.activos set rfid_epc = privado.epc_de_codigo(codigo) where rfid_epc is null;

create table if not exists public.posiciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete cascade,
  pasillo text, rack text, nivel text, posicion text,
  codigo text not null,              -- ej. A-03-2-1
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (ubicacion_id, codigo)
);
alter table public.posiciones enable row level security;
create policy posiciones_select on public.posiciones for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy posiciones_write on public.posiciones for all to authenticated
  using (privado.puede_editar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));
alter table public.activos add column if not exists posicion_id uuid references public.posiciones(id) on delete set null;

-- dónde se guarda cada consumible dentro de un almacén
create table if not exists public.consumible_posiciones (
  consumible_id uuid not null references public.consumibles(id) on delete cascade,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete cascade,
  posicion_id uuid not null references public.posiciones(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  primary key (consumible_id, ubicacion_id)
);
alter table public.consumible_posiciones enable row level security;
create policy conspos_select on public.consumible_posiciones for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy conspos_write on public.consumible_posiciones for all to authenticated
  using (privado.puede_editar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));

-- ───────────── B. Lotes, caducidad, mermas ─────────────
alter table public.movimientos_consumible add column if not exists lote text;
alter table public.movimientos_consumible add column if not exists caducidad date;
alter table public.movimientos_consumible add column if not exists ot_id uuid references public.ordenes_trabajo(id) on delete set null;
alter table public.movimientos_consumible add column if not exists vale_id uuid references public.vales_salida(id) on delete set null;
alter table public.movimientos_consumible add column if not exists merma_id uuid;
create index if not exists movcons_ot_idx on public.movimientos_consumible (ot_id) where ot_id is not null;

create or replace view public.v_lotes with (security_invoker = true) as
select m.consumible_id, c.nombre, c.unidad, m.empresa_id, coalesce(e.nombre_corto, e.nombre) as empresa, m.ubicacion_id, u.nombre as ubicacion,
       m.lote, max(m.caducidad) as caducidad,
       sum(case when m.tipo = 'salida' then -m.cantidad else m.cantidad end) as existencia
from public.movimientos_consumible m
join public.consumibles c on c.id = m.consumible_id
join public.empresas e on e.id = m.empresa_id
left join public.ubicaciones u on u.id = m.ubicacion_id
where c.activo and (m.lote is not null or m.caducidad is not null)
group by m.consumible_id, c.nombre, c.unidad, m.empresa_id, e.nombre_corto, e.nombre, m.ubicacion_id, u.nombre, m.lote
having sum(case when m.tipo = 'salida' then -m.cantidad else m.cantidad end) <> 0;
grant select on public.v_lotes to authenticated;
revoke all on public.v_lotes from anon;

create sequence if not exists public.mermas_seq;
create table if not exists public.mermas (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('MER-' || lpad(nextval('public.mermas_seq')::text, 5, '0')),
  consumible_id uuid not null references public.consumibles(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ubicacion_id uuid references public.ubicaciones(id) on delete set null,
  lote text,
  cantidad numeric(12,2) not null check (cantidad > 0),
  motivo text not null check (motivo in ('dano', 'caducidad', 'extravio', 'calibracion', 'muestra', 'otro')),
  descripcion text,
  foto text,
  responsable_id uuid references public.empleados(id) on delete set null,   -- a quién se le imputa, si aplica
  estatus text not null default 'pendiente' check (estatus in ('pendiente', 'aprobada', 'rechazada')),
  respuesta text,
  solicitado_por uuid references auth.users(id) on delete set null default auth.uid(),
  solicitante text,
  resuelto_por uuid references auth.users(id) on delete set null,
  resuelto_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.mermas enable row level security;
create policy mermas_select on public.mermas for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy mermas_insert on public.mermas for insert to authenticated with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id) and estatus = 'pendiente');

create or replace function public.resolver_merma(p_id uuid, p_aprobar boolean, p_respuesta text)
returns text language plpgsql security definer set search_path = '' as $$
declare m public.mermas%rowtype;
begin
  select * into m from public.mermas where id = p_id for update;
  if m.id is null then raise exception 'Merma no encontrada'; end if;
  if not (privado.puede_editar() and privado.tiene_empresa(m.empresa_id)) then raise exception 'No tienes permiso para aprobar mermas'; end if;
  if m.estatus <> 'pendiente' then raise exception 'La merma ya fue resuelta'; end if;
  if m.solicitado_por = auth.uid() and not privado.es_admin() then raise exception 'Otra persona debe aprobar tu solicitud de merma'; end if;
  update public.mermas set estatus = case when p_aprobar then 'aprobada' else 'rechazada' end, respuesta = nullif(trim(coalesce(p_respuesta, '')), ''),
    resuelto_por = auth.uid(), resuelto_at = now() where id = m.id;
  if p_aprobar then
    insert into public.movimientos_consumible (consumible_id, empresa_id, ubicacion_id, tipo, cantidad, empleado_id, lote, merma_id, notas)
    values (m.consumible_id, m.empresa_id, m.ubicacion_id, 'ajuste', -m.cantidad, m.responsable_id, m.lote, m.id, 'Merma ' || m.folio || ' · ' || m.motivo);
  end if;
  return m.folio;
end $$;
grant execute on function public.resolver_merma(uuid, boolean, text) to authenticated;

-- ───────────── C. Repuestos para mantenimiento ─────────────
create table if not exists public.piezas_criticas (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid references public.modelos(id) on delete cascade,
  activo_id uuid references public.activos(id) on delete cascade,
  consumible_id uuid not null references public.consumibles(id) on delete cascade,
  cantidad_minima numeric(12,2) not null default 1,
  notas text,
  created_at timestamptz not null default now(),
  check (modelo_id is not null or activo_id is not null)
);
alter table public.piezas_criticas enable row level security;
create policy piezas_select on public.piezas_criticas for select to authenticated using (privado.usuario_activo());
create policy piezas_write on public.piezas_criticas for all to authenticated using (privado.puede_editar()) with check (privado.puede_editar());

-- ───────────── D. Conteo cíclico ABC ─────────────
alter table public.categorias add column if not exists clase_abc text not null default 'C' check (clase_abc in ('A', 'B', 'C'));
update public.categorias set clase_abc = 'A' where es_vehiculo or nombre ilike '%maquinaria%' or nombre ilike '%topograf%' or nombre ilike '%mputo%';
update public.categorias set clase_abc = 'B' where clase_abc = 'C' and (nombre ilike '%herramienta%' or nombre ilike '%telef%' or nombre ilike '%menor%');

create table if not exists public.conteos_ciclicos (
  id uuid primary key default gen_random_uuid(),
  activo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ubicacion_esperada_id uuid references public.ubicaciones(id) on delete set null,
  encontrado boolean not null,
  ubicacion_ok boolean,
  metodo text not null default 'manual' check (metodo in ('qr', 'rfid', 'manual')),
  notas text,
  contado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists conteos_activo_idx on public.conteos_ciclicos (activo_id, created_at desc);
alter table public.conteos_ciclicos enable row level security;
create policy conteos_select on public.conteos_ciclicos for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy conteos_insert on public.conteos_ciclicos for insert to authenticated with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));

create or replace view public.v_conteo_ciclico with (security_invoker = true) as
with ult as (
  select a.id, greatest(
    (select max(cc.created_at) from public.conteos_ciclicos cc where cc.activo_id = a.id),
    (select max(il.created_at) from public.inventario_lecturas il where il.activo_id = a.id)) as ultimo
  from public.activos a
)
select a.id as activo_id, a.codigo, a.descripcion, a.serie, a.rfid_epc, a.estatus, a.empresa_id, coalesce(e.nombre_corto, e.nombre) as empresa,
       a.ubicacion_id, u.nombre as ubicacion, p.codigo as posicion, c.nombre as categoria, c.clase_abc,
       case c.clase_abc when 'A' then 30 when 'B' then 90 else 180 end as cada_dias,
       ult.ultimo,
       (coalesce(ult.ultimo, a.created_at) + make_interval(days => case c.clase_abc when 'A' then 30 when 'B' then 90 else 180 end))::date as proximo,
       ma.nombre as marca, mo.nombre as modelo, mo.foto_path as modelo_foto, a.foto_principal,
       trim(coalesce(emp.nombres, '') || ' ' || coalesce(emp.apellidos, '')) as responsable,
       a.qr, a.numero_economico
from public.activos a
join ult on ult.id = a.id
join public.empresas e on e.id = a.empresa_id
join public.categorias c on c.id = a.categoria_id
left join public.ubicaciones u on u.id = a.ubicacion_id
left join public.posiciones p on p.id = a.posicion_id
left join public.marcas ma on ma.id = a.marca_id
left join public.modelos mo on mo.id = a.modelo_id
left join public.empleados emp on emp.id = a.responsable_id
where a.estatus <> 'baja';
grant select on public.v_conteo_ciclico to authenticated;
revoke all on public.v_conteo_ciclico from anon;

-- v_activos: agrega EPC, posición y clase ABC al final
create or replace view public.v_activos with (security_invoker = true) as
 SELECT a.id, a.codigo, a.qr, a.descripcion, a.serie, a.numero_economico, a.estatus, a.valor_referencia, a.fecha_alta, a.foto_principal, a.updated_at,
    a.empresa_id, e.nombre AS empresa, a.categoria_id, c.nombre AS categoria, c.es_vehiculo, a.marca_id, m.nombre AS marca, a.modelo_id, mo.nombre AS modelo,
    a.ubicacion_id, u.nombre AS ubicacion, u.tipo AS ubicacion_tipo, a.responsable_id,
    TRIM(BOTH FROM ((COALESCE(emp.nombres, ''::text) || ' '::text) || COALESCE(emp.apellidos, ''::text))) AS responsable,
    v.placa, mo.foto_path AS modelo_foto, emp.puesto AS responsable_puesto,
    a.rfid_epc, a.posicion_id, p.codigo AS posicion, c.clase_abc, a.montado_en
   FROM activos a
     JOIN empresas e ON e.id = a.empresa_id
     JOIN categorias c ON c.id = a.categoria_id
     LEFT JOIN marcas m ON m.id = a.marca_id
     LEFT JOIN modelos mo ON mo.id = a.modelo_id
     LEFT JOIN ubicaciones u ON u.id = a.ubicacion_id
     LEFT JOIN empleados emp ON emp.id = a.responsable_id
     LEFT JOIN activo_vehiculo v ON v.activo_id = a.id
     LEFT JOIN posiciones p ON p.id = a.posicion_id;

-- ───────────── E. Material en tránsito con los vales ─────────────
-- material: [{"consumible_id":…, "descripcion":"…", "cantidad":n, "lote":"…"}]; al emitir el vale sale del origen (lo registra la app),
-- al llegar entra al destino (aquí).
create or replace function public.marcar_vale(p_token uuid, p_accion text, p_nombre text, p_observaciones text)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.vales_salida%rowtype; it jsonb;
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
      update public.activos set ubicacion_id = v.destino_id, posicion_id = null where id = any (v.activos) and empresa_id = v.empresa_id and estatus <> 'baja';
      for it in select * from jsonb_array_elements(v.material) loop
        if it ? 'consumible_id' and (it ->> 'consumible_id') is not null then
          insert into public.movimientos_consumible (consumible_id, empresa_id, ubicacion_id, tipo, cantidad, lote, vale_id, notas)
          values ((it ->> 'consumible_id')::uuid, v.empresa_id, v.destino_id, 'entrada', (it ->> 'cantidad')::numeric, nullif(it ->> 'lote', ''), v.id, 'Llegó con el vale ' || v.folio);
        end if;
      end loop;
    end if;
    return 'Llegada registrada';
  end if;
  raise exception 'Acción no válida';
end $$;
grant execute on function public.marcar_vale(uuid, text, text, text) to anon, authenticated;

-- ═════════ F. Integraciones: incidentes que llegan de la mesa de ayuda ═════════
alter table public.reportes add column if not exists origen text not null default 'app';     -- app | qr | mesa_ayuda | otro sistema
alter table public.reportes add column if not exists ticket_externo text;                     -- número de ticket del otro sistema (evita duplicados)
create unique index if not exists reportes_ticket_externo_uq on public.reportes (ticket_externo) where ticket_externo is not null;
