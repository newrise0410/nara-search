import { isSealed, open, seal } from './secret'
import { sendEmail } from './email'
import { sendKakao } from './kakao'
import { sendWebhook } from './webhook'
import { sendWebPush } from './webpush'
import type { NotifyEnv } from './env'
import type { AlertMessage, ChannelType, NotifyChannel, SendResult } from './types'

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined

const invalid = (): SendResult => ({ ok: false, error: '채널 설정이 올바르지 않습니다.' })

const sealedToken = (value: unknown, env: NotifyEnv): string | undefined => {
  if (typeof value !== 'string') return undefined
  return isSealed(value) ? open(value, env.alertSecretKey ?? '') : value
}

const kakaoConfigOf = (value: unknown, env: NotifyEnv) => {
  const config = recordOf(value)
  if (!config || typeof config.refreshToken !== 'string' || !config.refreshToken) return undefined
  const refreshToken = sealedToken(config.refreshToken, env)
  const accessToken = config.accessToken === undefined ? undefined : sealedToken(config.accessToken, env)
  if (!refreshToken || (config.accessToken !== undefined && !accessToken)) return undefined
  return {
    refreshToken,
    ...(accessToken ? { accessToken } : {}),
    ...(typeof config.expiresAt === 'string' ? { expiresAt: config.expiresAt } : {}),
  }
}

const sealKakaoConfig = (value: unknown, env: NotifyEnv): unknown => {
  const config = recordOf(value)
  if (!config || typeof config.refreshToken !== 'string' || !env.alertSecretKey) throw new Error('ALERT_SECRET_KEY가 설정되지 않았습니다.')
  return {
    refreshToken: seal(config.refreshToken, env.alertSecretKey),
    ...(typeof config.accessToken === 'string' ? { accessToken: seal(config.accessToken, env.alertSecretKey) } : {}),
    ...(typeof config.expiresAt === 'string' ? { expiresAt: config.expiresAt } : {}),
  }
}

/** 채널 1개로 발송한다. 설정 오류나 네트워크 오류도 호출자에게 반환한다. */
export async function sendToChannel(channel: NotifyChannel, message: AlertMessage, env: NotifyEnv): Promise<SendResult> {
  try {
    let result: SendResult
    if (channel.type === 'kakao') {
      if (!env.alertSecretKey) return { ok: false, error: 'ALERT_SECRET_KEY가 설정되지 않았습니다.' }
      const config = kakaoConfigOf(channel.config, env)
      if (!config) return invalid()
      result = await sendKakao(config, message, env)
      if (result.config) result.config = sealKakaoConfig(result.config, env)
      return result
    }
    if (channel.type === 'email') {
      const config = recordOf(channel.config)
      if (!config || typeof config.address !== 'string' || !config.address) return invalid()
      return await sendEmail({ address: config.address }, message, env)
    }
    if (channel.type === 'webhook') {
      const config = recordOf(channel.config)
      if (!config || typeof config.url !== 'string' || !config.url) return invalid()
      if (config.kind !== undefined && config.kind !== 'slack' && config.kind !== 'discord' && config.kind !== 'generic') return invalid()
      const kind = config.kind as 'slack' | 'discord' | 'generic' | undefined
      return await sendWebhook({ url: config.url, ...(kind ? { kind } : {}) }, message, env)
    }
    if (channel.type === 'webpush') {
      const config = recordOf(channel.config)
      const keys = config ? recordOf(config.keys) : undefined
      if (!config || typeof config.endpoint !== 'string' || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return invalid()
      return await sendWebPush({
        endpoint: config.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        ...(typeof config.userAgent === 'string' ? { userAgent: config.userAgent } : {}),
      }, message, env)
    }
    return invalid()
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** UI에 보여줄 안전한 요약 문자열 (비밀값 없음). */
export function channelTarget(type: ChannelType, config: unknown): string {
  try {
    const value = recordOf(config)
    if (type === 'kakao') return '카카오톡 연결됨'
    if (type === 'email' && typeof value?.address === 'string') return value.address
    if (type === 'webhook' && typeof value?.url === 'string') return new URL(value.url).host
    if (type === 'webpush' && typeof value?.endpoint === 'string') return new URL(value.endpoint).host
  } catch { /* 안전한 대체 문자열을 반환한다. */ }
  return '-'
}
