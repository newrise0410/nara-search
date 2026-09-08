import type { Competitor, Preset, Profile } from '@nara/api'
import type { Theme, SyncSlice, UserSnapshot, UserStateResponse } from './user-state'
import { diffProfiles } from './user-state'

export const SYNC_DEBOUNCE_MS = 500

class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  let body: unknown
  try { body = await response.json() } catch { body = undefined }
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : `HTTP ${response.status}`
    throw new HttpError(error, response.status)
  }
  return body as T
}

function putJson<T>(url: string, body: T): Promise<unknown> {
  return fetchJson(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

export async function fetchUserState(signal?: AbortSignal): Promise<UserStateResponse> {
  return withRetry(() => fetchJson<UserStateResponse>('/api/me/state', signal ? { signal } : undefined))
}

export async function putProfile(profile: Profile, sortOrder: number): Promise<void> {
  await withRetry(() => putJson(`/api/me/profiles/${encodeURIComponent(profile.id)}`, { profile, sortOrder }))
}

export async function deleteProfile(id: string): Promise<void> {
  await withRetry(() => fetchJson(`/api/me/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }))
}

export async function putSettings(body: { activeProfileId: string | null; theme: Theme }): Promise<void> {
  await withRetry(() => putJson('/api/me/settings', body))
}

export async function putKeywords(keywords: string[]): Promise<void> {
  await withRetry(() => putJson('/api/me/keywords', { keywords }))
}

export async function putCompetitors(competitors: Competitor[]): Promise<void> {
  await withRetry(() => putJson('/api/me/competitors', { competitors }))
}

export async function putPresets(presets: Preset[]): Promise<void> {
  await withRetry(() => putJson('/api/me/presets', { presets }))
}

export async function putRecent(recent: string[]): Promise<void> {
  await withRetry(() => putJson('/api/me/recent', { recent }))
}

/** 네트워크·5xx 실패는 한 번만 재시도하고 4xx는 즉시 반환한다 */
export async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  let retried = false
  while (true) {
    try {
      return await run()
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError'
      const isClientError = error instanceof HttpError && error.status >= 400 && error.status < 500
      if (retried || isAbort || isClientError) throw error
      retried = true
    }
  }
}

/** 한 슬라이스의 변경분만 서버로 전송한다 */
export async function pushSlice(slice: SyncSlice, prev: UserSnapshot, next: UserSnapshot): Promise<void> {
  switch (slice) {
    case 'profiles': {
      const { upserts, deletes } = diffProfiles(prev.profiles, next.profiles)
      for (const { profile, sortOrder } of upserts) await putProfile(profile, sortOrder)
      for (const id of deletes) await deleteProfile(id)
      return
    }
    case 'settings':
      await putSettings({ activeProfileId: next.activeProfileId ?? null, theme: next.theme })
      return
    case 'keywords':
      await putKeywords(next.keywords)
      return
    case 'competitors':
      await putCompetitors(next.competitors)
      return
    case 'presets':
      await putPresets(next.presets)
      return
    case 'recent':
      await putRecent(next.recent)
      return
  }
}

/** 최초 마이그레이션용 전량 업로드. 활성 프로필 FK 때문에 프로필을 먼저 저장한다 */
export async function uploadAll(snapshot: UserSnapshot): Promise<void> {
  for (const [sortOrder, profile] of snapshot.profiles.entries()) await putProfile(profile, sortOrder)
  await putSettings({ activeProfileId: snapshot.activeProfileId ?? null, theme: snapshot.theme })
  await putKeywords(snapshot.keywords)
  await putCompetitors(snapshot.competitors)
  await putPresets(snapshot.presets)
  await putRecent(snapshot.recent)
}
