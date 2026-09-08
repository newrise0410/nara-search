export type SearchKind = 'award' | 'notice' | 'prespec' | 'contract'

/** 알림 규칙이 고를 수 있는 항목 종류. 'prespec-link'는 검색에는 없고 알림에만 있다(013) */
export type AlertKind = SearchKind | 'prespec-link'
export const ALERT_KIND_VALUES: readonly AlertKind[] = ['notice', 'award', 'prespec', 'contract', 'prespec-link']

/** 사전규격 → 본공고 전환 항목(013)에만 붙는 마커. 이게 있으면 알림 종류는 'prespec-link'다 */
export interface PrespecTransition {
  prespecNo: string
  bidNtceNo: string
  ord: string
  /** 전환을 처음 관측한 시각 (ISO 8601) */
  linkedAt?: string
}

/** 사전규격에 연결된 본공고 요약(013) */
export interface ConvertedNotice {
  bidNtceNo: string
  ord: string
  title: string
  noticeDate?: string
}

export interface Item {
  id: string
  kind: SearchKind
  noticeNo: string
  title: string
  agency: string
  demandAgency?: string
  amount?: number        // 추정가격/낙찰금액/배정예산
  date: string           // 공고일/개찰일/공개일 (ISO)
  deadline?: string
  winner?: string
  winnerBizNo?: string
  awardRate?: number     // 낙찰률(%)
  region?: string
  url?: string
  tags?: string[]        // 프로필 규칙으로 부여
  prespec?: PrespecDetail   // kind === 'prespec'
  notice?: NoticeDetail     // kind === 'notice'
  award?: AwardDetail       // kind === 'award'
  contract?: ContractDetail // kind === 'contract'
  /** 사전규격 → 본공고 전환 항목(013). 알림 파이프라인에서만 채워진다 */
  transition?: PrespecTransition
}

/** 항목의 알림 종류 — 전환 항목만 'prespec-link'로 본다 */
export const alertKindOf = (item: Item): AlertKind => item.transition ? 'prespec-link' : item.kind

export interface NoticeAttachment { url: string; name?: string }

export interface NoticeDetail {
  ord: string; status?: string; bizDiv?: string
  /** 발주기관코드(ntceInsttCd). award_stats 셀 매핑(016)에 쓴다 */
  agencyCode?: string
  contractMethod?: string; awardMethod?: string; contractForm?: string
  international?: boolean; joint?: boolean; electronic?: boolean
  officer?: string; officerTel?: string; officerDept?: string
  briefing?: { date?: string; time?: string; place?: string }
  qualificationDeadline?: string; bidBegin?: string; bidClose?: string; opening?: string; openingPlace?: string
  budget?: number; estimatedPrice?: number; priceMethod?: string
  regionLimit?: boolean; regions?: string; industryLimit?: boolean; industries?: string
  /* 입찰공고정보서비스(bidpublic) 유래 필드 — 표준서비스만으로 수집된 공고에는 비어 있다 */
  detailUrl?: string
  attachments?: NoticeAttachment[]
  lowerLimitRate?: number      // 낙찰하한율 %
  productClass?: string        // 품명 분류명
  prespecNo?: string           // 연계 사전규격등록번호
  prespecLinkedAt?: string     // 사전규격 연결을 처음 관측한 시각 (ISO). DB 경로에서만 채워진다
  reNotice?: boolean           // 재공고 여부
  noticeKind?: string          // 공고종류 (등록공고/취소공고 …)
}
export interface Bidder {
  rank?: number; name: string; bizNo?: string; ceo?: string; amount?: number; rate?: number; date?: string
  won: boolean; disqualifiedReason?: string; result?: string
}
export interface AwardDetail {
  ord: string
  /** 발주기관코드(ntceInsttCd). award_stats 셀 매핑(016)에 쓴다 */
  agencyCode?: string
  bizDiv?: string; contractMethod?: string; awardMethod?: string; contractForm?: string
  lowerLimitRate?: number; estimatedPrice?: number; reservedPrice?: number; baseAmount?: number
  openingDate?: string; openingTime?: string
  finalAmount?: number; finalRate?: number; finalDate?: string
  winnerCeo?: string; winnerAddress?: string; winnerTel?: string
  bidders: Bidder[]
}
export interface ContractDetail {
  contractNo: string; unifiedNo?: string; ord?: string; bizDiv?: string
  contractForm?: string; contractMethod?: string; longTerm?: string; joint?: boolean
  period?: string; amount?: number; totalAmount?: number; url?: string
  noticeNo?: string; noticeName?: string; openingDate?: string; reservedPrice?: number; privateReason?: string
  contractAgency?: string; contractAgencyType?: string; demandAgencyType?: string
  company?: string; companyBizNo?: string; companyCeo?: string; companyAddress?: string; companyTel?: string; domestic?: boolean
}

export type PrespecBizDiv = 'Thng' | 'Servc' | 'Cnstwk' | 'Frgcpt'

export interface PrespecDetail {
  bizDiv?: string             // 물품/용역/공사/외자
  refNo?: string
  opinionDeadline?: string    // 의견등록마감일시
  deliveryDeadline?: string
  deliveryDays?: number
  officer?: string
  officerTel?: string
  swBiz?: boolean
  specDocs: string[]          // 규격문서 파일 URL
  products: { seq: number; code: string; name: string }[]
  relatedNoticeNos: string[]  // 연계 입찰공고번호
  /** 실제로 존재하는 본공고(013). DB 검색 경로에서만 채워진다 — 실시간 조회 결과에는 없다 */
  convertedNotices?: ConvertedNotice[]
  changedAt?: string
}

export interface SearchQuery {
  kind: SearchKind
  keyword: string
  from: string
  to: string
  bizDiv: PrespecBizDiv | 'all'   // 사전규격 업무구분
  agency?: string                 // 공고기관명 필터
  source?: 'db' | 'live'          // 미지정 = 'db'
}

/** 사용자 커스텀 도메인 프로필 */
export interface Category {
  id: string
  name: string
  color: string
  include: string[]   // 하나라도 포함되면 매칭
  exclude: string[]   // 하나라도 포함되면 제외
}
export interface Profile {
  id: string
  name: string
  description?: string
  categories: Category[]
  requirementKeywords: string[]  // 공고 본문에서 강조할 요건 단어 (자격/장비/보험 등)
  defaultKeywords: string[]      // 프로필 활성화 시 검색어 추천
}

export interface Competitor { bizNo: string; name: string }
export interface Preset { id: string; name: string; query: SearchQuery }
