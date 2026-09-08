import { describe, expect, it } from 'vitest'
import { ADMIN_MESSAGE_MAX, notifyAdmin, redactSecrets } from '../ops/notify-admin'

describe('관리자 웹훅 알림', () => {
  it('URL 미설정이면 fetch를 호출하지 않고 false를 반환한다', async () => {
    let calls = 0
    const sent = await notifyAdmin('제목', '본문', { url: '', fetchImpl: async () => { calls++; return new Response() } })
    expect(sent).toBe(false)
    expect(calls).toBe(0)
  })

  it('https://hooks.slack.com/...이면 본문이 Slack 형식이다', async () => {
    let captured: Record<string, unknown> = {}
    const sent = await notifyAdmin('제목', '본문', {
      url: 'https://hooks.slack.com/services/test',
      fetchImpl: async (_url, init) => { captured = JSON.parse(String(init?.body)) as Record<string, unknown>; return new Response('', { status: 200 }) },
    })
    expect(sent).toBe(true)
    expect(captured).toEqual({ text: '*제목*\n본문' })
  })

  it('https://discord.com/api/webhooks/...이면 content 필드를 보낸다', async () => {
    let captured: Record<string, unknown> = {}
    const sent = await notifyAdmin('제목', '본문', {
      url: 'https://discord.com/api/webhooks/test',
      fetchImpl: async (_url, init) => { captured = JSON.parse(String(init?.body)) as Record<string, unknown>; return new Response('', { status: 200 }) },
    })
    expect(sent).toBe(true)
    expect(captured).toEqual({ content: '**제목**\n본문' })
  })

  it('응답이 500이어도 throw하지 않고 false를 반환한다', async () => {
    const sent = await notifyAdmin('제목', '본문', {
      url: 'https://example.com/hook',
      fetchImpl: async () => new Response('server error', { status: 500 }),
    })
    expect(sent).toBe(false)
  })

  it('redactSecrets가 접속 문자열 비밀번호와 서비스 키를 가린다', () => {
    expect(redactSecrets('postgres://u:pw@h/db serviceKey=abc')).toBe('postgres://u:***@h/db serviceKey=***')
  })

  it('본문이 ADMIN_MESSAGE_MAX를 넘으면 잘린다', async () => {
    let captured: Record<string, unknown> = {}
    const sent = await notifyAdmin('제목', 'x'.repeat(ADMIN_MESSAGE_MAX + 1), {
      url: 'https://example.com/hook',
      fetchImpl: async (_url, init) => { captured = JSON.parse(String(init?.body)) as Record<string, unknown>; return new Response('', { status: 200 }) },
    })
    expect(sent).toBe(true)
    expect(String(captured.text)).toHaveLength(ADMIN_MESSAGE_MAX)
  })
})
