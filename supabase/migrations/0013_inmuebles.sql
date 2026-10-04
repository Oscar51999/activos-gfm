-- Inmuebles · terrenos, oficinas, bodegas, talleres, campamentos, patios y casas del personal, con su expediente de documentos.
-- Sin montos: el avalúo y la opinión de valor se guardan como documento, no como cifra.
set lock_timeout = '8s';

create sequence if not exists public.inmuebles_seq;
create table if not exists public.inmuebles (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('INM-' || lpad(nextval('public.inmuebles_seq')::text, 4, '0')),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nombre text not null,
  propietario text,
  clave_catastral text,
  superficie_terreno numeric(14,2),        -- m²
  superficie_construccion numeric(14,2),   -- m²
  calle text, numero_ext text, numero_int text, manzana text, lote text, colonia text, entre_calles text,
  municipio text, estado text default 'Baja California Sur', cp text,
  tipo text not null default 'terreno' check (tipo in ('terreno', 'oficina', 'bodega', 'taller', 'campamento', 'patio', 'casa_personal', 'edificacion_proceso')),
  clasificacion text check (clasificacion in ('urbana', 'suburbana', 'rustica')),
  situacion text check (situacion in ('no_disponible', 'en_proceso', 'reserva', 'en_desarrollo', 'renta', 'oficina', 'campamento', 'empresa_socios')),
  servicios text[] not null default '{}',  -- agua, luz, drenaje, internet, gas, pavimento
  colindancias text,
  observaciones text,
  foto text,                               -- data URL
  latitud numeric(9,6), longitud numeric(9,6),
  ubicacion_id uuid references public.ubicaciones(id) on delete set null,   -- si también funciona como lugar donde hay activos
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inmuebles_empresa_idx on public.inmuebles (empresa_id);
create trigger inmuebles_updated before update on public.inmuebles for each row execute function privado.tg_set_updated_at();
alter table public.inmuebles enable row level security;
create policy inmuebles_select on public.inmuebles for select to authenticated using (privado.tiene_empresa(empresa_id));
create policy inmuebles_insert on public.inmuebles for insert to authenticated with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));
create policy inmuebles_update on public.inmuebles for update to authenticated
  using (privado.puede_editar() and privado.tiene_empresa(empresa_id)) with check (privado.puede_editar() and privado.tiene_empresa(empresa_id));
create policy inmuebles_delete on public.inmuebles for delete to authenticated using (privado.es_admin());

-- Documentos: ahora también de inmuebles, con 24 tipos nuevos
alter table public.documentos add column if not exists inmueble_id uuid references public.inmuebles(id) on delete cascade;
alter table public.documentos add column if not exists subtipo text;   -- tipo de plano o de seguro
create index if not exists documentos_inmueble_idx on public.documentos (inmueble_id);
alter table public.documentos drop constraint if exists documentos_tipo_check;
alter table public.documentos add constraint documentos_tipo_check check (tipo in (
  'factura', 'poliza_seguro', 'tarjeta_circulacion', 'verificacion', 'garantia', 'arrendamiento', 'pedimento', 'calibracion', 'permiso',
  'licencia_manejo', 'certificacion', 'otro',
  'escritura', 'registro_publico', 'catastro', 'predial', 'constancias', 'avisos_ayuntamiento', 'avaluo', 'contrato_compraventa', 'hipoteca',
  'opinion_valor', 'licencia_funcionamiento', 'uso_suelo', 'pc_dictamen', 'pc_primeros_auxilios', 'medio_ambiente', 'fumigacion', 'residuos',
  'pipc', 'plano', 'licencia_construccion', 'terminacion_obra', 'seguro_danos'));
alter table public.documentos drop constraint if exists documento_de_algo;
alter table public.documentos add constraint documento_de_algo check (activo_id is not null or empleado_id is not null or inmueble_id is not null);

create or replace view public.v_vigencias with (security_invoker = true) as
select d.id, d.tipo, d.numero, d.emisor, d.fecha_emision, d.fecha_vencimiento, d.avisar_dias, d.archivo_path, d.archivo_nombre, d.notas,
       d.empresa_id, e.nombre as empresa, coalesce(e.nombre_corto, e.nombre) as empresa_corto,
       d.activo_id, a.codigo as activo_codigo, a.descripcion as activo_descripcion, ma.nombre as marca, mo.nombre as modelo, a.numero_economico, v.placa,
       d.empleado_id, trim(coalesce(emp.nombres,'') || ' ' || coalesce(emp.apellidos,'')) as empleado,
       (d.fecha_vencimiento - current_date) as dias_restantes,
       case when d.fecha_vencimiento < current_date then 'vencido'
            when d.fecha_vencimiento <= current_date + d.avisar_dias then 'por_vencer'
            else 'vigente' end as estado,
       d.inmueble_id, i.codigo as inmueble_codigo, i.nombre as inmueble, d.subtipo
from public.documentos d
join public.empresas e on e.id = d.empresa_id
left join public.activos a on a.id = d.activo_id
left join public.marcas ma on ma.id = a.marca_id
left join public.modelos mo on mo.id = a.modelo_id
left join public.activo_vehiculo v on v.activo_id = a.id
left join public.empleados emp on emp.id = d.empleado_id
left join public.inmuebles i on i.id = d.inmueble_id
where d.vigente and d.fecha_vencimiento is not null and (a.id is null or a.estatus <> 'baja') and (i.id is null or i.activo);
grant select on public.v_vigencias to authenticated;
revoke all on public.v_vigencias from anon;
