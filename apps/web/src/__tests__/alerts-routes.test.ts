import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeDb } from './helpers'
import type { DbHandle } from '@nara/db'
import { setAuthUserForTesting } from '@/server/auth'
import { setDbForTesting } from '@/server/db'
import { joinOrg, TEST_ORG_ID, TEST_USER, TEST_USER_B } from './helpers'
import { GET as getChannels, POST as postChannel } from '@/app/api/me/channels/route'
import { DELETE as deleteChannel, PUT as putChannel } from '@/app/api/me/channels/[id]/route'
import { GET as getRules, POST as postRule } from '@/app/api/me/rules/route'

const json = (method: string, body?: unknown) => new Request('http://localhost/api/me/x', {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const C1 = '33333333-3333-4333-8333-333333333333'

const validRule = (over: Record<string, unknown> = {}) => ({
  name: '시설 공고', enabled: true, kinds: ['notice'], keywords: ['시설'], profileId: null,
  categoryNames: [], agency: null, amountMin: null, amountMax: null, channelIds: [], digest: 'instant', ...over,
})

describe('알림 API', () => {
  let handle: DbHandle | undefined

  beforeEach(async () => {
    handle = await makeDb()
    setDbForTesting(handle.db)
    setAuthUserForTesting(TEST_USER)
  })

  afterEach(async () => {
    setAuthUserForTesting(undefined)
    setDbForTesting(undefined)
    await handle?.close()
    handle = undefined
  })

  it('미로그인이면 /api/me/channels가 401을 반환한다', async () => {
    setAuthUserForTesting(null)
    const response = await getChannels()
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '로그인이 필요합니다.' })
  })

  it('미로그인이면 /api/me/rules가 401을 반환한다', async () => {
    setAuthUserForTesting(null)
    const response = await getRules()
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: '로그인이 필요합니다.' })
  })

  it('신규 사용자는 빈 채널 목록을 받는다', async () => {
    const response = await getChannels()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ channels: [], available: { webhook: true } })
  })

  it('이메일 채널을 만들고 목록에 target으로 주소가 보인다', async () => {
    const created = await postChannel(json('POST', { type: 'email', label: '내 메일', config: { address: 'me@example.com' } }))
    expect(created.status).toBe(200)
    const listed = await getChannels()
    const body = await listed.json() as { channels: Array<Record<string, unknown>> }
    expect(body.channels[0]).toMatchObject({ type: 'email', label: '내 메일', target: 'me@example.com', enabled: true })
    expect(body.channels[0]).not.toHaveProperty('config')
    expect(JSON.stringify(body)).not.toContain('refreshToken')
  })

  it('잘못된 이메일 주소는 400이다', async () => {
    const response = await postChannel(json('POST', { type: 'email', label: '메일', config: { address: 'not-an-email' } }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '이메일 주소가 올바르지 않습니다.' })
  })

  it('웹훅 URL이 http가 아니면 400이다', async () => {
    const response = await postChannel(json('POST', { type: 'webhook', label: '훅', config: { url: 'ftp://example.com/hook' } }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '웹훅 주소가 올바르지 않습니다.' })
  })

  it('POST로 kakao 채널은 만들 수 없다', async () => {
    const response = await postChannel(json('POST', { type: 'kakao', label: '카카오', config: {} }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '카카오 채널은 카카오 연결 화면에서만 만들 수 있습니다.' })
  })

  it('같은 endpoint로 웹푸시를 다시 구독하면 채널이 늘지 않는다', async () => {
    const config = { endpoint: 'https://push.example/send/abc', keys: { p256dh: 'public', auth: 'secret' }, userAgent: 'Chrome' }
    await postChannel(json('POST', { type: 'webpush', label: '크롬', config }))
    await postChannel(json('POST', { type: 'webpush', label: '크롬 2', config }))
    const body = await (await getChannels()).json() as { channels: unknown[] }
    expect(body.channels).toHaveLength(1)
  })

  it('다른 사용자의 채널을 PUT하면 404이고 원본은 그대로다', async () => {
    const created = await postChannel(json('POST', { type: 'email', label: '원본', config: { address: 'me@example.com' } }))
    const id = (await created.json() as { id: string }).id
    setAuthUserForTesting(TEST_USER_B)
    const response = await putChannel(json('PUT', { label: '변경' }), ctx(id))
    expect(response.status).toBe(404)
    setAuthUserForTesting(TEST_USER)
    const body = await (await getChannels()).json() as { channels: Array<Record<string, unknown>> }
    expect(body.channels[0]?.label).toBe('원본')
  })

  it('다른 사용자의 채널을 DELETE하면 404다', async () => {
    const created = await postChannel(json('POST', { type: 'email', label: '원본', config: { address: 'me@example.com' } }))
    const id = (await created.json() as { id: string }).id
    setAuthUserForTesting(TEST_USER_B)
    expect((await deleteChannel(new Request('http://localhost'), ctx(id))).status).toBe(404)
  })

  it('UUID가 아닌 id는 400이다', async () => {
    const response = await putChannel(json('PUT', { label: '변경' }), ctx('not-a-uuid'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'id가 올바르지 않습니다.' })
  })

  it('규칙을 만들면 kinds·keywords·channelIds가 그대로 돌아온다', async () => {
    const channel = await postChannel(json('POST', { type: 'email', label: '메일', config: { address: 'me@example.com' } }))
    const channelId = (await channel.json() as { id: string }).id
    const response = await postRule(json('POST', validRule({ channelIds: [channelId], kinds: ['notice', 'prespec'], keywords: ['시설', '전산장비'] })))
    expect(response.status).toBe(200)
    const body = await (await getRules()).json() as { rules: Array<Record<string, unknown>> }
    expect(body.rules[0]).toMatchObject({ kinds: ['notice', 'prespec'], keywords: ['시설', '전산장비'], channelIds: [channelId] })
  })

  it('prespec-link 유형 규칙을 저장한다', async () => {
    const channel = await postChannel(json('POST', { type: 'email', label: '메일', config: { address: 'me@example.com' } }))
    const channelId = (await channel.json() as { id: string }).id
    const response = await postRule(json('POST', validRule({ kinds: ['prespec-link'], channelIds: [channelId] })))
    expect(response.status).toBe(200)
    const body = await (await getRules()).json() as { rules: Array<Record<string, unknown>> }
    expect(body.rules[0]).toMatchObject({ kinds: ['prespec-link'] })
  })

  it('내 채널이 아닌 channelIds를 지정하면 400이다', async () => {
    const response = await postRule(json('POST', validRule({ channelIds: [C1] })))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '알림 채널을 찾을 수 없습니다.' })
  })

  it('잘못된 kinds 값은 400이다', async () => {
    const response = await postRule(json('POST', validRule({ kinds: ['unknown'] })))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '알림 유형이 올바르지 않습니다.' })
  })

  it('최소 금액이 최대 금액보다 크면 400이다', async () => {
    const response = await postRule(json('POST', validRule({ amountMin: 10, amountMax: 1 })))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '최소 금액은 최대 금액보다 클 수 없습니다.' })
  })

  it('사용자별로 채널과 규칙이 격리된다', async () => {
    const channel = await postChannel(json('POST', { type: 'email', label: '메일', config: { address: 'me@example.com' } }))
    const channelId = (await channel.json() as { id: string }).id
    await postRule(json('POST', validRule({ channelIds: [channelId] })))
    setAuthUserForTesting(TEST_USER_B)
    expect(await (await getChannels()).json()).toMatchObject({ channels: [] })
    expect(await (await getRules()).json()).toEqual({ rules: [] })
  })

  it('같은 org 멤버는 규칙 목록을 공유한다', async () => {
    await postRule(json('POST', validRule()))
    await joinOrg(handle!.db, TEST_ORG_ID, TEST_USER_B)
    setAuthUserForTesting(TEST_USER_B)
    const body = await (await getRules()).json() as { rules: unknown[] }
    expect(body.rules).toHaveLength(1)
  })

  it('같은 org 멤버라도 채널 목록은 개인별로 분리된다', async () => {
    await postChannel(json('POST', { type: 'email', label: '개인 채널', config: { address: 'me@example.com' } }))
    await joinOrg(handle!.db, TEST_ORG_ID, TEST_USER_B)
    setAuthUserForTesting(TEST_USER_B)
    const body = await (await getChannels()).json() as { channels: unknown[] }
    expect(body.channels).toHaveLength(0)
  })

  it('같은 org 멤버의 채널을 규칙에 연결할 수 있다', async () => {
    await getChannels()
    await joinOrg(handle!.db, TEST_ORG_ID, TEST_USER_B)
    setAuthUserForTesting(TEST_USER_B)
    const channel = await postChannel(json('POST', { type: 'email', label: '멤버 채널', config: { address: 'other@example.com' } }))
    const channelId = (await channel.json() as { id: string }).id
    setAuthUserForTesting(TEST_USER)

    const response = await postRule(json('POST', validRule({ channelIds: [channelId] })))

    expect(response.status).toBe(200)
  })
})
