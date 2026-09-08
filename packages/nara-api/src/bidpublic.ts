/**
 * 나라장터 입찰공고정보서비스 (BidPublicInfoService)
 * 명세: docs/api/bidpublic.md
 * 공고명(bidNtceNm) 키워드 검색이 가능한 유일한 공고 API — "나라장터 실시간 조회" 모드 전용.
 * 조회 범위 ≤ 1개월이라 chunkRange(from,to,'month') 로 쪼개 업무구분 4개와 곱해 병렬 호출한다.
 */
import type { Item, NoticeAttachment, PrespecBizDiv } from './types'
import type { FetchOpts, NoticeRow } from './opnstd'
import { byDateDesc, chunkRange, compact } from './date'
import { day, fetchPages, num, runPool, str, yn } from './common'
import { naraConfig, serviceKey } from './config'
import { BSNS_DIV_NM, noticeToItem } from './opnstd'

export const BIDPUBLIC_PAGE_SIZE = 999
/** 청크×업무구분당 최대 페이지. 999×6 = 5,994행 */
export const BIDPUBLIC_MAX_PAGES = 6
export const BIDPUBLIC_CONCURRENCY = 4
/** 한 번의 실시간 조회가 모을 수 있는 최대 원본 행 수. 넘으면 truncated */
export const BIDPUBLIC_MAX_ROWS = 5000
export const BIDPUBLIC_DIVS: readonly PrespecBizDiv[] = ['Thng', 'Servc', 'Cnstwk', 'Frgcpt']
export const BIDPUBLIC_OPERATION: Record<PrespecBizDiv, string> = {
  Thng: 'getBidPblancListInfoThngPPSSrch',
  Servc: 'getBidPblancListInfoServcPPSSrch',
  Cnstwk: 'getBidPblancListInfoCnstwkPPSSrch',
  Frgcpt: 'getBidPblancListInfoFrgcptPPSSrch',
}

export interface BidPublicRow {
  bidNtceNo: string; bidNtceOrd?: string; reNtceYn?: string; ntceKindNm?: string; bidNtceDt?: string; refNo?: string; bidNtceNm?: string
  ntceInsttCd?: string; ntceInsttNm?: string; dminsttCd?: string; dminsttNm?: string
  bidMethdNm?: string; cntrctCnclsMthdNm?: string; sucsfbidMthdNm?: string; sucsfbidLwltRate?: string
  ntceInsttOfclNm?: string; ntceInsttOfclTelNo?: string; ntceInsttOfclEmailAdrs?: string
  bidQlfctRgstDt?: string; bidBeginDt?: string; bidClseDt?: string; opengDt?: string; opengPlce?: string
  presmptPrce?: string; asignBdgtAmt?: string
  bidNtceDtlUrl?: string; bidNtceUrl?: string; stdNtceDocUrl?: string
  ntceSpecDocUrl1?: string; ntceSpecDocUrl2?: string; ntceSpecDocUrl3?: string; ntceSpecDocUrl4?: string; ntceSpecDocUrl5?: string
  ntceSpecDocUrl6?: string; ntceSpecDocUrl7?: string; ntceSpecDocUrl8?: string; ntceSpecDocUrl9?: string; ntceSpecDocUrl10?: string
  ntceSpecFileNm1?: string; ntceSpecFileNm2?: string; ntceSpecFileNm3?: string; ntceSpecFileNm4?: string; ntceSpecFileNm5?: string
  ntceSpecFileNm6?: string; ntceSpecFileNm7?: string; ntceSpecFileNm8?: string; ntceSpecFileNm9?: string; ntceSpecFileNm10?: string
  rgnLmtBidLocplcJdgmBssNm?: string; indstrytyLmtYn?: string; bidPrtcptLmtYn?: string
  pubPrcrmntLrgClsfcNm?: string; pubPrcrmntMidClsfcNm?: string; pubPrcrmntClsfcNo?: string; pubPrcrmntClsfcNm?: string
  bfSpecRgstNo?: string; purchsObjPrdctList?: string
  dcmtgOprtnDt?: string; dcmtgOprtnPlce?: string
  rgstDt?: string; chgDt?: string; chgNtceRsn?: string
  /** 응답 필드가 아니다 — 어댑터가 호출한 오퍼레이션(업무구분)에서 채우는 파생 값 */
  bsnsDivNm?: string
}

const splitDt = (v?: string): [string | undefined, string | undefined] => {
  const raw = str(v)
  if (!raw) return [undefined, undefined]
  const date = day(raw) || undefined
  const time = /(?:T|\s)(\d{2}:\d{2})/.exec(raw)?.[1] ?? (/^\d{12}$/.test(raw) ? `${raw.slice(8, 10)}:${raw.slice(10, 12)}` : undefined)
  return [date, time]
}

const bidPublicBase = () => `${naraConfig().baseUrl}/ad/BidPublicInfoService`

export function bidPublicUrl(div: PrespecBizDiv, from: string, to: string, keyword?: string): (pageNo: number) => string {
  return (pageNo) => {
    const params = new URLSearchParams({
      ServiceKey: serviceKey(),
      type: 'json',
      numOfRows: String(BIDPUBLIC_PAGE_SIZE),
      pageNo: String(pageNo),
      inqryDiv: '1',
      inqryBgnDt: `${compact(from)}0000`,
      inqryEndDt: `${compact(to)}2359`,
    })
    const value = keyword?.trim()
    if (value) params.set('bidNtceNm', value)
    return `${bidPublicBase()}/${BIDPUBLIC_OPERATION[div]}?${params.toString()}`
  }
}

/** ntceSpecDocUrl1..10 / ntceSpecFileNm1..10 → 첨부 목록. URL이 있는 항목만 순서대로 */
export function bidPublicAttachments(r: BidPublicRow): NoticeAttachment[] {
  const attachments: NoticeAttachment[] = []
  for (let index = 0; index < 10; index++) {
    const url = str(r[`ntceSpecDocUrl${index + 1}` as keyof BidPublicRow])
    const name = str(r[`ntceSpecFileNm${index + 1}` as keyof BidPublicRow])
    if (url) attachments.push(name ? { url, name } : { url })
  }
  return attachments
}

/**
 * 낙찰자결정방법 표기 정규화. 입찰공고정보서비스는 같은 표기를 '-'로 반복해 준다
 * (예: '수의시담-수의시담' ↔ 표준서비스 '수의시담'). 반복이 아닌 값은 그대로 둔다.
 */
export function normalizeAwardMethod(value: string | undefined): string | undefined {
  if (!value) return undefined
  const parts = value.split('-').map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return undefined
  return [...new Set(parts)].length === 1 ? parts[0] : parts.join('-')
}

/** BidPublicRow → 표준서비스 NoticeRow. upsertNoticePageLive/noticeToItem이 이 결과만 본다 */
export function bidPublicToNoticeRow(r: BidPublicRow): NoticeRow {
  const [presnatnOprtnDate, presnatnOprtnTm] = splitDt(r.dcmtgOprtnDt)
  const [bidPrtcptQlfctRgstClseDate, bidPrtcptQlfctRgstClseTm] = splitDt(r.bidQlfctRgstDt)
  const [bidBeginDate, bidBeginTm] = splitDt(r.bidBeginDt)
  const [bidClseDate, bidClseTm] = splitDt(r.bidClseDt)
  const [opengDate, opengTm] = splitDt(r.opengDt)
  const regions = str(r.rgnLmtBidLocplcJdgmBssNm)
  return {
    bidNtceNo: r.bidNtceNo,
    bidNtceOrd: str(r.bidNtceOrd),
    bidNtceNm: str(r.bidNtceNm),
    bsnsDivNm: str(r.bsnsDivNm),
    bidNtceDate: day(r.bidNtceDt) || undefined,
    ntceInsttCd: str(r.ntceInsttCd),
    ntceInsttNm: str(r.ntceInsttNm),
    dmndInsttCd: str(r.dminsttCd),
    dmndInsttNm: str(r.dminsttNm),
    cntrctCnclsMthdNm: str(r.cntrctCnclsMthdNm),
    bidwinrDcsnMthdNm: normalizeAwardMethod(str(r.sucsfbidMthdNm)),
    elctrnBidYn: r.bidMethdNm?.includes('전자') ? 'Y' : undefined,
    ntceInsttOfclNm: str(r.ntceInsttOfclNm),
    ntceInsttOfclTel: str(r.ntceInsttOfclTelNo),
    presnatnOprtnYn: presnatnOprtnDate ? 'Y' : undefined,
    presnatnOprtnDate,
    presnatnOprtnTm,
    presnatnOprtnPlce: str(r.dcmtgOprtnPlce),
    bidPrtcptQlfctRgstClseDate,
    bidPrtcptQlfctRgstClseTm,
    bidBeginDate,
    bidBeginTm,
    bidClseDate,
    bidClseTm,
    opengDate,
    opengTm,
    opengPlce: str(r.opengPlce),
    presmptPrce: str(r.presmptPrce),
    asignBdgtAmt: str(r.asignBdgtAmt),
    rgnLmtYn: regions ? 'Y' : undefined,
    prtcptPsblRgnNm: regions,
    indstrytyLmtYn: str(r.indstrytyLmtYn),
    bidNtceUrl: str(r.bidNtceDtlUrl) ?? str(r.bidNtceUrl),
  }
}

/** 표준서비스 noticeToItem과 동일한 id(`notice-{bidNtceNo}-{ord}`)를 내고 NoticeDetail 확장 필드를 채운다 */
export function bidPublicToItem(r: BidPublicRow): Item {
  const item = noticeToItem(bidPublicToNoticeRow(r))
  const attachments = bidPublicAttachments(r)
  item.url = str(r.bidNtceDtlUrl) ?? item.url
  item.notice = {
    ...item.notice!,
    detailUrl: str(r.bidNtceDtlUrl),
    ...(attachments.length ? { attachments } : {}),
    lowerLimitRate: num(r.sucsfbidLwltRate),
    productClass: str(r.pubPrcrmntClsfcNm) ?? str(r.pubPrcrmntMidClsfcNm) ?? str(r.pubPrcrmntLrgClsfcNm),
    prespecNo: str(r.bfSpecRgstNo),
    reNotice: yn(r.reNtceYn),
    noticeKind: str(r.ntceKindNm),
  }
  return item
}

export interface BidPublicSearch {
  from: string; to: string
  keyword?: string
  divs?: PrespecBizDiv[]
}
export interface BidPublicOptions extends FetchOpts {
  /** Date.now() 기준 마감 시각(ms). 지나면 새 페이지를 시작하지 않는다 */
  deadline?: number
  maxPages?: number
  maxRows?: number
}
export interface BidPublicResult {
  items: Item[]
  rows: BidPublicRow[]
  requests: number
  chunks: number
  truncated: boolean
  errors: string[]
}

interface TaskResult {
  requests: number
  nextPage: number | null
  truncated: boolean
}

export async function searchBidPublic(q: BidPublicSearch, opts: BidPublicOptions = {}): Promise<BidPublicResult> {
  const divs = q.divs ?? [...BIDPUBLIC_DIVS]
  const ranges = chunkRange(q.from, q.to, 'month')
  const keys = divs.flatMap((d) => ranges.map(([a, b]) => ({ d, a, b })))
  const maxPages = opts.maxPages ?? BIDPUBLIC_MAX_PAGES
  const maxRows = opts.maxRows ?? BIDPUBLIC_MAX_ROWS
  const collected: BidPublicRow[] = []
  const errors: string[] = []
  let firstError: unknown
  let requests = 0
  const tasks = keys.map(({ d, a, b }) => async (): Promise<TaskResult> => {
    try {
      const result = await fetchPages<BidPublicRow>(bidPublicUrl(d, a, b, q.keyword), {
        pageSize: BIDPUBLIC_PAGE_SIZE,
        maxPages,
        signal: opts.signal,
        onPage: (rows) => {
          rows.forEach((row) => { row.bsnsDivNm ??= BSNS_DIV_NM[d] })
          collected.push(...rows)
        },
        shouldContinue: () => collected.length < maxRows && (!opts.deadline || Date.now() < opts.deadline),
      })
      requests += result.requests
      return { requests: result.requests, nextPage: result.nextPage, truncated: result.truncated }
    } catch (error) {
      firstError ??= error
      errors.push(`${BSNS_DIV_NM[d]} ${a}~${b}: ${error instanceof Error ? error.message : String(error)}`)
      return { requests: 0, nextPage: null, truncated: true }
    }
  })
  const results = await runPool(tasks, BIDPUBLIC_CONCURRENCY, (done, total) => opts.onProgress?.({ done, total, requests }), opts.signal)
  if (keys.length > 0 && errors.length === keys.length) throw firstError
  const truncated = results.some((result) => result.truncated || result.nextPage !== null) || collected.length >= maxRows
  const items = [...new Map(collected.map((row) => {
    const item = bidPublicToItem(row)
    return [item.id, item] as const
  })).values()].sort(byDateDesc)
  return { items, rows: collected, requests, chunks: keys.length, truncated, errors }
}

/**
 * months = chunkRange(from,to,'month').length, min = months × divs(각 1페이지), max = min × BIDPUBLIC_MAX_PAGES.
 * 주의: BidPublicResult.chunks 는 months × divs 이고, 여기 months 는 월청크 수만 센다.
 */
export function estimateLiveCalls(from: string, to: string, divs: readonly PrespecBizDiv[] = BIDPUBLIC_DIVS): { months: number; min: number; max: number } {
  const months = chunkRange(from, to, 'month').length
  const min = months * divs.length
  return { months, min, max: min * BIDPUBLIC_MAX_PAGES }
}
