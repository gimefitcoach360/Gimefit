-- =====================================================================
-- GIMEFIT · Catálogo de ejercicios + recordatorios en el celular
-- Pegá este archivo completo en Supabase → SQL Editor → Run (una sola vez).
-- Antes de correrlo, reemplazá PEGAR_PROJECT_URL (línea marcada abajo)
-- por tu Project URL, ej: https://abcdxyz.supabase.co
-- =====================================================================

create extension if not exists pg_cron;

-- ---------- Catálogo de ejercicios (solo Gime) ----------
create table if not exists ejercicios_catalogo (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  grupo      text,
  video_url  text,
  created_at timestamptz not null default now()
);
create unique index if not exists ejercicios_catalogo_nombre on ejercicios_catalogo (lower(nombre));
alter table ejercicios_catalogo enable row level security;
drop policy if exists catalogo_admin on ejercicios_catalogo;
create policy catalogo_admin on ejercicios_catalogo for all using (es_admin()) with check (es_admin());

-- ---------- Suscripciones a recordatorios ----------
create table if not exists push_suscripciones (
  id         uuid primary key default gen_random_uuid(),
  alumna_id  uuid not null references perfiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  hora       smallint not null default 19 check (hora between 6 and 23),
  dias       smallint[] not null default '{1,2,3,4,5}',   -- 0 = domingo … 6 = sábado
  created_at timestamptz not null default now()
);
alter table push_suscripciones enable row level security;
drop policy if exists push_lee on push_suscripciones;
create policy push_lee on push_suscripciones for select using (alumna_id = auth.uid() or es_admin());

-- Guarda (o mueve a la alumna actual) la suscripción de este celular
create or replace function guardar_suscripcion(p_endpoint text, p_p256dh text, p_auth text, p_hora smallint, p_dias smallint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  insert into push_suscripciones (alumna_id, endpoint, p256dh, auth, hora, dias)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_hora, p_dias)
  on conflict (endpoint) do update
    set alumna_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        hora = excluded.hora, dias = excluded.dias;
end $$;

create or replace function borrar_suscripcion(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_suscripciones where endpoint = p_endpoint and alumna_id = auth.uid();
$$;

-- Clave pública para suscribirse (la genera la función "recordatorios" la primera vez)
create or replace function vapid_publica()
returns text language sql stable security definer set search_path = public as $$
  select valor from config_privada where clave = 'vapid_publica';
$$;

revoke all on function guardar_suscripcion(text, text, text, smallint, smallint[]) from public, anon;
revoke all on function borrar_suscripcion(text) from public, anon;
revoke all on function vapid_publica() from public, anon;
grant execute on function guardar_suscripcion(text, text, text, smallint, smallint[]) to authenticated;
grant execute on function borrar_suscripcion(text) to authenticated;
grant execute on function vapid_publica() to authenticated;

-- ---------- Conexión con la función "recordatorios" ----------
insert into config_privada (clave, valor) values
  ('proyecto_url', 'PEGAR_PROJECT_URL'),                                  -- <<< reemplazar
  ('push_secreto', encode(extensions.gen_random_bytes(18), 'hex'))
on conflict (clave) do update
  set valor = case when excluded.clave = 'push_secreto' then config_privada.valor else excluded.valor end;

update config_privada set valor = rtrim(trim(valor), '/') where clave = 'proyecto_url';

create or replace function llamar_recordatorios(p_body jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_secreto text;
begin
  select valor into v_url     from config_privada where clave = 'proyecto_url';
  select valor into v_secreto from config_privada where clave = 'push_secreto';
  if v_url is null or v_url not like 'https://%' then return; end if;
  perform net.http_post(
    url     := v_url || '/functions/v1/recordatorios',
    body    := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-secreto', v_secreto)
  );
exception when others then
  return;  -- un recordatorio nunca frena nada
end $$;
revoke all on function llamar_recordatorios(jsonb) from public, anon, authenticated;

-- La app la usa para preparar las claves la primera vez y para la notificación de prueba
create or replace function pedir_push(p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_tipo not in ('preparar', 'prueba') then raise exception 'No permitido'; end if;
  perform llamar_recordatorios(jsonb_build_object('tipo', p_tipo, 'alumna_id', auth.uid()));
end $$;
revoke all on function pedir_push(text) from public, anon;
grant execute on function pedir_push(text) to authenticated;

-- Cuando Gime manda un mensaje, le llega como notificación a la alumna
create or replace function aviso_push_mensaje()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform llamar_recordatorios(jsonb_build_object('tipo', 'mensaje', 'alumna_id', new.alumna_id, 'texto', new.texto));
  return new;
end $$;
drop trigger if exists push_mensaje on mensajes;
create trigger push_mensaje after insert on mensajes for each row execute function aviso_push_mensaje();

-- Todas las horas en punto: la función revisa a quién le toca recordatorio a esa hora
select cron.schedule('gimefit-recordatorios', '0 * * * *',
  $$ select llamar_recordatorios('{"tipo":"recordatorio"}'::jsonb) $$);
