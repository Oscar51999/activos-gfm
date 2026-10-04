-- Fase 4 · Mantenimiento y flotilla: planes preventivos (por días, km u horas), órdenes de trabajo,
-- lecturas de odómetro/horómetro y checklist diario del operador (también desde el QR sin cuenta).
-- Sin costos: solo control operativo.
set lock_timeout = '8s';

-- ───────────── Planes preventivos ─────────────
create table if not exists public.planes_mantenimiento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,                          -- ej. "Servicio de 10,000 km"
  modelo_id uuid references public.modelos(id) on delete cascade,   -- aplica a todas las unidades del producto…
  activo_id uuid references public.activos(id) on delete cascade,   -- …o a una sola unidad
  disparo text not null check (disparo in ('dias', 'km', 'horas')),
  intervalo int not null check (intervalo > 0),
  avisar_antes int not null default 0 check (avisar_antes >= 0),     -- días, km u horas antes
  tareas jsonb not null default '[]',            -- ["Cambio de aceite", "Filtro de aire", …]
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  check (modelo_id is not null or activo_id is not null)
);
alter table public.planes_mantenimiento enable row level security;
create policy planes_select on public.planes_mantenimiento for select to authenticated using (privado.usuario_activo());
create policy planes_write on public.planes_mantenimiento for all to authenticated using (privado.puede_editar()) with check (privado.puede_editar());

-- ───────────── Lecturas de uso (km / horas) ─────────────
create table if not exists public.lecturas (
  id uuid primary key default gen_random_uuid(),
  activo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('km', 'horas')),
  valor numeric(12,1) not null check (valor >= 0),
  fecha timestamptz not null default now(),
  origen text not null default 'manual' check (origen in ('manual', 'checklist', 'orden')),
  registrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  nota text
);
create index if not exists lecturas_activo_idx on public.lecturas (activo_id, fecha desc);
alter table public.lecturas enable row level security;
create policy lecturas_uso_select on public.lecturas for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy lecturas_uso_insert on public.lecturas for insert to authenticated with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));

-- ───────────── Órdenes de trabajo ─────────────
create sequence if not exists public.ordenes_trabajo_seq;
create table if not exists public.ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('OT-' || lpad(nextval('public.ordenes_trabajo_seq')::text, 5, '0')),
  activo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null default 'correctivo' check (tipo in ('preventivo', 'correctivo')),
  plan_id uuid references public.planes_mantenimiento(id) on delete set null,
  reporte_id uuid references public.reportes(id) on delete set null,
  titulo text not null,
  descripcion text,
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  estatus text not null default 'abierta' check (estatus in ('abierta', 'en_proceso', 'espera_refaccion', 'terminada', 'cancelada')),
  proveedor_id uuid references public.proveedores(id) on delete set null,   -- taller externo
  responsable text,                       -- mecánico o encargado
  fecha_programada date,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  lectura numeric(12,1),                  -- km u horas al hacer el servicio
  checklist jsonb not null default '[]',  -- [{"tarea": "...", "hecho": true}]
  fotos_antes jsonb not null default '[]',
  fotos_despues jsonb not null default '[]',
  refacciones text,                       -- qué se cambió (sin montos)
  notas_cierre text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ot_activo_idx on public.ordenes_trabajo (activo_id);
create index if not exists ot_estatus_idx on public.ordenes_trabajo (empresa_id, estatus);
create trigger ordenes_trabajo_updated before update on public.ordenes_trabajo for each row execute function privado.tg_set_updated_at();
alter table public.ordenes_trabajo enable row level security;
create policy ot_select on public.ordenes_trabajo for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy ot_insert on public.ordenes_trabajo for insert to authenticated with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));
create policy ot_update on public.ordenes_trabajo for update to authenticated
  using (privado.puede_resguardar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_resguardar() and privado.tiene_empresa(empresa_id));

-- ───────────── Checklist diario del operador ─────────────
create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  activo_id uuid not null references public.activos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  operador text not null,
  lectura numeric(12,1),
  respuestas jsonb not null,               -- [{"punto": "Llantas", "ok": true, "nota": ""}]
  todo_ok boolean not null,
  foto text,
  reporte_id uuid references public.reportes(id) on delete set null,
  registrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists checklists_activo_idx on public.checklists (activo_id, created_at desc);
alter table public.checklists enable row level security;
create policy checklists_select on public.checklists for select to authenticated using (privado.tiene_empresa(empresa_id));

-- Registrar checklist desde la app o desde la etiqueta QR (sin cuenta). Si algo falla, abre un reporte.
create or replace function public.registrar_checklist(p_qr uuid, p_operador text, p_lectura numeric, p_respuestas jsonb, p_foto text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_activo uuid; v_empresa uuid; v_tipo text; v_ok boolean; v_fallas text; v_rep uuid; v_folio text;
begin
  if coalesce(trim(p_operador), '') = '' then raise exception 'Escribe el nombre del operador'; end if;
  if jsonb_typeof(p_respuestas) <> 'array' or jsonb_array_length(p_respuestas) = 0 or jsonb_array_length(p_respuestas) > 40 then raise exception 'Checklist incompleto'; end if;
  if length(coalesce(p_foto, '')) > 1500000 then raise exception 'La foto es demasiado grande'; end if;
  select a.id, a.empresa_id, case when c.nombre ilike '%maquinaria%' then 'horas' else 'km' end
    into v_activo, v_empresa, v_tipo
  from public.activos a join public.categorias c on c.id = a.categoria_id where a.qr = p_qr and a.estatus <> 'baja';
  if v_activo is null then raise exception 'Etiqueta no reconocida'; end if;
  if (select count(*) from public.checklists where activo_id = v_activo and created_at > now() - interval '12 hours') >= 3 then
    raise exception 'Este equipo ya tiene checklist reciente';
  end if;
  select bool_and(coalesce((r->>'ok')::boolean, false)), string_agg(r->>'punto' || coalesce(': ' || nullif(r->>'nota', ''), ''), '; ') filter (where not coalesce((r->>'ok')::boolean, false))
    into v_ok, v_fallas from jsonb_array_elements(p_respuestas) r;
  if not v_ok then
    insert into public.reportes (activo_id, empresa_id, tipo, prioridad, descripcion, foto, reporta_nombre, reportado_por)
    values (v_activo, v_empresa, 'falla', 'media', 'Checklist diario: ' || v_fallas, p_foto, trim(p_operador), auth.uid())
    returning id, folio into v_rep, v_folio;
  end if;
  insert into public.checklists (activo_id, empresa_id, operador, lectura, respuestas, todo_ok, foto, reporte_id, registrado_por)
  values (v_activo, v_empresa, trim(p_operador), p_lectura, p_respuestas, v_ok, p_foto, v_rep, auth.uid());
  if p_lectura is not null and p_lectura >= 0 then
    insert into public.lecturas (activo_id, empresa_id, tipo, valor, origen, registrado_por, nota)
    values (v_activo, v_empresa, v_tipo, p_lectura, 'checklist', auth.uid(), 'Checklist de ' || trim(p_operador));
  end if;
  return coalesce(v_folio, 'ok');
end $$;
grant execute on function public.registrar_checklist(uuid, text, numeric, jsonb, text) to anon, authenticated;

-- ───────────── Programa de mantenimiento ─────────────
create or replace view public.v_mantenimiento with (security_invoker = true) as
select p.id as plan_id, p.nombre as plan, p.disparo, p.intervalo, p.avisar_antes, p.tareas,
       a.id as activo_id, a.codigo, a.descripcion, a.empresa_id, coalesce(e.nombre_corto, e.nombre) as empresa, a.estatus,
       ma.nombre as marca, mo.nombre as modelo, mo.foto_path as modelo_foto, a.foto_principal, c.nombre as categoria, a.numero_economico,
       u.fecha_ultimo, u.lectura_ultimo, l.valor as lectura_actual, l.fecha as lectura_fecha,
       case when p.disparo = 'dias' then (coalesce(u.fecha_ultimo::date, a.fecha_alta) + p.intervalo) end as proxima_fecha,
       case when p.disparo <> 'dias' then coalesce(u.lectura_ultimo, 0) + p.intervalo end as proxima_lectura,
       case when p.disparo = 'dias' then (coalesce(u.fecha_ultimo::date, a.fecha_alta) + p.intervalo) - current_date
            else (coalesce(u.lectura_ultimo, 0) + p.intervalo) - coalesce(l.valor, 0) end as restante,
       case when (case when p.disparo = 'dias' then (coalesce(u.fecha_ultimo::date, a.fecha_alta) + p.intervalo) - current_date
                       else (coalesce(u.lectura_ultimo, 0) + p.intervalo) - coalesce(l.valor, 0) end) < 0 then 'vencido'
            when (case when p.disparo = 'dias' then (coalesce(u.fecha_ultimo::date, a.fecha_alta) + p.intervalo) - current_date
                       else (coalesce(u.lectura_ultimo, 0) + p.intervalo) - coalesce(l.valor, 0) end) <= p.avisar_antes then 'proximo'
            else 'ok' end as estado,
       o.id as ot_abierta, o.folio as ot_folio
from public.planes_mantenimiento p
join public.activos a on (a.id = p.activo_id or (p.activo_id is null and a.modelo_id = p.modelo_id)) and a.estatus <> 'baja'
join public.empresas e on e.id = a.empresa_id
join public.categorias c on c.id = a.categoria_id
left join public.marcas ma on ma.id = a.marca_id
left join public.modelos mo on mo.id = a.modelo_id
left join lateral (select ot.fecha_fin as fecha_ultimo, ot.lectura as lectura_ultimo from public.ordenes_trabajo ot
                   where ot.activo_id = a.id and ot.plan_id = p.id and ot.estatus = 'terminada' order by ot.fecha_fin desc nulls last limit 1) u on true
left join lateral (select x.valor, x.fecha from public.lecturas x
                   where x.activo_id = a.id and x.tipo = (case when p.disparo = 'horas' then 'horas' else 'km' end) order by x.fecha desc limit 1) l on true
left join lateral (select ot.id, ot.folio from public.ordenes_trabajo ot
                   where ot.activo_id = a.id and ot.plan_id = p.id and ot.estatus in ('abierta', 'en_proceso', 'espera_refaccion') limit 1) o on true
where p.activo;
grant select on public.v_mantenimiento to authenticated;
revoke all on public.v_mantenimiento from anon;

-- Para la página pública del QR: saber si el equipo lleva checklist diario (vehículos y maquinaria)
create or replace function public.tipo_equipo_por_qr(p_qr uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when c.nombre ilike '%maquinaria%' then 'maquinaria' when c.es_vehiculo then 'vehiculo' else 'otro' end
  from public.activos a join public.categorias c on c.id = a.categoria_id where a.qr = p_qr and a.estatus <> 'baja'
$$;
grant execute on function public.tipo_equipo_por_qr(uuid) to anon, authenticated;
