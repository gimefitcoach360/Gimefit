import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, LogOut, PlayCircle } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { FASES, SENSACIONES } from '../lib/constantes'
import { Cargando, CheckBtn, Chip, DonePill, Header } from '../components/ui'
import Avisos from '../components/Avisos'
import TimerDescanso from '../components/TimerDescanso'
import { colaDe, encolar, enviarCola } from '../lib/offline'

const clave = (ejId, n) => `${ejId}|${n}`
const aNumero = v => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))
const aEntero = v => (v === '' || v == null ? null : parseInt(v, 10))
const semanaPrograma = d => (d.fase - 1) * 4 + d.semana

/** "8×12 · 8×12 · 10×10" con lo que hizo la vez anterior en ese ejercicio */
const textoPrevio = p => Object.keys(p).sort((a, b) => a - b)
  .map(n => `${p[n].peso_kg != null ? Number(p[n].peso_kg).toLocaleString('es-AR') : '–'}×${p[n].reps ?? '–'}`).join(' · ')

export default function Entreno() {
  const { user, perfil, salir } = useAuth()
  const [dias, setDias] = useState(null)
  const [hechos, setHechos] = useState({})          // dia_id -> { sensacion }
  const [verId, setVerId] = useState(null)
  const [ejercicios, setEjercicios] = useState([])
  const [series, setSeries] = useState({})          // clave -> { peso_kg, reps, hecho }
  const [sensacion, setSensacion] = useState(null)
  const [terminado, setTerminado] = useState(null)  // resumen al terminar
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [descanso, setDescanso] = useState(null)   // { segundos, id }
  const [previo, setPrevio] = useState({})          // nombre del ejercicio -> { serie_numero: { peso_kg, reps } }
  const cerrarDescanso = useCallback(() => setDescanso(null), [])

  // 1. Al entrar: todos los días + cuáles están hechos + el primero sin completar
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [d, c] = await Promise.all([
        supabase.from('rutina_dias').select('*').eq('alumna_id', user.id)
          .order('fase').order('semana').order('dia_numero'),
        supabase.from('dias_completados').select('dia_id, sensacion').eq('alumna_id', user.id),
      ])
      if (!vivo) return
      const lista = d.data || []
      // Días terminados, incluidos los que se terminaron sin señal y todavía no se mandaron
      const h = Object.fromEntries((c.data || []).map(x => [x.dia_id, x]))
      for (const q of colaDe(user.id, 'dia')) h[q.fila.dia_id] = q.fila
      setDias(lista)
      setHechos(h)
      setVerId(lista.find(x => !h[x.id])?.id ?? lista[lista.length - 1]?.id ?? null)
    })()
    return () => { vivo = false }
  }, [user.id])

  // 2. Ejercicios y registros del día que se está viendo
  useEffect(() => {
    if (!verId) return
    let vivo = true
    ;(async () => {
      const { data: ej } = await supabase.from('rutina_ejercicios').select('*').eq('dia_id', verId).order('orden')
      const ids = (ej || []).map(e => e.id)
      const { data: rs } = ids.length
        ? await supabase.from('registros_series').select('*').in('ejercicio_id', ids)
        : { data: [] }
      if (!vivo) return
      const mapa = {}
      for (const r of rs || []) mapa[clave(r.ejercicio_id, r.serie_numero)] = { peso_kg: r.peso_kg ?? '', reps: r.reps ?? '', hecho: r.hecho }
      // Lo cargado sin señal (todavía en el celu) pisa lo que vino de internet
      const idsSet = new Set(ids)
      for (const q of colaDe(user.id, 'serie')) {
        if (idsSet.has(q.fila.ejercicio_id)) mapa[q.clave] = { peso_kg: q.fila.peso_kg ?? '', reps: q.fila.reps ?? '', hecho: q.fila.hecho }
      }
      setEjercicios(ej || [])
      setSeries(mapa)
      setSensacion(null)
      setError('')
      setPrevio({})
      cargarPrevio(ej || [], () => vivo)
    })()
    return () => { vivo = false }
  }, [verId]) // eslint-disable-line react-hooks/exhaustive-deps

  // "La vez pasada": lo último que hizo en cada ejercicio (mismo nombre) en una semana anterior
  async function cargarPrevio(ej, sigueVivo) {
    const actual = dias?.find(d => d.id === verId)
    const nombres = [...new Set(ej.map(e => e.nombre))]
    if (!actual || !nombres.length) return
    const { data } = await supabase.from('registros_series')
      .select('serie_numero, peso_kg, reps, rutina_ejercicios!inner(nombre, rutina_dias!inner(fase, semana, dia_numero))')
      .eq('alumna_id', user.id).eq('hecho', true).in('rutina_ejercicios.nombre', nombres)
    if (!sigueVivo() || !data) return
    const tope = semanaPrograma(actual)
    const mejor = {}   // nombre -> { orden, series }
    for (const r of data) {
      const d = r.rutina_ejercicios.rutina_dias
      const sem = semanaPrograma(d)
      if (sem >= tope) continue
      // Gana la semana más reciente; dentro de esa semana, el mismo número de día
      const orden = sem * 10 + (d.dia_numero === actual.dia_numero ? 1 : 0)
      const nom = r.rutina_ejercicios.nombre
      if (!mejor[nom] || orden > mejor[nom].orden) mejor[nom] = { orden, series: {} }
      if (orden === mejor[nom].orden) mejor[nom].series[r.serie_numero] = { peso_kg: r.peso_kg, reps: r.reps }
    }
    setPrevio(Object.fromEntries(Object.entries(mejor).map(([k, v]) => [k, v.series])))
  }

  const dia = dias?.find(d => d.id === verId)
  const semanaDias = useMemo(
    () => (dia ? dias.filter(d => d.fase === dia.fase && d.semana === dia.semana) : []),
    [dias, dia]
  )
  const totalSeries = ejercicios.reduce((a, e) => a + e.series, 0)
  const seriesHechas = Object.values(series).filter(s => s.hecho).length

  const fila = (ej, n) => series[clave(ej.id, n)] || { peso_kg: '', reps: '', hecho: false }

  function cambiar(ej, n, campo, valor) {
    setSeries(s => ({ ...s, [clave(ej.id, n)]: { ...fila(ej, n), [campo]: valor } }))
  }

  // Se guarda primero en el celu y se manda cuando hay señal (ver lib/offline.js)
  function encolarSerie(ejercicioId, n, valores) {
    encolar({
      tipo: 'serie', clave: clave(ejercicioId, n), user: user.id,
      fila: {
        ejercicio_id: ejercicioId, serie_numero: n,
        peso_kg: aNumero(valores.peso_kg), reps: aEntero(valores.reps), hecho: !!valores.hecho,
        updated_at: new Date().toISOString(),
      },
    })
  }

  function guardar(ej, n, valores = fila(ej, n)) {
    encolarSerie(ej.id, n, valores)
    enviarCola(user.id)
  }

  function tildar(ej, n) {
    const actual = fila(ej, n)
    const nuevo = { ...actual, hecho: !actual.hecho }
    if (nuevo.hecho && (nuevo.reps === '' || nuevo.reps == null)) nuevo.reps = ej.reps_objetivo
    // Si no anotó kilos, se toman los de la vez pasada (los que ve de guía en gris)
    const ant = previo[ej.nombre]?.[n]
    if (nuevo.hecho && (nuevo.peso_kg === '' || nuevo.peso_kg == null) && ant?.peso_kg != null) nuevo.peso_kg = Number(ant.peso_kg)
    setSeries(s => ({ ...s, [clave(ej.id, n)]: nuevo }))
    guardar(ej, n, nuevo)
    if (nuevo.hecho) setDescanso({ segundos: ej.descanso_seg || 60, id: Date.now() })
  }

  async function terminar() {
    setGuardando(true); setError('')
    // Todo lo cargado + el día terminado van a la cola; las series salen primero, así el mail a Gime va completo
    for (const [k, v] of Object.entries(series)) {
      const [ejercicioId, n] = k.split('|')
      encolarSerie(ejercicioId, Number(n), v)
    }
    encolar({ tipo: 'dia', clave: dia.id, user: user.id, fila: { dia_id: dia.id, sensacion } })
    const { pendientes, error } = await enviarCola(user.id)
    if (error) { setGuardando(false); return setError('No se pudo terminar el día. Probá de nuevo.') }

    const nuevosHechos = { ...hechos, [dia.id]: { dia_id: dia.id, sensacion } }
    const volumen = Object.values(series).filter(s => s.hecho)
      .reduce((a, s) => a + (aNumero(s.peso_kg) || 0) * (aEntero(s.reps) || 0), 0)
    setHechos(nuevosHechos)
    setTerminado({ dia, seriesHechas, volumen, sensacion, siguiente: dias.find(x => !nuevosHechos[x.id]) || null, sinEnviar: pendientes > 0 })
    setGuardando(false)
  }

  if (!dias) return <Cargando />

  const salirBtn = (
    <button className="icon-btn" onClick={salir} aria-label="Cerrar sesión"><LogOut size={18} aria-hidden="true" /></button>
  )

  if (!dias.length) {
    return (
      <>
        <Header kicker={`Hola, ${perfil?.nombre || ''}`} right={salirBtn} title="Entreno" />
        <div className="body"><Avisos /><div className="notice">Gime todavía no cargó tu rutina. Cuando la cargue, la vas a ver acá.</div></div>
      </>
    )
  }

  // ---------- Pantalla de día terminado ----------
  if (terminado) {
    const t = terminado
    return (
      <div className="body" style={{ paddingTop: 48, gap: 22 }}>
        <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--violet)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={36} strokeWidth={3} aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 48, lineHeight: 0.95 }}>¡Día {t.dia.dia_numero} completo!</div>
          <div className="muted" style={{ fontSize: 16 }}>{t.dia.nombre}</div>
        </div>
        <div className="grid2">
          <div className="card" style={{ gap: 2 }}><span className="muted">Series hechas</span><span className="big">{t.seriesHechas}</span></div>
          <div className="card" style={{ gap: 2 }}><span className="muted">Volumen (kg × reps)</span><span className="big">{Math.round(t.volumen).toLocaleString('es-AR')}</span></div>
        </div>
        <div className="card between" style={{ flexDirection: 'row' }}>
          <span className="muted" style={{ fontSize: 14 }}>Cómo te sentiste</span>
          <b style={{ color: 'var(--violet-soft)' }}>{t.sensacion || 'Sin marcar'}</b>
        </div>
        <div className="muted">{t.sinEnviar
          ? 'Estás sin señal: tu entrenamiento quedó guardado en el celu y se le manda a Gime solo cuando vuelvas a tener conexión.'
          : 'Gime ya recibió tu entrenamiento.'}</div>
        {t.siguiente ? (
          <>
            <div className="card card--violet" style={{ gap: 4 }}>
              <div className="kicker">La próxima vez que entres</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 26 }}>Día {t.siguiente.dia_numero} · {t.siguiente.nombre}</div>
            </div>
            <button className="btn" onClick={() => { setTerminado(null); setVerId(t.siguiente.id) }}>Ir al Día {t.siguiente.dia_numero}</button>
          </>
        ) : (
          <div className="card card--violet">Completaste todos los días cargados. ¡Enorme!</div>
        )}
        <button className="btn btn--ghost" onClick={salir}>Cerrar sesión</button>
      </div>
    )
  }

  // ---------- Día de entrenamiento ----------
  const diaHecho = !!hechos[dia?.id]
  return (
    <>
      <Header
        kicker={`Hola, ${perfil?.nombre || ''} · ${FASES[dia.fase]} · Semana ${dia.semana}`}
        right={salirBtn}
        title={`Día ${dia.dia_numero}`}
        sub={dia.nombre}
      >
        <div className="tabs">
          {semanaDias.map(d => {
            const on = d.id === verId, ok = !!hechos[d.id]
            return (
              <button key={d.id} className={'tab' + (on ? ' tab--on' : ok ? ' tab--done' : '')} onClick={() => setVerId(d.id)}
                      aria-label={`Ver día ${d.dia_numero}${ok ? ', completado' : ''}`} aria-current={on ? 'true' : undefined}>
                {ok && !on && <Check size={14} strokeWidth={3} aria-hidden="true" />}Día {d.dia_numero}
              </button>
            )
          })}
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="between muted"><span>Progreso del día</span><span>{seriesHechas} / {totalSeries} series</span></div>
          <div className="progress"><div style={{ width: `${totalSeries ? Math.round(seriesHechas * 100 / totalSeries) : 0}%` }} /></div>
        </div>
      </Header>

      <div className="body">
        <Avisos />
        {ejercicios.map(ej => {
          const filas = Array.from({ length: ej.series }, (_, i) => i + 1)
          const completo = filas.every(n => fila(ej, n).hecho)
          return (
            <section key={ej.id} className="card">
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h2 className="card__name">{ej.nombre}</h2>
                  <div className="muted">Objetivo {ej.series} × {ej.reps_objetivo} · descanso {ej.descanso_seg || 60} s</div>
                  {previo[ej.nombre] && (
                    <div style={{ fontSize: 13, color: 'var(--violet-pale)', marginTop: 2 }}>
                      La vez pasada <span className="faint">(kg×reps)</span>: {textoPrevio(previo[ej.nombre])}
                    </div>
                  )}
                </div>
                {completo ? <span className="badge">COMPLETO</span> : ej.video_url ? (
                  <a className="icon-btn" href={ej.video_url} target="_blank" rel="noreferrer" aria-label={`Ver video de ${ej.nombre}`} style={{ color: 'var(--violet-soft)' }}>
                    <PlayCircle size={18} aria-hidden="true" />
                  </a>
                ) : null}
              </div>
              <div className="sets-grid label" aria-hidden="true">
                <span>Serie</span><span>Peso (kg)</span><span>Reps</span><span style={{ textAlign: 'center' }}>Hecho</span>
              </div>
              {filas.map(n => {
                const f = fila(ej, n)
                const ant = previo[ej.nombre]?.[n]
                return (
                  <div key={n} className="sets-grid">
                    <span className="set-n">{n}</span>
                    <input className="input input--sm" type="number" inputMode="decimal" step="0.5" placeholder={ant?.peso_kg != null ? String(Number(ant.peso_kg)) : '—'}
                           aria-label={`Peso serie ${n} de ${ej.nombre}`} value={f.peso_kg}
                           onChange={e => cambiar(ej, n, 'peso_kg', e.target.value)} onBlur={() => guardar(ej, n)} />
                    <input className="input input--sm" type="number" inputMode="numeric" placeholder={String(ej.reps_objetivo)}
                           aria-label={`Repeticiones serie ${n} de ${ej.nombre}`} value={f.reps}
                           onChange={e => cambiar(ej, n, 'reps', e.target.value)} onBlur={() => guardar(ej, n)} />
                    <CheckBtn on={f.hecho} onClick={() => tildar(ej, n)} label={f.hecho ? `Desmarcar serie ${n}` : `Marcar serie ${n} como hecha`} />
                  </div>
                )
              })}
            </section>
          )
        })}

        {error && <div className="error" role="alert">{error}</div>}

        {diaHecho ? (
          <DonePill>Día completado</DonePill>
        ) : (
          <>
            <section className="card">
              <h2 className="card__name" style={{ fontSize: 15 }}>¿Cómo te sentiste hoy?</h2>
              <div className="wrap">
                {SENSACIONES.map(s => (
                  <Chip key={s} on={sensacion === s} onClick={() => setSensacion(sensacion === s ? null : s)}>{s}</Chip>
                ))}
              </div>
            </section>
            <button className="btn" onClick={terminar} disabled={guardando || !ejercicios.length}>
              {guardando ? 'Guardando…' : 'Terminar entrenamiento'}
            </button>
          </>
        )}
      </div>
      <TimerDescanso inicio={descanso} onCerrar={cerrarDescanso} />
    </>
  )
}
