import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BookmarkPlus, ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../supabase'
import { FASES } from '../../lib/constantes'
import { Cargando, Header } from '../../components/ui'

const SEMANAS = [1, 2, 3, 4]
const ejVacio = () => ({ nombre: '', series: 3, reps_objetivo: 12, descanso_seg: 60, video_url: '' })

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
  const [catalogo, setCatalogo] = useState([])
  const [pregunta, setPregunta] = useState(null)   // { semanas, responder }

  // Cuando la alumna ya empezó alguna semana, Gime elige: cambiar todas o solo las que no empezó
  const preguntar = (semanas, origen) => new Promise(resolve => setPregunta({
    semanas, origen, responder: r => { setPregunta(null); resolve(r) },
  }))

  const cargarCatalogo = useCallback(async () => {
    const { data } = await supabase.from('ejercicios_catalogo').select('nombre, video_url').order('nombre')
    setCatalogo(data || [])
  }, [])
  useEffect(() => { cargarCatalogo() }, [cargarCatalogo])

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
  const delCatalogo = nombre => catalogo.find(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase())

  // Al elegir un ejercicio del catálogo, se completa el video solo.
  // Si el video lo puso el catálogo y después cambia el nombre, el video acompaña el cambio.
  function cambiarNombre(i, valor) {
    const c = delCatalogo(valor)
    setEjercicios(l => l.map((e, j) => {
      if (j !== i) return e
      const libre = !e.video_url || e._auto
      if (!libre) return { ...e, nombre: valor }
      return { ...e, nombre: valor, video_url: c?.video_url || '', _auto: !!c?.video_url }
    }))
  }

  // Los ejercicios nuevos que se usan en una rutina se suman solos al catálogo
  async function sumarAlCatalogo(filas) {
    const vistos = new Set()
    const nuevos = filas.filter(f => {
      const k = f.nombre.toLowerCase()
      if (delCatalogo(f.nombre) || vistos.has(k)) return false
      vistos.add(k); return true
    })
    for (const f of nuevos) await supabase.from('ejercicios_catalogo').insert({ nombre: f.nombre, video_url: f.video_url })
    if (nuevos.length) cargarCatalogo()
  }

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

  // Semanas (de estos días) que la alumna ya empezó
  async function semanasEmpezadas(numeros) {
    const out = new Set()
    for (const d of dias.filter(x => numeros.includes(x.dia_numero))) if (await yaEmpezado(d.id)) out.add(d.semana)
    return [...out].sort()
  }

  /**
   * Cambia un día que la alumna ya empezó SIN perder lo que entrenó:
   * los ejercicios con el mismo nombre se actualizan (y conservan sus series cargadas),
   * los nuevos se agregan, y los que se sacan se borran solo si no tienen series cargadas.
   * Devuelve cuántos ejercicios se conservaron por tener series registradas.
   */
  async function actualizarEnLugar(diaId, nombre, filas) {
    const { error: e1 } = await supabase.from('rutina_dias').update({ nombre }).eq('id', diaId)
    if (e1) throw e1
    const { data: actuales } = await supabase.from('rutina_ejercicios').select('id, nombre').eq('dia_id', diaId).order('orden')
    const libres = [...(actuales || [])]
    for (const f of filas) {
      const i = libres.findIndex(x => x.nombre.trim().toLowerCase() === f.nombre.toLowerCase())
      if (i >= 0) {
        const { error } = await supabase.from('rutina_ejercicios').update(f).eq('id', libres[i].id)
        if (error) throw error
        libres.splice(i, 1)
      } else {
        const { error } = await supabase.from('rutina_ejercicios').insert({ ...f, dia_id: diaId })
        if (error) throw error
      }
    }
    let conservados = 0
    for (const x of libres) {
      const { count } = await supabase.from('registros_series').select('id', { count: 'exact', head: true }).eq('ejercicio_id', x.id)
      if (count > 0) {
        conservados++
        await supabase.from('rutina_ejercicios').update({ orden: filas.length + conservados }).eq('id', x.id)
      } else {
        const { error } = await supabase.from('rutina_ejercicios').delete().eq('id', x.id)
        if (error) throw error
      }
    }
    return conservados
  }

  // Guarda un día en las 4 semanas del mes. Devuelve { actualizadas, respetadas, conservados }.
  // incluirEmpezadas: también cambia las semanas que la alumna ya empezó (sin perder lo entrenado).
  async function guardarDiaEnMes(numero, nombre, filas, diasMes, incluirEmpezadas = false) {
    const actualizadas = [], respetadas = []
    let conservados = 0
    for (const semana of SEMANAS) {
      const existente = diasMes.find(d => d.semana === semana && d.dia_numero === numero)
      if (existente) {
        if (await yaEmpezado(existente.id)) {
          if (!incluirEmpezadas) { respetadas.push(semana); continue }
          conservados += await actualizarEnLugar(existente.id, nombre, filas)
          actualizadas.push(semana); continue
        }
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
    return { actualizadas, respetadas, conservados }
  }

  const textoConservados = n => n ? ` Se conservaron ${n} ejercicio(s) que sacaste porque ya tenían series cargadas (así no se pierde lo que entrenó).` : ''

  async function guardar() {
    setError(''); setMsg('')
    const validos = ejercicios.filter(e => e.nombre.trim())
    if (!nombreDia.trim()) return setError('Ponele un nombre al día.')
    if (!validos.length) return setError('Agregá al menos un ejercicio.')
    if (validos.some(e => !(e.series >= 1 && e.series <= 10) || !(e.reps_objetivo >= 1)))
      return setError('Revisá series (1 a 10) y reps de cada ejercicio.')

    const filas = validos.map((e, i) => ({
      orden: i + 1, nombre: e.nombre.trim(), series: Number(e.series),
      reps_objetivo: Number(e.reps_objetivo), descanso_seg: Number(e.descanso_seg) || 60, video_url: e.video_url.trim() || null,
    }))

    setGuardando(true)
    try {
      const empezadas = await semanasEmpezadas([diaNum])
      const incluir = empezadas.length ? await preguntar(empezadas, 'dia') : false
      if (incluir === null) return
      const { actualizadas, respetadas, conservados } = await guardarDiaEnMes(diaNum, nombreDia.trim(), filas, dias, incluir)
      sumarAlCatalogo(filas)
      setMsg((respetadas.length
        ? `Día ${diaNum} guardado en las semanas ${actualizadas.join(', ') || '—'}. Las semanas ${respetadas.join(', ')} no se tocaron porque la alumna ya las empezó.`
        : `Día ${diaNum} guardado para todo el mes (semanas 1 a 4).`) + textoConservados(conservados))
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
          .select('orden, nombre, series, reps_objetivo, descanso_seg, video_url').eq('dia_id', base.id).order('orden')
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
    if (!window.confirm(`¿Aplicar "${p.nombre}" a ${FASES[fase]}? Se cargan sus ${p.dias.length} día(s) en las 4 semanas.`)) return
    setGuardandoPlantilla(true)
    try {
      const empezadas = await semanasEmpezadas(p.dias.map(d => d.dia_numero))
      const incluir = empezadas.length ? await preguntar(empezadas, 'plantilla') : false
      if (incluir === null) return
      const respetadasTotal = new Set()
      let conservadosTotal = 0
      for (const d of p.dias) {
        const filas = (d.ejercicios || []).map((e, i) => ({
          orden: i + 1, nombre: e.nombre, series: e.series, reps_objetivo: e.reps_objetivo, descanso_seg: e.descanso_seg ?? 60, video_url: e.video_url || null,
        }))
        const { respetadas, conservados } = await guardarDiaEnMes(d.dia_numero, d.nombre, filas, dias, incluir)
        respetadas.forEach(s => respetadasTotal.add(s))
        conservadosTotal += conservados
      }
      const otros = [...new Set(dias.map(d => d.dia_numero))].filter(n => !p.dias.some(d => d.dia_numero === n))
      setMsg(`Plantilla "${p.nombre}" aplicada a ${FASES[fase]}.`
        + (respetadasTotal.size ? ` No se tocaron las semanas ${[...respetadasTotal].sort().join(', ')} porque ya estaban empezadas.` : '')
        + (otros.length ? ` Ojo: el mes ya tenía el/los Día ${otros.join(', ')}, que la plantilla no incluye; quedaron como estaban.` : '')
        + textoConservados(conservadosTotal))
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

  const Pregunta = () => (
          <div className="card card--violet" role="alertdialog" aria-labelledby="preg-titulo" style={{ gap: 10 }}>
            <h2 id="preg-titulo" className="card__name" style={{ fontSize: 16 }}>
              {alumna?.nombre || 'La alumna'} ya empezó {pregunta.semanas.length > 1 ? `las semanas ${pregunta.semanas.join(', ')}` : `la semana ${pregunta.semanas[0]}`}
            </h2>
            <div className="muted" style={{ fontSize: 14 }}>
              Si cambiás también {pregunta.semanas.length > 1 ? 'esas semanas' : 'esa semana'}, lo que ya entrenó no se pierde: los ejercicios que mantenés conservan sus series cargadas.
            </div>
            <button className="btn btn--sm" onClick={() => pregunta.responder(true)}>Cambiar todas las semanas</button>
            <button className="btn btn--ghost btn--sm" onClick={() => pregunta.responder(false)}>Solo las semanas que no empezó</button>
            <button className="btn btn--ghost btn--sm" onClick={() => pregunta.responder(null)}>Cancelar</button>
          </div>
  )

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
          {pregunta?.origen === 'plantilla' && <Pregunta />}
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
                     aria-label={`Ejercicio ${i + 1}`} list="catalogo-ej" autoComplete="off"
                     value={e.nombre} onChange={ev => cambiarNombre(i, ev.target.value)} />
              <button className="icon-btn" aria-label={`Quitar ${e.nombre || 'ejercicio'}`} style={{ background: 'transparent' }}
                      onClick={() => setEjercicios(l => (l.length > 1 ? l.filter((_, j) => j !== i) : [ejVacio()]))}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              <label className="field"><span className="label">Series</span>
                <input className="input input--sm" type="number" inputMode="numeric" min={1} max={10} value={e.series}
                       onChange={ev => cambiarEj(i, 'series', ev.target.value)} /></label>
              <label className="field"><span className="label">Reps</span>
                <input className="input input--sm" type="number" inputMode="numeric" min={1} value={e.reps_objetivo}
                       onChange={ev => cambiarEj(i, 'reps_objetivo', ev.target.value)} /></label>
              <label className="field"><span className="label">Descanso (s)</span>
                <input className="input input--sm" type="number" inputMode="numeric" min={10} step={15} value={e.descanso_seg ?? 60}
                       onChange={ev => cambiarEj(i, 'descanso_seg', ev.target.value)} /></label>
            </div>
            <label className="field"><span className="label">Link al video (opcional)</span>
              <input className="input input--sm" type="url" placeholder="https://…" value={e.video_url}
                     onChange={ev => setEjercicios(l => l.map((x, j) => (j === i ? { ...x, video_url: ev.target.value, _auto: false } : x)))} /></label>
          </div>
        ))}

        <datalist id="catalogo-ej">{catalogo.map(c => <option key={c.nombre} value={c.nombre} />)}</datalist>
        <div className="faint">Empezá a escribir y elegí del <Link to="/admin/ejercicios">catálogo de ejercicios</Link>: el video se agrega solo.</div>

        <button className="btn btn--dashed btn--sm" onClick={() => setEjercicios(l => [...l, ejVacio()])}>
          <Plus size={18} aria-hidden="true" />Agregar ejercicio
        </button>

        {error && <div className="error" role="alert">{error}</div>}
        {msg && <div className="notice" role="status">{msg}</div>}

        {pregunta?.origen === 'dia' && <Pregunta />}

        <button className="btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar día para todo el mes'}</button>
        <button className="btn btn--ghost btn--sm" onClick={borrarDia} disabled={!semanasDelDia.length}>
          <Trash2 size={16} aria-hidden="true" />Borrar este día del mes
        </button>
        <div className="faint">* Día nuevo, todavía sin guardar.</div>
      </div>
    </>
  )
}
