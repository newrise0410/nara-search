import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { CHANNEL_TYPES, channelTarget } from 'worker'
import type { ChannelType, NotifyChannel } from 'worker'
import { ALERT_KIND_VALUES } from '@nara/api'
import type { AlertKind, Item } from '@nara/api'
import { alertChannels, alertRules, memberships, userProfiles } from '@nara/db'
import type { NaraDb, OrgContext } from '@nara/db'
import { uid } from '@/lib/id'
import { isUuid } from '@/lib/user-state'
import type { PlanId } from '@/lib/user-state'
import type { AlertChannelView, AlertRuleView, ChannelBody, RuleBody } from '@/lib/alerts-types'
import { InvalidBodyError, NotFoundError } from '@/server/user-data'

/** 채널 발송이 실패했다 → 502. */
export class SendFailedError extends Error {}

export interface PlanAlertLimits { channels: number; rules: number; keywords: number; categories: number; name: number; label: number; url: number; email: number }
/** 요금제별 알림 상한. free는 007 이후 값 그대로다 — 검사 지점은 아직 free만 쓴다(결제 연동은 별도 런) */
export const PLAN_ALERT_LIMITS: Record<PlanId, PlanAlertLimits> = {
  free: { channels: 10, rules: 20, keywords: 30, categories: 20, name: 60, label: 40, url: 500, email: 200 },
  team: { channels: 30, rules: 100, keywords: 30, categories: 20, name: 60, label: 40, url: 500, email: 200 },
}
export const LIMITS_ALERTS: PlanAlertLimits = PLAN_ALERT_LIMITS.free

export const TEST_ITEM: Item = {
  id: 'notice-TEST-000', kind: 'notice', noticeNo: 'TEST-000',
  title: '알림 채널 테스트 공고', agency: '나라장터 검색',
  amount: 12_000_000, date: new Date().toISOString().slice(0, 10),
}

type RecordValue = Record<string, unknown>

const INVALID_BODY = '요청 본문 형식이 올바르지 않습니다.'
const CHANNEL_NOT_FOUND = '알림 채널을 찾을 수 없습니다.'
const RULE_NOT_FOUND = '알림 규칙을 찾을 수 없습니다.'
const KINDS = new Set<AlertKind>(ALERT_KIND_VALUES)

const asRecord = (value: unknown): RecordValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
const has = (value: RecordValue, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)
const unique = <T>(items: T[]): T[] => [...new Set(items)]

const textValue = (value: unknown, max: number): string => {
  if (typeof value !== 'string') throw new InvalidBodyError(INVALID_BODY)
  const text = value.trim()
  if (text.length > max) throw new InvalidBodyError(INVALID_BODY)
  return text
}

const arrayOfText = (value: unknown, maxItems: number): string[] => {
  if (!Array.isArray(value)) throw new InvalidBodyError(INVALID_BODY)
  const items = value.map((item) => textValue(item, LIMITS_ALERTS.name)).filter(Boolean)
  if (items.length > maxItems) throw new InvalidBodyError(INVALID_BODY)
  return unique(items)
}

const channelType = (value: unknown): ChannelType => {
  const type = typeof value === 'string' ? value.trim() : value
  if (typeof type !== 'string' || !CHANNEL_TYPES.includes(type as ChannelType)) throw new InvalidBodyError('알림 채널 종류가 올바르지 않습니다.')
  return type as ChannelType
}

const validateEmail = (value: unknown): string => {
  const address = textValue(value, LIMITS_ALERTS.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new InvalidBodyError('이메일 주소가 올바르지 않습니다.')
  return address
}

const validateWebhook = (value: unknown): RecordValue => {
  const config = asRecord(value)
  if (!config || typeof config.url !== 'string') throw new InvalidBodyError('웹훅 주소가 올바르지 않습니다.')
  const url = config.url.trim()
  try {
    const parsed = new URL(url)
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || url.length > LIMITS_ALERTS.url) throw new Error('invalid')
  } catch {
    throw new InvalidBodyError('웹훅 주소가 올바르지 않습니다.')
  }
  const kind = typeof config.kind === 'string' ? config.kind.trim() : config.kind
  if (kind !== undefined && kind !== 'slack' && kind !== 'discord' && kind !== 'generic') throw new InvalidBodyError(INVALID_BODY)
  return { url, ...(kind === undefined ? {} : { kind }) }
}

const validateWebPush = (value: unknown): RecordValue => {
  const config = asRecord(value)
  const keys = config ? asRecord(config.keys) : null
  if (!config || typeof config.endpoint !== 'string' || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    throw new InvalidBodyError('웹푸시 구독 정보가 올바르지 않습니다.')
  }
  const endpoint = config.endpoint.trim()
  if (!endpoint || !keys.p256dh.trim() || !keys.auth.trim()) throw new InvalidBodyError('웹푸시 구독 정보가 올바르지 않습니다.')
  try { if (new URL(endpoint).protocol !== 'https:') throw new Error('invalid') } catch { throw new InvalidBodyError('웹푸시 구독 정보가 올바르지 않습니다.') }
  return {
    endpoint,
    keys: { p256dh: keys.p256dh.trim(), auth: keys.auth.trim() },
    ...(typeof config.userAgent === 'string' ? { userAgent: config.userAgent.trim().slice(0, 100) } : {}),
  }
}

const validateConfig = (type: ChannelType, value: unknown): unknown => {
  if (type === 'email') return { address: validateEmail(asRecord(value)?.address) }
  if (type === 'webhook') return validateWebhook(value)
  if (type === 'webpush') return validateWebPush(value)
  throw new InvalidBodyError('카카오 채널은 카카오 연결 화면에서만 만들 수 있습니다.')
}

export function parseChannelBody(value: unknown, opts: { forCreate: boolean }): ChannelBody {
  const body = asRecord(value)
  if (!body) throw new InvalidBodyError(INVALID_BODY)
  if (opts.forCreate) {
    if (!has(body, 'type') || !has(body, 'label') || !has(body, 'config')) throw new InvalidBodyError(INVALID_BODY)
    const type = channelType(body.type)
    if (type === 'kakao') throw new InvalidBodyError('카카오 채널은 카카오 연결 화면에서만 만들 수 있습니다.')
    const label = textValue(body.label, LIMITS_ALERTS.label)
    const config = validateConfig(type, body.config)
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') throw new InvalidBodyError(INVALID_BODY)
    return { type, label, config, ...(body.enabled === undefined ? {} : { enabled: body.enabled }) }
  }

  if (!has(body, 'label') && !has(body, 'enabled') && !has(body, 'config')) throw new InvalidBodyError(INVALID_BODY)
  if (has(body, 'enabled') && typeof body.enabled !== 'boolean') throw new InvalidBodyError(INVALID_BODY)
  return {
    ...(has(body, 'label') ? { label: textValue(body.label, LIMITS_ALERTS.label) } : {}),
    ...(has(body, 'enabled') ? { enabled: body.enabled as boolean } : {}),
    ...(has(body, 'config') ? { config: body.config } : {}),
  } as ChannelBody
}

const amountValue = (value: unknown): number | null => {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new InvalidBodyError(INVALID_BODY)
  return value
}

export function parseRuleBody(value: unknown, id: string): RuleBody {
  const body = asRecord(value)
  if (!body) throw new InvalidBodyError(INVALID_BODY)
  const required = ['name', 'enabled', 'kinds', 'keywords', 'profileId', 'categoryNames', 'agency', 'amountMin', 'amountMax', 'channelIds', 'digest']
  if (required.some((key) => !has(body, key))) throw new InvalidBodyError(INVALID_BODY)
  const routeId = id.trim()
  if (routeId && !isUuid(routeId)) throw new InvalidBodyError('id가 올바르지 않습니다.')
  if (has(body, 'id') && body.id !== undefined && (typeof body.id !== 'string' || !isUuid(body.id.trim()) || (routeId && body.id.trim() !== routeId))) throw new InvalidBodyError('id가 올바르지 않습니다.')
  if (typeof body.enabled !== 'boolean') throw new InvalidBodyError(INVALID_BODY)

  const kindsRaw = body.kinds
  if (!Array.isArray(kindsRaw)) throw new InvalidBodyError(INVALID_BODY)
  const kinds = unique(kindsRaw.map((kind) => {
    if (typeof kind !== 'string') throw new InvalidBodyError('알림 유형이 올바르지 않습니다.')
    const value = kind.trim() as AlertKind
    if (!KINDS.has(value)) throw new InvalidBodyError('알림 유형이 올바르지 않습니다.')
    return value
  }))
  const keywords = arrayOfText(body.keywords, LIMITS_ALERTS.keywords)
  const categoryNames = arrayOfText(body.categoryNames, LIMITS_ALERTS.categories)
  const name = textValue(body.name, LIMITS_ALERTS.name)
  let profileId: string | null
  if (body.profileId === null) profileId = null
  else if (typeof body.profileId === 'string' && isUuid(body.profileId.trim())) profileId = body.profileId.trim()
  else throw new InvalidBodyError(INVALID_BODY)
  let agency: string | null
  if (body.agency === null) agency = null
  else if (typeof body.agency === 'string') agency = textValue(body.agency, LIMITS_ALERTS.name) || null
  else throw new InvalidBodyError(INVALID_BODY)
  const amountMin = amountValue(body.amountMin)
  const amountMax = amountValue(body.amountMax)
  if (amountMin !== null && amountMax !== null && amountMin > amountMax) throw new InvalidBodyError('최소 금액은 최대 금액보다 클 수 없습니다.')
  if (!Array.isArray(body.channelIds)) throw new InvalidBodyError(INVALID_BODY)
  const channelIds = unique(body.channelIds.map((channelId) => {
    if (typeof channelId !== 'string' || !isUuid(channelId.trim())) throw new InvalidBodyError(INVALID_BODY)
    return channelId.trim()
  }))
  const digest = typeof body.digest === 'string' ? body.digest.trim() : body.digest
  if (digest !== 'instant' && digest !== 'daily') throw new InvalidBodyError('발송 주기가 올바르지 않습니다.')
  return { ...(body.id === undefined ? {} : { id: typeof body.id === 'string' ? body.id.trim() : body.id as string }), name, enabled: body.enabled, kinds, keywords, profileId, categoryNames, agency, amountMin, amountMax, channelIds, digest }
}

const iso = (value: Date): string => value.toISOString()

/** 서버 환경변수로 켜져 있는 채널 종류 — 키가 없는 채널은 설정 화면에서 "준비 중"으로 접힌다 */
export function channelAvailability(env: NodeJS.ProcessEnv = process.env): Record<ChannelType, boolean> {
  return {
    kakao: Boolean(env.KAKAO_REST_API_KEY?.trim()),
    email: Boolean(env.RESEND_API_KEY?.trim() && env.ALERT_FROM_EMAIL?.trim()),
    webhook: true,
    webpush: Boolean(env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim()),
  }
}

export async function loadChannels(db: NaraDb, ctx: OrgContext): Promise<{ channels: AlertChannelView[]; available: Record<ChannelType, boolean> }> {
  const rows = await db.select().from(alertChannels).where(eq(alertChannels.userId, ctx.userId)).orderBy(asc(alertChannels.createdAt), asc(alertChannels.id))
  return { available: channelAvailability(), channels: rows.map((row) => ({ id: row.id, type: row.type as ChannelType, label: row.label, target: channelTarget(row.type as ChannelType, row.config), enabled: row.enabled, createdAt: iso(row.createdAt) })) }
}

const checkChannelLimit = async (db: NaraDb, ctx: OrgContext): Promise<void> => {
  const rows = await db.select({ id: alertChannels.id }).from(alertChannels).where(eq(alertChannels.userId, ctx.userId))
  if (rows.length >= LIMITS_ALERTS.channels) throw new InvalidBodyError('알림 채널은 최대 10개까지 만들 수 있습니다.')
}

export async function createChannel(db: NaraDb, ctx: OrgContext, body: ChannelBody): Promise<{ id: string }> {
  await checkChannelLimit(db, ctx)
  const type = body.type
  if (type === 'kakao') throw new InvalidBodyError('카카오 채널은 카카오 연결 화면에서만 만들 수 있습니다.')
  const config = validateConfig(type, body.config)
  const id = uid()
  await db.insert(alertChannels).values({ id, orgId: ctx.orgId, userId: ctx.userId, type, label: body.label, config, enabled: body.enabled ?? true })
  return { id }
}

export async function updateChannel(db: NaraDb, ctx: OrgContext, id: string, body: ChannelBody): Promise<void> {
  if (!isUuid(id)) throw new InvalidBodyError('id가 올바르지 않습니다.')
  const rows = await db.select().from(alertChannels).where(and(eq(alertChannels.id, id), eq(alertChannels.userId, ctx.userId))).limit(1)
  const existing = rows[0]
  if (!existing) throw new NotFoundError(CHANNEL_NOT_FOUND)
  const patch: { label?: string; enabled?: boolean; config?: unknown; updatedAt: Date } = { updatedAt: new Date() }
  const bodyRecord = body as unknown as RecordValue
  if (has(bodyRecord, 'label')) patch.label = body.label
  if (has(bodyRecord, 'enabled') && typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (has(bodyRecord, 'config')) patch.config = validateConfig(existing.type as ChannelType, body.config)
  const result = await db.update(alertChannels).set(patch).where(and(eq(alertChannels.id, id), eq(alertChannels.userId, ctx.userId))).returning({ id: alertChannels.id })
  if (result.length === 0) throw new NotFoundError(CHANNEL_NOT_FOUND)
}

export async function removeChannel(db: NaraDb, ctx: OrgContext, id: string): Promise<void> {
  if (!isUuid(id)) throw new InvalidBodyError('id가 올바르지 않습니다.')
  const result = await db.delete(alertChannels).where(and(eq(alertChannels.id, id), eq(alertChannels.userId, ctx.userId))).returning({ id: alertChannels.id })
  if (result.length === 0) throw new NotFoundError(CHANNEL_NOT_FOUND)
}

export async function loadChannelForSend(db: NaraDb, ctx: OrgContext, id: string): Promise<NotifyChannel> {
  if (!isUuid(id)) throw new InvalidBodyError('id가 올바르지 않습니다.')
  const rows = await db.select().from(alertChannels).where(and(eq(alertChannels.id, id), eq(alertChannels.userId, ctx.userId))).limit(1)
  const row = rows[0]
  if (!row) throw new NotFoundError(CHANNEL_NOT_FOUND)
  return { id: row.id, userId: row.userId, type: row.type as ChannelType, label: row.label, config: row.config, enabled: row.enabled }
}

export async function saveChannelConfig(db: NaraDb, id: string, config: unknown): Promise<void> {
  await db.update(alertChannels).set({ config, updatedAt: new Date() }).where(eq(alertChannels.id, id))
}

export async function disableChannel(db: NaraDb, id: string): Promise<void> {
  await db.update(alertChannels).set({ enabled: false, updatedAt: new Date() }).where(eq(alertChannels.id, id))
}

export async function upsertKakaoChannel(db: NaraDb, ctx: OrgContext, config: unknown): Promise<{ id: string }> {
  const rows = await db.select({ id: alertChannels.id }).from(alertChannels).where(and(eq(alertChannels.userId, ctx.userId), eq(alertChannels.type, 'kakao'))).orderBy(asc(alertChannels.createdAt)).limit(1)
  const existing = rows[0]
  if (existing) {
    await db.update(alertChannels).set({ config, enabled: true, updatedAt: new Date() }).where(and(eq(alertChannels.id, existing.id), eq(alertChannels.userId, ctx.userId)))
    return { id: existing.id }
  }
  await checkChannelLimit(db, ctx)
  const id = uid()
  await db.insert(alertChannels).values({ id, orgId: ctx.orgId, userId: ctx.userId, type: 'kakao', label: '카카오톡 나에게 보내기', config, enabled: true })
  return { id }
}

export async function upsertWebPushChannel(db: NaraDb, ctx: OrgContext, body: ChannelBody): Promise<{ id: string }> {
  const config = validateWebPush(body.config)
  const endpoint = (config as RecordValue).endpoint
  const rows = await db.select().from(alertChannels).where(and(eq(alertChannels.userId, ctx.userId), eq(alertChannels.type, 'webpush')))
  const existing = rows.find((row) => (asRecord(row.config)?.endpoint) === endpoint)
  if (existing) {
    await db.update(alertChannels).set({ label: body.label, config, enabled: body.enabled ?? true, updatedAt: new Date() }).where(and(eq(alertChannels.id, existing.id), eq(alertChannels.userId, ctx.userId)))
    return { id: existing.id }
  }
  return createChannel(db, ctx, { type: 'webpush', label: body.label, config, ...(body.enabled === undefined ? {} : { enabled: body.enabled }) })
}

const ownedProfile = async (db: NaraDb, ctx: OrgContext, profileId: string | null): Promise<void> => {
  if (!profileId) return
  const rows = await db.select({ id: userProfiles.id }).from(userProfiles).where(and(eq(userProfiles.id, profileId), eq(userProfiles.orgId, ctx.orgId))).limit(1)
  if (!rows[0]) throw new InvalidBodyError('프로필을 찾을 수 없습니다.')
}

const ownedChannels = async (db: NaraDb, ctx: OrgContext, channelIds: string[]): Promise<void> => {
  if (!channelIds.length) return
  const rows = await db.select({ id: alertChannels.id }).from(alertChannels)
    .innerJoin(memberships, and(eq(memberships.userId, alertChannels.userId), eq(memberships.orgId, ctx.orgId)))
    .where(inArray(alertChannels.id, channelIds))
  if (rows.length !== channelIds.length) throw new InvalidBodyError(CHANNEL_NOT_FOUND)
}

export async function loadRules(db: NaraDb, ctx: OrgContext): Promise<{ rules: AlertRuleView[] }> {
  const rows = await db.select().from(alertRules).where(eq(alertRules.orgId, ctx.orgId)).orderBy(desc(alertRules.updatedAt), desc(alertRules.id))
  return { rules: rows.map((row) => ({ id: row.id, name: row.name, enabled: row.enabled, kinds: row.kinds as AlertKind[], keywords: row.keywords, profileId: row.profileId, categoryNames: row.categoryNames, agency: row.agency, amountMin: row.amountMin, amountMax: row.amountMax, channelIds: row.channelIds, digest: row.digest as 'instant' | 'daily', updatedAt: iso(row.updatedAt) })) }
}

const checkRuleLimit = async (db: NaraDb, ctx: OrgContext): Promise<void> => {
  const rows = await db.select({ id: alertRules.id }).from(alertRules).where(eq(alertRules.orgId, ctx.orgId))
  if (rows.length >= LIMITS_ALERTS.rules) throw new InvalidBodyError('알림 규칙은 최대 20개까지 만들 수 있습니다.')
}

export async function createRule(db: NaraDb, ctx: OrgContext, body: RuleBody): Promise<{ id: string }> {
  await checkRuleLimit(db, ctx)
  await ownedProfile(db, ctx, body.profileId)
  await ownedChannels(db, ctx, body.channelIds)
  const id = uid()
  await db.insert(alertRules).values({ id, orgId: ctx.orgId, userId: ctx.userId, name: body.name, enabled: body.enabled, kinds: body.kinds, keywords: body.keywords, profileId: body.profileId, categoryNames: body.categoryNames, agency: body.agency, amountMin: body.amountMin, amountMax: body.amountMax, channelIds: body.channelIds, digest: body.digest })
  return { id }
}

export async function updateRule(db: NaraDb, ctx: OrgContext, id: string, body: RuleBody): Promise<void> {
  if (!isUuid(id)) throw new InvalidBodyError('id가 올바르지 않습니다.')
  await ownedProfile(db, ctx, body.profileId)
  await ownedChannels(db, ctx, body.channelIds)
  const result = await db.update(alertRules).set({ name: body.name, enabled: body.enabled, kinds: body.kinds, keywords: body.keywords, profileId: body.profileId, categoryNames: body.categoryNames, agency: body.agency, amountMin: body.amountMin, amountMax: body.amountMax, channelIds: body.channelIds, digest: body.digest, updatedAt: new Date() }).where(and(eq(alertRules.id, id), eq(alertRules.orgId, ctx.orgId))).returning({ id: alertRules.id })
  if (result.length === 0) throw new NotFoundError(RULE_NOT_FOUND)
}

export async function removeRule(db: NaraDb, ctx: OrgContext, id: string): Promise<void> {
  if (!isUuid(id)) throw new InvalidBodyError('id가 올바르지 않습니다.')
  const result = await db.delete(alertRules).where(and(eq(alertRules.id, id), eq(alertRules.orgId, ctx.orgId))).returning({ id: alertRules.id })
  if (result.length === 0) throw new NotFoundError(RULE_NOT_FOUND)
}
