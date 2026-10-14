import { useEffect, useRef, useState } from 'react'
import { Timer, X } from 'lucide-react'

function pitido() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.25, 0.5].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination)
      g.gain.setValueAtTime(0.25, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18)
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2)
    })
  } catch { /* sin audio */ }
}

const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * Cuenta regresiva de descanso. Se reinicia cada vez que cambia `inicio`
 * (un objeto { segundos, id } que se crea al marcar una serie).
 */
export default function TimerDescanso({ inicio, onCerrar }) {
  const [fin, setFin] = useState(null)
  const [resta, setResta] = useState(0)
  const [terminado, setTerminado] = useState(false)
  const avisado = useRef(false)

  useEffect(() => {
    if (!inicio) return
    setFin(Date.now() + inicio.segundos * 1000)
    setTerminado(false); avisado.current = false
  }, [inicio])

  useEffect(() => {
    if (!fin) return
    const tick = () => {
      const s = Math.max(0, Math.ceil((fin - Date.now()) / 1000))
      setResta(s)
      if (s === 0 && !avisado.current) {
        avisado.current = true
        setTerminado(true)
        pitido()
        try { navigator.vibrate?.([200, 100, 200]) } catch { /* sin vibración */ }
        setTimeout(onCerrar, 4000)
      }
    }
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [fin, onCerrar])

  if (!inicio || !fin) return null
  const total = inicio.segundos
  const pct = total ? Math.round((1 - resta / total) * 100) : 100

  return (
    <div role="timer" aria-live="polite" style={{
      position: 'fixed', left: 0, right: 0, bottom: 'calc(76px + env(safe-area-inset-bottom))', zIndex: 20,
      display: 'flex', justifyContent: 'center', padding: '0 12px', pointerEvents: 'none' }}>
      <div style={{ width: '100%', maxWidth: 496, pointerEvents: 'auto', borderRadius: 16, overflow: 'hidden',
                    background: terminado ? 'var(--violet)' : '#16101F', border: '1px solid var(--violet-line)', boxShadow: '0 8px 24px rgba(0,0,0,.5)' }}>
        <div style={{ height: 4, background: 'var(--line)' }}><div style={{ height: 4, width: `${pct}%`, background: 'var(--violet)', transition: 'width .25s linear' }} /></div>
        <div className="between" style={{ padding: '10px 12px', color: terminado ? '#000' : 'var(--text)' }}>
          <span className="row" style={{ gap: 8, fontWeight: 700 }}>
            <Timer size={18} aria-hidden="true" />
            {terminado ? '¡A la próxima serie!' : <>Descanso <span style={{ fontFamily: 'var(--display)', fontSize: 26, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>{fmt(resta)}</span></>}
          </span>
          {!terminado && (
            <span className="row" style={{ gap: 6 }}>
              <button className="chip" style={{ minHeight: 36, padding: '0 10px' }} onClick={() => setFin(f => Math.max(Date.now(), f - 15000))} aria-label="Restar 15 segundos">−15</button>
              <button className="chip" style={{ minHeight: 36, padding: '0 10px' }} onClick={() => setFin(f => f + 15000)} aria-label="Sumar 15 segundos">+15</button>
              <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={onCerrar} aria-label="Saltar descanso"><X size={16} aria-hidden="true" /></button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
