-- ───────────── 0021 · Carta de no adeudo, licencias de software, bajas con acta y checklist vehicular ─────────────
set lock_timeout = '8s';

-- ═════════════ A. Licencias de software y cuentas ═════════════
create table if not exists public.licencias_software (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nombre text not null,                                   -- Microsoft 365 Business Standard, ESET, AutoCAD…
  fabricante text,
  tipo text not null default 'suscripcion' check (tipo in ('suscripcion', 'perpetua', 'cuenta', 'dominio', 'otro')),
  asientos int check (asientos is null or asientos >= 0), -- null = sin límite
  fecha_inicio date,
  fecha_vencimiento date,
  renovacion_automatica boolean not null default false,
  proveedor text,
  referencia text,                                        -- contrato, no. de pedido o portal
  notas text,
  activo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists licencias_empresa_idx on public.licencias_software (empresa_id);
drop trigger if exists licencias_updated on public.licencias_software;
create trigger licencias_updated before update on public.licencias_software for each row execute function privado.tg_set_updated_at();
alter table public.licencias_software enable row level security;
drop policy if exists licencias_select on public.licencias_software;
drop policy if exists licencias_write on public.licencias_software;
create policy licencias_select on public.licencias_software for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy licencias_write on public.licencias_software for all to authenticated
  using (privado.puede_editar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));

create table if not exists public.licencia_asignaciones (
  id uuid primary key default gen_random_uuid(),
  licencia_id uuid not null references public.licencias_software(id) on delete cascade,
  empleado_id uuid references public.empleados(id) on delete set null,
  activo_id uuid references public.activos(id) on delete set null,   -- equipo donde está instalada
  cuenta text,                                                        -- correo o usuario
  asignada date not null default current_date,
  liberada date,
  notas text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (empleado_id is not null or activo_id is not null or coalesce(trim(cuenta), '') <> '')
);
create index if not exists licencia_asig_lic_idx on public.licencia_asignaciones (licencia_id) where liberada is null;
create index if not exists licencia_asig_emp_idx on public.licencia_asignaciones (empleado_id) where liberada is null;
alter table public.licencia_asignaciones enable row level security;
drop policy if exists licencia_asig_select on public.licencia_asignaciones;
drop policy if exists licencia_asig_write on public.licencia_asignaciones;
create policy licencia_asig_select on public.licencia_asignaciones for select to authenticated
  using (exists (select 1 from public.licencias_software l where l.id = licencia_id and privado.tiene_empresa(l.empresa_id)));
create policy licencia_asig_write on public.licencia_asignaciones for all to authenticated
  using (privado.puede_editar() and exists (select 1 from public.licencias_software l where l.id = licencia_id and privado.tiene_empresa(l.empresa_id)))
  with check (privado.puede_editar() and exists (select 1 from public.licencias_software l where l.id = licencia_id and privado.tiene_empresa(l.empresa_id)));

-- No asignar más lugares de los que tiene la licencia
create or replace function privado.tg_licencia_cupo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_asientos int; v_usados int;
begin
  if new.liberada is not null then return new; end if;
  select asientos into v_asientos from public.licencias_software where id = new.licencia_id;
  if v_asientos is null then return new; end if;
  select count(*) into v_usados from public.licencia_asignaciones where licencia_id = new.licencia_id and liberada is null and id <> new.id;
  if v_usados >= v_asientos then raise exception 'La licencia ya no tiene lugares libres (% de %)', v_usados, v_asientos; end if;
  return new;
end $$;
drop trigger if exists licencia_cupo on public.licencia_asignaciones;
create trigger licencia_cupo before insert or update of liberada, licencia_id on public.licencia_asignaciones for each row execute function privado.tg_licencia_cupo();

create or replace view public.v_licencias with (security_invoker = true) as
select l.*, coalesce(e.nombre_corto, e.nombre) as empresa,
       (select count(*) from public.licencia_asignaciones x where x.licencia_id = l.id and x.liberada is null)::int as usados,
       (l.fecha_vencimiento - current_date) as dias_restantes
from public.licencias_software l join public.empresas e on e.id = l.empresa_id;
grant select on public.v_licencias to authenticated;
revoke all on public.v_licencias from anon;

-- ═════════════ B. Bajas de activos con acta ═════════════
create sequence if not exists public.bajas_seq;
create table if not exists public.bajas_activos (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('BAJ-' || lpad(nextval('public.bajas_seq')::text, 5, '0')),
  activo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  motivo text not null check (motivo in ('obsolescencia', 'dano_irreparable', 'robo', 'extravio', 'siniestro', 'venta_donacion', 'otro')),
  descripcion text not null,
  referencia text,                         -- no. de denuncia, acta, póliza o dictamen
  destino text,                            -- reciclaje, chatarra, aseguradora, donación…
  fotos jsonb not null default '[]'::jsonb,
  estatus text not null default 'pendiente' check (estatus in ('pendiente', 'autorizada', 'rechazada')),
  solicitado_por uuid references auth.users(id) on delete set null default auth.uid(),
  autorizado_por uuid references auth.users(id) on delete set null,
  autorizado_at timestamptz,
  respuesta text,
  estatus_anterior text,
  responsable_anterior uuid references public.empleados(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists bajas_empresa_idx on public.bajas_activos (empresa_id, estatus);
create unique index if not exists bajas_una_pendiente on public.bajas_activos (activo_id) where estatus = 'pendiente';
alter table public.bajas_activos enable row level security;
drop policy if exists bajas_select on public.bajas_activos;
drop policy if exists bajas_insert on public.bajas_activos;
create policy bajas_select on public.bajas_activos for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy bajas_insert on public.bajas_activos for insert to authenticated
  with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id) and estatus = 'pendiente');

-- Al pedir la baja: el equipo debe existir, no estar dado de baja y, si alguien lo tiene, solo por robo, extravío, siniestro o daño
create or replace function privado.tg_baja_validar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.activos%rowtype;
begin
  select * into a from public.activos where id = new.activo_id;
  if a.id is null then raise exception 'Activo no encontrado'; end if;
  if a.estatus = 'baja' then raise exception 'Este activo ya está dado de baja'; end if;
  if jsonb_typeof(new.fotos) <> 'array' or jsonb_array_length(new.fotos) > 6 then raise exception 'Máximo 6 fotos'; end if;
  if length(new.fotos::text) > 4000000 then raise exception 'Las fotos pesan demasiado'; end if;
  if a.estatus = 'asignado' and new.motivo not in ('robo', 'extravio', 'siniestro', 'dano_irreparable') then
    raise exception 'El activo está asignado: primero recíbelo con una devolución';
  end if;
  new.empresa_id := a.empresa_id;
  new.estatus := 'pendiente';
  return new;
end $$;
drop trigger if exists baja_validar on public.bajas_activos;
create trigger baja_validar before insert on public.bajas_activos for each row execute function privado.tg_baja_validar();

-- Autorizar o rechazar (solo supervisor o administrador)
create or replace function public.resolver_baja(p_id uuid, p_autorizar boolean, p_respuesta text)
returns text language plpgsql security definer set search_path = '' as $$
declare b public.bajas_activos%rowtype; a public.activos%rowtype;
begin
  if not privado.puede_editar() then raise exception 'Solo un supervisor o administrador puede autorizar bajas'; end if;
  select * into b from public.bajas_activos where id = p_id for update;
  if b.id is null or not privado.tiene_empresa(b.empresa_id) then raise exception 'Baja no encontrada'; end if;
  if b.estatus <> 'pendiente' then raise exception 'Esta baja ya fue resuelta'; end if;
  if not p_autorizar then
    update public.bajas_activos set estatus = 'rechazada', autorizado_por = auth.uid(), autorizado_at = now(), respuesta = nullif(trim(p_respuesta), '') where id = p_id;
    return b.folio;
  end if;
  select * into a from public.activos where id = b.activo_id for update;
  update public.bajas_activos set estatus = 'autorizada', autorizado_por = auth.uid(), autorizado_at = now(), respuesta = nullif(trim(p_respuesta), ''),
    estatus_anterior = a.estatus::text, responsable_anterior = a.responsable_id where id = p_id;
  update public.activos set estatus = 'baja', responsable_id = null,
    notas = trim(coalesce(notas, '') || E'\n' || 'Baja ' || b.folio || ' (' || to_char(current_date, 'DD/MM/YYYY') || ')') where id = b.activo_id;
  update public.licencia_asignaciones set liberada = current_date, notas = trim(coalesce(notas, '') || ' Liberada por baja ' || b.folio)
    where activo_id = b.activo_id and liberada is null;
  return b.folio;
end $$;
grant execute on function public.resolver_baja(uuid, boolean, text) to authenticated;
revoke execute on function public.resolver_baja(uuid, boolean, text) from anon;

-- ═════════════ C. Carta de no adeudo de equipo ═════════════
create sequence if not exists public.cartas_no_adeudo_seq;
create table if not exists public.cartas_no_adeudo (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('CNA-' || lpad(nextval('public.cartas_no_adeudo_seq')::text, 5, '0')),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  devueltos jsonb not null default '[]'::jsonb,   -- [{"codigo","descripcion","fecha"}] lo que entregó en sus últimos 90 días
  observaciones text,
  emitida_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists cartas_empleado_idx on public.cartas_no_adeudo (empleado_id);
alter table public.cartas_no_adeudo enable row level security;
drop policy if exists cartas_select on public.cartas_no_adeudo;
create policy cartas_select on public.cartas_no_adeudo for select to authenticated using (privado.tiene_empresa(empresa_id));

-- Solo se emite si el empleado no tiene activos ni licencias a su nombre. Opcional: darlo de baja en el mismo paso.
create or replace function public.emitir_carta_no_adeudo(p_empleado uuid, p_observaciones text, p_dar_baja boolean, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.empleados%rowtype; v_act int; v_lic int; v_id uuid; v_dev jsonb;
begin
  if not privado.puede_resguardar() then raise exception 'No tienes permiso para emitir cartas'; end if;
  select * into e from public.empleados where id = p_empleado;
  if e.id is null or not privado.tiene_empresa(e.empresa_id) then raise exception 'Empleado no encontrado'; end if;
  select count(*) into v_act from public.activos where responsable_id = p_empleado and estatus <> 'baja';
  if v_act > 0 then raise exception 'Todavía tiene % activo(s) a su cargo', v_act; end if;
  select count(*) into v_lic from public.licencia_asignaciones where empleado_id = p_empleado and liberada is null;
  if v_lic > 0 then raise exception 'Todavía tiene % licencia(s) o cuenta(s) a su nombre', v_lic; end if;
  select coalesce(jsonb_agg(jsonb_build_object('codigo', a.codigo, 'descripcion', a.descripcion, 'fecha', m.fecha) order by m.fecha desc), '[]'::jsonb)
    into v_dev
  from public.movimiento_activos x
  join public.movimientos m on m.id = x.movimiento_id and not m.cancelado and m.tipo in ('devolucion', 'traspaso') and m.fecha > now() - interval '90 days'
  join public.activos a on a.id = x.activo_id
  where x.responsable_anterior_id = p_empleado;
  insert into public.cartas_no_adeudo (empleado_id, empresa_id, devueltos, observaciones)
  values (p_empleado, e.empresa_id, v_dev, nullif(trim(p_observaciones), '')) returning id into v_id;
  if p_dar_baja and e.activo then
    update public.empleados set activo = false, fecha_baja = current_date, motivo_baja = coalesce(nullif(trim(p_motivo), ''), motivo_baja) where id = p_empleado;
  end if;
  return v_id;
end $$;
grant execute on function public.emitir_carta_no_adeudo(uuid, text, boolean, text) to authenticated;
revoke execute on function public.emitir_carta_no_adeudo(uuid, text, boolean, text) from anon;

-- ═════════════ D. Checklist vehicular desde el celular ═════════════
alter table public.checklists add column if not exists fotos jsonb not null default '[]'::jsonb;   -- [{"lado":"Frente","foto":"data:…"}]
alter table public.checklists add column if not exists golpes jsonb not null default '[]'::jsonb;  -- [{"zona":"Puerta izquierda","nota":"…"}]
alter table public.checklists add column if not exists combustible int check (combustible is null or combustible between 0 and 100);
alter table public.checklists add column if not exists empleado_id uuid references public.empleados(id) on delete set null;

create or replace function public.registrar_checklist_vehicular(p_activo uuid, p_operador text, p_empleado uuid, p_lectura numeric,
  p_combustible int, p_respuestas jsonb, p_golpes jsonb, p_fotos jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v_empresa uuid; v_tipo text; v_ok boolean; v_fallas text; v_golpes text; v_rep uuid; v_folio text; v_ultima numeric; v_desc text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if coalesce(trim(p_operador), '') = '' then raise exception 'Escribe el nombre del operador'; end if;
  if jsonb_typeof(p_respuestas) <> 'array' or jsonb_array_length(p_respuestas) = 0 or jsonb_array_length(p_respuestas) > 40 then raise exception 'Checklist incompleto'; end if;
  if jsonb_typeof(coalesce(p_golpes, '[]')) <> 'array' or jsonb_typeof(coalesce(p_fotos, '[]')) <> 'array' or jsonb_array_length(coalesce(p_fotos, '[]')) > 8 then raise exception 'Datos inválidos'; end if;
  if length(coalesce(p_fotos, '[]')::text) > 5000000 then raise exception 'Las fotos pesan demasiado'; end if;
  select a.id, a.empresa_id, case when c.nombre ilike '%maquinaria%' then 'horas' else 'km' end into p_activo, v_empresa, v_tipo
  from public.activos a join public.categorias c on c.id = a.categoria_id where a.id = p_activo and a.estatus <> 'baja';
  if p_activo is null or not privado.tiene_empresa(v_empresa) then raise exception 'Vehículo no encontrado'; end if;
  if p_lectura is not null then
    select max(valor) into v_ultima from public.lecturas where activo_id = p_activo and tipo = v_tipo;
    if v_ultima is not null and p_lectura < v_ultima then raise exception 'El % (%) es menor al último registrado (%)', case when v_tipo = 'km' then 'kilometraje' else 'horómetro' end, p_lectura, v_ultima; end if;
  end if;
  select bool_and(coalesce((r->>'ok')::boolean, false)), string_agg(r->>'punto' || coalesce(': ' || nullif(r->>'nota', ''), ''), '; ') filter (where not coalesce((r->>'ok')::boolean, false))
    into v_ok, v_fallas from jsonb_array_elements(p_respuestas) r;
  select string_agg(g->>'zona' || coalesce(': ' || nullif(g->>'nota', ''), ''), '; ') into v_golpes from jsonb_array_elements(coalesce(p_golpes, '[]')) g;
  if not v_ok or v_golpes is not null then
    v_desc := 'Checklist vehicular: ' || concat_ws(' · ', v_fallas, case when v_golpes is not null then 'Golpes nuevos: ' || v_golpes end);
    insert into public.reportes (activo_id, empresa_id, tipo, prioridad, descripcion, foto, reporta_nombre, reportado_por)
    values (p_activo, v_empresa, case when v_ok then 'dano' else 'falla' end, 'media', v_desc,
            (select f->>'foto' from jsonb_array_elements(coalesce(p_fotos, '[]')) f limit 1), trim(p_operador), auth.uid())
    returning id, folio into v_rep, v_folio;
  end if;
  insert into public.checklists (activo_id, empresa_id, operador, empleado_id, lectura, combustible, respuestas, golpes, fotos, todo_ok, reporte_id, registrado_por)
  values (p_activo, v_empresa, trim(p_operador), p_empleado, p_lectura, p_combustible, p_respuestas, coalesce(p_golpes, '[]'), coalesce(p_fotos, '[]'),
          v_ok and v_golpes is null, v_rep, auth.uid());
  if p_lectura is not null and p_lectura >= 0 then
    insert into public.lecturas (activo_id, empresa_id, tipo, valor, origen, registrado_por, nota)
    values (p_activo, v_empresa, v_tipo, p_lectura, 'checklist', auth.uid(), 'Checklist de ' || trim(p_operador));
  end if;
  return coalesce(v_folio, 'ok');
end $$;
grant execute on function public.registrar_checklist_vehicular(uuid, text, uuid, numeric, int, jsonb, jsonb, jsonb) to authenticated;
revoke execute on function public.registrar_checklist_vehicular(uuid, text, uuid, numeric, int, jsonb, jsonb, jsonb) from anon;

-- Nombres de los usuarios (para mostrar quién pidió, autorizó o emitió). Sin correos ni roles.
create or replace function public.nombres_usuarios()
returns table (id uuid, nombre text) language sql stable security definer set search_path = '' as $$
  select p.id, p.nombre from public.perfiles p where auth.uid() is not null
$$;
revoke execute on function public.nombres_usuarios() from public, anon;
grant execute on function public.nombres_usuarios() to authenticated;

select 'ok' as resultado;
