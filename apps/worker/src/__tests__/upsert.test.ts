import { afterEach, describe, expect, it } from 'vitest'
import { createTestDb } from '@nara/db/testing'
import { agencies, awards, bidders, companies, ensurePartitions, notices } from '@nara/db'
import type { DbHandle } from '@nara/db'
import { recomputeBidderCounts, upsertAwardPage, upsertNoticePage, upsertNoticePageLive } from '../upsert'

describe('upsertAwardPage', () => {
  let handle: DbHandle | undefined
  afterEach(async () => { await handle?.close(); handle = undefined })

  it('한 페이지의 낙찰 행을 헤더·투찰·업체·기관으로 매핑하고 공고 중복도 처리한다', async () => {
    handle = await createTestDb()
    const rows = [
      { bidNtceNo: 'A', bidNtceOrd: '000', bidNtceNm: '측량 용역', opengDate: '20260815', opengRank: '2', bidprcCorpBizrno: '123', bidprcCorpNm: '을 업체', bidprcCorpCeoNm: '을대표', bidprcAmt: '110', sucsfYn: 'N', ntceInsttCd: 'I1', ntceInsttNm: '기관', fnlSucsfCorpBizrno: '999', fnlSucsfCorpNm: '갑 업체', fnlSucsfCorpCeoNm: '갑대표' },
      { bidNtceNo: 'A', bidNtceOrd: '000', bidNtceNm: '측량 용역', opengDate: '20260815', opengRank: '1', bidprcCorpBizrno: '999', bidprcCorpNm: '갑 업체', bidprcCorpCeoNm: '갑대표', bidprcAmt: '100', sucsfYn: 'Y', ntceInsttCd: 'I1', ntceInsttNm: '기관', fnlSucsfCorpBizrno: '999', fnlSucsfCorpNm: '갑 업체', fnlSucsfCorpAdrs: '서울' },
    ]
    const result = await upsertAwardPage(handle.db, rows, 'Servc')
    expect(result).toEqual({ awards: 1, bidders: 2 })
    expect(await handle.db.select().from(awards)).toHaveLength(1)
    expect(await handle.db.select().from(bidders)).toHaveLength(2)
    expect(await handle.db.select().from(companies)).toHaveLength(2)
    expect(await handle.db.select().from(agencies)).toHaveLength(1)
  })

  it('외자 소수점 금액을 반올림 없이 저장한다', async () => {
    handle = await createTestDb()
    await upsertAwardPage(handle.db, [{
      bidNtceNo: 'F', bidNtceOrd: '000', bidNtceNm: '외자 구매', opengDate: '20260826', opengRank: '1',
      bidprcCorpBizrno: '777', bidprcCorpNm: '외자 업체', bidprcAmt: '123456.78', sucsfYn: 'Y',
      presmptPrce: '130000.55', rsrvtnPrce: '129000.49', bssAmt: '128000.005',
      fnlSucsfAmt: '123456.78', fnlSucsfCorpBizrno: '777', fnlSucsfCorpNm: '외자 업체',
    }], 'Frgcpt')
    await upsertAwardPage(handle.db, [{
      bidNtceNo: 'I', bidNtceOrd: '000', bidNtceNm: '정수 구매', opengDate: '20260826', opengRank: '1',
      bidprcCorpBizrno: '888', bidprcCorpNm: '정수 업체', bidprcAmt: '1000000', sucsfYn: 'Y',
    }], 'Servc')

    const award = (await handle.db.select().from(awards)).find((row) => row.bidNtceNo === 'F')
    const integerBidder = (await handle.db.select().from(bidders)).find((row) => row.bidNtceNo === 'I')
    expect(award).toMatchObject({ finalAmount: 123456.78, estimatedPrice: 130000.55, reservedPrice: 129000.49, baseAmount: 128000.01 })
    expect(integerBidder?.amount).toBe(1000000)
    expect((await handle.db.select().from(bidders)).find((row) => row.bidNtceNo === 'F')?.amount).toBe(123456.78)
  })

  it('numeric(18,2) 상한을 넘는 금액은 저장하지 않는다', async () => {
    handle = await createTestDb()
    await upsertAwardPage(handle.db, [{
      bidNtceNo: 'OVER', bidNtceOrd: '000', bidNtceNm: '상한 초과', opengDate: '20260826', opengRank: '1',
      bidprcCorpBizrno: '999', bidprcCorpNm: '초과 업체', bidprcAmt: '10000000000000000', sucsfYn: 'Y',
      fnlSucsfAmt: '10000000000000000', fnlSucsfCorpBizrno: '999', fnlSucsfCorpNm: '초과 업체',
    }], 'Frgcpt')
    const award = (await handle.db.select().from(awards))[0]
    expect(award?.finalAmount).toBeNull()
  })

  it('upsertNoticePageLive는 응답에 없는 컬럼의 기존 값을 보존한다', async () => {
    handle = await createTestDb()
    await upsertNoticePage(handle.db, [{ bidNtceNo: 'N1', bidNtceOrd: '000', bidNtceNm: '원본 공고', bidNtceSttusNm: '공고', intrntnlBidYn: 'Y', ntceInsttOfclDeptNm: '구매팀', bidprcPsblIndstrytyNm: '정보통신' }])
    await upsertNoticePageLive(handle.db, [{ bidNtceNo: 'N1', bidNtceOrd: '000', bidNtceNm: '수정 공고', sucsfbidMthdNm: '적격심사' }])
    const rows = await handle.db.select().from(notices)
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('수정 공고')
    expect(rows[0].awardMethod).toBe('적격심사')
    expect(rows[0].status).toBe('공고')
    expect(rows[0].international).toBe(true)
    expect(rows[0].officerDept).toBe('구매팀')
    expect(rows[0].industries).toBe('정보통신')
  })

  it('upsertNoticePageLive는 응답에 근거가 없으면 boolean true를 유지한다', async () => {
    handle = await createTestDb()
    await upsertNoticePage(handle.db, [{ bidNtceNo: 'N3', bidNtceOrd: '000', bidNtceNm: '원본 공고', elctrnBidYn: 'Y', presnatnOprtnYn: 'Y', indstrytyLmtYn: 'Y' }])
    await upsertNoticePageLive(handle.db, [{ bidNtceNo: 'N3', bidNtceOrd: '000', bidNtceNm: '실시간 갱신' }])
    const preserved = (await handle.db.select().from(notices))[0]
    expect(preserved.electronic).toBe(true)
    expect(preserved.briefing).toBe(true)
    expect(preserved.industryLimit).toBe(true)

    await upsertNoticePageLive(handle.db, [{ bidNtceNo: 'N4', bidNtceNm: '신규 공고', bidMethdNm: '전자시담', indstrytyLmtYn: 'Y', dcmtgOprtnDt: '2026-08-10 10:00:00' }])
    const created = (await handle.db.select().from(notices)).find((row) => row.bidNtceNo === 'N4')
    expect(created?.electronic).toBe(true)
    expect(created?.briefing).toBe(true)
    expect(created?.industryLimit).toBe(true)
  })

  it('upsertNoticePageLive가 첨부와 상세URL을 저장한다', async () => {
    handle = await createTestDb()
    await upsertNoticePageLive(handle.db, [{
      bidNtceNo: 'N2', bidNtceOrd: '000', bidNtceNm: '첨부 공고', bidNtceDt: '2026-08-05 10:00:00', bidNtceDtlUrl: 'https://d/N2',
      ntceSpecDocUrl1: 'https://f/1', ntceSpecFileNm1: '과업지시서.hwp', sucsfbidLwltRate: '87.745', pubPrcrmntClsfcNm: '전산장비',
      ntceKindNm: '등록공고', bfSpecRgstNo: 'PS-9', reNtceYn: 'Y',
    }])
    const [row] = await handle.db.select().from(notices)
    expect(row.attachments).toHaveLength(1)
    expect(row.attachments[0].name).toBe('과업지시서.hwp')
    expect(row.detailUrl).toBe('https://d/N2')
    expect(row.lowerLimitRate).toBe(87.745)
    expect(row.productClass).toBe('전산장비')
    expect(row.noticeKind).toBe('등록공고')
    expect(row.prespecNo).toBe('PS-9')
    expect(row.reNotice).toBe(true)
    expect(row.source).toBe('bidpublic')
    expect(row.noticeDate).toBe('2026-08-05')
  })

  it('사전규격 번호가 처음 붙을 때만 prespec_linked_at을 기록한다', async () => {
    handle = await createTestDb()
    await upsertNoticePageLive(handle.db, [{ bidNtceNo: 'LINK-1', bidNtceOrd: '000', bidNtceNm: '연결 공고', bfSpecRgstNo: 'PS-LINK-1' }])
    const first = (await handle.db.select().from(notices)).find((row) => row.bidNtceNo === 'LINK-1')!
    expect(first.prespecLinkedAt).not.toBeNull()

    await upsertNoticePageLive(handle.db, [{ bidNtceNo: 'LINK-1', bidNtceOrd: '000', bidNtceNm: '연결 공고 갱신', bfSpecRgstNo: 'PS-LINK-1' }])
    const repeated = (await handle.db.select().from(notices)).find((row) => row.bidNtceNo === 'LINK-1')!
    expect(repeated.prespecLinkedAt).toEqual(first.prespecLinkedAt)

    await upsertNoticePageLive(handle.db, [{ bidNtceNo: 'LINK-2', bidNtceOrd: '000', bidNtceNm: '나중 연결 공고' }])
    const beforeLink = (await handle.db.select().from(notices)).find((row) => row.bidNtceNo === 'LINK-2')!
    expect(beforeLink.prespecLinkedAt).toBeNull()
    await upsertNoticePageLive(handle.db, [{ bidNtceNo: 'LINK-2', bidNtceOrd: '000', bidNtceNm: '나중 연결 공고', bfSpecRgstNo: 'PS-LINK-2' }])
    const afterLink = (await handle.db.select().from(notices)).find((row) => row.bidNtceNo === 'LINK-2')!
    expect(afterLink.prespecLinkedAt).not.toBeNull()
  })

  it('표준서비스 업서트와 빈 첨부는 기존 첨부를 지우지 않는다', async () => {
    handle = await createTestDb()
    await upsertNoticePageLive(handle.db, [{
      bidNtceNo: 'N2', bidNtceOrd: '000', bidNtceNm: '첨부 공고', bidNtceDtlUrl: 'https://d/N2',
      ntceSpecDocUrl1: 'https://f/1', ntceSpecFileNm1: '과업지시서.hwp',
    }])
    await upsertNoticePage(handle.db, [{ bidNtceNo: 'N2', bidNtceOrd: '000', bidNtceNm: '표준 공고', bidNtceSttusNm: '공고' }])
    let [row] = await handle.db.select().from(notices)
    expect(row.title).toBe('표준 공고')
    expect(row.status).toBe('공고')
    expect(row.attachments).toHaveLength(1)
    expect(row.detailUrl).toBe('https://d/N2')
    expect(row.source).toBe('bidpublic')
    await upsertNoticePageLive(handle.db, [{ bidNtceNo: 'N2', bidNtceOrd: '000', bidNtceNm: '첨부 없는 갱신' }])
    ;[row] = await handle.db.select().from(notices)
    expect(row.attachments).toHaveLength(1)
  })

  it('bidders는 2,000행 배치로 나눠 넣는다', async () => {
    handle = await createTestDb()
    const rows = Array.from({ length: 2001 }, (_, i) => ({
      bidNtceNo: 'BATCH', bidNtceOrd: '000', bidNtceNm: '대량 낙찰', opengDate: '20260815', opengRank: String(i + 1),
      bidprcCorpBizrno: String(1000000000 + i), bidprcCorpNm: `업체 ${i}`, bidprcAmt: String(i + 1),
    }))
    const result = await upsertAwardPage(handle.db, rows, 'Servc')
    expect(result.bidders).toBe(2001)
    expect(await handle.db.select().from(bidders)).toHaveLength(2001)
  })

  it('recomputeBidderCounts는 bizDivKey로 대상 공고를 한정한다', async () => {
    handle = await createTestDb(); await ensurePartitions(handle.db, ['2026-08-15'])
    await handle.db.insert(awards).values([
      { bidNtceNo: 'SERVC', ord: '000', openingDate: '2026-08-15', bizDivKey: 'Servc' },
      { bidNtceNo: 'THNG', ord: '000', openingDate: '2026-08-15', bizDivKey: 'Thng', bidderCount: 7 },
    ])
    await handle.db.insert(bidders).values({ bidNtceNo: 'SERVC', awardOrd: '000', openingDate: '2026-08-15', bizNo: '1', rank: 1 })
    const before = (await handle.db.select().from(awards)).find((row) => row.bidNtceNo === 'THNG')!
    expect(await recomputeBidderCounts(handle.db, '2026-08-15', 'Servc')).toBe(1)
    const rows = await handle.db.select().from(awards)
    const servc = rows.find((row) => row.bidNtceNo === 'SERVC')
    const thng = rows.find((row) => row.bidNtceNo === 'THNG')
    expect(servc?.bidderCount).toBe(1)
    expect(thng?.bidderCount).toBe(7)
    expect(thng?.updatedAt).toEqual(before.updatedAt)
  })
})
