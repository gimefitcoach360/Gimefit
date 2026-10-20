-- =====================================================================
-- GIMEFIT · En qué fase arranca cada alumna
-- Pegá este archivo completo en Supabase → SQL Editor → Run (una sola vez).
-- =====================================================================

-- 1 = Activación, 2 = Progresión, 3 = Consolidación. Las fases anteriores se ignoran.
alter table perfiles add column if not exists fase_inicio smallint not null default 1 check (fase_inicio between 1 and 3);

-- Primer día sin completar, a partir de la fase en la que arranca la alumna
create or replace function siguiente_dia()
returns setof rutina_dias
language sql stable security invoker as $$
  select d.*
  from rutina_dias d
  where d.alumna_id = auth.uid()
    and d.fase >= coalesce((select fase_inicio from perfiles where id = auth.uid()), 1)
    and not exists (select 1 from dias_completados c where c.dia_id = d.id)
  order by d.fase, d.semana, d.dia_numero
  limit 1
$$;
