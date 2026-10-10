import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useFaseActual } from '../lib/useFaseActual'
import { EMOCIONES, FASES, hoyAR, semanaActualAR } from '../lib/constantes'
import { Cargando, Chip, DonePill, Header } from '../components/ui'

const LETRAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const ENERGIA = ['Sin energía', 'Poca energía', 'Normal', 'Buena energía', 'A full']

export default function Coaching() {
  const { user } = useAuth()
  const pos = useFaseActual(user.id)
  const hoy = hoyAR()
  const semana = semanaActualAR()

  const [listo, setListo] = useState(false)
  const [conCheckin, setConCheckin] = useState(new Set())   // fechas de esta semana con check-in
  const [energia, setEnergia] = useState(null)
  const [emociones, setEmociones] = useState([])
  const [ciEstado, setCiEstado] = useState('nuevo')          // nuevo | guardado | editando
  const [reg, setReg] = useState({ que_paso: '', que_senti: '', que_hice: '' })
  const [regGuardado, setRegGuardado] = useState(false)
  const [actividades, setActividades] = useState([])
  const [hechas, setHechas] = useState(new Set())
  const [actSel, setActSel] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pos) return
    let vivo = true
    ;(async () => {
      const [c, a, h] = await Promise.all([
        supabase.from('checkins').select('fecha, energia, emociones').eq('alumna_id', user.id).in('fecha', semana),
        supabase.rpc('actividades_semana'),
        supabase.from('actividades_hechas').select('actividad_id').eq('alumna_id', user.id),
      ])
      if (!vivo) return
      const filas = c.data || []
      setConCheckin(new Set(filas.map(f => f.fecha)))
      const deHoy = filas.find(f => f.fecha === hoy)
      if (deHoy) { setEnergia(deHoy.energia); setEmociones(deHoy.emociones || []); setCiEstado('guardado') }
      const acts = a.data || []
      const set = new Set((h.data || []).map(x => x.actividad_id))
      setActividades(acts); setHechas(set)
      const primera = acts.findIndex(x => !set.has(x.id))
      setActSel(primera < 0 ? 0 : primera)
      setListo(true)
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, user.id, hoy])

  if (!pos || !listo) return <Cargando />

  async function guardarCheckin() {
    setEnviando(true); setError('')
    const { error } = await supabase.from('checkins')
      .upsert({ alumna_id: user.id, fecha: hoy, energia, emociones }, { onConflict: 'alumna_id,fecha' })
    setEnviando(false)
    if (error) return setError('No se pudo guardar el check-in.')
    setCiEstado('guardado')
    setConCheckin(s => new Set(s).add(hoy))
  }

  async function guardarRegistro() {
    setEnviando(true); setError('')
    const { error } = await supabase.from('registros_emocionales').insert({ ...reg, alumna_id: user.id })
    setEnviando(false)
    if (error) return setError('No se pudo guardar el registro.')
    setRegGuardado(true)
  }

  async function alternarActividad(act) {
    setError('')
    if (hechas.has(act.id)) {
      const { error } = await supabase.from('actividades_hechas').delete().eq('alumna_id', user.id).eq('actividad_id', act.id)
      if (error) return setError('No se pudo desmarcar.')
      setHechas(s => { const n = new Set(s); n.delete(act.id); return n })
    } else {
      const { error } = await supabase.from('actividades_hechas').insert({ alumna_id: user.id, actividad_id: act.id })
      if (error) return setError('No se pudo marcar la actividad.')
      setHechas(s => new Set(s).add(act.id))
    }
  }

  const tocarCheckin = fn => { fn(); if (ciEstado === 'guardado') setCiEstado('editando') }
  const act = actividades[actSel]
  const cantHechas = actividades.filter(a => hechas.has(a.id)).length

  return (
    <>
      <Header kicker={`${FASES[pos.fase]} · Semana ${pos.semana}`} title="Coaching" sub="Gestión de emociones">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }} aria-label="Check-ins de esta semana">
          {semana.map((f, i) => {
            const on = conCheckin.has(f), esHoy = f === hoy
            return (
              <div key={f} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="faint" style={{ fontSize: 11 }}>{LETRAS[i]}</span>
                <div aria-label={`${LETRAS[i]}${on ? ': check-in hecho' : ''}`}
                     style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: on ? 'var(--violet)' : 'var(--surface-2)', color: '#000',
                              border: on ? 'none' : esHoy ? '2px solid var(--violet)' : '1px solid var(--line-2)' }}>
                  {on && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                </div>
              </div>
            )
          })}
        </div>
      </Header>

      <div className="body">
        <section className="card" style={{ gap: 14 }}>
          <h2 className="card__title">Check-in de hoy</h2>
          <div className="stack">
            <div style={{ fontSize: 14, color: 'var(--text-2)' }}>¿Con cuánta energía llegás hoy?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} aria-pressed={energia === n} aria-label={`${n}: ${ENERGIA[n - 1]}`}
                        onClick={() => tocarCheckin(() => setEnergia(n))}
                        className={'tab' + (energia === n ? ' tab--on' : '')} style={{ height: 48, fontSize: 24 }}>{n}</button>
              ))}
            </div>
            <div className="between faint"><span>Sin energía</span><span>A full</span></div>
          </div>
          <div className="stack">
            <div style={{ fontSize: 14, color: 'var(--text-2)' }}>¿Qué emociones aparecen? <span className="faint">Podés elegir varias</span></div>
            <div className="wrap">
              {EMOCIONES.map(e => (
                <Chip key={e} on={emociones.includes(e)}
                      onClick={() => tocarCheckin(() => setEmociones(l => (l.includes(e) ? l.filter(x => x !== e) : [...l, e])))}>{e}</Chip>
              ))}
            </div>
          </div>
          {ciEstado === 'guardado'
            ? <DonePill>Check-in guardado</DonePill>
            : <button className="btn" disabled={!energia || enviando} onClick={guardarCheckin}>
                {!energia ? 'Elegí tu energía para guardar' : ciEstado === 'editando' ? 'Guardar cambios' : 'Guardar check-in'}
              </button>}
        </section>

        <section className="card">
          <div>
            <h2 className="card__title">Registro emocional</h2>
            <div className="muted">Tres preguntas, sin juzgarte · Gime lee tu registro</div>
          </div>
          {regGuardado ? (
            <>
              <DonePill>Registro guardado</DonePill>
              <button className="btn btn--ghost btn--sm" onClick={() => { setReg({ que_paso: '', que_senti: '', que_hice: '' }); setRegGuardado(false) }}>
                Escribir otro
              </button>
            </>
          ) : (
            <>
              {[
                ['que_paso', '¿Qué pasó?', 'La situación, en pocas palabras'],
                ['que_senti', '¿Qué sentiste?', 'En el cuerpo y en la cabeza'],
                ['que_hice', '¿Qué hiciste con eso?', 'Y qué te gustaría hacer la próxima vez'],
              ].map(([k, label, ph]) => (
                <div key={k} className="field">
                  <label htmlFor={k}>{label}</label>
                  <textarea id={k} className="input" rows={2} placeholder={ph} value={reg[k]} onChange={e => setReg(r => ({ ...r, [k]: e.target.value }))} />
                </div>
              ))}
              <button className="btn" disabled={!reg.que_paso.trim() || !reg.que_senti.trim() || enviando} onClick={guardarRegistro}>
                Guardar registro
              </button>
            </>
          )}
        </section>

        <section className="card card--violet">
          <div className="between">
            <span className="kicker">Actividades de la semana</span>
            <span className="muted">{cantHechas} / {actividades.length} hechas</span>
          </div>
          {actividades.length === 0 ? (
            <div className="muted">Todavía no hay actividades para esta semana.</div>
          ) : (
            <>
              <div className="tabs">
                {actividades.map((a, i) => {
                  const on = i === actSel, ok = hechas.has(a.id)
                  return (
                    <button key={a.id} className={'tab' + (on ? ' tab--on' : ok ? ' tab--done' : '')}
                            style={!on && ok ? { background: '#000' } : undefined}
                            onClick={() => setActSel(i)} aria-label={`Ver actividad ${a.numero}${ok ? ', hecha' : ''}`}>
                      {ok && !on && <Check size={14} strokeWidth={3} aria-hidden="true" />}Actividad {a.numero}
                    </button>
                  )
                })}
              </div>
              <h2 className="card__title" style={{ fontSize: 26 }}>{act.titulo}</h2>
              <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.55 }}>{act.consigna}</div>
              <div className="stack" style={{ gap: 4 }}>
                <span className="kicker">Para hacer esta semana</span>
                <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.55 }}>{act.ejercicio}</div>
              </div>
              {hechas.has(act.id)
                ? <button className="btn btn--ghost" style={{ borderColor: 'var(--violet)', color: 'var(--violet-soft)', fontWeight: 700 }}
                          aria-pressed="true" onClick={() => alternarActividad(act)}>
                    <Check size={18} strokeWidth={3} aria-hidden="true" />Actividad hecha
                  </button>
                : <button className="btn" onClick={() => alternarActividad(act)}>Marcar como hecha</button>}
            </>
          )}
        </section>

        {error && <div className="error" role="alert">{error}</div>}
      </div>
    </>
  )
}
