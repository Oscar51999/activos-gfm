-- Pendiente: solo mejora de rendimiento (auth.uid() evaluado una vez por consulta)
drop policy perfiles_select on public.perfiles;
drop policy perfiles_update on public.perfiles;
create policy perfiles_select on public.perfiles for select to authenticated using (id = (select auth.uid()) or privado.es_admin());
create policy perfiles_update on public.perfiles for update to authenticated
  using (id = (select auth.uid()) or privado.es_admin()) with check (id = (select auth.uid()) or privado.es_admin());
drop policy perfil_empresas_select on public.perfil_empresas;
drop policy perfil_empresas_write on public.perfil_empresas;
create policy perfil_empresas_select on public.perfil_empresas for select to authenticated using (perfil_id = (select auth.uid()) or privado.es_admin());
create policy perfil_empresas_insert on public.perfil_empresas for insert to authenticated with check (privado.es_admin());
create policy perfil_empresas_delete on public.perfil_empresas for delete to authenticated using (privado.es_admin());
