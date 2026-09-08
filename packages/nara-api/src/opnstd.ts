/**
 * 나라장터 공공데이터개방표준서비스 (PubDataOpnStdService v1.2)
 * 명세: docs/api/opnstd.md
 * 검색 파라미터가 날짜 범위(+낙찰 업무구분)뿐이므로 청킹 → 병렬 호출 → 캐시 → 클라이언트 필터 구조.
 */
import type { Bidder, Item, PrespecBizDiv } from './types'
import { cached, day, fetchAll, num, runPool, str, yn } from './common'
import { naraConfig, serviceKey } from './config'
import { byDateDesc, chunkRange, compact } from './date'

export const OPNSTD_PAGE_SIZE = 999
/** 청크당 최대 페이지. 2026-08 실측: 낙찰 공사 하루 ≈ 78페이지(77,867행) → 낙찰은 넉넉히. */
export const MAX_PAGES: Record<'notice' | 'award' | 'contract', number> = { notice: 60, award: 150, contract: 60 }
/**
 * 실측 기반 청크당 평균 요청 수 (2026-08-26 기준, numOfRows=999)
 * - 입찰공고 1개월 ≈ 36,000건 → 37페이지 / 계약 1주 ≈ 27,000건 → 28페이지
 * - 낙찰 1일(투찰업체 행): 물품 23,373 / 공사 77,867 / 용역 9,749 / 외자 4
 */
export const TYPICAL_PAGES = { notice: 37, contract: 28, award: { Thng: 24, Cnstwk: 78, Servc: 10, Frgcpt: 1 } as Record<PrespecBizDiv, number> }
const CONCURRENCY = 4

/** done/total은 청크 단위, requests는 실제 HTTP 요청 누계 */
export interface Progress { done: number; total: number; requests: number }
export interface FetchOpts { signal?: AbortSignal; onProgress?: (p: Progress) => void }
export interface Collected<T> { items: T[]; truncated: number; requests: number }

/** 낙찰 API 업무구분코드: 1 물품, 2 외자, 3 공사, 5 용역 */
export const BSNS_DIV_CD: Record<PrespecBizDiv, string> = { Thng: '1', Frgcpt: '2', Cnstwk: '3', Servc: '5' }
export const BSNS_DIV_NM: Record<PrespecBizDiv, string> = { Thng: '물품', Frgcpt: '외자', Cnstwk: '공사', Servc: '용역' }

const base = () => new URLSearchParams({ ServiceKey: serviceKey(), type: 'json', numOfRows: String(OPNSTD_PAGE_SIZE) })
const dt = (d: string, end = false) => compact(d) + (end ? '2359' : '0000')
const opnstdBase = () => `${naraConfig().baseUrl}/ao/PubDataOpnStdService`

/** getDataSetOpnStdBidPblancInfo — from/to는 'YYYY-MM-DD', 최대 1개월 */
export function noticeUrl(from: string, to: string): (pageNo: number) => string {
  return (pageNo) => {
    const p = base(); p.set('pageNo', String(pageNo)); p.set('bidNtceBgnDt', dt(from)); p.set('bidNtceEndDt', dt(to, true))
    return `${opnstdBase()}/getDataSetOpnStdBidPblancInfo?${p}`
  }
}

/** getDataSetOpnStdScsbidInfo — date는 'YYYY-MM-DD' 단일일자 */
export function awardUrl(bizDiv: PrespecBizDiv, date: string): (pageNo: number) => string {
  return (pageNo) => {
    const p = base(); p.set('pageNo', String(pageNo)); p.set('bsnsDivCd', BSNS_DIV_CD[bizDiv]); p.set('opengBgnDt', dt(date)); p.set('opengEndDt', dt(date, true))
    return `${opnstdBase()}/getDataSetOpnStdScsbidInfo?${p}`
  }
}

/** getDataSetOpnStdCntrctInfo — from/to는 'YYYY-MM-DD', 최대 1주 */
export function contractUrl(from: string, to: string, opts: { insttDivCd?: '1' | '2'; insttCd?: string } = {}): (pageNo: number) => string {
  return (pageNo) => {
    const p = base(); p.set('pageNo', String(pageNo)); p.set('cntrctCnclsBgnDate', compact(from)); p.set('cntrctCnclsEndDate', compact(to))
    if (opts.insttDivCd && opts.insttCd) { p.set('insttDivCd', opts.insttDivCd); p.set('insttCd', opts.insttCd) }
    return `${opnstdBase()}/getDataSetOpnStdCntrctInfo?${p}`
  }
}

/** 청크별 캐시된 목록을 병렬로 모아 합친다. 절단된 청크 수와 요청 수를 함께 돌려준다. */
async function collect<T>(kind: 'notice' | 'award' | 'contract', keys: string[], endOf: (key: string) => string, build: (key: string) => (pageNo: number) => string, opts: FetchOpts): Promise<Collected<T>> {
  let done = 0, requests = 0
  const emit = () => opts.onProgress?.({ done, total: keys.length, requests })
  const tasks = keys.map((k) => () => cached<T>(k, endOf(k), () => fetchAll<T>(build(k), { pageSize: OPNSTD_PAGE_SIZE, maxPages: MAX_PAGES[kind], signal: opts.signal, onRequest: () => { requests++; emit() } })))
  const chunks = await runPool(tasks, CONCURRENCY, (d) => { done = d; emit() }, opts.signal)
  return { items: chunks.flatMap((c) => c.items), truncated: chunks.filter((c) => c.truncated).length, requests }
}
/** 마지막 조회의 절단 청크 수 — UI 경고용 */
export let lastTruncated = 0

// ───────────── 입찰공고 ─────────────
export interface NoticeRow {
  bidNtceNo: string; bidNtceOrd?: string; bidNtceNm?: string; bidNtceSttusNm?: string; bidNtceDate?: string; bidNtceBgn?: string; bsnsDivNm?: string
  intrntnlBidYn?: string; cmmnCntrctYn?: string; cmmnReciptMethdNm?: string; elctrnBidYn?: string
  cntrctCnclsSttusNm?: string; cntrctCnclsMthdNm?: string; bidwinrDcsnMthdNm?: string
  ntceInsttNm?: string; ntceInsttCd?: string; ntceInsttOfclDeptNm?: string; ntceInsttOfclNm?: string; ntceInsttOfclTel?: string
  dmndInsttNm?: string; dmndInsttCd?: string
  presnatnOprtnYn?: string; presnatnOprtnDate?: string; presnatnOprtnTm?: string; presnatnOprtnPlce?: string
  bidPrtcptQlfctRgstClseDate?: string; bidPrtcptQlfctRgstClseTm?: string
  bidBeginDate?: string; bidBeginTm?: string; bidClseDate?: string; bidClseTm?: string; opengDate?: string; opengTm?: string; opengPlce?: string
  asignBdgtAmt?: string; presmptPrce?: string; rsrvtnPrceDcsnMthdNm?: string
  rgnLmtYn?: string; prtcptPsblRgnNm?: string; indstrytyLmtYn?: string; bidprcPsblIndstrytyNm?: string; bidNtceUrl?: string
}
const withTime = (d?: string, t?: string) => { const dd = day(d); return dd ? (t ? `${dd} ${String(t).slice(0, 5)}` : dd) : undefined }

export function noticeToItem(r: NoticeRow): Item {
  const ord = str(r.bidNtceOrd) ?? '000'
  return {
    id: `notice-${r.bidNtceNo}-${ord}`, kind: 'notice', noticeNo: String(r.bidNtceNo),
    title: str(r.bidNtceNm) ?? '', agency: str(r.ntceInsttNm) ?? '', demandAgency: str(r.dmndInsttNm),
    amount: num(r.presmptPrce) ?? num(r.asignBdgtAmt),
    date: day(r.bidNtceDate), deadline: day(r.bidClseDate) || undefined, url: str(r.bidNtceUrl), region: str(r.prtcptPsblRgnNm),
    notice: {
      ord, status: str(r.bidNtceSttusNm), bizDiv: str(r.bsnsDivNm), agencyCode: str(r.ntceInsttCd),
      contractMethod: str(r.cntrctCnclsMthdNm), awardMethod: str(r.bidwinrDcsnMthdNm), contractForm: str(r.cntrctCnclsSttusNm),
      international: yn(r.intrntnlBidYn), joint: yn(r.cmmnCntrctYn), electronic: yn(r.elctrnBidYn),
      officer: str(r.ntceInsttOfclNm), officerTel: str(r.ntceInsttOfclTel), officerDept: str(r.ntceInsttOfclDeptNm),
      briefing: yn(r.presnatnOprtnYn) ? { date: day(r.presnatnOprtnDate) || undefined, time: str(r.presnatnOprtnTm), place: str(r.presnatnOprtnPlce) } : undefined,
      qualificationDeadline: withTime(r.bidPrtcptQlfctRgstClseDate, r.bidPrtcptQlfctRgstClseTm),
      bidBegin: withTime(r.bidBeginDate, r.bidBeginTm), bidClose: withTime(r.bidClseDate, r.bidClseTm),
      opening: withTime(r.opengDate, r.opengTm), openingPlace: str(r.opengPlce),
      budget: num(r.asignBdgtAmt), estimatedPrice: num(r.presmptPrce), priceMethod: str(r.rsrvtnPrceDcsnMthdNm),
      regionLimit: yn(r.rgnLmtYn), regions: str(r.prtcptPsblRgnNm), industryLimit: yn(r.indstrytyLmtYn), industries: str(r.bidprcPsblIndstrytyNm),
    },
  }
}

export async function fetchNotices(from: string, to: string, opts: FetchOpts = {}): Promise<Item[]> {
  const keys = chunkRange(from, to, 'month').map(([a, b]) => `notice|${a}|${b}`)
  const r = await collect<NoticeRow>('notice', keys, (k) => k.split('|')[2], (k) => { const [, a, b] = k.split('|'); return noticeUrl(a, b) }, opts)
  lastTruncated = r.truncated
  return r.items.map(noticeToItem).sort(byDateDesc)
}

// ───────────── 낙찰 (투찰업체 행 → 공고 단위 그룹화) ─────────────
export interface AwardRow {
  bidNtceNo: string; bidNtceOrd?: string; bidNtceNm?: string; bsnsDivNm?: string
  cntrctCnclsSttusNm?: string; cntrctCnclsMthdNm?: string; bidwinrDcsnMthdNm?: string
  ntceInsttNm?: string; ntceInsttCd?: string; dmndInsttNm?: string; dmndInsttCd?: string
  sucsfLwstlmtRt?: string; presmptPrce?: string; rsrvtnPrce?: string; bssAmt?: string
  opengDate?: string; opengTm?: string; opengRsltDivNm?: string; opengRank?: string
  bidprcCorpBizrno?: string; bidprcCorpNm?: string; bidprcCorpCeoNm?: string; bidprcAmt?: string; bidprcRt?: string; bidprcDate?: string; bidprcTm?: string
  sucsfYn?: string; dqlfctnRsn?: string
  fnlSucsfAmt?: string; fnlSucsfRt?: string; fnlSucsfDate?: string; fnlSucsfCorpNm?: string; fnlSucsfCorpCeoNm?: string; fnlSucsfCorpOfclNm?: string
  fnlSucsfCorpBizrno?: string; fnlSucsfCorpAdrs?: string; fnlSucsfCorpContactTel?: string
}

export function groupAwards(rows: AwardRow[]): Item[] {
  const map = new Map<string, Item>()
  for (const r of rows) {
    const ord = str(r.bidNtceOrd) ?? '000'
    const id = `award-${r.bidNtceNo}-${ord}`
    let it = map.get(id)
    if (!it) {
      it = {
        id, kind: 'award', noticeNo: String(r.bidNtceNo), title: str(r.bidNtceNm) ?? '', agency: str(r.ntceInsttNm) ?? '', demandAgency: str(r.dmndInsttNm),
        amount: num(r.fnlSucsfAmt), date: day(r.opengDate), winner: str(r.fnlSucsfCorpNm), winnerBizNo: str(r.fnlSucsfCorpBizrno), awardRate: num(r.fnlSucsfRt),
        award: {
          ord, agencyCode: str(r.ntceInsttCd), bizDiv: str(r.bsnsDivNm), contractMethod: str(r.cntrctCnclsMthdNm), awardMethod: str(r.bidwinrDcsnMthdNm), contractForm: str(r.cntrctCnclsSttusNm),
          lowerLimitRate: num(r.sucsfLwstlmtRt), estimatedPrice: num(r.presmptPrce), reservedPrice: num(r.rsrvtnPrce), baseAmount: num(r.bssAmt),
          openingDate: day(r.opengDate) || undefined, openingTime: str(r.opengTm),
          finalAmount: num(r.fnlSucsfAmt), finalRate: num(r.fnlSucsfRt), finalDate: day(r.fnlSucsfDate) || undefined,
          winnerCeo: str(r.fnlSucsfCorpCeoNm), winnerAddress: str(r.fnlSucsfCorpAdrs), winnerTel: str(r.fnlSucsfCorpContactTel),
          bidders: [],
        },
      }
      map.set(id, it)
    }
    if (str(r.bidprcCorpNm)) {
      const b: Bidder = { rank: num(r.opengRank), name: str(r.bidprcCorpNm)!, bizNo: str(r.bidprcCorpBizrno), ceo: str(r.bidprcCorpCeoNm), amount: num(r.bidprcAmt), rate: num(r.bidprcRt), date: day(r.bidprcDate) || undefined, won: yn(r.sucsfYn), disqualifiedReason: str(r.dqlfctnRsn), result: str(r.opengRsltDivNm) }
      it.award!.bidders.push(b)
    }
    // 첫 행에 비어 있던 필드를 이후 행에서 필드 단위로 보완
    const a = it.award!
    it.winner ??= str(r.fnlSucsfCorpNm); it.winnerBizNo ??= str(r.fnlSucsfCorpBizrno); it.amount ??= num(r.fnlSucsfAmt); it.awardRate ??= num(r.fnlSucsfRt)
    a.finalAmount ??= num(r.fnlSucsfAmt); a.finalRate ??= num(r.fnlSucsfRt); a.finalDate ??= day(r.fnlSucsfDate) || undefined
    a.winnerCeo ??= str(r.fnlSucsfCorpCeoNm); a.winnerAddress ??= str(r.fnlSucsfCorpAdrs); a.winnerTel ??= str(r.fnlSucsfCorpContactTel)
    a.estimatedPrice ??= num(r.presmptPrce); a.reservedPrice ??= num(r.rsrvtnPrce); a.baseAmount ??= num(r.bssAmt); a.lowerLimitRate ??= num(r.sucsfLwstlmtRt)
    a.agencyCode ??= str(r.ntceInsttCd)
    a.contractMethod ??= str(r.cntrctCnclsMthdNm); a.awardMethod ??= str(r.bidwinrDcsnMthdNm); a.bizDiv ??= str(r.bsnsDivNm)
    if (!it.title) it.title = str(r.bidNtceNm) ?? ''; if (!it.agency) it.agency = str(r.ntceInsttNm) ?? ''
  }
  for (const it of map.values()) it.award!.bidders.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name))
  return [...map.values()]
}

export async function fetchAwards(from: string, to: string, divs: PrespecBizDiv[], opts: FetchOpts = {}): Promise<Item[]> {
  const keys = divs.flatMap((d) => chunkRange(from, to, 'day').map(([a]) => `award|${d}|${a}`))
  const r = await collect<AwardRow>('award', keys, (k) => k.split('|')[2], (k) => { const [, d, a] = k.split('|'); return awardUrl(d as PrespecBizDiv, a) }, opts)
  lastTruncated = r.truncated
  return groupAwards(r.items).sort(byDateDesc)
}

// ───────────── 계약 ─────────────
export interface ContractRow {
  cntrctNo: string; untyCntrctNo?: string; cntrctOrd?: string; cntrctNm?: string; bsnsDivNm?: string
  cntrctCnclsSttusNm?: string; cntrctCnclsMthdNm?: string; lngtrmCtnuDivNm?: string; cmmnCntrctYn?: string
  cntrctCnclsDate?: string; cntrctPrd?: string; cntrctAmt?: string; ttalCntrctAmt?: string; cntrctInfoUrl?: string
  bidNtceNo?: string; bidNtceOrd?: string; bidNtceNm?: string; opengDate?: string; opengTm?: string; rsrvtnPrce?: string; prvtcntrctRsn?: string; bidNtceUrl?: string
  cntrctInsttDivNm?: string; cntrctInsttNm?: string; cntrctInsttCd?: string; dmndInsttDivNm?: string; dmndInsttNm?: string; dmndInsttCd?: string
  rprsntCorpNm?: string; dmstcCorpYn?: string; rprsntCorpCeoNm?: string; rprsntCorpOfclNm?: string; rprsntCorpBizrno?: string; rprsntCorpAdrs?: string; rprsntCorpContactTel?: string
}
export function contractToItem(r: ContractRow): Item {
  return {
    id: `contract-${r.cntrctNo}-${str(r.cntrctOrd) ?? '00'}`, kind: 'contract', noticeNo: str(r.bidNtceNo) ?? String(r.cntrctNo),
    title: str(r.cntrctNm) ?? str(r.bidNtceNm) ?? '', agency: str(r.cntrctInsttNm) ?? '', demandAgency: str(r.dmndInsttNm),
    amount: num(r.cntrctAmt), date: day(r.cntrctCnclsDate), winner: str(r.rprsntCorpNm), winnerBizNo: str(r.rprsntCorpBizrno), url: str(r.cntrctInfoUrl) ?? str(r.bidNtceUrl),
    contract: {
      contractNo: String(r.cntrctNo), unifiedNo: str(r.untyCntrctNo), ord: str(r.cntrctOrd), bizDiv: str(r.bsnsDivNm),
      contractForm: str(r.cntrctCnclsSttusNm), contractMethod: str(r.cntrctCnclsMthdNm), longTerm: str(r.lngtrmCtnuDivNm), joint: yn(r.cmmnCntrctYn),
      period: str(r.cntrctPrd), amount: num(r.cntrctAmt), totalAmount: num(r.ttalCntrctAmt), url: str(r.cntrctInfoUrl),
      noticeNo: str(r.bidNtceNo), noticeName: str(r.bidNtceNm), openingDate: day(r.opengDate) || undefined, reservedPrice: num(r.rsrvtnPrce), privateReason: str(r.prvtcntrctRsn),
      contractAgency: str(r.cntrctInsttNm), contractAgencyType: str(r.cntrctInsttDivNm), demandAgencyType: str(r.dmndInsttDivNm),
      company: str(r.rprsntCorpNm), companyBizNo: str(r.rprsntCorpBizrno), companyCeo: str(r.rprsntCorpCeoNm), companyAddress: str(r.rprsntCorpAdrs), companyTel: str(r.rprsntCorpContactTel), domestic: yn(r.dmstcCorpYn),
    },
  }
}
export async function fetchContracts(from: string, to: string, opts: FetchOpts & { insttDivCd?: '1' | '2'; insttCd?: string } = {}): Promise<Item[]> {
  const keys = chunkRange(from, to, 'week').map(([a, b]) => `contract|${a}|${b}|${opts.insttDivCd ?? ''}|${opts.insttCd ?? ''}`)
  const r = await collect<ContractRow>('contract', keys, (k) => k.split('|')[2], (k) => { const [, a, b, dv, cd] = k.split('|'); return contractUrl(a, b, { insttDivCd: dv as '1' | '2' | undefined, insttCd: cd }) }, opts)
  lastTruncated = r.truncated
  return r.items.map(contractToItem).sort(byDateDesc)
}

/** 예상 호출 횟수 — min: 청크 수, typical: 실측 평균 페이지 기준, rows: 예상 행 수. 캐시 히트는 제외되지 않음. */
export function estimateCalls(kind: 'notice' | 'award' | 'contract', from: string, to: string, divs: PrespecBizDiv[] = ['Thng', 'Servc', 'Cnstwk', 'Frgcpt']): { min: number; typical: number; rows: number } {
  const n = chunkRange(from, to, kind === 'notice' ? 'month' : kind === 'award' ? 'day' : 'week').length
  if (kind === 'award') { const pages = divs.reduce((a, d) => a + TYPICAL_PAGES.award[d], 0); return { min: n * divs.length, typical: n * pages, rows: n * pages * OPNSTD_PAGE_SIZE } }
  return { min: n, typical: n * TYPICAL_PAGES[kind], rows: n * TYPICAL_PAGES[kind] * OPNSTD_PAGE_SIZE }
}
/** 이 요청 수를 넘으면 조회 전에 확인을 받는다 (브라우저 메모리·트래픽 보호) */
export const CONFIRM_THRESHOLD = 300

/** 클라이언트 측 키워드·기관·업무구분 필터 */
export function filterItems(items: Item[], f: { keyword?: string; agency?: string; bizDivNm?: string }) {
  const kw = (f.keyword ?? '').trim().toLowerCase(); const ag = (f.agency ?? '').trim()
  return items.filter((i) =>
    (!kw || i.title.toLowerCase().includes(kw) || i.noticeNo.toLowerCase().includes(kw) || (i.contract?.contractNo ?? '').toLowerCase().includes(kw))
    && (!ag || i.agency.includes(ag) || (i.demandAgency ?? '').includes(ag))
    && (!f.bizDivNm || (i.notice?.bizDiv ?? i.award?.bizDiv ?? i.contract?.bizDiv ?? i.prespec?.bizDiv) === f.bizDivNm))
}
