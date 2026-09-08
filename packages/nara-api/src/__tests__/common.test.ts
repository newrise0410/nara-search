import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchAll, runPool, cached, cacheSize, clearCache } from '../common'
import { chunkRange, addMonths, today } from '../date'
import { groupAwards } from '../opnstd'

const ok = (body: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body } }) })

describe('fetchAll', () => {
  beforeEach(() => clearCache())
  it('서버가 numOfRows를 100으로 캡해도 totalCount까지 전부 받는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const p = Number(new URL('http://x' + url).searchParams.get('pageNo')); const start = (p - 1) * 100
      return ok({ items: Array.from({ length: Math.max(0, Math.min(100, 250 - start)) }, (_, i) => ({ i: start + i })), totalCount: 250, numOfRows: 100 })
    }))
    const r = await fetchAll((p) => `/api?pageNo=${p}`, { pageSize: 999, maxPages: 50 })
    expect(r.items.length).toBe(250); expect(r.truncated).toBe(false); expect(r.requests).toBe(3)
  })
  it('maxPages 소진 시 truncated=true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: Array.from({ length: 100 }, (_, i) => ({ i })), totalCount: 100000, numOfRows: 100 })))
    const r = await fetchAll(() => '/api', { pageSize: 999, maxPages: 2 })
    expect(r.items.length).toBe(200); expect(r.truncated).toBe(true)
  })
  it('totalCount 미상이면 짧은 페이지에서 종료', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [{ a: 1 }], numOfRows: 999 })))
    const r = await fetchAll(() => '/api', { pageSize: 999, maxPages: 50 })
    expect(r.items.length).toBe(1); expect(r.requests).toBe(1)
  })
  it('빈 items 페이지에서 종료 (무한 루프 방지)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [], totalCount: 999 })))
    const r = await fetchAll(() => '/api', { pageSize: 999, maxPages: 50 })
    expect(r.items.length).toBe(0); expect(r.requests).toBe(1)
  })
  it('XML 키 오류를 NaraApiError로 변환', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => '<r><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></r>' })))
    await expect(fetchAll(() => '/x', { pageSize: 1, maxPages: 1 })).rejects.toThrow('[30]')
  })
  it('실서버 JSON 오류 형태(ResponseError / OpenAPI_ServiceResponse)를 코드로 인식', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ 'nkoneps.com.response.ResponseError': { header: { resultCode: '07', resultMsg: '입력범위값 초과 에러' } } }) })))
    await expect(fetchAll(() => '/x', { pageSize: 1, maxPages: 1 })).rejects.toThrow('[07]')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', returnAuthMsg: '등록되지 않은 서비스키', returnReasonCode: '30' } } }) })))
    await expect(fetchAll(() => '/x', { pageSize: 1, maxPages: 1 })).rejects.toThrow('[30]')
  })
  it('resultCode 03은 빈 결과', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '03', resultMsg: 'No Data' }, body: {} } }) })))
    const r = await fetchAll(() => '/x', { pageSize: 1, maxPages: 1 }); expect(r.items).toEqual([])
  })
})

describe('runPool', () => {
  it('첫 실패 이후 남은 작업을 투입하지 않는다', async () => {
    let started = 0
    const tasks = Array.from({ length: 40 }, (_, i) => async () => { started++; await new Promise((r) => setTimeout(r, 2)); if (i === 2) throw new Error('boom'); return i })
    await expect(runPool(tasks, 4)).rejects.toThrow('boom')
    expect(started).toBeLessThan(12)
  })
  it('abort 시 AbortError', async () => {
    const ac = new AbortController()
    const tasks = Array.from({ length: 20 }, (_, i) => async () => { await new Promise((r) => setTimeout(r, 2)); if (i === 1) ac.abort(); return i })
    await expect(runPool(tasks, 2, undefined, ac.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('cached', () => {
  beforeEach(() => clearCache())
  it('절단된 결과는 캐시하지 않는다', async () => {
    await cached('k1', '2020-01-01', async () => ({ items: [1], truncated: true, requests: 1 })); expect(cacheSize()).toBe(0)
    await cached('k2', '2020-01-01', async () => ({ items: [1], truncated: false, requests: 1 })); expect(cacheSize()).toBe(1)
  })
  it('오늘을 포함한 청크는 TTL 캐시', async () => {
    let loads = 0; const live = async () => { loads++; return { items: [], truncated: false, requests: 1 } }
    await cached('k3', today(), live); await cached('k3', today(), live); expect(loads).toBe(1)
  })
})

describe('date', () => {
  it('chunkRange가 단위 제한을 넘지 않는다', () => {
    expect(chunkRange('2026-01-31', '2026-03-31', 'month')).toEqual([['2026-01-31', '2026-02-27'], ['2026-02-28', '2026-03-27'], ['2026-03-28', '2026-03-31']])
    expect(chunkRange('2026-08-27', '2026-08-27', 'day')).toEqual([['2026-08-27', '2026-08-27']])
    expect(chunkRange('2026-08-28', '2026-08-27', 'day')).toEqual([])
    expect(chunkRange('2026-05-27', '2026-08-27', 'week').every(([a, b]) => (new Date(b).getTime() - new Date(a).getTime()) / 864e5 <= 6)).toBe(true)
  })
  it('addMonths 말일 클램프', () => { expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'); expect(addMonths('2026-03-31', -1)).toBe('2026-02-28') })
  it('today는 로컬 달력 기준', () => { const d = new Date(); expect(today()).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) })
})

describe('groupAwards', () => {
  it('공고 단위로 묶고 빈 필드를 뒤 행에서 보완한다', () => {
    const items = groupAwards([
      { bidNtceNo: 'A', bidNtceOrd: '000', bidNtceNm: 'X', opengRank: '2', bidprcCorpNm: '을', bidprcAmt: '110', sucsfYn: 'N', opengDate: '20260801' },
      { bidNtceNo: 'A', bidNtceOrd: '000', bidNtceNm: 'X', opengRank: '1', bidprcCorpNm: '갑', bidprcAmt: '100', sucsfYn: 'Y', fnlSucsfCorpNm: '갑', fnlSucsfAmt: '100', fnlSucsfRt: '87.5', fnlSucsfCorpCeoNm: '대표', opengDate: '20260801' },
      { bidNtceNo: 'B', bidNtceOrd: '000', bidNtceNm: 'Y', bidprcCorpNm: '병', opengDate: '2026-08-02 00:00:00' },
    ])
    expect(items.length).toBe(2)
    const a = items.find((i) => i.noticeNo === 'A')!
    expect(a.award!.bidders.map((b) => b.name)).toEqual(['갑', '을'])
    expect(a.winner).toBe('갑'); expect(a.awardRate).toBe(87.5); expect(a.award!.winnerCeo).toBe('대표'); expect(a.date).toBe('2026-08-01')
  })
})
