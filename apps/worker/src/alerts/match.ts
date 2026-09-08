import { applyProfile } from '@nara/api'
import type { Item, Profile } from '@nara/api'
import type { AlertRule } from './types'

/** 규칙 하나가 항목 하나에 걸리는가를 순서대로 판정한다. */
export function matchesRule(item: Item, rule: AlertRule, profile?: Profile): boolean {
  // 전환 항목은 'prespec-link'를 명시적으로 고른 규칙에만 간다 (빈 kinds='전체 유형'에는 포함하지 않는다 — 본공고 항목과 중복 발송되기 때문)
  if (item.transition) {
    if (!rule.kinds.includes('prespec-link')) return false
  } else if (rule.kinds.length > 0 && !rule.kinds.includes(item.kind)) return false

  const keywords = rule.keywords
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean)
  if (keywords.length > 0) {
    const haystack = `${item.title} ${item.agency} ${item.demandAgency ?? ''}`.toLowerCase()
    if (!keywords.some((keyword) => haystack.includes(keyword))) return false
  }

  if (profile) {
    const tags = applyProfile([item], profile)[0]?.tags ?? []
    const categoryNames = rule.categoryNames.filter((name) => name.trim())
    if (categoryNames.length > 0) {
      if (!categoryNames.some((name) => tags.includes(name))) return false
    } else if (tags.length === 0) {
      return false
    }
  }

  if (rule.agency?.trim()) {
    const agencies = `${item.agency} ${item.demandAgency ?? ''}`.toLowerCase()
    if (!agencies.includes(rule.agency.trim().toLowerCase())) return false
  }

  if (rule.amountMin == null && rule.amountMax == null) return true
  if (item.amount == null) return false
  if (rule.amountMin != null && item.amount < rule.amountMin) return false
  if (rule.amountMax != null && item.amount > rule.amountMax) return false
  return true
}

/** 걸리는 항목만 골라 입력 순서를 유지해 돌려준다. */
export function matchItems(items: Item[], rule: AlertRule, profile?: Profile): Item[] {
  return items.filter((item) => matchesRule(item, rule, profile))
}
