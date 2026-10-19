import { useState } from 'react'
import { supabase } from '../supabase'
import { tieneAcceso, vencido } from '../lib/acceso'
import { formatoFecha } from '../lib/fechas'

/**
 * Botón Activa / Inactiva de una alumna (panel de Gime).
 * Inactiva = no puede entrar a la app; sus datos quedan guardados.
 */
export default function BotonActiva({ alumna, onCambio, grande = false }) {
  const [guardando, setGuardando] = useState(false)
  const activa = tieneAcceso(alumna)

  async function cambiar() {
    if (!activa && vencido(alumna)) {
      window.alert(`El plan de ${alumna.nombre} venció el ${formatoFecha(alumna.vence, { day: 'numeric', month: 'long' })}. Para activarla, entrá a su ficha y poné la nueva fecha de vencimiento: se activa sola.`)
      return
    }
    if (activa && !window.confirm(`¿Pausar a ${alumna.nombre}? No va a poder entrar a la app hasta que la vuelvas a activar. Todo lo que cargó queda guardado.`)) return
    setGuardando(true)
    const { error } = await supabase.from('perfiles').update({ activa: !activa }).eq('id', alumna.id)
    setGuardando(false)
    if (error) return window.alert('No se pudo guardar el cambio. Probá de nuevo.')
    onCambio?.(!activa)
  }

  return (
    <button type="button" onClick={cambiar} disabled={guardando} aria-pressed={activa}
            aria-label={`${alumna.nombre}: ${activa ? 'activa' : 'inactiva'}. Tocá para ${activa ? 'pausarla' : 'activarla'}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, cursor: 'pointer',
              minHeight: grande ? 44 : 34, padding: grande ? '0 16px' : '0 12px', borderRadius: 999,
              font: `700 ${grande ? 14 : 12}px var(--body, sans-serif)`,
              background: activa ? 'var(--violet-bg)' : 'var(--surface-2, #18181B)',
              color: activa ? 'var(--violet-soft)' : 'var(--muted)',
              border: `1px solid ${activa ? 'var(--violet-line)' : 'var(--line-2, #27272A)'}`,
            }}>
      <span aria-hidden="true" style={{
        width: 9, height: 9, borderRadius: 9,
        background: activa ? 'var(--violet)' : 'transparent', border: activa ? 'none' : '1.5px solid var(--muted)',
      }} />
      {guardando ? 'Guardando…' : activa ? 'Activa' : 'Inactiva'}
    </button>
  )
}
