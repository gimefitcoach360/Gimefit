export const FASES = { 1: 'Activación', 2: 'Progresión', 3: 'Consolidación' }

export const COMIDAS = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'almuerzo', label: 'Almuerzo' },
  { id: 'merienda', label: 'Merienda' },
  { id: 'cena', label: 'Cena' },
]

export const HAMBRE = [
  { id: 'fisica', label: 'Física' },
  { id: 'emocional', label: 'Emocional' },
  { id: 'no_se', label: 'No sé' },
]

export const GRUPOS = [
  { id: 'proteina', label: 'Proteína' },
  { id: 'verduras', label: 'Verduras' },
  { id: 'carbohidratos', label: 'Carbohidratos' },
  { id: 'grasas', label: 'Grasas' },
]

export const SENSACIONES = ['Con energía', 'Tranquila', 'Cansada', 'Ansiosa', 'Orgullosa']

export const EMOCIONES = ['Calma', 'Motivación', 'Ansiedad', 'Estrés', 'Tristeza', 'Enojo', 'Cansancio']

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export const VASOS_OBJETIVO = 8

const TZ = 'America/Argentina/Buenos_Aires'

/** Fecha de hoy en Argentina, formato YYYY-MM-DD */
export function hoyAR(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Día de la semana en Argentina: 1 = lunes … 7 = domingo */
export function diaSemanaAR(d = new Date()) {
  const corto = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d)
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[corto]
}

/** Las 7 fechas (YYYY-MM-DD) de la semana actual, de lunes a domingo */
export function semanaActualAR() {
  const hoy = new Date()
  const offset = diaSemanaAR(hoy) - 1
  return Array.from({ length: 7 }, (_, i) => hoyAR(new Date(hoy.getTime() + (i - offset) * 86400000)))
}
