-- =====================================================================
-- GIMEFIT · Eliminar alumnas desde el panel
-- Pegá este archivo completo en Supabase → SQL Editor → Run (una sola vez).
-- =====================================================================

-- Gime también puede borrar fotos de progreso (para limpiar al eliminar una alumna)
drop policy if exists progreso_borrar on storage.objects;
create policy progreso_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'progreso' and ((storage.foldername(name))[1] = auth.uid()::text or es_admin()));

-- Borra la cuenta de la alumna y TODO lo suyo (rutinas, registros, comidas, check-ins, medidas…).
-- No se puede deshacer. Solo la admin puede, y nunca sobre una cuenta admin.
create or replace function admin_borrar_alumna(p_alumna uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not es_admin() then raise exception 'Solo la admin puede eliminar alumnas'; end if;
  if not exists (select 1 from perfiles where id = p_alumna and rol = 'alumna') then
    raise exception 'No se encontró la alumna';
  end if;
  delete from auth.users where id = p_alumna;   -- en cascada: perfil y todos sus datos
end $$;

revoke all on function admin_borrar_alumna(uuid) from public, anon;
grant execute on function admin_borrar_alumna(uuid) to authenticated;
