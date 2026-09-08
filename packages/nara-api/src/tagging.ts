import type { Item, Profile } from './types'

const hit = (text: string, words: string[]) =>
  words.some((w) => w.trim() && text.includes(w.trim().toLowerCase()))

/** 프로필 카테고리 규칙으로 항목에 태그를 부여한다. */
export function applyProfile(items: Item[], profile?: Profile): Item[] {
  if (!profile) return items.map((i) => ({ ...i, tags: [] }))
  return items.map((i) => {
    const text = `${i.title} ${i.agency} ${i.demandAgency ?? ''}`.toLowerCase()
    const tags = profile.categories
      .filter((c) => hit(text, c.include) && !hit(text, c.exclude))
      .map((c) => c.name)
    return { ...i, tags }
  })
}

export function highlightRequirements(text: string, words: string[]) {
  return words.filter((w) => w.trim() && text.includes(w.trim()))
}
