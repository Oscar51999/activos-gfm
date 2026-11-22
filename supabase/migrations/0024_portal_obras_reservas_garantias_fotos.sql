-- ───────────── 0024 · Mis equipos, permisos por obra, reservas, garantías y fotos en entregas/devoluciones ─────────────
set lock_timeout = '8s';

-- ═════════════ Base: el empleado ligado al usuario ═════════════
create or replace function privado.mi_empleado()
returns uuid language sql stable security definer set search_path = '' as $$
  select empleado_id from public.perfiles where id = auth.uid() and activo
$$;
grant execute on function privado.mi_empleado() to authenticated;

-- ═════════════ A. Permisos por obra ═════════════
-- Si un usuario tiene obras asignadas aquí, solo ve y mueve el equipo de esas obras (y el que tenga a su nombre). Sin renglones = sin restricción.
create table if not exists public.perfil_ubicaciones (
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete cascade,
  primary key (perfil_id, ubicacion_id)
);
alter table public.perfil_ubicaciones enable row level security;
drop policy if exists perfil_ubic_select on public.perfil_ubicaciones;
drop policy if exists perfil_ubic_write on public.perfil_ubicaciones;
create policy perfil_ubic_select on public.perfil_ubicaciones for select to authenticated using (perfil_id = auth.uid() or privado.es_admin());
create policy perfil_ubic_write on public.perfil_ubicaciones for all to authenticated using (privado.es_admin()) with check (privado.es_admin());

create or replace function privado.restringido_obras()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfil_ubicaciones where perfil_id = auth.uid())
$$;
create or replace function privado.ve_activo(p_ubicacion uuid, p_responsable uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.perfil_ubicaciones where perfil_id = auth.uid())
      or exists (select 1 from public.perfil_ubicaciones where perfil_id = auth.uid() and ubicacion_id = p_ubicacion)
      or (p_responsable is not null and p_responsable = (select empleado_id from public.perfiles where id = auth.uid()))
$$;
grant execute on function privado.restringido_obras() to authenticated;
grant execute on function privado.ve_activo(uuid, uuid) to authenticated;

drop policy if exists activos_select on public.activos;
drop policy if exists activos_update on public.activos;
create policy activos_select on public.activos for select to authenticated
  using (privado.tiene_empresa(empresa_id) and privado.ve_activo(ubicacion_id, responsable_id));
create policy activos_update on public.activos for update to authenticated
  using (privado.puede_editar() and privado.tiene_empresa(empresa_id) and privado.ve_activo(ubicacion_id, responsable_id))
  with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));

-- Resguardos: un usuario restringido solo mueve equipo de sus obras y solo lo manda a sus obras
create or replace function privado.tg_obras_resguardo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a record; v_dest uuid;
begin
  if not exists (select 1 from public.perfil_ubicaciones where perfil_id = auth.uid()) then return new; end if;
  select ubicacion_id, responsable_id, codigo into a from public.activos where id = new.activo_id;
  if not exists (select 1 from public.perfil_ubicaciones where perfil_id = auth.uid() and ubicacion_id = a.ubicacion_id) then
    raise exception '% no está en una de tus obras', a.codigo;
  end if;
  select a_ubicacion_id into v_dest from public.movimientos where id = new.movimiento_id;
  if v_dest is not null and not exists (select 1 from public.perfil_ubicaciones where perfil_id = auth.uid() and ubicacion_id = v_dest) then
    raise exception 'Solo puedes mandar equipo a tus obras';
  end if;
  return new;
end $$;
drop trigger if exists obras_resguardo on public.movimiento_activos;
create trigger obras_resguardo before insert on public.movimiento_activos for each row execute function privado.tg_obras_resguardo();

-- ═════════════ B. Garantías y equipo que se puede reservar ═════════════
alter table public.activos add column if not exists garantia_hasta date;
alter table public.activos add column if not exists garantia_proveedor text;
alter table public.activos add column if not exists garantia_notas text;
alter table public.activos add column if not exists reservable boolean not null default false;
create index if not exists activos_garantia_idx on public.activos (garantia_hasta) where garantia_hasta is not null;

create or replace view public.v_activos with (security_invoker = true) as
 SELECT a.id, a.codigo, a.qr, a.descripcion, a.serie, a.numero_economico, a.estatus, a.valor_referencia, a.fecha_alta, a.foto_principal, a.updated_at,
    a.empresa_id, e.nombre AS empresa, a.categoria_id, c.nombre AS categoria, c.es_vehiculo, a.marca_id, m.nombre AS marca, a.modelo_id, mo.nombre AS modelo,
    a.ubicacion_id, u.nombre AS ubicacion, u.tipo AS ubicacion_tipo, a.responsable_id,
    TRIM(BOTH FROM ((COALESCE(emp.nombres, ''::text) || ' '::text) || COALESCE(emp.apellidos, ''::text))) AS responsable,
    v.placa, mo.foto_path AS modelo_foto, emp.puesto AS responsable_puesto,
    a.rfid_epc, a.posicion_id, p.codigo AS posicion, c.clase_abc, a.montado_en,
    a.garantia_hasta, a.garantia_proveedor, a.reservable
   FROM public.activos a
     JOIN public.empresas e ON e.id = a.empresa_id
     JOIN public.categorias c ON c.id = a.categoria_id
     LEFT JOIN public.marcas m ON m.id = a.marca_id
     LEFT JOIN public.modelos mo ON mo.id = a.modelo_id
     LEFT JOIN public.ubicaciones u ON u.id = a.ubicacion_id
     LEFT JOIN public.empleados emp ON emp.id = a.responsable_id
     LEFT JOIN public.activo_vehiculo v ON v.activo_id = a.id
     LEFT JOIN public.posiciones p ON p.id = a.posicion_id;
grant select on public.v_activos to authenticated;

-- ═════════════ C. Reservas de equipo compartido ═════════════
create extension if not exists btree_gist with schema extensions;
create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  activo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade default auth.uid(),
  para_quien text,
  inicio timestamptz not null,
  fin timestamptz not null,
  motivo text,
  estatus text not null default 'activa' check (estatus in ('activa', 'cancelada')),
  created_at timestamptz not null default now(),
  check (fin > inicio)
);
alter table public.reservas drop constraint if exists reservas_sin_choques;
alter table public.reservas add constraint reservas_sin_choques exclude using gist (activo_id with =, tstzrange(inicio, fin) with &&) where (estatus = 'activa');
create index if not exists reservas_fecha_idx on public.reservas (inicio, fin);
alter table public.reservas enable row level security;
drop policy if exists reservas_select on public.reservas;
drop policy if exists reservas_insert on public.reservas;
drop policy if exists reservas_update on public.reservas;
create policy reservas_select on public.reservas for select to authenticated using (privado.tiene_empresa(empresa_id) or perfil_id = auth.uid());
create policy reservas_insert on public.reservas for insert to authenticated
  with check (privado.usuario_activo() and perfil_id = auth.uid() and privado.tiene_empresa(empresa_id) and estatus = 'activa');
create policy reservas_update on public.reservas for update to authenticated
  using (perfil_id = auth.uid() or (privado.puede_resguardar() and privado.tiene_empresa(empresa_id)))
  with check (perfil_id = auth.uid() or (privado.puede_resguardar() and privado.tiene_empresa(empresa_id)));

create or replace function privado.tg_reserva()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select empresa_id, reservable, estatus, codigo into a from public.activos where id = new.activo_id;
  if a.empresa_id is null then raise exception 'Equipo no encontrado'; end if;
  if tg_op = 'INSERT' then
    if not a.reservable then raise exception '% no está marcado como equipo para reservar', a.codigo; end if;
    if a.estatus = 'baja' then raise exception '% está dado de baja', a.codigo; end if;
  end if;
  new.empresa_id := a.empresa_id;
  return new;
end $$;
drop trigger if exists reserva_validar on public.reservas;
create trigger reserva_validar before insert or update on public.reservas for each row execute function privado.tg_reserva();

-- Nombres de quien reservó (sin correos)
create or replace view public.v_reservas with (security_invoker = true) as
select r.*, a.codigo, a.descripcion, a.foto_principal, mo.foto_path as modelo_foto, c.nombre as categoria, p.nombre as reservo
from public.reservas r
join public.activos a on a.id = r.activo_id
join public.categorias c on c.id = a.categoria_id
left join public.modelos mo on mo.id = a.modelo_id
left join lateral (select nombre from public.nombres_usuarios() n where n.id = r.perfil_id) p on true;
grant select on public.v_reservas to authenticated;
revoke all on public.v_reservas from anon;

-- ═════════════ D. Fotos del estado al entregar y al recibir ═════════════
alter table public.movimiento_activos add column if not exists fotos jsonb not null default '[]'::jsonb;
create or replace function public.fotos_movimiento(p_mov uuid, p_fotos jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare m record; n int := 0; k text;
begin
  if not privado.puede_resguardar() then raise exception 'Sin permiso'; end if;
  select empresa_id into m from public.movimientos where id = p_mov;
  if m.empresa_id is null or not privado.tiene_empresa(m.empresa_id) then raise exception 'Resguardo no encontrado'; end if;
  if jsonb_typeof(p_fotos) <> 'object' or length(p_fotos::text) > 6000000 then raise exception 'Fotos inválidas o muy pesadas'; end if;
  for k in select jsonb_object_keys(p_fotos) loop
    update public.movimiento_activos set fotos = p_fotos -> k where movimiento_id = p_mov and activo_id::text = k;
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.fotos_movimiento(uuid, jsonb) to authenticated;
revoke execute on function public.fotos_movimiento(uuid, jsonb) from anon;

-- ═════════════ E. Portal "Mis equipos" ═════════════
-- Lo que el empleado ligado al usuario tiene a su cargo, aunque su usuario no tenga acceso a esa empresa
create or replace function public.mis_activos()
returns table (id uuid, codigo text, qr uuid, descripcion text, serie text, categoria text, marca text, modelo text, ubicacion text, estatus text, foto_principal text, modelo_foto text,
               empresa text, garantia_hasta date, desde timestamptz, folio text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.codigo, a.qr, a.descripcion, a.serie, c.nombre, ma.nombre, mo.nombre, u.nombre, a.estatus::text, a.foto_principal, mo.foto_path,
         coalesce(e.nombre_corto, e.nombre), a.garantia_hasta, ult.fecha, ult.folio
  from public.activos a
  join public.categorias c on c.id = a.categoria_id
  join public.empresas e on e.id = a.empresa_id
  left join public.marcas ma on ma.id = a.marca_id
  left join public.modelos mo on mo.id = a.modelo_id
  left join public.ubicaciones u on u.id = a.ubicacion_id
  left join lateral (select mv.fecha, mv.folio from public.movimiento_activos x join public.movimientos mv on mv.id = x.movimiento_id
                     where x.activo_id = a.id and not mv.cancelado and mv.a_empleado_id = a.responsable_id order by mv.fecha desc limit 1) ult on true
  where privado.mi_empleado() is not null and a.responsable_id = privado.mi_empleado() and a.estatus <> 'baja'
  order by a.codigo
$$;
grant execute on function public.mis_activos() to authenticated;
revoke execute on function public.mis_activos() from anon;

-- Resguardos que le falta firmar; genera el enlace de firma si no lo tiene
create or replace function public.mis_resguardos_por_firmar()
returns table (id uuid, folio text, fecha timestamptz, tipo text, activos int, token uuid)
language plpgsql security definer set search_path = '' as $$
declare v_emp uuid := privado.mi_empleado();
begin
  if v_emp is null then return; end if;
  update public.movimientos m set token_firma = gen_random_uuid()
   where m.a_empleado_id = v_emp and not m.cancelado and m.firma_recibe is null and m.token_firma is null and m.tipo in ('asignacion', 'traspaso');
  return query
    select m.id, m.folio, m.fecha, m.tipo::text, (select count(*)::int from public.movimiento_activos x where x.movimiento_id = m.id), m.token_firma
    from public.movimientos m
    where m.a_empleado_id = v_emp and not m.cancelado and m.firma_recibe is null and m.tipo in ('asignacion', 'traspaso')
    order by m.fecha desc;
end $$;
grant execute on function public.mis_resguardos_por_firmar() to authenticated;
revoke execute on function public.mis_resguardos_por_firmar() from anon;

create or replace function public.mis_licencias()
returns table (id uuid, licencia text, cuenta text, asignada date, vence date)
language sql stable security definer set search_path = '' as $$
  select x.id, l.nombre, x.cuenta, x.asignada, l.fecha_vencimiento from public.licencia_asignaciones x join public.licencias_software l on l.id = x.licencia_id
  where privado.mi_empleado() is not null and x.empleado_id = privado.mi_empleado() and x.liberada is null order by l.nombre
$$;
grant execute on function public.mis_licencias() to authenticated;
revoke execute on function public.mis_licencias() from anon;

select 'ok' as resultado;
