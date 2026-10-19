-- =====================================================================
-- GIMEFIT · Activar / pausar alumnas y elegir sus secciones
-- Pegá este archivo completo en Supabase → SQL Editor → Run (una sola vez).
-- =====================================================================

-- Qué secciones tiene cada alumna (por defecto, las tres)
alter table perfiles add column if not exists secciones text[] not null default '{entreno,nutricion,coaching}';

-- ¿La alumna que está usando la app tiene acceso (y a esta sección)?
create or replace function tengo_acceso(p_seccion text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and activa
      and (vence is null or vence >= hoy_ar())
      and (p_seccion is null or p_seccion = any(secciones))
  );
$$;
grant execute on function tengo_acceso(text) to authenticated;

-- Reglas "restrictivas": se suman a las que ya existen. Si la alumna está pausada
-- (o no tiene esa sección), la base no le muestra ni le deja guardar nada. Gime siempre puede.
do $$
declare t text; s text;
begin
  for t, s in select * from (values
    ('rutina_dias','entreno'), ('rutina_ejercicios','entreno'), ('registros_series','entreno'), ('dias_completados','entreno'),
    ('planes_comida','nutricion'), ('plan_opciones','nutricion'), ('plan_pautas','nutricion'),
    ('registros_comida','nutricion'), ('registros_agua','nutricion'),
    ('checkins','coaching'), ('registros_emocionales','coaching'), ('actividades_hechas','coaching'), ('actividades','coaching'),
    ('mensajes', null), ('medidas', null), ('push_suscripciones', null)
  ) as v(tabla, seccion)
  loop
    execute format('drop policy if exists acceso_activo on %I', t);
    execute format(
      'create policy acceso_activo on %I as restrictive for all to authenticated
         using (es_admin() or (select tengo_acceso(%L))) with check (es_admin() or (select tengo_acceso(%L)))',
      t, s, s);
  end loop;
end $$;

-- Vencimiento: si la fecha ya pasó, queda inactiva; si Gime renueva (fecha nueva a futuro), se reactiva sola
create or replace function ajustar_activa()
returns trigger language plpgsql as $$
begin
  if new.rol = 'alumna' and new.vence is not null then
    if new.vence < hoy_ar() then
      new.activa := false;
    elsif tg_op = 'UPDATE' and new.vence is distinct from old.vence
          and old.vence is not null and old.vence < hoy_ar() and old.activa = new.activa then
      new.activa := true;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ajustar_activa on perfiles;
create trigger ajustar_activa before insert or update on perfiles for each row execute function ajustar_activa();

-- Todos los días a las 00:05 (Argentina) se pausan las que vencieron ayer
select cron.schedule('gimefit-vencimientos', '5 3 * * *',
  $$ update perfiles set activa = false where rol = 'alumna' and activa and vence < hoy_ar() $$);

-- Las que ya están vencidas hoy, quedan pausadas desde ahora
update perfiles set activa = false where rol = 'alumna' and activa and vence < hoy_ar();
