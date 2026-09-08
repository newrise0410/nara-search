import type { Bidder, ConvertedNotice, Item } from '@nara/api'
import { awards, contracts, notices, prespecs } from '@nara/db'

export type NoticeRowSelect = typeof notices.$inferSelect
export type AwardRowSelect = typeof awards.$inferSelect
export type ContractRowSelect = typeof contracts.$inferSelect
export type PrespecRowSelect = typeof prespecs.$inferSelect

const optional = <T>(value: T | null | undefined): T | undefined => value == null ? undefined : value

function textValue(value: unknown): string | undefined {
  if (value == null) return undefined
  const text = value instanceof Date ? value.toISOString() : String(value)
  return text || undefined
}

function dateValue(value: unknown): string | undefined {
  const text = textValue(value)
  return text?.slice(0, 10)
}

export function noticeRowToItem(row: NoticeRowSelect): Item {
  return {
    id: `notice-${row.bidNtceNo}-${row.ord}`,
    kind: 'notice',
    noticeNo: row.bidNtceNo,
    title: row.title,
    agency: row.ntceInsttNm ?? '',
    demandAgency: optional(row.dmndInsttNm),
    amount: optional(row.estimatedPrice ?? row.budgetAmt),
    date: dateValue(row.noticeDate) ?? '',
    deadline: dateValue(row.bidClose),
    region: optional(row.regions),
    url: optional(row.detailUrl ?? row.noticeUrl),
    notice: {
      ord: row.ord,
      status: optional(row.status),
      bizDiv: optional(row.bizDiv),
      agencyCode: optional(row.ntceInsttCd),
      contractMethod: optional(row.contractMethod),
      awardMethod: optional(row.awardMethod),
      contractForm: optional(row.contractForm),
      international: optional(row.international),
      joint: optional(row.joint),
      electronic: optional(row.electronic),
      officer: optional(row.officer),
      officerTel: optional(row.officerTel),
      officerDept: optional(row.officerDept),
      briefing: row.briefing ? {
        date: dateValue(row.briefingDate),
        time: optional(row.briefingTime),
        place: optional(row.briefingPlace),
      } : undefined,
      qualificationDeadline: optional(row.qualificationDeadline),
      bidBegin: optional(row.bidBegin),
      bidClose: optional(row.bidClose),
      opening: optional(row.opening),
      openingPlace: optional(row.openingPlace),
      budget: optional(row.budgetAmt),
      estimatedPrice: optional(row.estimatedPrice),
      priceMethod: optional(row.priceMethod),
      regionLimit: optional(row.regionLimit),
      regions: optional(row.regions),
      industryLimit: optional(row.industryLimit),
      industries: optional(row.industries),
      detailUrl: optional(row.detailUrl),
      attachments: row.attachments?.length ? row.attachments : undefined,
      lowerLimitRate: optional(row.lowerLimitRate),
      productClass: optional(row.productClass),
      noticeKind: optional(row.noticeKind),
      prespecNo: optional(row.prespecNo),
      prespecLinkedAt: textValue(row.prespecLinkedAt),
      reNotice: optional(row.reNotice),
    },
  }
}

export function awardRowToItem(row: AwardRowSelect, bidderRows: Bidder[]): Item {
  return {
    id: `award-${row.bidNtceNo}-${row.ord}`,
    kind: 'award',
    noticeNo: row.bidNtceNo,
    title: row.title,
    agency: row.ntceInsttNm ?? '',
    demandAgency: optional(row.dmndInsttNm),
    amount: optional(row.finalAmount),
    date: dateValue(row.openingDate) ?? '',
    winner: optional(row.winnerName),
    winnerBizNo: optional(row.winnerBizNo),
    awardRate: optional(row.finalRate),
    award: {
      ord: row.ord,
      agencyCode: optional(row.ntceInsttCd),
      bizDiv: optional(row.bizDiv),
      contractMethod: optional(row.contractMethod),
      awardMethod: optional(row.awardMethod),
      contractForm: optional(row.contractForm),
      lowerLimitRate: optional(row.lowerLimitRate),
      estimatedPrice: optional(row.estimatedPrice),
      reservedPrice: optional(row.reservedPrice),
      baseAmount: optional(row.baseAmount),
      openingDate: dateValue(row.openingDate),
      openingTime: optional(row.openingTime),
      finalAmount: optional(row.finalAmount),
      finalRate: optional(row.finalRate),
      finalDate: dateValue(row.finalDate),
      winnerCeo: optional(row.winnerCeo),
      winnerAddress: optional(row.winnerAddress),
      winnerTel: optional(row.winnerTel),
      bidders: bidderRows,
    },
  }
}

export function contractRowToItem(row: ContractRowSelect): Item {
  return {
    id: `contract-${row.cntrctNo}-${row.ord}`,
    kind: 'contract',
    noticeNo: row.bidNtceNo ?? row.cntrctNo,
    title: row.title,
    agency: row.cntrctInsttNm ?? '',
    demandAgency: optional(row.dmndInsttNm),
    amount: optional(row.amount),
    date: dateValue(row.concludeDate) ?? '',
    winner: optional(row.companyName),
    winnerBizNo: optional(row.companyBizNo),
    url: optional(row.infoUrl ?? row.noticeUrl),
    contract: {
      contractNo: row.cntrctNo,
      unifiedNo: optional(row.unifiedNo),
      ord: optional(row.ord),
      bizDiv: optional(row.bizDiv),
      contractForm: optional(row.contractForm),
      contractMethod: optional(row.contractMethod),
      longTerm: optional(row.longTerm),
      joint: optional(row.joint),
      period: optional(row.period),
      amount: optional(row.amount),
      totalAmount: optional(row.totalAmount),
      url: optional(row.infoUrl),
      noticeNo: optional(row.bidNtceNo),
      noticeName: optional(row.bidNtceNm),
      openingDate: dateValue(row.openingDate),
      reservedPrice: optional(row.reservedPrice),
      privateReason: optional(row.privateReason),
      contractAgency: optional(row.cntrctInsttNm),
      contractAgencyType: optional(row.cntrctInsttDiv),
      demandAgencyType: optional(row.dmndInsttDiv),
      company: optional(row.companyName),
      companyBizNo: optional(row.companyBizNo),
      companyCeo: optional(row.companyCeo),
      companyAddress: optional(row.companyAddress),
      companyTel: optional(row.companyTel),
      domestic: optional(row.domestic),
    },
  }
}

export function prespecRowToItem(
  row: PrespecRowSelect,
  docs: string[],
  products: { seq: number; code: string; name: string }[],
  convertedNotices: ConvertedNotice[] = [],
): Item {
  return {
    id: `prespec-${row.bfSpecRgstNo}`,
    kind: 'prespec',
    noticeNo: row.bfSpecRgstNo,
    title: row.title,
    agency: row.orderInsttNm ?? '',
    demandAgency: optional(row.dminsttNm),
    amount: optional(row.budgetAmt),
    date: dateValue(row.receiptDate) ?? '',
    deadline: dateValue(row.opinionCloseAt),
    prespec: {
      bizDiv: optional(row.bizDiv),
      refNo: optional(row.refNo),
      opinionDeadline: optional(row.opinionCloseAt),
      deliveryDeadline: optional(row.deliveryDeadlineAt),
      deliveryDays: optional(row.deliveryDays),
      officer: optional(row.officer),
      officerTel: optional(row.officerTel),
      swBiz: optional(row.swBiz),
      specDocs: docs,
      products,
      relatedNoticeNos: row.relatedNoticeNos ?? [],
      convertedNotices: convertedNotices.length ? convertedNotices : undefined,
      changedAt: optional(row.changedAt),
    },
  }
}
