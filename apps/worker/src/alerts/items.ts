import { and, desc, gt } from 'drizzle-orm'
import { ALERT_KIND_VALUES } from '@nara/api'
import type { AlertKind, Item } from '@nara/api'
import { awards, contracts, notices, prespecs } from '@nara/db'
import type { NaraDb } from '@nara/db'

/**
 * kind별 한 실행에서 볼 최대 행 수. updated_at 내림차순이라 상한을 넘긴 오래된 행은
 * 그 실행에서 빠지고, 다음 실행은 since가 앞으로 당겨져 다시 평가되지 않는다.
 * 대량 백필 직후에는 `worker alerts run --since <백필 시작 시각>`을 나눠 돌린다 —
 * docs/OPERATIONS.md 참고.
 */
export const DEFAULT_MAX_ITEMS = 500

const ALL_KINDS: readonly AlertKind[] = [...ALERT_KIND_VALUES]

const dateValue = (value: unknown): string => {
  if (value == null) return ''
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

const optionalDateValue = (value: unknown): string | undefined => {
  const result = dateValue(value)
  return result || undefined
}

const limitOf = (value: number | undefined): number => {
  if (value == null || !Number.isFinite(value)) return DEFAULT_MAX_ITEMS
  return Math.max(0, Math.floor(value))
}

const noticeItems = async (db: NaraDb, since: Date, limit: number): Promise<Item[]> => {
  const rows = await db.select().from(notices).where(gt(notices.updatedAt, since)).orderBy(desc(notices.updatedAt)).limit(limit)
  return rows.map((row) => ({
    id: `notice-${row.bidNtceNo}-${row.ord}`,
    kind: 'notice',
    noticeNo: row.bidNtceNo,
    title: row.title,
    agency: row.ntceInsttNm ?? '',
    demandAgency: row.dmndInsttNm ?? undefined,
    amount: row.estimatedPrice ?? row.budgetAmt ?? undefined,
    date: dateValue(row.noticeDate),
    deadline: optionalDateValue(row.bidClose),
    url: row.noticeUrl ?? undefined,
  }))
}

/** 사전규격이 본공고로 전환된 것을 처음 관측한 공고. prespec_linked_at 이 since 이후인 행만 본다 */
const prespecLinkItems = async (db: NaraDb, since: Date, limit: number): Promise<Item[]> => {
  const rows = await db.select().from(notices)
    .where(and(gt(notices.updatedAt, since), gt(notices.prespecLinkedAt, since)))
    .orderBy(desc(notices.prespecLinkedAt)).limit(limit)
  return rows.map((row) => ({
    id: `prespec-link-${row.prespecNo}-${row.bidNtceNo}-${row.ord}`,
    kind: 'notice',
    noticeNo: row.bidNtceNo,
    title: row.title,
    agency: row.ntceInsttNm ?? '',
    demandAgency: row.dmndInsttNm ?? undefined,
    amount: row.estimatedPrice ?? row.budgetAmt ?? undefined,
    date: dateValue(row.noticeDate),
    deadline: optionalDateValue(row.bidClose),
    url: row.detailUrl ?? row.noticeUrl ?? undefined,
    transition: {
      prespecNo: row.prespecNo ?? '',
      bidNtceNo: row.bidNtceNo,
      ord: row.ord,
      linkedAt: row.prespecLinkedAt?.toISOString(),
    },
  }))
}

const awardItems = async (db: NaraDb, since: Date, limit: number): Promise<Item[]> => {
  const rows = await db.select().from(awards).where(gt(awards.updatedAt, since)).orderBy(desc(awards.updatedAt)).limit(limit)
  return rows.map((row) => ({
    id: `award-${row.bidNtceNo}-${row.ord}`,
    kind: 'award',
    noticeNo: row.bidNtceNo,
    title: row.title,
    agency: row.ntceInsttNm ?? '',
    demandAgency: row.dmndInsttNm ?? undefined,
    amount: row.finalAmount ?? undefined,
    date: dateValue(row.openingDate),
  }))
}

const contractItems = async (db: NaraDb, since: Date, limit: number): Promise<Item[]> => {
  const rows = await db.select().from(contracts).where(gt(contracts.updatedAt, since)).orderBy(desc(contracts.updatedAt)).limit(limit)
  return rows.map((row) => ({
    id: `contract-${row.cntrctNo}-${row.ord}`,
    kind: 'contract',
    noticeNo: row.bidNtceNo ?? row.cntrctNo,
    title: row.title,
    agency: row.cntrctInsttNm ?? '',
    demandAgency: row.dmndInsttNm ?? undefined,
    amount: row.amount ?? undefined,
    date: dateValue(row.concludeDate),
    url: row.infoUrl ?? row.noticeUrl ?? undefined,
  }))
}

const prespecItems = async (db: NaraDb, since: Date, limit: number): Promise<Item[]> => {
  const rows = await db.select().from(prespecs).where(gt(prespecs.updatedAt, since)).orderBy(desc(prespecs.updatedAt)).limit(limit)
  return rows.map((row) => ({
    id: `prespec-${row.bfSpecRgstNo}`,
    kind: 'prespec',
    noticeNo: row.bfSpecRgstNo,
    title: row.title,
    agency: row.orderInsttNm ?? '',
    demandAgency: row.dminsttNm ?? undefined,
    amount: row.budgetAmt ?? undefined,
    date: dateValue(row.receiptDate),
    deadline: optionalDateValue(row.opinionCloseAt),
  }))
}

/** updated_at > since 인 행을 kind별 최신순으로 읽어 알림에 필요한 Item만 만든다 (kind별 limit 적용 — 상한 의미는 DEFAULT_MAX_ITEMS 주석 참고). */
export async function loadNewItems(db: NaraDb, since: Date, opts?: { kinds?: AlertKind[]; maxItems?: number }): Promise<Item[]> {
  const kinds = opts?.kinds?.length ? [...new Set(opts.kinds)] : [...ALL_KINDS]
  const limit = limitOf(opts?.maxItems)
  const items: Item[] = []
  for (const kind of kinds) {
    const loaded = kind === 'prespec-link' ? await prespecLinkItems(db, since, limit)
      : kind === 'notice' ? await noticeItems(db, since, limit)
      : kind === 'award' ? await awardItems(db, since, limit)
      : kind === 'contract' ? await contractItems(db, since, limit)
      : await prespecItems(db, since, limit)
    items.push(...loaded)
  }
  return items
}
