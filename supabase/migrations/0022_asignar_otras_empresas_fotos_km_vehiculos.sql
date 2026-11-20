-- ───────────── 0022 · Asignar a empleados de cualquier empresa, fotos y km de vehículos para todos los usuarios ─────────────
set lock_timeout = '8s';

-- A. Resguardos: el empleado puede ser de otra empresa del grupo
create or replace function public.registrar_movimiento(
  p_tipo public.tipo_movimiento,
  p_empresa uuid,
  p_activos uuid[],
  p_a_empleado uuid default null,
  p_a_ubicacion uuid default null,
  p_entrega_nombre text default null,
  p_recibe_nombre text default null,
  p_notas text default null,
  p_estados jsonb default '{}'::jsonb   -- { "<activo_id>": "estado físico" }
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_a record;
  v_n int;
begin
  if not privado.puede_resguardar() then raise exception 'No tienes permiso para registrar resguardos'; end if;
  if not privado.tiene_empresa(p_empresa) then raise exception 'No tienes acceso a esa empresa'; end if;
  if p_activos is null or cardinality(p_activos) = 0 then raise exception 'Selecciona al menos un activo'; end if;

  -- El equipo puede quedar a cargo de un empleado de otra empresa del grupo (a la que el usuario tenga acceso)
  if p_a_empleado is not null and not exists (select 1 from public.empleados where id = p_a_empleado and activo and privado.tiene_empresa(empresa_id)) then
    raise exception 'Empleado no encontrado o dado de baja';
  end if;
  if p_a_ubicacion is not null and not exists (select 1 from public.ubicaciones where id = p_a_ubicacion and empresa_id = p_empresa and activo) then
    raise exception 'La ubicación no pertenece a la empresa';
  end if;

  if p_tipo = 'asignacion' and p_a_empleado is null then raise exception 'La asignación necesita a quién se entrega'; end if;
  if p_tipo = 'devolucion' and p_a_ubicacion is null then raise exception 'La devolución necesita a dónde regresa el activo'; end if;
  if p_tipo = 'traspaso' and p_a_empleado is null and p_a_ubicacion is null then raise exception 'El traspaso necesita un nuevo responsable o una nueva ubicación'; end if;

  select count(*) into v_n from public.activos where id = any(p_activos) and empresa_id = p_empresa;
  if v_n <> cardinality(p_activos) then raise exception 'Todos los activos deben ser de la misma empresa'; end if;

  for v_a in select id, codigo, estatus from public.activos where id = any(p_activos) for update loop
    if p_tipo = 'asignacion' and v_a.estatus <> 'disponible' then
      raise exception '% no está disponible (estatus: %)', v_a.codigo, v_a.estatus;
    elsif p_tipo = 'devolucion' and v_a.estatus <> 'asignado' then
      raise exception '% no está asignado', v_a.codigo;
    elsif p_tipo = 'traspaso' and v_a.estatus in ('baja','siniestrado') then
      raise exception '% está en %', v_a.codigo, v_a.estatus;
    end if;
  end loop;

  insert into public.movimientos (tipo, empresa_id, a_empleado_id, a_ubicacion_id, entrega_nombre, recibe_nombre, notas)
  values (p_tipo, p_empresa, p_a_empleado, p_a_ubicacion, nullif(trim(p_entrega_nombre),''), nullif(trim(p_recibe_nombre),''), nullif(trim(p_notas),''))
  returning id into v_id;

  insert into public.movimiento_activos (movimiento_id, activo_id, responsable_anterior_id, ubicacion_anterior_id, estatus_anterior, estado_fisico)
  select v_id, a.id, a.responsable_id, a.ubicacion_id, a.estatus, nullif(trim(p_estados ->> a.id::text), '')
  from public.activos a where a.id = any(p_activos);

  update public.activos a set
    responsable_id = case
      when p_tipo = 'asignacion' then p_a_empleado
      when p_tipo = 'devolucion' then null
      else coalesce(p_a_empleado, a.responsable_id) end,
    ubicacion_id = coalesce(p_a_ubicacion, a.ubicacion_id),
    estatus = case
      when p_tipo = 'asignacion' then 'asignado'::public.estatus_activo
      when p_tipo = 'devolucion' then 'disponible'::public.estatus_activo
      when p_a_empleado is not null and a.estatus = 'disponible' then 'asignado'::public.estatus_activo
      else a.estatus end
  where a.id = any(p_activos);

  return v_id;
end $$;

-- B. Vehículos: cualquier usuario activo con acceso a la empresa (también Consulta) sube fotos y registra kilometraje
drop policy if exists activos_storage_insert_vehiculo on storage.objects;
create policy activos_storage_insert_vehiculo on storage.objects for insert to authenticated
  with check (bucket_id = 'activos' and privado.usuario_activo() and privado.tiene_empresa(((storage.foldername(name))[1])::uuid)
    and exists (select 1 from public.activos a join public.categorias c on c.id = a.categoria_id
                where a.id::text = (storage.foldername(name))[2] and c.es_vehiculo and a.estatus <> 'baja'));

drop policy if exists fotos_insert_vehiculo on public.activo_fotos;
create policy fotos_insert_vehiculo on public.activo_fotos for insert to authenticated
  with check (privado.usuario_activo() and exists (select 1 from public.activos a join public.categorias c on c.id = a.categoria_id
              where a.id = activo_id and c.es_vehiculo and a.estatus <> 'baja' and privado.tiene_empresa(a.empresa_id)));

drop policy if exists lecturas_insert_vehiculo on public.lecturas;
create policy lecturas_insert_vehiculo on public.lecturas for insert to authenticated
  with check (privado.usuario_activo() and privado.tiene_empresa(empresa_id) and exists (select 1 from public.activos a join public.categorias c on c.id = a.categoria_id
              where a.id = activo_id and a.empresa_id = lecturas.empresa_id and c.es_vehiculo and a.estatus <> 'baja'));

-- La primera foto que se sube queda como foto principal del activo
create or replace function privado.tg_foto_principal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.activos set foto_principal = new.path where id = new.activo_id and foto_principal is null;
  return new;
end $$;
drop trigger if exists foto_principal on public.activo_fotos;
create trigger foto_principal after insert on public.activo_fotos for each row execute function privado.tg_foto_principal();

-- El kilometraje del vehículo se actualiza con cada lectura nueva (checklist, manual, orden de trabajo)
create or replace function privado.tg_lectura_km_vehiculo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'km' then
    update public.activo_vehiculo set kilometraje = new.valor where activo_id = new.activo_id and (kilometraje is null or kilometraje < new.valor);
  end if;
  return new;
end $$;
drop trigger if exists lectura_km_vehiculo on public.lecturas;
create trigger lectura_km_vehiculo after insert on public.lecturas for each row execute function privado.tg_lectura_km_vehiculo();

select 'ok' as resultado;
