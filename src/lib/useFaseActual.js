import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

/**
 * Fase y semana en la que está la alumna: la del primer día de rutina sin completar.
 * Si ya completó todo, la del último día cargado. Si no hay rutina, fase 1 semana 1.
 */
export function useFaseActual(userId) {
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!userId) return
    let vivo = true
    ;(async () => {
      const { data: sig } = await supabase.rpc('siguiente_dia')
      let p = sig?.[0]
      if (!p) {
        const { data: ult } = await supabase.from('rutina_dias').select('fase, semana')
          .eq('alumna_id', userId).order('fase', { ascending: false }).order('semana', { ascending: false }).limit(1)
        p = ult?.[0]
      }
      if (vivo) setPos({ fase: p?.fase ?? 1, semana: p?.semana ?? 1, sinRutina: !p })
    })()
    return () => { vivo = false }
  }, [userId])

  return pos
}
