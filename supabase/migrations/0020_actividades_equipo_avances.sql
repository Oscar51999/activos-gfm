-- ───────────── 0020 · Actividades con varias personas y bitácora de avance ─────────────
alter table public.actividades add column if not exists participantes uuid[] not null default '{}';
create index if not exists actividades_participantes_idx on public.actividades using gin (participantes);

-- Cada avance queda registrado: cuánto (%), quién y su comentario
create table if not exists public.actividad_avances (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null default auth.uid(),
  avance int check (avance between 0 and 100),
  estatus text check (estatus in ('pendiente', 'en_curso', 'atorado', 'listo')),
  comentario text,
  created_at timestamptz not null default now()
);
create index if not exists actividad_avances_idx on public.actividad_avances (actividad_id, created_at desc);
alter table public.actividad_avances enable row level security;
drop policy if exists actividad_avances_all on public.actividad_avances;
create policy actividad_avances_all on public.actividad_avances for all to authenticated using (privado.puede_editar()) with check (privado.puede_editar());

-- Al registrar un avance, la actividad toma ese % y estatus
create or replace function privado.tg_actividad_avance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.actividades set
    avance = coalesce(new.avance, avance),
    estatus = coalesce(new.estatus, case when new.avance = 100 then 'listo' when new.avance > 0 and estatus = 'pendiente' then 'en_curso' else estatus end)
  where id = new.actividad_id;
  return new;
end $$;
drop trigger if exists actividad_avance on public.actividad_avances;
create trigger actividad_avance after insert on public.actividad_avances for each row execute function privado.tg_actividad_avance();
