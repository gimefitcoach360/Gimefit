# Gimefit

App de entrenamiento, nutrición y coaching emocional. React + Vite + Supabase.

## Qué hace

**Alumna**
- **Entreno**: al entrar va directo al primer día sin completar. Carga kg y reps por serie, marca el check, elige cómo se sintió y termina el día.
- **Nutrición**: ve su plan del día según el modo que le asignaste (opciones, por día o pautas). Marca cada comida, elige la opción y el tipo de hambre. Lleva la cuenta del agua.
- **Coaching**: check-in diario de energía y emociones, registro emocional y las 3 actividades de su semana.
- **Progreso**: entrenos hechos, kilos máximos por ejercicio y semana, y constancia.

**Admin (Gime)**
- Lista de alumnas, editor de rutina por fase, semana y día (con "duplicar a la semana siguiente") y plan de comidas en los 3 modos.

Cada acción terminada de una alumna te manda un mail al instante (ver `supabase/`).

## Puesta en marcha

1. **Base de datos**: en Supabase → SQL Editor, ejecutá en orden:
   `supabase/01_schema.sql` → `supabase/02_actividades.sql` → `supabase/03_notificaciones.sql`
   (el 03 después de configurar Apps Script; ver más abajo).
2. **Mails**: planilla nueva → Extensiones → Apps Script → pegá `supabase/Code.gs`, cambiá `SECRETO`,
   ejecutá `probarMail` y después Implementar → Aplicación web (Ejecutar como: Yo · Acceso: Cualquier usuario).
   Pegá la URL y el secreto en `03_notificaciones.sql` antes de ejecutarlo.
3. **Variables**: copiá `.env.example` como `.env` con la URL y la anon key de Supabase (Project Settings → API).
   En Vercel, cargá las mismas dos variables en Settings → Environment Variables.
4. **Deploy**: subí el repo a GitHub e importalo en Vercel (Framework: Vite). `vercel.json` ya maneja las rutas.
5. **Tu usuario admin**: registrate en la app y en Supabase → Table Editor → `perfiles` cambiá tu `rol` a `admin`.

## Desarrollo local

```bash
npm install
npm run dev
```

## Notas

- Las actividades de coaching son las mismas para todas. Se editan en Supabase → `actividades`.
- La app libera las actividades según la semana de rutina en la que está la alumna (la del próximo día sin completar).
- Límite de mails: una cuenta Gmail común manda hasta 100 por día desde Apps Script.
