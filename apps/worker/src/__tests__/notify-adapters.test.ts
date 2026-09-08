import { describe, expect, it } from 'vitest'
import { buildMessage } from '../alerts/message'
import { sendEmail, RESEND_URL } from '../notify/email'
import { KAKAO_SEND_URL, sendKakao } from '../notify/kakao'
import { isSealed, open, seal } from '../notify/secret'
import { webhookBody, webhookKindOf } from '../notify/webhook'
import type { AlertMessage } from '../notify/types'

const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const message: AlertMessage = buildMessage({ name: '시설 공고' }, [{
  id: 'notice-1', kind: 'notice', noticeNo: '1', title: '시설 관제', agency: '기관', amount: 12_000_000, date: '2026-08-15', url: 'https://nara.example/results',
}], { appUrl: 'https://nara.example' })

describe('알림 채널 어댑터', () => {
  it('seal과 open이 왕복한다', () => {
    const plain = 'refresh-token-secret'
    const sealed = seal(plain, key)
    expect(sealed).not.toContain(plain)
    expect(isSealed(sealed)).toBe(true)
    expect(open(sealed, key)).toBe(plain)
  })

  it('잘못된 키 길이는 오류를 낸다', () => {
    expect(() => seal('token', 'abc')).toThrow('ALERT_SECRET_KEY는 32바이트 hex(64자)여야 합니다.')
  })

  it('카카오 발송이 template_object를 form-urlencoded로 보낸다', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const result = await sendKakao({ refreshToken: 'refresh', accessToken: 'access', expiresAt: new Date(Date.now() + 60_000).toISOString() }, message, {
      appUrl: 'https://nara.example', kakaoRestApiKey: 'rest-key',
      fetchImpl: async (url, init) => { capturedUrl = String(url); capturedInit = init; return new Response('{"result_code":0}', { status: 200 }) },
    })
    const form = new URLSearchParams(String(capturedInit?.body))
    const template = JSON.parse(form.get('template_object') ?? '{}') as Record<string, unknown>
    expect(result).toEqual({ ok: true })
    expect(capturedUrl).toBe(KAKAO_SEND_URL)
    expect(capturedInit?.headers).toMatchObject({ Authorization: 'Bearer access', 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' })
    expect(template.object_type).toBe('text')
    expect((template.link as Record<string, unknown>).web_url).toBe(message.url)
    expect(String(template.text).length).toBeLessThanOrEqual(200)
  })

  it('카카오 access token이 만료되면 갱신 후 재시도하고 새 config를 돌려준다', async () => {
    const calls: string[] = []
    const result = await sendKakao({ refreshToken: 'old-refresh', accessToken: 'old-access', expiresAt: new Date(Date.now() + 60_000).toISOString() }, message, {
      appUrl: 'https://nara.example', kakaoRestApiKey: 'rest-key', kakaoRedirectUri: 'https://nara.example/callback',
      fetchImpl: async (url) => {
        calls.push(String(url))
        if (String(url) === KAKAO_SEND_URL && calls.filter((v) => v === KAKAO_SEND_URL).length === 1) return new Response('', { status: 401 })
        if (String(url).includes('oauth/token')) return new Response('{"access_token":"new-access","refresh_token":"new-refresh","expires_in":3600}', { status: 200 })
        return new Response('{"result_code":0}', { status: 200 })
      },
    })
    expect(result.ok).toBe(true)
    expect((result.config as { accessToken: string }).accessToken).toBe('new-access')
    expect(calls).toEqual([KAKAO_SEND_URL, 'https://kauth.kakao.com/oauth/token', KAKAO_SEND_URL])
  })

  it('카카오 invalid_grant는 gone으로 표시한다', async () => {
    const result = await sendKakao({ refreshToken: 'expired', expiresAt: new Date(0).toISOString() }, message, {
      appUrl: 'https://nara.example', kakaoRestApiKey: 'rest-key',
      fetchImpl: async () => new Response('{"error":"invalid_grant"}', { status: 400 }),
    })
    expect(result).toMatchObject({ ok: false, gone: true })
  })

  it('이메일은 Resend에 from·to·subject·html·text를 보낸다', async () => {
    let captured: Record<string, unknown> = {}
    let url = ''
    const result = await sendEmail({ address: 'me@example.com' }, message, {
      appUrl: 'https://nara.example', resendApiKey: 'resend-key', alertFromEmail: 'alerts@example.com',
      fetchImpl: async (requestUrl, init) => { url = String(requestUrl); captured = JSON.parse(String(init?.body)) as Record<string, unknown>; return new Response('', { status: 200 }) },
    })
    expect(result).toEqual({ ok: true })
    expect(url).toBe(RESEND_URL)
    expect(captured).toMatchObject({ from: 'alerts@example.com', to: ['me@example.com'], subject: message.title, html: message.html, text: message.text })
  })

  it('RESEND_API_KEY가 없으면 발송하지 않고 실패를 돌려준다', async () => {
    let calls = 0
    const result = await sendEmail({ address: 'me@example.com' }, message, {
      appUrl: 'https://nara.example', alertFromEmail: 'alerts@example.com', fetchImpl: async () => { calls++; return new Response() },
    })
    expect(calls).toBe(0)
    expect(result.error).toContain('RESEND_API_KEY')
  })

  it('webhookKindOf가 호스트로 slack·discord·generic을 구분한다', () => {
    expect(webhookKindOf('https://hooks.slack.com/services/x')).toBe('slack')
    expect(webhookKindOf('https://discord.com/api/webhooks/x')).toBe('discord')
    expect(webhookKindOf('https://example.com/hook')).toBe('generic')
  })

  it('웹훅 본문이 종류별로 다르다', () => {
    expect(webhookBody('slack', message)).toHaveProperty('text')
    const discord = webhookBody('discord', { ...message, text: 'x'.repeat(3_000) }) as { content: string }
    expect(discord).toHaveProperty('content')
    expect(discord.content.length).toBeLessThanOrEqual(1900)
    expect(webhookBody('generic', message)).toEqual({ title: message.title, text: message.text, url: message.url, total: message.total })
  })
})
