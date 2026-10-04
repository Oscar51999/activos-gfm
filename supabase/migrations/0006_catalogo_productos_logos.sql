-- Fase 2.5 · Catálogo de productos (marca + modelo con foto de referencia) y logos de empresa.
-- Un "producto" es la fila de modelos: se captura una vez y cada unidad (activo) solo lleva serie, código y destino.

alter table public.modelos
  add column if not exists categoria_id uuid references public.categorias(id) on delete set null,
  add column if not exists foto_path text,       -- imagen de referencia (data URL JPEG/PNG comprimida)
  add column if not exists descripcion text;     -- nombre comercial o ficha corta, se copia a cada unidad
create index if not exists modelos_categoria_idx on public.modelos (categoria_id);

alter table public.empresas
  add column if not exists nombre_corto text,
  add column if not exists logo_path text,       -- logo (data URL PNG con fondo transparente)
  add column if not exists color text;           -- color de acento de la empresa (#RRGGBB)

-- Vista de activos: se agregan foto del producto y datos del responsable al final (no rompe columnas existentes)
create or replace view public.v_activos with (security_invoker = true) as
select a.id, a.codigo, a.qr, a.descripcion, a.serie, a.numero_economico, a.estatus,
       a.valor_referencia, a.fecha_alta, a.foto_principal, a.updated_at,
       a.empresa_id, e.nombre as empresa,
       a.categoria_id, c.nombre as categoria, c.es_vehiculo,
       a.marca_id, m.nombre as marca, a.modelo_id, mo.nombre as modelo,
       a.ubicacion_id, u.nombre as ubicacion, u.tipo as ubicacion_tipo,
       a.responsable_id, trim(coalesce(emp.nombres,'') || ' ' || coalesce(emp.apellidos,'')) as responsable,
       v.placa,
       mo.foto_path as modelo_foto, emp.puesto as responsable_puesto
from public.activos a
join public.empresas e on e.id = a.empresa_id
join public.categorias c on c.id = a.categoria_id
left join public.marcas m on m.id = a.marca_id
left join public.modelos mo on mo.id = a.modelo_id
left join public.ubicaciones u on u.id = a.ubicacion_id
left join public.empleados emp on emp.id = a.responsable_id
left join public.activo_vehiculo v on v.activo_id = a.id;

-- Foto de producto y logo se guardan como imagen comprimida (data URL) en la propia fila:
-- así todos los usuarios activos los ven sin depender de carpetas por empresa en storage.
-- (Aplicada en el proyecto como 0006a_catalogo_columnas y 0006b_v_activos_foto_modelo.)
