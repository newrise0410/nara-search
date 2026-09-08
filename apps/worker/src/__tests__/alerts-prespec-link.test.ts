import { afterEach, describe, expect, it } from 'vitest'
import { alertChannels, alertDeliveries, alertRules, appUsers, memberships, notices, orgs } from '@nara/db'
import { createTestDb } from '@nara/db/testing'
import type { Item } from '@nara/api'
import type { DbHandle } from '@nara/db'
import type { AlertMessage } from '../notify/types'
import type { AlertRule } from '../alerts/types'
import { loadNewItems } from '../alerts/items'
import { matchesRule } from '../alerts/match'
import { buildMessage } from '../alerts/message'
import { runAlerts } from '../alerts/run'

const USER = '00000000-0000-4000-8000-000000000013'
const CHANNEL = '11111111-1111-4111-8111-111111111113'
const RULE = '44444444-4444-4444-8444-444444444413'
const ORG = '55555555-5555-4555-8555-555555555513'

const item = (over?: Partial<Item>): Item => ({
  id: 'prespec-link-PS-001-NT-001-000',
  kind: 'notice',
  noticeNo: 'NT-001',
  title: '시설 관제 시스템 구축',
  agency: '나라장터 검색',
  date: '2026-08-15',
  amount: 12_000_000,
  transition: { prespecNo: 'PS-001', bidNtceNo: 'NT-001', ord: '000' },
  ...over,
})

const rule = (over?: Partial<AlertRule>): AlertRule => ({
  id: 'r1', orgId: 'org1', userId: 'u1', name: '전환 알림', enabled: true,
  kinds: [], keywords: [], profileId: null, categoryNames: [], agency: null,
  amountMin: null, amountMax: null, channelIds: [], digest: 'instant', ...over,
})

describe('사전규격 전환 알림', () => {
  let handle: DbHandle | undefined

  afterEach(async () => { await handle?.close(); handle = undefined })

  it('prespec_linked_at이 since 이후인 공고만 전환 항목으로 만든다', async () => {
    handle = await createTestDb()
    const since = new Date('2026-08-15T00:00:00Z')
    await handle.db.insert(notices).values([
      { bidNtceNo: 'NT-001', ord: '000', title: '연결 공고', prespecNo: 'PS-001', prespecLinkedAt: new Date('2026-08-16T00:00:00Z'), updatedAt: new Date('2026-08-16T00:00:00Z') },
      { bidNtceNo: 'NT-002', ord: '000', title: '이전 연결 공고', prespecNo: 'PS-002', prespecLinkedAt: new Date('2026-08-14T00:00:00Z'), updatedAt: new Date('2026-08-16T00:00:00Z') },
      { bidNtceNo: 'NT-003', ord: '000', title: '갱신 전 연결 공고', prespecNo: 'PS-003', prespecLinkedAt: new Date('2026-08-16T00:00:00Z'), updatedAt: new Date('2026-08-14T00:00:00Z') },
    ])

    const items = await loadNewItems(handle.db, since, { kinds: ['prespec-link'] })
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('prespec-link-PS-001-NT-001-000')
    expect(items[0]?.transition?.prespecNo).toBe('PS-001')
  })

  it('전환 항목은 prespec-link를 고른 규칙에만 걸린다', () => {
    expect(matchesRule(item(), rule({ kinds: ['prespec-link'] }))).toBe(true)
    expect(matchesRule(item(), rule({ kinds: ['notice'] }))).toBe(false)
    expect(matchesRule(item(), rule({ kinds: [] }))).toBe(false)
  })

  it('메시지에 사전규격 전환 표시를 붙인다', () => {
    const message = buildMessage({ name: '전환 알림' }, [item()], { appUrl: 'https://nara.example' })
    expect(message.text).toContain('[사전규격→본공고]')
    expect(message.html).toContain('[사전규격→본공고]')
    expect(message.summary).toContain('[사전규격→본공고]')
  })

  it('같은 전환은 두 번 발송하지 않는다', async () => {
    handle = await createTestDb()
    const now = new Date()
    const since = new Date(now.getTime() - 60_000)
    await handle.db.insert(appUsers).values({ id: USER, email: 'alerts@example.com' })
    await handle.db.insert(orgs).values({ id: ORG, name: '전환 알림 org' })
    await handle.db.insert(memberships).values({ orgId: ORG, userId: USER, role: 'owner' })
    await handle.db.insert(alertChannels).values({
      id: CHANNEL, orgId: ORG, userId: USER, type: 'email', label: '전환 채널', config: { address: 'alerts@example.com' },
    })
    await handle.db.insert(alertRules).values({
      id: RULE, orgId: ORG, userId: USER, name: '전환 알림', kinds: ['prespec-link'], keywords: ['시설'], channelIds: [CHANNEL],
    })
    await handle.db.insert(notices).values({
      bidNtceNo: 'NT-001', ord: '000', title: '시설 관제 시스템 구축', ntceInsttNm: '나라장터 검색',
      noticeDate: '2026-08-15', prespecNo: 'PS-001', prespecLinkedAt: now, updatedAt: now,
    })
    const options = { db: handle.db, since, env: { appUrl: 'https://nara.example' }, send: async (_channel: unknown, _message: AlertMessage) => ({ ok: true as const }) }
    await runAlerts(options)
    const second = await runAlerts(options)
    expect(second).toMatchObject({ sent: 0, skipped: 1 })
    expect(await handle.db.select().from(alertDeliveries)).toHaveLength(1)
  })
})
