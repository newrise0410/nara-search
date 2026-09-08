import { describe, expect, it } from 'vitest'
import type { Item } from '@nara/api'
import { buildMessage, money } from '../alerts/message'

const item = (over?: Partial<Item>): Item => ({
  id: 'notice-A-000',
  kind: 'notice',
  noticeNo: 'A',
  title: '시설 관제 시스템 구축',
  agency: '대전테크노파크',
  date: '2026-08-15',
  amount: 12_000_000,
  url: 'https://example.com/notice/A',
  ...over,
})

describe('알림 메시지', () => {
  it('money가 억·만·원 단위로 나눈다', () => {
    expect(money(undefined)).toBe('금액 미상')
    expect(money(12_000_000)).toBe('1,200만원')
    expect(money(1_230_000_000)).toBe('12.3억원')
    expect(money(5_000)).toBe('5,000원')
  })

  it('제목에 규칙 이름과 총 건수가 들어간다', () => {
    const message = buildMessage({ name: '시설 공고' }, [item()], { appUrl: 'https://nara.example' })
    expect(message.title).toBe('[나라장터] 시설 공고 새 항목 1건')
    expect(message.text).toContain('시설 공고')
  })

  it('10건을 넘으면 10건만 나열하고 외 N건을 붙인다', () => {
    const items = Array.from({ length: 12 }, (_, index) => item({ id: `notice-${index}`, title: `공고 ${index}` }))
    const message = buildMessage({ name: '알림' }, items, { appUrl: 'https://nara.example' })
    expect(message.items).toHaveLength(10)
    expect(message.text).toContain('외 2건')
  })

  it('summary는 200자를 넘지 않는다', () => {
    const message = buildMessage({ name: '알림' }, [item({ title: '가'.repeat(300) })], { appUrl: 'https://nara.example' })
    expect(message.summary).toHaveLength(200)
    expect(message.summary.endsWith('…')).toBe(true)
  })

  it('html은 사용자 입력을 이스케이프한다', () => {
    const message = buildMessage({ name: '<script>x</script>' }, [item({ title: '<script>x</script>' })], { appUrl: 'https://nara.example' })
    expect(message.html).not.toContain('<script>')
    expect(message.html).toContain('&lt;script&gt;')
  })
})
