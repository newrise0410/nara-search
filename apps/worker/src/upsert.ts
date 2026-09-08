import { and, eq, sql } from 'drizzle-orm'
import type { AwardRow, BidPublicRow, ContractRow, NoticeRow, PrespecBizDiv, PrespecRow } from '@nara/api'
import { bidPublicAttachments, bidPublicToNoticeRow, parseProductList, day, num, str, yn } from '@nara/api'
import { agencies, awards, bidders, companies, contracts, notices, prespecDocs, prespecProducts, prespecs } from '@nara/db'
import { ensurePartitions } from '@nara/db'
import type { NaraDb } from '@nara/db'

/**
 * 한 번의 INSERT에 넣을 최대 행 수 — postgres 프로토콜 파라미터 한도(65,535) 회피.
 * 테이블별 (insert 컬럼 수 × 배치 행 수) 는 아래 표를 넘지 않는다.
 *   bidders 11×2,000=22,000 · awards 26×1,500=39,000 (요약 경로 28×1,500=42,000)
 *   notices 44×200=8,800 · contracts 33×200=6,600 · prespecs 19×200=3,800
 *   companies 5×200=1,000 · agencies 2×200=400
 */
export const DB_BATCH_SIZE = 200
export const AWARD_BATCH_SIZE = 1500
export const BIDDER_BATCH_SIZE = 2000
/** numeric(18,2) 상한(9,999,999,999,999,999.99). 초과 값은 저장하지 않는다 — INSERT 하나가 배치 200행 전체를 실패시키기 때문 */
const MONEY_MAX = 1e16
/**
 * 금액 컬럼은 numeric(18,2)(011) — 외자 등 소수점 금액을 반올림 없이 원값으로 저장한다.
 * 소수점 셋째 자리 이하는 Postgres가 scale 2로 반올림한다(128000.005 → 128000.01).
 */
const money = (v: unknown) => { const n = num(v); return n == null || n >= MONEY_MAX ? undefined : n }

const dateValue = (value: unknown) => day(value) || undefined
const withTime = (date: unknown, time: unknown) => {
  const d = dateValue(date); const t = str(time)
  return d ? (t ? `${d} ${t.slice(0, 5)}` : d) : undefined
}
const ex = (name: string) => sql.raw(`excluded."${name}"`)
const keepText = (name: string) => sql.raw(`coalesce(nullif(excluded."${name}", ''), "notices"."${name}")`)
/** null 이면 기존 값 유지 — date·numeric·double 컬럼 공용 */
const keepValue = (name: string) => sql.raw(`coalesce(excluded."${name}", "notices"."${name}")`)
/** 실시간 응답에 근거가 없으면 false 가 오므로, true 만 반영하고 기존 값은 유지한다 */
const keepBool = (name: string) => sql.raw(`coalesce(nullif(excluded."${name}", false), "notices"."${name}")`)
/** 표준서비스는 정본 응답의 boolean을 그대로 반영한다 */
const standardBool = (name: string) => ex(name)
const keepJson = (name: string) => sql.raw(`coalesce(nullif(excluded."${name}", '[]'::jsonb), "notices"."${name}")`)
const companyKeep = (name: string) => sql.raw(`coalesce(nullif(excluded."${name}", ''), "companies"."${name}")`)
const chunks = <T>(values: T[], size: number = DB_BATCH_SIZE): T[][] =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size))

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const map = new Map<string, T>()
  for (const value of values) map.set(key(value), value)
  return [...map.values()]
}

type AgencyValue = typeof agencies.$inferInsert
type CompanyValue = typeof companies.$inferInsert
type NoticeValue = typeof notices.$inferInsert

async function upsertAgencies(db: NaraDb, values: AgencyValue[]): Promise<void> {
  const rows = uniqueBy(values, (value) => value.code)
  for (const batch of chunks(rows)) {
    await db.insert(agencies).values(batch).onConflictDoUpdate({
      target: agencies.code,
      set: { name: sql.raw(`coalesce(nullif(excluded."name", ''), "agencies"."name")`), updatedAt: sql`now()` },
    })
  }
}

async function upsertCompanies(db: NaraDb, values: CompanyValue[]): Promise<void> {
  const rows = uniqueBy(values, (value) => value.bizNo)
  for (const batch of chunks(rows)) {
    await db.insert(companies).values(batch).onConflictDoUpdate({
      target: companies.bizNo,
      set: { name: companyKeep('name'), ceo: companyKeep('ceo'), address: companyKeep('address'), tel: companyKeep('tel'), updatedAt: sql`now()` },
    })
  }
}

function addAgency(map: Map<string, AgencyValue>, code: unknown, name: unknown): void {
  const c = str(code)
  if (!c) return
  const n = str(name)
  const current = map.get(c)
  if (!current) map.set(c, { code: c, name: n ?? '' })
  else if (n) current.name = n
}

function addCompany(map: Map<string, CompanyValue>, bizNo: unknown, name: unknown, ceo: unknown, address: unknown, tel: unknown): void {
  const b = str(bizNo)
  if (!b) return
  const values = { name: str(name), ceo: str(ceo), address: str(address), tel: str(tel) }
  const current = map.get(b)
  if (!current) map.set(b, { bizNo: b, name: values.name ?? '', ceo: values.ceo, address: values.address, tel: values.tel })
  else {
    if (values.name) current.name = values.name
    if (values.ceo) current.ceo = values.ceo
    if (values.address) current.address = values.address
    if (values.tel) current.tel = values.tel
  }
}

function noticeValue(r: NoticeRow): NoticeValue {
  const ord = str(r.bidNtceOrd) ?? '000'
  return {
    bidNtceNo: str(r.bidNtceNo) ?? '', ord, title: str(r.bidNtceNm) ?? '', status: str(r.bidNtceSttusNm), bizDiv: str(r.bsnsDivNm),
    noticeDate: dateValue(r.bidNtceDate), ntceInsttCd: str(r.ntceInsttCd), ntceInsttNm: str(r.ntceInsttNm), dmndInsttCd: str(r.dmndInsttCd), dmndInsttNm: str(r.dmndInsttNm),
    contractMethod: str(r.cntrctCnclsMthdNm), awardMethod: str(r.bidwinrDcsnMthdNm), contractForm: str(r.cntrctCnclsSttusNm),
    international: yn(r.intrntnlBidYn), joint: yn(r.cmmnCntrctYn), electronic: yn(r.elctrnBidYn),
    officer: str(r.ntceInsttOfclNm), officerTel: str(r.ntceInsttOfclTel), officerDept: str(r.ntceInsttOfclDeptNm), briefing: yn(r.presnatnOprtnYn),
    briefingDate: dateValue(r.presnatnOprtnDate), briefingTime: str(r.presnatnOprtnTm), briefingPlace: str(r.presnatnOprtnPlce),
    qualificationDeadline: withTime(r.bidPrtcptQlfctRgstClseDate, r.bidPrtcptQlfctRgstClseTm), bidBegin: withTime(r.bidBeginDate, r.bidBeginTm), bidClose: withTime(r.bidClseDate, r.bidClseTm),
    opening: withTime(r.opengDate, r.opengTm), openingPlace: str(r.opengPlce), budgetAmt: money(r.asignBdgtAmt), estimatedPrice: money(r.presmptPrce), priceMethod: str(r.rsrvtnPrceDcsnMthdNm),
    regionLimit: yn(r.rgnLmtYn), regions: str(r.prtcptPsblRgnNm), industryLimit: yn(r.indstrytyLmtYn), industries: str(r.bidprcPsblIndstrytyNm), noticeUrl: str(r.bidNtceUrl),
    source: 'opnstd',
  }
}

function noticeValues(rows: NoticeRow[]): NoticeValue[] {
  return uniqueBy(rows.map(noticeValue), (value) => `${value.bidNtceNo}|${value.ord}`)
}

/** 입찰공고정보서비스 부가 필드를 공고 insert 값으로 변환한다. */
function bidPublicValue(r: BidPublicRow): Partial<NoticeValue> {
  return {
    attachments: bidPublicAttachments(r),
    detailUrl: str(r.bidNtceDtlUrl),
    lowerLimitRate: num(r.sucsfbidLwltRate),
    productClass: str(r.pubPrcrmntClsfcNm) ?? str(r.pubPrcrmntMidClsfcNm) ?? str(r.pubPrcrmntLrgClsfcNm),
    noticeKind: str(r.ntceKindNm),
    prespecNo: str(r.bfSpecRgstNo),
    /** 새 행에 사전규격이 붙어 들어오면 그때가 전환 관측 시각이다 */
    prespecLinkedAt: str(r.bfSpecRgstNo) ? new Date() : undefined,
    reNotice: yn(r.reNtceYn),
    source: 'bidpublic',
  }
}

/** notices 페이지를 정본 컬럼에 반영하고 기관 정본도 함께 갱신한다. */
export async function upsertNoticePage(db: NaraDb, rows: NoticeRow[]): Promise<number> {
  const agenciesByCode = new Map<string, AgencyValue>()
  for (const row of rows) {
    addAgency(agenciesByCode, row.ntceInsttCd, row.ntceInsttNm); addAgency(agenciesByCode, row.dmndInsttCd, row.dmndInsttNm)
  }
  await upsertAgencies(db, [...agenciesByCode.values()])
  const values = noticeValues(rows)
  for (const batch of chunks(values)) {
    await db.insert(notices).values(batch).onConflictDoUpdate({
      target: [notices.bidNtceNo, notices.ord],
      set: {
        title: ex('title'), status: ex('status'), bizDiv: ex('biz_div'), noticeDate: ex('notice_date'), ntceInsttCd: ex('ntce_instt_cd'), ntceInsttNm: ex('ntce_instt_nm'), dmndInsttCd: ex('dmnd_instt_cd'), dmndInsttNm: ex('dmnd_instt_nm'),
        contractMethod: ex('contract_method'), awardMethod: ex('award_method'), contractForm: ex('contract_form'), international: ex('international'), joint: ex('joint'), electronic: standardBool('electronic'), officer: ex('officer'), officerTel: ex('officer_tel'), officerDept: ex('officer_dept'),
        briefing: standardBool('briefing'), briefingDate: ex('briefing_date'), briefingTime: ex('briefing_time'), briefingPlace: ex('briefing_place'), qualificationDeadline: ex('qualification_deadline'), bidBegin: ex('bid_begin'), bidClose: ex('bid_close'), opening: ex('opening'), openingPlace: ex('opening_place'), budgetAmt: ex('budget_amt'), estimatedPrice: ex('estimated_price'), priceMethod: ex('price_method'), regionLimit: ex('region_limit'), regions: ex('regions'), industryLimit: standardBool('industry_limit'), industries: ex('industries'), noticeUrl: ex('notice_url'), updatedAt: sql`now()`,
      },
    })
  }
  return values.length
}

/**
 * 실시간(입찰공고정보서비스) 결과 write-through 전용 업서트.
 * 응답에 없는 컬럼(status·contract_form·international·joint·price_method·industries·officer_dept·
 * region_limit·regions)은 set 절에서 빼서 기존 정본 값을 보존하고,
 * 나머지 텍스트 컬럼도 빈 값이면 기존 값을 유지한다.
 * electronic·briefing·industry_limit 는 실시간 응답이 true 를 줄 때만 갱신한다(응답에 근거가 없으면 기존 값 보존).
 */
export async function upsertNoticePageLive(db: NaraDb, rows: BidPublicRow[]): Promise<number> {
  const converted = rows.map((row) => ({ row, notice: bidPublicToNoticeRow(row) }))
  const agenciesByCode = new Map<string, AgencyValue>()
  for (const { notice } of converted) {
    addAgency(agenciesByCode, notice.ntceInsttCd, notice.ntceInsttNm); addAgency(agenciesByCode, notice.dmndInsttCd, notice.dmndInsttNm)
  }
  await upsertAgencies(db, [...agenciesByCode.values()])
  const values = uniqueBy(converted.map(({ row, notice }) => ({ ...noticeValue(notice), ...bidPublicValue(row) })), (value) => `${value.bidNtceNo}|${value.ord}`)
  for (const batch of chunks(values)) {
    await db.insert(notices).values(batch).onConflictDoUpdate({
      target: [notices.bidNtceNo, notices.ord],
      set: {
        title: keepText('title'), bizDiv: keepText('biz_div'), noticeDate: keepValue('notice_date'), ntceInsttCd: keepText('ntce_instt_cd'), ntceInsttNm: keepText('ntce_instt_nm'), dmndInsttCd: keepText('dmnd_instt_cd'), dmndInsttNm: keepText('dmnd_instt_nm'),
        contractMethod: keepText('contract_method'), awardMethod: keepText('award_method'), officer: keepText('officer'), officerTel: keepText('officer_tel'), briefingDate: keepValue('briefing_date'), briefingTime: keepText('briefing_time'), briefingPlace: keepText('briefing_place'),
        qualificationDeadline: keepText('qualification_deadline'), bidBegin: keepText('bid_begin'), bidClose: keepText('bid_close'), opening: keepText('opening'), openingPlace: keepText('opening_place'), noticeUrl: keepText('notice_url'),
        budgetAmt: keepValue('budget_amt'), estimatedPrice: keepValue('estimated_price'), electronic: keepBool('electronic'), briefing: keepBool('briefing'), industryLimit: keepBool('industry_limit'), updatedAt: sql`now()`,
        attachments: keepJson('attachments'), detailUrl: keepText('detail_url'), lowerLimitRate: keepValue('lower_limit_rate'), productClass: keepText('product_class'), noticeKind: keepText('notice_kind'), prespecNo: keepText('prespec_no'),
        prespecLinkedAt: sql.raw(`case when nullif("notices"."prespec_no", '') is null and nullif(excluded."prespec_no", '') is not null then now() else "notices"."prespec_linked_at" end`),
        reNotice: ex('re_notice'), source: ex('source'),
      },
    })
  }
  return values.length
}

const AWARD_FIELDS: (keyof AwardRow)[] = [
  'bidNtceNo', 'bidNtceOrd', 'bidNtceNm', 'bsnsDivNm', 'cntrctCnclsSttusNm', 'cntrctCnclsMthdNm', 'bidwinrDcsnMthdNm', 'ntceInsttNm', 'ntceInsttCd', 'dmndInsttNm', 'dmndInsttCd',
  'sucsfLwstlmtRt', 'presmptPrce', 'rsrvtnPrce', 'bssAmt', 'opengDate', 'opengTm', 'opengRsltDivNm', 'opengRank', 'bidprcCorpBizrno', 'bidprcCorpNm', 'bidprcCorpCeoNm', 'bidprcAmt', 'bidprcRt', 'bidprcDate', 'bidprcTm', 'sucsfYn', 'dqlfctnRsn', 'fnlSucsfAmt', 'fnlSucsfRt', 'fnlSucsfDate', 'fnlSucsfCorpNm', 'fnlSucsfCorpCeoNm', 'fnlSucsfCorpOfclNm', 'fnlSucsfCorpBizrno', 'fnlSucsfCorpAdrs', 'fnlSucsfCorpContactTel',
]

/** 첫 행에 비어 있던 헤더 필드를 이후 행에서 채운다. */
export function mergeAwardFields(target: AwardRow, source: AwardRow): void {
  const targetRecord = target as unknown as Record<string, unknown>
  const sourceRecord = source as unknown as Record<string, unknown>
  for (const field of AWARD_FIELDS) if (!str(targetRecord[field]) && str(sourceRecord[field])) targetRecord[field] = sourceRecord[field]
}

function mergeAwardRows(rows: AwardRow[]): AwardRow[] {
  const grouped = new Map<string, AwardRow>()
  for (const row of rows) {
    const key = `${str(row.bidNtceNo) ?? ''}|${str(row.bidNtceOrd) ?? '000'}`
    const first = grouped.get(key)
    if (!first) { grouped.set(key, { ...row }); continue }
    mergeAwardFields(first, row)
  }
  return [...grouped.values()]
}

export type AwardValue = typeof awards.$inferInsert

/** AwardRow → awards insert 값. 수집 경로와 --summary-only 경로가 공유한다. */
export function awardValueOf(r: AwardRow, bizDivKey: PrespecBizDiv): AwardValue {
  return {
    bidNtceNo: str(r.bidNtceNo) ?? '', ord: str(r.bidNtceOrd) ?? '000', openingDate: dateValue(r.opengDate)!, title: str(r.bidNtceNm) ?? '', bizDiv: str(r.bsnsDivNm), bizDivKey,
    ntceInsttCd: str(r.ntceInsttCd), ntceInsttNm: str(r.ntceInsttNm), dmndInsttCd: str(r.dmndInsttCd), dmndInsttNm: str(r.dmndInsttNm), contractMethod: str(r.cntrctCnclsMthdNm), awardMethod: str(r.bidwinrDcsnMthdNm), contractForm: str(r.cntrctCnclsSttusNm),
    lowerLimitRate: num(r.sucsfLwstlmtRt), estimatedPrice: money(r.presmptPrce), reservedPrice: money(r.rsrvtnPrce), baseAmount: money(r.bssAmt), openingTime: str(r.opengTm), finalAmount: money(r.fnlSucsfAmt), finalRate: num(r.fnlSucsfRt), finalDate: dateValue(r.fnlSucsfDate),
    winnerBizNo: str(r.fnlSucsfCorpBizrno), winnerName: str(r.fnlSucsfCorpNm), winnerCeo: str(r.fnlSucsfCorpCeoNm), winnerAddress: str(r.fnlSucsfCorpAdrs), winnerTel: str(r.fnlSucsfCorpContactTel),
  }
}

const AWARD_SET = {
  title: ex('title'), bizDiv: ex('biz_div'), bizDivKey: ex('biz_div_key'), ntceInsttCd: ex('ntce_instt_cd'), ntceInsttNm: ex('ntce_instt_nm'), dmndInsttCd: ex('dmnd_instt_cd'), dmndInsttNm: ex('dmnd_instt_nm'), contractMethod: ex('contract_method'), awardMethod: ex('award_method'), contractForm: ex('contract_form'), lowerLimitRate: ex('lower_limit_rate'), estimatedPrice: ex('estimated_price'), reservedPrice: ex('reserved_price'), baseAmount: ex('base_amount'), openingTime: ex('opening_time'), finalAmount: ex('final_amount'), finalRate: ex('final_rate'), finalDate: ex('final_date'), winnerBizNo: ex('winner_biz_no'), winnerName: ex('winner_name'), winnerCeo: ex('winner_ceo'), winnerAddress: ex('winner_address'), winnerTel: ex('winner_tel'), updatedAt: sql`now()`,
}

/** 마지막으로 관측한 개찰일 누락 공고 수 — 파티션 키가 없어 저장할 수 없는 행 */
export let lastSkippedAwardRows = 0

/** 낙찰 페이지를 공고 헤더·투찰 행·기관·업체 정본으로 분해해 반영한다. */
export async function upsertAwardPage(db: NaraDb, rows: AwardRow[], bizDivKey: PrespecBizDiv): Promise<{ awards: number; bidders: number }> {
  const grouped = mergeAwardRows(rows)
  const valid = grouped.filter((row) => !!dateValue(row.opengDate))
  lastSkippedAwardRows = grouped.length - valid.length
  await ensurePartitions(db, valid.map((row) => dateValue(row.opengDate)!))
  const agenciesByCode = new Map<string, AgencyValue>(); const companiesByBizNo = new Map<string, CompanyValue>()
  for (const row of rows.filter((row) => !!dateValue(row.opengDate))) {
    addAgency(agenciesByCode, row.ntceInsttCd, row.ntceInsttNm); addAgency(agenciesByCode, row.dmndInsttCd, row.dmndInsttNm)
    addCompany(companiesByBizNo, row.bidprcCorpBizrno, row.bidprcCorpNm, row.bidprcCorpCeoNm, undefined, undefined)
    addCompany(companiesByBizNo, row.fnlSucsfCorpBizrno, row.fnlSucsfCorpNm, row.fnlSucsfCorpCeoNm, row.fnlSucsfCorpAdrs, row.fnlSucsfCorpContactTel)
  }
  await upsertAgencies(db, [...agenciesByCode.values()]); await upsertCompanies(db, [...companiesByBizNo.values()])
  const awardValues = valid.map((r) => awardValueOf(r, bizDivKey))
  const awardRows = uniqueBy(awardValues, (value) => `${value.bidNtceNo}|${value.ord}|${value.openingDate}`)
  for (const batch of chunks(awardRows, AWARD_BATCH_SIZE)) {
    await db.insert(awards).values(batch).onConflictDoUpdate({
      target: [awards.bidNtceNo, awards.ord, awards.openingDate],
      set: AWARD_SET,
    })
  }
  const bidderValues = rows.filter((r) => str(r.bidprcCorpNm) && dateValue(r.opengDate)).map((r) => ({
    bidNtceNo: str(r.bidNtceNo) ?? '', awardOrd: str(r.bidNtceOrd) ?? '000', openingDate: dateValue(r.opengDate)!, bizNo: str(r.bidprcCorpBizrno) ?? '', rank: num(r.opengRank) ?? 0,
    amount: money(r.bidprcAmt), rate: num(r.bidprcRt), bidDate: dateValue(r.bidprcDate), won: yn(r.sucsfYn), disqualifiedReason: str(r.dqlfctnRsn), result: str(r.opengRsltDivNm),
  }))
  const bidderRows = uniqueBy(bidderValues, (value) => `${value.bidNtceNo}|${value.awardOrd}|${value.openingDate}|${value.bizNo}|${value.rank}`)
  for (const batch of chunks(bidderRows, BIDDER_BATCH_SIZE)) {
    await db.insert(bidders).values(batch).onConflictDoUpdate({
      target: [bidders.bidNtceNo, bidders.awardOrd, bidders.openingDate, bidders.bizNo, bidders.rank],
      set: { amount: ex('amount'), rate: ex('rate'), bidDate: ex('bid_date'), won: ex('won'), disqualifiedReason: ex('disqualified_reason'), result: ex('result') },
    })
  }
  return { awards: awardRows.length, bidders: bidderRows.length }
}

/** --summary-only 전용 awards 업서트. bidders에는 쓰지 않는다. */
export async function upsertAwardSummaryRows(db: NaraDb, values: AwardValue[]): Promise<number> {
  await ensurePartitions(db, values.map((value) => value.openingDate))
  for (const batch of chunks(values, AWARD_BATCH_SIZE)) {
    await db.insert(awards).values(batch).onConflictDoUpdate({
      target: [awards.bidNtceNo, awards.ord, awards.openingDate],
      set: { ...AWARD_SET, bidderSummary: ex('bidder_summary'), bidderCount: ex('bidder_count'), updatedAt: sql`now()` },
    })
  }
  return values.length
}

/** 계약 페이지를 계약·기관·업체 정본으로 반영한다. */
export async function upsertContractPage(db: NaraDb, rows: ContractRow[]): Promise<number> {
  const agenciesByCode = new Map<string, AgencyValue>(); const companiesByBizNo = new Map<string, CompanyValue>()
  for (const row of rows) {
    addAgency(agenciesByCode, row.cntrctInsttCd, row.cntrctInsttNm); addAgency(agenciesByCode, row.dmndInsttCd, row.dmndInsttNm)
    addCompany(companiesByBizNo, row.rprsntCorpBizrno, row.rprsntCorpNm, row.rprsntCorpCeoNm, row.rprsntCorpAdrs, row.rprsntCorpContactTel)
  }
  await upsertAgencies(db, [...agenciesByCode.values()]); await upsertCompanies(db, [...companiesByBizNo.values()])
  const values = uniqueBy(rows.map((r) => ({
    cntrctNo: str(r.cntrctNo) ?? '', ord: str(r.cntrctOrd) ?? '00', unifiedNo: str(r.untyCntrctNo), title: str(r.cntrctNm) ?? str(r.bidNtceNm) ?? '', bizDiv: str(r.bsnsDivNm), contractForm: str(r.cntrctCnclsSttusNm), contractMethod: str(r.cntrctCnclsMthdNm), longTerm: str(r.lngtrmCtnuDivNm), joint: yn(r.cmmnCntrctYn), concludeDate: dateValue(r.cntrctCnclsDate), period: str(r.cntrctPrd), amount: money(r.cntrctAmt), totalAmount: money(r.ttalCntrctAmt), infoUrl: str(r.cntrctInfoUrl),
    bidNtceNo: str(r.bidNtceNo), bidNtceOrd: str(r.bidNtceOrd), bidNtceNm: str(r.bidNtceNm), noticeUrl: str(r.bidNtceUrl), openingDate: dateValue(r.opengDate), reservedPrice: money(r.rsrvtnPrce), privateReason: str(r.prvtcntrctRsn), cntrctInsttCd: str(r.cntrctInsttCd), cntrctInsttNm: str(r.cntrctInsttNm), cntrctInsttDiv: str(r.cntrctInsttDivNm), dmndInsttCd: str(r.dmndInsttCd), dmndInsttNm: str(r.dmndInsttNm), dmndInsttDiv: str(r.dmndInsttDivNm), companyBizNo: str(r.rprsntCorpBizrno), companyName: str(r.rprsntCorpNm), companyCeo: str(r.rprsntCorpCeoNm), companyAddress: str(r.rprsntCorpAdrs), companyTel: str(r.rprsntCorpContactTel), domestic: yn(r.dmstcCorpYn),
  })), (value) => `${value.cntrctNo}|${value.ord}`)
  for (const batch of chunks(values)) {
    await db.insert(contracts).values(batch).onConflictDoUpdate({
      target: [contracts.cntrctNo, contracts.ord],
      set: {
        unifiedNo: ex('unified_no'), title: ex('title'), bizDiv: ex('biz_div'), contractForm: ex('contract_form'), contractMethod: ex('contract_method'), longTerm: ex('long_term'), joint: ex('joint'), concludeDate: ex('conclude_date'), period: ex('period'), amount: ex('amount'), totalAmount: ex('total_amount'), infoUrl: ex('info_url'), bidNtceNo: ex('bid_ntce_no'), bidNtceOrd: ex('bid_ntce_ord'), bidNtceNm: ex('bid_ntce_nm'), noticeUrl: ex('notice_url'), openingDate: ex('opening_date'), reservedPrice: ex('reserved_price'), privateReason: ex('private_reason'), cntrctInsttCd: ex('cntrct_instt_cd'), cntrctInsttNm: ex('cntrct_instt_nm'), cntrctInsttDiv: ex('cntrct_instt_div'), dmndInsttCd: ex('dmnd_instt_cd'), dmndInsttNm: ex('dmnd_instt_nm'), dmndInsttDiv: ex('dmnd_instt_div'), companyBizNo: ex('company_biz_no'), companyName: ex('company_name'), companyCeo: ex('company_ceo'), companyAddress: ex('company_address'), companyTel: ex('company_tel'), domestic: ex('domestic'), updatedAt: sql`now()`,
      },
    })
  }
  return values.length
}

/** 사전규격 부모와 가변 길이 문서·품목 목록을 delete-then-insert로 갱신한다. */
export async function upsertPrespecPage(db: NaraDb, rows: PrespecRow[], bizDivKey: PrespecBizDiv): Promise<number> {
  const detailRows = uniqueBy(rows.filter((row) => !!str(row.bfSpecRgstNo)), (row) => str(row.bfSpecRgstNo)!)
  const values = uniqueBy(rows.map((r) => ({
    bfSpecRgstNo: str(r.bfSpecRgstNo) ?? '', bizDiv: str(r.bsnsDivNm), bizDivKey, refNo: str(r.refNo), title: str(r.prdctClsfcNoNm) ?? '', orderInsttNm: str(r.orderInsttNm), dminsttNm: str(r.rlDminsttNm), budgetAmt: money(r.asignBdgtAmt), receiptDate: dateValue(r.rcptDt), receiptAt: str(r.rcptDt), opinionCloseAt: str(r.opninRgstClseDt), deliveryDeadlineAt: str(r.dlvrTmlmtDt), deliveryDays: num(r.dlvrDaynum), officer: str(r.ofclNm), officerTel: str(r.ofclTelNo), swBiz: yn(r.swBizObjYn), registeredAt: str(r.rgstDt), changedAt: str(r.chgDt), relatedNoticeNos: str(r.bidNtceNoList)?.split(',').map((v) => v.trim()).filter(Boolean) ?? [],
  })), (value) => value.bfSpecRgstNo)
  for (const batch of chunks(values)) {
    await db.insert(prespecs).values(batch).onConflictDoUpdate({
      target: prespecs.bfSpecRgstNo,
      set: { bizDiv: ex('biz_div'), bizDivKey: ex('biz_div_key'), refNo: ex('ref_no'), title: ex('title'), orderInsttNm: ex('order_instt_nm'), dminsttNm: ex('dminstt_nm'), budgetAmt: ex('budget_amt'), receiptDate: ex('receipt_date'), receiptAt: ex('receipt_at'), opinionCloseAt: ex('opinion_close_at'), deliveryDeadlineAt: ex('delivery_deadline_at'), deliveryDays: ex('delivery_days'), officer: ex('officer'), officerTel: ex('officer_tel'), swBiz: ex('sw_biz'), registeredAt: ex('registered_at'), changedAt: ex('changed_at'), relatedNoticeNos: ex('related_notice_nos'), updatedAt: sql`now()` },
    })
  }
  for (const row of detailRows) {
    const id = str(row.bfSpecRgstNo)!; await db.delete(prespecDocs).where(eq(prespecDocs.bfSpecRgstNo, id)); await db.delete(prespecProducts).where(eq(prespecProducts.bfSpecRgstNo, id))
    const docs = [row.specDocFileUrl1, row.specDocFileUrl2, row.specDocFileUrl3, row.specDocFileUrl4, row.specDocFileUrl5].map(str).filter((v): v is string => !!v).map((url, i) => ({ bfSpecRgstNo: id, seq: i + 1, url }))
    for (const batch of chunks(docs)) if (batch.length) await db.insert(prespecDocs).values(batch).onConflictDoNothing()
    const products = uniqueBy(parseProductList(row.prdctDtlList).map((product) => ({ bfSpecRgstNo: id, seq: product.seq, code: str(product.code) ?? '', name: str(product.name) ?? '' })), (product) => String(product.seq))
    for (const batch of chunks(products)) if (batch.length) await db.insert(prespecProducts).values(batch).onConflictDoNothing()
  }
  return values.length
}

/** 해당 개찰일의 awards.bidder_count 를 bidders 실제 행 수로 다시 계산한다. 갱신된 공고 수 반환 */
export async function recomputeBidderCounts(db: NaraDb, openingDate: string, bizDivKey?: PrespecBizDiv): Promise<number> {
  const result = await db.update(awards).set({
    bidderCount: sql`(SELECT count(*)::int FROM "bidders" b WHERE b."bid_ntce_no" = "awards"."bid_ntce_no" AND b."award_ord" = "awards"."ord" AND b."opening_date" = "awards"."opening_date")`,
    updatedAt: sql`now()`,
  }).where(and(eq(awards.openingDate, openingDate), bizDivKey ? eq(awards.bizDivKey, bizDivKey) : sql`true`)).returning({ bidNtceNo: awards.bidNtceNo })
  return result.length
}
