-- =====================================================================
-- GIMEFIT · Base de datos (Supabase / Postgres)
-- Pegá este archivo completo en Supabase → SQL Editor → Run.
-- Después corré 02_actividades.sql y por último 03_notificaciones.sql.
-- =====================================================================

-- ---------- Tipos ----------
create type rol_usuario   as enum ('admin', 'alumna');
create type modo_plan     as enum ('opciones', 'por_dia', 'pautas');
create type tipo_comida   as enum ('desayuno', 'almuerzo', 'merienda', 'cena');
create type tipo_hambre   as enum ('fisica', 'emocional', 'no_se');
create type grupo_alimento as enum ('proteina', 'verduras', 'carbohidratos', 'grasas');

-- Fecha "de hoy" en hora argentina (para registros diarios)
create or replace function hoy_ar() returns date
language sql stable as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

-- =====================================================================
-- PERFILES
-- =====================================================================
create table perfiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nombre       text not null,
  email        text,
  rol          rol_usuario not null default 'alumna',
  fecha_inicio date not null default hoy_ar(),
  activa       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Crea el perfil automáticamente cuando se registra una usuaria
create or replace function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)), new.email);
  return new;
end $$;

create trigger al_registrarse
  after insert on auth.users
  for each row execute function crear_perfil();

-- ¿La usuaria actual es admin?
create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin')
$$;

-- =====================================================================
-- ENTRENAMIENTO
-- Fases 1-3 (Activación, Progresión, Consolidación) · 4 semanas c/u
-- =====================================================================
create table rutina_dias (
  id          uuid primary key default gen_random_uuid(),
  alumna_id   uuid not null references perfiles(id) on delete cascade,
  fase        smallint not null check (fase between 1 and 3),
  semana      smallint not null check (semana between 1 and 4),
  dia_numero  smallint not null check (dia_numero between 1 and 7),
  nombre      text not null,                      -- "Piernas y glúteos"
  unique (alumna_id, fase, semana, dia_numero)
);

create table rutina_ejercicios (
  id            uuid primary key default gen_random_uuid(),
  dia_id        uuid not null references rutina_dias(id) on delete cascade,
  orden         smallint not null default 1,
  nombre        text not null,
  series        smallint not null check (series between 1 and 10),
  reps_objetivo smallint not null,
  video_url     text
);

-- Lo que carga la alumna: kg y reps por serie + check
create table registros_series (
  id            uuid primary key default gen_random_uuid(),
  alumna_id     uuid not null default auth.uid() references perfiles(id) on delete cascade,
  ejercicio_id  uuid not null references rutina_ejercicios(id) on delete cascade,
  serie_numero  smallint not null,
  peso_kg       numeric(6,2),
  reps          smallint,
  hecho         boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (ejercicio_id, serie_numero)
);

-- Se inserta cuando la alumna toca "Terminar entrenamiento"
create table dias_completados (
  id            uuid primary key default gen_random_uuid(),
  alumna_id     uuid not null default auth.uid() references perfiles(id) on delete cascade,
  dia_id        uuid not null unique references rutina_dias(id) on delete cascade,
  sensacion     text,                              -- "Con energía", "Cansada", ...
  completado_at timestamptz not null default now()
);

-- Primer día SIN completar de la alumna (a donde la lleva la app al entrar)
create or replace function siguiente_dia()
returns setof rutina_dias
language sql stable security invoker as $$
  select d.*
  from rutina_dias d
  where d.alumna_id = auth.uid()
    and not exists (select 1 from dias_completados c where c.dia_id = d.id)
  order by d.fase, d.semana, d.dia_numero
  limit 1
$$;

-- =====================================================================
-- NUTRICIÓN · un plan por alumna y por fase, en uno de los 3 modos
-- =====================================================================
create table planes_comida (
  id         uuid primary key default gen_random_uuid(),
  alumna_id  uuid not null references perfiles(id) on delete cascade,
  fase       smallint not null check (fase between 1 and 3),
  modo       modo_plan not null default 'opciones',
  unique (alumna_id, fase)
);

-- Modo "opciones": dia_semana NULL, opcion_numero 1..n
-- Modo "por_dia":  dia_semana 1..7 (1 = lunes), opcion_numero = 1
create table plan_opciones (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references planes_comida(id) on delete cascade,
  comida        tipo_comida not null,
  dia_semana    smallint check (dia_semana between 1 and 7),
  opcion_numero smallint not null default 1,
  texto         text not null
);

-- Modo "pautas": porción por grupo + alimentos para elegir
create table plan_pautas (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references planes_comida(id) on delete cascade,
  grupo      grupo_alimento not null,
  porcion    text,
  alimentos  text[] not null default '{}',
  unique (plan_id, grupo)
);

create table registros_comida (
  id         uuid primary key default gen_random_uuid(),
  alumna_id  uuid not null default auth.uid() references perfiles(id) on delete cascade,
  fecha      date not null default hoy_ar(),
  comida     tipo_comida not null,
  opcion_id  uuid references plan_opciones(id) on delete set null,
  cumplida   boolean not null default true,
  hambre     tipo_hambre,
  created_at timestamptz not null default now(),
  unique (alumna_id, fecha, comida)
);

create table registros_agua (
  alumna_id uuid not null default auth.uid() references perfiles(id) on delete cascade,
  fecha     date not null default hoy_ar(),
  vasos     smallint not null default 0 check (vasos between 0 and 20),
  primary key (alumna_id, fecha)
);

-- =====================================================================
-- COACHING
-- =====================================================================
create table checkins (
  id         uuid primary key default gen_random_uuid(),
  alumna_id  uuid not null default auth.uid() references perfiles(id) on delete cascade,
  fecha      date not null default hoy_ar(),
  energia    smallint not null check (energia between 1 and 5),
  emociones  text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (alumna_id, fecha)
);

create table registros_emocionales (
  id         uuid primary key default gen_random_uuid(),
  alumna_id  uuid not null default auth.uid() references perfiles(id) on delete cascade,
  que_paso   text not null,
  que_senti  text not null,
  que_hice   text,
  created_at timestamptz not null default now()
);

-- Las 36 actividades (iguales para todas; se cargan con 02_actividades.sql)
create table actividades (
  id        uuid primary key default gen_random_uuid(),
  fase      smallint not null check (fase between 1 and 3),
  semana    smallint not null check (semana between 1 and 4),
  numero    smallint not null check (numero between 1 and 3),
  titulo    text not null,
  consigna  text not null,
  ejercicio text not null,
  unique (fase, semana, numero)
);

create table actividades_hechas (
  alumna_id    uuid not null default auth.uid() references perfiles(id) on delete cascade,
  actividad_id uuid not null references actividades(id) on delete cascade,
  hecha_at     timestamptz not null default now(),
  primary key (alumna_id, actividad_id)
);

-- Actividades de la semana en la que está la alumna (según su próximo día de rutina)
create or replace function actividades_semana()
returns setof actividades
language sql stable security invoker as $$
  with pos as (
    select fase, semana from siguiente_dia()
    union all
    select fase, semana from (
      select d.fase, d.semana from rutina_dias d
      where d.alumna_id = auth.uid()
      order by d.fase desc, d.semana desc limit 1
    ) ultimo
    limit 1
  )
  select a.* from actividades a, pos
  where a.fase = pos.fase and a.semana = pos.semana
  order by a.numero
$$;

-- =====================================================================
-- SEGURIDAD (RLS): cada alumna ve solo lo suyo; Gime (admin) ve todo
-- =====================================================================
alter table perfiles              enable row level security;
alter table rutina_dias           enable row level security;
alter table rutina_ejercicios     enable row level security;
alter table registros_series      enable row level security;
alter table dias_completados      enable row level security;
alter table planes_comida         enable row level security;
alter table plan_opciones         enable row level security;
alter table plan_pautas           enable row level security;
alter table registros_comida      enable row level security;
alter table registros_agua        enable row level security;
alter table checkins              enable row level security;
alter table registros_emocionales enable row level security;
alter table actividades           enable row level security;
alter table actividades_hechas    enable row level security;

-- Perfiles: cada una ve el suyo; admin ve y edita todos
create policy perfil_propio on perfiles for select using (id = auth.uid() or es_admin());
create policy perfil_admin  on perfiles for update using (es_admin());

-- Contenido que carga Gime: la alumna solo lee lo suyo; admin hace todo
create policy rutina_lee on rutina_dias for select using (alumna_id = auth.uid() or es_admin());
create policy rutina_admin on rutina_dias for all using (es_admin()) with check (es_admin());

create policy ejercicios_lee on rutina_ejercicios for select using (
  es_admin() or exists (select 1 from rutina_dias d where d.id = dia_id and d.alumna_id = auth.uid()));
create policy ejercicios_admin on rutina_ejercicios for all using (es_admin()) with check (es_admin());

create policy planes_lee on planes_comida for select using (alumna_id = auth.uid() or es_admin());
create policy planes_admin on planes_comida for all using (es_admin()) with check (es_admin());

create policy opciones_lee on plan_opciones for select using (
  es_admin() or exists (select 1 from planes_comida p where p.id = plan_id and p.alumna_id = auth.uid()));
create policy opciones_admin on plan_opciones for all using (es_admin()) with check (es_admin());

create policy pautas_lee on plan_pautas for select using (
  es_admin() or exists (select 1 from planes_comida p where p.id = plan_id and p.alumna_id = auth.uid()));
create policy pautas_admin on plan_pautas for all using (es_admin()) with check (es_admin());

create policy actividades_lee on actividades for select using (auth.uid() is not null);
create policy actividades_admin on actividades for all using (es_admin()) with check (es_admin());

-- Registros de la alumna: ella crea/edita los suyos; admin lee todo
create policy series_propias on registros_series for all
  using (alumna_id = auth.uid() or es_admin()) with check (alumna_id = auth.uid());
create policy completados_propios on dias_completados for all
  using (alumna_id = auth.uid() or es_admin()) with check (alumna_id = auth.uid());
create policy comidas_propias on registros_comida for all
  using (alumna_id = auth.uid() or es_admin()) with check (alumna_id = auth.uid());
create policy agua_propia on registros_agua for all
  using (alumna_id = auth.uid() or es_admin()) with check (alumna_id = auth.uid());
create policy checkins_propios on checkins for all
  using (alumna_id = auth.uid() or es_admin()) with check (alumna_id = auth.uid());
create policy emocionales_propios on registros_emocionales for all
  using (alumna_id = auth.uid() or es_admin()) with check (alumna_id = auth.uid());
create policy hechas_propias on actividades_hechas for all
  using (alumna_id = auth.uid() or es_admin()) with check (alumna_id = auth.uid());
