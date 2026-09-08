import { describe, expect, it } from 'vitest'
import { addDays, addMonths, today } from '@nara/api'
import { defaultRange } from '@/lib/default-range'

describe('defaultRange', () => {
  it('유형별 기본 기간을 돌려준다', () => {
    const current = today()
    expect(defaultRange('notice')).toEqual({ from: addMonths(current, -1), to: current })
    expect(defaultRange('prespec')).toEqual({ from: addMonths(current, -1), to: current })
    expect(defaultRange('contract')).toEqual({ from: addDays(current, -6), to: current })
    expect(defaultRange('award')).toEqual({ from: addDays(current, -1), to: addDays(current, -1) })
  })

  it('낙찰은 DB 보유 마지막 날을 우선한다', () => {
    expect(defaultRange('award', '2026-08-25')).toEqual({ from: '2026-08-25', to: '2026-08-25' })
    expect(defaultRange('award', 'x')).toEqual({ from: addDays(today(), -1), to: addDays(today(), -1) })
  })
})
