import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { limpiarDatosGuardados } from './lib/offline'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [perfil, setPerfil] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setPerfil(null); return }
    supabase.from('perfiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => setPerfil(data || { rol: 'alumna', nombre: '' }))
  }, [session])

  const value = {
    session,
    user: session?.user ?? null,
    perfil,
    cargando: session === undefined || (session && !perfil),
    salir: async () => { await limpiarDatosGuardados(); return supabase.auth.signOut() },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
