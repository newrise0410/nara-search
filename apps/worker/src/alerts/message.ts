import type { Item } from '@nara/api'
import type { AlertMessage } from '../notify/types'

/** 메시지에 나열할 최대 건수. 넘으면 '외 N건'을 덧붙인다. */
export const MESSAGE_MAX_ITEMS = 10
export const SUMMARY_MAX = 200

/** 전환 항목임을 알리는 접두 (013). 제목 자체는 바꾸지 않는다 — 키워드 매칭이 오염된다 */
const TRANSITION_PREFIX = '[사전규격→본공고] '
const labelOf = (item: Item): string => item.transition ? TRANSITION_PREFIX : ''

/** 금액을 사람이 읽기 쉬운 나라장터 단위로 표시한다. */
export function money(amount: number | undefined): string {
  if (amount == null) return '금액 미상'
  if (amount >= 1e8) {
    return `${(amount / 1e8).toFixed(1).replace(/\.0$/, '')}억원`
  }
  if (amount >= 1e4) {
    return `${Math.round(amount / 1e4).toLocaleString('en-US')}만원`
  }
  return `${amount.toLocaleString('en-US')}원`
}

/** 대표 링크가 없으면 결과 화면으로 보낸다. */
export function itemLink(item: Item, appUrl: string): string {
  return item.url || `${appUrl}/results`
}

const esc = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const summaryOf = (ruleName: string, items: Item[], total: number): string => {
  const first = items[0]
  const summary = first
    ? `${ruleName} 새 항목 ${total}건 · ${labelOf(first)}${first.title} | ${first.agency} | ${money(first.amount)}`
    : `${ruleName} 새 항목 ${total}건`
  return summary.length > SUMMARY_MAX
    ? `${summary.slice(0, SUMMARY_MAX - 1)}…`
    : summary
}

export function buildMessage(rule: { name: string }, items: Item[], opts: { appUrl: string }): AlertMessage {
  const total = items.length
  const messageItems = items.slice(0, MESSAGE_MAX_ITEMS)
  const title = `[나라장터] ${rule.name} 새 항목 ${total}건`
  const url = items[0] ? itemLink(items[0], opts.appUrl) : `${opts.appUrl}/results`
  const lines = [
    title,
    '',
    ...messageItems.flatMap((item) => [
      `- ${labelOf(item)}${item.title} | ${item.agency} | ${money(item.amount)} | ${item.date}${item.deadline ? ` ~ ${item.deadline}` : ''}`,
      `  ${itemLink(item, opts.appUrl)}`,
    ]),
  ]
  if (total > MESSAGE_MAX_ITEMS) lines.push(`외 ${total - MESSAGE_MAX_ITEMS}건`)

  const list = messageItems.map((item) => {
    const link = itemLink(item, opts.appUrl)
    return `<li><a href="${esc(link)}">${esc(labelOf(item))}${esc(item.title)}</a><br><span>${esc(item.agency)} · ${money(item.amount)} · ${esc(item.date)}</span></li>`
  }).join('')
  const html = `<h3>${esc(title)}</h3><ul>${list}</ul>${total > MESSAGE_MAX_ITEMS ? `<p>외 ${total - MESSAGE_MAX_ITEMS}건</p>` : ''}`

  return {
    title,
    summary: summaryOf(rule.name, items, total),
    text: lines.join('\n'),
    html,
    url,
    total,
    items: messageItems,
  }
}
