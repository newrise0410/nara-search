import { describe, expect, it } from 'vitest'
import { bytes, num, splitNumUnit, won } from '@/lib/format'
import { toneForColor } from '@/lib/tag-color'

describe('프로필 색상 톤', () => {
  it('시안 색상 아홉 쌍을 올바른 톤으로 매핑한다', () => {
    const pairs = [
      ['#9F2F2D', 'red'], ['#956400', 'yellow'], ['#346538', 'green'],
      ['#1F6C9F', 'blue'], ['#6B4FA3', 'blue'], ['#0E7490', 'blue'],
      ['#888888', 'gray'], ['', 'gray'], ['#e0457b', 'red'],
    ] as const
    pairs.forEach(([color, expected]) => {
      expect(toneForColor(color)).toBe(expected)
    })
  })
})

describe('숫자 단위 포맷', () => {
  it('숫자 포맷과 단위 세 쌍을 올바르게 처리한다', () => {
    expect(num(1324)).toBe('1,324')
    const pairs = [
      ['1,324건', { number: '1,324', unit: '건' }],
      ['미수집', { number: '', unit: '미수집' }],
      ['88.15%', { number: '88.15', unit: '%' }],
    ] as const
    pairs.forEach(([value, expected]) => {
      expect(splitNumUnit(value)).toEqual(expected)
    })
  })

  it('금액은 정수면 소수점 없이, 소수부가 있으면 소수점까지 표기한다', () => {
    expect(won(1000000)).toBe('1,000,000')
    expect(won(123456.78)).toBe('123,456.78')
    expect(won(null)).toBe('-')
  })

  it('용량을 1024 기준으로 표기한다', () => {
    expect(bytes(0)).toBe('0B')
    expect(bytes(1536)).toBe('2KB')
    expect(bytes(227_540_992)).toBe('217MB')
    expect(bytes(2 * 1024 ** 3)).toBe('2.0GB')
    expect(bytes(null)).toBe('-')
  })
})
