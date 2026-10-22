import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Copy, Dumbbell, TrendingUp, Library, KeyRound, LogOut, Plus, RefreshCw, Utensils, X } from 'lucide-react'
import { supabase } from '../../supabase'
import { useAuth } from '../../auth'
import { Cargando, Header } from '../../components/ui'
import { DOMINIO, copiar, generarClave, mensajeAcceso, sugerirUsuario } from '../../lib/claves'
import { estadoVencimiento } from '../../lib/fechas'
import { tieneAcceso } from '../../lib/acceso'
import BotonActiva from '../../components/BotonActiva'

const DIAS_ALERTA = 3
const DIA_MS = 86400000

function estadoActividad(ultima) {
  if (!ultima) return { texto: 'Todavía no empezó', nivel: 'nueva', dias: null }
  const dias = Math.floor((Date.now() - new Date(ultima).getTime()) / DIA_MS)
  if (dias <= 0) return { texto: 'Activa hoy', nivel: 'ok', dias }
  if (dias < DIAS_ALERTA) return { texto: `Activa hace ${dias} día${dias > 1 ? 's' : ''}`, nivel: 'ok', dias }
  return { texto: `${dias} días sin actividad`, nivel: 'alerta', dias }
}

const PILL = {
  ok:     { background: 'var(--violet-bg)', color: 'var(--violet-soft)', border: '1px solid var(--violet-line)' },
  nueva:  { background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--line-2)' },
  alerta: { background: '#2A1210', color: '#FCA5A5', border: '1px solid #7F1D1D' },
}

/** Mensaje listo para mandar por WhatsApp, con botón de copiar */
function MensajeAcceso({ texto, onCerrar }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="card card--violet">
      <div className="between"><span className="kicker">Listo · mensaje para la alumna</span>
        <button className="icon-btn" aria-label="Cerrar" onClick={onCerrar} style={{ background: 'transparent' }}><X size={16} aria-hidden="true" /></button>
      </div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', font: 'inherit', fontSize: 14, lineHeight: 1.5, userSelect: 'all' }}>{texto}</pre>
      <button className="btn btn--sm" onClick={async () => setCopiado(await copiar(texto))}>
        <Copy size={16} aria-hidden="true" />{copiado ? 'Copiado' : 'Copiar mensaje'}
      </button>
      {!copiado && <div className="faint">Si no copia, mantené apretado el texto y elegí Copiar.</div>}
    </div>
  )
}

function NuevaAlumna({ onCreada }) {
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [tocadoUsuario, setTocadoUsuario] = useState(false)
  const [clave, setClave] = useState(generarClave())
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function crear(e) {
    e.preventDefault()
    setError(''); setEnviando(true)
    const email = usuario.trim().toLowerCase() + DOMINIO
    const { error } = await supabase.rpc('admin_crear_alumna', { p_email: email, p_clave: clave, p_nombre: nombre.trim() })
    setEnviando(false)
    if (error) return setError(error.message.includes('ya existe') ? 'Ese usuario ya existe. Probá con otro.' : error.message)
    onCreada(mensajeAcceso(nombre.trim(), email, clave))
  }

  return (
    <form className="card" onSubmit={crear}>
      <h2 className="card__title">Nueva alumna</h2>
      <div className="field">
        <label htmlFor="na-nombre">Nombre</label>
        <input id="na-nombre" className="input" required value={nombre} placeholder="Ej: Valentina López"
               onChange={e => { setNombre(e.target.value); if (!tocadoUsuario) setUsuario(sugerirUsuario(e.target.value)) }} />
      </div>
      <div className="field">
        <label htmlFor="na-usuario">Usuario</label>
        <div className="row" style={{ gap: 0 }}>
          <input id="na-usuario" className="input" required value={usuario} autoCapitalize="none" spellCheck={false}
                 style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                 onChange={e => { setTocadoUsuario(true); setUsuario(e.target.value.replace(/\s|@.*/g, '').toLowerCase()) }} />
          <span style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 12px', border: '1px solid var(--line-2)', borderLeft: 'none',
                         borderRadius: '0 12px 12px 0', background: 'var(--field)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{DOMINIO}</span>
        </div>
        <span className="faint">La alumna puede entrar escribiendo solo <b>{usuario || 'usuario'}</b>.</span>
      </div>
      <div className="field">
        <label htmlFor="na-clave">Contraseña</label>
        <div className="row">
          <input id="na-clave" className="input" required minLength={6} value={clave} onChange={e => setClave(e.target.value)} />
          <button type="button" className="icon-btn" aria-label="Generar otra contraseña" onClick={() => setClave(generarClave())}>
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn" type="submit" disabled={enviando}>{enviando ? 'Creando…' : 'Crear alumna'}</button>
    </form>
  )
}

function CambiarClave({ alumna, onListo }) {
  const [clave, setClave] = useState(generarClave())
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function guardar() {
    setError(''); setEnviando(true)
    const { error } = await supabase.rpc('admin_cambiar_clave', { p_alumna: alumna.id, p_clave: clave })
    setEnviando(false)
    if (error) return setError(error.message)
    onListo(mensajeAcceso(alumna.nombre, alumna.email, clave))
  }

  return (
    <div className="stack" style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
      <label htmlFor={`clave-${alumna.id}`} className="muted">Contraseña nueva</label>
      <div className="row">
        <input id={`clave-${alumna.id}`} className="input input--sm" value={clave} onChange={e => setClave(e.target.value)} />
        <button type="button" className="icon-btn" aria-label="Generar otra contraseña" onClick={() => setClave(generarClave())}>
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn btn--sm" onClick={guardar} disabled={enviando || clave.length < 6}>{enviando ? 'Guardando…' : 'Guardar contraseña'}</button>
    </div>
  )
}

export default function AdminHome() {
  const { salir } = useAuth()
  const [alumnas, setAlumnas] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [creando, setCreando] = useState(false)
  const [mensaje, setMensaje] = useState(null)       // { para, texto }
  const [claveAbierta, setClaveAbierta] = useState(null)

  const cargar = useCallback(async () => {
    const [{ data: perfiles }, { data: act }] = await Promise.all([
      supabase.from('perfiles').select('*').eq('rol', 'alumna').order('nombre'),
      supabase.rpc('actividad_alumnas'),
    ])
    const ultima = Object.fromEntries((act || []).map(a => [a.alumna_id, a.ultima]))
    const lista = (perfiles || []).map(p => ({ ...p, estado: estadoActividad(ultima[p.id]), plan: estadoVencimiento(p.vence) }))
    // Primero las que necesitan atención, después el resto por nombre; las inactivas, al final
    const enAlerta = x => tieneAcceso(x) && x.estado.nivel === 'alerta'
    lista.sort((a, b) => {
      if (tieneAcceso(a) !== tieneAcceso(b)) return tieneAcceso(a) ? -1 : 1
      if (enAlerta(a) !== enAlerta(b)) return enAlerta(a) ? -1 : 1
      if (enAlerta(a)) return b.estado.dias - a.estado.dias      // la que lleva más días, primero
      return a.nombre.localeCompare(b.nombre)
    })
    setAlumnas(lista)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  if (!alumnas) return <Cargando />
  const lista = alumnas.filter(a => (a.nombre + ' ' + (a.email || '')).toLowerCase().includes(filtro.toLowerCase()))
  const enAlerta = alumnas.filter(a => tieneAcceso(a) && a.estado.nivel === 'alerta')
  const activas = alumnas.filter(tieneAcceso).length
  const cambiarActiva = (id, valor) => setAlumnas(l => l.map(x => (x.id === id ? { ...x, activa: valor } : x)))

  return (
    <>
      <Header kicker={<span className="badge">ADMIN</span>} title="Mis alumnas" sub={`${activas} activa${activas === 1 ? '' : 's'} · ${alumnas.length - activas} inactiva${alumnas.length - activas === 1 ? '' : 's'}`}
              right={<button className="icon-btn" onClick={salir} aria-label="Cerrar sesión"><LogOut size={18} aria-hidden="true" /></button>}>
        <div className="row">
          <label htmlFor="buscar" style={{ position: 'absolute', left: -9999 }}>Buscar alumna</label>
          <input id="buscar" className="input" placeholder="Buscar por nombre o usuario" value={filtro} onChange={e => setFiltro(e.target.value)} />
          <button className="btn btn--sm" style={{ height: 48, flexShrink: 0 }} onClick={() => { setCreando(c => !c); setMensaje(null) }}>
            {creando ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{creando ? 'Cerrar' : 'Nueva alumna'}
          </button>
        </div>
        <Link className="btn btn--ghost btn--sm" to="/admin/ejercicios" style={{ textDecoration: 'none' }}>
          <Library size={16} aria-hidden="true" />Catálogo de ejercicios
        </Link>
      </Header>

      <div className="body" style={{ paddingBottom: 40 }}>
        {creando && !mensaje && (
          <NuevaAlumna onCreada={texto => { setMensaje({ para: 'nueva', texto }); cargar() }} />
        )}
        {mensaje?.para === 'nueva' && <MensajeAcceso texto={mensaje.texto} onCerrar={() => { setMensaje(null); setCreando(false) }} />}

        {enAlerta.length > 0 && (
          <div className="card" style={{ ...PILL.alerta, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 14 }}>
              {enAlerta.length === 1 ? `${enAlerta[0].nombre} lleva` : `${enAlerta.length} alumnas llevan`} {DIAS_ALERTA} días o más sin actividad. Puede ser un buen momento para escribirle{enAlerta.length > 1 ? 's' : ''}.
            </span>
          </div>
        )}

        {alumnas.length === 0 && !creando && (
          <div className="notice">Todavía no hay alumnas. Tocá <b>Nueva alumna</b> para crear la primera.</div>
        )}

        {lista.map(a => (
          <section key={a.id} className="card" style={tieneAcceso(a) ? undefined : { opacity: 0.7 }}>
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h2 className="card__name"><Link to={`/admin/alumna/${a.id}`} style={{ color: 'var(--text)' }}>{a.nombre}</Link></h2>
                <div className="muted">Usuario: {(a.email || '').replace(DOMINIO, '')}</div>
                {a.plan && a.plan.nivel !== 'ok' && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#FCA5A5', marginTop: 2 }}>{a.plan.texto}</div>
                )}
              </div>
              <BotonActiva alumna={a} onCambio={v => cambiarActiva(a.id, v)} />
            </div>
            {tieneAcceso(a) && (
              <span style={{ ...PILL[a.estado.nivel], alignSelf: 'flex-start', fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>
                {a.estado.nivel === 'alerta' && '⚠ '}{a.estado.texto}
              </span>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <Link className="btn btn--ghost btn--sm" to={`/admin/alumna/${a.id}/rutina`} style={{ textDecoration: 'none' }}>
                <Dumbbell size={16} aria-hidden="true" />Rutina
              </Link>
              <Link className="btn btn--ghost btn--sm" to={`/admin/alumna/${a.id}/comidas`} style={{ textDecoration: 'none' }}>
                <Utensils size={16} aria-hidden="true" />Comidas
              </Link>
              <Link className="btn btn--ghost btn--sm" to={`/admin/alumna/${a.id}/progreso`} style={{ textDecoration: 'none' }}>
                <TrendingUp size={16} aria-hidden="true" />Progreso
              </Link>
              <button className="btn btn--ghost btn--sm" aria-expanded={claveAbierta === a.id}
                      onClick={() => { setClaveAbierta(claveAbierta === a.id ? null : a.id); setMensaje(null) }}>
                <KeyRound size={16} aria-hidden="true" />Acceso
              </button>
            </div>
            {claveAbierta === a.id && mensaje?.para !== a.id && (
              <CambiarClave alumna={a} onListo={texto => setMensaje({ para: a.id, texto })} />
            )}
            {mensaje?.para === a.id && <MensajeAcceso texto={mensaje.texto} onCerrar={() => { setMensaje(null); setClaveAbierta(null) }} />}
          </section>
        ))}

        <div className="faint" style={{ lineHeight: 1.5 }}>
          Tocá el nombre de una alumna para ver su ficha completa, mandarle un mensaje o cargar la fecha de vencimiento de su plan.
          Una alumna aparece en alerta cuando pasa {DIAS_ALERTA} días sin registrar nada (entreno, comidas, check-in o actividades).
        </div>
      </div>
    </>
  )
}
