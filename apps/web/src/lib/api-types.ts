import type { Item, PrespecBizDiv, SearchKind } from '@nara/api'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 500

export type SearchSort = 'default' | 'amountDesc' | 'amountAsc' | 'deadline' | 'latest'
export const SEARCH_SORTS: readonly SearchSort[] = ['default', 'amountDesc', 'amountAsc', 'deadline', 'latest']

export interface SearchParams {
  kind: SearchKind
  keyword: string
  agency: string
  bizDiv: PrespecBizDiv | 'all'
  from: string
  to: string
  page: number
  pageSize: number
  sort: SearchSort
  source: 'db' | 'live'
}

export interface SearchPage {
  items: Item[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export interface SearchResponse extends SearchPage {
  source: 'db' | 'nara-api' | 'live'
  /** 화면에 띄울 경고. 없으면 필드 자체를 생략 */
  warnings?: string[]
  /** source === 'live' 일 때만 */
  live?: LiveMeta
  /** 붙일 셀이 하나도 없으면 필드 자체를 생략 */
  awardStats?: SearchAwardStats
}

export interface LiveMeta {
  /** 실제 HTTP 요청 수 */
  requests: number
  /** 월청크 × 업무구분 수 */
  chunks: number
  /** 조회에 걸린 시간(ms) */
  elapsedMs: number
  /** 페이지·행·시간 예산 소진으로 결과가 잘렸으면 true */
  truncated: boolean
  /** notices 테이블에 반영한 행 수 */
  upserted: number
}

export interface StatusCoverage {
  /** done 청크의 최소 chunk_start (YYYY-MM-DD). 없으면 null */
  from: string | null
  /** done 청크의 최대 chunk_end (YYYY-MM-DD). 없으면 null */
  to: string | null
  /** done 청크의 rows 합계 */
  rows: number
}

export type JobKindName = 'notice' | 'award' | 'contract' | 'prespec'

export interface StatusKind {
  kind: JobKindName
  /** 가장 최근 done 잡의 updated_at (ISO 8601) */
  lastDoneAt: string | null
  /** 가장 최근 done 잡의 chunk_start (YYYY-MM-DD) */
  latestChunkStart: string | null
  pending: number
  failed: number
  done: number
  coverage: StatusCoverage
}

/** alert_runs 최신 1행 */
export interface StatusAlertsRun {
  lastStartedAt: string | null
  lastFinishedAt: string | null
  matched: number
  sent: number
  failed: number
  error: string | null
}

/** lastDoneAt이 STALE_HOURS를 넘긴 수집 종류 */
export interface StatusStale {
  kind: JobKindName
  /** 소수점 1자리 반올림 */
  hoursSinceLastDone: number
}

/** ingest_jobs 상태 합계(종류 무관 전체) */
export interface StatusJobs { running: number; pending: number; failed: number }

export interface StatusStorageTable { name: string; bytes: number }

/** 무료 티어 예산 게이지(012). 파티션 자식 크기는 부모 이름에 합산된다 */
export interface StatusStorage {
  databaseBytes: number
  budgetBytes: number
  /** databaseBytes / budgetBytes, 소수점 3자리 반올림 */
  usedRatio: number
  /** usedRatio >= 0.9 */
  overBudget: boolean
  /** 큰 순서 상위 12개 */
  tables: StatusStorageTable[]
  retention: { bidders: number; notices: number; contracts: number }
}

export interface StatusResponse {
  generatedAt: string
  kinds: StatusKind[]
  /** 최근 알림 실행. 이력이 없으면 null */
  alerts?: StatusAlertsRun | null
  /** 정체된 수집 종류. 없으면 빈 배열 */
  stale?: StatusStale[]
  jobs?: StatusJobs
  storage?: StatusStorage
  stats?: StatusStats
}

export interface CompetitorStats {
  bizNo: string
  name: string
  participated: number
  won: number
  contracts: number
  amount: number
  bidRate: number | null
  winRate: number | null
  agencies: string[]
  lastSeen: string | null
}

export interface CompetitorsResponse { items: CompetitorStats[] }

/** 모든 라우트의 오류 본문 */
export interface ApiErrorResponse { error: string }

export interface DashboardAward {
  /** 가장 최근 done 낙찰 청크의 chunk_start. 수집 이력이 없으면 null */
  date: string | null
  lastDoneAt: string | null
  /** 그 날짜 개찰 낙찰 공고 건수 */
  notices: number
  /** 그 날짜 ingest_jobs.rows 합계(투찰 행 수) */
  rows: number
}

export interface DashboardNotice {
  date: string | null
  count: number
}

export interface DashboardKeywordHit { keyword: string; count: number }

export interface DashboardDeadline {
  id: string
  noticeNo: string
  ord: string
  title: string
  agency: string
  /** 'YYYY-MM-DD HH:mm' 원문 */
  bidClose: string | null
  opening: string | null
  amount: number | null
  url: string | null
}

export type DashboardSourceState = 'ok' | 'waiting' | 'failed' | 'realtime'

export interface DashboardSource {
  kind: JobKindName
  state: DashboardSourceState
  latestChunkStart: string | null
  lastDoneAt: string | null
  rows: number
  pending: number
  failed: number
  done: number
}

export interface DashboardResponse {
  generatedAt: string
  /** 키워드 히트 집계 구간 */
  range: { from: string; to: string }
  award: DashboardAward
  notice: DashboardNotice
  keywords: DashboardKeywordHit[]
  deadlines: DashboardDeadline[]
  sources: DashboardSource[]
  /** 정체된 수집 종류. 없으면 빈 배열 */
  stale?: StatusStale[]
}

/** 업체 프로파일(014) — awards 헤더와 awards.bidder_summary 만으로 만든 지표. bidders(7일 보존)는 쓰지 않는다 */
export interface CompanyProfileMonth {
  /** 'YYYY-MM' */
  month: string
  /** 그 달 낙찰 건수 */
  won: number
  /** 그 달 낙찰 금액 합(final_amount) */
  amount: number
  /** 그 달 낙찰 건의 awards.final_rate 평균. 전부 null이면 null */
  avgWinRate: number | null
}

export interface CompanyProfileAgency { agency: string; won: number; amount: number }

export interface CompanyProfileAward {
  /** `award-${noticeNo}-${ord}` */
  id: string
  noticeNo: string
  ord: string
  /** 'YYYY-MM-DD' */
  openingDate: string
  title: string
  agency: string
  bizDiv: string | null
  amount: number | null
  rate: number | null
}

export interface CompanyProfilePeer {
  /** 숫자만 10자리 */
  bizNo: string
  name: string
  /** 같은 낙찰 공고의 투찰 상위 3위 안에 함께 등장한 횟수 */
  together: number
}

export interface CompanyProfileTotals {
  won: number
  amount: number
  /** 낙찰 시 투찰율(awards.final_rate) 평균. 참여 전체의 평균 투찰율이 아니다 */
  avgWinRate: number | null
  /** 서로 다른 발주기관 수 */
  agencies: number
  firstAwardDate: string | null
  lastAwardDate: string | null
}

export interface CompanyProfileExposure {
  /** bidder_summary.top(상위 3위)에 이 업체가 등장한 낙찰 공고 수 */
  appearances: number
  /** 그중 won=true 인 수 */
  won: number
  /** 상위 3위에 노출됐을 때의 투찰율 평균 */
  avgRate: number | null
}

export interface CompanyProfile {
  /** URL에 들어온 원본 표기 */
  bizNo: string
  /** 숫자만 10자리 */
  plainBizNo: string
  name: string
  ceo: string | null
  address: string | null
  tel: string | null
  /** 집계 구간(YYYY-MM-DD, 양끝 포함) */
  range: { from: string; to: string }
  totals: CompanyProfileTotals
  /** 데이터가 있는 첫 달부터 마지막 달까지 오름차순, 중간 빈 달은 0으로 채운다 */
  months: CompanyProfileMonth[]
  /** 건수 내림차순 최대 10 */
  agencies: CompanyProfileAgency[]
  /** 개찰일 내림차순 최대 20 */
  recent: CompanyProfileAward[]
  /** 동반 노출 횟수 내림차순 최대 10 */
  peers: CompanyProfilePeer[]
  exposure: CompanyProfileExposure
}

/** loadAwardStats가 실제로 사용한 셀의 정의(015). 016 UI가 "무엇을 근거로 한 구간인지" 표시하는 데 쓴다 */
export interface AwardStatsBasis {
  /** 4=기관+구분+금액대+낙찰방법 · 3=구분+금액대+낙찰방법 · 2=구분+낙찰방법 · 1=구분 · 0=전체 */
  level: 0 | 1 | 2 | 3 | 4
  /** 사람이 읽는 셀 이름. 예: '용역 · 1천만~1억원 · 소액수의견적' */
  label: string
  /** level<4면 null */
  agencyCode: string | null
  /** agencies에 이름이 없으면 null */
  agencyName: string | null
  /** level=0이면 null */
  bizDivKey: string | null
  /** level<3이면 null */
  amountBucket: number | null
  /** amountBucket이 null이면 null. to가 null이면 상한 없음 */
  amountRange: { from: number; to: number | null } | null
  /** level<2면 null */
  awardMethod: string | null
  /** 이 셀의 표본 수 */
  n: number
  /** n >= 30 이어서 채택했는가. false면 전체 셀도 30 미만이라 그대로 쓴 것 */
  sufficient: boolean
  /** n<30이라 건너뛴 상위 level 목록(내림차순) */
  fallbackFrom: number[]
  /** 집계 창(YYYY-MM-DD, 양끝 포함) */
  window: { from: string; to: string }
  /** 마지막 집계 시각 ISO */
  computedAt: string
}

/** awards.final_rate 분위수(%) */
export interface AwardStatsRate {
  p10: number | null; p25: number | null; p50: number | null
  p75: number | null; p90: number | null; avg: number | null
}

/** final_rate - lower_limit_rate 분포(%p). n은 rate 표본보다 작을 수 있다 */
export interface AwardStatsMargin {
  n: number
  p10: number | null; p25: number | null; p50: number | null
  p75: number | null; p90: number | null; avg: number | null
}

export interface AwardStatsResult {
  rate: AwardStatsRate
  margin: AwardStatsMargin
  /** 셀의 대표 낙찰하한율 중앙값(%). 표본이 없으면 null */
  lowerLimitP50: number | null
  /** 016 추천 투찰 구간 = rate.p25 ~ rate.p75. 둘 중 하나라도 null이면 null */
  recommended: { from: number; to: number } | null
  basis: AwardStatsBasis
}

/** 016 추천 투찰 구간. 같은 셀을 쓰는 항목들이 cells 인덱스를 공유한다(응답 중복 제거). */
export interface SearchAwardStats {
  cells: AwardStatsResult[]
  /** item.id → cells 인덱스 */
  byItem: Record<string, number>
}

/** award_stats가 비어 있으면 stats는 null */
export interface AwardStatsResponse { stats: AwardStatsResult | null }

/** award_stats 최신성(015) */
export interface StatusStats {
  /** 집계 창. 행이 없으면 null */
  window: { from: string; to: string } | null
  /** award_stats 총 셀 수 */
  cells: number
  /** 마지막 집계 시각 ISO. 행이 없으면 null */
  computedAt: string | null
  /** computedAt이 STALE_HOURS를 넘겼거나 행이 없으면 true. cron health의 ok에는 반영하지 않는다 */
  stale: boolean
}
