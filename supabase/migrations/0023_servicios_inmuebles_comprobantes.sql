-- ───────────── 0023 · Servicios por pagar de los inmuebles: referencia y comprobante del pago ─────────────
set lock_timeout = '8s';
alter table public.inmueble_pagos add column if not exists referencia_pago text;   -- folio, no. de operación o recibo
alter table public.inmueble_pagos add column if not exists comprobante text;       -- imagen o PDF comprimido (data URL)
alter table public.inmueble_pagos add column if not exists pagado_por uuid references auth.users(id) on delete set null;
alter table public.inmueble_pagos add column if not exists dia_limite int check (dia_limite is null or dia_limite between 1 and 31); -- día del mes en que vence (para generar los siguientes)
create index if not exists inmueble_pagos_pend_idx on public.inmueble_pagos (pagado, fecha_limite);

-- Vista para el tablero y la página de servicios: todos los pagos con su inmueble y empresa
create or replace view public.v_servicios_inmuebles with (security_invoker = true) as
select p.*, i.nombre as inmueble, i.codigo as inmueble_codigo, coalesce(e.nombre_corto, e.nombre) as empresa,
       (p.fecha_limite - current_date) as dias_restantes
from public.inmueble_pagos p
join public.inmuebles i on i.id = p.inmueble_id
join public.empresas e on e.id = p.empresa_id;
grant select on public.v_servicios_inmuebles to authenticated;
revoke all on public.v_servicios_inmuebles from anon;

select 'ok' as resultado;
