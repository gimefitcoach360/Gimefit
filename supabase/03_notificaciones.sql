-- =====================================================================
-- GIMEFIT · Mails instantáneos a Gime
-- Cada acción terminada de una alumna manda un aviso a Apps Script,
-- que te envía el mail y lo anota en una planilla.
--
-- ANTES DE CORRER: reemplazá los dos valores marcados con <<< >>> abajo
-- (la URL que te da Apps Script al implementar y la clave secreta que
-- pusiste en el script).
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- Configuración privada (sin políticas: ninguna usuaria la puede leer)
create table config_privada (
  clave text primary key,
  valor text not null
);
alter table config_privada enable row level security;

insert into config_privada (clave, valor) values
  ('apps_script_url',    '<<< PEGÁ ACÁ LA URL DE APPS SCRIPT >>>'),
  ('apps_script_secreto','<<< PEGÁ ACÁ TU CLAVE SECRETA >>>');

-- Envía el aviso (no frena a la alumna si el mail falla)
create or replace function notificar(tipo text, datos jsonb)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text; v_secreto text;
begin
  select valor into v_url     from config_privada where clave = 'apps_script_url';
  select valor into v_secreto from config_privada where clave = 'apps_script_secreto';
  if v_url is null or v_url like '<<<%' then return; end if;

  perform net.http_post(
    url  := v_url,
    body := jsonb_build_object('secreto', v_secreto, 'tipo', tipo, 'datos', datos)
  );
exception when others then
  raise warning 'notificar(%) falló: %', tipo, sqlerrm;
end $$;

-- ---------- 1. Entrenamiento terminado ----------
create or replace function aviso_entreno() returns trigger
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'alumna',    p.nombre,
    'fase',      d.fase,
    'semana',    d.semana,
    'dia',       d.dia_numero,
    'nombre_dia',d.nombre,
    'sensacion', new.sensacion,
    'ejercicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', e.nombre,
        'objetivo', e.series || ' x ' || e.reps_objetivo,
        'series', coalesce((
          select jsonb_agg(jsonb_build_object(
            'serie', s.serie_numero, 'kg', s.peso_kg, 'reps', s.reps, 'hecho', s.hecho)
            order by s.serie_numero)
          from registros_series s where s.ejercicio_id = e.id), '[]'::jsonb)
      ) order by e.orden)
      from rutina_ejercicios e where e.dia_id = d.id), '[]'::jsonb)
  ) into v
  from rutina_dias d join perfiles p on p.id = d.alumna_id
  where d.id = new.dia_id;

  perform notificar('entreno', v);
  return new;
end $$;

create trigger mail_entreno
  after insert on dias_completados
  for each row execute function aviso_entreno();

-- ---------- 2. Comida marcada como cumplida ----------
create or replace function aviso_comida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cumplida and (tg_op = 'INSERT' or not old.cumplida) then
    perform notificar('comida', jsonb_build_object(
      'alumna', (select nombre from perfiles where id = new.alumna_id),
      'fecha',  new.fecha,
      'comida', new.comida,
      'opcion', (select texto from plan_opciones where id = new.opcion_id),
      'hambre', new.hambre));
  end if;
  return new;
end $$;

create trigger mail_comida
  after insert or update on registros_comida
  for each row execute function aviso_comida();

-- ---------- 3. Check-in del día ----------
create or replace function aviso_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notificar('checkin', jsonb_build_object(
    'alumna',    (select nombre from perfiles where id = new.alumna_id),
    'fecha',     new.fecha,
    'energia',   new.energia,
    'emociones', new.emociones,
    'editado',   tg_op = 'UPDATE'));
  return new;
end $$;

create trigger mail_checkin
  after insert or update on checkins
  for each row execute function aviso_checkin();

-- ---------- 4. Registro emocional ----------
create or replace function aviso_emocional() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notificar('emocional', jsonb_build_object(
    'alumna',    (select nombre from perfiles where id = new.alumna_id),
    'que_paso',  new.que_paso,
    'que_senti', new.que_senti,
    'que_hice',  new.que_hice));
  return new;
end $$;

create trigger mail_emocional
  after insert on registros_emocionales
  for each row execute function aviso_emocional();

-- ---------- 5. Actividad de coaching hecha ----------
create or replace function aviso_actividad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notificar('actividad', (
    select jsonb_build_object(
      'alumna', (select nombre from perfiles where id = new.alumna_id),
      'fase', a.fase, 'semana', a.semana, 'numero', a.numero, 'titulo', a.titulo)
    from actividades a where a.id = new.actividad_id));
  return new;
end $$;

create trigger mail_actividad
  after insert on actividades_hechas
  for each row execute function aviso_actividad();
