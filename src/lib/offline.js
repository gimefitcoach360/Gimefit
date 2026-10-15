import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '../supabase'

/**
 * Cola de cambios sin enviar (para entrenar sin señal).
 * Todo lo que la alumna carga en Entreno pasa por acá: se guarda primero en el celu
 * y se manda a Supabase apenas hay conexión. Si se corta, queda guardado y se reintenta solo.
 * Item: { tipo: 'serie' | 'dia', clave, user, fila }
 */
const KEY = 'gimefit-cola'
const oyentes = new Set()
let enviando = null
let version = 0

function leer() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}
function escribir(lista) {
  try { localStorage.setItem(KEY, JSON.stringify(lista)) } catch { /* sin espacio: seguimos */ }
  version++
  oyentes.forEach(f => f())
}

export const esErrorDeRed = e => !!e && (!e.code || (typeof navigator !== 'undefined' && !navigator.onLine))

/** Agrega (o reemplaza: gana el último valor) un cambio a la cola */
export function encolar(item) {
  const lista = leer().filter(x => !(x.tipo === item.tipo && x.clave === item.clave))
  lista.push({ ...item, id: Date.now().toString(36) + Math.random().toString(36).slice(2) })
  escribir(lista)
}

export const colaDe = (user, tipo) => leer().filter(x => x.user === user && (!tipo || x.tipo === tipo))

/**
 * Manda la cola de esta alumna. Primero las series y después los días terminados,
 * así el resumen a Gime sale completo. Devuelve { pendientes, error }.
 */
export function enviarCola(user) {
  if (!user) return Promise.resolve({ pendientes: 0 })
  if (enviando) return enviando.then(() => enviarCola(user))
  enviando = (async () => {
    let error = null
    // Se quita solo lo que se mandó: si mientras tanto cambió, queda el valor nuevo
    const quitar = ids => escribir(leer().filter(x => !ids.has(x.id)))

    const series = colaDe(user, 'serie')
    if (series.length) {
      const { error: e } = await supabase.from('registros_series')
        .upsert(series.map(x => x.fila), { onConflict: 'ejercicio_id,serie_numero' })
      if (!e) quitar(new Set(series.map(x => x.id)))
      else if (esErrorDeRed(e)) return { pendientes: colaDe(user).length }
      else {
        // Alguna fila tiene un problema (ej: Gime borró ese ejercicio): las mandamos de a una
        for (const x of series) {
          const { error: e1 } = await supabase.from('registros_series').upsert(x.fila, { onConflict: 'ejercicio_id,serie_numero' })
          if (esErrorDeRed(e1)) return { pendientes: colaDe(user).length }
          quitar(new Set([x.id]))
        }
      }
    }

    for (const x of colaDe(user, 'dia')) {
      const { error: e } = await supabase.from('dias_completados').insert(x.fila)
      if (esErrorDeRed(e)) return { pendientes: colaDe(user).length, error }
      if (e && e.code !== '23505') error = e   // 23505 = ya estaba guardado
      quitar(new Set([x.id]))
    }
    return { pendientes: colaDe(user).length, error }
  })().finally(() => { enviando = null })
  return enviando
}

const suscribir = f => {
  oyentes.add(f)
  const conexion = () => f()
  window.addEventListener('online', conexion); window.addEventListener('offline', conexion)
  return () => { oyentes.delete(f); window.removeEventListener('online', conexion); window.removeEventListener('offline', conexion) }
}

/** Estado de la conexión y cuántos cambios faltan mandar. Reintenta solo. */
export function useCola(user) {
  const snap = useSyncExternalStore(suscribir, () => `${version}|${navigator.onLine}`)
  const pendientes = user ? colaDe(user).length : 0
  const online = snap.endsWith('true')

  useEffect(() => {
    if (!user) return
    enviarCola(user)
    const alVolver = () => enviarCola(user)
    window.addEventListener('online', alVolver)
    const t = setInterval(() => { if (colaDe(user).length) enviarCola(user) }, 30000)
    return () => { window.removeEventListener('online', alVolver); clearInterval(t) }
  }, [user])

  return { online, pendientes }
}

/** Al cerrar sesión: borra la copia de datos guardada en el celu */
export async function limpiarDatosGuardados() {
  try { await caches.delete('gimefit-datos-v1') } catch { /* sin caché */ }
}
