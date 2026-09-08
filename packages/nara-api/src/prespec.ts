/**
 * 나라장터 사전규격정보서비스 (HrcspSsstndrdInfoService v1.0)
 * 명세: docs/api/prespec.md
 */
import type { Item, PrespecBizDiv } from './types'
import { callApi, day, fetchAll, num, runPool, str, yn } from './common'
import { naraConfig, serviceKey } from './config'
import { byDateDesc, compact } from './date'
import type { FetchOpts } from './opnstd'

export const BIZ_DIVS: { id: PrespecBizDiv; label: string }[] = [
  { id: 'Thng', label: '물품' }, { id: 'Servc', label: '용역' }, { id: 'Cnstwk', label: '공사' }, { id: 'Frgcpt', label: '외자' },
]
export const PRESPEC_PAGE_SIZE = 999
export const PRESPEC_MAX_PAGES = 100
/** 사전규격등록번호로 간주할 검색어: 숫자만 6자리 이상 */
export const isRegNo = (kw: string) => /^\d{6,}$/.test(kw.trim())
export let lastTruncated = 0

/** 응답 항목 (문서 "응답 메시지 명세") */
export interface PrespecRow {
  bfSpecRgstNo: string; bsnsDivNm?: string; refNo?: string; prdctClsfcNoNm?: string
  orderInsttNm?: string; rlDminsttNm?: string; asignBdgtAmt?: string | number
  rcptDt?: string; opninRgstClseDt?: string; dlvrTmlmtDt?: string; dlvrDaynum?: string | number
  ofclNm?: string; ofclTelNo?: string; swBizObjYn?: string
  specDocFileUrl1?: string; specDocFileUrl2?: string; specDocFileUrl3?: string; specDocFileUrl4?: string; specDocFileUrl5?: string
  prdctDtlList?: string; rgstDt?: string; chgDt?: string; bidNtceNoList?: string
}

export interface PrespecSearch {
  bizDiv: PrespecBizDiv | 'all'
  from: string; to: string           // YYYY-MM-DD (inqryDiv=1 접수일시)
  keyword?: string                    // 숫자만이면 사전규격등록번호(inqryDiv=2), 아니면 품명(prdctClsfcNoNm)
  ntceInsttNm?: string; dminsttNm?: string; swBizObjYn?: 'Y' | 'N'
}

function params(q: PrespecSearch, div: PrespecBizDiv, pageNo: number) {
  const p = new URLSearchParams({ ServiceKey: serviceKey(), type: 'json', numOfRows: String(PRESPEC_PAGE_SIZE), pageNo: String(pageNo) })
  const kw = q.keyword?.trim() ?? ''
  if (isRegNo(kw)) { p.set('inqryDiv', '2'); p.set('bfSpecRgstNo', kw) }
  else {
    p.set('inqryDiv', '1'); p.set('inqryBgnDt', compact(q.from) + '0000'); p.set('inqryEndDt', compact(q.to) + '2359')
    if (kw) p.set('prdctClsfcNoNm', kw)
  }
  if (q.ntceInsttNm) p.set('ntceInsttNm', q.ntceInsttNm)
  if (q.dminsttNm) p.set('dminsttNm', q.dminsttNm)
  if (q.swBizObjYn && div !== 'Cnstwk') p.set('swBizObjYn', q.swBizObjYn) // 공사에는 없는 파라미터
  return p
}

/** inqryDiv=1 접수일시 범위. 키워드·기관 필터 없는 수집용 URL */
export function prespecUrl(bizDiv: PrespecBizDiv, from: string, to: string): (pageNo: number) => string {
  return (pageNo) => `${naraConfig().baseUrl}/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfo${bizDiv}PPSSrch?${params({ bizDiv, from, to }, bizDiv, pageNo)}`
}

/** `[1^4321150102^컴퓨터서버],[2^…]` → [{seq, code, name}] */
export function parseProductList(s?: string) {
  return [...(s ?? '').matchAll(/\[([^\]]*)\]/g)].map((m) => { const [seq, code, name] = m[1].split('^'); return { seq: Number(seq), code, name } })
}

export function toItem(r: PrespecRow): Item {
  const specDocs = [r.specDocFileUrl1, r.specDocFileUrl2, r.specDocFileUrl3, r.specDocFileUrl4, r.specDocFileUrl5].map(str).filter((x): x is string => !!x)
  return {
    id: `prespec-${r.bfSpecRgstNo}`,
    kind: 'prespec',
    noticeNo: String(r.bfSpecRgstNo),
    title: str(r.prdctClsfcNoNm) ?? '',
    agency: str(r.orderInsttNm) ?? '',
    demandAgency: str(r.rlDminsttNm),
    amount: num(r.asignBdgtAmt),
    date: day(r.rcptDt) || day(r.rgstDt),
    deadline: day(r.opninRgstClseDt) || undefined,
    prespec: {
      bizDiv: str(r.bsnsDivNm),
      refNo: str(r.refNo),
      opinionDeadline: str(r.opninRgstClseDt),
      deliveryDeadline: str(r.dlvrTmlmtDt),
      deliveryDays: num(r.dlvrDaynum),
      officer: str(r.ofclNm),
      officerTel: str(r.ofclTelNo),
      swBiz: yn(r.swBizObjYn),
      specDocs,
      products: parseProductList(r.prdctDtlList),
      relatedNoticeNos: (r.bidNtceNoList ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      changedAt: str(r.chgDt),
    },
  }
}

/**
 * 업무구분별 병렬 조회. 기관명은 공고기관(ntceInsttNm)과 수요기관(dminsttNm) 양쪽으로 질의해 합친다.
 * 진행률: 업무구분×질의 단위(done/total) + 실제 요청 수(requests).
 */
export async function searchPrespec(q: PrespecSearch, opts: FetchOpts = {}): Promise<Item[]> {
  const divs = q.bizDiv === 'all' ? BIZ_DIVS.map((b) => b.id) : [q.bizDiv]
  const agency = q.ntceInsttNm?.trim() || q.dminsttNm?.trim()
  const variants: Partial<PrespecSearch>[] = agency ? [{ ntceInsttNm: agency, dminsttNm: undefined }, { ntceInsttNm: undefined, dminsttNm: agency }] : [{}]
  let done = 0, requests = 0
  const emit = () => opts.onProgress?.({ done, total: divs.length * variants.length, requests })
  const tasks = divs.flatMap((d) => variants.map((v) => () => {
    const build = !q.keyword?.trim() && !q.ntceInsttNm && !q.dminsttNm && !q.swBizObjYn && !v.ntceInsttNm && !v.dminsttNm ? prespecUrl(d, q.from, q.to) : (pg: number) => `${naraConfig().baseUrl}/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfo${d}PPSSrch?${params({ ...q, ...v }, d, pg)}`
    return fetchAll<PrespecRow>(build, { pageSize: PRESPEC_PAGE_SIZE, maxPages: PRESPEC_MAX_PAGES, signal: opts.signal, onRequest: () => { requests++; emit() } })
  }))
  const results = await runPool(tasks, 4, (d) => { done = d; emit() }, opts.signal)
  lastTruncated = results.filter((r) => r.truncated).length
  const seen = new Map<string, Item>()
  for (const r of results) for (const row of r.items) { const it = toItem(row); if (!seen.has(it.id)) seen.set(it.id, it) }
  return [...seen.values()].sort(byDateDesc)
}

/** 규격서 의견 목록 (오퍼레이션 17~20) */
export interface PrespecOpinion {
  bfSpecRgstNo: string; opninNo?: string; rplyNo?: string; opninTitl?: string; mkngCorpNm?: string; mkrNm?: string
  inptDt?: string; mkrTel?: string; mkrEmail?: string; opninCntnts?: string
  specDocOpninFileUrl1?: string; specDocOpninFileUrl2?: string; specDocOpninFileUrl3?: string; specDocOpninFileUrl4?: string; specDocOpninFileUrl5?: string
}
export async function fetchOpinions(bizDiv: PrespecBizDiv, bfSpecRgstNo: string, signal?: AbortSignal) {
  const p = new URLSearchParams({ ServiceKey: serviceKey(), type: 'json', numOfRows: '100', pageNo: '1', inqryDiv: '2', bfSpecRgstNo })
  return (await callApi<PrespecOpinion>(`${naraConfig().baseUrl}/ao/HrcspSsstndrdInfoService/getPublicPrcureThngOpinionInfo${bizDiv}?${p}`, signal)).items
}
