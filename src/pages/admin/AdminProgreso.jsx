import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '../../supabase'
import { FASES } from '../../lib/constantes'
import { faseInicio } from '../../lib/acceso'
import { Cargando, Header } from '../../components/ui'

const SEMANAS = [1, 2, 3, 4]
const kg = n => Number(n).toLocaleString('es-AR')
const rango = (vals, fmt = String) => {
  const v = vals.filter(x => x != null).map(Number)
  if (!v.length) return null
  const min = Math.min(...v), max = Math.max(...v)
  return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`
}

const ESTADO = {
  cumplio:  { texto: 'Cumplió', fondo: 'var(--violet-bg)', color: 'var(--violet-soft)', borde: 'var(--violet-line)' },
  parcial:  { fondo: '#2A2110', color: '#FCD34D', borde: '#78350F' },
  nohizo:   { texto: 'No lo hizo', fondo: '#2A1210', color: '#FCA5A5', borde: '#7F1D1D' },
  sinreg:   { texto: 'Sin registrar', fondo: 'transparent', color: 'var(--faint)', borde: 'var(--line-2)' },
}

function Pill({ tipo, texto }) {
  const e = ESTADO[tipo]
  return (
    <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap',
                   background: e.fondo, color: e.color, border: `1px solid ${e.borde}` }}>{texto || e.texto}</span>
  )
}

/**
 * Progreso por ejercicio y por semana (vista de Gime):
 * filas = ejercicios (agrupados por día), columnas = Plan + Semanas 1 a 4 de la fase elegida.
 */
export default function AdminProgreso() {
  const { id } = useParams()
  const [perfil, setPerfil] = useState(null)
  const [fase, setFase] = useState(null)
  const [d, setD] = useState(null)

  useEffect(() => {
    supabase.from('perfiles').select('*').eq('id', id).single().then(({ data }) => setPerfil(data))
  }, [id])

  // Fase por defecto: la que está haciendo ahora (primer día sin completar)
  useEffect(() => {
    if (!perfil || fase) return
    ;(async () => {
      const inicio = faseInicio(perfil)
      const [{ data: dias }, { data: comp }] = await Promise.all([
        supabase.from('rutina_dias').select('id, fase').eq('alumna_id', id).gte('fase', inicio).order('fase').order('semana').order('dia_numero'),
        supabase.from('dias_completados').select('dia_id').eq('alumna_id', id),
      ])
      const hechos = new Set((comp || []).map(c => c.dia_id))
      const lista = dias || []
      setFase((lista.find(x => !hechos.has(x.id)) || lista[lista.length - 1])?.fase ?? inicio)
    })()
  }, [perfil, fase, id])

  useEffect(() => {
    if (!fase) return
    let vivo = true
    setD(null)
    ;(async () => {
      const { data: dias } = await supabase.from('rutina_dias').select('*').eq('alumna_id', id).eq('fase', fase)
        .order('semana').order('dia_numero')
      const diaIds = (dias || []).map(x => x.id)
      const [{ data: ejs }, { data: comp }] = diaIds.length ? await Promise.all([
        supabase.from('rutina_ejercicios').select('*').in('dia_id', diaIds).order('orden'),
        supabase.from('dias_completados').select('dia_id, completado_at, sensacion').in('dia_id', diaIds),
      ]) : [{ data: [] }, { data: [] }]
      const ejIds = (ejs || []).map(e => e.id)
      const { data: regs } = ejIds.length
        ? await supabase.from('registros_series').select('ejercicio_id, serie_numero, peso_kg, reps, hecho').in('ejercicio_id', ejIds)
        : { data: [] }
      if (vivo) setD({ dias: dias || [], ejs: ejs || [], comp: comp || [], regs: regs || [] })
    })()
    return () => { vivo = false }
  }, [fase, id])

  const tabla = useMemo(() => {
    if (!d) return null
    const diaPorId = Object.fromEntries(d.dias.map(x => [x.id, x]))
    const completados = new Set(d.comp.map(c => c.dia_id))
    const regsPorEj = {}
    for (const r of d.regs) (regsPorEj[r.ejercicio_id] ??= []).push(r)

    // Semana "en curso": la del primer día sin completar de esta fase
    const pendiente = d.dias.find(x => !completados.has(x.id))
    const enCurso = pendiente ? pendiente.semana : (d.dias.length ? 5 : 1)

    // Agrupar: día -> ejercicio (por nombre) -> semana
    const grupos = {}
    for (const e of d.ejs) {
      const dia = diaPorId[e.dia_id]
      const g = (grupos[dia.dia_numero] ??= { numero: dia.dia_numero, nombre: dia.nombre, filas: {} })
      if (dia.semana === 1 || !g.nombre) g.nombre = dia.nombre
      const k = e.nombre.trim().toLowerCase()
      const f = (g.filas[k] ??= { nombre: e.nombre, orden: e.orden, plan: null, semanas: {} })
      if (!f.plan || dia.semana < f.plan.semana) f.plan = { semana: dia.semana, series: e.series, reps: e.reps_objetivo }
      if (dia.semana === 1) f.orden = e.orden
      f.semanas[dia.semana] = { ej: e, dia }
    }

    const celda = (s, sem) => {
      if (!s) return { tipo: 'vacio' }
      const regs = regsPorEj[s.ej.id] || []
      const hechas = regs.filter(r => r.hecho)
      const terminado = completados.has(s.dia.id)
      if (!hechas.length) {
        if (terminado) return { tipo: 'nohizo' }
        return sem < enCurso ? { tipo: 'sinreg' } : { tipo: 'futuro' }
      }
      const reps = rango(hechas.map(r => r.reps ?? s.ej.reps_objetivo))
      const peso = rango(hechas.map(r => r.peso_kg), kg)
      const detalle = `${hechas.length}×${reps} reps${peso ? ` · ${peso} kg` : ''}`
      return hechas.length >= s.ej.series
        ? { tipo: 'cumplio', detalle }
        : { tipo: 'parcial', detalle, pill: `Parcial ${hechas.length}/${s.ej.series}` }
    }

    const dias = Object.values(grupos).sort((a, b) => a.numero - b.numero).map(g => ({
      ...g,
      filas: Object.values(g.filas).sort((a, b) => a.orden - b.orden)
        .map(f => ({ ...f, celdas: SEMANAS.map(sem => celda(f.semanas[sem], sem)) })),
    }))
    return { dias, enCurso }
  }, [d])

  const th = { padding: '10px 12px', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: '12px', borderTop: '1px solid var(--line)', textAlign: 'center', verticalAlign: 'middle' }
  const enCursoBg = 'rgba(168, 85, 247, 0.08)'
  const fija = { position: 'sticky', left: 0, background: 'var(--surface, #0A0A0A)', zIndex: 1, textAlign: 'left' }

  return (
    <>
      <Header kicker={<Link to={`/admin/alumna/${id}`} className="row" style={{ textDecoration: 'none', color: 'var(--muted)' }}><ChevronLeft size={18} aria-hidden="true" />Ficha</Link>}
              title="Progreso por ejercicio" sub={perfil?.nombre}>
        <div className="field">
          <label htmlFor="fase-prog">Fase</label>
          <select id="fase-prog" className="input" value={fase || ''} onChange={e => setFase(Number(e.target.value))}>
            {[1, 2, 3].map(f => <option key={f} value={f}>{FASES[f]}</option>)}
          </select>
        </div>
      </Header>

      <div className="body" style={{ paddingBottom: 40 }}>
        {!tabla ? <Cargando /> : !tabla.dias.length ? (
          <div className="notice">{FASES[fase]} todavía no tiene rutina cargada.</div>
        ) : (
          <>
            <div className="muted" style={{ fontSize: 14 }}>
              Lo que registró en cada ejercicio, semana por semana: series hechas × reps · kilos (de menor a mayor).
            </div>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, ...fija, minWidth: 150 }}>Ejercicio</th>
                    <th style={th}>Plan</th>
                    {SEMANAS.map(sem => (
                      <th key={sem} style={{ ...th, background: sem === tabla.enCurso ? enCursoBg : undefined, minWidth: 130 }}>
                        {sem === tabla.enCurso && <div style={{ fontSize: 10, color: 'var(--violet-soft)', marginBottom: 2 }}>En curso</div>}
                        <span style={{ color: sem <= tabla.enCurso ? 'var(--violet-soft)' : 'var(--faint)' }}>Sem {sem}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tabla.dias.map(g => [
                    <tr key={`d${g.numero}`}>
                      <td colSpan={2 + SEMANAS.length} style={{ ...td, ...fija, padding: '14px 12px 8px', textAlign: 'left' }}>
                        <span style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 0.5 }}>Día {g.numero}</span>
                        <span className="muted" style={{ marginLeft: 8 }}>{g.nombre}</span>
                      </td>
                    </tr>,
                    ...g.filas.map(f => (
                      <tr key={`d${g.numero}-${f.nombre}`}>
                        <td style={{ ...td, ...fija, fontWeight: 600 }}>{f.nombre}</td>
                        <td style={{ ...td, color: 'var(--faint)', whiteSpace: 'nowrap' }}>{f.plan ? `${f.plan.series}×${f.plan.reps} reps` : '—'}</td>
                        {f.celdas.map((c, i) => (
                          <td key={i} style={{ ...td, background: i + 1 === tabla.enCurso ? enCursoBg : undefined }}>
                            {c.tipo === 'vacio' || c.tipo === 'futuro' ? <span className="faint">—</span> : (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                {c.detalle && <span style={{ whiteSpace: 'nowrap' }}>{c.detalle}</span>}
                                <Pill tipo={c.tipo} texto={c.pill} />
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
            <div className="faint" style={{ fontSize: 13, lineHeight: 1.5 }}>
              <b>Cumplió</b>: hizo todas las series. <b>Parcial</b>: hizo algunas. <b>No lo hizo</b>: terminó el día sin marcar ese ejercicio.
              <b> Sin registrar</b>: la semana ya pasó y no cargó nada. En el celu, deslizá la tabla hacia los costados.
            </div>
          </>
        )}
      </div>
    </>
  )
}
