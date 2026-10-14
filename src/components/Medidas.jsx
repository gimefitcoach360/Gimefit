import { useCallback, useEffect, useState } from 'react'
import { Camera, Check, ImagePlus } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { formatoFecha } from '../lib/fechas'

/** Achica la foto a 1280 px de lado como máximo (JPEG), para que suba rápido */
function comprimir(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.82)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('No se pudo leer la foto'))
    img.src = URL.createObjectURL(file)
  })
}

const num = v => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))
const dif = (a, b, u) => {
  if (a == null || b == null) return null
  const d = Math.round((Number(b) - Number(a)) * 10) / 10
  return `${d > 0 ? '+' : ''}${d.toLocaleString('es-AR')} ${u}`
}

export default function Medidas() {
  const { user } = useAuth()
  const [lista, setLista] = useState(null)
  const [fotos, setFotos] = useState({})
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState({ peso: '', cintura: '', cadera: '', notas: '' })
  const [foto, setFoto] = useState(null)
  const [previa, setPrevia] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('medidas').select('*').eq('alumna_id', user.id).order('fecha', { ascending: false })
    setLista(data || [])
    const paths = (data || []).filter(m => m.foto_path).map(m => m.foto_path)
    if (paths.length) {
      const { data: urls } = await supabase.storage.from('progreso').createSignedUrls(paths, 3600)
      setFotos(Object.fromEntries((urls || []).filter(u => u.signedUrl).map(u => [u.path, u.signedUrl])))
    }
  }, [user.id])

  useEffect(() => { cargar() }, [cargar])

  function elegirFoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFoto(file); setPrevia(URL.createObjectURL(file))
  }

  async function guardar(e) {
    e.preventDefault()
    setError(''); setOk('')
    if (!f.peso && !f.cintura && !f.cadera && !foto) return setError('Cargá al menos una medida o una foto.')
    setGuardando(true)
    try {
      let foto_path = null
      if (foto) {
        const blob = await comprimir(foto)
        foto_path = `${user.id}/${Date.now()}.jpg`
        const { error } = await supabase.storage.from('progreso').upload(foto_path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
      }
      const { error } = await supabase.from('medidas').insert({
        peso_kg: num(f.peso), cintura_cm: num(f.cintura), cadera_cm: num(f.cadera), notas: f.notas.trim() || null, foto_path,
      })
      if (error) throw error
      setF({ peso: '', cintura: '', cadera: '', notas: '' }); setFoto(null); setPrevia(null)
      setAbierto(false); setOk('¡Guardado! Gime también lo ve en tu ficha.')
      cargar()
    } catch (err) {
      setError('No se pudo guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (!lista) return null
  const primera = lista[lista.length - 1], ultima = lista[0]
  const cambios = lista.length > 1 ? [dif(primera.peso_kg, ultima.peso_kg, 'kg'), dif(primera.cintura_cm, ultima.cintura_cm, 'cm de cintura'), dif(primera.cadera_cm, ultima.cadera_cm, 'cm de cadera')].filter(Boolean) : []
  const conFoto = lista.filter(m => m.foto_path && fotos[m.foto_path])

  return (
    <section className="card">
      <div>
        <h2 className="card__title">Medidas y fotos</h2>
        <div className="muted">Cargalas una vez por mes, siempre en las mismas condiciones (a la mañana, en ayunas).</div>
      </div>

      {cambios.length > 0 && (
        <div className="card card--violet" style={{ gap: 4, padding: 12 }}>
          <span className="kicker">Desde que empezaste ({formatoFecha(primera.fecha)})</span>
          <span style={{ fontSize: 15 }}>{cambios.join(' · ')}</span>
        </div>
      )}

      {conFoto.length >= 2 && (
        <div className="grid2" style={{ gap: 8 }}>
          {[conFoto[conFoto.length - 1], conFoto[0]].map((m, i) => (
            <figure key={m.id} style={{ margin: 0 }}>
              <img src={fotos[m.foto_path]} alt={`Foto ${i ? 'más reciente' : 'inicial'}, ${formatoFecha(m.fecha)}`}
                   style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 12 }} />
              <figcaption className="faint" style={{ textAlign: 'center', marginTop: 4 }}>{i ? 'Ahora' : 'Antes'} · {formatoFecha(m.fecha)}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {ok && <div className="notice" role="status">{ok}</div>}

      {!abierto ? (
        <button className="btn btn--sm" onClick={() => { setAbierto(true); setOk('') }}><ImagePlus size={16} aria-hidden="true" />Cargar medidas de hoy</button>
      ) : (
        <form className="stack" style={{ gap: 10 }} onSubmit={guardar}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {[['peso', 'Peso (kg)'], ['cintura', 'Cintura (cm)'], ['cadera', 'Cadera (cm)']].map(([k, l]) => (
              <label key={k} className="field"><span className="label">{l}</span>
                <input className="input input--sm" type="number" inputMode="decimal" step="0.1" value={f[k]}
                       onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} /></label>
            ))}
          </div>
          <label className="field"><span className="label">Nota (opcional)</span>
            <input className="input input--sm" value={f.notas} placeholder="Ej: me siento con más energía" onChange={e => setF(x => ({ ...x, notas: e.target.value }))} /></label>
          <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
            <Camera size={16} aria-hidden="true" />{foto ? 'Cambiar foto' : 'Agregar foto (opcional)'}
            <input type="file" accept="image/*" onChange={elegirFoto} style={{ display: 'none' }} />
          </label>
          {previa && <img src={previa} alt="Foto elegida" style={{ width: 120, aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 12 }} />}
          <div className="faint">Tus fotos son privadas: solo las ven vos y Gime.</div>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="grid2" style={{ gap: 8 }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setAbierto(false); setError('') }}>Cancelar</button>
            <button type="submit" className="btn btn--sm" disabled={guardando}><Check size={16} aria-hidden="true" />{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      )}

      {lista.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr className="label" style={{ textAlign: 'left' }}>
              <th style={{ padding: '6px 4px' }}>Fecha</th><th style={{ padding: '6px 4px' }}>Peso</th><th style={{ padding: '6px 4px' }}>Cintura</th><th style={{ padding: '6px 4px' }}>Cadera</th>
            </tr></thead>
            <tbody>{lista.map(m => (
              <tr key={m.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '6px 4px' }}>{formatoFecha(m.fecha, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                <td style={{ padding: '6px 4px' }}>{m.peso_kg != null ? `${m.peso_kg} kg` : '–'}</td>
                <td style={{ padding: '6px 4px' }}>{m.cintura_cm != null ? `${m.cintura_cm} cm` : '–'}</td>
                <td style={{ padding: '6px 4px' }}>{m.cadera_cm != null ? `${m.cadera_cm} cm` : '–'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
