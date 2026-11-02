import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth'
import { useCola } from '../lib/offline'

/** Franja arriba de todo cuando no hay señal o quedan cambios por mandar */
export default function EstadoConexion() {
  const { user } = useAuth()
  const { online, pendientes } = useCola(user?.id)
  // Con señal, los envíos tardan menos de un segundo: la franja solo aparece si algo quedó trabado,
  // así no se mueve la pantalla cada vez que la alumna tilda una serie
  const [trabado, setTrabado] = useState(false)
  useEffect(() => {
    if (!online || !pendientes) { setTrabado(false); return }
    const t = setTimeout(() => setTrabado(true), 5000)
    return () => clearTimeout(t)
  }, [online, pendientes])
  if (online && (!pendientes || !trabado)) return null
  const n = pendientes === 1 ? '1 cambio' : `${pendientes} cambios`
  return (
    <div role="status" style={{
      position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
      padding: '8px 16px', fontSize: 13, fontWeight: 500, background: online ? 'var(--violet-deep, #6B21A8)' : '#27272A', color: '#fff',
    }}>
      {online ? <RefreshCw size={14} aria-hidden="true" /> : <CloudOff size={14} aria-hidden="true" />}
      {online
        ? `Enviando ${n}…`
        : pendientes ? `Sin señal · ${n} guardados en el celu, se mandan solos` : 'Sin señal · lo que cargues se guarda en el celu'}
    </div>
  )
}
