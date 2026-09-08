import type { AlertMessage, SendResult } from './types'
import type { NotifyEnv } from './env'

export type WebhookKind = 'slack' | 'discord' | 'generic'
export interface WebhookConfig { url: string; kind?: WebhookKind }

/** 호스트 이름으로 웹훅 서비스 종류를 판별한다. */
export function webhookKindOf(url: string): WebhookKind {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'hooks.slack.com') return 'slack'
    if (host === 'discord.com' || host.endsWith('.discord.com') || host === 'discordapp.com' || host.endsWith('.discordapp.com')) return 'discord'
  } catch { /* generic으로 처리한다. */ }
  return 'generic'
}

/** 서비스별 웹훅 요청 본문을 만든다. */
export function webhookBody(kind: WebhookKind, message: AlertMessage): unknown {
  if (kind === 'slack') return { text: `*${message.title}*\n${message.text}` }
  if (kind === 'discord') return { content: `**${message.title}**\n${message.text}`.slice(0, 1900) }
  return { title: message.title, text: message.text, url: message.url, total: message.total }
}

export async function sendWebhook(config: WebhookConfig, message: AlertMessage, env: NotifyEnv): Promise<SendResult> {
  let url: URL
  try { url = new URL(config.url) } catch { return { ok: false, error: '웹훅 주소는 http 또는 https 여야 합니다.' } }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: '웹훅 주소는 http 또는 https 여야 합니다.' }
  try {
    const kind = config.kind ?? webhookKindOf(config.url)
    const response = await (env.fetchImpl ?? globalThis.fetch)(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookBody(kind, message)),
    })
    if (response.ok) return { ok: true }
    return { ok: false, error: `웹훅 발송 실패(${response.status}): ${(await response.text()).slice(0, 300)}` }
  } catch (error) {
    return { ok: false, error: `웹훅 발송 실패: ${error instanceof Error ? error.message : String(error)}` }
  }
}
