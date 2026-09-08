/* 나라장터 알림 서비스워커 — push 이벤트를 시스템 알림으로 띄운다 */
self.addEventListener('install', (_event) => { self.skipWaiting() })
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch { payload = { title: '나라장터 알림', body: '' } }
  const title = payload.title || '나라장터 알림'
  const options = {
    body: payload.body || '',
    tag: payload.tag || 'nara-alert',
    data: { url: payload.url || '/results' },
    icon: '/favicon.svg',
    badge: '/favicon.svg',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/results'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) { if ('focus' in client) return client.focus() }
    return self.clients.openWindow(url)
  }))
})
