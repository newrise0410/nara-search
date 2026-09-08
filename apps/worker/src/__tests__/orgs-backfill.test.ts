import { afterEach, describe, expect, it } from 'vitest'
import { appUsers, applyMigrations, memberships, orgs, resultRows } from '@nara/db'
import { createTestDb } from '@nara/db/testing'
import { sql } from 'drizzle-orm'
import type { DbHandle } from '@nara/db'
import { ORG_SCOPED_TABLES, backfillOrgs } from '../orgs/backfill'

const USER_A = '00000000-0000-4000-8000-000000000021'
const USER_B = '00000000-0000-4000-8000-000000000022'

describe('조직 백필', () => {
  let handle: DbHandle | undefined

  afterEach(async () => { await handle?.close(); handle = undefined })

  const seedRows = async (userId: string, suffix: string): Promise<void> => {
    const profileId = `10000000-0000-4000-8000-0000000000${suffix}`
    const presetId = `20000000-0000-4000-8000-0000000000${suffix}`
    const channelId = `30000000-0000-4000-8000-0000000000${suffix}`
    const ruleId = `40000000-0000-4000-8000-0000000000${suffix}`
    await handle!.db.execute(sql`insert into user_profiles (id, user_id, name) values (${profileId}, ${userId}, ${`프로필 ${suffix}`})`)
    await handle!.db.execute(sql`insert into user_settings (user_id, theme) values (${userId}, 'light')`)
    await handle!.db.execute(sql`insert into user_keywords (user_id, keyword) values (${userId}, ${`키워드 ${suffix}`})`)
    await handle!.db.execute(sql`insert into user_competitors (user_id, biz_no, name) values (${userId}, ${`biz-${suffix}`}, '업체')`)
    await handle!.db.execute(sql`insert into user_presets (id, user_id, name, query) values (${presetId}, ${userId}, '프리셋', '{}'::jsonb)`)
    await handle!.db.execute(sql`insert into user_recent_searches (user_id, keyword) values (${userId}, ${`최근 ${suffix}`})`)
    await handle!.db.execute(sql`insert into alert_channels (id, user_id, type, label, config) values (${channelId}, ${userId}, 'email', '메일', '{}'::jsonb)`)
    await handle!.db.execute(sql`insert into alert_rules (id, user_id, name, kinds, keywords, category_names, channel_ids) values (${ruleId}, ${userId}, '규칙', ARRAY['notice']::text[], ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::uuid[])`)
  }

  const rowsFor = async (table: string): Promise<{ user_id: string; org_id: string | null }[]> => {
    const result = await handle!.db.execute(sql.raw(`select user_id, org_id from "${table}" order by user_id`))
    return resultRows<{ user_id: string; org_id: string | null }>(result)
  }

  it('사용자별로 8개 테이블을 무손실 백필하고 재실행에 멱등하다', async () => {
    handle = await createTestDb({ to: '0006' })
    await handle.db.insert(appUsers).values([
      { id: USER_A, email: 'a@example.com' },
      { id: USER_B, email: 'b@example.com' },
    ])
    await seedRows(USER_A, '21')
    await seedRows(USER_B, '22')
    const before = Object.fromEntries(await Promise.all(ORG_SCOPED_TABLES.map(async (table) => [table, (await rowsFor(table)).length])))

    const first = await backfillOrgs(handle.db)
    expect(first.users).toBe(2)
    expect(first.orgsCreated).toBe(2)
    expect(first.membershipsCreated).toBe(2)
    expect(Object.values(first.rows).reduce((sum, count) => sum + count, 0)).toBe(16)
    for (const table of ORG_SCOPED_TABLES) {
      const after = await rowsFor(table)
      expect(after.length).toBe(before[table])
      expect(after.every((row) => row.org_id === row.user_id)).toBe(true)
    }

    const second = await backfillOrgs(handle.db)
    expect(second.users).toBe(2)
    expect(second.orgsCreated).toBe(0)
    expect(second.membershipsCreated).toBe(0)
    expect(Object.values(second.rows).every((count) => count === 0)).toBe(true)
    expect(await applyMigrations(handle.db)).toEqual(['0007_org_scope_not_null', '0008_org_invites', '0009_money_numeric', '0010_bidder_summary', '0011_prespec_link', '0012_award_stats'])
  })

  it('이미 다른 org에 속한 사용자는 개인 org를 만들지 않고 그 org로 채운다', async () => {
    handle = await createTestDb({ to: '0006' })
    const orgId = '50000000-0000-4000-8000-000000000001'
    await handle.db.insert(appUsers).values({ id: USER_A, email: 'a@example.com' })
    await handle.db.insert(orgs).values({ id: orgId, name: '공유 org' })
    await handle.db.insert(memberships).values({ orgId, userId: USER_A, role: 'member' })
    await handle.db.execute(sql`insert into user_keywords (user_id, keyword) values (${USER_A}, '공유 키워드')`)

    const result = await backfillOrgs(handle.db)
    expect(result.users).toBe(1)
    expect(result.orgsCreated).toBe(0)
    expect(result.membershipsCreated).toBe(0)
    expect((await rowsFor('user_keywords'))[0]).toMatchObject({ user_id: USER_A, org_id: orgId })
    expect(await handle.db.select().from(orgs)).toHaveLength(1)
  })

  it('백필할 사용자가 없어도 결과를 반환한다', async () => {
    handle = await createTestDb({ to: '0006' })
    const result = await backfillOrgs(handle.db)
    expect(result.users).toBe(0)
    expect(result.orgsCreated).toBe(0)
    expect(result.membershipsCreated).toBe(0)
    expect(Object.values(result.rows).every((count) => count === 0)).toBe(true)
  })
})
