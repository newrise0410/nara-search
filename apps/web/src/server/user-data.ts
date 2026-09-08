import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import type { Competitor, Preset, Profile } from '@nara/api'
import {
  userCompetitors,
  userKeywords,
  userPresets,
  userProfiles,
  userRecentSearches,
  userSettings,
} from '@nara/db'
import type { NaraDb, OrgContext } from '@nara/db'
import type { Theme, UserStateResponse } from '@/lib/user-state'
import { isUuid, LIMITS } from '@/lib/user-state'

const INVALID_BODY = '요청 본문 형식이 올바르지 않습니다.'
const INVALID_PROFILE_ID = '프로필 id가 올바르지 않습니다.'
const INVALID_PRESET_ID = '프리셋 id가 올바르지 않습니다.'

/** 요청 본문이 잘못됨 → 400 */
export class InvalidBodyError extends Error {}
/** 대상이 없거나 다른 사용자 소유 → 404 */
export class NotFoundError extends Error {}
/** 권한이 없다 → 403 */
export class ForbiddenError extends Error {}

export interface SettingsBody { activeProfileId: string | null; theme: Theme }

type RecordValue = Record<string, unknown>

function asRecord(value: unknown): RecordValue | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as RecordValue
}

function invalidBody(): InvalidBodyError {
  return new InvalidBodyError(INVALID_BODY)
}

function textValue(value: unknown, maxLength: number = LIMITS.text): string {
  if (typeof value !== 'string') throw invalidBody()
  const text = value.trim()
  if (text.length > maxLength) throw invalidBody()
  return text
}

function wordArray(value: unknown): string[] {
  if (!Array.isArray(value)) throw invalidBody()
  const words = value.map((item) => textValue(item)).filter(Boolean)
  if (words.length > LIMITS.words) throw invalidBody()
  return words
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const value = key(item)
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
}

export function parseProfileBody(value: unknown, id: string): { profile: Profile; sortOrder: number } {
  const routeId = typeof id === 'string' ? id.trim() : id
  if (!isUuid(routeId)) throw new InvalidBodyError(INVALID_PROFILE_ID)
  const body = asRecord(value)
  if (!body || !('profile' in body)) throw invalidBody()
  const raw = asRecord(body.profile)
  if (!raw) throw invalidBody()
  for (const key of ['id', 'name', 'categories', 'requirementKeywords', 'defaultKeywords']) {
    if (!(key in raw)) throw invalidBody()
  }
  if (typeof raw.id !== 'string' || !isUuid(raw.id.trim()) || raw.id.trim() !== routeId) {
    throw new InvalidBodyError(INVALID_PROFILE_ID)
  }
  if (typeof raw.name !== 'string' || !Array.isArray(raw.categories)) throw invalidBody()
  if (raw.categories.length > LIMITS.categories) throw invalidBody()
  if (!Array.isArray(raw.requirementKeywords) || !Array.isArray(raw.defaultKeywords)) throw invalidBody()

  const categories = raw.categories.map((value) => {
    const category = asRecord(value)
    if (!category || !('id' in category) || !('name' in category) || !('color' in category) || !('include' in category) || !('exclude' in category)) throw invalidBody()
    if (typeof category.id !== 'string' || typeof category.name !== 'string' || typeof category.color !== 'string') throw invalidBody()
    return {
      id: category.id.trim(),
      name: textValue(category.name),
      color: textValue(category.color),
      include: wordArray(category.include),
      exclude: wordArray(category.exclude),
    }
  })
  const profile: Profile = {
    id: routeId,
    name: textValue(raw.name),
    ...(raw.description === undefined ? {} : { description: textValue(raw.description, LIMITS.description) }),
    categories,
    requirementKeywords: wordArray(raw.requirementKeywords),
    defaultKeywords: wordArray(raw.defaultKeywords),
  }
  if (body.sortOrder !== undefined && (typeof body.sortOrder !== 'number' || !Number.isInteger(body.sortOrder))) throw invalidBody()
  return { profile, sortOrder: body.sortOrder === undefined ? 0 : body.sortOrder }
}

export function parseSettingsBody(value: unknown): SettingsBody {
  const body = asRecord(value)
  if (!body || !('activeProfileId' in body) || !('theme' in body)) throw invalidBody()
  let activeProfileId: string | null
  if (body.activeProfileId === null) {
    activeProfileId = null
  } else if (typeof body.activeProfileId === 'string' && isUuid(body.activeProfileId.trim())) {
    activeProfileId = body.activeProfileId.trim()
  } else {
    throw invalidBody()
  }
  if (typeof body.theme !== 'string') throw invalidBody()
  const theme = body.theme.trim()
  return { activeProfileId, theme: theme === 'dark' ? 'dark' : 'light' }
}

export function parseKeywordsBody(value: unknown): string[] {
  const body = asRecord(value)
  if (!body || !('keywords' in body) || !Array.isArray(body.keywords)) throw invalidBody()
  const keywords = dedupe(body.keywords.map((item) => textValue(item)).filter(Boolean), (item) => item)
  if (keywords.length > LIMITS.keywords) throw new InvalidBodyError('관심 키워드는 최대 30개까지 저장할 수 있습니다.')
  return keywords
}

export function parseRecentBody(value: unknown): string[] {
  const body = asRecord(value)
  if (!body || !('recent' in body) || !Array.isArray(body.recent)) throw invalidBody()
  const recent = dedupe(body.recent.map((item) => textValue(item)).filter(Boolean), (item) => item)
  if (recent.length > LIMITS.recent) throw new InvalidBodyError('최근 검색어는 최대 12개까지 저장할 수 있습니다.')
  return recent
}

export function parseCompetitorsBody(value: unknown): Competitor[] {
  const body = asRecord(value)
  if (!body || !('competitors' in body) || !Array.isArray(body.competitors)) throw invalidBody()
  const competitors = dedupe(body.competitors.map((value) => {
    const raw = asRecord(value)
    if (!raw || !('bizNo' in raw) || !('name' in raw)) throw invalidBody()
    return { bizNo: textValue(raw.bizNo), name: textValue(raw.name) }
  }).filter((item) => item.bizNo && item.name), (item) => item.bizNo)
  if (competitors.length > LIMITS.competitors) throw new InvalidBodyError('경쟁사는 최대 50개까지 저장할 수 있습니다.')
  return competitors
}

export function parsePresetsBody(value: unknown): Preset[] {
  const body = asRecord(value)
  if (!body || !('presets' in body) || !Array.isArray(body.presets)) throw invalidBody()
  const presets = dedupe(body.presets.map((value) => {
    const raw = asRecord(value)
    if (!raw || !('id' in raw) || !('name' in raw) || !('query' in raw)) throw invalidBody()
    if (typeof raw.id !== 'string' || !isUuid(raw.id.trim())) throw new InvalidBodyError(INVALID_PRESET_ID)
    if (typeof raw.name !== 'string') throw invalidBody()
    const query = asRecord(raw.query)
    if (!query) throw invalidBody()
    return { id: raw.id.trim(), name: textValue(raw.name), query: query as unknown as Preset['query'] }
  }), (item) => item.id)
  if (presets.length > LIMITS.presets) throw new InvalidBodyError('프리셋은 최대 30개까지 저장할 수 있습니다.')
  return presets
}

export async function loadUserState(db: NaraDb, ctx: OrgContext): Promise<UserStateResponse> {
  const [settingsRows, profileRows, keywordRows, competitorRows, presetRows, recentRows] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, ctx.userId)).limit(1),
    db.select().from(userProfiles).where(eq(userProfiles.orgId, ctx.orgId)).orderBy(asc(userProfiles.sortOrder), asc(userProfiles.id)),
    db.select().from(userKeywords).where(eq(userKeywords.orgId, ctx.orgId)).orderBy(asc(userKeywords.sortOrder), asc(userKeywords.keyword)),
    db.select().from(userCompetitors).where(eq(userCompetitors.orgId, ctx.orgId)).orderBy(asc(userCompetitors.sortOrder), asc(userCompetitors.bizNo)),
    db.select().from(userPresets).where(eq(userPresets.orgId, ctx.orgId)).orderBy(asc(userPresets.sortOrder), asc(userPresets.id)),
    db.select().from(userRecentSearches).where(eq(userRecentSearches.userId, ctx.userId)).orderBy(asc(userRecentSearches.sortOrder), asc(userRecentSearches.keyword)),
  ])
  const settings = settingsRows[0]
  const activeProfileId = settings?.activeProfileId && profileRows.some((row) => row.id === settings.activeProfileId)
    ? settings.activeProfileId
    : null
  return {
    initialized: Boolean(settings) || profileRows.length + keywordRows.length + competitorRows.length + presetRows.length + recentRows.length > 0,
    profiles: profileRows.map((row) => ({
      id: row.id,
      name: row.name,
      ...(row.description === null ? {} : { description: row.description }),
      categories: Array.isArray(row.categories) ? row.categories as Profile['categories'] : [],
      requirementKeywords: row.requirementKeywords,
      defaultKeywords: row.defaultKeywords,
    })),
    activeProfileId,
    keywords: keywordRows.map((row) => row.keyword),
    competitors: competitorRows.map((row) => ({ bizNo: row.bizNo, name: row.name })),
    presets: presetRows.map((row) => ({
      id: row.id,
      name: row.name,
      query: row.query && typeof row.query === 'object' ? row.query as Preset['query'] : {} as Preset['query'],
    })),
    recent: recentRows.map((row) => row.keyword),
    theme: settings?.theme === 'dark' ? 'dark' : 'light',
  }
}

export async function saveProfile(db: NaraDb, ctx: OrgContext, profile: Profile, sortOrder: number): Promise<void> {
  if (!isUuid(profile.id)) throw new InvalidBodyError(INVALID_PROFILE_ID)
  const owned = await db.select({ id: userProfiles.id }).from(userProfiles)
    .where(and(eq(userProfiles.id, profile.id), eq(userProfiles.orgId, ctx.orgId)))
  if (owned.length === 0) {
    const conflict = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.id, profile.id))
    if (conflict.length > 0) throw new NotFoundError('프로필을 찾을 수 없습니다.')
    const profiles = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.orgId, ctx.orgId))
    if (profiles.length >= LIMITS.profiles) throw new InvalidBodyError('프로필은 최대 20개까지 만들 수 있습니다.')
  }
  const updatedAt = new Date()
  const result = await db.insert(userProfiles).values({
    id: profile.id,
    orgId: ctx.orgId,
    userId: ctx.userId,
    name: profile.name,
    description: profile.description ?? null,
    categories: profile.categories,
    requirementKeywords: profile.requirementKeywords,
    defaultKeywords: profile.defaultKeywords,
    sortOrder,
    updatedAt,
  }).onConflictDoUpdate({
    target: userProfiles.id,
    set: {
      name: profile.name,
      description: profile.description ?? null,
      categories: profile.categories,
      requirementKeywords: profile.requirementKeywords,
      defaultKeywords: profile.defaultKeywords,
      sortOrder,
      updatedAt,
    },
    setWhere: eq(userProfiles.orgId, ctx.orgId),
  }).returning({ id: userProfiles.id })
  if (result.length === 0) throw new NotFoundError('프로필을 찾을 수 없습니다.')
}

export async function removeProfile(db: NaraDb, ctx: OrgContext, id: string): Promise<void> {
  if (!isUuid(id)) throw new InvalidBodyError(INVALID_PROFILE_ID)
  const result = await db.delete(userProfiles)
    .where(and(eq(userProfiles.id, id), eq(userProfiles.orgId, ctx.orgId)))
    .returning({ id: userProfiles.id })
  if (result.length === 0) throw new NotFoundError('프로필을 찾을 수 없습니다.')
}

export async function saveSettings(db: NaraDb, ctx: OrgContext, body: SettingsBody): Promise<void> {
  if (body.activeProfileId !== null) {
    const profiles = await db.select({ id: userProfiles.id }).from(userProfiles)
      .where(and(eq(userProfiles.id, body.activeProfileId), eq(userProfiles.orgId, ctx.orgId)))
    if (profiles.length === 0) throw new InvalidBodyError('활성 프로필을 찾을 수 없습니다.')
  }
  const updatedAt = new Date()
  await db.insert(userSettings).values({ userId: ctx.userId, orgId: ctx.orgId, activeProfileId: body.activeProfileId, theme: body.theme, updatedAt })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { orgId: ctx.orgId, activeProfileId: body.activeProfileId, theme: body.theme, updatedAt },
    })
}

export async function saveKeywords(db: NaraDb, ctx: OrgContext, keywords: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userKeywords).where(eq(userKeywords.orgId, ctx.orgId))
    if (keywords.length) await tx.insert(userKeywords).values(keywords.map((keyword, sortOrder) => ({ orgId: ctx.orgId, userId: ctx.userId, keyword, sortOrder })))
  })
}

export async function saveCompetitors(db: NaraDb, ctx: OrgContext, competitors: Competitor[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userCompetitors).where(eq(userCompetitors.orgId, ctx.orgId))
    if (competitors.length) await tx.insert(userCompetitors).values(competitors.map(({ bizNo, name }, sortOrder) => ({ orgId: ctx.orgId, userId: ctx.userId, bizNo, name, sortOrder })))
  })
}

export async function savePresets(db: NaraDb, ctx: OrgContext, presets: Preset[]): Promise<void> {
  const ids = presets.map((preset) => preset.id)
  if (ids.length) {
    const foreign = await db.select({ id: userPresets.id }).from(userPresets)
      .where(and(inArray(userPresets.id, ids), ne(userPresets.orgId, ctx.orgId)))
    if (foreign.length) throw new InvalidBodyError(INVALID_PRESET_ID)
  }
  await db.transaction(async (tx) => {
    await tx.delete(userPresets).where(eq(userPresets.orgId, ctx.orgId))
    if (presets.length) await tx.insert(userPresets).values(presets.map(({ id, name, query }, sortOrder) => ({ id, orgId: ctx.orgId, userId: ctx.userId, name, query, sortOrder })))
  })
}

export async function saveRecent(db: NaraDb, ctx: OrgContext, recent: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userRecentSearches).where(eq(userRecentSearches.userId, ctx.userId))
    if (recent.length) await tx.insert(userRecentSearches).values(recent.map((keyword, sortOrder) => ({ orgId: ctx.orgId, userId: ctx.userId, keyword, sortOrder })))
  })
}
