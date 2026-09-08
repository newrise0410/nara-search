import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { userSettings } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { GET as getState } from '@/app/api/me/state/route'
import { PUT as putSettings } from '@/app/api/me/settings/route'
import { PUT as putKeywords } from '@/app/api/me/keywords/route'
import { PUT as putRecent } from '@/app/api/me/recent/route'
import { PUT as putCompetitors } from '@/app/api/me/competitors/route'
import { PUT as putPresets } from '@/app/api/me/presets/route'
import { DELETE as deleteProfile, PUT as putProfile } from '@/app/api/me/profiles/[id]/route'
import { setAuthUserForTesting } from '@/server/auth'
import { setDbForTesting } from '@/server/db'
import { joinOrg, makeDb, TEST_ORG_ID, TEST_USER, TEST_USER_B } from './helpers'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const PRESET = '33333333-3333-4333-8333-333333333333'
const OTHER_ORG = '44444444-4444-4444-8444-444444444444'

const put = (body: unknown, url = 'http://localhost/api/me/x') => new Request(url, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

const makeProfile = (id: string, name = '시설 사업') => ({
  id,
  name,
  description: '설명',
  categories: [{ id: 'cat-1', name: '유지보수', color: '#956400', include: ['유지보수'], exclude: [] }],
  requirementKeywords: ['보험'],
  defaultKeywords: ['시설'],
})

describe('사용자 데이터 라우트', () => {
  let handle: DbHandle | undefined

  beforeEach(async () => {
    handle = await makeDb()
    setDbForTesting(handle.db)
    setAuthUserForTesting(TEST_USER)
  })

  afterEach(async () => {
    setDbForTesting(undefined)
    setAuthUserForTesting(undefined)
    if (handle) await handle.close()
    handle = undefined
  })

  it('미로그인이면 /api/me/state가 401을 반환한다', async () => {
    setAuthUserForTesting(null)
    const response = await getState()
    expect(response.status).toBe(401)
    expect((await response.json()).error).toBe('로그인이 필요합니다.')
  })

  it('신규 사용자는 빈 상태와 initialized=false를 받는다', async () => {
    const response = await getState()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      initialized: false,
      profiles: [],
      activeProfileId: null,
      keywords: [],
      competitors: [],
      presets: [],
      recent: [],
      theme: 'light',
    })
  })

  it('프로필을 저장하면 categories와 키워드 배열이 그대로 돌아온다', async () => {
    const saved = makeProfile(P1)
    expect((await putProfile(put({ profile: saved, sortOrder: 0 }), ctx(P1))).status).toBe(200)
    const response = await getState()
    const body = await response.json()
    expect(body.profiles).toEqual([saved])
  })

  it('같은 id로 다시 PUT하면 갱신되고 프로필 수는 1개다', async () => {
    await putProfile(put({ profile: makeProfile(P1, '처음') }), ctx(P1))
    await putProfile(put({ profile: makeProfile(P1, '갱신') }), ctx(P1))
    const body = await (await getState()).json()
    expect(body.profiles).toHaveLength(1)
    expect(body.profiles[0].name).toBe('갱신')
  })

  it('프로필을 여러 개 저장하면 sortOrder 순서로 돌아온다', async () => {
    await putProfile(put({ profile: makeProfile(P1), sortOrder: 1 }), ctx(P1))
    await putProfile(put({ profile: makeProfile(P2, '두 번째'), sortOrder: 0 }), ctx(P2))
    const body = await (await getState()).json()
    expect(body.profiles.map((profile: { id: string }) => profile.id)).toEqual([P2, P1])
  })

  it('프로필을 삭제하면 목록에서 사라지고 활성 프로필이 null이 된다', async () => {
    await putProfile(put({ profile: makeProfile(P1) }), ctx(P1))
    await putSettings(put({ activeProfileId: P1, theme: 'light' }))
    expect((await deleteProfile(new Request('http://localhost/api/me/profiles/' + P1), ctx(P1))).status).toBe(200)
    const body = await (await getState()).json()
    expect(body.profiles).toEqual([])
    expect(body.activeProfileId).toBeNull()
  })

  it('UUID가 아닌 프로필 id는 400이다', async () => {
    const response = await putProfile(put({ profile: makeProfile(P1) }), ctx('legacy-profile'))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('프로필 id가 올바르지 않습니다.')
  })

  it('본문의 profile.id가 경로 id와 다르면 400이다', async () => {
    const response = await putProfile(put({ profile: makeProfile(P2) }), ctx(P1))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('프로필 id가 올바르지 않습니다.')
  })

  it('다른 사용자의 프로필을 PUT하면 404이고 원본은 그대로다', async () => {
    await putProfile(put({ profile: makeProfile(P1, '원본') }), ctx(P1))
    setAuthUserForTesting(TEST_USER_B)
    const response = await putProfile(put({ profile: makeProfile(P1, '변경') }), ctx(P1))
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('프로필을 찾을 수 없습니다.')
    setAuthUserForTesting(TEST_USER)
    const body = await (await getState()).json()
    expect(body.profiles[0].name).toBe('원본')
  })

  it('다른 사용자의 프로필을 DELETE하면 404다', async () => {
    await putProfile(put({ profile: makeProfile(P1) }), ctx(P1))
    setAuthUserForTesting(TEST_USER_B)
    const response = await deleteProfile(new Request('http://localhost/api/me/profiles/' + P1), ctx(P1))
    expect(response.status).toBe(404)
  })

  it('없는 프로필을 DELETE하면 404다', async () => {
    const response = await deleteProfile(new Request('http://localhost/api/me/profiles/' + P1), ctx(P1))
    expect(response.status).toBe(404)
  })

  it('관심 키워드를 보낸 순서대로 저장한다', async () => {
    await putKeywords(put({ keywords: ['측량', '시설', '관제'] }))
    const body = await (await getState()).json()
    expect(body.keywords).toEqual(['측량', '시설', '관제'])
  })

  it('관심 키워드 PUT은 이전 목록을 완전히 교체한다', async () => {
    await putKeywords(put({ keywords: ['시설', '측량'] }))
    await putKeywords(put({ keywords: ['관제'] }))
    const body = await (await getState()).json()
    expect(body.keywords).toEqual(['관제'])
  })

  it('관심 키워드 31개는 400이다', async () => {
    const response = await putKeywords(put({ keywords: Array.from({ length: 31 }, (_, index) => `키워드${index}`) }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('관심 키워드는 최대 30개까지 저장할 수 있습니다.')
  })

  it('최근 검색어 13개는 400이다', async () => {
    const response = await putRecent(put({ recent: Array.from({ length: 13 }, (_, index) => `검색어${index}`) }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('최근 검색어는 최대 12개까지 저장할 수 있습니다.')
  })

  it('경쟁사와 프리셋을 저장하고 프리셋 query가 그대로 돌아온다', async () => {
    const query = { kind: 'notice', keyword: '시설', from: '2026-08-01', to: '2026-08-28', bizDiv: 'all', source: 'db' as const }
    await putCompetitors(put({ competitors: [{ bizNo: '3148100001', name: '나래기술' }] }))
    await putPresets(put({ presets: [{ id: PRESET, name: '이번 주 공고', query }] }))
    const body = await (await getState()).json()
    expect(body.competitors).toEqual([{ bizNo: '3148100001', name: '나래기술' }])
    expect(body.presets[0].query).toEqual(query)
  })

  it('다른 사용자가 쓰는 프리셋 id를 보내면 400이고 SQL이 노출되지 않는다', async () => {
    const query = { kind: 'notice', keyword: '시설', from: '2026-08-01', to: '2026-08-28', bizDiv: 'all', source: 'db' as const }
    await putPresets(put({ presets: [{ id: PRESET, name: '원본 프리셋', query }] }))
    setAuthUserForTesting(TEST_USER_B)
    const response = await putPresets(put({ presets: [{ id: PRESET, name: '탈취 시도', query }] }))
    expect(response.status).toBe(400)
    const error = (await response.json()).error as string
    expect(error).toBe('프리셋 id가 올바르지 않습니다.')
    expect(error).not.toContain('insert into')
    setAuthUserForTesting(TEST_USER)
    const body = await (await getState()).json()
    expect(body.presets[0].name).toBe('원본 프리셋')
  })

  it('settings PUT 후 initialized가 true가 된다', async () => {
    await putSettings(put({ activeProfileId: null, theme: 'dark' }))
    const body = await (await getState()).json()
    expect(body.initialized).toBe(true)
    expect(body.theme).toBe('dark')
  })

  it('다른 org로 전환하면 그 org에 없는 activeProfileId를 null로 반환한다', async () => {
    await putProfile(put({ profile: makeProfile(P1) }), ctx(P1))
    await putSettings(put({ activeProfileId: P1, theme: 'light' }))
    await joinOrg(handle!.db, OTHER_ORG, TEST_USER)
    await handle!.db.update(userSettings).set({ activeOrgId: OTHER_ORG }).where(eq(userSettings.userId, TEST_USER.id))

    const body = await (await getState()).json()

    expect(body.activeProfileId).toBeNull()
  })

  it('settings에 다른 사용자의 프로필을 지정하면 400이다', async () => {
    await putProfile(put({ profile: makeProfile(P1) }), ctx(P1))
    setAuthUserForTesting(TEST_USER_B)
    const response = await putSettings(put({ activeProfileId: P1, theme: 'light' }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('활성 프로필을 찾을 수 없습니다.')
  })

  it('사용자별로 상태가 격리된다', async () => {
    await putKeywords(put({ keywords: ['시설', '측량'] }))
    setAuthUserForTesting(TEST_USER_B)
    const body = await (await getState()).json()
    expect(body.keywords).toEqual([])
    expect(body.profiles).toEqual([])
  })

  it('같은 org 멤버는 키워드와 프로필을 공유한다', async () => {
    await putKeywords(put({ keywords: ['시설', '측량'] }))
    await putProfile(put({ profile: makeProfile(P1) }), ctx(P1))
    await joinOrg(handle!.db, TEST_ORG_ID, TEST_USER_B)
    setAuthUserForTesting(TEST_USER_B)
    const body = await (await getState()).json()
    expect(body.keywords).toEqual(['시설', '측량'])
    expect(body.profiles[0].id).toBe(P1)
  })

  it('org 데이터가 있으면 settings가 없는 멤버도 initialized가 true다', async () => {
    await putKeywords(put({ keywords: ['팀 키워드'] }))
    await joinOrg(handle!.db, TEST_ORG_ID, TEST_USER_B)
    setAuthUserForTesting(TEST_USER_B)
    const body = await (await getState()).json()
    expect(body.initialized).toBe(true)
  })

  it('같은 org 멤버가 저장한 프로필을 원래 사용자도 본다', async () => {
    await getState()
    await joinOrg(handle!.db, TEST_ORG_ID, TEST_USER_B)
    setAuthUserForTesting(TEST_USER_B)
    await putProfile(put({ profile: makeProfile(P2, '멤버 프로필') }), ctx(P2))
    setAuthUserForTesting(TEST_USER)
    const body = await (await getState()).json()
    expect(body.profiles[0].name).toBe('멤버 프로필')
  })

  it('본문이 JSON이 아니면 400이다', async () => {
    const request = new Request('http://localhost/api/me/keywords', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const response = await putKeywords(request)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('요청 본문이 올바른 JSON이 아닙니다.')
  })
})
