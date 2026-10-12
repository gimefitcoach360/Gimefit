import { useState } from 'react'
import { supabase } from '../supabase'

// Las cuentas las crea Gime desde Supabase (usuario + contraseña) y se las pasa a cada alumna.
// Por eso acá solo se entra: no hay registro ni recuperación por mail.
export default function Login() {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError(''); setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    if (error) setError(traducir(error.message))
    setEnviando(false)
  }

  return (
    <div className="app">
      <form onSubmit={enviar} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 28px', gap: 24 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 64, lineHeight: 0.9, letterSpacing: 1 }}>
            GIME<span style={{ color: 'var(--violet)' }}>FIT</span>
          </div>
          <div className="muted" style={{ fontSize: 15, marginTop: 6 }}>Entrenamiento, nutrición y coaching</div>
        </div>

        <div className="stack" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="email">Usuario</label>
            <input id="email" className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)}
                   autoComplete="username" autoCapitalize="none" placeholder="tunombre@gimefit.com" />
          </div>
          <div className="field">
            <label htmlFor="pass">Contraseña</label>
            <input id="pass" className="input" type="password" required value={pass} onChange={e => setPass(e.target.value)}
                   autoComplete="current-password" />
          </div>
        </div>

        <div className="card card--violet" style={{ gap: 4 }}>
          <div className="kicker">Al entrar</div>
          <div style={{ fontSize: 15 }}>vas directo a tu próximo entrenamiento.</div>
        </div>

        {error && <div className="error" role="alert">{error}</div>}

        <button className="btn" type="submit" disabled={enviando}>{enviando ? 'Un momento…' : 'Entrar'}</button>

        <div className="muted" style={{ textAlign: 'center' }}>¿Olvidaste tu usuario o contraseña? Escribile a Gime.</div>
      </form>
    </div>
  )
}

function traducir(m = '') {
  if (m.includes('Invalid login')) return 'Usuario o contraseña incorrectos.'
  return 'No se pudo entrar. Revisá tu conexión y probá de nuevo.'
}
