-- ───────────── 0030 · Fotos de perfil: faltaba poder "ver" los archivos del bucket para subir con reemplazo y borrar la foto anterior ─────────────
set lock_timeout = '8s';
drop policy if exists perfiles_foto_select on storage.objects;
create policy perfiles_foto_select on storage.objects for select to authenticated using (bucket_id = 'perfiles');
select 'ok' as resultado;
