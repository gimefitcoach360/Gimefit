import { useEffect, useState } from 'react'
import { CalendarClock, MessageCircle, X } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { estadoVencimiento, formatoFecha } from '../lib/fechas'

const CLAVE_CERRADO = 'gimefit-mensaje-cerrado'
const leerCerrado = () => { try { return localStorage.getItem(CLAVE_CERRADO) } catch { return null } }
const guardarCerrado = id => { try { localStorage.setItem(CLAVE_CERRADO, id) } catch { /* sin almacenamiento */ } }

/** Mensaje de Gime (últimos 14 días) y aviso de vencimiento del plan */
export default function Avisos() {
  const { user, perfil } = useAuth()
  const [mensaje, setMensaje] = useState(null)
  const [cerrado, setCerrado] = useState(leerCerrado())

  useEffect(() => {
    const desde = new Date(Date.now() - 14 * 86400000).toISOString()
    supabase.from('mensajes').select('*').eq('alumna_id', user.id).gte('created_at', desde)
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => setMensaje(data?.[0] || null))
  }, [user.id])

  const plan = estadoVencimiento(perfil?.vence)
  const mostrarPlan = plan && plan.nivel !== 'ok'
  const mostrarMensaje = mensaje && mensaje.id !== cerrado
  if (!mostrarPlan && !mostrarMensaje) return null

  return (
    <>
      {mostrarPlan && (
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: '#7F1D1D', background: '#2A1210' }}>
          <CalendarClock size={22} aria-hidden="true" style={{ color: '#FCA5A5', flexShrink: 0 }} />
          <div style={{ fontSize: 14, lineHeight: 1.45 }}>
            <b style={{ color: '#FCA5A5' }}>{plan.nivel === 'vencido' ? 'Tu plan venció' : plan.texto.replace('Vence', 'Tu plan vence')}</b>
            {plan.nivel !== 'vencido' && <> ({formatoFecha(perfil.vence, { day: 'numeric', month: 'long' })})</>}.
            {' '}Escribile a Gime para renovarlo y seguir sin cortar.
          </div>
        </div>
      )}
      {mostrarMensaje && (
        <div className="card card--violet" style={{ gap: 6 }}>
          <div className="between">
            <span className="kicker row" style={{ gap: 6 }}><MessageCircle size={14} aria-hidden="true" />Mensaje de Gime · {formatoFecha(mensaje.created_at)}</span>
            <button className="icon-btn" aria-label="Cerrar mensaje" style={{ background: 'transparent', border: 'none', width: 32, height: 32 }}
                    onClick={() => { guardarCerrado(mensaje.id); setCerrado(mensaje.id) }}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{mensaje.texto}</div>
        </div>
      )}
    </>
  )
}
