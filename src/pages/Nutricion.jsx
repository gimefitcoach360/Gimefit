import { useEffect, useState } from 'react'
import { Droplet } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useFaseActual } from '../lib/useFaseActual'
import { COMIDAS, FASES, GRUPOS, HAMBRE, VASOS_OBJETIVO, diaSemanaAR, hoyAR } from '../lib/constantes'
import { Cargando, CheckBtn, Chip, Header } from '../components/ui'

export default function Nutricion() {
  const { user } = useAuth()
  const pos = useFaseActual(user.id)
  const [plan, setPlan] = useState(undefined)
  const [opciones, setOpciones] = useState([])
  const [pautas, setPautas] = useState([])
  const [registros, setRegistros] = useState({})   // comida -> fila de registros_comida
  const [vasos, setVasos] = useState(0)
  const [abierta, setAbierta] = useState(null)     // comida que se está confirmando
  const [borrador, setBorrador] = useState({})     // { opcion_id, hambre }
  const [error, setError] = useState('')
  const hoy = hoyAR()
  const diaHoy = diaSemanaAR()

  useEffect(() => {
    if (!pos) return
    let vivo = true
    ;(async () => {
      const [p, r, a] = await Promise.all([
        supabase.from('planes_comida').select('*').eq('alumna_id', user.id).eq('fase', pos.fase).maybeSingle(),
        supabase.from('registros_comida').select('*').eq('alumna_id', user.id).eq('fecha', hoy),
        supabase.from('registros_agua').select('vasos').eq('alumna_id', user.id).eq('fecha', hoy).maybeSingle(),
      ])
      let op = [], pa = []
      if (p.data) {
        const [o, t] = await Promise.all([
          supabase.from('plan_opciones').select('*').eq('plan_id', p.data.id).order('opcion_numero'),
          supabase.from('plan_pautas').select('*').eq('plan_id', p.data.id),
        ])
        op = o.data || []; pa = t.data || []
      }
      if (!vivo) return
      setPlan(p.data || null); setOpciones(op); setPautas(pa)
      setRegistros(Object.fromEntries((r.data || []).map(x => [x.comida, x])))
      setVasos(a.data?.vasos ?? 0)
    })()
    return () => { vivo = false }
  }, [pos, user.id, hoy])

  if (!pos || plan === undefined) return <Cargando />

  const modo = plan?.modo
  const itemsDe = comida => opciones.filter(o => o.comida === comida &&
    (modo === 'por_dia' ? o.dia_semana === diaHoy : o.dia_semana == null))

  async function tomarAgua(n) {
    const nuevo = vasos === n ? n - 1 : n
    setVasos(nuevo)
    const { error } = await supabase.from('registros_agua')
      .upsert({ alumna_id: user.id, fecha: hoy, vasos: nuevo }, { onConflict: 'alumna_id,fecha' })
    if (error) setError('No se pudo guardar el agua.')
  }

  function abrir(comida) {
    const items = itemsDe(comida)
    setAbierta(comida)
    setBorrador({ opcion_id: items.length === 1 ? items[0].id : null, hambre: null })
  }

  async function confirmar(comida) {
    setError('')
    const { data, error } = await supabase.from('registros_comida').upsert({
      alumna_id: user.id, fecha: hoy, comida,
      opcion_id: borrador.opcion_id, hambre: borrador.hambre, cumplida: true,
    }, { onConflict: 'alumna_id,fecha,comida' }).select().single()
    if (error) return setError('No se pudo guardar la comida. Probá de nuevo.')
    setRegistros(r => ({ ...r, [comida]: data }))
    setAbierta(null)
  }

  async function desmarcar(comida) {
    const reg = registros[comida]
    const { data, error } = await supabase.from('registros_comida')
      .update({ cumplida: false, hambre: null, opcion_id: null }).eq('id', reg.id).select().single()
    if (error) return setError('No se pudo desmarcar.')
    setRegistros(r => ({ ...r, [comida]: data }))
  }

  const cumplidas = COMIDAS.filter(c => registros[c.id]?.cumplida).length

  return (
    <>
      <Header kicker={`${FASES[pos.fase]} · Semana ${pos.semana}`} title="Nutrición" sub="Tu plan de hoy" />
      <div className="body">
        <section className="card">
          <div className="between">
            <h2 className="card__name">Agua</h2>
            <div className="muted" style={{ fontSize: 14 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 24, color: 'var(--violet-soft)' }}>{vasos}</span> / {VASOS_OBJETIVO} vasos
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${VASOS_OBJETIVO}, minmax(0, 1fr))`, gap: 6 }}>
            {Array.from({ length: VASOS_OBJETIVO }, (_, i) => {
              const lleno = i < vasos
              return (
                <button key={i} onClick={() => tomarAgua(i + 1)} aria-label={`Vaso ${i + 1}${lleno ? ', tomado' : ''}`}
                        style={{ height: 44, borderRadius: 10, border: lleno ? 'none' : '1px solid var(--line-2)',
                                 background: lleno ? 'var(--violet)' : 'var(--surface-2)', color: lleno ? '#000' : '#52525B',
                                 display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Droplet size={16} fill={lleno ? 'currentColor' : 'none'} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </section>

        {!plan && <div className="notice">Gime todavía no cargó tu plan de comidas para esta fase.</div>}

        {modo === 'pautas' && (
          <section className="card">
            <h2 className="card__title">Armá tu plato</h2>
            {GRUPOS.map(g => {
              const p = pautas.find(x => x.grupo === g.id)
              if (!p) return null
              return (
                <div key={g.id} className="stack" style={{ gap: 6 }}>
                  <div className="between"><span className="label">{g.label}</span><span className="muted">{p.porcion}</span></div>
                  <div className="wrap" style={{ gap: 6 }}>
                    {p.alimentos.map(a => (
                      <span key={a} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--field)', fontSize: 13, color: 'var(--text-2)' }}>{a}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {plan && (
          <div className="between muted" style={{ padding: '0 2px' }}><span>Comidas</span><span>{cumplidas} / 4 cumplidas</span></div>
        )}

        {plan && COMIDAS.map(c => {
          const items = itemsDe(c.id)
          const reg = registros[c.id]
          const hecha = !!reg?.cumplida
          const pendiente = abierta === c.id && !hecha
          const elegirOpcion = modo === 'opciones' && items.length > 1
          const puedeConfirmar = !!borrador.hambre && (!elegirOpcion || !!borrador.opcion_id)
          return (
            <section key={c.id} className="card">
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <div className="stack" style={{ gap: 4 }}>
                  <h2 className="card__title">{c.label}</h2>
                  {modo === 'pautas' && <div className="muted" style={{ fontSize: 14 }}>Armala con las pautas de arriba.</div>}
                  {modo !== 'pautas' && items.length === 0 && <div className="muted" style={{ fontSize: 14 }}>Sin indicación para hoy.</div>}
                  {modo !== 'pautas' && items.map((o, i) => (
                    <div key={o.id} className="muted" style={{ fontSize: 14, lineHeight: 1.4 }}>
                      {items.length > 1 && <b style={{ color: 'var(--faint)' }}>{i + 1}. </b>}{o.texto}
                    </div>
                  ))}
                </div>
                <CheckBtn on={hecha} label={hecha ? `Desmarcar ${c.label}` : `Marcar ${c.label} como cumplida`}
                          onClick={() => (hecha ? desmarcar(c.id) : pendiente ? setAbierta(null) : abrir(c.id))} />
              </div>

              {pendiente && (
                <div className="stack" style={{ gap: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                  {elegirOpcion && (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>¿Qué opción elegiste?</div>
                      <div className="wrap">
                        {items.map((o, i) => (
                          <Chip key={o.id} on={borrador.opcion_id === o.id} onClick={() => setBorrador(b => ({ ...b, opcion_id: o.id }))}>
                            Opción {i + 1}
                          </Chip>
                        ))}
                      </div>
                    </>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 700 }}>¿Qué hambre tenías?</div>
                  <div className="wrap">
                    {HAMBRE.map(h => (
                      <Chip key={h.id} on={borrador.hambre === h.id} onClick={() => setBorrador(b => ({ ...b, hambre: h.id }))}>{h.label}</Chip>
                    ))}
                  </div>
                  <div className="grid2" style={{ gap: 8 }}>
                    <button className="btn btn--ghost btn--sm" onClick={() => setAbierta(null)}>Cancelar</button>
                    <button className="btn btn--sm" disabled={!puedeConfirmar} onClick={() => confirmar(c.id)}>
                      {puedeConfirmar ? 'Confirmar' : 'Elegí una opción'}
                    </button>
                  </div>
                </div>
              )}

              {hecha && (
                <div className="muted">
                  Hambre: <b style={{ color: 'var(--violet-soft)' }}>{HAMBRE.find(h => h.id === reg.hambre)?.label || '—'}</b>
                  {reg.opcion_id && items.length > 1 && <> · Opción {items.findIndex(o => o.id === reg.opcion_id) + 1}</>}
                </div>
              )}
            </section>
          )
        })}

        {error && <div className="error" role="alert">{error}</div>}
      </div>
    </>
  )
}
