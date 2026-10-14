const PALABRAS = ['fuerza', 'foco', 'ritmo', 'pulso', 'meta', 'vital', 'impulso', 'energia', 'avance', 'logro']

/** Contraseña fácil de dictar o escribir: palabra + 4 números (ej: foco4827) */
export function generarClave() {
  const p = PALABRAS[Math.floor(Math.random() * PALABRAS.length)]
  const n = String(Math.floor(1000 + Math.random() * 9000))
  return p + n
}

/** Convierte "Valentina López" en "valentina.lopez" para el usuario */
export function sugerirUsuario(nombre) {
  return nombre.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
}

export const DOMINIO = '@gimefit.com'
export const APP_URL = 'https://gimefit.vercel.app'

export function mensajeAcceso(nombre, usuario, clave) {
  return `¡Hola ${nombre}! Ya tenés tu acceso a Gimefit 💜\n\nEntrá en ${APP_URL}\nUsuario: ${usuario.replace(DOMINIO, '')}\nContraseña: ${clave}\n\nTe recomiendo agregarla a la pantalla de inicio del celu.`
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true } catch { return false }
}
