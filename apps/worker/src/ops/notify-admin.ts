import { loadNotifyEnv } from '../notify/env'
import { sendWebhook } from '../notify/webhook'
import type { AlertMessage } from '../notify/types'

/** 웹훅 본문 최대 길이(제목 제외). 초과분은 잘라낸다 */
export const ADMIN_MESSAGE_MAX = 1500

export interface NotifyAdminOptions {
  /** 미지정이면 process.env.ADMIN_WEBHOOK_URL */
  url?: string
  /** 테스트 주입. 미지정이면 globalThis.fetch */
  fetchImpl?: typeof fetch
}

/** 접속 문자열 비밀번호와 쿼리 파라미터의 키 값을 '***'로 가린다 */
export function redactSecrets(text: string): string {
  const REDACTIONS: readonly (readonly [RegExp, string])[] = [
    [/(postgres(?:ql)?:\/\/[^:@\s]+:)[^@\s]+@/gi, '$1***@'],
    [/((?:servicekey|apikey|api_key|access_token|token|secret|password)=)[^&\s"']+/gi, '$1***'],
  ]
  return REDACTIONS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text)
}

/**
 * 관리자 웹훅으로 운영 알림을 보낸다. ADMIN_WEBHOOK_URL이 없으면 로그 한 줄만 남기고 false.
 * 실패해도 throw하지 않는다. 반환값은 발송 성공 여부.
 */
export async function notifyAdmin(title: string, text: string, opts?: NotifyAdminOptions): Promise<boolean> {
  const url = (opts?.url ?? process.env.ADMIN_WEBHOOK_URL ?? '').trim()
  if (!url) {
    console.log('ADMIN_WEBHOOK_URL이 설정되지 않아 관리자 알림을 건너뜁니다.')
    return false
  }

  try {
    const body = redactSecrets(text).slice(0, ADMIN_MESSAGE_MAX)
    const safeTitle = redactSecrets(title)
    const env = loadNotifyEnv(opts?.fetchImpl ? { fetchImpl: opts.fetchImpl } : undefined)
    const message: AlertMessage = {
      title: safeTitle,
      summary: body.slice(0, 200),
      text: body,
      html: '',
      url: env.appUrl,
      total: 0,
      items: [],
    }
    const result = await sendWebhook({ url }, message, env)
    if (!result.ok) {
      console.error('관리자 알림 발송 실패: ' + (result.error ?? ''))
      return false
    }
    return true
  } catch {
    return false
  }
}
