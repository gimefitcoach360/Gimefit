import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../supabase'
import { FASES } from '../../lib/constantes'
import { Cargando, Header } from '../../components/ui'

const SEMANAS = [1, 2, 3, 4]
const ejVacio = () => ({ nombre: '', series: 3, reps_objetivo: 12, video_url: '' })

/**
 * Rutina del mes: Gime carga los días UNA vez por fase y se copian a las 4 semanas.
 * La semana 1 funciona como molde. Al guardar, las semanas 2-4 se actualizan solo
 * si la alumna todavía no empezó ese día (sin series registradas ni día completado),
 * así nunca se pisa lo que ya entrenó.
 */
export default function AdminRutina() {
  const { id: alumnaId } = useParams()
  const [alumna, setAlumna] = useState(null)
  const [fase, setFase] = useState(1)
  const [dias, setDias] = useState(null)          // todos los días de la fase (4 semanas)
  const [diaNum, setDiaNum] = useState(1)
  const [nombreDia, setNombreDia] = useState('')
  const [ejercicios, setEjercicios] = useState([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('perfiles').select('nombre').eq('id', alumnaId).single().then(({ data }) => setAlumna(data))
  }, [alumnaId])

  const cargarDias = useCallback(async (mantener) => {
    const { data } = await supabase.from('rutina_dias').select('*')
      .eq('alumna_id', alumnaId).eq('fase', fase).order('semana').order('dia_numero')
    setDias(data || [])
    if (!mantener) {
      const primeros = (data || []).filter(d => d.semana === 1)
      setDiaNum(primeros[0]?.dia_numero ?? 1)
    }
  }, [alumnaId, fase])

  useEffect(() => { setMsg(''); cargarDias(false) }, [cargarDias])

  // El molde es la semana 1; si no existe ese día en la semana 1, se toma la primera semana que lo tenga
  const molde = dias?.find(d => d.semana === 1 && d.dia_numero === diaNum)
    || dias?.find(d => d.dia_numero === diaNum)

  useEffect(() => {
    if (!dias) return
    setError('')
    if (!molde) { setNombreDia(''); setEjercicios([ejVacio()]); return }
    setNombreDia(molde.nombre)
    supabase.from('rutina_ejercicios').select('*').eq('dia_id', molde.id).order('orden').then(({ data }) => {
      const lista = (data || []).map(({ id, dia_id, ...e }) => ({ ...e, video_url: e.video_url || '' }))
      setEjercicios(lista.length ? lista : [ejVacio()])
    })
  }, [dias, molde?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!dias) return <Cargando />

  const numeros = [...new Set([...dias.map(d => d.dia_numero), diaNum])].sort((a, b) => a - b)
  const cambiarEj = (i, campo, valor) => setEjercicios(l => l.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)))

  // ¿La alumna ya empezó este día? (lo completó o cargó alguna serie)
  async function yaEmpezado(diaId) {
    const { count: completado } = await supabase.from('dias_completados')
      .select('dia_id', { count: 'exact', head: true }).eq('dia_id', diaId)
    if (completado) return true
    const { data: ejs } = await supabase.from('rutina_ejercicios').select('id').eq('dia_id', diaId)
    const ids = (ejs || []).map(e => e.id)
    if (!ids.length) return false
    const { count } = await supabase.from('registros_series')
      .select('id', { count: 'exact', head: true }).in('ejercicio_id', ids)
    return count > 0
  }

  async function guardar() {
    setError(''); setMsg('')
    const validos = ejercicios.filter(e => e.nombre.trim())
    if (!nombreDia.trim()) return setError('Ponele un nombre al día.')
    if (!validos.length) return setError('Agregá al menos un ejercicio.')
    if (validos.some(e => !(e.series >= 1 && e.series <= 10) || !(e.reps_objetivo >= 1)))
      return setError('Revisá series (1 a 10) y reps de cada ejercicio.')

    const filas = validos.map((e, i) => ({
      orden: i + 1, nombre: e.nombre.trim(), series: Number(e.series),
      reps_objetivo: Number(e.reps_objetivo), video_url: e.video_url.trim() || null,
    }))

    setGuardando(true)
    try {
      const actualizadas = [], respetadas = []
      for (const semana of SEMANAS) {
        const existente = dias.find(d => d.semana === semana && d.dia_numero === diaNum)
        if (existente) {
          if (await yaEmpezado(existente.id)) { respetadas.push(semana); continue }
          const { error: e1 } = await supabase.from('rutina_dias').update({ nombre: nombreDia.trim() }).eq('id', existente.id)
          if (e1) throw e1
          const { error: e2 } = await supabase.from('rutina_ejercicios').delete().eq('dia_id', existente.id)
          if (e2) throw e2
          const { error: e3 } = await supabase.from('rutina_ejercicios').insert(filas.map(f => ({ ...f, dia_id: existente.id })))
          if (e3) throw e3
        } else {
          const { data: nuevo, error: e1 } = await supabase.from('rutina_dias')
            .insert({ alumna_id: alumnaId, fase, semana, dia_numero: diaNum, nombre: nombreDia.trim() }).select().single()
          if (e1) throw e1
          const { error: e2 } = await supabase.from('rutina_ejercicios').insert(filas.map(f => ({ ...f, dia_id: nuevo.id })))
          if (e2) throw e2
        }
        actualizadas.push(semana)
      }
      setMsg(respetadas.length
        ? `Día ${diaNum} guardado en las semanas ${actualizadas.join(', ') || '—'}. Las semanas ${respetadas.join(', ')} no se tocaron porque la alumna ya las empezó.`
        : `Día ${diaNum} guardado para todo el mes (semanas 1 a 4).`)
      await cargarDias(true)
    } catch (e) {
      setError('No se pudo guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function borrarDia() {
    const delDia = dias.filter(d => d.dia_numero === diaNum)
    if (!delDia.length || !window.confirm(`¿Borrar el Día ${diaNum} de todo el mes? Las semanas que la alumna ya empezó se conservan.`)) return
    setError(''); setMsg('')
    const respetadas = []
    for (const d of delDia) {
      if (await yaEmpezado(d.id)) { respetadas.push(d.semana); continue }
      const { error } = await supabase.from('rutina_dias').delete().eq('id', d.id)
      if (error) return setError('No se pudo borrar el día.')
    }
    setMsg(respetadas.length
      ? `Día ${diaNum} borrado. Se conservaron las semanas ${respetadas.join(', ')} porque la alumna ya las empezó.`
      : `Día ${diaNum} borrado de todo el mes.`)
    cargarDias(false)
  }

  const semanasDelDia = dias.filter(d => d.dia_numero === diaNum).map(d => d.semana)

  return (
    <>
      <Header kicker={<Link to="/admin" className="row" style={{ textDecoration: 'none', color: 'var(--muted)' }}><ChevronLeft size={18} aria-hidden="true" />Alumnas</Link>}
              title="Rutina del mes" sub={alumna?.nombre}>
        <div className="field">
          <label htmlFor="fase">Fase (un mes · 4 semanas)</label>
          <select id="fase" className="input" value={fase} onChange={e => setFase(Number(e.target.value))}>
            {[1, 2, 3].map(f => <option key={f} value={f}>{FASES[f]}</option>)}
          </select>
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
        <div className="muted">Cargás cada día una sola vez y se repite las 4 semanas del mes.
          {semanasDelDia.length > 0 && <> Este día hoy está en las semanas {semanasDelDia.join(', ')}.</>}
        </div>

        <div className="field">
          <label htmlFor="nombre-dia">Nombre del día</label>
          <input id="nombre-dia" className="input" placeholder="Ej: Piernas y glúteos" value={nombreDia} onChange={e => setNombreDia(e.target.value)} />
        </div>

        {ejercicios.map((e, i) => (
          <div key={i} className="card" style={{ padding: 12, gap: 10 }}>
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

        <button className="btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar día para todo el mes'}</button>
        <button className="btn btn--ghost btn--sm" onClick={borrarDia} disabled={!semanasDelDia.length}>
          <Trash2 size={16} aria-hidden="true" />Borrar este día del mes
        </button>
        <div className="faint">* Día nuevo, todavía sin guardar.</div>
      </div>
    </>
  )
}
