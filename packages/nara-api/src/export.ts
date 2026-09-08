import type { Item } from './types'

/** 이 패키지는 DOM lib 없이 타입 검사한다(tsconfig lib: ES2023). download()는 브라우저에서만 호출된다. */
declare const document: { createElement(tag: 'a'): { href: string; download: string; click(): void } }

export function toCsv(items: Item[]) {
  const head = ['유형', '공고번호', '사업명', '기관', '수요기관', '금액', '일자', '마감', '낙찰업체', '낙찰업체사업자번호', '낙찰률', '태그', '업무구분', '계약방법', '낙찰자결정방법', '추정가격', '예정가격', '낙찰하한율', '투찰업체수', '참가가능지역', '투찰가능업종', '참조번호', '규격서URL', '연계공고번호', 'URL']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = items.map((i) => [i.kind, i.noticeNo, i.title, i.agency, i.demandAgency, i.amount, i.date, i.deadline, i.winner, i.winnerBizNo, i.awardRate, (i.tags ?? []).join('|'), i.notice?.bizDiv ?? i.award?.bizDiv ?? i.contract?.bizDiv ?? i.prespec?.bizDiv, i.notice?.contractMethod ?? i.award?.contractMethod ?? i.contract?.contractMethod, i.notice?.awardMethod ?? i.award?.awardMethod, i.notice?.estimatedPrice ?? i.award?.estimatedPrice, i.award?.reservedPrice ?? i.contract?.reservedPrice, i.award?.lowerLimitRate, i.award?.bidders.length, i.notice?.regions, i.notice?.industries, i.prespec?.refNo, i.prespec?.specDocs.join(' '), i.prespec?.relatedNoticeNos.join(' '), i.url].map(esc).join(','))
  return '﻿' + [head.join(','), ...rows].join('\n')
}

export function download(name: string, content: string, type = 'text/csv') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}
