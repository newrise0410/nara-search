import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureNara } from '../config'
import { bidPublicAttachments, bidPublicToItem, bidPublicToNoticeRow, estimateLiveCalls, normalizeAwardMethod, searchBidPublic } from '../bidpublic'
import { noticeToItem } from '../opnstd'

const ok = (body: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body } }) })

afterEach(() => {
  vi.unstubAllGlobals()
  configureNara({ serviceKey: '', baseUrl: 'https://apis.data.go.kr/1230000' })
})

describe('BidPublicInfoService 어댑터', () => {
  it('월 단위 청크와 업무구분 4개로 나눠 호출한다', async () => {
    configureNara({ serviceKey: 'K', baseUrl: 'https://x/1230000' })
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      return ok({ items: [{ bidNtceNo: `${urls.length}`, bidNtceDt: '2026-08-01 10:00:00' }], totalCount: 1, pageNo: 1, numOfRows: 999 })
    }))
    const result = await searchBidPublic({ from: '2026-06-15', to: '2026-08-28', keyword: '시설' })
    expect(urls).toHaveLength(12)
    expect(new Set(urls.map((url) => new URL(url).pathname.split('/').pop()))).toEqual(new Set([
      'getBidPblancListInfoThngPPSSrch', 'getBidPblancListInfoServcPPSSrch', 'getBidPblancListInfoCnstwkPPSSrch', 'getBidPblancListInfoFrgcptPPSSrch',
    ]))
    const first = new URL(urls[0]).searchParams
    expect(first.get('inqryBgnDt')).toBe('202606150000')
    expect(first.get('inqryEndDt')).toBe('202607142359')
    expect(first.get('bidNtceNm')).toBe('시설')
    expect(result.chunks).toBe(12)
    expect(estimateLiveCalls('2026-06-15', '2026-08-28')).toEqual({ months: 3, min: 12, max: 72 })
  })

  it('bidPublicToItem이 표준서비스와 같은 id를 만든다', () => {
    const row = { bidNtceNo: '20260812345', bidNtceOrd: '000' }
    expect(bidPublicToItem(row).id).toBe(noticeToItem(row).id)
    expect(bidPublicToItem(row).id).toBe('notice-20260812345-000')
    expect(bidPublicToItem({ bidNtceNo: '20260812345' }).id).toBe('notice-20260812345-000')
  })

  it('상세URL·첨부·낙찰하한율을 NoticeDetail에 채운다', () => {
    const item = bidPublicToItem({
      bidNtceNo: 'N1', bidNtceDtlUrl: 'https://example.test/notice/N1', reNtceYn: 'Y', sucsfbidLwltRate: '87.745',
      ntceSpecDocUrl1: 'https://example.test/a', ntceSpecFileNm1: '첫 문서', ntceSpecDocUrl2: 'https://example.test/b',
    })
    expect(item.notice?.attachments).toHaveLength(2)
    expect(item.notice?.attachments?.[0].name).toBe('첫 문서')
    expect(item.notice?.detailUrl).toBe('https://example.test/notice/N1')
    expect(item.url).toBe('https://example.test/notice/N1')
    expect(item.notice?.lowerLimitRate).toBe(87.745)
    expect(item.notice?.reNotice).toBe(true)
  })

  it('bidPublicAttachments가 URL 있는 항목만 순서대로 만든다', () => {
    expect(bidPublicAttachments({
      bidNtceNo: 'N1',
      ntceSpecDocUrl1: 'https://f/1',
      ntceSpecFileNm1: '첫 문서',
      ntceSpecFileNm2: '이름만',
      ntceSpecDocUrl3: 'https://f/3',
    })).toEqual([
      { url: 'https://f/1', name: '첫 문서' },
      { url: 'https://f/3' },
    ])
  })

  it('bidPublicToNoticeRow가 업서트용 필드로 변환한다', () => {
    const row = bidPublicToNoticeRow({
      bidNtceNo: 'N1', bidNtceDt: '2026-08-01 10:00:00', bidClseDt: '2026-08-20 17:00:00', sucsfbidMthdNm: '적격심사',
      dminsttNm: '수요기관', bidMethdNm: '전자입찰',
    })
    expect(row.bidNtceDate).toBe('2026-08-01')
    expect(row.bidClseDate).toBe('2026-08-20')
    expect(row.bidClseTm).toBe('17:00')
    expect(row.bidwinrDcsnMthdNm).toBe('적격심사')
    expect(row.dmndInsttNm).toBe('수요기관')
    expect(row.elctrnBidYn).toBe('Y')
  })

  it('normalizeAwardMethod가 반복 표기를 한 번만 남긴다', () => {
    expect(normalizeAwardMethod('수의시담-수의시담')).toBe('수의시담')
    expect(normalizeAwardMethod('적격심사')).toBe('적격심사')
    expect(normalizeAwardMethod('제한적최저가-2단계')).toBe('제한적최저가-2단계')
    expect(normalizeAwardMethod(undefined)).toBeUndefined()
  })

  it('bidPublicToNoticeRow가 낙찰방법 표기를 정규화한다', () => {
    const row = bidPublicToNoticeRow({ bidNtceNo: 'N2', sucsfbidMthdNm: '수의시담-수의시담' })
    expect(row.bidwinrDcsnMthdNm).toBe('수의시담')
  })

  it('deadline이 지나면 truncated로 끊는다', async () => {
    configureNara({ serviceKey: 'K', baseUrl: 'https://x/1230000' })
    let requests = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      requests++
      return ok({ items: [{ bidNtceNo: String(requests), bidNtceDt: '2026-08-01' }], totalCount: 999999, pageNo: requests, numOfRows: 999 })
    }))
    const result = await searchBidPublic({ from: '2026-08-01', to: '2026-08-28', keyword: '시설' }, { deadline: Date.now() - 1 })
    expect(result.truncated).toBe(true)
    expect(result.requests).toBeLessThanOrEqual(result.chunks)
  })
})
