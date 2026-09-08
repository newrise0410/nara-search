import type { Item } from '@nara/api'

export type ChannelType = 'kakao' | 'email' | 'webhook' | 'webpush'
export const CHANNEL_TYPES: readonly ChannelType[] = ['kakao', 'email', 'webhook', 'webpush']

/** DB alert_channels 한 행 (config는 아직 검증 전이라 unknown) */
export interface NotifyChannel {
  id: string
  userId: string
  type: ChannelType
  label: string
  config: unknown
  enabled: boolean
}

export interface SendResult {
  ok: boolean
  /** 실패 사유(한국어 완결 문장 또는 원문 응답 앞 300자) */
  error?: string
  /** 구독 만료·연결 해제 등 되돌릴 수 없는 실패 → 호출자가 채널을 enabled=false 로 끈다 */
  gone?: boolean
  /** 토큰이 갱신되어 저장해야 할 새 config. 없으면 저장하지 않는다 */
  config?: unknown
}

/** 채널로 실제 발송하는 함수. 테스트에서 주입한다. */
export type SendFn = (channel: NotifyChannel, message: AlertMessage) => Promise<SendResult>

/** 한 규칙의 매칭 결과를 채널에 보낼 수 있는 형태로 미리 조립한 것 */
export interface AlertMessage {
  /** 알림 제목 */
  title: string
  /** 200자 이하 한 줄 요약 — 카카오·웹푸시 본문 */
  summary: string
  /** 여러 줄 평문 — 웹훅·이메일 텍스트 파트 */
  text: string
  /** 이메일 HTML 본문 */
  html: string
  /** 대표 링크 */
  url: string
  /** 매칭 총 건수 */
  total: number
  /** 메시지에 실제로 담긴 항목 (최대 MESSAGE_MAX_ITEMS개) */
  items: Item[]
}
