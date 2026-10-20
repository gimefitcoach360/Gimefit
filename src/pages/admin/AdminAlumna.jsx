import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarClock, ChevronLeft, Dumbbell, MessageCircle, Send, Trash2, Utensils } from 'lucide-react'
import { supabase } from '../../supabase'
import { COMIDAS, FASES, HAMBRE, hoyAR } from '../../lib/constantes'
import { estadoVencimiento, formatoFecha } from '../../lib/fechas'
import { DOMINIO } from '../../lib/claves'
import { Cargando, Chip, Header } from '../../components/ui'
import BotonActiva from '../../components/BotonActiva'
import { SECCIONES, faseInicio, seccionesDe, tieneAcceso } from '../../lib/acceso'

const DIA_MS = 86400000

function Seccion({ titulo, icono: Icono, children, extra }) {
  return (
    <section className="card">
      <div className="between">
        <h2 className="card__title row" style={{ gap: 8 }}>{Icono && <Icono size={20} aria-hidden="true" style={{ color: 'var(--violet-soft)' }} />}{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  )
}

function Dato({ etiqueta, valor, sub }) {
  return (
    <div className="card" style={{ gap: 2, padding: 14 }}>
      <span className="muted">{etiqueta}</span>
      <span className="big" style={{ fontSize: 30 }}>{valor}</span>
      {sub && <span className="faint">{sub}</span>}
    </div>
  )
}

export default function AdminAlumna() {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [vence, setVence] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [fotos, setFotos] = useState({})
  const [guardandoSec, setGuardandoSec] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const navigate = useNavigate()

  const cargar = useCallback(async () => {
    const desde = hoyAR(new Date(Date.now() - 6 * DIA_MS))
    const desdeTs = new Date(Date.now() - 7 * DIA_MS).toISOString()
    const q = (t) => supabase.from(t).select('*').eq('alumna_id', id)
    const [perfil, dias, comp, checks, comidas, emos, acts, msjs, meds] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', id).single(),
      q('rutina_dias').order('fase').order('semana').order('dia_numero'),
      q('dias_completados').order('completado_at', { ascending: false }),
      q('checkins').gte('fecha', desde).order('fecha'),
      q('registros_comida').gte('fecha', desde).eq('cumplida', true),
      q('registros_emocionales').order('created_at', { ascending: false }).limit(5),
      supabase.from('actividades_hechas').select('hecha_at, actividades(titulo, fase, semana, numero)').eq('alumna_id', id).order('hecha_at', { ascending: false }),
      q('mensajes').order('created_at', { ascending: false }).limit(3),
      q('medidas').order('fecha', { ascending: false }),
    ])
    const completados = new Set((comp.data || []).map(c => c.dia_id))
    const inicio = faseInicio(perfil.data)
    const proximo = (dias.data || []).find(x => x.fase >= inicio && !completados.has(x.id))
    setD({
      perfil: perfil.data, dias: dias.data || [], comp: comp.data || [], completados, proximo,
      checks: checks.data || [], comidas: comidas.data || [], emos: emos.data || [],
      acts: acts.data || [], actsSemana: (acts.data || []).filter(a => a.hecha_at >= desdeTs),
      msjs: msjs.data || [], meds: meds.data || [],
    })
    setVence(perfil.data?.vence || '')
    // Fotos privadas: links temporales (1 hora)
    const paths = (meds.data || []).filter(m => m.foto_path).map(m => m.foto_path)
    if (paths.length) {
      const { data: urls } = await supabase.storage.from('progreso').createSignedUrls(paths, 3600)
      setFotos(Object.fromEntries((urls || []).filter(u => u.signedUrl).map(u => [u.path, u.signedUrl])))
    }
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  if (!d) return <Cargando />
  const p = d.perfil
  const est = estadoVencimiento(p?.vence)

  async function guardarVence() {
    setError(''); setAviso('')
    const { error } = await supabase.from('perfiles').update({ vence: vence || null }).eq('id', id)
    if (error) return setError('No se pudo guardar la fecha.')
    setAviso(vence ? `Plan hasta el ${formatoFecha(vence, { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Se quitó la fecha de vencimiento.')
    cargar()
  }

  // Qué secciones ve la alumna (al menos una)
  async function cambiarSeccion(sec) {
    const actuales = seccionesDe(p)
    const nuevas = actuales.includes(sec) ? actuales.filter(x => x !== sec) : SECCIONES.map(x => x.id).filter(x => x === sec || actuales.includes(x))
    if (!nuevas.length) return setError('Tiene que tener al menos una sección habilitada.')
    setError(''); setAviso(''); setGuardandoSec(true)
    const { error } = await supabase.from('perfiles').update({ secciones: nuevas }).eq('id', id)
    setGuardandoSec(false)
    if (error) return setError('No se pudo guardar. ¿Corriste el archivo 07 en Supabase?')
    setD(x => ({ ...x, perfil: { ...x.perfil, secciones: nuevas } }))
  }

  async function cambiarFaseInicio(f) {
    setError(''); setAviso('')
    const { error } = await supabase.from('perfiles').update({ fase_inicio: f }).eq('id', id)
    if (error) return setError('No se pudo guardar. ¿Corriste el archivo 08 en Supabase?')
    setAviso(f === 1 ? 'Arranca desde Activación.' : `Arranca en ${FASES[f]}: las fases anteriores no se le muestran.`)
    cargar()
  }

  // Elimina la cuenta y TODO lo de la alumna. No se puede deshacer.
  async function eliminarAlumna() {
    const nombre = p?.nombre || 'esta alumna'
    if (!window.confirm(`¿Eliminar a ${nombre}? Se borra su cuenta y todo lo que cargó: rutinas, entrenamientos, comidas, check-ins, medidas y fotos. No se puede deshacer.\n\nSi solo querés que no entre por un tiempo, usá el botón Inactiva.`)) return
    const escrito = window.prompt(`Para confirmar, escribí ELIMINAR`)
    if ((escrito || '').trim().toUpperCase() !== 'ELIMINAR') { if (escrito !== null) setError('No se eliminó: tenías que escribir ELIMINAR.'); return }
    setError(''); setAviso(''); setBorrando(true)
    // 1) Fotos de progreso (no se borran solas)
    const { data: archivos } = await supabase.storage.from('progreso').list(id, { limit: 1000 })
    if (archivos?.length) await supabase.storage.from('progreso').remove(archivos.map(f => `${id}/${f.name}`))
    // 2) Cuenta y todos sus datos
    const { error } = await supabase.rpc('admin_borrar_alumna', { p_alumna: id })
    setBorrando(false)
    if (error) return setError(error.message.includes('admin_borrar_alumna') ? 'Falta correr el archivo 09 en Supabase.' : 'No se pudo eliminar: ' + error.message)
    navigate('/admin', { replace: true })
  }

  async function enviarMensaje() {
    if (!mensaje.trim()) return
    setError(''); setAviso('')
    const { error } = await supabase.from('mensajes').insert({ alumna_id: id, texto: mensaje.trim() })
    if (error) return setError('No se pudo enviar el mensaje.')
    setMensaje(''); setAviso('Mensaje enviado. Lo va a ver arriba de todo la próxima vez que entre.')
    cargar()
  }

  // Resumen de los últimos 7 días
  const entrenosSemana = d.comp.filter(c => Date.now() - new Date(c.completado_at) < 7 * DIA_MS)
  const energiaProm = d.checks.length ? (d.checks.reduce((a, c) => a + c.energia, 0) / d.checks.length).toFixed(1) : '—'
  const emocional = d.comidas.filter(c => c.hambre === 'emocional').length
  const diaPorId = Object.fromEntries(d.dias.map(x => [x.id, x]))

  return (
    <>
      <Header kicker={<Link to="/admin" className="row" style={{ textDecoration: 'none', color: 'var(--muted)' }}><ChevronLeft size={18} aria-hidden="true" />Alumnas</Link>}
              title={p?.nombre || 'Alumna'} sub={`Usuario: ${(p?.email || '').replace(DOMINIO, '')}`}>
        <div className="grid2" style={{ gap: 8 }}>
          <Link className="btn btn--ghost btn--sm" to={`/admin/alumna/${id}/rutina`} style={{ textDecoration: 'none' }}><Dumbbell size={16} aria-hidden="true" />Rutina</Link>
          <Link className="btn btn--ghost btn--sm" to={`/admin/alumna/${id}/comidas`} style={{ textDecoration: 'none' }}><Utensils size={16} aria-hidden="true" />Comidas</Link>
        </div>
      </Header>

      <div className="body" style={{ paddingBottom: 40 }}>
        {error && <div className="error" role="alert">{error}</div>}
        {aviso && <div className="notice" role="status">{aviso}</div>}

        <div className="card card--violet" style={{ gap: 4 }}>
          <span className="kicker">Dónde está</span>
          {d.proximo
            ? <span style={{ fontSize: 16 }}><b>{FASES[d.proximo.fase]}</b> · semana {d.proximo.semana} · próximo: Día {d.proximo.dia_numero} ({d.proximo.nombre})</span>
            : <span style={{ fontSize: 16 }}>{d.dias.length ? 'Completó todos los días cargados.' : 'Todavía no tiene rutina cargada.'}</span>}
        </div>

        <div className="grid2">
          <Dato etiqueta="Entrenos (7 días)" valor={entrenosSemana.length} />
          <Dato etiqueta="Energía promedio" valor={energiaProm} sub={d.checks.length ? `${d.checks.length} check-in(s)` : 'Sin check-ins'} />
          <Dato etiqueta="Comidas cumplidas" valor={d.comidas.length} sub={emocional ? `${emocional} con hambre emocional` : 'últimos 7 días'} />
          <Dato etiqueta="Actividades (7 días)" valor={d.actsSemana.length} sub={`${d.acts.length} en total`} />
        </div>

        <Seccion titulo="Mensaje para la alumna" icono={MessageCircle}>
          <label htmlFor="mensaje" className="muted">Lo ve arriba de todo cuando entra a la app.</label>
          <textarea id="mensaje" className="input" rows={3} value={mensaje} placeholder="Ej: ¡Gran semana! Esta semana probá subir 1 kg en sentadilla 💪"
                    onChange={e => setMensaje(e.target.value)} />
          <button className="btn btn--sm" onClick={enviarMensaje} disabled={!mensaje.trim()}><Send size={16} aria-hidden="true" />Enviar mensaje</button>
          {d.msjs.length > 0 && (
            <div className="stack">
              <span className="label">Últimos enviados</span>
              {d.msjs.map(m => <div key={m.id} className="muted" style={{ fontSize: 14 }}><b>{formatoFecha(m.created_at)}</b> · {m.texto}</div>)}
            </div>
          )}
        </Seccion>

        <Seccion titulo="Plan" icono={CalendarClock}
                 extra={est && <span className="badge" style={est.nivel === 'ok' ? {} : { background: '#FCA5A5' }}>{est.texto}</span>}>
          <div className="between" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <span className="muted">{tieneAcceso(p) ? 'Puede entrar a la app.' : 'No puede entrar a la app. Sus datos quedan guardados.'}</span>
            <BotonActiva alumna={p} grande onCambio={v => setD(x => ({ ...x, perfil: { ...x.perfil, activa: v } }))} />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Secciones que ve</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {SECCIONES.map(sec => (
                <Chip key={sec.id} on={seccionesDe(p).includes(sec.id)} disabled={guardandoSec} onClick={() => cambiarSeccion(sec.id)}>{sec.label}</Chip>
              ))}
            </div>
          </div>
          <label className="field"><span className="label">Empieza en la fase</span>
            <select className="input input--sm" value={faseInicio(p)} onChange={e => cambiarFaseInicio(Number(e.target.value))}>
              {[1, 2, 3].map(f => <option key={f} value={f}>{FASES[f]}{f > 1 ? ` (se saltea ${f === 2 ? 'Activación' : 'Activación y Progresión'})` : ''}</option>)}
            </select>
          </label>
          <label htmlFor="vence" className="muted">Fecha de vencimiento. Una semana antes, la alumna ve un aviso para renovar; al día siguiente de vencer, queda inactiva sola. Si ponés una fecha nueva, se reactiva.</label>
          <div className="row">
            <input id="vence" className="input input--sm" type="date" value={vence} onChange={e => setVence(e.target.value)} />
            <button className="btn btn--sm" style={{ flexShrink: 0 }} onClick={guardarVence}>Guardar</button>
          </div>
        </Seccion>

        <Seccion titulo="Últimos entrenos" icono={Dumbbell}>
          {d.comp.length === 0 ? <div className="muted">Todavía no completó ningún día.</div> : d.comp.slice(0, 6).map(c => {
            const dia = diaPorId[c.dia_id]
            return (
              <div key={c.id} className="between" style={{ fontSize: 14 }}>
                <span>{dia ? `${FASES[dia.fase]} S${dia.semana} · Día ${dia.dia_numero} · ${dia.nombre}` : 'Día'}</span>
                <span className="muted" style={{ whiteSpace: 'nowrap' }}>{formatoFecha(c.completado_at)}{c.sensacion ? ` · ${c.sensacion}` : ''}</span>
              </div>
            )
          })}
        </Seccion>

        <Seccion titulo="Últimos 7 días">
          <div className="stack">
            <span className="label">Check-ins</span>
            {d.checks.length === 0 ? <span className="muted">Sin check-ins.</span> : d.checks.map(c => (
              <div key={c.id} className="between" style={{ fontSize: 14 }}>
                <span>{formatoFecha(c.fecha, { weekday: 'short', day: 'numeric' })}</span>
                <span>Energía <b style={{ color: c.energia <= 2 ? '#FCA5A5' : 'var(--violet-soft)' }}>{c.energia}/5</b>{c.emociones?.length ? ` · ${c.emociones.join(', ')}` : ''}</span>
              </div>
            ))}
          </div>
          <div className="stack">
            <span className="label">Comidas</span>
            {d.comidas.length === 0 ? <span className="muted">Sin comidas marcadas.</span> : (
              <span style={{ fontSize: 14 }}>
                {COMIDAS.map(c => `${c.label}: ${d.comidas.filter(x => x.comida === c.id).length}`).join(' · ')}
                <br /><span className="muted">Hambre: {Object.entries(HAMBRE.reduce((acc, h) => ({ ...acc, [h.label]: d.comidas.filter(x => x.hambre === h.id).length }), {})).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
              </span>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Registros emocionales">
          {d.emos.length === 0 ? <div className="muted">Todavía no escribió ninguno.</div> : d.emos.map(r => (
            <div key={r.id} className="stack" style={{ gap: 2, fontSize: 14, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
              <span className="faint">{formatoFecha(r.created_at, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span><b>Qué pasó:</b> {r.que_paso}</span>
              <span><b>Qué sintió:</b> {r.que_senti}</span>
              {r.que_hice && <span><b>Qué hizo:</b> {r.que_hice}</span>}
            </div>
          ))}
        </Seccion>

        <Seccion titulo="Medidas y fotos">
          {d.meds.length === 0 ? <div className="muted">Todavía no cargó medidas. Las carga ella desde Progreso.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                <thead><tr className="label" style={{ textAlign: 'left' }}><th style={{ padding: 6 }}>Fecha</th><th style={{ padding: 6 }}>Peso (kg)</th><th style={{ padding: 6 }}>Cintura (cm)</th><th style={{ padding: 6 }}>Cadera (cm)</th><th style={{ padding: 6 }}>Foto</th></tr></thead>
                <tbody>
                  {d.meds.map(m => (
                    <tr key={m.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: 6 }}>{formatoFecha(m.fecha, { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                      <td style={{ padding: 6 }}>{m.peso_kg ?? '–'}</td>
                      <td style={{ padding: 6 }}>{m.cintura_cm ?? '–'}</td>
                      <td style={{ padding: 6 }}>{m.cadera_cm ?? '–'}</td>
                      <td style={{ padding: 6 }}>{m.foto_path && fotos[m.foto_path]
                        ? <a href={fotos[m.foto_path]} target="_blank" rel="noreferrer"><img src={fotos[m.foto_path]} alt={`Foto del ${formatoFecha(m.fecha)}`} style={{ width: 48, height: 64, objectFit: 'cover', borderRadius: 8 }} /></a>
                        : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Seccion>

        <section className="card" style={{ borderColor: '#7F1D1D' }}>
          <h2 className="card__name" style={{ fontSize: 15 }}>Eliminar alumna</h2>
          <div className="muted" style={{ fontSize: 14 }}>Borra su cuenta y todo lo que cargó. No se puede deshacer. Si solo querés que no entre por un tiempo, usá el botón <b>Inactiva</b> de arriba.</div>
          <button className="btn btn--ghost btn--sm" onClick={eliminarAlumna} disabled={borrando} style={{ color: '#FCA5A5', borderColor: '#7F1D1D' }}>
            <Trash2 size={16} aria-hidden="true" />{borrando ? 'Eliminando…' : `Eliminar a ${p?.nombre || 'la alumna'}`}
          </button>
        </section>
      </div>
    </>
  )
}
