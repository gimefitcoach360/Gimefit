import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis } from 'recharts'
import { supabase } from '../supabase'
import { useAuth } from '../auth'
import { useFaseActual } from '../lib/useFaseActual'
import { FASES, hoyAR } from '../lib/constantes'
import { Cargando, Chip, Header } from '../components/ui'
import Medidas from '../components/Medidas'

export default function Progreso() {
  const { user } = useAuth()
  const pos = useFaseActual(user.id)
  const [d, setD] = useState(null)
  const [ejSel, setEjSel] = useState(null)

  useEffect(() => {
    if (!pos) return
    let vivo = true
    ;(async () => {
      const desde = hoyAR(new Date(Date.now() - 6 * 86400000))
      const [dias, comp, series, comidas, acts, checks] = await Promise.all([
        supabase.from('rutina_dias').select('id, fase, semana, dia_numero').eq('alumna_id', user.id),
        supabase.from('dias_completados').select('dia_id').eq('alumna_id', user.id),
        supabase.from('registros_series').select('peso_kg, hecho, rutina_ejercicios!inner(nombre, dia_id)').eq('alumna_id', user.id),
        supabase.from('registros_comida').select('id', { count: 'exact', head: true }).eq('alumna_id', user.id).eq('cumplida', true),
        supabase.from('actividades_hechas').select('actividad_id', { count: 'exact', head: true }).eq('alumna_id', user.id),
        supabase.from('checkins').select('energia').eq('alumna_id', user.id).gte('fecha', desde),
      ])
      if (!vivo) return
      setD({
        dias: dias.data || [],
        completados: new Set((comp.data || []).map(x => x.dia_id)),
        series: series.data || [],
        comidas: comidas.count ?? 0,
        actividades: acts.count ?? 0,
        energias: (checks.data || []).map(c => c.energia),
      })
    })()
    return () => { vivo = false }
  }, [pos, user.id])

  // Kilos máximos por ejercicio y por semana del programa (1 a 12)
  const fuerza = useMemo(() => {
    if (!d) return {}
    const semanaDe = Object.fromEntries(d.dias.map(x => [x.id, (x.fase - 1) * 4 + x.semana]))
    const out = {}
    for (const s of d.series) {
      if (!s.hecho || s.peso_kg == null) continue
      const nombre = s.rutina_ejercicios.nombre
      const sem = semanaDe[s.rutina_ejercicios.dia_id]
      if (!sem) continue
      out[nombre] ??= {}
      out[nombre][sem] = Math.max(out[nombre][sem] ?? 0, Number(s.peso_kg))
    }
    return out
  }, [d])

  if (!pos || !d) return <Cargando />

  const nombres = Object.keys(fuerza).sort()
  const elegido = ejSel && fuerza[ejSel] ? ejSel : nombres[0]
  const barras = elegido
    ? Object.entries(fuerza[elegido]).sort((a, b) => a[0] - b[0]).map(([sem, kg]) => ({ sem: `Sem ${sem}`, kg }))
    : []
  const subida = barras.length > 1 ? barras[barras.length - 1].kg - barras[0].kg : 0

  const actual = (pos.fase - 1) * 4 + pos.semana
  const diasFase = d.dias.filter(x => x.fase === pos.fase)
  const energia = d.energias.length ? (d.energias.reduce((a, b) => a + b, 0) / d.energias.length).toFixed(1) : '—'
  const seriesHechas = d.series.filter(s => s.hecho).length

  return (
    <>
      <Header kicker={`${FASES[pos.fase]} · Semana ${pos.semana} de 4`} title="Progreso">
        <div className="stack" style={{ gap: 6 }}>
          <div role="img" aria-label={`Programa: semana ${actual} de 12`} style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 3 }}>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} style={{ height: 8, borderRadius: 4, background: i + 1 < actual ? 'var(--violet)' : i + 1 === actual ? 'var(--violet-soft)' : 'var(--line-2)',
                                    outline: i + 1 === actual ? '2px solid var(--violet-pale)' : 'none', outlineOffset: 1 }} />
            ))}
          </div>
          <div className="faint" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', fontSize: 11 }}>
            <span>Activación</span><span style={{ textAlign: 'center' }}>Progresión</span><span style={{ textAlign: 'right' }}>Consolidación</span>
          </div>
        </div>
      </Header>

      <div className="body">
        <div className="grid2">
          <div className="card" style={{ gap: 2 }}><span className="muted">Entrenos hechos</span>
            <span className="big">{d.completados.size} <small style={{ fontSize: 20, color: 'var(--faint)' }}>/ {d.dias.length}</small></span></div>
          <div className="card" style={{ gap: 2 }}><span className="muted">Series registradas</span><span className="big">{seriesHechas}</span></div>
          <div className="card" style={{ gap: 2 }}><span className="muted">Comidas cumplidas</span><span className="big">{d.comidas}</span></div>
          <div className="card" style={{ gap: 2 }}><span className="muted">Actividades hechas</span>
            <span className="big">{d.actividades} <small style={{ fontSize: 20, color: 'var(--faint)' }}>/ 36</small></span></div>
        </div>

        <section className="card">
          <div>
            <h2 className="card__title">Tu fuerza</h2>
            <div className="muted">Kilos máximos por semana</div>
          </div>
          {!nombres.length ? (
            <div className="muted">Cuando cargues kilos en tus series, acá vas a ver cómo subís.</div>
          ) : (
            <>
              <div className="row" style={{ overflowX: 'auto', paddingBottom: 2 }}>
                {nombres.map(n => <Chip key={n} on={n === elegido} onClick={() => setEjSel(n)} style={{ flexShrink: 0 }}>{n}</Chip>)}
              </div>
              <div role="img" aria-label={`${elegido}: ${barras.map(b => `${b.sem} ${b.kg} kg`).join(', ')}`} style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barras} margin={{ top: 24, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="sem" tick={{ fill: '#71717A', fontSize: 12 }} axisLine={{ stroke: '#27272A' }} tickLine={false} />
                    <Bar dataKey="kg" fill="#A855F7" radius={[8, 8, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                      <LabelList dataKey="kg" position="top" formatter={v => `${v} kg`} style={{ fill: '#E9D5FF', fontSize: 12, fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-2)' }}>
                {subida > 0 ? `Subiste ${subida} kg en ${elegido.toLowerCase()}.` : `Venís sosteniendo tus kilos en ${elegido.toLowerCase()}.`}
              </div>
            </>
          )}
        </section>

        <section className="card">
          <div>
            <h2 className="card__title">Constancia</h2>
            <div className="muted">Entrenos de cada semana de {FASES[pos.fase]}</div>
          </div>
          {[1, 2, 3, 4].map(sem => {
            const ds = diasFase.filter(x => x.semana === sem).sort((a, b) => a.dia_numero - b.dia_numero)
            return (
              <div key={sem} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
                <span className="muted">Sem {sem}</span>
                <div className="row" style={{ gap: 6 }}>
                  {ds.length === 0 && <span className="faint">Sin cargar</span>}
                  {ds.map(x => {
                    const ok = d.completados.has(x.id)
                    return (
                      <div key={x.id} aria-label={`Día ${x.dia_numero}${ok ? ' hecho' : ''}`}
                           style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: ok ? 'var(--violet)' : 'transparent', border: ok ? 'none' : '1px solid var(--line-3)', color: '#000' }}>
                        {ok && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div className="muted" style={{ fontSize: 14 }}>Energía promedio de los últimos 7 días: <b style={{ color: 'var(--violet-soft)' }}>{energia}{energia !== '—' && ' / 5'}</b></div>
        </section>
        <Medidas />
      </div>
    </>
  )
}
