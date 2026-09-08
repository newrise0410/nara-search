import { describe, it, expect, vi } from 'vitest'
import { fetchPages } from '../common'

const ok = (body: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body } }) })

describe('fetchPages', () => {
  it('5페이지를 전부 순회하고 종료한다', async () => {
    const seen: number[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const pageNo = Number(new URL('http://x' + url).searchParams.get('pageNo'))
      return ok({ items: [{ pageNo }], totalCount: 5, numOfRows: 1 })
    }))
    const r = await fetchPages((pageNo) => `/api?pageNo=${pageNo}`, { pageSize: 1, maxPages: 10, onPage: (_, meta) => { seen.push(meta.pageNo) } })
    expect(seen).toEqual([1, 2, 3, 4, 5]); expect(r.pages).toBe(5); expect(r.rows).toBe(5); expect(r.requests).toBe(5); expect(r.nextPage).toBeNull(); expect(r.truncated).toBe(false)
  })

  it('startPage부터 요청한다', async () => {
    const requested: number[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const pageNo = Number(new URL('http://x' + url).searchParams.get('pageNo')); requested.push(pageNo)
      return ok({ items: [{ pageNo }], totalCount: 3, numOfRows: 1 })
    }))
    const r = await fetchPages((pageNo) => `/api?pageNo=${pageNo}`, { pageSize: 1, maxPages: 10, startPage: 3, onPage: () => {} })
    expect(requested).toEqual([3]); expect(r.nextPage).toBeNull()
  })

  it('shouldContinue가 false면 다음 페이지를 반환한다', async () => {
    let pages = 0
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [{ value: 1 }, { value: 2 }], totalCount: 100, numOfRows: 2 })))
    const r = await fetchPages(() => '/api', { pageSize: 2, maxPages: 10, onPage: () => { pages++ }, shouldContinue: () => pages < 2 })
    expect(r.pages).toBe(2); expect(r.nextPage).toBe(3); expect(r.truncated).toBe(false)
  })

  it('maxPages 소진 시 truncated를 표시한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [{ value: 1 }], totalCount: 100, numOfRows: 1 })))
    const r = await fetchPages(() => '/api', { pageSize: 1, maxPages: 2, onPage: () => {} })
    expect(r.pages).toBe(2); expect(r.nextPage).toBe(3); expect(r.truncated).toBe(true)
  })

  it('totalCount에 도달하면 조기 종료한다', async () => {
    const requested: number[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const pageNo = Number(new URL('http://x' + url).searchParams.get('pageNo')); requested.push(pageNo)
      return ok({ items: Array.from({ length: pageNo === 1 ? 2 : 1 }, () => ({ value: 1 })), totalCount: 3, numOfRows: 2 })
    }))
    const r = await fetchPages((pageNo) => `/api?pageNo=${pageNo}`, { pageSize: 2, maxPages: 10, onPage: () => {} })
    expect(requested).toEqual([1, 2]); expect(r.rows).toBe(3); expect(r.nextPage).toBeNull(); expect(r.totalCount).toBe(3)
  })
})
