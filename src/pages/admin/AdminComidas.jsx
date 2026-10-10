import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../supabase'
import { COMIDAS, DIAS_SEMANA, FASES, GRUPOS } from '../../lib/constantes'
import { Cargando, Header } from '../../components/ui'

const MODOS = [
  { id: 'opciones', label: 'Opciones', ayuda: 'Cada comida tiene 2 o 3 opciones; la alumna elige cuál comió.' },
  { id: 'por_dia', label: 'Por día', ayuda: 'Un plan cerrado para cada día de la semana.' },
  { id: 'pautas', label: 'Pautas', ayuda: 'Estructura del plato + lista de alimentos para que arme ella.' },
]

export default function AdminComidas() {
  const { id: alumnaId } = useParams()
  const [alumna, setAlumna] = useState(null)
  const [fase, setFase] = useState(1)
  const [plan, setPlan] = useState(undefined)
  const [modo, setModo] = useState('opciones')
  const [opciones, setOpciones] = useState({})   // comida -> [{id?, texto}]
  const [porDia, setPorDia] = useState({})       // `${dia}|${comida}` -> {id?, texto}
  const [dia, setDia] = useState(1)
  const [pautas, setPautas] = useState({})       // grupo -> {porcion, alimentos (texto)}
  const [originales, setOriginales] = useState([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase.from('perfiles').select('nombre').eq('id', alumnaId).single().then(({ data }) => setAlumna(data))
  }, [alumnaId])

  const cargar = useCallback(async () => {
    setMsg(''); setError('')
    const { data: p } = await supabase.from('planes_comida').select('*').eq('alumna_id', alumnaId).eq('fase', fase).maybeSingle()
    let ops = [], pas = []
    if (p) {
      const [o, t] = await Promise.all([
        supabase.from('plan_opciones').select('*').eq('plan_id', p.id).order('opcion_numero'),
        supabase.from('plan_pautas').select('*').eq('plan_id', p.id),
      ])
      ops = o.data || []; pas = t.data || []
    }
    const op = {}, pd = {}, pa = {}
    for (const c of COMIDAS) op[c.id] = []
    for (const o of ops) {
      if (o.dia_semana == null) op[o.comida].push({ id: o.id, texto: o.texto })
      else pd[`${o.dia_semana}|${o.comida}`] = { id: o.id, texto: o.texto }
    }
    for (const c of COMIDAS) if (!op[c.id].length) op[c.id] = [{ texto: '' }, { texto: '' }]
    for (const g of GRUPOS) {
      const r = pas.find(x => x.grupo === g.id)
      pa[g.id] = { porcion: r?.porcion || '', alimentos: (r?.alimentos || []).join(', ') }
    }
    setPlan(p || null); setModo(p?.modo || 'opciones')
    setOpciones(op); setPorDia(pd); setPautas(pa); setOriginales(ops)
  }, [alumnaId, fase])

  useEffect(() => { cargar() }, [cargar])

  if (plan === undefined) return <Cargando />

  async function asegurarPlan() {
    const { data, error } = await supabase.from('planes_comida')
      .upsert({ alumna_id: alumnaId, fase, modo }, { onConflict: 'alumna_id,fase' }).select().single()
    if (error) throw error
    return data.id
  }

  // Sincroniza las filas de plan_opciones de un modo: actualiza, inserta y borra lo vaciado
  async function sincronizar(planId, filas, deEsteModo) {
    const quedan = new Set(filas.filter(f => f.id).map(f => f.id))
    const borrar = deEsteModo.filter(o => !quedan.has(o.id)).map(o => o.id)
    if (borrar.length) { const { error } = await supabase.from('plan_opciones').delete().in('id', borrar); if (error) throw error }
    const existentes = filas.filter(f => f.id).map(f => ({ ...f, plan_id: planId }))
    const nuevas = filas.filter(f => !f.id).map(({ id, ...f }) => ({ ...f, plan_id: planId }))
    if (existentes.length) { const { error } = await supabase.from('plan_opciones').upsert(existentes); if (error) throw error }
    if (nuevas.length) { const { error } = await supabase.from('plan_opciones').insert(nuevas); if (error) throw error }
  }

  async function guardar() {
    setGuardando(true); setError(''); setMsg('')
    try {
      const planId = await asegurarPlan()
      if (modo === 'opciones') {
        const filas = []
        for (const c of COMIDAS) {
          opciones[c.id].filter(o => o.texto.trim()).forEach((o, i) =>
            filas.push({ id: o.id, comida: c.id, dia_semana: null, opcion_numero: i + 1, texto: o.texto.trim() }))
        }
        await sincronizar(planId, filas, originales.filter(o => o.dia_semana == null))
      } else if (modo === 'por_dia') {
        const filas = Object.entries(porDia).filter(([, v]) => v.texto.trim()).map(([k, v]) => {
          const [d, comida] = k.split('|')
          return { id: v.id, comida, dia_semana: Number(d), opcion_numero: 1, texto: v.texto.trim() }
        })
        await sincronizar(planId, filas, originales.filter(o => o.dia_semana != null))
      } else {
        const filas = GRUPOS.map(g => ({
          plan_id: planId, grupo: g.id, porcion: pautas[g.id].porcion.trim() || null,
          alimentos: pautas[g.id].alimentos.split(',').map(s => s.trim()).filter(Boolean),
        }))
        const { error } = await supabase.from('plan_pautas').upsert(filas, { onConflict: 'plan_id,grupo' })
        if (error) throw error
      }
      await cargar()
      setMsg(`Plan guardado. ${alumna?.nombre || 'La alumna'} ya lo ve en modo "${MODOS.find(m => m.id === modo).label}".`)
    } catch (e) {
      setError('No se pudo guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const setOp = (comida, i, texto) =>
    setOpciones(o => ({ ...o, [comida]: o[comida].map((x, j) => (j === i ? { ...x, texto } : x)) }))

  return (
    <>
      <Header kicker={<Link to="/admin" className="row" style={{ textDecoration: 'none', color: 'var(--muted)' }}><ChevronLeft size={18} aria-hidden="true" />Alumnas</Link>}
              title="Plan de comidas" sub={alumna?.nombre}>
        <div className="field">
          <label htmlFor="fase">Fase</label>
          <select id="fase" className="input" value={fase} onChange={e => setFase(Number(e.target.value))}>
            {[1, 2, 3].map(f => <option key={f} value={f}>{FASES[f]}</option>)}
          </select>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="muted">Estrategia para esta alumna</span>
          <div className="seg" role="group" aria-label="Tipo de plan" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {MODOS.map(m => <button key={m.id} aria-pressed={modo === m.id} onClick={() => { setMsg(''); setModo(m.id) }}>{m.label}</button>)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--violet-soft)' }}>{MODOS.find(m => m.id === modo).ayuda}</div>
          {plan && plan.modo !== modo && <div className="faint">Hoy la alumna ve el modo "{MODOS.find(m => m.id === plan.modo).label}". Cambia al guardar.</div>}
        </div>
      </Header>

      <div className="body" style={{ paddingBottom: 40 }}>
        {modo === 'opciones' && COMIDAS.map(c => (
          <section key={c.id} className="card" style={{ padding: 14, gap: 8 }}>
            <h2 className="card__title" style={{ fontSize: 22 }}>{c.label}</h2>
            {opciones[c.id].map((o, i) => (
              <div key={o.id || `n${i}`} className="row">
                <span style={{ width: 24, fontFamily: 'var(--display)', fontSize: 18, color: 'var(--faint)' }}>{i + 1}</span>
                <input className="input input--sm" style={{ flex: 1 }} placeholder="Escribí la opción" aria-label={`${c.label}, opción ${i + 1}`}
                       value={o.texto} onChange={e => setOp(c.id, i, e.target.value)} />
                <button className="icon-btn" style={{ background: 'transparent' }} aria-label={`Quitar opción ${i + 1} de ${c.label}`}
                        onClick={() => setOpciones(x => ({ ...x, [c.id]: x[c.id].filter((_, j) => j !== i) }))}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
            <button className="btn-link" style={{ color: 'var(--violet-soft)', textDecoration: 'none', fontWeight: 700, alignSelf: 'flex-start', padding: 0 }}
                    onClick={() => setOpciones(x => ({ ...x, [c.id]: [...x[c.id], { texto: '' }] }))}>
              <Plus size={14} aria-hidden="true" /> Agregar opción
            </button>
          </section>
        ))}

        {modo === 'por_dia' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
              {DIAS_SEMANA.map((n, i) => (
                <button key={n} className={'tab' + (dia === i + 1 ? ' tab--on' : '')} aria-pressed={dia === i + 1}
                        aria-label={`Plan del ${n.toLowerCase()}`} onClick={() => setDia(i + 1)}>{n[0]}</button>
              ))}
            </div>
            <div className="muted">{DIAS_SEMANA[dia - 1]}</div>
            {COMIDAS.map(c => {
              const k = `${dia}|${c.id}`
              return (
                <div key={k} className="field">
                  <label htmlFor={k} style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--text)' }}>{c.label}</label>
                  <textarea id={k} className="input" rows={2} placeholder="Comida de este día" value={porDia[k]?.texto || ''}
                            onChange={e => setPorDia(p => ({ ...p, [k]: { ...p[k], texto: e.target.value } }))} />
                </div>
              )
            })}
            <button className="btn btn--dashed btn--sm" onClick={() => {
              if (!window.confirm(`¿Copiar el ${DIAS_SEMANA[dia - 1].toLowerCase()} a todos los días vacíos?`)) return
              setPorDia(p => {
                const n = { ...p }
                for (let d = 1; d <= 7; d++) for (const c of COMIDAS) {
                  const k = `${d}|${c.id}`, src = p[`${dia}|${c.id}`]?.texto
                  if (d !== dia && src && !n[k]?.texto?.trim()) n[k] = { ...n[k], texto: src }
                }
                return n
              })
            }}>Copiar este día a los días vacíos</button>
          </>
        )}

        {modo === 'pautas' && (
          <section className="card">
            <h2 className="card__title" style={{ fontSize: 22 }}>Armado del plato</h2>
            {GRUPOS.map(g => (
              <div key={g.id} className="stack">
                <span className="label">{g.label}</span>
                <input className="input input--sm" placeholder="Porción (ej: 1 palma)" aria-label={`Porción de ${g.label}`}
                       value={pautas[g.id].porcion} onChange={e => setPautas(p => ({ ...p, [g.id]: { ...p[g.id], porcion: e.target.value } }))} />
                <input className="input input--sm" placeholder="Alimentos, separados por coma" aria-label={`Alimentos de ${g.label}`}
                       value={pautas[g.id].alimentos} onChange={e => setPautas(p => ({ ...p, [g.id]: { ...p[g.id], alimentos: e.target.value } }))} />
              </div>
            ))}
          </section>
        )}

        {error && <div className="error" role="alert">{error}</div>}
        {msg && <div className="notice" role="status">{msg}</div>}
        <button className="btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar plan'}</button>
      </div>
    </>
  )
}
