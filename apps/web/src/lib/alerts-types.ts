import { ALERT_KIND_VALUES } from '@nara/api'
import type { AlertKind } from '@nara/api'

export type ChannelType = 'kakao' | 'email' | 'webhook' | 'webpush'
export const CHANNEL_TYPES: readonly ChannelType[] = ['kakao', 'email', 'webhook', 'webpush']
export const CHANNEL_LABELS: Record<ChannelType, string> = {
  kakao: '카카오톡 나에게 보내기', email: '이메일', webhook: 'Slack / Discord 웹훅', webpush: '웹푸시',
}

export type Digest = 'instant' | 'daily'
export const ALERT_KINDS: readonly AlertKind[] = ALERT_KIND_VALUES
export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  notice: '입찰공고', award: '낙찰', prespec: '사전규격', contract: '계약', 'prespec-link': '사전규격→본공고',
}

/** 비밀값이 제거된 채널 표현 — 이 모양만 브라우저로 나간다. */
export interface AlertChannelView {
  id: string
  type: ChannelType
  label: string
  /** 주소/호스트 요약 (토큰 없음) */
  target: string
  enabled: boolean
  createdAt: string
}

export interface AlertRuleView {
  id: string
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
  updatedAt: string
}

export interface ChannelBody {
  type: ChannelType
  label: string
  enabled?: boolean
  config: unknown
}

export interface RuleBody {
  id?: string
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

export interface ChannelsResponse { channels: AlertChannelView[]; available?: Partial<Record<AlertChannelView['type'], boolean>> }
export interface RulesResponse { rules: AlertRuleView[] }
