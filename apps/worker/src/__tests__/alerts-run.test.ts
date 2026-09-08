import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { alertChannels, alertDeliveries, alertRules, appUsers, memberships, notices, orgs, userProfiles } from '@nara/db'
import { createTestDb } from '@nara/db/testing'
import type { DbHandle } from '@nara/db'
import type { AlertMessage } from '../notify/types'
import { runAlerts } from '../alerts/run'

const USER = '00000000-0000-4000-8000-000000000001'
const CHANNEL_1 = '11111111-1111-4111-8111-111111111111'
const CHANNEL_2 = '22222222-2222-4222-8222-222222222222'
const RULE = '44444444-4444-4444-8444-444444444444'
const ORG = '55555555-5555-4555-8555-555555555555'
const PROFILE = '66666666-6666-4666-8666-666666666666'
const MEMBER_B = '88888888-8888-4888-8888-888888888888'
const NON_MEMBER = '99999999-9999-4999-8999-999999999999'

const since = (): Date => new Date(Date.now() - 60_000)

describe('알림 평가기', () => {
  let handle: DbHandle | undefined

  afterEach(async () => { await handle?.close(); handle = undefined })

  const seed = async (options: { digest?: 'instant' | 'daily'; channelIds?: string[] } = {}) => {
    await handle!.db.insert(appUsers).values({ id: USER, email: 'alerts@example.com' })
    await handle!.db.insert(orgs).values({ id: ORG, name: '알림 org' })
    await handle!.db.insert(memberships).values({ orgId: ORG, userId: USER, role: 'owner' })
    const channelIds = options.channelIds ?? [CHANNEL_1]
    await handle!.db.insert(alertChannels).values(channelIds.map((id) => ({
      id, orgId: ORG, userId: USER, type: 'email', label: id, config: { address: `${id}@example.com` },
    })))
    await handle!.db.insert(alertRules).values({
      id: RULE, orgId: ORG, userId: USER, name: '시설 공고', kinds: ['notice'], keywords: ['시설'],
      channelIds, digest: options.digest ?? 'instant',
    })
    await handle!.db.insert(notices).values({
      bidNtceNo: 'N-001', ord: '000', title: '시설 관제 시스템 구축', ntceInsttNm: '나라장터 검색',
      noticeDate: '2026-08-15', updatedAt: new Date(),
    })
  }

  it('키워드가 맞는 새 공고를 연결된 채널로 보낸다', async () => {
    handle = await createTestDb(); await seed()
    const messages: AlertMessage[] = []
    const result = await runAlerts({ db: handle.db, since: since(), env: { appUrl: 'https://nara.example' }, send: async (_channel, message) => { messages.push(message); return { ok: true } } })
    expect(result).toMatchObject({ rules: 1, candidates: 1, matched: 1, sent: 1 })
    expect(messages[0]?.total).toBe(1)
  })

  it('같은 항목을 두 번 실행해도 한 번만 보낸다', async () => {
    handle = await createTestDb(); await seed()
    let calls = 0
    const options = { db: handle.db, since: since(), env: { appUrl: 'https://nara.example' }, send: async () => { calls++; return { ok: true } } }
    await runAlerts(options)
    const second = await runAlerts(options)
    expect(second).toMatchObject({ sent: 0, skipped: 1 })
    expect(calls).toBe(1)
  })

  it('채널이 여러 개면 채널마다 한 번씩 보낸다', async () => {
    handle = await createTestDb(); await seed({ channelIds: [CHANNEL_1, CHANNEL_2] })
    let calls = 0
    await runAlerts({ db: handle.db, since: since(), env: { appUrl: 'https://nara.example' }, send: async () => { calls++; return { ok: true } } })
    expect(calls).toBe(2)
    expect(await handle.db.select().from(alertDeliveries)).toHaveLength(2)
  })

  it('발송이 실패하면 청구한 이력을 지워 다음 실행에서 다시 시도한다', async () => {
    handle = await createTestDb(); await seed()
    let calls = 0
    const options = { db: handle.db, since: since(), env: { appUrl: 'https://nara.example' }, send: async () => { calls++; return calls === 1 ? { ok: false, error: '전송 실패' } : { ok: true } } }
    const first = await runAlerts(options)
    expect(first.failed).toBe(1)
    expect(await handle.db.select().from(alertDeliveries)).toHaveLength(0)
    const second = await runAlerts(options)
    expect(second.sent).toBe(1)
  })

  it('실패하면 관리자 알림을 한 번 보낸다', async () => {
    handle = await createTestDb(); await seed()
    let calls = 0
    const result = await runAlerts({
      db: handle.db,
      since: since(),
      env: { appUrl: 'https://nara.example' },
      send: async () => ({ ok: false, error: '전송 실패' }),
      notifyAdmin: async (title, text) => { calls++; expect(title).toBe('[나라장터] 알림 실행 실패'); expect(text).toContain('첫 오류: 전송 실패') },
    })
    expect(result.failed).toBe(1)
    expect(calls).toBe(1)
  })

  it('정상이면 관리자 알림을 보내지 않는다', async () => {
    handle = await createTestDb(); await seed()
    let calls = 0
    await runAlerts({
      db: handle.db,
      since: since(),
      env: { appUrl: 'https://nara.example' },
      send: async () => ({ ok: true }),
      notifyAdmin: async () => { calls++ },
    })
    expect(calls).toBe(0)
  })

  it('gone 결과는 채널을 비활성화한다', async () => {
    handle = await createTestDb(); await seed()
    await runAlerts({ db: handle.db, since: since(), env: { appUrl: 'https://nara.example' }, send: async () => ({ ok: false, gone: true, error: 'gone' }) })
    expect((await handle.db.select().from(alertChannels))[0]?.enabled).toBe(false)
  })

  it('dry-run은 발송도 이력 기록도 하지 않는다', async () => {
    handle = await createTestDb(); await seed()
    let calls = 0
    const result = await runAlerts({ db: handle.db, since: since(), dryRun: true, env: { appUrl: 'https://nara.example' }, send: async () => { calls++; return { ok: true } } })
    expect(result.matched).toBeGreaterThanOrEqual(1)
    expect(calls).toBe(0)
    expect(await handle.db.select().from(alertDeliveries)).toHaveLength(0)
  })

  it('daily 규칙은 20시간 안에 두 번 보내지 않는다', async () => {
    handle = await createTestDb(); await seed({ digest: 'daily' })
    let calls = 0
    const options = { db: handle.db, since: since(), env: { appUrl: 'https://nara.example' }, send: async () => { calls++; return { ok: true } } }
    await runAlerts(options)
    await handle.db.insert(notices).values({ bidNtceNo: 'N-002', ord: '000', title: '시설 배송 실증', ntceInsttNm: '나라장터 검색', noticeDate: '2026-08-15', updatedAt: new Date() })
    const second = await runAlerts(options)
    expect(second.sent).toBe(0)
    expect(calls).toBe(1)
  })

  it('같은 org의 프로필 카테고리가 규칙 매칭을 좁힌다', async () => {
    handle = await createTestDb()
    await seed()
    await handle.db.insert(userProfiles).values({
      id: PROFILE, orgId: ORG, userId: USER, name: '시설 프로필',
      categories: [{ id: 'category', name: '유지보수', color: '#000000', include: [], exclude: ['시설'] }],
    })
    await handle.db.update(alertRules).set({ profileId: PROFILE, categoryNames: ['유지보수'] }).where(eq(alertRules.id, RULE))
    const result = await runAlerts({ db: handle.db, since: since(), dryRun: true, env: { appUrl: 'https://nara.example' } })
    expect(result.matched).toBe(0)
  })

  it('다른 org의 같은 프로필 id는 규칙에 적용하지 않는다', async () => {
    handle = await createTestDb()
    await seed()
    await handle.db.insert(orgs).values({ id: '77777777-7777-4777-8777-777777777777', name: '다른 org' })
    await handle.db.insert(userProfiles).values({
      id: PROFILE, orgId: '77777777-7777-4777-8777-777777777777', userId: USER, name: '다른 프로필',
      categories: [{ id: 'category', name: '유지보수', color: '#000000', include: [], exclude: ['시설'] }],
    })
    await handle.db.update(alertRules).set({ profileId: PROFILE, categoryNames: ['유지보수'] }).where(eq(alertRules.id, RULE))
    const result = await runAlerts({ db: handle.db, since: since(), dryRun: true, env: { appUrl: 'https://nara.example' } })
    expect(result.matched).toBe(1)
  })

  it('같은 org 멤버의 채널로 규칙을 발송한다', async () => {
    handle = await createTestDb()
    await seed()
    await handle.db.insert(appUsers).values({ id: MEMBER_B, email: 'member-b@example.com' })
    await handle.db.insert(memberships).values({ orgId: ORG, userId: MEMBER_B, role: 'member' })
    await handle.db.insert(alertChannels).values({
      id: CHANNEL_2, orgId: ORG, userId: MEMBER_B, type: 'email', label: '멤버 B 채널', config: { address: 'member-b@example.com' },
    })
    await handle.db.update(alertRules).set({ channelIds: [CHANNEL_2] }).where(eq(alertRules.id, RULE))

    const result = await runAlerts({ db: handle.db, since: since(), env: { appUrl: 'https://nara.example' }, send: async () => ({ ok: true }) })

    expect(result).toMatchObject({ matched: 1, sent: 1 })
  })

  it('org 멤버가 아닌 사용자의 채널은 규칙에서 제외한다', async () => {
    handle = await createTestDb()
    await seed()
    await handle.db.insert(appUsers).values({ id: NON_MEMBER, email: 'non-member@example.com' })
    await handle.db.insert(alertChannels).values({
      id: CHANNEL_2, orgId: ORG, userId: NON_MEMBER, type: 'email', label: '외부 채널', config: { address: 'non-member@example.com' },
    })
    await handle.db.update(alertRules).set({ channelIds: [CHANNEL_2] }).where(eq(alertRules.id, RULE))

    const result = await runAlerts({ db: handle.db, since: since(), env: { appUrl: 'https://nara.example' }, send: async () => ({ ok: true }) })

    expect(result).toMatchObject({ matched: 1, sent: 0 })
    expect(await handle.db.select().from(alertDeliveries)).toHaveLength(0)
  })
})
