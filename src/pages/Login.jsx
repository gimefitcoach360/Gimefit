import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [modo, setModo] = useState('entrar') // entrar | crear | recuperar
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError(''); setMsg(''); setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw error
      } else if (modo === 'crear') {
        const { error } = await supabase.auth.signUp({ email, password: pass, options: { data: { nombre } } })
        if (error) throw error
        setMsg('¡Listo! Revisá tu mail para confirmar la cuenta y después entrá.')
        setModo('entrar')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setMsg('Te mandamos un mail para crear una contraseña nueva.')
        setModo('entrar')
      }
    } catch (err) {
      setError(traducir(err.message))
    } finally {
      setEnviando(false)
    }
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
          {modo === 'crear' && (
            <div className="field">
              <label htmlFor="nombre">Nombre</label>
              <input id="nombre" className="input" required value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="given-name" />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="tu@email.com" />
          </div>
          {modo !== 'recuperar' && (
            <div className="field">
              <label htmlFor="pass">Contraseña</label>
              <input id="pass" className="input" type="password" required minLength={6} value={pass} onChange={e => setPass(e.target.value)}
                     autoComplete={modo === 'crear' ? 'new-password' : 'current-password'} />
            </div>
          )}
        </div>

        {modo === 'entrar' && (
          <div className="card card--violet" style={{ gap: 4 }}>
            <div className="kicker">Al entrar</div>
            <div style={{ fontSize: 15 }}>vas directo a tu próximo entrenamiento.</div>
          </div>
        )}

        {error && <div className="error" role="alert">{error}</div>}
        {msg && <div className="notice" role="status">{msg}</div>}

        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : modo === 'crear' ? 'Crear cuenta' : 'Enviar mail'}
        </button>

        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {modo !== 'entrar' && <button type="button" className="btn-link" onClick={() => setModo('entrar')}>Ya tengo cuenta</button>}
          {modo !== 'crear' && <button type="button" className="btn-link" onClick={() => setModo('crear')}>Crear cuenta</button>}
          {modo !== 'recuperar' && <button type="button" className="btn-link" onClick={() => setModo('recuperar')}>Olvidé mi contraseña</button>}
        </div>
      </form>
    </div>
  )
}

function traducir(m = '') {
  if (m.includes('Invalid login')) return 'Email o contraseña incorrectos.'
  if (m.includes('Email not confirmed')) return 'Todavía no confirmaste tu mail. Revisá tu bandeja de entrada.'
  if (m.includes('already registered')) return 'Ese mail ya tiene cuenta. Probá entrar.'
  if (m.includes('Password should be')) return 'La contraseña tiene que tener al menos 6 caracteres.'
  return 'Algo salió mal. Probá de nuevo en un rato.'
}
