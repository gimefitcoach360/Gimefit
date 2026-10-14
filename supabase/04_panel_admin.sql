-- =====================================================================
-- GIMEFIT · Funciones del panel admin
-- Crear alumnas y cambiar contraseñas desde la app, plantillas de rutina
-- y última actividad de cada alumna.
-- Pegá este archivo completo en Supabase → SQL Editor → Run (una sola vez).
-- =====================================================================

-- ---------- 1. Crear alumna (usuario + contraseña, sin mail de confirmación) ----------
create or replace function admin_crear_alumna(p_email text, p_clave text, p_nombre text)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if not es_admin() then raise exception 'Solo la admin puede crear alumnas'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El usuario no es válido'; end if;
  if length(coalesce(p_clave, '')) < 6 then raise exception 'La contraseña tiene que tener al menos 6 caracteres'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'Ese usuario ya existe'; end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_clave, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nombre', coalesce(nullif(trim(p_nombre), ''), split_part(v_email, '@', 1))),
    now(), now(), '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, 'email',
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          now(), now(), now());

  return v_id;   -- el perfil se crea solo (trigger al_registrarse)
end $$;

-- ---------- 2. Cambiar contraseña de una alumna ----------
create or replace function admin_cambiar_clave(p_alumna uuid, p_clave text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not es_admin() then raise exception 'Solo la admin puede cambiar contraseñas'; end if;
  if length(coalesce(p_clave, '')) < 6 then raise exception 'La contraseña tiene que tener al menos 6 caracteres'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf')), updated_at = now()
   where id = p_alumna;
  if not found then raise exception 'No se encontró la alumna'; end if;
end $$;

revoke all on function admin_crear_alumna(text, text, text) from public, anon;
revoke all on function admin_cambiar_clave(uuid, text) from public, anon;
grant execute on function admin_crear_alumna(text, text, text) to authenticated;
grant execute on function admin_cambiar_clave(uuid, text) to authenticated;

-- ---------- 3. Plantillas de rutina (un mes: días + ejercicios) ----------
create table if not exists plantillas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  dias       jsonb not null default '[]',   -- [{dia_numero, nombre, ejercicios:[{orden,nombre,series,reps_objetivo,video_url}]}]
  created_at timestamptz not null default now()
);
alter table plantillas enable row level security;
drop policy if exists plantillas_admin on plantillas;
create policy plantillas_admin on plantillas for all using (es_admin()) with check (es_admin());

-- ---------- 4. Última actividad de cada alumna (para la alerta de inactividad) ----------
create or replace function actividad_alumnas()
returns table (alumna_id uuid, ultima timestamptz)
language sql stable security invoker as $$
  select p.id, greatest(
    (select max(completado_at) from dias_completados      x where x.alumna_id = p.id),
    (select max(updated_at)    from registros_series      x where x.alumna_id = p.id),
    (select max(created_at)    from registros_comida      x where x.alumna_id = p.id),
    (select max(created_at)    from checkins              x where x.alumna_id = p.id),
    (select max(created_at)    from registros_emocionales x where x.alumna_id = p.id),
    (select max(hecha_at)      from actividades_hechas    x where x.alumna_id = p.id),
    (select max(fecha)::timestamp at time zone 'America/Argentina/Buenos_Aires'
                               from registros_agua        x where x.alumna_id = p.id)
  )
  from perfiles p
  where p.rol = 'alumna'
$$;
grant execute on function actividad_alumnas() to authenticated;
