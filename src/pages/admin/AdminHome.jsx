import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Dumbbell, LogOut, Utensils } from 'lucide-react'
import { supabase } from '../../supabase'
import { useAuth } from '../../auth'
import { Cargando, Header } from '../../components/ui'

export default function AdminHome() {
  const { salir } = useAuth()
  const [alumnas, setAlumnas] = useState(null)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    supabase.from('perfiles').select('*').eq('rol', 'alumna').order('nombre')
      .then(({ data }) => setAlumnas(data || []))
  }, [])

  if (!alumnas) return <Cargando />
  const lista = alumnas.filter(a => (a.nombre + ' ' + (a.email || '')).toLowerCase().includes(filtro.toLowerCase()))

  return (
    <>
      <Header kicker={<span className="badge">ADMIN</span>} title="Mis alumnas" sub={`${alumnas.length} en total`}
              right={<button className="icon-btn" onClick={salir} aria-label="Cerrar sesión"><LogOut size={18} aria-hidden="true" /></button>}>
        <div className="field">
          <label htmlFor="buscar" className="sr-only" style={{ position: 'absolute', left: -9999 }}>Buscar alumna</label>
          <input id="buscar" className="input" placeholder="Buscar por nombre o mail" value={filtro} onChange={e => setFiltro(e.target.value)} />
        </div>
      </Header>
      <div className="body" style={{ paddingBottom: 40 }}>
        {alumnas.length === 0 && (
          <div className="notice">Todavía no hay alumnas. Cuando se registren en la app con su mail, aparecen acá automáticamente.</div>
        )}
        {lista.map(a => (
          <section key={a.id} className="card">
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2 className="card__name">{a.nombre}</h2>
                <div className="muted">{a.email}</div>
                <div className="faint">Inicio: {new Date(a.fecha_inicio + 'T12:00:00').toLocaleDateString('es-AR')}</div>
              </div>
              {!a.activa && <span className="badge" style={{ background: 'var(--line-3)', color: '#fff' }}>INACTIVA</span>}
            </div>
            <div className="grid2" style={{ gap: 8 }}>
              <Link className="btn btn--ghost btn--sm" to={`/admin/alumna/${a.id}/rutina`} style={{ textDecoration: 'none' }}>
                <Dumbbell size={16} aria-hidden="true" />Rutina
              </Link>
              <Link className="btn btn--ghost btn--sm" to={`/admin/alumna/${a.id}/comidas`} style={{ textDecoration: 'none' }}>
                <Utensils size={16} aria-hidden="true" />Comidas
              </Link>
            </div>
          </section>
        ))}
        <div className="faint" style={{ lineHeight: 1.5 }}>
          Las actividades de coaching son las mismas para todas y ya están cargadas. Si querés editar alguna, se cambia en Supabase → Table Editor → actividades.
        </div>
      </div>
    </>
  )
}
