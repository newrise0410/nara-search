import { describe, expect, it } from 'vitest'
import type { Item, Profile } from '@nara/api'
import type { AlertRule } from '../alerts/types'
import { matchesRule } from '../alerts/match'

const item = (over?: Partial<Item>): Item => ({
  id: 'notice-A-000',
  kind: 'notice',
  noticeNo: 'A',
  title: '시설 관제 시스템 구축',
  agency: '대전테크노파크',
  date: '2026-08-15',
  amount: 12_000_000,
  ...over,
})

const rule = (over?: Partial<AlertRule>): AlertRule => ({
  id: 'r1',
  orgId: 'org1',
  userId: 'u1',
  name: 'r',
  enabled: true,
  kinds: [],
  keywords: [],
  profileId: null,
  categoryNames: [],
  agency: null,
  amountMin: null,
  amountMax: null,
  channelIds: [],
  digest: 'instant',
  ...over,
})

describe('알림 규칙 매칭', () => {
  it('kinds가 비면 모든 유형을 통과시킨다', () => {
    expect(matchesRule(item({ kind: 'contract' }), rule())).toBe(true)
  })

  it('kinds에 없는 유형은 제외한다', () => {
    expect(matchesRule(item({ kind: 'award' }), rule({ kinds: ['notice'] }))).toBe(false)
  })

  it('키워드는 제목·기관·수요기관에서 부분일치 OR로 판정한다', () => {
    expect(matchesRule(item(), rule({ keywords: ['관제'] }))).toBe(true)
    expect(matchesRule(item(), rule({ keywords: ['헬기'] }))).toBe(false)
    expect(matchesRule(item(), rule({ keywords: ['대전'] }))).toBe(true)
  })

  it('키워드는 대소문자를 구분하지 않는다', () => {
    expect(matchesRule(item({ title: 'ERP 도입' }), rule({ keywords: ['erp'] }))).toBe(true)
  })

  it('공백뿐인 키워드는 무시한다', () => {
    expect(matchesRule(item(), rule({ keywords: ['  '] }))).toBe(true)
  })

  it('프로필 카테고리 이름이 지정되면 그 태그가 붙은 항목만 통과한다', () => {
    const profile: Profile = {
      id: 'p1', name: '시설', categories: [{ id: 'c1', name: '유지보수', color: '#000', include: ['시설'], exclude: [] }],
      requirementKeywords: [], defaultKeywords: [],
    }
    expect(matchesRule(item(), rule({ categoryNames: ['유지보수'] }), profile)).toBe(true)
    expect(matchesRule(item(), rule({ categoryNames: ['측량'] }), profile)).toBe(false)
  })

  it('프로필만 있고 카테고리 이름이 비면 태그가 하나라도 붙어야 통과한다', () => {
    const profile: Profile = {
      id: 'p1', name: '시설', categories: [{ id: 'c1', name: '유지보수', color: '#000', include: ['시설'], exclude: [] }],
      requirementKeywords: [], defaultKeywords: [],
    }
    expect(matchesRule(item(), rule(), profile)).toBe(true)
    expect(matchesRule(item({ title: '사무용품 구매' }), rule(), profile)).toBe(false)
  })

  it('기관 필터는 공고기관과 수요기관을 함께 본다', () => {
    expect(matchesRule(item({ demandAgency: '서울시청' }), rule({ agency: '서울시' }))).toBe(true)
    expect(matchesRule(item({ demandAgency: '부산시청' }), rule({ agency: '서울시' }))).toBe(false)
  })

  it('금액 범위를 벗어나거나 금액이 없는 항목은 제외한다', () => {
    expect(matchesRule(item(), rule({ amountMin: 10_000_000, amountMax: 15_000_000 }))).toBe(true)
    expect(matchesRule(item(), rule({ amountMin: 13_000_000 }))).toBe(false)
    expect(matchesRule(item({ amount: undefined }), rule({ amountMin: 1 }))).toBe(false)
  })
})
