import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { applyMigrations } from '../client'
import { createTestDb } from '../testing'
import type { DbHandle } from '../client'

describe('범위 지정 마이그레이션', () => {
  let handle: DbHandle | undefined
  afterEach(async () => { await handle?.close(); handle = undefined })

  it('0006 적용 직후 org_id 없이 사용자 프로필을 저장할 수 있다', async () => {
    handle = await createTestDb({ to: '0006' })
    await handle.db.execute(sql`insert into app_users (id, email) values ('00000000-0000-0000-0000-000000000001', 'test@example.com')`)
    await handle.db.execute(sql`insert into user_profiles (id, user_id, name) values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '테스트')`)
    const rows = await handle.db.execute(sql`select org_id from user_profiles`)
    expect((rows as { rows: { org_id: string | null }[] }).rows[0]?.org_id).toBeNull()
  })

  it('남은 마이그레이션을 이어서 적용하고 두 번째 호출은 아무것도 적용하지 않는다', async () => {
    handle = await createTestDb({ to: '0006' })
    expect(await applyMigrations(handle.db)).toEqual(['0007_org_scope_not_null', '0008_org_invites', '0009_money_numeric', '0010_bidder_summary', '0011_prespec_link', '0012_award_stats'])
    expect(await applyMigrations(handle.db)).toEqual([])
  })
})
