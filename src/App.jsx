import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { configurado } from './supabase'
import { BottomNav, Cargando } from './components/ui'
import Login from './pages/Login'
import Entreno from './pages/Entreno'
import Nutricion from './pages/Nutricion'
import Coaching from './pages/Coaching'
const Progreso = lazy(() => import('./pages/Progreso'))
const AdminHome = lazy(() => import('./pages/admin/AdminHome'))
const AdminRutina = lazy(() => import('./pages/admin/AdminRutina'))
const AdminComidas = lazy(() => import('./pages/admin/AdminComidas'))

export default function App() {
  const { session, perfil, cargando } = useAuth()

  if (!configurado) {
    return (
      <div className="app"><div className="body">
        <div className="notice">Falta configurar Supabase: cargá <b>VITE_SUPABASE_URL</b> y <b>VITE_SUPABASE_ANON_KEY</b> (ver README).</div>
      </div></div>
    )
  }
  if (session === null) return <Login />
  if (cargando) return <Cargando />

  if (perfil?.rol === 'admin') {
    return (
      <div className="app app--wide">
        <Suspense fallback={<Cargando />}>
        <Routes>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/alumna/:id/rutina" element={<AdminRutina />} />
          <Route path="/admin/alumna/:id/comidas" element={<AdminComidas />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
        </Suspense>
      </div>
    )
  }

  return (
    <div className="app">
      <Suspense fallback={<Cargando />}>
      <Routes>
        <Route path="/entreno" element={<Entreno />} />
        <Route path="/nutricion" element={<Nutricion />} />
        <Route path="/coaching" element={<Coaching />} />
        <Route path="/progreso" element={<Progreso />} />
        {/* Al entrar, siempre directo al próximo entrenamiento */}
        <Route path="*" element={<Navigate to="/entreno" replace />} />
      </Routes>
      </Suspense>
      <BottomNav />
    </div>
  )
}
