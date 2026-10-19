// GIMEFIT · Función "recordatorios" (Supabase Edge Function)
// Manda las notificaciones al celular de cada alumna.
// La llama la base de datos: cada hora (recordatorios) y cuando Gime manda un mensaje.
// No hace falta cargar claves: las genera sola la primera vez y las guarda en config_privada.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})
const ZONA = 'America/Argentina/Buenos_Aires'
const CONTACTO = 'mailto:gime.nataliaa@gmail.com'

type Sub = { id: string; alumna_id: string; endpoint: string; p256dh: string; auth: string; hora: number; dias: number[] }
type Aviso = { title: string; body: string; url: string; tag?: string }

async function leer(clave: string) {
  const { data } = await db.from('config_privada').select('valor').eq('clave', clave).maybeSingle()
  return data?.valor as string | undefined
}

async function clavesVapid() {
  let pub = await leer('vapid_publica'), priv = await leer('vapid_privada')
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys()
    // Si dos llamadas llegan juntas, gana la primera (ignoreDuplicates) y la otra relee
    await db.from('config_privada').upsert(
      [{ clave: 'vapid_publica', valor: k.publicKey }, { clave: 'vapid_privada', valor: k.privateKey }],
      { onConflict: 'clave', ignoreDuplicates: true },
    )
    pub = await leer('vapid_publica'); priv = await leer('vapid_privada')
  }
  return { publicKey: pub!, privateKey: priv! }
}

async function enviar(subs: Sub[], aviso: Aviso, vapid: { publicKey: string; privateKey: string }) {
  let ok = 0
  for (const s of subs) {
    try {
      const d = webpush.generateRequestDetails(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(aviso),
        { vapidDetails: { subject: CONTACTO, ...vapid }, TTL: 6 * 3600 },
      )
      const headers = { ...d.headers } as Record<string, string>
      delete headers['Content-Length']
      const r = await fetch(d.endpoint, { method: 'POST', headers, body: d.body })
      if (r.status === 404 || r.status === 410) await db.from('push_suscripciones').delete().eq('id', s.id) // celu dado de baja
      else if (r.ok) ok++
      else console.log('push', r.status, await r.text())
    } catch (e) {
      console.log('push error', String(e))
    }
  }
  return ok
}

function ahoraAR() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA, hour: 'numeric', hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(x => [x.type, x.value]))
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>
  return { hora: Number(p.hour), dia: dias[p.weekday], fecha: `${p.year}-${p.month}-${p.day}` }
}

// Qué recordarle a una alumna hoy (o nada)
async function avisoDelDia(alumnaId: string, fecha: string): Promise<Aviso | null> {
  const { data: perfil } = await db.from('perfiles').select('*').eq('id', alumnaId).maybeSingle()
  if (!perfil || perfil.activa === false) return null
  if (perfil.vence && perfil.vence < fecha) return null            // plan vencido
  const secciones: string[] = perfil.secciones ?? ['entreno', 'nutricion', 'coaching']
  const nombre = (perfil.nombre || '').split(' ')[0]

  const desde = `${fecha}T00:00:00-03:00`
  const { count: hoyEntreno } = await db.from('dias_completados')
    .select('dia_id', { count: 'exact', head: true }).eq('alumna_id', alumnaId).gte('completado_at', desde)

  if (secciones.includes('entreno') && !hoyEntreno) {
    const [{ data: dias }, { data: hechos }] = await Promise.all([
      db.from('rutina_dias').select('id, dia_numero, nombre').eq('alumna_id', alumnaId)
        .order('fase').order('semana').order('dia_numero'),
      db.from('dias_completados').select('dia_id').eq('alumna_id', alumnaId),
    ])
    const hecho = new Set((hechos || []).map(h => h.dia_id))
    const sig = (dias || []).find(d => !hecho.has(d.id))
    if (sig) return {
      title: `Tu Día ${sig.dia_numero} te espera 💪`,
      body: `${nombre ? nombre + ', hoy' : 'Hoy'} toca ${sig.nombre}. Entrá y registrá tus series.`,
      url: '/entreno', tag: 'recordatorio',
    }
  }

  if (!secciones.includes('coaching')) return null
  const { count: checkin } = await db.from('checkins')
    .select('id', { count: 'exact', head: true }).eq('alumna_id', alumnaId).eq('fecha', fecha)
  if (!checkin) return {
    title: '¿Cómo te sentís hoy? 💜',
    body: 'Hacé tu check-in: te lleva 10 segundos.',
    url: '/coaching', tag: 'recordatorio',
  }
  return null
}

Deno.serve(async (req) => {
  const secreto = await leer('push_secreto')
  if (!secreto || req.headers.get('x-secreto') !== secreto) return new Response('No autorizado', { status: 401 })

  const vapid = await clavesVapid()
  const body = await req.json().catch(() => ({}))
  let enviados = 0

  if (body.tipo === 'mensaje' || body.tipo === 'prueba') {
    const { data: subs } = await db.from('push_suscripciones').select('*').eq('alumna_id', body.alumna_id)
    const aviso: Aviso = body.tipo === 'mensaje'
      ? { title: 'Mensaje de Gime 💜', body: String(body.texto || '').slice(0, 160), url: '/entreno', tag: 'mensaje' }
      : { title: '¡Listo! 🔔', body: 'Así te van a llegar los recordatorios de Gimefit.', url: '/progreso', tag: 'prueba' }
    enviados = await enviar((subs || []) as Sub[], aviso, vapid)
  }

  if (body.tipo === 'recordatorio') {
    const { hora, dia, fecha } = ahoraAR()
    const { data } = await db.from('push_suscripciones').select('*').eq('hora', hora)
    const subs = ((data || []) as Sub[]).filter(s => s.dias.includes(dia))
    const porAlumna = new Map<string, Sub[]>()
    for (const s of subs) porAlumna.set(s.alumna_id, [...(porAlumna.get(s.alumna_id) || []), s])
    for (const [alumnaId, lista] of porAlumna) {
      const aviso = await avisoDelDia(alumnaId, fecha)
      if (aviso) enviados += await enviar(lista, aviso, vapid)
    }
  }

  return new Response(JSON.stringify({ ok: true, enviados }), { headers: { 'Content-Type': 'application/json' } })
})
