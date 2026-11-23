-- ───────────── 0025 · Inmuebles: oficinas y campamentos con datos propios ─────────────
set lock_timeout = '8s';
alter table public.inmuebles add column if not exists encargado_id uuid references public.empleados(id) on delete set null;   -- quién lo administra
alter table public.inmuebles add column if not exists telefono text;
alter table public.inmuebles add column if not exists estatus_operacion text not null default 'operando' check (estatus_operacion in ('por_abrir', 'operando', 'cerrado'));
-- Oficinas
alter table public.inmuebles add column if not exists puestos_trabajo int check (puestos_trabajo is null or puestos_trabajo >= 0);
alter table public.inmuebles add column if not exists horario text;
-- Campamentos
alter table public.inmuebles add column if not exists capacidad_personas int check (capacidad_personas is null or capacidad_personas >= 0);
alter table public.inmuebles add column if not exists ocupacion int check (ocupacion is null or ocupacion >= 0);
alter table public.inmuebles add column if not exists cuartos int check (cuartos is null or cuartos >= 0);
alter table public.inmuebles add column if not exists banos int check (banos is null or banos >= 0);
alter table public.inmuebles add column if not exists obra_cc_id uuid references public.centros_costo(id) on delete set null;  -- obra a la que da servicio
alter table public.inmuebles add column if not exists fecha_apertura date;
alter table public.inmuebles add column if not exists fecha_cierre date;
select 'ok' as resultado;
