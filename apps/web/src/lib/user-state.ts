import type { Competitor, Preset, Profile } from '@nara/api'
import { uid } from './id'

export type Theme = 'light' | 'dark'

/** 서버와 동기화하는 사용자 데이터 한 벌 */
export interface UserSnapshot {
  profiles: Profile[]
  activeProfileId?: string
  keywords: string[]
  competitors: Competitor[]
  presets: Preset[]
  recent: string[]
  theme: Theme
}

/** GET /api/me/state 응답 본문 */
export interface UserStateResponse {
  /** user_settings 행이 있으면 true = "이 계정은 이미 서버에 초기화됐다" */
  initialized: boolean
  profiles: Profile[]
  activeProfileId: string | null
  keywords: string[]
  competitors: Competitor[]
  presets: Preset[]
  recent: string[]
  theme: Theme
}

export type PlanId = 'free' | 'team'
export const PLAN_IDS: readonly PlanId[] = ['free', 'team']
export interface PlanLimits {
  profiles: number; categories: number; keywords: number; competitors: number; presets: number
  recent: number; words: number; text: number; description: number
}
/** 요금제별 상한. free 값은 009까지의 상수와 완전히 같다 */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { profiles: 20, categories: 40, keywords: 30, competitors: 50, presets: 30, recent: 12, words: 40, text: 100, description: 300 },
  team: { profiles: 100, categories: 40, keywords: 100, competitors: 200, presets: 100, recent: 12, words: 40, text: 100, description: 300 },
}
/** 서버·클라이언트 공통 상한. 지금은 모든 검사가 free 기준이다 */
export const LIMITS: PlanLimits = PLAN_LIMITS.free
/** orgs.plan 문자열을 상한으로 바꾼다(모르는 값은 free) */
export function planLimits(plan: string | null | undefined): PlanLimits { return plan === 'team' ? PLAN_LIMITS.team : PLAN_LIMITS.free }

export type SyncSlice = 'profiles' | 'settings' | 'keywords' | 'competitors' | 'presets' | 'recent'
export const SYNC_SLICES: readonly SyncSlice[] = ['profiles', 'settings', 'keywords', 'competitors', 'presets', 'recent']

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function emptySnapshot(): UserSnapshot {
  return { profiles: [], activeProfileId: undefined, keywords: [], competitors: [], presets: [], recent: [], theme: 'light' }
}

export function fromResponse(response: UserStateResponse): UserSnapshot {
  return {
    profiles: response.profiles,
    activeProfileId: response.activeProfileId ?? undefined,
    keywords: response.keywords,
    competitors: response.competitors,
    presets: response.presets,
    recent: response.recent,
    theme: response.theme,
  }
}

export function hasData(snapshot: UserSnapshot): boolean {
  return snapshot.profiles.length > 0
    || snapshot.keywords.length > 0
    || snapshot.competitors.length > 0
    || snapshot.presets.length > 0
    || snapshot.recent.length > 0
}

/** localStorage에 남은 비-UUID id가 서버 UUID 컬럼에서 실패하지 않도록 변환한다 */
export function withUuidIds(snapshot: UserSnapshot, makeId: () => string = uid): UserSnapshot {
  const profileIds = new Map<string, string>()
  const profiles = snapshot.profiles.map((profile) => {
    const id = isUuid(profile.id) ? profile.id : (profileIds.get(profile.id) ?? makeId())
    profileIds.set(profile.id, id)
    return { ...profile, id }
  })
  const activeProfileId = snapshot.activeProfileId === undefined
    ? undefined
    : (profileIds.get(snapshot.activeProfileId) ?? snapshot.activeProfileId)
  const presets = snapshot.presets.map((preset) => ({
    ...preset,
    id: isUuid(preset.id) ? preset.id : makeId(),
  }))
  return { ...snapshot, profiles, activeProfileId, presets }
}

/** 값이 달라진 슬라이스만 추려 변경 순서를 고정한다 */
export function changedSlices(prev: UserSnapshot, next: UserSnapshot): SyncSlice[] {
  const changed: SyncSlice[] = []
  if (JSON.stringify(prev.profiles) !== JSON.stringify(next.profiles)) changed.push('profiles')
  if (prev.activeProfileId !== next.activeProfileId || prev.theme !== next.theme) changed.push('settings')
  if (JSON.stringify(prev.keywords) !== JSON.stringify(next.keywords)) changed.push('keywords')
  if (JSON.stringify(prev.competitors) !== JSON.stringify(next.competitors)) changed.push('competitors')
  if (JSON.stringify(prev.presets) !== JSON.stringify(next.presets)) changed.push('presets')
  if (JSON.stringify(prev.recent) !== JSON.stringify(next.recent)) changed.push('recent')
  return changed
}

/** 프로필 변경을 upsert와 delete 작업으로 나눈다 */
export function diffProfiles(prev: Profile[], next: Profile[]): { upserts: { profile: Profile; sortOrder: number }[]; deletes: string[] } {
  const upserts: { profile: Profile; sortOrder: number }[] = []
  for (const [sortOrder, profile] of next.entries()) {
    const previousIndex = prev.findIndex((item) => item.id === profile.id)
    if (previousIndex === -1 || JSON.stringify(prev[previousIndex]) !== JSON.stringify(profile) || previousIndex !== sortOrder) {
      upserts.push({ profile, sortOrder })
    }
  }
  const nextIds = new Set(next.map((profile) => profile.id))
  const deletes = prev.filter((profile) => !nextIds.has(profile.id)).map((profile) => profile.id)
  return { upserts, deletes }
}

export interface InitialSyncPlan {
  next: UserSnapshot
  /** true면 next를 서버에 전량 업로드해야 한다 */
  upload: boolean
  /** 기존 브라우저 데이터를 계정으로 옮긴 경우 — 사용자에게 1회 안내한다 */
  migrated: boolean
  /** 양쪽이 비어 기본 프로필을 시드한 경우 — 안내하지 않는다 */
  seeded: boolean
}

/** 로그인 직후 서버와 브라우저 상태를 합치는 규칙을 적용한다 */
export function planInitialSync(server: UserStateResponse, local: UserSnapshot, makeSeed: () => Profile): InitialSyncPlan {
  if (server.initialized) {
    return { next: fromResponse(server), upload: false, migrated: false, seeded: false }
  }
  if (hasData(local)) {
    return { next: withUuidIds(local), upload: true, migrated: true, seeded: false }
  }
  const seed = makeSeed()
  return {
    next: { profiles: [seed], activeProfileId: seed.id, keywords: [], competitors: [], presets: [], recent: [], theme: local.theme },
    upload: true,
    migrated: false,
    seeded: true,
  }
}

/** 특정 업종이나 검색어를 강제하지 않는 범용 예시 프로필 */
export function createDefaultProfile(): Profile {
  return {
    id: uid(), name: '기본 조달 분류', description: '물품·용역·공사를 내 업무에 맞게 분류하세요.',
    categories: [
      { id: uid(), name: '물품 구매', color: '#9F2F2D', include: ['구매', '납품', '물품'], exclude: [] },
      { id: uid(), name: '유지보수', color: '#956400', include: ['유지보수', '보수', '정비'], exclude: [] },
      { id: uid(), name: '시설 공사', color: '#346538', include: ['공사', '시공', '설치'], exclude: [] },
      { id: uid(), name: '점검·진단', color: '#1F6C9F', include: ['점검', '진단', '검사'], exclude: [] },
      { id: uid(), name: '교육·연구', color: '#6B4FA3', include: ['교육', '연구', '컨설팅'], exclude: [] },
      { id: uid(), name: '정보화', color: '#0E7490', include: ['정보시스템', '소프트웨어', '시스템 구축'], exclude: [] },
    ],
    requirementKeywords: [],
    defaultKeywords: [],
  }
}
