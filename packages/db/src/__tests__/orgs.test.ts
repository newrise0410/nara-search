import { afterEach, describe, expect, it } from 'vitest'
import { appUsers, memberships, orgs, userSettings } from '../schema'
import { createTestDb } from '../testing'
import { ensurePersonalOrg, findMembership, listUserOrgs, orgNameFromEmail } from '../orgs'
import type { DbHandle } from '../client'

const USER_ID = '00000000-0000-0000-0000-000000000011'

describe('조직 헬퍼', () => {
  let handle: DbHandle | undefined
  afterEach(async () => { await handle?.close(); handle = undefined })

  it('개인 org와 owner 멤버십을 멱등하게 만든다', async () => {
    handle = await createTestDb()
    const user = { id: USER_ID, email: 'developer@example.com' }
    await handle.db.insert(appUsers).values(user)

    const first = await ensurePersonalOrg(handle.db, user)
    const second = await ensurePersonalOrg(handle.db, user)

    expect(first).toEqual({ orgId: USER_ID, role: 'owner', created: true })
    expect(second).toEqual({ orgId: USER_ID, role: 'owner', created: false })
    expect(await handle.db.select().from(orgs)).toHaveLength(1)
    expect(await handle.db.select().from(memberships)).toHaveLength(1)
  })

  it('이메일 로컬파트로 org 이름을 만들고 빈 로컬파트를 기본 이름으로 바꾼다', () => {
    expect(orgNameFromEmail('developer@example.com')).toBe('developer')
    expect(orgNameFromEmail('@example.com')).toBe('내 워크스페이스')
    expect(orgNameFromEmail(`${'a'.repeat(120)}@example.com`)).toHaveLength(100)
  })

  it('멤버십이 없으면 null을 반환한다', async () => {
    handle = await createTestDb()
    expect(await findMembership(handle.db, USER_ID)).toBeNull()
  })

  it('사용자가 속한 다른 org 멤버십을 반환한다', async () => {
    handle = await createTestDb()
    const orgId = '00000000-0000-0000-0000-000000000012'
    await handle.db.insert(appUsers).values({ id: USER_ID, email: 'member@example.com' })
    await handle.db.insert(orgs).values({ id: orgId, name: '공유 워크스페이스' })
    await handle.db.insert(memberships).values({ orgId, userId: USER_ID, role: 'member' })

    expect(await findMembership(handle.db, USER_ID)).toEqual({ orgId, role: 'member' })
  })

  it('활성 org가 두 번째 org를 가리키면 그 org를 반환한다', async () => {
    handle = await createTestDb()
    const secondOrgId = '00000000-0000-0000-0000-000000000012'
    await handle.db.insert(appUsers).values({ id: USER_ID, email: 'member@example.com' })
    await handle.db.insert(orgs).values([
      { id: USER_ID, name: '개인 워크스페이스' },
      { id: secondOrgId, name: '팀 워크스페이스' },
    ])
    await handle.db.insert(memberships).values([
      { orgId: USER_ID, userId: USER_ID, role: 'owner' },
      { orgId: secondOrgId, userId: USER_ID, role: 'member' },
    ])
    await handle.db.insert(userSettings).values({ userId: USER_ID, orgId: USER_ID, activeOrgId: secondOrgId })

    expect(await findMembership(handle.db, USER_ID)).toEqual({ orgId: secondOrgId, role: 'member' })
  })

  it('활성 org가 멤버가 아니면 개인 org로 폴백한다', async () => {
    handle = await createTestDb()
    const outsiderOrgId = '00000000-0000-0000-0000-000000000012'
    await handle.db.insert(appUsers).values({ id: USER_ID, email: 'member@example.com' })
    await handle.db.insert(orgs).values([
      { id: USER_ID, name: '개인 워크스페이스' },
      { id: outsiderOrgId, name: '외부 워크스페이스' },
    ])
    await handle.db.insert(memberships).values({ orgId: USER_ID, userId: USER_ID, role: 'owner' })
    await handle.db.insert(userSettings).values({ userId: USER_ID, orgId: USER_ID, activeOrgId: outsiderOrgId })

    expect(await findMembership(handle.db, USER_ID)).toEqual({ orgId: USER_ID, role: 'owner' })
  })

  it('가입 순으로 org 이름과 역할을 함께 반환한다', async () => {
    handle = await createTestDb()
    const firstOrgId = '00000000-0000-0000-0000-000000000012'
    const secondOrgId = '00000000-0000-0000-0000-000000000013'
    const firstJoinedAt = new Date('2024-01-01T00:00:00.000Z')
    const secondJoinedAt = new Date('2024-01-02T00:00:00.000Z')
    await handle.db.insert(appUsers).values({ id: USER_ID, email: 'member@example.com' })
    await handle.db.insert(orgs).values([
      { id: firstOrgId, name: '첫 워크스페이스', plan: 'free' },
      { id: secondOrgId, name: '두 번째 워크스페이스', plan: 'team' },
    ])
    await handle.db.insert(memberships).values([
      { orgId: firstOrgId, userId: USER_ID, role: 'member', createdAt: firstJoinedAt },
      { orgId: secondOrgId, userId: USER_ID, role: 'owner', createdAt: secondJoinedAt },
    ])

    expect(await listUserOrgs(handle.db, USER_ID)).toEqual([
      { orgId: firstOrgId, name: '첫 워크스페이스', plan: 'free', role: 'member', joinedAt: firstJoinedAt },
      { orgId: secondOrgId, name: '두 번째 워크스페이스', plan: 'team', role: 'owner', joinedAt: secondJoinedAt },
    ])
  })
})
