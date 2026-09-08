import type { AlertKind } from '@nara/api'

export type Digest = 'instant' | 'daily'

/** alert_rules 한 행 + 평가에 필요한 것만 표현한다. */
export interface AlertRule {
  id: string
  orgId: string
  userId: string
  name: string
  enabled: boolean
  kinds: AlertKind[]
  keywords: string[]
  profileId: string | null
  categoryNames: string[]
  agency: string | null
  amountMin: number | null
  amountMax: number | null
  channelIds: string[]
  digest: Digest
}

export interface AlertsRunResult {
  /** 이번 실행이 본 신규·갱신 기준 시각 (ISO) */
  since: string
  /** 평가한 활성 규칙 수 */
  rules: number
  /** 대상 항목 수(중복 제거 전, kind 합계) */
  candidates: number
  /** 규칙×항목 매칭 수 */
  matched: number
  /** 실제 발송 성공한 (규칙,채널) 메시지 수 */
  sent: number
  /** 이미 보낸 적이 있어 건너뛴 (규칙,항목,채널) 수 */
  skipped: number
  /** 발송 실패한 (규칙,채널) 메시지 수 */
  failed: number
  elapsedMs: number
}
