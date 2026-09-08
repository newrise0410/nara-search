import { describe, expect, it } from 'vitest'
import type { Profile } from '@nara/api'
import {
  changedSlices,
  createDefaultProfile,
  diffProfiles,
  emptySnapshot,
  hasData,
  isUuid,
  planInitialSync,
  planLimits,
  PLAN_LIMITS,
  type UserSnapshot,
  withUuidIds,
} from '@/lib/user-state'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const P3 = '33333333-3333-4333-8333-333333333333'

const profile = (id: string, name = '프로필'): Profile => ({
  id,
  name,
  categories: [],
  requirementKeywords: [],
  defaultKeywords: [],
})

const response = (initialized: boolean) => ({
  initialized,
  profiles: [],
  activeProfileId: null,
  keywords: [],
  competitors: [],
  presets: [],
  recent: [],
  theme: 'light' as const,
})

describe('사용자 상태 순수 함수', () => {
  it('isUuid가 UUID만 통과시킨다', () => {
    expect(isUuid(P1)).toBe(true)
    expect(isUuid('legacy-profile')).toBe(false)
    expect(isUuid('11111111-1111-4111-8111-11111111111')).toBe(false)
    expect(isUuid(null)).toBe(false)
  })

  it('createDefaultProfile은 호출마다 새 UUID id를 만든다', () => {
    const first = createDefaultProfile()
    const second = createDefaultProfile()
    expect(first.id).not.toBe(second.id)
    expect(isUuid(first.id)).toBe(true)
    expect(isUuid(second.id)).toBe(true)
    expect(first.categories).toHaveLength(6)
    expect(second.categories).toHaveLength(6)
  })

  it('withUuidIds가 비-UUID 프로필 id를 바꾸고 activeProfileId도 따라간다', () => {
    const local = { ...emptySnapshot(), profiles: [profile('legacy-profile')], activeProfileId: 'legacy-profile' }
    const converted = withUuidIds(local, () => P1)
    expect(converted.profiles[0].id).toBe(P1)
    expect(converted.activeProfileId).toBe(P1)
  })

  it('withUuidIds가 이미 UUID인 id는 그대로 둔다', () => {
    const local = { ...emptySnapshot(), profiles: [profile(P1)], activeProfileId: P1 }
    const converted = withUuidIds(local, () => P2)
    expect(converted.profiles[0].id).toBe(P1)
    expect(converted.activeProfileId).toBe(P1)
  })

  it('withUuidIds가 프리셋 id도 UUID로 바꾼다', () => {
    const local: UserSnapshot = {
      ...emptySnapshot(),
      presets: [{ id: 'preset', name: '저장 검색', query: { kind: 'award', keyword: '', from: '2026-08-01', to: '2026-08-28', bizDiv: 'all' } }],
    }
    const converted = withUuidIds(local, () => P2)
    expect(converted.presets[0].id).toBe(P2)
  })

  it('hasData가 빈 스냅샷을 false로 본다', () => {
    expect(hasData(emptySnapshot())).toBe(false)
    expect(hasData({ ...emptySnapshot(), keywords: ['시설'] })).toBe(true)
  })

  it('planInitialSync는 서버가 초기화됐으면 서버 상태로 덮어쓴다', () => {
    const server = { ...response(true), profiles: [profile(P1)], activeProfileId: P1, keywords: ['서버'] }
    const plan = planInitialSync(server, { ...emptySnapshot(), keywords: ['로컬'] }, createDefaultProfile)
    expect(plan.next.keywords).toEqual(['서버'])
    expect(plan.upload).toBe(false)
    expect(plan.migrated).toBe(false)
    expect(plan.seeded).toBe(false)
  })

  it('planInitialSync는 서버가 비고 로컬 데이터가 있으면 업로드한다', () => {
    const plan = planInitialSync(response(false), { ...emptySnapshot(), keywords: ['로컬'] }, createDefaultProfile)
    expect(plan.upload).toBe(true)
    expect(plan.migrated).toBe(true)
    expect(plan.seeded).toBe(false)
  })

  it('planInitialSync는 양쪽이 비면 검색어 제한 없이 기본 프로필을 시드한다', () => {
    const plan = planInitialSync(response(false), emptySnapshot(), createDefaultProfile)
    expect(plan.upload).toBe(true)
    expect(plan.seeded).toBe(true)
    expect(plan.next.profiles[0].defaultKeywords).toEqual([])
    expect(plan.next.profiles[0].requirementKeywords).toEqual([])
    expect(plan.next.keywords).toEqual([])
    expect(plan.migrated).toBe(false)
    expect(plan.next.activeProfileId).toBe(plan.next.profiles[0].id)
  })

  it('changedSlices와 diffProfiles가 변경분만 골라낸다', () => {
    const same = { ...emptySnapshot(), profiles: [profile(P1), profile(P2)] }
    expect(changedSlices(same, same)).toEqual([])
    expect(changedSlices(same, { ...same, keywords: ['시설'] })).toEqual(['keywords'])

    const previous = [profile(P1, '첫 번째'), profile(P2, '둘째'), profile(P3, '삭제')]
    const next = [profile(P2, '수정'), profile(P1, '첫 번째'), profile('new', '추가')]
    const diff = diffProfiles(previous, next)
    expect(diff.upserts.map(({ profile: item, sortOrder }) => [item.id, item.name, sortOrder])).toEqual([
      [P2, '수정', 0],
      [P1, '첫 번째', 1],
      ['new', '추가', 2],
    ])
    expect(diff.deletes).toEqual([P3])
  })

  it('요금제별 상한을 반환하고 모르는 플랜은 free로 처리한다', () => {
    expect(PLAN_LIMITS.free).toEqual({ profiles: 20, categories: 40, keywords: 30, competitors: 50, presets: 30, recent: 12, words: 40, text: 100, description: 300 })
    expect(planLimits('team').keywords).toBeGreaterThan(planLimits('free').keywords)
    expect(planLimits(null)).toBe(PLAN_LIMITS.free)
  })
})
