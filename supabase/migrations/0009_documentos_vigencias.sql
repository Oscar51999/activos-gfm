-- Fase 3B · Documentos con vencimiento (de activos y de empleados) y vista de vigencias.
set lock_timeout = '8s';

create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  activo_id uuid references public.activos(id) on delete cascade,
  empleado_id uuid references public.empleados(id) on delete cascade,
  tipo text not null check (tipo in ('factura', 'poliza_seguro', 'tarjeta_circulacion', 'verificacion', 'garantia', 'arrendamiento',
                                     'pedimento', 'calibracion', 'permiso', 'licencia_manejo', 'certificacion', 'otro')),
  numero text,                 -- póliza, folio, número de licencia…
  emisor text,                 -- aseguradora, agencia, laboratorio, dependencia
  fecha_emision date,
  fecha_vencimiento date,      -- null = no vence (ej. factura, pedimento)
  avisar_dias int not null default 30 check (avisar_dias between 0 and 365),
  archivo_path text,           -- storage: <empresa_id>/documentos/<archivo>
  archivo_nombre text,
  notas text,
  vigente boolean not null default true,   -- false cuando se renovó por uno nuevo
  renovado_de uuid references public.documentos(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documento_de_algo check (activo_id is not null or empleado_id is not null)
);
create index if not exists documentos_activo_idx on public.documentos (activo_id);
create index if not exists documentos_empleado_idx on public.documentos (empleado_id);
create index if not exists documentos_venc_idx on public.documentos (fecha_vencimiento) where vigente;
create trigger documentos_updated before update on public.documentos for each row execute function privado.tg_set_updated_at();

alter table public.documentos enable row level security;
create policy documentos_select on public.documentos for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy documentos_insert on public.documentos for insert to authenticated with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));
create policy documentos_update on public.documentos for update to authenticated
  using (privado.puede_editar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));
create policy documentos_delete on public.documentos for delete to authenticated using (privado.puede_editar() and privado.tiene_empresa(empresa_id));

-- Documentos vigentes que vencen, con su estado calculado
create or replace view public.v_vigencias with (security_invoker = true) as
select d.id, d.tipo, d.numero, d.emisor, d.fecha_emision, d.fecha_vencimiento, d.avisar_dias, d.archivo_path, d.archivo_nombre, d.notas,
       d.empresa_id, e.nombre as empresa, coalesce(e.nombre_corto, e.nombre) as empresa_corto,
       d.activo_id, a.codigo as activo_codigo, a.descripcion as activo_descripcion, ma.nombre as marca, mo.nombre as modelo, a.numero_economico, v.placa,
       d.empleado_id, trim(coalesce(emp.nombres,'') || ' ' || coalesce(emp.apellidos,'')) as empleado,
       (d.fecha_vencimiento - current_date) as dias_restantes,
       case when d.fecha_vencimiento < current_date then 'vencido'
            when d.fecha_vencimiento <= current_date + d.avisar_dias then 'por_vencer'
            else 'vigente' end as estado
from public.documentos d
join public.empresas e on e.id = d.empresa_id
left join public.activos a on a.id = d.activo_id
left join public.marcas ma on ma.id = a.marca_id
left join public.modelos mo on mo.id = a.modelo_id
left join public.activo_vehiculo v on v.activo_id = a.id
left join public.empleados emp on emp.id = d.empleado_id
where d.vigente and d.fecha_vencimiento is not null and (a.id is null or a.estatus <> 'baja');
grant select on public.v_vigencias to authenticated;
revoke all on public.v_vigencias from anon;
