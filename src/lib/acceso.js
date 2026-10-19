import { diasHasta } from './fechas'

export const SECCIONES = [
  { id: 'entreno', label: 'Entreno', ruta: '/entreno' },
  { id: 'nutricion', label: 'Nutrición', ruta: '/nutricion' },
  { id: 'coaching', label: 'Coaching', ruta: '/coaching' },
]

export const seccionesDe = perfil => perfil?.secciones ?? SECCIONES.map(s => s.id)
export const vencido = perfil => perfil?.vence ? diasHasta(perfil.vence) < 0 : false

/** La alumna puede usar la app: está activa y su plan no venció */
export const tieneAcceso = perfil => perfil?.activa !== false && !vencido(perfil)
