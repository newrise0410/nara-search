import { ensurePartitions } from '@nara/db'
import { appUsers, awards, bidders, companies, contracts, memberships, notices, orgs, prespecDocs, prespecProducts, prespecs } from '@nara/db'
import { createTestDb } from '@nara/db/testing'
import type { DbHandle } from '@nara/db'
import type { AuthUser } from '@/server/auth'

/** PGlite + migrations + 2026-07·08 파티션이 준비된 DB */
export async function makeDb(): Promise<DbHandle> {
  const handle = await createTestDb()
  await ensurePartitions(handle.db, ['2026-07-31', '2026-08-15'])
  return handle
}

/** 검색 기간 내 낙찰 1건과 추가 투찰 이력 1건 + 공고 1건 + 계약 1건 + 사전규격 1건(문서 1·품목 1) 시드 */
export async function seedAll(db: DbHandle['db']): Promise<void> {
  await db.insert(companies).values([
    { bizNo: '3148100001', name: '나래기술', ceo: '김나래', address: '대전광역시', tel: '042-000-0001' },
    { bizNo: '2228100002', name: '하늘측량', ceo: '이하늘', address: '세종특별자치시', tel: '044-000-0002' },
  ])
  await db.insert(awards).values({
    bidNtceNo: 'AW-001', ord: '000', openingDate: '2026-08-15', title: '시설 관제 시스템 구축', bizDiv: '용역', bizDivKey: 'Servc',
    ntceInsttCd: 'DTP', ntceInsttNm: '대전테크노파크', dmndInsttCd: 'DTP', dmndInsttNm: '대전테크노파크',
    estimatedPrice: 1200000, reservedPrice: 1100000, baseAmount: 1300000, finalAmount: 1000000, finalRate: 87.5,
    finalDate: '2026-08-16', winnerBizNo: '3148100001', winnerName: '나래기술', winnerCeo: '김나래', bidderCount: 2,
  })
  await db.insert(awards).values({
    bidNtceNo: 'AW-OLD', ord: '000', openingDate: '2026-07-31', title: '이전 투찰 이력', bizDiv: '용역', bizDivKey: 'Servc',
    ntceInsttCd: 'DTP', ntceInsttNm: '대전테크노파크', dmndInsttCd: 'DTP', dmndInsttNm: '대전테크노파크',
  })
  await db.insert(bidders).values([
    { bidNtceNo: 'AW-001', awardOrd: '000', openingDate: '2026-08-15', bizNo: '3148100001', rank: 1, amount: 1000000, rate: 87.5, bidDate: '2026-08-15', won: true, result: '낙찰' },
    { bidNtceNo: 'AW-001', awardOrd: '000', openingDate: '2026-08-15', bizNo: '2228100002', rank: 2, amount: 1050000, rate: 91.875, bidDate: '2026-08-15', won: false, result: '유찰' },
    { bidNtceNo: 'AW-OLD', awardOrd: '000', openingDate: '2026-07-31', bizNo: '3148100001', rank: 1, amount: 900000, rate: 90, bidDate: '2026-07-31', won: false, result: '유찰' },
  ])
  await db.insert(notices).values({
    bidNtceNo: 'NT-001', ord: '000', title: '시설 관제 시스템 구축 입찰공고', status: '공고', bizDiv: '용역', noticeDate: '2026-08-15',
    ntceInsttCd: 'DTP', ntceInsttNm: '대전테크노파크', dmndInsttCd: 'DTP', dmndInsttNm: '대전테크노파크',
    contractMethod: '일반경쟁', awardMethod: '협상에 의한 계약', contractForm: '총액계약', electronic: true,
    bidClose: '2026-08-20 17:00', opening: '2026-08-21 10:00', budgetAmt: 1500000, estimatedPrice: 1200000, noticeUrl: 'https://example.com/notices/NT-001',
    attachments: [{ url: 'https://example.com/files/NT-001-spec.hwp', name: '과업지시서.hwp' }], detailUrl: 'https://example.com/notices/NT-001/detail',
    lowerLimitRate: 87.745, productClass: '전산장비', noticeKind: '등록공고', prespecNo: 'PS-001', prespecLinkedAt: new Date('2026-08-16T00:00:00Z'), source: 'bidpublic',
  })
  await db.insert(contracts).values({
    cntrctNo: 'CT-001', ord: '00', unifiedNo: 'UC-001', title: '시설 관제 시스템 계약', bizDiv: '용역', contractForm: '총액계약',
    contractMethod: '일반경쟁', concludeDate: '2026-08-18', period: '2026-09-01~2026-12-31', amount: 500000, totalAmount: 500000,
    bidNtceNo: 'NT-001', bidNtceOrd: '000', bidNtceNm: '시설 관제 시스템 구축 입찰공고', openingDate: '2026-08-15',
    cntrctInsttCd: 'DTP', cntrctInsttNm: '대전테크노파크', cntrctInsttDiv: '지방공기업', dmndInsttCd: 'DTP', dmndInsttNm: '대전테크노파크',
    companyBizNo: '3148100001', companyName: '나래기술', companyCeo: '김나래', companyAddress: '대전광역시', companyTel: '042-000-0001', domestic: true,
  })
  await db.insert(prespecs).values({
    bfSpecRgstNo: 'PS-001', bizDiv: '용역', bizDivKey: 'Servc', refNo: 'REF-001', title: '시설 관제 사전규격',
    orderInsttNm: '대전테크노파크', dminsttNm: '대전테크노파크', budgetAmt: 900000, receiptDate: '2026-08-15', receiptAt: '2026-08-15 09:00',
    opinionCloseAt: '2026-08-20 18:00', deliveryDeadlineAt: '2026-12-31', deliveryDays: 120, officer: '박담당', officerTel: '042-000-0003',
    relatedNoticeNos: ['NT-001'], changedAt: '2026-08-16 10:00',
  })
  await db.insert(prespecDocs).values({ bfSpecRgstNo: 'PS-001', seq: 1, url: 'https://example.com/specs/PS-001.pdf' })
  await db.insert(prespecProducts).values({ bfSpecRgstNo: 'PS-001', seq: 1, code: '4321150102', name: '시설 관제 서버' })
}

/** 라우트 테스트용 고정 사용자 */
export const TEST_USER: AuthUser = { id: '00000000-0000-4000-8000-000000000001', email: 'tester@example.com' }

/** TEST_USER의 개인 org id (= TEST_USER.id) */
export const TEST_ORG_ID = TEST_USER.id

/** 사용자 격리 테스트용 두 번째 계정 */
export const TEST_USER_B: AuthUser = { id: '00000000-0000-4000-8000-000000000002', email: 'other@example.com' }

/** 사용자를 특정 org의 멤버로 만들고 app_users·memberships 삽입을 멱등하게 처리한다 */
export async function joinOrg(db: DbHandle['db'], orgId: string, user: AuthUser, role: 'owner' | 'member' = 'member'): Promise<void> {
  await db.insert(orgs).values({ id: orgId, name: '테스트 워크스페이스' }).onConflictDoNothing()
  await db.insert(appUsers).values(user).onConflictDoNothing()
  await db.insert(memberships).values({ orgId, userId: user.id, role }).onConflictDoNothing()
}
