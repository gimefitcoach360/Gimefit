import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { configurado } from './supabase'
import { BottomNav, Cargando } from './components/ui'
import Login from './pages/Login'
import Entreno from './pages/Entreno'
import Nutricion from './pages/Nutricion'
import Coaching from './pages/Coaching'
import EstadoConexion from './components/EstadoConexion'
import Pausada from './pages/Pausada'
import { SECCIONES, seccionesDe, tieneAcceso } from './lib/acceso'
const Progreso = lazy(() => import('./pages/Progreso'))
const AdminHome = lazy(() => import('./pages/admin/AdminHome'))
const AdminRutina = lazy(() => import('./pages/admin/AdminRutina'))
const AdminAlumna = lazy(() => import('./pages/admin/AdminAlumna'))
const AdminComidas = lazy(() => import('./pages/admin/AdminComidas'))
const AdminEjercicios = lazy(() => import('./pages/admin/AdminEjercicios'))

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
          <Route path="/admin/ejercicios" element={<AdminEjercicios />} />
          <Route path="/admin/alumna/:id" element={<AdminAlumna />} />
          <Route path="/admin/alumna/:id/rutina" element={<AdminRutina />} />
          <Route path="/admin/alumna/:id/comidas" element={<AdminComidas />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
        </Suspense>
      </div>
    )
  }

  // Plan pausado o vencido: no entra a la app
  if (!tieneAcceso(perfil)) return <div className="app"><Pausada /></div>

  const mias = seccionesDe(perfil)
  const PAGINAS = { entreno: <Entreno />, nutricion: <Nutricion />, coaching: <Coaching /> }
  // Al entrar, directo al próximo entrenamiento (o a la primera sección que tenga)
  const inicio = SECCIONES.find(s => mias.includes(s.id))?.ruta || '/progreso'

  return (
    <div className="app">
      <EstadoConexion />
      <Suspense fallback={<Cargando />}>
      <Routes>
        {SECCIONES.filter(s => mias.includes(s.id)).map(s => <Route key={s.id} path={s.ruta} element={PAGINAS[s.id]} />)}
        <Route path="/progreso" element={<Progreso />} />
        <Route path="*" element={<Navigate to={inicio} replace />} />
      </Routes>
      </Suspense>
      <BottomNav secciones={mias} />
    </div>
  )
}
