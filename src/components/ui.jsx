import { NavLink } from 'react-router-dom'
import { Check, Dumbbell, Heart, TrendingUp, Utensils } from 'lucide-react'

export function Chip({ on, onClick, children, ...rest }) {
  return (
    <button type="button" className={'chip' + (on ? ' chip--on' : '')} aria-pressed={!!on} onClick={onClick} {...rest}>
      {children}
    </button>
  )
}

export function CheckBtn({ on, onClick, label }) {
  return (
    <button type="button" className={'check' + (on ? ' check--on' : '')} aria-pressed={!!on} aria-label={label} onClick={onClick}>
      <Check size={20} strokeWidth={on ? 3 : 2.5} aria-hidden="true" />
    </button>
  )
}

export function DonePill({ children }) {
  return <div className="done-pill"><Check size={18} strokeWidth={3} aria-hidden="true" />{children}</div>
}

export function Cargando({ texto = 'Cargando…' }) {
  return <div className="center" role="status">{texto}</div>
}

export function Header({ kicker, title, sub, right, children }) {
  return (
    <header className="head">
      {(kicker || right) && (
        <div className="head__row">
          <div className="head__kicker">{kicker}</div>
          {right}
        </div>
      )}
      <div>
        <h1 className="head__title">{title}</h1>
        {sub && <div className="head__sub">{sub}</div>}
      </div>
      {children}
    </header>
  )
}

export function BottomNav({ secciones }) {
  const todos = [
    { to: '/entreno', label: 'Entreno', Icon: Dumbbell },
    { to: '/nutricion', label: 'Nutrición', Icon: Utensils },
    { to: '/coaching', label: 'Coaching', Icon: Heart },
    { to: '/progreso', label: 'Progreso', Icon: TrendingUp },
  ]
  // Progreso siempre; las otras, solo las que la alumna tiene habilitadas
  const items = todos.filter(i => i.to === '/progreso' || !secciones || secciones.includes(i.to.slice(1)))
  return (
    <nav className="nav" aria-label="Secciones">
      <div className="nav__in">
        {items.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to}>
            <Icon size={22} aria-hidden="true" />{label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
