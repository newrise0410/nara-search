import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
} from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import type { AlertMessage, SendResult } from './types'
import type { NotifyEnv } from './env'

/** aes128gcm 레코드 크기. RFC 8188 헤더에 들어간다. */
export const WEBPUSH_RECORD_SIZE = 4096
/** 페이로드(JSON 직렬화 후) 전체 바이트 상한. 초과하면 url → body → title 순으로 줄인다. */
export const WEBPUSH_MAX_PAYLOAD = 3000
/** VAPID JWT 유효기간(초). */
export const VAPID_TTL_SECONDS = 43_200

export interface WebPushConfig {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

const hmac = (key: Uint8Array, data: Uint8Array): Buffer =>
  createHmac('sha256', Buffer.from(key)).update(data).digest()

const hkdf = (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Buffer =>
  hmac(hmac(salt, ikm), Buffer.concat([Buffer.from(info), Buffer.from([1])])).subarray(0, length)

/** raw base64url d(32바이트) → 서명용 KeyObject */
export function privateKeyFromRaw(d: string): KeyObject {
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(Buffer.from(d, 'base64url'))
  const point = ecdh.getPublicKey()
  return createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      d,
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33, 65).toString('base64url'),
    },
  })
}

/** ES256 VAPID JWT. */
export function vapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64Url: string,
  now?: () => number,
): string {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url')
  const timestamp = Math.floor((now?.() ?? Date.now()) / 1000)
  const payload = Buffer.from(JSON.stringify({
    aud: audience,
    exp: timestamp + VAPID_TTL_SECONDS,
    sub: subject,
  })).toString('base64url')
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: privateKeyFromRaw(privateKeyBase64Url),
    dsaEncoding: 'ieee-p1363',
  })
  return `${header}.${payload}.${signature.toString('base64url')}`
}

/** 'vapid t=<jwt>, k=<vapidPublicKey>' */
export function vapidAuthorization(endpoint: string, env: NotifyEnv, now?: () => number): string {
  const publicKey = env.vapidPublicKey ?? ''
  const privateKey = env.vapidPrivateKey ?? ''
  const subject = env.vapidSubject ?? ''
  const jwt = vapidJwt(new URL(endpoint).origin, subject, privateKey, now)
  return `vapid t=${jwt}, k=${publicKey}`
}

/** RFC 8291 aes128gcm 본문 한 덩어리 (헤더 포함). */
export function encryptWebPushPayload(
  plaintext: Uint8Array,
  p256dh: string,
  auth: string,
  opts?: { salt?: Uint8Array; serverPrivateKey?: Uint8Array },
): Uint8Array {
  const salt = opts?.salt ? Buffer.from(opts.salt) : randomBytes(16)
  const ecdh = createECDH('prime256v1')
  const asPublic = opts?.serverPrivateKey
    ? (ecdh.setPrivateKey(Buffer.from(opts.serverPrivateKey)), ecdh.getPublicKey())
    : ecdh.generateKeys()
  const uaPublic = Buffer.from(p256dh, 'base64url')
  const authSecret = Buffer.from(auth, 'base64url')
  const shared = ecdh.computeSecret(uaPublic)

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic])
  const ikm = hkdf(authSecret, shared, keyInfo, 32)
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16)
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12)

  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const record = Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])
  const body = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21 + asPublic.length)
  salt.copy(header, 0)
  header.writeUInt32BE(WEBPUSH_RECORD_SIZE, 16)
  header.writeUInt8(asPublic.length, 20)
  asPublic.copy(header, 21)
  return Buffer.concat([header, body])
}

/** 서비스워커가 받는 JSON 문자열. 반환값의 UTF-8 바이트 길이는 WEBPUSH_MAX_PAYLOAD 이하다. */
export function webPushPayload(message: AlertMessage, appUrl: string): string {
  let url = message.url
  let title = message.title
  let body = message.summary
  const build = () => JSON.stringify({ title, body, url, tag: 'nara-alert' })
  const size = () => Buffer.byteLength(build(), 'utf8')
  const fallbackUrl = `${appUrl.replace(/\/+$/, '')}/results`
  if (size() > WEBPUSH_MAX_PAYLOAD && fallbackUrl.length < url.length) url = fallbackUrl
  while (size() > WEBPUSH_MAX_PAYLOAD && body.length > 0) {
    body = body.slice(0, Math.max(0, body.length - Math.max(1, Math.ceil((size() - WEBPUSH_MAX_PAYLOAD) / 3))))
  }
  while (size() > WEBPUSH_MAX_PAYLOAD && title.length > 0) {
    title = title.slice(0, Math.max(0, title.length - Math.max(1, Math.ceil((size() - WEBPUSH_MAX_PAYLOAD) / 3))))
  }
  return build()
}

const responseText = async (response: Response): Promise<string> => (await response.text()).slice(0, 300)

export async function sendWebPush(config: WebPushConfig, message: AlertMessage, env: NotifyEnv): Promise<SendResult> {
  if (!env.vapidSubject) return { ok: false, error: 'VAPID_SUBJECT가 설정되지 않았습니다.' }
  if (!env.vapidPublicKey) return { ok: false, error: 'VAPID_PUBLIC_KEY가 설정되지 않았습니다.' }
  if (!env.vapidPrivateKey) return { ok: false, error: 'VAPID_PRIVATE_KEY가 설정되지 않았습니다.' }

  try {
    const payload = webPushPayload(message, env.appUrl)
    const body = encryptWebPushPayload(Buffer.from(payload), config.keys.p256dh, config.keys.auth)
    const response = await (env.fetchImpl ?? globalThis.fetch)(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthorization(config.endpoint, env),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
      },
      body: body as unknown as string,
    })
    if (response.status === 200 || response.status === 201 || response.status === 202) return { ok: true }
    if (response.status === 404 || response.status === 410) {
      return { ok: false, gone: true, error: '푸시 구독이 만료되었습니다.' }
    }
    return { ok: false, error: `웹푸시 발송 실패(${response.status}): ${await responseText(response)}` }
  } catch (error) {
    return { ok: false, error: `웹푸시 발송 실패: ${error instanceof Error ? error.message : String(error)}` }
  }
}
