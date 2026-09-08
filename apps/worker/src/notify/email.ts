import type { AlertMessage, SendResult } from './types'
import type { NotifyEnv } from './env'

export const RESEND_URL = 'https://api.resend.com/emails'
export interface EmailConfig { address: string }

export async function sendEmail(config: EmailConfig, message: AlertMessage, env: NotifyEnv): Promise<SendResult> {
  if (!env.resendApiKey) return { ok: false, error: 'RESEND_API_KEY가 설정되지 않았습니다.' }
  if (!env.alertFromEmail) return { ok: false, error: 'ALERT_FROM_EMAIL이 설정되지 않았습니다.' }
  try {
    const response = await (env.fetchImpl ?? globalThis.fetch)(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.alertFromEmail,
        to: [config.address],
        subject: message.title,
        html: message.html,
        text: message.text,
      }),
    })
    if (response.ok) return { ok: true }
    return { ok: false, error: `이메일 발송 실패(${response.status}): ${(await response.text()).slice(0, 300)}` }
  } catch (error) {
    return { ok: false, error: `이메일 발송 실패: ${error instanceof Error ? error.message : String(error)}` }
  }
}
