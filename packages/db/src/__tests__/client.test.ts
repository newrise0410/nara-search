import { describe, expect, it } from 'vitest'
import { resultRows } from '../client'

describe('database client', () => {
  it('드라이버별 execute 결과를 행 배열로 정규화한다', () => {
    const rows = [{ id: 1 }]
    expect(resultRows<{ id: number }>(rows)).toEqual(rows)
    expect(resultRows<{ id: number }>({ rows })).toEqual(rows)
  })
})
