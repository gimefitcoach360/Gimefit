import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronLeft, Download, Pencil, PlayCircle, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../supabase'
import { Cargando, Header } from '../../components/ui'

const vacio = { nombre: '', grupo: '', video_url: '' }

/**
 * Catálogo de ejercicios: Gime carga cada ejercicio con su video UNA vez.
 * Después, al armar rutinas, el nombre se autocompleta y el video se agrega solo.
 */
export default function AdminEjercicios() {
  const [lista, setLista] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [nuevo, setNuevo] = useState(vacio)
  const [editId, setEditId] = useState(null)
  const [edit, setEdit] = useState(vacio)
  const [propagar, setPropagar] = useState(true)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('ejercicios_catalogo').select('*').order('nombre')
    if (error) setError('No se pudo leer el catálogo. ¿Corriste el archivo 06 en Supabase?')
    setLista(data || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const limpiar = f => ({ nombre: f.nombre.trim(), grupo: f.grupo.trim() || null, video_url: f.video_url.trim() || null })
  const avisar = (m, e = '') => { setMsg(m); setError(e) }

  async function agregar(e) {
    e.preventDefault()
    const fila = limpiar(nuevo)
    if (!fila.nombre) return avisar('', 'Escribí el nombre del ejercicio.')
    const { error } = await supabase.from('ejercicios_catalogo').insert(fila)
    if (error) return avisar('', error.code === '23505' ? `"${fila.nombre}" ya está en el catálogo.` : 'No se pudo guardar.')
    setNuevo(vacio); avisar(`"${fila.nombre}" agregado.`); cargar()
  }

  async function guardarEdicion(original) {
    const fila = limpiar(edit)
    if (!fila.nombre) return avisar('', 'El nombre no puede quedar vacío.')
    setOcupado(true)
    const { error } = await supabase.from('ejercicios_catalogo').update(fila).eq('id', original.id)
    if (error) { setOcupado(false); return avisar('', error.code === '23505' ? `Ya hay otro ejercicio llamado "${fila.nombre}".` : 'No se pudo guardar.') }
    let extra = ''
    if (propagar && fila.video_url !== original.video_url) {
      // Actualiza el video en todas las rutinas cargadas con ese ejercicio
      const { data } = await supabase.from('rutina_ejercicios').update({ video_url: fila.video_url })
        .ilike('nombre', original.nombre.replace(/[\\%_]/g, m => '\\' + m)).select('id')
      extra = data?.length ? ` También se actualizó el video en ${data.length} ejercicio(s) de rutinas ya cargadas.` : ''
    }
    setOcupado(false); setEditId(null); avisar(`"${fila.nombre}" guardado.${extra}`); cargar()
  }

  async function borrar(x) {
    if (!window.confirm(`¿Sacar "${x.nombre}" del catálogo? Las rutinas ya cargadas no cambian.`)) return
    const { error } = await supabase.from('ejercicios_catalogo').delete().eq('id', x.id)
    if (error) return avisar('', 'No se pudo borrar.')
    avisar(`"${x.nombre}" borrado del catálogo.`); cargar()
  }

  // Trae al catálogo todos los ejercicios de las rutinas que ya cargaste
  async function importar() {
    setOcupado(true); avisar('')
    const { data, error } = await supabase.from('rutina_ejercicios').select('nombre, video_url').order('nombre')
    if (error) { setOcupado(false); return avisar('', 'No se pudieron leer las rutinas.') }
    const yaEsta = new Set(lista.map(x => x.nombre.toLowerCase()))
    const nuevos = new Map()
    for (const r of data || []) {
      const k = r.nombre.trim().toLowerCase()
      if (!k || yaEsta.has(k)) continue
      const previo = nuevos.get(k)
      if (!previo || (!previo.video_url && r.video_url)) nuevos.set(k, { nombre: r.nombre.trim(), video_url: r.video_url || null })
    }
    if (nuevos.size) {
      const { error: e2 } = await supabase.from('ejercicios_catalogo').insert([...nuevos.values()])
      if (e2) { setOcupado(false); return avisar('', 'No se pudieron importar.') }
    }
    setOcupado(false)
    avisar(nuevos.size ? `Se agregaron ${nuevos.size} ejercicio(s) desde tus rutinas.` : 'Todos los ejercicios de tus rutinas ya estaban en el catálogo.')
    cargar()
  }

  if (!lista) return <Cargando />
  const q = filtro.trim().toLowerCase()
  const vistos = lista.filter(x => !q || (x.nombre + ' ' + (x.grupo || '')).toLowerCase().includes(q))
  const sinVideo = lista.filter(x => !x.video_url).length
  const grupos = [...new Set(lista.map(x => x.grupo).filter(Boolean))].sort()

  return (
    <>
      <Header kicker={<Link to="/admin" className="row" style={{ textDecoration: 'none', color: 'var(--muted)' }}><ChevronLeft size={18} aria-hidden="true" />Alumnas</Link>}
              title="Ejercicios" sub={`${lista.length} en el catálogo${sinVideo ? ` · ${sinVideo} sin video` : ''}`}>
        <label htmlFor="buscar-ej" style={{ position: 'absolute', left: -9999 }}>Buscar ejercicio</label>
        <input id="buscar-ej" className="input" placeholder="Buscar por nombre o grupo" value={filtro} onChange={e => setFiltro(e.target.value)} />
      </Header>

      <div className="body" style={{ paddingBottom: 40 }}>
        <div className="muted">Cargá cada ejercicio con su video una sola vez. Cuando armes una rutina, empezá a escribir el nombre y el video se agrega solo.</div>

        <form className="card" style={{ padding: 14, gap: 10 }} onSubmit={agregar}>
          <h2 className="card__title" style={{ fontSize: 20 }}>Nuevo ejercicio</h2>
          <input className="input input--sm" placeholder="Nombre (ej: Sentadilla búlgara)" aria-label="Nombre del ejercicio"
                 value={nuevo.nombre} onChange={e => setNuevo(f => ({ ...f, nombre: e.target.value }))} />
          <input className="input input--sm" placeholder="Grupo (opcional, ej: Piernas)" aria-label="Grupo muscular" list="grupos-ej"
                 value={nuevo.grupo} onChange={e => setNuevo(f => ({ ...f, grupo: e.target.value }))} />
          <input className="input input--sm" type="url" placeholder="Link al video (YouTube, Drive, Instagram…)" aria-label="Link al video"
                 value={nuevo.video_url} onChange={e => setNuevo(f => ({ ...f, video_url: e.target.value }))} />
          <button className="btn btn--sm" type="submit"><Plus size={16} aria-hidden="true" />Agregar al catálogo</button>
        </form>
        <datalist id="grupos-ej">{grupos.map(g => <option key={g} value={g} />)}</datalist>

        <button className="btn btn--ghost btn--sm" onClick={importar} disabled={ocupado}>
          <Download size={16} aria-hidden="true" />Traer los ejercicios de las rutinas que ya cargué
        </button>

        {error && <div className="error" role="alert">{error}</div>}
        {msg && <div className="notice" role="status">{msg}</div>}

        {!vistos.length && <div className="muted">{lista.length ? 'Ningún ejercicio coincide con la búsqueda.' : 'Todavía no hay ejercicios en el catálogo.'}</div>}

        {vistos.map(x => editId === x.id ? (
          <div key={x.id} className="card" style={{ padding: 12, gap: 8 }}>
            <input className="input input--sm" aria-label="Nombre" value={edit.nombre} onChange={e => setEdit(f => ({ ...f, nombre: e.target.value }))} />
            <input className="input input--sm" aria-label="Grupo" placeholder="Grupo (opcional)" list="grupos-ej" value={edit.grupo} onChange={e => setEdit(f => ({ ...f, grupo: e.target.value }))} />
            <input className="input input--sm" type="url" aria-label="Link al video" placeholder="https://…" value={edit.video_url} onChange={e => setEdit(f => ({ ...f, video_url: e.target.value }))} />
            {edit.video_url.trim() !== (x.video_url || '') && (
              <label className="row" style={{ gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={propagar} onChange={e => setPropagar(e.target.checked)} />
                Cambiar el video también en las rutinas ya cargadas
              </label>
            )}
            <div className="grid2" style={{ gap: 8 }}>
              <button className="btn btn--ghost btn--sm" onClick={() => setEditId(null)}><X size={16} aria-hidden="true" />Cancelar</button>
              <button className="btn btn--sm" onClick={() => guardarEdicion(x)} disabled={ocupado}><Check size={16} aria-hidden="true" />Guardar</button>
            </div>
          </div>
        ) : (
          <div key={x.id} className="card" style={{ padding: '10px 12px', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{x.nombre}</div>
              <div className="faint" style={{ fontSize: 13 }}>{[x.grupo, x.video_url ? 'con video' : 'sin video'].filter(Boolean).join(' · ')}</div>
            </div>
            {x.video_url && (
              <a className="icon-btn" href={x.video_url} target="_blank" rel="noreferrer" aria-label={`Ver video de ${x.nombre}`} style={{ color: 'var(--violet-soft)' }}>
                <PlayCircle size={18} aria-hidden="true" />
              </a>
            )}
            <button className="icon-btn" aria-label={`Editar ${x.nombre}`} style={{ background: 'transparent' }}
                    onClick={() => { setEditId(x.id); setEdit({ nombre: x.nombre, grupo: x.grupo || '', video_url: x.video_url || '' }); setPropagar(true) }}>
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button className="icon-btn" aria-label={`Borrar ${x.nombre}`} style={{ background: 'transparent' }} onClick={() => borrar(x)}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
