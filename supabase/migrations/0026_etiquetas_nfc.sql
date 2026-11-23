-- ───────────── 0026 · Etiquetas NFC: el número del chip de cada sticker ligado a un activo ─────────────
set lock_timeout = '8s';
alter table public.activos add column if not exists nfc_uid text;
-- Se guarda en mayúsculas y sin separadores (04:A2:B3… → 04A2B3…); un sticker no puede estar en dos activos
create or replace function privado.tg_activo_nfc() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.nfc_uid is not null then
    new.nfc_uid := nullif(upper(regexp_replace(new.nfc_uid, '[^0-9A-Za-z]', '', 'g')), '');
  end if;
  return new;
end $$;
drop trigger if exists activos_nfc on public.activos;
create trigger activos_nfc before insert or update of nfc_uid on public.activos for each row execute function privado.tg_activo_nfc();
create unique index if not exists activos_nfc_uid_key on public.activos (nfc_uid) where nfc_uid is not null;

create or replace view public.v_activos with (security_invoker = true) as
 SELECT a.id, a.codigo, a.qr, a.descripcion, a.serie, a.numero_economico, a.estatus, a.valor_referencia, a.fecha_alta, a.foto_principal, a.updated_at,
    a.empresa_id, e.nombre AS empresa, a.categoria_id, c.nombre AS categoria, c.es_vehiculo, a.marca_id, m.nombre AS marca, a.modelo_id, mo.nombre AS modelo,
    a.ubicacion_id, u.nombre AS ubicacion, u.tipo AS ubicacion_tipo, a.responsable_id,
    TRIM(BOTH FROM ((COALESCE(emp.nombres, ''::text) || ' '::text) || COALESCE(emp.apellidos, ''::text))) AS responsable,
    v.placa, mo.foto_path AS modelo_foto, emp.puesto AS responsable_puesto,
    a.rfid_epc, a.posicion_id, p.codigo AS posicion, c.clase_abc, a.montado_en,
    a.garantia_hasta, a.garantia_proveedor, a.reservable, a.nfc_uid
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

select 'ok' as resultado;
