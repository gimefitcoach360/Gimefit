import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BookmarkPlus, ChevronLeft, Plus, Trash2 } from 'lucide-react'
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
  const [plantillas, setPlantillas] = useState([])
  const [plantillaSel, setPlantillaSel] = useState('')
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false)

  const cargarPlantillas = useCallback(async () => {
    const { data } = await supabase.from('plantillas').select('*').order('nombre')
    setPlantillas(data || [])
  }, [])
  useEffect(() => { cargarPlantillas() }, [cargarPlantillas])

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

  // Guarda un día en las 4 semanas del mes. Devuelve { actualizadas, respetadas }.
  async function guardarDiaEnMes(numero, nombre, filas, diasMes) {
    const actualizadas = [], respetadas = []
    for (const semana of SEMANAS) {
      const existente = diasMes.find(d => d.semana === semana && d.dia_numero === numero)
      if (existente) {
        if (await yaEmpezado(existente.id)) { respetadas.push(semana); continue }
        const { error: e1 } = await supabase.from('rutina_dias').update({ nombre }).eq('id', existente.id)
        if (e1) throw e1
        const { error: e2 } = await supabase.from('rutina_ejercicios').delete().eq('dia_id', existente.id)
        if (e2) throw e2
        if (filas.length) {
          const { error: e3 } = await supabase.from('rutina_ejercicios').insert(filas.map(f => ({ ...f, dia_id: existente.id })))
          if (e3) throw e3
        }
      } else {
        const { data: nuevo, error: e1 } = await supabase.from('rutina_dias')
          .insert({ alumna_id: alumnaId, fase, semana, dia_numero: numero, nombre }).select().single()
        if (e1) throw e1
        if (filas.length) {
          const { error: e2 } = await supabase.from('rutina_ejercicios').insert(filas.map(f => ({ ...f, dia_id: nuevo.id })))
          if (e2) throw e2
        }
      }
      actualizadas.push(semana)
    }
    return { actualizadas, respetadas }
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
      const { actualizadas, respetadas } = await guardarDiaEnMes(diaNum, nombreDia.trim(), filas, dias)
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

  // ---------- Plantillas ----------
  async function guardarComoPlantilla() {
    const nombre = nombrePlantilla.trim()
    setError(''); setMsg('')
    if (!nombre) return setError('Escribí un nombre para la plantilla.')
    const numerosMes = [...new Set(dias.map(d => d.dia_numero))].sort((a, b) => a - b)
    if (!numerosMes.length) return setError('Este mes todavía no tiene días cargados.')
    const existe = plantillas.find(p => p.nombre.toLowerCase() === nombre.toLowerCase())
    if (existe && !window.confirm(`Ya hay una plantilla "${existe.nombre}". ¿La reemplazo con este mes?`)) return

    setGuardandoPlantilla(true)
    try {
      const diasPlantilla = []
      for (const n of numerosMes) {
        const base = dias.find(d => d.semana === 1 && d.dia_numero === n) || dias.find(d => d.dia_numero === n)
        const { data: ejs } = await supabase.from('rutina_ejercicios')
          .select('orden, nombre, series, reps_objetivo, video_url').eq('dia_id', base.id).order('orden')
        diasPlantilla.push({ dia_numero: n, nombre: base.nombre, ejercicios: ejs || [] })
      }
      const fila = { nombre: existe ? existe.nombre : nombre, dias: diasPlantilla }
      const { error } = existe
        ? await supabase.from('plantillas').update(fila).eq('id', existe.id)
        : await supabase.from('plantillas').insert(fila)
      if (error) throw error
      setMsg(`Plantilla "${fila.nombre}" guardada con ${diasPlantilla.length} día(s). Ya la podés aplicar a cualquier alumna.`)
      setNombrePlantilla('')
      cargarPlantillas()
    } catch (e) {
      setError('No se pudo guardar la plantilla: ' + e.message)
    } finally {
      setGuardandoPlantilla(false)
    }
  }

  async function aplicarPlantilla() {
    const p = plantillas.find(x => x.id === plantillaSel)
    if (!p) return
    setError(''); setMsg('')
    if (!window.confirm(`¿Aplicar "${p.nombre}" a ${FASES[fase]}? Se cargan sus ${p.dias.length} día(s) en las 4 semanas. Las semanas que la alumna ya empezó no se tocan.`)) return
    setGuardandoPlantilla(true)
    try {
      const respetadasTotal = new Set()
      for (const d of p.dias) {
        const filas = (d.ejercicios || []).map((e, i) => ({
          orden: i + 1, nombre: e.nombre, series: e.series, reps_objetivo: e.reps_objetivo, video_url: e.video_url || null,
        }))
        const { respetadas } = await guardarDiaEnMes(d.dia_numero, d.nombre, filas, dias)
        respetadas.forEach(s => respetadasTotal.add(s))
      }
      const otros = [...new Set(dias.map(d => d.dia_numero))].filter(n => !p.dias.some(d => d.dia_numero === n))
      setMsg(`Plantilla "${p.nombre}" aplicada a ${FASES[fase]}.`
        + (respetadasTotal.size ? ` No se tocaron las semanas ${[...respetadasTotal].sort().join(', ')} porque ya estaban empezadas.` : '')
        + (otros.length ? ` Ojo: el mes ya tenía el/los Día ${otros.join(', ')}, que la plantilla no incluye; quedaron como estaban.` : ''))
      setPlantillaSel('')
      await cargarDias(false)
    } catch (e) {
      setError('No se pudo aplicar la plantilla: ' + e.message)
    } finally {
      setGuardandoPlantilla(false)
    }
  }

  async function borrarPlantilla() {
    const p = plantillas.find(x => x.id === plantillaSel)
    if (!p || !window.confirm(`¿Borrar la plantilla "${p.nombre}"? Las rutinas que ya cargaste con ella no cambian.`)) return
    const { error } = await supabase.from('plantillas').delete().eq('id', p.id)
    if (error) return setError('No se pudo borrar la plantilla.')
    setPlantillaSel(''); setMsg(`Plantilla "${p.nombre}" borrada.`)
    cargarPlantillas()
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

        <section className="card" style={{ padding: 14, gap: 10 }}>
          <h2 className="card__title" style={{ fontSize: 20 }}>Plantillas</h2>
          <div className="field">
            <label htmlFor="plantilla">Cargar el mes desde una plantilla</label>
            <div className="row">
              <select id="plantilla" className="input input--sm" value={plantillaSel} onChange={e => setPlantillaSel(e.target.value)}>
                <option value="">{plantillas.length ? 'Elegí una plantilla…' : 'Todavía no guardaste plantillas'}</option>
                {plantillas.map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.dias.length} día(s)</option>)}
              </select>
              <button className="btn btn--sm" style={{ flexShrink: 0 }} onClick={aplicarPlantilla} disabled={!plantillaSel || guardandoPlantilla}>Aplicar</button>
              <button className="icon-btn" aria-label="Borrar plantilla elegida" onClick={borrarPlantilla} disabled={!plantillaSel}
                      style={{ background: 'transparent' }}><Trash2 size={16} aria-hidden="true" /></button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="nombre-plantilla">Guardar este mes como plantilla</label>
            <div className="row">
              <input id="nombre-plantilla" className="input input--sm" placeholder="Ej: Activación · principiante"
                     value={nombrePlantilla} onChange={e => setNombrePlantilla(e.target.value)} />
              <button className="btn btn--ghost btn--sm" style={{ flexShrink: 0 }} onClick={guardarComoPlantilla} disabled={guardandoPlantilla || !dias.length}>
                <BookmarkPlus size={16} aria-hidden="true" />Guardar
              </button>
            </div>
          </div>
        </section>

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
