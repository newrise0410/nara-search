import { sql } from 'drizzle-orm'
import {
  pgTable, text, date, integer, bigint, bigserial, numeric, boolean, doublePrecision,
  timestamp, primaryKey, index, uniqueIndex, uuid, jsonb, check,
} from 'drizzle-orm/pg-core'

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow()

/* ── 기관 ── */
export const agencies = pgTable('agencies', {
  code: text().primaryKey(),
  name: text().notNull().default(''),
  updatedAt: now(),
}, (t) => [index('agencies_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`)])

/* ── 업체 ── */
export const companies = pgTable('companies', {
  bizNo: text().primaryKey(),
  name: text().notNull().default(''),
  ceo: text(),
  address: text(),
  tel: text(),
  updatedAt: now(),
}, (t) => [index('companies_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`)])

/* ── 입찰공고 (파티션 없음) ── */
export const notices = pgTable('notices', {
  bidNtceNo: text().notNull(),
  ord: text().notNull(),
  title: text().notNull().default(''),
  status: text(),
  bizDiv: text(),
  noticeDate: date(),
  ntceInsttCd: text(), ntceInsttNm: text(),
  dmndInsttCd: text(), dmndInsttNm: text(),
  contractMethod: text(),
  awardMethod: text(),
  contractForm: text(),
  international: boolean().notNull().default(false),
  joint: boolean().notNull().default(false),
  electronic: boolean().notNull().default(false),
  officer: text(), officerTel: text(), officerDept: text(),
  briefing: boolean().notNull().default(false),
  briefingDate: date(), briefingTime: text(), briefingPlace: text(),
  qualificationDeadline: text(),
  bidBegin: text(), bidClose: text(), opening: text(), openingPlace: text(),
  budgetAmt: numeric({ precision: 18, scale: 2, mode: 'number' }),
  estimatedPrice: numeric({ precision: 18, scale: 2, mode: 'number' }),
  priceMethod: text(),
  regionLimit: boolean().notNull().default(false),
  regions: text(),
  industryLimit: boolean().notNull().default(false),
  industries: text(),
  noticeUrl: text(),
  /** 입찰공고정보서비스 ntceSpecDocUrl1..10 / ntceSpecFileNm1..10 */
  attachments: jsonb().$type<{ url: string; name?: string }[]>().notNull().default(sql`'[]'::jsonb`),
  detailUrl: text(),
  lowerLimitRate: doublePrecision(),
  productClass: text(),
  noticeKind: text(),
  prespecNo: text(),
  /** 사전규격 번호가 처음 붙은 것을 관측한 시각(013). null 이면 미관측 — 0011 이전 행은 채우지 않는다 */
  prespecLinkedAt: timestamp({ withTimezone: true }),
  reNotice: boolean().notNull().default(false),
  source: text(),
  ingestedAt: now(),
  updatedAt: now(),
}, (t) => [
  primaryKey({ columns: [t.bidNtceNo, t.ord] }),
  index('notices_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
  index('notices_notice_date_idx').on(t.noticeDate),
  index('notices_ntce_instt_cd_idx').on(t.ntceInsttCd),
  index('notices_updated_at_idx').on(t.updatedAt),
  /** 사전규격 → 본공고 역추적(013). 45%만 값이 있어 부분 인덱스로 만든다 */
  index('notices_prespec_no_idx').on(t.prespecNo).where(sql`${t.prespecNo} is not null`),
])

/** awards.bidder_summary.top 항목 — 순위 상위 3 */
export interface BidderSummaryTop {
  rank: number
  bizNo: string
  name: string
  amount: number | null
  rate: number | null
  won: boolean
}

/** awards.bidder_summary — 투찰 상세행을 파기해도 남는 요약 */
export interface BidderSummary {
  n: number
  medianRate: number | null
  minRate: number | null
  maxRate: number | null
  top: BidderSummaryTop[]
}

/* ── 낙찰 공고 헤더 (월 파티션) ── */
export const awards = pgTable('awards', {
  bidNtceNo: text().notNull(),
  ord: text().notNull(),
  openingDate: date().notNull(),
  title: text().notNull().default(''),
  bizDiv: text(),
  bizDivKey: text().notNull().default(''),
  ntceInsttCd: text(), ntceInsttNm: text(),
  dmndInsttCd: text(), dmndInsttNm: text(),
  contractMethod: text(), awardMethod: text(), contractForm: text(),
  lowerLimitRate: doublePrecision(),
  /** 금액은 numeric(18,2) — 외자(Frgcpt) 소수점 금액을 원값으로 보존한다(011). drizzle mode:'number' 라 TS 타입은 number */
  estimatedPrice: numeric({ precision: 18, scale: 2, mode: 'number' }),
  reservedPrice: numeric({ precision: 18, scale: 2, mode: 'number' }),
  baseAmount: numeric({ precision: 18, scale: 2, mode: 'number' }),
  openingTime: text(),
  finalAmount: numeric({ precision: 18, scale: 2, mode: 'number' }),
  finalRate: doublePrecision(),
  finalDate: date(),
  winnerBizNo: text(), winnerName: text(), winnerCeo: text(),
  winnerAddress: text(), winnerTel: text(),
  bidderCount: integer().notNull().default(0),
  /** 투찰 요약(012) — bidders를 7일 뒤 파기해도 남는 영구 통계. 생성기는 apps/worker/src/summary.ts */
  bidderSummary: jsonb().$type<BidderSummary>(),
  ingestedAt: now(),
  updatedAt: now(),
}, (t) => [
  primaryKey({ columns: [t.bidNtceNo, t.ord, t.openingDate] }),
  index('awards_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
  index('awards_opening_date_idx').on(t.openingDate),
  index('awards_winner_biz_no_idx').on(t.winnerBizNo),
  index('awards_updated_at_idx').on(t.updatedAt),
])

/* ── 투찰 행 (월 파티션, 인덱스 최소) ── */
export const bidders = pgTable('bidders', {
  bidNtceNo: text().notNull(),
  awardOrd: text().notNull(),
  openingDate: date().notNull(),
  bizNo: text().notNull().default(''),
  rank: integer().notNull().default(0),
  amount: numeric({ precision: 18, scale: 2, mode: 'number' }),
  rate: doublePrecision(),
  bidDate: date(),
  won: boolean().notNull().default(false),
  disqualifiedReason: text(),
  result: text(),
}, (t) => [
  primaryKey({ columns: [t.bidNtceNo, t.awardOrd, t.openingDate, t.bizNo, t.rank] }),
  index('bidders_biz_no_idx').on(t.bizNo),
])

/* ── 계약 (파티션 없음) ── */
export const contracts = pgTable('contracts', {
  cntrctNo: text().notNull(),
  ord: text().notNull().default('00'),
  unifiedNo: text(),
  title: text().notNull().default(''),
  bizDiv: text(),
  contractForm: text(), contractMethod: text(), longTerm: text(),
  joint: boolean().notNull().default(false),
  concludeDate: date(),
  period: text(),
  amount: numeric({ precision: 18, scale: 2, mode: 'number' }),
  totalAmount: numeric({ precision: 18, scale: 2, mode: 'number' }),
  infoUrl: text(),
  bidNtceNo: text(), bidNtceOrd: text(), bidNtceNm: text(), noticeUrl: text(),
  openingDate: date(), reservedPrice: numeric({ precision: 18, scale: 2, mode: 'number' }), privateReason: text(),
  cntrctInsttCd: text(), cntrctInsttNm: text(), cntrctInsttDiv: text(),
  dmndInsttCd: text(), dmndInsttNm: text(), dmndInsttDiv: text(),
  companyBizNo: text(), companyName: text(), companyCeo: text(),
  companyAddress: text(), companyTel: text(),
  domestic: boolean().notNull().default(false),
  ingestedAt: now(),
  updatedAt: now(),
}, (t) => [
  primaryKey({ columns: [t.cntrctNo, t.ord] }),
  index('contracts_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
  index('contracts_conclude_date_idx').on(t.concludeDate),
  index('contracts_bid_ntce_no_idx').on(t.bidNtceNo),
  index('contracts_updated_at_idx').on(t.updatedAt),
])

/* ── 사전규격 ── */
export const prespecs = pgTable('prespecs', {
  bfSpecRgstNo: text().primaryKey(),
  bizDiv: text(),
  bizDivKey: text().notNull().default(''),
  refNo: text(),
  title: text().notNull().default(''),
  orderInsttNm: text(),
  dminsttNm: text(),
  budgetAmt: numeric({ precision: 18, scale: 2, mode: 'number' }),
  receiptDate: date(),
  receiptAt: text(),
  opinionCloseAt: text(),
  deliveryDeadlineAt: text(),
  deliveryDays: integer(),
  officer: text(), officerTel: text(),
  swBiz: boolean().notNull().default(false),
  registeredAt: text(),
  changedAt: text(),
  relatedNoticeNos: text().array().notNull().default(sql`'{}'::text[]`),
  ingestedAt: now(),
  updatedAt: now(),
}, (t) => [
  index('prespecs_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
  index('prespecs_receipt_date_idx').on(t.receiptDate),
  index('prespecs_updated_at_idx').on(t.updatedAt),
])

export const prespecDocs = pgTable('prespec_docs', {
  bfSpecRgstNo: text().notNull(),
  seq: integer().notNull(),
  url: text().notNull(),
}, (t) => [primaryKey({ columns: [t.bfSpecRgstNo, t.seq] })])

export const prespecProducts = pgTable('prespec_products', {
  bfSpecRgstNo: text().notNull(),
  seq: integer().notNull(),
  code: text().notNull().default(''),
  name: text().notNull().default(''),
}, (t) => [primaryKey({ columns: [t.bfSpecRgstNo, t.seq] })])

/* ── 수집 체크포인트 ── */
export const ingestJobs = pgTable('ingest_jobs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  kind: text().notNull(),
  bizDiv: text().notNull().default(''),
  chunkStart: date().notNull(),
  chunkEnd: date().notNull(),
  nextPage: integer().notNull().default(1),
  status: text().notNull().default('pending'),
  rows: integer().notNull().default(0),
  totalCount: integer(),
  attempts: integer().notNull().default(0),
  deferrals: integer().notNull().default(0),
  error: text(),
  createdAt: now(),
  updatedAt: now(),
}, (t) => [
  uniqueIndex('ingest_jobs_key_uq').on(t.kind, t.bizDiv, t.chunkStart),
  index('ingest_jobs_pick_idx').on(t.status, t.chunkStart),
])

/* ── 앱 사용자 (id = Supabase auth.users.id. 이메일 외 개인정보는 저장하지 않는다) ── */
export const appUsers = pgTable('app_users', {
  id: uuid().primaryKey(),
  email: text().notNull(),
  createdAt: now(),
  lastSignInAt: now(),
})

/* ── 조직(워크스페이스) ── */
export const orgs = pgTable('orgs', {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  name: text().notNull(),
  plan: text().notNull().default('free'),
  createdAt: now(),
})

/* ── 조직 멤버십 ── */
export const memberships = pgTable('memberships', {
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  role: text().notNull(),
  createdAt: now(),
}, (t) => [
  primaryKey({ columns: [t.orgId, t.userId] }),
  index('memberships_user_id_idx').on(t.userId),
  check('memberships_role_check', sql`${t.role} in ('owner','member')`),
])

/* ── 조직 초대 (토큰 원문은 저장하지 않는다 — sha256 해시만 보관하고 원문은 메일 링크에만 있다) ── */
export const orgInvites = pgTable('org_invites', {
  id: uuid().primaryKey(),
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  email: text().notNull(),
  role: text().notNull().default('member'),
  tokenHash: text().notNull(),
  invitedBy: uuid().references(() => appUsers.id, { onDelete: 'set null' }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  acceptedAt: timestamp({ withTimezone: true }),
  createdAt: now(),
}, (t) => [
  uniqueIndex('org_invites_token_hash_uq').on(t.tokenHash),
  uniqueIndex('org_invites_org_id_email_uq').on(t.orgId, t.email),
  check('org_invites_role_check', sql`${t.role} in ('owner','member')`),
])

/* ── 사용자 데이터 (계정별. app_users 삭제 시 함께 사라진다) ── */
export const userProfiles = pgTable('user_profiles', {
  id: uuid().primaryKey(),
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  name: text().notNull().default(''),
  description: text(),
  categories: jsonb().notNull().default(sql`'[]'::jsonb`),
  requirementKeywords: text().array().notNull().default(sql`'{}'::text[]`),
  defaultKeywords: text().array().notNull().default(sql`'{}'::text[]`),
  sortOrder: integer().notNull().default(0),
  createdAt: now(),
  updatedAt: now(),
}, (t) => [index('user_profiles_user_id_idx').on(t.userId), index('user_profiles_org_id_idx').on(t.orgId)])

export const userSettings = pgTable('user_settings', {
  userId: uuid().primaryKey().references(() => appUsers.id, { onDelete: 'cascade' }),
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  activeOrgId: uuid().references(() => orgs.id, { onDelete: 'set null' }),
  activeProfileId: uuid().references(() => userProfiles.id, { onDelete: 'set null' }),
  theme: text().notNull().default('light'),
  updatedAt: now(),
}, (t) => [index('user_settings_org_id_idx').on(t.orgId)])

export const userKeywords = pgTable('user_keywords', {
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  keyword: text().notNull(),
  sortOrder: integer().notNull().default(0),
  createdAt: now(),
}, (t) => [primaryKey({ columns: [t.userId, t.keyword] }), index('user_keywords_org_id_idx').on(t.orgId)])

export const userCompetitors = pgTable('user_competitors', {
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  bizNo: text().notNull(),
  name: text().notNull().default(''),
  sortOrder: integer().notNull().default(0),
  createdAt: now(),
}, (t) => [primaryKey({ columns: [t.userId, t.bizNo] }), index('user_competitors_org_id_idx').on(t.orgId)])

export const userPresets = pgTable('user_presets', {
  id: uuid().primaryKey(),
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  name: text().notNull().default(''),
  query: jsonb().notNull().default(sql`'{}'::jsonb`),
  sortOrder: integer().notNull().default(0),
  createdAt: now(),
}, (t) => [index('user_presets_user_id_idx').on(t.userId), index('user_presets_org_id_idx').on(t.orgId)])

export const userRecentSearches = pgTable('user_recent_searches', {
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  keyword: text().notNull(),
  sortOrder: integer().notNull().default(0),
  searchedAt: now(),
}, (t) => [primaryKey({ columns: [t.userId, t.keyword] }), index('user_recent_searches_org_id_idx').on(t.orgId)])

/* ── 알림 채널 (계정별. config 안의 비밀값은 ALERT_SECRET_KEY로 봉인해 저장한다) ── */
export const alertChannels = pgTable('alert_channels', {
  id: uuid().primaryKey(),
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  type: text().notNull(),
  label: text().notNull().default(''),
  config: jsonb().notNull().default(sql`'{}'::jsonb`),
  enabled: boolean().notNull().default(true),
  createdAt: now(),
  updatedAt: now(),
}, (t) => [
  index('alert_channels_user_id_idx').on(t.userId),
  index('alert_channels_org_id_idx').on(t.orgId),
  check('alert_channels_type_check', sql`${t.type} in ('kakao','email','webhook','webpush')`),
])

/* ── 알림 규칙 ── */
export const alertRules = pgTable('alert_rules', {
  id: uuid().primaryKey(),
  orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  userId: uuid().notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  name: text().notNull().default(''),
  enabled: boolean().notNull().default(true),
  kinds: text().array().notNull().default(sql`'{}'::text[]`),
  keywords: text().array().notNull().default(sql`'{}'::text[]`),
  profileId: uuid().references(() => userProfiles.id, { onDelete: 'set null' }),
  categoryNames: text().array().notNull().default(sql`'{}'::text[]`),
  agency: text(),
  amountMin: bigint({ mode: 'number' }),
  amountMax: bigint({ mode: 'number' }),
  channelIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
  digest: text().notNull().default('instant'),
  createdAt: now(),
  updatedAt: now(),
}, (t) => [
  index('alert_rules_user_id_idx').on(t.userId),
  index('alert_rules_org_id_idx').on(t.orgId),
  index('alert_rules_enabled_idx').on(t.enabled),
  check('alert_rules_digest_check', sql`${t.digest} in ('instant','daily')`),
])

/* ── 발송 이력 = 중복 발송 차단 장부. channel_id는 FK가 아니다(채널을 지워도 이력은 남긴다) ── */
export const alertDeliveries = pgTable('alert_deliveries', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  ruleId: uuid().notNull().references(() => alertRules.id, { onDelete: 'cascade' }),
  itemId: text().notNull(),
  channelId: uuid().notNull(),
  sentAt: now(),
  status: text().notNull().default('pending'),
  error: text(),
}, (t) => [
  uniqueIndex('alert_deliveries_uq').on(t.ruleId, t.itemId, t.channelId),
  index('alert_deliveries_sent_at_idx').on(t.sentAt),
])

/* ── 평가기 실행 이력. 다음 실행의 since 기준점 ── */
export const alertRuns = pgTable('alert_runs', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  startedAt: now(),
  finishedAt: timestamp({ withTimezone: true }),
  matched: integer().notNull().default(0),
  sent: integer().notNull().default(0),
  failed: integer().notNull().default(0),
  error: text(),
}, (t) => [index('alert_runs_finished_at_idx').on(t.finishedAt)])

/* ── 낙찰 통계 사전집계(015) ── */

/** 차원 생략 센티널. awards 실데이터에 '*' 표기가 없음을 확인하고 고른 값이다 */
export const AWARD_STATS_ANY = '*'
/** amount_bucket의 "금액 무관" 센티널 */
export const AWARD_STATS_BUCKET_ANY = -1

/**
 * 낙찰 통계 셀(015). 한 번의 rebuild가 테이블 전체를 교체한다 — 모든 행의 window_from/window_to가 같다.
 * level: 4=기관+구분+버킷+방법 · 3=구분+버킷+방법 · 2=구분+방법 · 1=구분 · 0=전체.
 * 생략된 차원은 텍스트 '*', 금액 버킷은 -1을 담는다(NULL을 쓰지 않는 이유: PK에 NULL을 넣을 수 없다).
 */
export const awardStats = pgTable('award_stats', {
  level: integer().notNull(),
  /** awards.ntce_instt_cd. level<4면 '*' */
  agencyCode: text().notNull(),
  /** awards.biz_div_key. level=0이면 '*' */
  bizDivKey: text().notNull(),
  /** floor(log10(estimated_price))를 5~10으로 클램프. level<3이면 -1 */
  amountBucket: integer().notNull(),
  /** awards.award_method. level<2면 '*' */
  awardMethod: text().notNull(),
  /** 집계에 쓴 개찰일 구간(양끝 포함) */
  windowFrom: date().notNull(),
  windowTo: date().notNull(),
  /** final_rate 표본 수 */
  n: integer().notNull(),
  rateP10: doublePrecision(), rateP25: doublePrecision(), rateP50: doublePrecision(),
  rateP75: doublePrecision(), rateP90: doublePrecision(), rateAvg: doublePrecision(),
  /** final_rate와 lower_limit_rate가 모두 있는 표본 수. n보다 작을 수 있다 */
  marginN: integer().notNull(),
  marginP10: doublePrecision(), marginP25: doublePrecision(), marginP50: doublePrecision(),
  marginP75: doublePrecision(), marginP90: doublePrecision(), marginAvg: doublePrecision(),
  /** 셀의 대표 낙찰하한율(중앙값) */
  lowerLimitP50: doublePrecision(),
  computedAt: now(),
}, (t) => [
  primaryKey({ columns: [t.level, t.agencyCode, t.bizDivKey, t.amountBucket, t.awardMethod] }),
])
