import { PauseCircle } from 'lucide-react'
import { useAuth } from '../auth'
import { vencido } from '../lib/acceso'
import { formatoFecha } from '../lib/fechas'

/** Lo que ve una alumna con el plan pausado o vencido */
export default function Pausada() {
  const { perfil, salir } = useAuth()
  const vencio = vencido(perfil)
  return (
    <div className="body" style={{ paddingTop: 64, gap: 20 }}>
      <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--violet-bg)', border: '1px solid var(--violet-line)',
                    color: 'var(--violet-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PauseCircle size={36} aria-hidden="true" />
      </div>
      <div>
        <div className="kicker">Hola{perfil?.nombre ? `, ${perfil.nombre.split(' ')[0]}` : ''}</div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 48, lineHeight: 0.95, margin: '6px 0 0', fontWeight: 400 }}>
          {vencio ? 'Tu plan venció' : 'Tu plan está en pausa'}
        </h1>
      </div>
      <p className="muted" style={{ fontSize: 16, margin: 0 }}>
        {vencio
          ? `Terminó el ${formatoFecha(perfil.vence, { day: 'numeric', month: 'long' })}. `
          : ''}
        Escribile a Gime para {vencio ? 'renovarlo' : 'volver a activarlo'}. Todo lo que registraste quedó guardado y lo vas a encontrar igual cuando vuelvas 💜
      </p>
      <button className="btn btn--ghost" onClick={salir}>Cerrar sesión</button>
    </div>
  )
}
