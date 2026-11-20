-- Carga de la Bitácora de Equipo de Cómputo (Departamento de TICS, 19 nov 2026): 15 laptops GF-0001 … GF-0015.
-- Idempotente: si el folio ya existe (activos.legacy_id) no lo vuelve a crear.
-- Crea marcas, modelos y empleados que falten; las asignaciones quedan como resguardo (sin firma) con la fecha de entrega.
do $$
declare
  r record; v_emp uuid; v_cat uuid; v_marca uuid; v_modelo uuid; v_empl uuid; v_ubic uuid; v_depto uuid; v_act uuid; v_mov uuid; v_notas text;
  v_creados int := 0; v_asignados int := 0; v_saltados int := 0;
begin
  select id into v_cat from public.categorias where nombre ilike 'laptops' and activo order by padre_id nulls last limit 1;
  if v_cat is null then select id into v_cat from public.categorias where nombre ilike '%laptop%' or nombre ilike '%cómputo%' order by padre_id nulls last limit 1; end if;
  if v_cat is null then raise exception 'No encontré la categoría Laptops'; end if;

  for r in select * from (values
    -- folio, marca, modelo, specs, serie, empresa (patrón), nombres, apellidos, área, entrega, estado, notas
    ('GF-0001','Dell','Alienware 15','Core Ultra 7 240H · 16 GB DDR5 · SSD 512 GB · RTX 4050 · 15.3"',null,'grupo firme de m',null,null,'La Herencia Santa Cruz','2026-09-18','activo',null),
    ('GF-0002','Dell','Inspiron','Core Ultra 7 255U · 16 GB · SSD 1 TB · 15.6" táctil',null,'grupo firme de m',null,null,'Finanzas','2026-09-18','activo',null),
    ('GF-0003','Dell','Alienware 15','Core Ultra 7 · 16 GB · SSD 512 GB · RTX 4050',null,'grupo firme de m','Alexis','Robledo',null,'2026-09-23','activo',null),
    ('GF-0004','ASUS','ROG Strix G16','Ryzen 9 8940HX · 32 GB DDR5 · SSD 1 TB · RTX 5070 · 16"',null,'grupo firme de m','Miguel','Ojeda',null,'2026-10-02','activo','Teclado en inglés'),
    ('GF-0005','MSI','Crosshair A16','Ryzen 9 8940HX · 32 GB DDR5 · SSD 1 TB · RTX 5060 · 16"',null,'grupo firme de m','Rogelio',null,null,'2026-10-02','activo','Teclado en inglés'),
    ('GF-0006','MSI','Cyborg 15','Core 7 240H · 32 GB DDR5 · SSD 1 TB · RTX 5050 · 15.6"',null,'grupo firme de m',null,null,'Ecatepec','2026-10-07','activo','Teclado en inglés'),
    ('GF-0007','Dell','Inspiron DC15255','Ryzen 7 7730U · 16 GB · SSD 512 GB · 15.6" táctil','CRH6VB4','grupo firme de m','Leonardo','Ávila','Recursos Humanos','2026-10-21','activo',null),
    ('GF-0008','Dell','Inspiron DC15255','Ryzen 7 7730U · 16 GB · SSD 512 GB · 15.6" táctil','CN0SBD4','grupo firme de m',null,null,null,'2026-10-21','devuelta','Devuelta 09/11/2026'),
    ('GF-0009','Dell','Inspiron DC15255','Ryzen 7 7730U · 16 GB · SSD 512 GB · 15.6" táctil','J4612G4','grupo firme de m','Arandy','Guluarte','Recursos Humanos','2026-10-27','activo',null),
    ('GF-0010','Lenovo','IdeaPad Slim 3 (15IRH10)',null,'PF9XB6209218','grupo firme de m','Alejandra Esteffania','Vázquez Estrada','Dirección General','2026-11-02','activo','Asignación AP1011261767'),
    ('GF-0011','Lenovo','Legion 5 (15AHP10)','Ryzen 7 260 · 16 GB · SSD 1 TB · RTX 5050 · 15.3"','PF62NS3H','control de ingenier','Eduardo Paulino','Barreto Campos','Topografía','2026-11-09','activo','Asignación AP0911261765'),
    ('GF-0012','Dell','Inspiron DC15255','Ryzen 7 7730U · 16 GB · SSD 512 GB · 15.6" táctil',null,'grupo firme de m','Erik Iván','Hernández Sánchez',null,'2026-11-11','activo','Teclado en inglés'),
    ('GF-0013','Lenovo','LOQ 15','Ryzen 7 7735HS · 16 GB · SSD 512 GB · RTX 4050 · 15.6"','PF67K9JG','control de ingenier','Jhonathan','Casillas',null,'2026-11-12','activo',null),
    ('GF-0014','Lenovo','LOQ 15','Ryzen 7 7735HS · 16 GB · SSD 512 GB · RTX 4050 · 15.6"','PF67PQCF','control de ingenier','Jhonathan','Casillas',null,'2026-11-13','activo',null),
    ('GF-0015','Lenovo','LOQ 15','Ryzen 7 7735HS · 16 GB · SSD 512 GB · RTX 4050 · 15.6"','PF67TPNQ','control de ingenier','Jhonathan','Casillas',null,'2026-11-13','activo',null)
  ) as t(folio, marca, modelo, specs, serie, empresa, nombres, apellidos, area, entrega, estado, notas)
  loop
    if exists (select 1 from public.activos where legacy_id = r.folio) then v_saltados := v_saltados + 1; continue; end if;
    if r.serie is not null and exists (select 1 from public.activos where upper(serie) = upper(r.serie)) then v_saltados := v_saltados + 1; continue; end if;

    select id into v_emp from public.empresas where nombre ilike '%' || r.empresa || '%' and activo order by nombre limit 1;
    if v_emp is null then raise exception 'No encontré la empresa (%) para %', r.empresa, r.folio; end if;

    select id into v_marca from public.marcas where nombre ilike r.marca limit 1;
    if v_marca is null then insert into public.marcas (nombre, sitio) values (r.marca, lower(r.marca) || '.com') returning id into v_marca; end if;
    select id into v_modelo from public.modelos where marca_id = v_marca and nombre ilike r.modelo limit 1;
    if v_modelo is null then insert into public.modelos (marca_id, nombre, categoria_id, descripcion) values (v_marca, r.modelo, v_cat, 'Laptop ' || r.marca || ' ' || r.modelo) returning id into v_modelo; end if;

    -- Área: si es una ubicación existente se usa como ubicación; si es departamento, se usa para el empleado
    v_ubic := null; v_depto := null;
    if r.area is not null then
      select id into v_ubic from public.ubicaciones where empresa_id = v_emp and activo and nombre ilike '%' || r.area || '%' limit 1;
      select id into v_depto from public.departamentos where empresa_id = v_emp and activo and nombre ilike '%' || r.area || '%' limit 1;
      if v_ubic is null and v_depto is null and r.nombres is not null then
        insert into public.departamentos (empresa_id, nombre) values (v_emp, r.area) returning id into v_depto;
      end if;
    end if;

    v_notas := concat_ws(E'\n', r.specs, r.notas, case when r.area is not null and v_ubic is null and r.nombres is null then 'Área: ' || r.area end, 'Folio bitácora ' || r.folio);
    insert into public.activos (empresa_id, categoria_id, marca_id, modelo_id, descripcion, serie, ubicacion_id, estatus, fecha_alta, notas, legacy_id)
    values (v_emp, v_cat, v_marca, v_modelo, 'Laptop ' || case when r.marca = 'Dell' and r.modelo like 'Alienware%' then '' else r.marca || ' ' end || r.modelo,
            r.serie, v_ubic, 'disponible', r.entrega::date, v_notas, r.folio)
    returning id into v_act;
    v_creados := v_creados + 1;

    if r.nombres is not null and r.estado = 'activo' then
      select id into v_empl from public.empleados
       where empresa_id = v_emp and activo
         and translate(lower(trim(nombres || ' ' || coalesce(apellidos, ''))), 'áéíóúü', 'aeiouu') = translate(lower(trim(r.nombres || ' ' || coalesce(r.apellidos, ''))), 'áéíóúü', 'aeiouu')
       limit 1;
      if v_empl is null then
        insert into public.empleados (empresa_id, nombres, apellidos, departamento_id) values (v_emp, r.nombres, r.apellidos, v_depto) returning id into v_empl;
      end if;
      insert into public.movimientos (tipo, empresa_id, fecha, a_empleado_id, recibe_nombre, entrega_nombre, notas)
      values ('asignacion', v_emp, (r.entrega || ' 12:00-07')::timestamptz, v_empl, trim(r.nombres || ' ' || coalesce(r.apellidos, '')), 'Departamento de TICS',
              concat_ws(' · ', 'Carga desde la bitácora de equipo de cómputo', r.notas))
      returning id into v_mov;
      insert into public.movimiento_activos (movimiento_id, activo_id, responsable_anterior_id, ubicacion_anterior_id, estatus_anterior)
      values (v_mov, v_act, null, v_ubic, 'disponible');
      update public.activos set responsable_id = v_empl, estatus = 'asignado' where id = v_act;
      v_asignados := v_asignados + 1;
    end if;
  end loop;
  raise notice 'Creados: %, asignados: %, ya existían: %', v_creados, v_asignados, v_saltados;
end $$;

select a.legacy_id as folio, a.codigo, a.descripcion, a.serie, a.estatus, e.nombre as empresa,
       trim(coalesce(emp.nombres, '') || ' ' || coalesce(emp.apellidos, '')) as asignado_a
from public.activos a join public.empresas e on e.id = a.empresa_id left join public.empleados emp on emp.id = a.responsable_id
where a.legacy_id like 'GF-00%' order by a.legacy_id;
