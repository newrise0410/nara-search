import { and, eq, gt, inArray, isNotNull, max, sql } from 'drizzle-orm'
import { loadNotifyEnv } from '../notify/env'
import { sendToChannel } from '../notify'
import { notifyAdmin } from '../ops/notify-admin'
import type { NotifyEnv } from '../notify/env'
import type { AlertMessage, ChannelType, NotifyChannel, SendFn, SendResult } from '../notify/types'
import { alertChannels, alertDeliveries, alertRules, alertRuns, memberships, userProfiles } from '@nara/db'
import { ALERT_KIND_VALUES } from '@nara/api'
import type { AlertKind, Category, Item, Profile } from '@nara/api'
import type { NaraDb } from '@nara/db'
import { buildMessage } from './message'
import { loadNewItems } from './items'
import { matchItems } from './match'
import type { AlertRule, AlertsRunResult, Digest } from './types'

/** 마지막 실행 이력이 없을 때 되돌아볼 시간 */
export const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000
/** 직전 실행 종료 시각에서 이만큼 겹쳐서 본다(경계 유실 방지). */
export const OVERLAP_MS = 10 * 60 * 1000
/** digest='daily' 규칙이 다시 발송되기까지의 최소 간격 */
export const DAILY_INTERVAL_HOURS = 20

export interface RunAlertsOptions {
  db: NaraDb
  /** 지정하면 alert_runs 이력을 무시하고 이 시각을 기준으로 삼는다. */
  since?: Date
  /** true면 채널 발송도, alert_deliveries 기록도 하지 않는다. */
  dryRun?: boolean
  /** kind별 항목 상한. 기본 DEFAULT_MAX_ITEMS(500). */
  maxItems?: number
  now?: () => Date
  env?: NotifyEnv
  /** 테스트 주입. 미지정이면 sendToChannel(channel, message, env). */
  send?: SendFn
  /** 테스트 주입. 미지정이면 ops/notify-admin의 notifyAdmin */
  notifyAdmin?: (title: string, text: string) => Promise<unknown>
}

const CLAIM_BATCH_SIZE = 200
type AlertRuleRow = typeof alertRules.$inferSelect
type AlertChannelRow = typeof alertChannels.$inferSelect
type ProfileRow = typeof userProfiles.$inferSelect

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 1024)

const chunks = <T>(values: T[], size: number): T[][] => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size))

const profileOf = (row: ProfileRow | undefined): Profile | undefined => {
  if (!row) return undefined
  return {
    id: row.id,
    name: row.name,
    ...(row.description == null ? {} : { description: row.description }),
    categories: Array.isArray(row.categories) ? row.categories as Category[] : [],
    requirementKeywords: row.requirementKeywords ?? [],
    defaultKeywords: row.defaultKeywords ?? [],
  }
}

const ruleOf = (row: AlertRuleRow): AlertRule => ({
  id: row.id,
  orgId: row.orgId,
  userId: row.userId,
  name: row.name,
  enabled: row.enabled,
  kinds: row.kinds.filter((kind): kind is AlertKind => ALERT_KIND_VALUES.includes(kind as AlertKind)),
  keywords: row.keywords,
  profileId: row.profileId,
  categoryNames: row.categoryNames,
  agency: row.agency,
  amountMin: row.amountMin,
  amountMax: row.amountMax,
  channelIds: row.channelIds,
  digest: row.digest as Digest,
})

const channelOf = (row: AlertChannelRow): NotifyChannel => ({
  id: row.id,
  userId: row.userId,
  type: row.type as ChannelType,
  label: row.label,
  config: row.config,
  enabled: row.enabled,
})

async function claimItems(db: NaraDb, ruleId: string, channelId: string, items: Item[]): Promise<Set<string>> {
  const claimed = new Set<string>()
  for (const batch of chunks(items, CLAIM_BATCH_SIZE)) {
    const rows = await db.insert(alertDeliveries).values(batch.map((item) => ({
      ruleId, itemId: item.id, channelId, status: 'pending',
    }))).onConflictDoNothing().returning({ itemId: alertDeliveries.itemId })
    for (const row of rows) claimed.add(row.itemId)
  }
  return claimed
}

async function markSent(db: NaraDb, ruleId: string, channelId: string, itemIds: string[]): Promise<void> {
  await db.update(alertDeliveries).set({ status: 'sent', sentAt: sql`now()` }).where(and(
    eq(alertDeliveries.ruleId, ruleId), eq(alertDeliveries.channelId, channelId), inArray(alertDeliveries.itemId, itemIds),
  ))
}

async function removeClaims(db: NaraDb, ruleId: string, channelId: string, itemIds: string[]): Promise<void> {
  await db.delete(alertDeliveries).where(and(
    eq(alertDeliveries.ruleId, ruleId), eq(alertDeliveries.channelId, channelId), inArray(alertDeliveries.itemId, itemIds),
  ))
}

async function hasRecentDailyDelivery(db: NaraDb, ruleId: string, startedAt: Date): Promise<boolean> {
  const cutoff = new Date(startedAt.getTime() - DAILY_INTERVAL_HOURS * 60 * 60 * 1000)
  const rows = await db.select({ id: alertDeliveries.id }).from(alertDeliveries).where(and(
    eq(alertDeliveries.ruleId, ruleId), eq(alertDeliveries.status, 'sent'), gt(alertDeliveries.sentAt, cutoff),
  )).limit(1)
  return rows.length > 0
}

async function previousFinishedAt(db: NaraDb, runId: number): Promise<Date | undefined> {
  const rows = await db.select({ finishedAt: max(alertRuns.finishedAt) }).from(alertRuns).where(and(
    isNotNull(alertRuns.finishedAt), sql`${alertRuns.id} <> ${runId}`,
  ))
  const value = rows[0]?.finishedAt
  return value == null ? undefined : new Date(value)
}

const claimError = (error: unknown): SendResult => ({ ok: false, error: messageOf(error) })

/** 활성 규칙을 평가하고 채널별로 중복 없이 발송한다. */
export async function runAlerts(opts: RunAlertsOptions): Promise<AlertsRunResult> {
  const startedWall = Date.now()
  const now = opts.now ?? (() => new Date())
  const startedAt = now()
  let since = opts.since ?? new Date(startedAt.getTime() - DEFAULT_LOOKBACK_MS)
  const result: AlertsRunResult = {
    since: since.toISOString(), rules: 0, candidates: 0, matched: 0, sent: 0, skipped: 0, failed: 0, elapsedMs: 0,
  }
  let runId: number | undefined
  let firstError: string | undefined
  const env = opts.env ?? loadNotifyEnv()
  const send = opts.send ?? ((channel: NotifyChannel, message: AlertMessage) => sendToChannel(channel, message, env))

  const rememberError = (error: unknown): void => { if (!firstError) firstError = messageOf(error) }

  try {
    const inserted = await opts.db.insert(alertRuns).values({ startedAt }).returning({ id: alertRuns.id })
    runId = inserted[0]?.id
    if (runId == null) throw new Error('알림 실행 이력을 만들지 못했습니다.')

    if (!opts.since) {
      const previous = await previousFinishedAt(opts.db, runId)
      if (previous) since = new Date(previous.getTime() - OVERLAP_MS)
    }
    const oldest = new Date(startedAt.getTime() - 7 * 24 * 60 * 60 * 1000)
    if (since < oldest) since = oldest
    result.since = since.toISOString()

    const dailySince = new Date(startedAt.getTime() - DEFAULT_LOOKBACK_MS)
    const instantItems = await loadNewItems(opts.db, since, { maxItems: opts.maxItems })
    const dailyItems = dailySince < since
      ? await loadNewItems(opts.db, dailySince, { maxItems: opts.maxItems })
      : instantItems
    result.candidates = instantItems.length

    const ruleRows = await opts.db.select().from(alertRules).where(eq(alertRules.enabled, true))
    result.rules = ruleRows.length
    const rules = ruleRows.map(ruleOf)
    const profiles = new Map<string, Profile | undefined>()
    for (const rule of rules) {
      if (!rule.profileId || profiles.has(rule.profileId)) continue
      const rows = await opts.db.select().from(userProfiles).where(and(eq(userProfiles.id, rule.profileId), eq(userProfiles.orgId, rule.orgId))).limit(1)
      profiles.set(rule.profileId, profileOf(rows[0]))
    }

    const channelRows = await opts.db.select().from(alertChannels).where(eq(alertChannels.enabled, true))
    const channels = new Map(channelRows.map((row) => [row.id, channelOf(row)]))
    const membershipRows = await opts.db.select({ orgId: memberships.orgId, userId: memberships.userId }).from(memberships)
    const orgMembers = new Map<string, Set<string>>()
    for (const row of membershipRows) {
      const set = orgMembers.get(row.orgId) ?? new Set<string>()
      set.add(row.userId)
      orgMembers.set(row.orgId, set)
    }

    for (const rule of rules) {
      if (rule.digest === 'daily' && await hasRecentDailyDelivery(opts.db, rule.id, startedAt)) continue
      const pool = rule.digest === 'daily' ? dailyItems : instantItems
      const hits = matchItems(pool, rule, rule.profileId ? profiles.get(rule.profileId) : undefined)
      result.matched += hits.length
      if (!hits.length || opts.dryRun) continue

      // 규칙은 org 공유다 — 규칙 작성자가 아니라 "채널 소유자가 이 org의 멤버인가"로 거른다
      const members = orgMembers.get(rule.orgId)
      const ruleChannels = rule.channelIds
        .map((channelId) => channels.get(channelId))
        .filter((channel): channel is NotifyChannel => !!channel && Boolean(members?.has(channel.userId)))
      for (const channel of ruleChannels) {
        let claimed = new Set<string>()
        try {
          claimed = await claimItems(opts.db, rule.id, channel.id, hits)
          result.skipped += hits.length - claimed.size
          if (claimed.size === 0) continue
          const message = buildMessage(rule, hits.filter((item) => claimed.has(item.id)), { appUrl: env.appUrl })
          let sent: SendResult
          try { sent = await send(channel, message) } catch (error) { sent = claimError(error) }
          if (sent.ok) {
            await markSent(opts.db, rule.id, channel.id, [...claimed])
            result.sent++
            if (sent.config !== undefined) {
              await opts.db.update(alertChannels).set({ config: sent.config, updatedAt: sql`now()` }).where(eq(alertChannels.id, channel.id))
            }
          } else {
            await removeClaims(opts.db, rule.id, channel.id, [...claimed])
            result.failed++
            rememberError(sent.error ?? '알림 발송에 실패했습니다.')
            if (sent.gone) await opts.db.update(alertChannels).set({ enabled: false, updatedAt: sql`now()` }).where(eq(alertChannels.id, channel.id))
          }
        } catch (error) {
          if (claimed.size > 0) {
            try { await removeClaims(opts.db, rule.id, channel.id, [...claimed]) } catch (cleanupError) { rememberError(cleanupError) }
          }
          result.failed++
          rememberError(error)
        }
      }
    }
  } catch (error) {
    result.failed = Math.max(1, result.failed)
    rememberError(error)
  }

  if (runId != null) {
    try {
      await opts.db.update(alertRuns).set({ finishedAt: sql`now()`, matched: result.matched, sent: result.sent, failed: result.failed, error: firstError ?? null }).where(eq(alertRuns.id, runId))
    } catch (error) {
      result.failed = Math.max(1, result.failed)
      rememberError(error)
    }
  }
  if (result.failed > 0 || firstError) {
    const notify = opts.notifyAdmin ?? notifyAdmin
    const lines = [
      `실패 ${result.failed}건 · 발송 ${result.sent}건 · 매칭 ${result.matched}건 · 규칙 ${result.rules}개`,
      `기준 시각 ${result.since}`,
      ...(firstError ? [`첫 오류: ${firstError.slice(0, 300)}`] : []),
    ]
    try { await notify('[나라장터] 알림 실행 실패', lines.join('\n')) } catch { /* 관리자 알림 실패는 무시한다 */ }
  }
  result.elapsedMs = Date.now() - startedWall
  return result
}
