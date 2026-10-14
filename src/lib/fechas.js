import { hoyAR } from './constantes'

const DIA_MS = 86400000

/** Días que faltan hasta una fecha YYYY-MM-DD (negativo si ya pasó) */
export function diasHasta(fecha) {
  if (!fecha) return null
  const hoy = new Date(hoyAR() + 'T12:00:00')
  const fin = new Date(fecha + 'T12:00:00')
  return Math.round((fin - hoy) / DIA_MS)
}

export function formatoFecha(fecha, opciones = { day: 'numeric', month: 'short' }) {
  if (!fecha) return ''
  const d = typeof fecha === 'string' && fecha.length === 10 ? new Date(fecha + 'T12:00:00') : new Date(fecha)
  return d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', ...opciones })
}

/** Estado del plan según la fecha de vencimiento */
export function estadoVencimiento(vence) {
  const dias = diasHasta(vence)
  if (dias === null) return null
  if (dias < 0) return { nivel: 'vencido', texto: 'Plan vencido', dias }
  if (dias === 0) return { nivel: 'pronto', texto: 'Vence hoy', dias }
  if (dias <= 7) return { nivel: 'pronto', texto: `Vence en ${dias} día${dias > 1 ? 's' : ''}`, dias }
  return { nivel: 'ok', texto: `Vence el ${formatoFecha(vence)}`, dias }
}
