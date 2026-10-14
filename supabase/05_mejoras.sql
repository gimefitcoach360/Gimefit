-- =====================================================================
-- GIMEFIT · Mejoras: mensajes de Gime, medidas y fotos de progreso,
-- vencimiento del plan, descanso por ejercicio y detalle de comidas.
-- Pegá este archivo completo en Supabase → SQL Editor → Run (una sola vez).
-- =====================================================================

-- ---------- Columnas nuevas ----------
alter table perfiles          add column if not exists vence date;                                   -- fin del plan
alter table rutina_ejercicios add column if not exists descanso_seg smallint not null default 60;     -- temporizador
alter table registros_comida  add column if not exists detalle text;                                  -- alimentos elegidos (modo pautas)

-- ---------- Mensajes de Gime a cada alumna ----------
create table if not exists mensajes (
  id         uuid primary key default gen_random_uuid(),
  alumna_id  uuid not null references perfiles(id) on delete cascade,
  texto      text not null,
  created_at timestamptz not null default now()
);
alter table mensajes enable row level security;
drop policy if exists mensajes_lee   on mensajes;
drop policy if exists mensajes_admin on mensajes;
create policy mensajes_lee   on mensajes for select using (alumna_id = auth.uid() or es_admin());
create policy mensajes_admin on mensajes for all    using (es_admin()) with check (es_admin());

-- ---------- Medidas y fotos de progreso ----------
create table if not exists medidas (
  id         uuid primary key default gen_random_uuid(),
  alumna_id  uuid not null default auth.uid() references perfiles(id) on delete cascade,
  fecha      date not null default hoy_ar(),
  peso_kg    numeric(5,1),
  cintura_cm numeric(5,1),
  cadera_cm  numeric(5,1),
  notas      text,
  foto_path  text,
  created_at timestamptz not null default now()
);
alter table medidas enable row level security;
drop policy if exists medidas_propias on medidas;
create policy medidas_propias on medidas for all
  using (alumna_id = auth.uid() or es_admin()) with check (alumna_id = auth.uid());

-- Carpeta privada de fotos: cada alumna solo ve y sube a su carpeta; Gime ve todas
insert into storage.buckets (id, name, public)
values ('progreso', 'progreso', false)
on conflict (id) do nothing;

drop policy if exists progreso_subir  on storage.objects;
drop policy if exists progreso_ver    on storage.objects;
drop policy if exists progreso_borrar on storage.objects;
create policy progreso_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'progreso' and (storage.foldername(name))[1] = auth.uid()::text);
create policy progreso_ver on storage.objects for select to authenticated
  using (bucket_id = 'progreso' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
create policy progreso_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'progreso' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- El resumen diario incluye lo que eligió en modo pautas ----------
create or replace function aviso_comida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cumplida and (tg_op = 'INSERT' or not old.cumplida) then
    perform notificar('comida', jsonb_build_object(
      'alumna', (select nombre from perfiles where id = new.alumna_id),
      'fecha',  new.fecha,
      'comida', new.comida,
      'opcion', coalesce((select texto from plan_opciones where id = new.opcion_id), new.detalle),
      'hambre', new.hambre));
  end if;
  return new;
end $$;
