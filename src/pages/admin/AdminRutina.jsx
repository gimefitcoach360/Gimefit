import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../supabase'
import { FASES } from '../../lib/constantes'
import { Cargando, Header } from '../../components/ui'

const ejVacio = () => ({ nombre: '', series: 3, reps_objetivo: 12, video_url: '' })

export default function AdminRutina() {
  const { id: alumnaId } = useParams()
  const [alumna, setAlumna] = useState(null)
  const [fase, setFase] = useState(1)
  const [semana, setSemana] = useState(1)
  const [dias, setDias] = useState(null)          // días guardados de esta fase/semana
  const [diaNum, setDiaNum] = useState(1)
  const [nombreDia, setNombreDia] = useState('')
  const [ejercicios, setEjercicios] = useState([])
  const [originales, setOriginales] = useState([]) // ids cargados desde la base
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('perfiles').select('nombre').eq('id', alumnaId).single().then(({ data }) => setAlumna(data))
  }, [alumnaId])

  const cargarDias = useCallback(async (mantener) => {
    const { data } = await supabase.from('rutina_dias').select('*')
      .eq('alumna_id', alumnaId).eq('fase', fase).eq('semana', semana).order('dia_numero')
    setDias(data || [])
    if (!mantener) setDiaNum(data?.[0]?.dia_numero ?? 1)
  }, [alumnaId, fase, semana])

  useEffect(() => { setMsg(''); cargarDias(false) }, [cargarDias])

  const dia = dias?.find(d => d.dia_numero === diaNum)

  useEffect(() => {
    if (!dias) return
    setError('')
    if (!dia) { setNombreDia(''); setEjercicios([ejVacio()]); setOriginales([]); return }
    setNombreDia(dia.nombre)
    supabase.from('rutina_ejercicios').select('*').eq('dia_id', dia.id).order('orden').then(({ data }) => {
      const lista = (data || []).map(e => ({ ...e, video_url: e.video_url || '' }))
      setEjercicios(lista.length ? lista : [ejVacio()])
      setOriginales(lista.map(e => e.id))
    })
  }, [dias, dia?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!dias) return <Cargando />

  const numeros = [...new Set([...dias.map(d => d.dia_numero), diaNum])].sort((a, b) => a - b)
  const cambiarEj = (i, campo, valor) => setEjercicios(l => l.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)))

  async function guardar() {
    setError(''); setMsg('')
    const validos = ejercicios.filter(e => e.nombre.trim())
    if (!nombreDia.trim()) return setError('Ponele un nombre al día.')
    if (!validos.length) return setError('Agregá al menos un ejercicio.')
    if (validos.some(e => !(e.series >= 1 && e.series <= 10) || !(e.reps_objetivo >= 1)))
      return setError('Revisá series (1 a 10) y reps de cada ejercicio.')
    const quitados = originales.filter(id => !validos.some(e => e.id === id))
    if (quitados.length && !window.confirm(`Vas a quitar ${quitados.length} ejercicio(s). Se borran también las series que la alumna haya cargado en ellos. ¿Seguimos?`)) return

    setGuardando(true)
    try {
      let diaId = dia?.id
      if (diaId) {
        const { error } = await supabase.from('rutina_dias').update({ nombre: nombreDia.trim() }).eq('id', diaId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('rutina_dias')
          .insert({ alumna_id: alumnaId, fase, semana, dia_numero: diaNum, nombre: nombreDia.trim() }).select().single()
        if (error) throw error
        diaId = data.id
      }
      if (quitados.length) {
        const { error } = await supabase.from('rutina_ejercicios').delete().in('id', quitados)
        if (error) throw error
      }
      const filas = validos.map((e, i) => ({
        ...(e.id ? { id: e.id } : {}),
        dia_id: diaId, orden: i + 1, nombre: e.nombre.trim(),
        series: Number(e.series), reps_objetivo: Number(e.reps_objetivo), video_url: e.video_url.trim() || null,
      }))
      const existentes = filas.filter(f => f.id), nuevos = filas.filter(f => !f.id)
      if (existentes.length) { const { error } = await supabase.from('rutina_ejercicios').upsert(existentes); if (error) throw error }
      if (nuevos.length) { const { error } = await supabase.from('rutina_ejercicios').insert(nuevos); if (error) throw error }
      setMsg('Día guardado.')
      await cargarDias(true)
    } catch (e) {
      setError('No se pudo guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function borrarDia() {
    if (!dia || !window.confirm(`¿Borrar el Día ${diaNum} completo? Se borran también los registros de la alumna para ese día.`)) return
    const { error } = await supabase.from('rutina_dias').delete().eq('id', dia.id)
    if (error) return setError('No se pudo borrar el día.')
    setMsg('Día borrado.')
    cargarDias(false)
  }

  async function duplicar() {
    if (semana >= 4) return
    setError(''); setMsg('')
    const destino = semana + 1
    const { data: yaHay } = await supabase.from('rutina_dias').select('dia_numero')
      .eq('alumna_id', alumnaId).eq('fase', fase).eq('semana', destino)
    const ocupados = new Set((yaHay || []).map(d => d.dia_numero))
    let copiados = 0
    for (const d of dias) {
      if (ocupados.has(d.dia_numero)) continue
      const { data: nuevo, error } = await supabase.from('rutina_dias')
        .insert({ alumna_id: alumnaId, fase, semana: destino, dia_numero: d.dia_numero, nombre: d.nombre }).select().single()
      if (error) return setError('No se pudo duplicar: ' + error.message)
      const { data: ejs } = await supabase.from('rutina_ejercicios').select('orden, nombre, series, reps_objetivo, video_url').eq('dia_id', d.id)
      if (ejs?.length) await supabase.from('rutina_ejercicios').insert(ejs.map(e => ({ ...e, dia_id: nuevo.id })))
      copiados++
    }
    setMsg(copiados
      ? `Se copiaron ${copiados} día(s) a la semana ${destino}.${ocupados.size ? ' Los días que ya existían no se tocaron.' : ''}`
      : `La semana ${destino} ya tenía todos estos días cargados; no se tocó nada.`)
  }

  return (
    <>
      <Header kicker={<Link to="/admin" className="row" style={{ textDecoration: 'none', color: 'var(--muted)' }}><ChevronLeft size={18} aria-hidden="true" />Alumnas</Link>}
              title="Rutina" sub={alumna?.nombre}>
        <div className="grid2">
          <div className="field">
            <label htmlFor="fase">Fase</label>
            <select id="fase" className="input" value={fase} onChange={e => setFase(Number(e.target.value))}>
              {[1, 2, 3].map(f => <option key={f} value={f}>{FASES[f]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="semana">Semana</label>
            <select id="semana" className="input" value={semana} onChange={e => setSemana(Number(e.target.value))}>
              {[1, 2, 3, 4].map(s => <option key={s} value={s}>Semana {s}</option>)}
            </select>
          </div>
        </div>
        <div className="tabs">
          {numeros.map(n => (
            <button key={n} className={'tab' + (n === diaNum ? ' tab--on' : '')} aria-current={n === diaNum ? 'true' : undefined}
                    onClick={() => { setMsg(''); setDiaNum(n) }}>
              Día {n}{!dias.some(d => d.dia_numero === n) && ' *'}
            </button>
          ))}
          {numeros.length < 7 && (
            <button className="icon-btn" aria-label="Agregar día" style={{ borderStyle: 'dashed', color: 'var(--violet-soft)', background: 'transparent' }}
                    onClick={() => { setMsg(''); setDiaNum(Math.max(...numeros) + 1) }}>
              <Plus size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </Header>

      <div className="body" style={{ paddingBottom: 40 }}>
        <div className="field">
          <label htmlFor="nombre-dia">Nombre del día</label>
          <input id="nombre-dia" className="input" placeholder="Ej: Piernas y glúteos" value={nombreDia} onChange={e => setNombreDia(e.target.value)} />
        </div>

        {ejercicios.map((e, i) => (
          <div key={e.id || `n${i}`} className="card" style={{ padding: 12, gap: 10 }}>
            <div className="row">
              <input className="input input--sm" style={{ flex: 1, fontWeight: 700 }} placeholder="Nombre del ejercicio"
                     aria-label={`Ejercicio ${i + 1}`} value={e.nombre} onChange={ev => cambiarEj(i, 'nombre', ev.target.value)} />
              <button className="icon-btn" aria-label={`Quitar ${e.nombre || 'ejercicio'}`} style={{ background: 'transparent' }}
                      onClick={() => setEjercicios(l => (l.length > 1 ? l.filter((_, j) => j !== i) : [ejVacio()]))}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
              <label className="field"><span className="label">Series</span>
                <input className="input input--sm" type="number" inputMode="numeric" min={1} max={10} value={e.series}
                       onChange={ev => cambiarEj(i, 'series', ev.target.value)} /></label>
              <label className="field"><span className="label">Reps</span>
                <input className="input input--sm" type="number" inputMode="numeric" min={1} value={e.reps_objetivo}
                       onChange={ev => cambiarEj(i, 'reps_objetivo', ev.target.value)} /></label>
              <label className="field"><span className="label">Link al video</span>
                <input className="input input--sm" type="url" placeholder="https://…" value={e.video_url}
                       onChange={ev => cambiarEj(i, 'video_url', ev.target.value)} /></label>
            </div>
          </div>
        ))}

        <button className="btn btn--dashed btn--sm" onClick={() => setEjercicios(l => [...l, ejVacio()])}>
          <Plus size={18} aria-hidden="true" />Agregar ejercicio
        </button>

        {error && <div className="error" role="alert">{error}</div>}
        {msg && <div className="notice" role="status">{msg}</div>}

        <button className="btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar día'}</button>
        <div className="grid2" style={{ gap: 8 }}>
          <button className="btn btn--ghost btn--sm" onClick={duplicar} disabled={semana >= 4 || !dias.length}>
            <Copy size={16} aria-hidden="true" />{semana < 4 ? `Duplicar a semana ${semana + 1}` : 'Última semana'}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={borrarDia} disabled={!dia}>
            <Trash2 size={16} aria-hidden="true" />Borrar día
          </button>
        </div>
        <div className="faint">* Día nuevo, todavía sin guardar.</div>
      </div>
    </>
  )
}
