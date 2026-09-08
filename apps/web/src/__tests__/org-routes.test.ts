import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { orgInvites, userSettings } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { GET as getOrg } from '@/app/api/me/org/route'
import { POST as postOrg } from '@/app/api/me/org/route'
import { GET as getMembers } from '@/app/api/me/org/members/route'
import { DELETE as deleteMember, PUT as putMember } from '@/app/api/me/org/members/[userId]/route'
import { POST as postInvite } from '@/app/api/me/org/invites/route'
import { DELETE as deleteInvite } from '@/app/api/me/org/invites/[id]/route'
import { GET as getOrgs } from '@/app/api/me/orgs/route'
import { POST as postSwitch } from '@/app/api/me/orgs/switch/route'
import { POST as postAccept } from '@/app/api/invites/accept/route'
import { GET as getState } from '@/app/api/me/state/route'
import { PUT as putKeywords } from '@/app/api/me/keywords/route'
import { hashInviteToken } from '@/server/invites'
import { setAuthUserForTesting } from '@/server/auth'
import { setDbForTesting } from '@/server/db'
import { joinOrg, makeDb, TEST_ORG_ID, TEST_USER, TEST_USER_B } from './helpers'
import type { AuthUser } from '@/server/auth'

const TEST_USER_C: AuthUser = { id: '00000000-0000-0000-0000-000000000003', email: 'third@example.com' }

const json = (method: string, body?: unknown, url = 'http://localhost/api/me/org') => new Request(url, {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const params = (userId: string) => ({ params: Promise.resolve({ userId }) })
const inviteParams = (id: string) => ({ params: Promise.resolve({ id }) })

const inviteToken = (body: { inviteUrl: string }): string => body.inviteUrl.split('/invite/')[1] ?? ''

const makeInvite = async (email: string, role?: 'owner' | 'member'): Promise<{ id: string; inviteUrl: string }> => {
  const response = await postInvite(json('POST', role === undefined ? { email } : { email, role }, 'http://localhost/api/me/org/invites'))
  expect(response.status).toBe(200)
  return await response.json() as { id: string; inviteUrl: string }
}

describe('조직 초대·멤버 API', () => {
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

  it('미로그인이면 /api/me/org/members가 401이다', async () => {
    setAuthUserForTesting(null)
    const response = await getMembers()
    expect(response.status).toBe(401)
  })

  it('신규 사용자는 자기 개인 org를 소유자로 받는다', async () => {
    const response = await getOrg()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: TEST_USER.id, name: 'tester', plan: 'free', role: 'owner' })
  })

  it('소유자는 워크스페이스 이름을 바꾸고 다시 읽는다', async () => {
    await getOrg()
    const renamed = await postOrg(json('POST', { name: '새 팀' }))
    expect(renamed.status).toBe(200)
    expect(await (await getOrg()).json()).toMatchObject({ name: '새 팀' })
  })

  it('빈 이름은 400이다', async () => {
    const response = await postOrg(json('POST', { name: '   ' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '워크스페이스 이름을 입력해 주세요.' })
  })

  it('멤버는 이름을 바꿀 수 없다', async () => {
    await getOrg()
    await joinOrg(handle!.db, TEST_ORG_ID, TEST_USER_B)
    setAuthUserForTesting(TEST_USER_B)
    const response = await postOrg(json('POST', { name: '탈취한 이름' }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: '워크스페이스 이름은 소유자만 바꿀 수 있습니다.' })
  })

  it('초대를 만들면 DB에는 토큰 해시만 있고 링크에는 원문이 있다', async () => {
    const created = await makeInvite('invitee@example.com')
    const token = inviteToken(created)
    const rows = await handle!.db.select().from(orgInvites)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tokenHash).toBe(hashInviteToken(token))
    expect(created.inviteUrl).toContain(token)
    for (const value of Object.values(rows[0] ?? {})) {
      if (typeof value === 'string') expect(value).not.toContain(token)
    }
  })

  it('같은 이메일을 다시 초대하면 이전 토큰은 무효가 된다', async () => {
    const first = await makeInvite(TEST_USER_B.email)
    const second = await makeInvite(TEST_USER_B.email)
    expect(second.id).toBe(first.id)
    expect(await handle!.db.select().from(orgInvites)).toHaveLength(1)
    setAuthUserForTesting(TEST_USER_B)
    const response = await postAccept(json('POST', { token: inviteToken(first) }, 'http://localhost/api/invites/accept'))
    expect(response.status).toBe(404)
  })

  it('대기 초대가 20개면 21번째는 400이다', async () => {
    for (let index = 0; index < 20; index++) await makeInvite(`pending-${index}@example.com`)
    const response = await postInvite(json('POST', { email: 'pending-20@example.com' }, 'http://localhost/api/me/org/invites'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '대기 중인 초대는 최대 20개까지 만들 수 있습니다.' })
  })

  it('이미 멤버인 이메일은 400이다', async () => {
    await getOrg()
    await joinOrg(handle!.db, TEST_ORG_ID, TEST_USER_B)
    const response = await postInvite(json('POST', { email: TEST_USER_B.email }, 'http://localhost/api/me/org/invites'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '이미 워크스페이스 멤버인 이메일입니다.' })
  })

  it('잘못된 이메일 형식은 400이다', async () => {
    const response = await postInvite(json('POST', { email: '잘못된 주소' }, 'http://localhost/api/me/org/invites'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '이메일 주소가 올바르지 않습니다.' })
  })

  it('멤버가 초대를 만들면 403이다', async () => {
    await getOrg()
    await joinOrg(handle!.db, TEST_ORG_ID, TEST_USER_B)
    setAuthUserForTesting(TEST_USER_B)
    const response = await postInvite(json('POST', { email: 'another@example.com' }, 'http://localhost/api/me/org/invites'))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: '멤버 초대는 소유자만 할 수 있습니다.' })
  })

  it('초대를 수락하면 초대한 org가 현재 org가 된다', async () => {
    await getOrg()
    const created = await makeInvite(TEST_USER_B.email)
    setAuthUserForTesting(TEST_USER_B)
    const accepted = await postAccept(json('POST', { token: inviteToken(created) }, 'http://localhost/api/invites/accept'))
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toMatchObject({ orgId: TEST_ORG_ID, orgName: 'tester' })
    const body = await (await getOrgs()).json() as { orgs: Array<{ id: string; active: boolean }> }
    expect(body.orgs).toHaveLength(2)
    expect(body.orgs.find((org) => org.id === TEST_ORG_ID)?.active).toBe(true)
  })

  it('수락 후 상태는 초대한 org에서 읽고 개인 org 데이터는 유지한다', async () => {
    await getOrg()
    await putKeywords(json('PUT', { keywords: ['팀 키워드'] }, 'http://localhost/api/me/keywords'))
    const created = await makeInvite(TEST_USER_B.email)
    setAuthUserForTesting(TEST_USER_B)
    await putKeywords(json('PUT', { keywords: ['개인 키워드'] }, 'http://localhost/api/me/keywords'))
    await postAccept(json('POST', { token: inviteToken(created) }, 'http://localhost/api/invites/accept'))

    expect((await (await getState()).json()).keywords).toEqual(['팀 키워드'])
    await postSwitch(json('POST', { orgId: TEST_USER_B.id }, 'http://localhost/api/me/orgs/switch'))
    expect((await (await getState()).json()).keywords).toEqual(['개인 키워드'])
  })

  it('만료된 초대는 400이다', async () => {
    const created = await makeInvite(TEST_USER_B.email)
    await handle!.db.update(orgInvites).set({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }).where(eq(orgInvites.id, created.id))
    setAuthUserForTesting(TEST_USER_B)
    const response = await postAccept(json('POST', { token: inviteToken(created) }, 'http://localhost/api/invites/accept'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '초대 링크가 만료되었습니다.' })
  })

  it('취소한 초대의 토큰은 404다', async () => {
    const created = await makeInvite(TEST_USER_B.email)
    const cancelled = await deleteInvite(new Request('http://localhost/api/me/org/invites/' + created.id), inviteParams(created.id))
    expect(cancelled.status).toBe(200)
    setAuthUserForTesting(TEST_USER_B)
    const response = await postAccept(json('POST', { token: inviteToken(created) }, 'http://localhost/api/invites/accept'))
    expect(response.status).toBe(404)
  })

  it('미로그인 수락은 401이다', async () => {
    const created = await makeInvite(TEST_USER_B.email)
    setAuthUserForTesting(null)
    const response = await postAccept(json('POST', { token: inviteToken(created) }, 'http://localhost/api/invites/accept'))
    expect(response.status).toBe(401)
  })

  it('마지막 소유자는 제거할 수 없다', async () => {
    await getOrg()
    const response = await deleteMember(new Request('http://localhost/api/me/org/members/' + TEST_USER.id), params(TEST_USER.id))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: '마지막 소유자는 제거할 수 없습니다. 다른 멤버에게 소유자를 넘긴 뒤 다시 시도하세요.' })
  })

  it('소유자가 멤버를 제거하면 그 멤버는 개인 org로 돌아간다', async () => {
    await getOrg()
    const created = await makeInvite(TEST_USER_B.email)
    setAuthUserForTesting(TEST_USER_B)
    await postAccept(json('POST', { token: inviteToken(created) }, 'http://localhost/api/invites/accept'))
    setAuthUserForTesting(TEST_USER)
    const removed = await deleteMember(new Request('http://localhost/api/me/org/members/' + TEST_USER_B.id), params(TEST_USER_B.id))
    expect(removed.status).toBe(200)
    setAuthUserForTesting(TEST_USER_B)
    const body = await (await getOrgs()).json() as { orgs: Array<{ id: string; active: boolean }> }
    expect(body.orgs).toEqual([{ id: TEST_USER_B.id, name: 'other', plan: 'free', role: 'owner', active: true }])
    expect((await handle!.db.select({ activeOrgId: userSettings.activeOrgId }).from(userSettings).where(eq(userSettings.userId, TEST_USER_B.id)))[0]?.activeOrgId).toBeNull()
  })

  it('멤버는 스스로 나갈 수 있고 다른 멤버를 제거하면 403이다', async () => {
    await getOrg()
    const inviteB = await makeInvite(TEST_USER_B.email)
    setAuthUserForTesting(TEST_USER_B)
    await postAccept(json('POST', { token: inviteToken(inviteB) }, 'http://localhost/api/invites/accept'))
    setAuthUserForTesting(TEST_USER)
    const inviteC = await makeInvite(TEST_USER_C.email)
    setAuthUserForTesting(TEST_USER_C)
    await postAccept(json('POST', { token: inviteToken(inviteC) }, 'http://localhost/api/invites/accept'))
    setAuthUserForTesting(TEST_USER_B)
    const forbidden = await deleteMember(new Request('http://localhost/api/me/org/members/' + TEST_USER_C.id), params(TEST_USER_C.id))
    expect(forbidden.status).toBe(403)
    const left = await deleteMember(new Request('http://localhost/api/me/org/members/' + TEST_USER_B.id), params(TEST_USER_B.id))
    expect(left.status).toBe(200)
  })

  it('역할을 소유자로 올렸다 내릴 수 있고 마지막 소유자 강등은 400이다', async () => {
    await getOrg()
    const created = await makeInvite(TEST_USER_B.email)
    setAuthUserForTesting(TEST_USER_B)
    await postAccept(json('POST', { token: inviteToken(created) }, 'http://localhost/api/invites/accept'))
    setAuthUserForTesting(TEST_USER)
    expect((await putMember(json('PUT', { role: 'owner' }), params(TEST_USER_B.id))).status).toBe(200)
    expect((await putMember(json('PUT', { role: 'member' }), params(TEST_USER_B.id))).status).toBe(200)
    const last = await putMember(json('PUT', { role: 'member' }), params(TEST_USER.id))
    expect(last.status).toBe(400)
    expect(await last.json()).toEqual({ error: '마지막 소유자의 역할은 바꿀 수 없습니다. 다른 멤버를 소유자로 지정한 뒤 다시 시도하세요.' })
  })
})
