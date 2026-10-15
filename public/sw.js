// GIMEFIT · Service worker
// 1) Guarda la app en el celu para que abra sin señal.
// 2) Guarda la última copia de los datos leídos (rutina, series) para verlos sin señal.
// 3) Muestra los recordatorios y mensajes de Gime como notificación.
const APP = 'gimefit-app-v1'
const DATOS = 'gimefit-datos-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![APP, DATOS].includes(k)) await caches.delete(k)
    await self.clients.claim()
  })())
})

async function redPrimero(req, cache, fallback) {
  try {
    const r = await fetch(req)
    if (r.ok) (await caches.open(cache)).put(fallback || req, r.clone())
    return r
  } catch (err) {
    const guardada = await caches.match(fallback || req)
    if (guardada) return guardada
    throw err
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Páginas de la app: red primero; sin señal, la última versión guardada
  if (req.mode === 'navigate') return e.respondWith(redPrimero(req, APP, '/'))

  if (url.origin === self.location.origin) {
    // Archivos con huella (/assets/…): nunca cambian, se sirven guardados
    if (url.pathname.startsWith('/assets/')) {
      return e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(APP).then(c => c.put(req, copia)) }
        return res
      })))
    }
    return e.respondWith(redPrimero(req, APP))
  }

  // Datos de Supabase (solo lecturas): red primero, copia guardada sin señal
  if (url.pathname.startsWith('/rest/v1/')) return e.respondWith(redPrimero(req, DATOS))

  // Tipografías de Google
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    return e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copia = res.clone(); caches.open(APP).then(c => c.put(req, copia)); return res
    })))
  }
})

// ---------- Notificaciones ----------
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'Gimefit', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'gimefit',
    data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const destino = new URL(e.notification.data?.url || '/', self.location.origin).href
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of abiertas) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) return c.navigate(destino); return }
    }
    return self.clients.openWindow(destino)
  })())
})
