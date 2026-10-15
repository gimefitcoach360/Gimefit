import { useEffect, useState } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { supabase } from '../supabase'
import { Chip } from './ui'

const DIAS = [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']]
const NOMBRE_DIA = { 0: 'domingo', 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado' }
const HORAS = Array.from({ length: 18 }, (_, i) => i + 6)   // 6 a 23 h

const soporta = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
const espera = ms => new Promise(r => setTimeout(r, ms))

function claveABytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function suscripcionActual() {
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** La alumna activa recordatorios en su celu y elige días y hora */
export default function Recordatorios() {
  const [estado, setEstado] = useState('cargando')   // cargando | no-soporta | ios | apagado | activo | bloqueado
  const [hora, setHora] = useState(19)
  const [dias, setDias] = useState([1, 2, 3, 4, 5])
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!soporta()) return setEstado(esIOS() && !instalada() ? 'ios' : 'no-soporta')
      if (Notification.permission === 'denied') return setEstado('bloqueado')
      const sub = await suscripcionActual()
      if (!sub) return vivo && setEstado('apagado')
      const { data } = await supabase.from('push_suscripciones').select('hora, dias').eq('endpoint', sub.endpoint).maybeSingle()
      if (!vivo) return
      if (data) { setHora(data.hora); setDias(data.dias); setEstado('activo') } else setEstado('apagado')
    })()
    return () => { vivo = false }
  }, [])

  async function guardarEnServidor(sub, h, d) {
    const { keys } = sub.toJSON()
    const { error } = await supabase.rpc('guardar_suscripcion', { p_endpoint: sub.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_hora: h, p_dias: d })
    if (error) throw error
  }

  async function activar() {
    setError(''); setMsg(''); setOcupado(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'bloqueado' : 'apagado'); return }

      // La primera vez, las claves se crean en Supabase: esperamos unos segundos
      let { data: clave } = await supabase.rpc('vapid_publica')
      if (!clave) {
        await supabase.rpc('pedir_push', { p_tipo: 'preparar' })
        for (let i = 0; i < 5 && !clave; i++) { await espera(2000); ({ data: clave } = await supabase.rpc('vapid_publica')) }
      }
      if (!clave) throw new Error('Los recordatorios todavía no están listos. Avisale a Gime.')

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clave) })
      await guardarEnServidor(sub, hora, dias)
      setEstado('activo'); setMsg('¡Listo! Tocá "Probar" para ver cómo llegan.')
    } catch (e) {
      setError(e.message?.startsWith('Los recordatorios') ? e.message : 'No se pudieron activar. Probá de nuevo en un rato.')
    } finally {
      setOcupado(false)
    }
  }

  async function cambiar(h, d) {
    setHora(h); setDias(d); setMsg(''); setError('')
    if (estado !== 'activo') return
    try {
      const sub = await suscripcionActual()
      if (sub) await guardarEnServidor(sub, h, d)
    } catch { setError('No se pudo guardar el cambio. Revisá tu conexión.') }
  }

  async function desactivar() {
    setOcupado(true); setMsg(''); setError('')
    const sub = await suscripcionActual()
    if (sub) { await supabase.rpc('borrar_suscripcion', { p_endpoint: sub.endpoint }); await sub.unsubscribe().catch(() => {}) }
    setEstado('apagado'); setOcupado(false)
  }

  async function probar() {
    setMsg(''); setError('')
    const { error } = await supabase.rpc('pedir_push', { p_tipo: 'prueba' })
    setMsg(error ? '' : 'Enviada. Te tiene que llegar en unos segundos.')
    if (error) setError('No se pudo enviar la prueba.')
  }

  if (estado === 'cargando') return null
  const toggleDia = n => cambiar(hora, dias.includes(n) ? dias.filter(x => x !== n) : [...dias, n].sort())
  const resumen = dias.length === 7 ? 'todos los días'
    : dias.length ? [1, 2, 3, 4, 5, 6, 0].filter(n => dias.includes(n)).map(n => NOMBRE_DIA[n]).join(', ') : 'ningún día'

  return (
    <section className="card">
      <div>
        <h2 className="card__title">Recordatorios</h2>
        <div className="muted">Un aviso en el celu para que no se te pase el entreno ni el check-in. Si ya hiciste todo, no te llega nada.</div>
      </div>

      {estado === 'ios' && (
        <div className="notice">En iPhone, primero agregá Gimefit a la pantalla de inicio: tocá <b>Compartir</b> → <b>Agregar a inicio</b>. Después abrila desde ese ícono y activá los recordatorios acá.</div>
      )}
      {estado === 'no-soporta' && <div className="notice">Este navegador no permite notificaciones. Probá desde Chrome (Android) o agregando la app a la pantalla de inicio (iPhone).</div>}
      {estado === 'bloqueado' && <div className="notice">Las notificaciones están bloqueadas para Gimefit. Habilitalas en los ajustes del celu (Notificaciones → Gimefit, o en los permisos del sitio) y volvé a entrar.</div>}

      {(estado === 'apagado' || estado === 'activo') && (
        <>
          <div className="field">
            <span className="label">Qué días</span>
            <div className="row" style={{ gap: 6 }}>
              {DIAS.map(([n, l]) => (
                <Chip key={n} on={dias.includes(n)} onClick={() => toggleDia(n)} aria-label={NOMBRE_DIA[n]} style={{ minWidth: 38, justifyContent: 'center' }}>{l}</Chip>
              ))}
            </div>
          </div>
          <label className="field"><span className="label">A qué hora</span>
            <select className="input input--sm" value={hora} onChange={e => cambiar(Number(e.target.value), dias)}>
              {HORAS.map(h => <option key={h} value={h}>{h}:00 h</option>)}
            </select>
          </label>

          {estado === 'activo' ? (
            <>
              <div className="notice" role="status"><Bell size={14} aria-hidden="true" /> Activados: {resumen} a las {hora}:00 h.</div>
              <div className="grid2" style={{ gap: 8 }}>
                <button className="btn btn--ghost btn--sm" onClick={probar}><Send size={16} aria-hidden="true" />Probar</button>
                <button className="btn btn--ghost btn--sm" onClick={desactivar} disabled={ocupado}><BellOff size={16} aria-hidden="true" />Desactivar</button>
              </div>
            </>
          ) : (
            <button className="btn btn--sm" onClick={activar} disabled={ocupado || !dias.length}>
              <Bell size={16} aria-hidden="true" />{ocupado ? 'Activando…' : 'Activar recordatorios'}
            </button>
          )}
        </>
      )}
      {msg && <div className="muted" role="status">{msg}</div>}
      {error && <div className="error" role="alert">{error}</div>}
    </section>
  )
}
