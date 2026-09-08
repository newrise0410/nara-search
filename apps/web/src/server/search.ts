import { NaraApiError, addDays, addMonths, isYmd, searchPrespec } from '@nara/api'
import type { Bidder, ConvertedNotice, SearchKind } from '@nara/api'
import { and, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import { awards, bidders, companies, contracts, notices, prespecDocs, prespecProducts, prespecs } from '@nara/db'
import type { NaraDb } from '@nara/db'
import type { SearchPage, SearchParams, SearchResponse, SearchSort } from '@/lib/api-types'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SEARCH_SORTS } from '@/lib/api-types'
import { ensureNaraConfigured } from './nara'
import { attachAwardStats } from './bid-range'
import { LIVE_MAX_MONTHS, searchLive } from './live'
import { pageOf, sliceItems, sortItems } from './paging'
import { awardRowToItem, contractRowToItem, noticeRowToItem, prespecRowToItem } from './rows'

const SEARCH_KINDS: readonly SearchKind[] = ['award', 'notice', 'prespec', 'contract']
const BIZ_DIVS = ['all', 'Thng', 'Servc', 'Cnstwk', 'Frgcpt'] as const

/** 400으로 변환되는 파라미터 오류 */
export class ParamError extends Error {}

function requiredDate(sp: URLSearchParams, name: string): string {
  const value = sp.get(name)
  if (!isYmd(value)) throw new ParamError(`${name}은 YYYY-MM-DD 형식이어야 합니다.`)
  return value
}

function integerParam(sp: URLSearchParams, name: string, fallback: number, min: number, max?: number): number {
  const raw = sp.get(name)
  if (raw == null) return fallback
  if (!/^\d+$/.test(raw)) throw new ParamError(`${name}은 정수여야 합니다.`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < min || (max != null && value > max)) throw new ParamError(`${name}의 범위가 올바르지 않습니다.`)
  return value
}

/** URLSearchParams → SearchParams. 잘못된 값은 ParamError */
export function parseSearchParams(sp: URLSearchParams): SearchParams {
  const rawKind = sp.get('kind')
  if (!SEARCH_KINDS.includes(rawKind as SearchKind)) throw new ParamError('kind가 올바르지 않습니다.')
  const from = requiredDate(sp, 'from')
  const to = requiredDate(sp, 'to')
  if (from > to) throw new ParamError('from은 to보다 늦을 수 없습니다.')
  const rawBizDiv = sp.get('bizDiv') ?? 'all'
  if (!BIZ_DIVS.includes(rawBizDiv as typeof BIZ_DIVS[number])) throw new ParamError('bizDiv가 올바르지 않습니다.')
  const rawSort = sp.get('sort') ?? 'default'
  if (!SEARCH_SORTS.includes(rawSort as SearchSort)) throw new ParamError('sort가 올바르지 않습니다.')
  const keyword = (sp.get('keyword') ?? '').trim()
  const rawSource = sp.get('source') ?? 'db'
  if (rawSource !== 'db' && rawSource !== 'live') throw new ParamError('source가 올바르지 않습니다.')
  if (rawSource === 'live') {
    if (rawKind !== 'notice') throw new ParamError('나라장터 실시간 조회는 입찰공고만 지원합니다. 낙찰 실시간 조회는 낙찰정보서비스 승인 후 지원합니다.')
    if (keyword.length < 2) throw new ParamError('나라장터 실시간 조회에는 검색어가 필요합니다.')
    if (to > addDays(addMonths(from, LIVE_MAX_MONTHS), -1)) throw new ParamError('나라장터 실시간 조회는 최대 12개월까지 조회할 수 있습니다.')
  }
  return {
    kind: rawKind as SearchKind,
    keyword,
    agency: (sp.get('agency') ?? '').trim(),
    bizDiv: rawBizDiv as SearchParams['bizDiv'],
    from,
    to,
    page: integerParam(sp, 'page', 1, 1),
    pageSize: integerParam(sp, 'pageSize', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    sort: rawSort as SearchSort,
    source: rawSource,
  }
}

export function likePattern(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  return `%${escaped}%`
}

function numberOf(value: unknown): number {
  return Number(value ?? 0)
}

function dateKey(value: unknown): string {
  if (value == null) return ''
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function bidderKey(no: string, ord: string, date: unknown): string {
  return `${no}\u0000${ord}\u0000${dateKey(date)}`
}

async function awardBidders(db: NaraDb, rows: (typeof awards.$inferSelect)[]): Promise<Map<string, Bidder[]>> {
  const nos = [...new Set(rows.map((row) => row.bidNtceNo))]
  const dates = [...new Set(rows.map((row) => dateKey(row.openingDate)))]
  if (rows.length === 0) return new Map()
  const joined = await db.select({
    bidNtceNo: bidders.bidNtceNo,
    awardOrd: bidders.awardOrd,
    openingDate: bidders.openingDate,
    bizNo: bidders.bizNo,
    rank: bidders.rank,
    amount: bidders.amount,
    rate: bidders.rate,
    bidDate: bidders.bidDate,
    won: bidders.won,
    disqualifiedReason: bidders.disqualifiedReason,
    result: bidders.result,
    companyName: companies.name,
    companyCeo: companies.ceo,
  }).from(bidders).leftJoin(companies, eq(bidders.bizNo, companies.bizNo)).where(and(inArray(bidders.bidNtceNo, nos), inArray(bidders.openingDate, dates)))
  const result = new Map<string, Bidder[]>()
  for (const row of rows) {
    const key = bidderKey(row.bidNtceNo, row.ord, row.openingDate)
    const matches = joined.filter((candidate) => bidderKey(candidate.bidNtceNo, candidate.awardOrd, candidate.openingDate) === key)
      .sort((a, b) => a.rank - b.rank || (a.companyName ?? a.bizNo).localeCompare(b.companyName ?? b.bizNo))
      .map((candidate) => ({
        rank: candidate.rank,
        name: candidate.companyName || candidate.bizNo || '',
        bizNo: candidate.bizNo,
        ceo: candidate.companyCeo ?? undefined,
        amount: candidate.amount ?? undefined,
        rate: candidate.rate ?? undefined,
        date: dateKey(candidate.bidDate) || undefined,
        won: candidate.won,
        disqualifiedReason: candidate.disqualifiedReason ?? undefined,
        result: candidate.result ?? undefined,
      }))
    result.set(key, matches)
  }
  return result
}

async function prespecRelations(db: NaraDb, rows: (typeof prespecs.$inferSelect)[]) {
  const ids = [...new Set(rows.map((row) => row.bfSpecRgstNo))]
  if (rows.length === 0) return { docs: new Map<string, string[]>(), products: new Map<string, { seq: number; code: string; name: string }[]>() }
  const docRows = await db.select({ id: prespecDocs.bfSpecRgstNo, seq: prespecDocs.seq, url: prespecDocs.url })
    .from(prespecDocs).where(inArray(prespecDocs.bfSpecRgstNo, ids)).orderBy(prespecDocs.seq)
  const productRows = await db.select({ id: prespecProducts.bfSpecRgstNo, seq: prespecProducts.seq, code: prespecProducts.code, name: prespecProducts.name })
    .from(prespecProducts).where(inArray(prespecProducts.bfSpecRgstNo, ids)).orderBy(prespecProducts.seq)
  const docs = new Map<string, string[]>()
  for (const row of docRows) docs.set(row.id, [...(docs.get(row.id) ?? []), row.url])
  const products = new Map<string, { seq: number; code: string; name: string }[]>()
  for (const row of productRows) products.set(row.id, [...(products.get(row.id) ?? []), { seq: row.seq, code: row.code, name: row.name }])
  return { docs, products }
}

const conversionKey = (bidNtceNo: string, ord: string): string => `${bidNtceNo}\u0000${ord}`

/**
 * 사전규격 페이지에 연결된 본공고를 정·역방향 합쳐 구한다.
 * 정방향(주 경로): notices.prespec_no = prespecs.bf_spec_rgst_no — notices_prespec_no_idx 사용
 * 역방향(보조): notices.bid_ntce_no ∈ prespecs.related_notice_nos — PK 인덱스 사용
 */
async function prespecConversions(db: NaraDb, rows: (typeof prespecs.$inferSelect)[]): Promise<Map<string, ConvertedNotice[]>> {
  const result = new Map<string, ConvertedNotice[]>()
  if (rows.length === 0) return result
  const ids = [...new Set(rows.map((row) => row.bfSpecRgstNo))]
  const relatedNos = [...new Set(rows.flatMap((row) => row.relatedNoticeNos ?? []))]
  const conditions = [inArray(notices.prespecNo, ids)]
  if (relatedNos.length) conditions.push(inArray(notices.bidNtceNo, relatedNos))
  const found = await db.select({
    bidNtceNo: notices.bidNtceNo, ord: notices.ord, title: notices.title,
    noticeDate: notices.noticeDate, prespecNo: notices.prespecNo,
  }).from(notices).where(or(...conditions)).orderBy(notices.bidNtceNo, notices.ord)
  for (const row of rows) {
    const related = new Set(row.relatedNoticeNos ?? [])
    const seen = new Set<string>()
    const list: ConvertedNotice[] = []
    for (const notice of found) {
      if (notice.prespecNo !== row.bfSpecRgstNo && !related.has(notice.bidNtceNo)) continue
      const key = conversionKey(notice.bidNtceNo, notice.ord)
      if (seen.has(key)) continue
      seen.add(key)
      list.push({ bidNtceNo: notice.bidNtceNo, ord: notice.ord, title: notice.title, noticeDate: dateKey(notice.noticeDate) || undefined })
    }
    if (list.length) result.set(row.bfSpecRgstNo, list)
  }
  return result
}

/** DB만 조회한다(폴백 없음). 테스트가 직접 부르는 순수 함수 */
export async function searchDb(db: NaraDb, p: SearchParams): Promise<SearchPage> {
  if (p.kind === 'notice') {
    const conditions = [gte(notices.noticeDate, p.from), lte(notices.noticeDate, p.to)]
    if (p.keyword) conditions.push(or(ilike(notices.title, likePattern(p.keyword)), ilike(notices.ntceInsttNm, likePattern(p.keyword)), ilike(notices.dmndInsttNm, likePattern(p.keyword)), ilike(notices.bidNtceNo, likePattern(p.keyword)))!)
    if (p.agency) conditions.push(or(ilike(notices.ntceInsttNm, likePattern(p.agency)), ilike(notices.dmndInsttNm, likePattern(p.agency)))!)
    const where = and(...conditions)
    const amount = sql<number>`coalesce(${notices.estimatedPrice}, ${notices.budgetAmt})`
    const order = p.sort === 'amountDesc'
      ? [sql`${amount} desc nulls last`, sql`${notices.noticeDate} desc nulls last`, sql`${notices.bidNtceNo} asc`, sql`${notices.ord} asc`]
      : p.sort === 'amountAsc'
        ? [sql`${amount} asc nulls last`, sql`${notices.noticeDate} desc nulls last`, sql`${notices.bidNtceNo} asc`, sql`${notices.ord} asc`]
        : p.sort === 'deadline'
          ? [sql`${notices.bidClose} asc nulls last`, sql`${notices.noticeDate} desc nulls last`, sql`${notices.bidNtceNo} asc`, sql`${notices.ord} asc`]
          : [sql`${notices.noticeDate} desc nulls last`, sql`${notices.bidNtceNo} asc`, sql`${notices.ord} asc`]
    const rows = await db.select().from(notices).where(where).orderBy(...order).limit(p.pageSize).offset((p.page - 1) * p.pageSize)
    const countRows = await db.select({ n: sql<number>`count(*)::int` }).from(notices).where(where)
    return pageOf(rows.map(noticeRowToItem), p, numberOf(countRows[0]?.n))
  }

  if (p.kind === 'award') {
    const conditions = [gte(awards.openingDate, p.from), lte(awards.openingDate, p.to)]
    if (p.bizDiv !== 'all') conditions.push(eq(awards.bizDivKey, p.bizDiv))
    if (p.keyword) conditions.push(or(ilike(awards.title, likePattern(p.keyword)), ilike(awards.ntceInsttNm, likePattern(p.keyword)), ilike(awards.dmndInsttNm, likePattern(p.keyword)), ilike(awards.bidNtceNo, likePattern(p.keyword)))!)
    if (p.agency) conditions.push(or(ilike(awards.ntceInsttNm, likePattern(p.agency)), ilike(awards.dmndInsttNm, likePattern(p.agency)))!)
    const where = and(...conditions)
    const order = p.sort === 'amountDesc'
      ? [sql`${awards.finalAmount} desc nulls last`, sql`${awards.openingDate} desc nulls last`, sql`${awards.bidNtceNo} asc`, sql`${awards.ord} asc`, sql`${awards.openingDate} asc`]
      : p.sort === 'amountAsc'
        ? [sql`${awards.finalAmount} asc nulls last`, sql`${awards.openingDate} desc nulls last`, sql`${awards.bidNtceNo} asc`, sql`${awards.ord} asc`, sql`${awards.openingDate} asc`]
        : [sql`${awards.openingDate} desc nulls last`, sql`${awards.bidNtceNo} asc`, sql`${awards.ord} asc`, sql`${awards.openingDate} asc`]
    const rows = await db.select().from(awards).where(where).orderBy(...order).limit(p.pageSize).offset((p.page - 1) * p.pageSize)
    const countRows = await db.select({ n: sql<number>`count(*)::int` }).from(awards).where(where)
    const joined = await awardBidders(db, rows)
    return pageOf(rows.map((row) => awardRowToItem(row, joined.get(bidderKey(row.bidNtceNo, row.ord, row.openingDate)) ?? [])), p, numberOf(countRows[0]?.n))
  }

  if (p.kind === 'contract') {
    const conditions = [gte(contracts.concludeDate, p.from), lte(contracts.concludeDate, p.to)]
    if (p.keyword) conditions.push(or(ilike(contracts.title, likePattern(p.keyword)), ilike(contracts.cntrctInsttNm, likePattern(p.keyword)), ilike(contracts.dmndInsttNm, likePattern(p.keyword)), ilike(contracts.cntrctNo, likePattern(p.keyword)), ilike(contracts.bidNtceNo, likePattern(p.keyword)))!)
    if (p.agency) conditions.push(or(ilike(contracts.cntrctInsttNm, likePattern(p.agency)), ilike(contracts.dmndInsttNm, likePattern(p.agency)))!)
    const where = and(...conditions)
    const order = p.sort === 'amountDesc'
      ? [sql`${contracts.amount} desc nulls last`, sql`${contracts.concludeDate} desc nulls last`, sql`${contracts.cntrctNo} asc`, sql`${contracts.ord} asc`]
      : p.sort === 'amountAsc'
        ? [sql`${contracts.amount} asc nulls last`, sql`${contracts.concludeDate} desc nulls last`, sql`${contracts.cntrctNo} asc`, sql`${contracts.ord} asc`]
        : [sql`${contracts.concludeDate} desc nulls last`, sql`${contracts.cntrctNo} asc`, sql`${contracts.ord} asc`]
    const rows = await db.select().from(contracts).where(where).orderBy(...order).limit(p.pageSize).offset((p.page - 1) * p.pageSize)
    const countRows = await db.select({ n: sql<number>`count(*)::int` }).from(contracts).where(where)
    return pageOf(rows.map(contractRowToItem), p, numberOf(countRows[0]?.n))
  }

  const conditions = [gte(prespecs.receiptDate, p.from), lte(prespecs.receiptDate, p.to)]
  if (p.bizDiv !== 'all') conditions.push(eq(prespecs.bizDivKey, p.bizDiv))
  if (p.keyword) conditions.push(or(ilike(prespecs.title, likePattern(p.keyword)), ilike(prespecs.orderInsttNm, likePattern(p.keyword)), ilike(prespecs.dminsttNm, likePattern(p.keyword)), ilike(prespecs.bfSpecRgstNo, likePattern(p.keyword)), ilike(prespecs.refNo, likePattern(p.keyword)))!)
  if (p.agency) conditions.push(or(ilike(prespecs.orderInsttNm, likePattern(p.agency)), ilike(prespecs.dminsttNm, likePattern(p.agency)))!)
  const where = and(...conditions)
  const order = p.sort === 'amountDesc'
    ? [sql`${prespecs.budgetAmt} desc nulls last`, sql`${prespecs.receiptDate} desc nulls last`, sql`${prespecs.bfSpecRgstNo} asc`]
    : p.sort === 'amountAsc'
      ? [sql`${prespecs.budgetAmt} asc nulls last`, sql`${prespecs.receiptDate} desc nulls last`, sql`${prespecs.bfSpecRgstNo} asc`]
      : p.sort === 'deadline'
        ? [sql`${prespecs.opinionCloseAt} asc nulls last`, sql`${prespecs.receiptDate} desc nulls last`, sql`${prespecs.bfSpecRgstNo} asc`]
        : [sql`${prespecs.receiptDate} desc nulls last`, sql`${prespecs.bfSpecRgstNo} asc`]
  const rows = await db.select().from(prespecs).where(where).orderBy(...order).limit(p.pageSize).offset((p.page - 1) * p.pageSize)
  const countRows = await db.select({ n: sql<number>`count(*)::int` }).from(prespecs).where(where)
  const relations = await prespecRelations(db, rows)
  const conversions = await prespecConversions(db, rows)
  return pageOf(rows.map((row) => prespecRowToItem(row, relations.docs.get(row.bfSpecRgstNo) ?? [], relations.products.get(row.bfSpecRgstNo) ?? [], conversions.get(row.bfSpecRgstNo) ?? [])), p, numberOf(countRows[0]?.n))
}

/** 사전규격 DB 미적재분 폴백 — 조달청 API를 서버에서 호출해 같은 페이지 형태로 만든다 */
export async function searchPrespecFallback(p: SearchParams): Promise<SearchPage> {
  if (!ensureNaraConfigured()) throw new NaraApiError('10')
  const items = await searchPrespec({
    bizDiv: p.bizDiv,
    from: p.from,
    to: p.to,
    keyword: p.keyword || undefined,
    ntceInsttNm: p.agency || undefined,
  })
  return sliceItems(sortItems(items, p.sort), p)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 라우트가 쓰는 진입점: searchDb + (kind==='prespec' && total===0) 폴백 */
export async function searchItems(db: NaraDb, p: SearchParams): Promise<SearchResponse> {
  let response: SearchResponse
  if (p.source === 'live') {
    response = await searchLive(db, p)
  } else {
    const page = await searchDb(db, p)
    if (p.kind !== 'prespec' || page.total > 0) response = { ...page, source: 'db' }
    else {
      try {
        response = { ...(await searchPrespecFallback(p)), source: 'nara-api' }
      } catch (error) {
        response = { ...page, source: 'db', warnings: [`사전규격 실시간 조회 실패: ${messageOf(error)}`] }
      }
    }
  }
  let awardStats: SearchResponse['awardStats']
  try {
    awardStats = await attachAwardStats(db, response.items)
  } catch {
    return response
  }
  return awardStats ? { ...response, awardStats } : response
}
