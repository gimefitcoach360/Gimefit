import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, LogOut, PlayCircle } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { FASES, SENSACIONES } from '../lib/constantes'
import { Cargando, CheckBtn, Chip, DonePill, Header } from '../components/ui'
import Avisos from '../components/Avisos'
import TimerDescanso from '../components/TimerDescanso'

const clave = (ejId, n) => `${ejId}|${n}`
const aNumero = v => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))
const aEntero = v => (v === '' || v == null ? null : parseInt(v, 10))

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
  const cerrarDescanso = useCallback(() => setDescanso(null), [])

  // 1. Al entrar: todos los días + cuáles están hechos + el primero sin completar
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [d, c, sig] = await Promise.all([
        supabase.from('rutina_dias').select('*').eq('alumna_id', user.id)
          .order('fase').order('semana').order('dia_numero'),
        supabase.from('dias_completados').select('dia_id, sensacion').eq('alumna_id', user.id),
        supabase.rpc('siguiente_dia'),
      ])
      if (!vivo) return
      const lista = d.data || []
      setDias(lista)
      setHechos(Object.fromEntries((c.data || []).map(x => [x.dia_id, x])))
      setVerId(sig.data?.[0]?.id ?? lista[lista.length - 1]?.id ?? null)
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
      setEjercicios(ej || [])
      setSeries(mapa)
      setSensacion(null)
      setError('')
    })()
    return () => { vivo = false }
  }, [verId])

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

  async function guardar(ej, n, valores = fila(ej, n)) {
    const { error } = await supabase.from('registros_series').upsert({
      ejercicio_id: ej.id, serie_numero: n,
      peso_kg: aNumero(valores.peso_kg), reps: aEntero(valores.reps), hecho: !!valores.hecho,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'ejercicio_id,serie_numero' })
    if (error) setError('No se pudo guardar una serie. Revisá tu conexión.')
  }

  function tildar(ej, n) {
    const actual = fila(ej, n)
    const nuevo = { ...actual, hecho: !actual.hecho }
    if (nuevo.hecho && (nuevo.reps === '' || nuevo.reps == null)) nuevo.reps = ej.reps_objetivo
    setSeries(s => ({ ...s, [clave(ej.id, n)]: nuevo }))
    guardar(ej, n, nuevo)
    if (nuevo.hecho) setDescanso({ segundos: ej.descanso_seg || 60, id: Date.now() })
  }

  async function terminar() {
    setGuardando(true); setError('')
    // Guardamos todo lo cargado, así el mail a Gime va completo
    const filas = Object.entries(series).map(([k, v]) => {
      const [ejercicio_id, n] = k.split('|')
      return { ejercicio_id, serie_numero: Number(n), peso_kg: aNumero(v.peso_kg), reps: aEntero(v.reps), hecho: !!v.hecho, updated_at: new Date().toISOString() }
    })
    if (filas.length) {
      const { error } = await supabase.from('registros_series').upsert(filas, { onConflict: 'ejercicio_id,serie_numero' })
      if (error) { setGuardando(false); return setError('No se pudo guardar. Probá de nuevo.') }
    }
    const { error } = await supabase.from('dias_completados').insert({ dia_id: dia.id, sensacion })
    if (error) { setGuardando(false); return setError('No se pudo terminar el día. Probá de nuevo.') }

    const { data: sig } = await supabase.rpc('siguiente_dia')
    const volumen = Object.values(series).filter(s => s.hecho)
      .reduce((a, s) => a + (aNumero(s.peso_kg) || 0) * (aEntero(s.reps) || 0), 0)
    setHechos(h => ({ ...h, [dia.id]: { dia_id: dia.id, sensacion } }))
    setTerminado({ dia, seriesHechas, volumen, sensacion, siguiente: sig?.[0] || null })
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
        <div className="muted">Gime ya recibió tu entrenamiento.</div>
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
                return (
                  <div key={n} className="sets-grid">
                    <span className="set-n">{n}</span>
                    <input className="input input--sm" type="number" inputMode="decimal" step="0.5" placeholder="—"
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
