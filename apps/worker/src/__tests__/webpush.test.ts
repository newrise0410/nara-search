import { describe, expect, it } from 'vitest'
import { encryptWebPushPayload, sendWebPush, vapidAuthorization, vapidJwt, VAPID_TTL_SECONDS, webPushPayload } from '../notify/webpush'
import type { AlertMessage } from '../notify/types'

const serverPrivateKey = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
const serverPublicKey = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
const receiverPublicKey = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
const auth = 'BTBZMqHH6r4Tts7J_aSIgg'
const salt = 'DGv6ra1nlYgDCS1FRnbzlw'
const expected = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'

const message: AlertMessage = {
  title: '[나라장터] 테스트', summary: '새 공고 1건', text: '본문', html: '<p>본문</p>',
  url: 'https://nara.example/results', total: 1, items: [],
}

const decodeJson = (value: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>

describe('웹푸시 암호화', () => {
  it('RFC 8291 테스트 벡터를 바이트 단위로 재현한다', () => {
    const result = encryptWebPushPayload(
      Buffer.from('When I grow up, I want to be a watermelon'),
      receiverPublicKey,
      auth,
      { salt: Buffer.from(salt, 'base64url'), serverPrivateKey: Buffer.from(serverPrivateKey, 'base64url') },
    )
    expect(Buffer.from(result).toString('base64url')).toBe(expected)
  })

  it('VAPID JWT가 3파트이고 헤더가 ES256이다', () => {
    const jwt = vapidJwt('https://push.example', 'mailto:test@example.com', serverPrivateKey, () => 1_700_000_000_000)
    const [header, , signature] = jwt.split('.')
    expect(jwt.split('.')).toHaveLength(3)
    expect(decodeJson(header)).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(Buffer.from(signature, 'base64url')).toHaveLength(64)
  })

  it('VAPID JWT의 aud는 엔드포인트 origin이고 exp는 12시간 뒤다', () => {
    const now = 1_700_000_000_000
    const jwt = vapidJwt('https://push.example', 'mailto:test@example.com', serverPrivateKey, () => now)
    const [, payload] = jwt.split('.')
    expect(decodeJson(payload)).toMatchObject({ aud: 'https://push.example', exp: now / 1000 + VAPID_TTL_SECONDS })
  })

  it('웹푸시 페이로드를 전체 바이트 기준으로 상한 안에 맞춘다', () => {
    const longMessage = { ...message, url: `https://x/${'a'.repeat(5000)}`, summary: '가'.repeat(4000) }
    const payload = webPushPayload(longMessage, 'https://nara.example')
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(3000)
    expect(JSON.parse(payload).title).toBe(message.title)
    expect(JSON.parse(payload).url).toBe('https://nara.example/results')
  })

  it('vapidAuthorization이 vapid t=..., k=... 형식이다', () => {
    const authorization = vapidAuthorization('https://push.example/send/1', {
      appUrl: 'https://nara.example', vapidPublicKey: serverPublicKey,
      vapidPrivateKey: serverPrivateKey, vapidSubject: 'mailto:test@example.com',
    }, () => 1_700_000_000_000)
    expect(authorization.startsWith('vapid t=')).toBe(true)
    expect(authorization.endsWith(`, k=${serverPublicKey}`)).toBe(true)
  })

  it('sendWebPush는 410 응답을 gone으로 표시한다', async () => {
    let status = 410
    const env = {
      appUrl: 'https://nara.example', vapidPublicKey: serverPublicKey,
      vapidPrivateKey: serverPrivateKey, vapidSubject: 'mailto:test@example.com',
      fetchImpl: async () => new Response('', { status }),
    }
    const config = { endpoint: 'https://push.example/send/1', keys: { p256dh: receiverPublicKey, auth } }
    expect(await sendWebPush(config, message, env)).toMatchObject({ ok: false, gone: true })
    status = 201
    expect(await sendWebPush(config, message, env)).toEqual({ ok: true })
  })
})
