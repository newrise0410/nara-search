/** base64url VAPID 공개키를 PushManager가 받는 바이트 배열로 바꾼다. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const value = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = globalThis.atob(value)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export function webPushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && 'PushManager' in window
}

export async function subscribeWebPush(vapidPublicKey: string): Promise<{ endpoint: string; keys: { p256dh: string; auth: string }; userAgent: string }> {
  if (!webPushSupported()) throw new Error('이 브라우저는 웹푸시를 지원하지 않습니다.')
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('브라우저에서 알림 권한이 거부되었습니다.')
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource })
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('웹푸시 구독 정보가 올바르지 않습니다.')
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, userAgent: navigator.userAgent.slice(0, 100) }
}

export async function unsubscribeWebPush(): Promise<void> {
  if (!webPushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) await subscription.unsubscribe()
}
