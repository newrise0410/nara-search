export interface NotifyEnv {
  /** 알림 링크의 베이스 URL. 기본 'http://localhost:3000' */
  appUrl: string
  /** 32바이트 hex(64자). 없으면 카카오 채널은 발송 불가 */
  alertSecretKey?: string
  kakaoRestApiKey?: string
  kakaoClientSecret?: string
  kakaoRedirectUri?: string
  resendApiKey?: string
  alertFromEmail?: string
  vapidPublicKey?: string
  vapidPrivateKey?: string
  vapidSubject?: string
  /** 테스트 주입용. 미지정이면 globalThis.fetch */
  fetchImpl?: typeof fetch
}

const trimmed = (value: string | undefined): string | undefined => value?.trim() || undefined

const valueOf = (overrides: Partial<NotifyEnv> | undefined, key: keyof NotifyEnv, envKey: string): string | undefined => {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
    const value = overrides[key]
    return typeof value === 'string' ? trimmed(value) : undefined
  }
  return trimmed(process.env[envKey])
}

/** 환경변수는 비어 있으면 없는 값으로 취급하고, 테스트 override를 우선한다. */
export function loadNotifyEnv(overrides?: Partial<NotifyEnv>): NotifyEnv {
  return {
    appUrl: valueOf(overrides, 'appUrl', 'APP_URL') ?? 'http://localhost:3000',
    alertSecretKey: valueOf(overrides, 'alertSecretKey', 'ALERT_SECRET_KEY'),
    kakaoRestApiKey: valueOf(overrides, 'kakaoRestApiKey', 'KAKAO_REST_API_KEY'),
    kakaoClientSecret: valueOf(overrides, 'kakaoClientSecret', 'KAKAO_CLIENT_SECRET'),
    kakaoRedirectUri: valueOf(overrides, 'kakaoRedirectUri', 'KAKAO_REDIRECT_URI'),
    resendApiKey: valueOf(overrides, 'resendApiKey', 'RESEND_API_KEY'),
    alertFromEmail: valueOf(overrides, 'alertFromEmail', 'ALERT_FROM_EMAIL'),
    vapidPublicKey: valueOf(overrides, 'vapidPublicKey', 'VAPID_PUBLIC_KEY'),
    vapidPrivateKey: valueOf(overrides, 'vapidPrivateKey', 'VAPID_PRIVATE_KEY'),
    vapidSubject: valueOf(overrides, 'vapidSubject', 'VAPID_SUBJECT'),
    fetchImpl: overrides && Object.prototype.hasOwnProperty.call(overrides, 'fetchImpl') ? overrides.fetchImpl ?? globalThis.fetch : globalThis.fetch,
  }
}
