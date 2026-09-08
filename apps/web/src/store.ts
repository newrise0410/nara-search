import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Competitor, Preset, Profile, SearchQuery } from '@nara/api'
import { uid } from './lib/id'
import { isYmd } from '@nara/api'
import { defaultRange } from './lib/default-range'
import type { SearchSort } from './lib/api-types'
import { LIMITS, withUuidIds } from './lib/user-state'
import type { UserSnapshot } from './lib/user-state'

/** 낙찰은 DB 보유 마지막 날을 기본 기간으로 사용한다 */
export const DEFAULT_QUERY = (): SearchQuery => ({ kind: 'award', keyword: '', ...defaultRange('award'), bizDiv: 'all', source: 'db' })
const KINDS = ['award', 'notice', 'prespec', 'contract'] as const
const DIVS = ['all', 'Thng', 'Servc', 'Cnstwk', 'Frgcpt'] as const
/** 저장된 query를 검증해 안전한 값으로 정규화 */
export function normalizeQuery(q: unknown): SearchQuery {
  const d = DEFAULT_QUERY(); const o = (q && typeof q === 'object' ? q : {}) as Record<string, unknown>
  return {
    kind: (KINDS as readonly string[]).includes(String(o.kind)) ? (o.kind as SearchQuery['kind']) : d.kind,
    keyword: typeof o.keyword === 'string' ? o.keyword : '',
    from: isYmd(o.from) ? o.from : d.from, to: isYmd(o.to) ? o.to : d.to,
    bizDiv: (DIVS as readonly string[]).includes(String(o.bizDiv)) ? (o.bizDiv as SearchQuery['bizDiv']) : 'all',
    agency: typeof o.agency === 'string' && o.agency ? o.agency : undefined,
    source: o.source === 'live' ? 'live' : 'db',
  }
}

export interface State {
  profiles: Profile[]
  activeProfileId?: string
  keywords: string[]
  competitors: Competitor[]
  presets: Preset[]
  recent: string[]
  theme: 'dark' | 'light'
  density: 'normal' | 'compact'
  query: SearchQuery
  page: number
  sort: SearchSort
  lastTotal?: number
  coverageTo: Partial<Record<SearchQuery['kind'], string>>

  setQuery: (q: Partial<SearchQuery>) => void
  replaceQuery: (q: SearchQuery) => void
  setPage: (page: number) => void
  setSort: (sort: SearchSort) => void
  setLastTotal: (n?: number) => void
  setCoverage: (coverageTo: Partial<Record<SearchQuery['kind'], string>>) => void
  pushRecent: (k: string) => void
  setTheme: (t: 'dark' | 'light') => void
  setDensity: (d: 'normal' | 'compact') => void

  addProfile: (p: Profile) => void
  updateProfile: (p: Profile) => void
  removeProfile: (id: string) => void
  setActiveProfile: (id?: string) => void

  addKeyword: (k: string) => void
  removeKeyword: (k: string) => void
  addCompetitor: (c: Competitor) => void
  removeCompetitor: (bizNo: string) => void
  addPreset: (name: string) => void
  removePreset: (id: string) => void
  importAll: (data: Partial<State>) => void
  applyServerState: (snapshot: UserSnapshot) => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: undefined,
      keywords: [], competitors: [], presets: [], recent: [],
      theme: 'light',
      density: 'normal',
      query: DEFAULT_QUERY(),
      page: 1, sort: 'default',
      coverageTo: {},

      // 유형이 바뀌면 업무구분은 '전체'로 리셋 (숨은 필터 방지)
      setQuery: (q) => set((state) => {
        const kindChanged = q.kind !== undefined && q.kind !== state.query.kind
        const kind = q.kind ?? state.query.kind
        const range = kindChanged && !('from' in q) && !('to' in q) ? defaultRange(kind, state.coverageTo[kind]) : {}
        return {
          query: {
            ...state.query,
            ...q,
            ...range,
            ...(kindChanged && !('bizDiv' in q) ? { bizDiv: 'all' as const } : {}),
            ...(kind !== 'notice' ? { source: 'db' as const } : {}),
          },
          page: 1,
        }
      }),
      replaceQuery: (query) => set({ query: normalizeQuery(query), page: 1 }),
      setPage: (page) => set({ page }),
      setSort: (sort) => set({ sort }),
      setLastTotal: (lastTotal) => set({ lastTotal }),
      setCoverage: (coverageTo) => set({ coverageTo }),
      pushRecent: (k) => k.trim() && set({ recent: [k, ...get().recent.filter((r) => r !== k)].slice(0, LIMITS.recent) }),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),

      addProfile: (p) => get().profiles.length < LIMITS.profiles && set({ profiles: [...get().profiles, p] }),
      updateProfile: (p) => set({ profiles: get().profiles.map((x) => (x.id === p.id ? p : x)) }),
      removeProfile: (id) => set({ profiles: get().profiles.filter((x) => x.id !== id), activeProfileId: get().activeProfileId === id ? undefined : get().activeProfileId }),
      setActiveProfile: (activeProfileId) => set({ activeProfileId }),

      addKeyword: (k) => k.trim() && !get().keywords.includes(k) && get().keywords.length < LIMITS.keywords && set({ keywords: [...get().keywords, k.trim()] }),
      removeKeyword: (k) => set({ keywords: get().keywords.filter((x) => x !== k) }),
      addCompetitor: (c) => !get().competitors.some((x) => x.bizNo === c.bizNo) && get().competitors.length < LIMITS.competitors && set({ competitors: [...get().competitors, c] }),
      removeCompetitor: (bizNo) => set({ competitors: get().competitors.filter((x) => x.bizNo !== bizNo) }),
      addPreset: (name) => get().presets.length < LIMITS.presets && set({ presets: [...get().presets, { id: uid(), name, query: get().query }] }),
      removePreset: (id) => set({ presets: get().presets.filter((x) => x.id !== id) }),
      importAll: (d) => {
        const current = get()
        const imported = withUuidIds({
          profiles: d.profiles ?? current.profiles,
          activeProfileId: current.activeProfileId,
          keywords: d.keywords ?? current.keywords,
          competitors: d.competitors ?? current.competitors,
          presets: d.presets ?? current.presets,
          recent: current.recent,
          theme: current.theme,
        })
        set({ profiles: imported.profiles, keywords: imported.keywords, competitors: imported.competitors, presets: imported.presets })
      },
      applyServerState: (snapshot) => set({
        profiles: snapshot.profiles,
        activeProfileId: snapshot.activeProfileId,
        keywords: snapshot.keywords,
        competitors: snapshot.competitors,
        presets: snapshot.presets.map((preset) => ({ ...preset, query: normalizeQuery(preset.query) })),
        recent: snapshot.recent,
        theme: snapshot.theme,
      }),
    }),
    {
      name: 'nara-react',
      version: 5,
      migrate: (st, _version) => {
        const o = (st ?? {}) as Record<string, unknown>
        const profiles = Array.isArray(o.profiles) ? o.profiles as Profile[] : []
        const activeProfileId = typeof o.activeProfileId === 'string' ? o.activeProfileId : undefined
        const keywords = Array.isArray(o.keywords) ? o.keywords as string[] : []
        const competitors = Array.isArray(o.competitors) ? o.competitors as Competitor[] : []
        const recent = Array.isArray(o.recent) ? o.recent as string[] : []
        return {
          ...o,
          profiles,
          activeProfileId,
          keywords,
          competitors,
          recent,
          theme: 'light' as const,
          density: o.density === 'compact' ? 'compact' as const : 'normal' as const,
          query: normalizeQuery(o.query),
          presets: Array.isArray(o.presets) ? (o.presets as Preset[]).map((p) => ({ ...p, query: normalizeQuery(p.query) })) : [],
        }
      },
      partialize: (s) => ({ profiles: s.profiles, activeProfileId: s.activeProfileId, keywords: s.keywords, competitors: s.competitors, presets: s.presets, recent: s.recent, theme: s.theme, density: s.density, query: s.query }),
    },
  ),
)

/** 스토어에서 서버와 공유할 사용자 데이터만 뽑는다 */
export function snapshotOf(state: State): UserSnapshot {
  return {
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
    keywords: state.keywords,
    competitors: state.competitors,
    presets: state.presets,
    recent: state.recent,
    theme: state.theme,
  }
}

export const useActiveProfile = () => useStore((s) => s.profiles.find((p) => p.id === s.activeProfileId))
