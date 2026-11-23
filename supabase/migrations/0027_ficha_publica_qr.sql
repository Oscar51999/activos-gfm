-- ───────────── 0027 · Ficha pública del activo al escanear su QR / sticker NFC sin sesión ─────────────
-- Datos generales (sin responsable, montos ni documentos) para mostrar primero la información y luego "Reportar falla".
create or replace function public.ficha_qr(p_qr uuid)
returns table (codigo text, descripcion text, marca text, modelo text, categoria text, serie text, numero_economico text,
               empresa text, ubicacion text, estatus text, foto text)
language sql stable security definer set search_path = '' as $$
  select a.codigo, a.descripcion, m.nombre, mo.nombre, c.nombre, a.serie, a.numero_economico,
         coalesce(e.nombre_corto, e.nombre), u.nombre, a.estatus::text, mo.foto_path
  from public.activos a
  join public.empresas e on e.id = a.empresa_id
  join public.categorias c on c.id = a.categoria_id
  left join public.marcas m on m.id = a.marca_id
  left join public.modelos mo on mo.id = a.modelo_id
  left join public.ubicaciones u on u.id = a.ubicacion_id
  where a.qr = p_qr and a.estatus <> 'baja'
$$;
revoke execute on function public.ficha_qr(uuid) from public;
grant execute on function public.ficha_qr(uuid) to anon, authenticated;

select 'ok' as resultado;
