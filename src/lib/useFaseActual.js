import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { colaDe } from './offline'
import { faseInicio } from './acceso'
import { useAuth } from '../auth'

/**
 * Fase y semana en la que está la alumna: la del primer día de rutina sin completar.
 * Si ya completó todo, la del último día cargado. Si no hay rutina, fase 1 semana 1.
 * (Usa lecturas comunes, así también funciona sin señal con la copia guardada.)
 */
export function useFaseActual(userId) {
  const [pos, setPos] = useState(null)
  const { perfil } = useAuth()
  const inicio = faseInicio(perfil)

  useEffect(() => {
    if (!userId) return
    let vivo = true
    ;(async () => {
      const [{ data: dias }, { data: comp }] = await Promise.all([
        supabase.from('rutina_dias').select('id, fase, semana').eq('alumna_id', userId).gte('fase', inicio)
          .order('fase').order('semana').order('dia_numero'),
        supabase.from('dias_completados').select('dia_id').eq('alumna_id', userId),
      ])
      const hechos = new Set([...(comp || []).map(c => c.dia_id), ...colaDe(userId, 'dia').map(q => q.fila.dia_id)])
      const lista = dias || []
      const p = lista.find(d => !hechos.has(d.id)) || lista[lista.length - 1]
      if (vivo) setPos({ fase: p?.fase ?? inicio, semana: p?.semana ?? 1, sinRutina: !p })
    })()
    return () => { vivo = false }
  }, [userId, inicio])

  return pos
}
