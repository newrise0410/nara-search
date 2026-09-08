import type { AlertMessage, SendResult } from './types'
import type { NotifyEnv } from './env'

export const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize'
export const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token'
export const KAKAO_SEND_URL = 'https://kapi.kakao.com/v2/api/talk/memo/default/send'
/** 카카오 text 템플릿 본문 상한 */
export const KAKAO_TEXT_MAX = 200

/** DB에 저장하는 카카오 채널 config. 토큰은 호출 전에 봉인 해제한다. */
export interface KakaoConfig {
  refreshToken: string
  accessToken?: string
  /** ISO 8601. 이 시각 이전이면 갱신한다. */
  expiresAt?: string
}

export interface KakaoTokens { refreshToken?: string; accessToken: string; expiresAt: string }

class InvalidGrantError extends Error {}

const fetchOf = (env: NotifyEnv): typeof fetch => env.fetchImpl ?? globalThis.fetch

const tokenBody = (env: NotifyEnv, grantType: 'authorization_code' | 'refresh_token', value: string): string => {
  const body = new URLSearchParams()
  body.set('grant_type', grantType)
  body.set('client_id', env.kakaoRestApiKey ?? '')
  if (grantType === 'authorization_code') {
    body.set('redirect_uri', env.kakaoRedirectUri ?? '')
    body.set('code', value)
  } else {
    body.set('refresh_token', value)
  }
  if (env.kakaoClientSecret) body.set('client_secret', env.kakaoClientSecret)
  return body.toString()
}

const tokenResponse = async (response: Response): Promise<KakaoTokens> => {
  const text = await response.text()
  let body: Record<string, unknown> = {}
  try { body = JSON.parse(text) as Record<string, unknown> } catch { /* 아래 오류에 원문을 남긴다. */ }
  if (!response.ok) {
    if (body.error === 'invalid_grant') throw new InvalidGrantError('invalid_grant')
    throw new Error(`카카오 토큰 발급 실패(${response.status}): ${text.slice(0, 300)}`)
  }
  const accessToken = typeof body.access_token === 'string' ? body.access_token : ''
  if (!accessToken) throw new Error('카카오 토큰 응답이 올바르지 않습니다.')
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 0
  return {
    accessToken,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }
}

/** 동의 화면 URL. scope는 'talk_message' 고정. */
export function kakaoAuthorizeUrl(env: NotifyEnv, state: string): string {
  const url = new URL(KAKAO_AUTHORIZE_URL)
  url.searchParams.set('client_id', env.kakaoRestApiKey ?? '')
  url.searchParams.set('redirect_uri', env.kakaoRedirectUri ?? '')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'talk_message')
  url.searchParams.set('state', state)
  return url.toString()
}

/** authorization_code → 토큰. */
export async function exchangeKakaoCode(code: string, env: NotifyEnv): Promise<KakaoTokens> {
  const response = await fetchOf(env)(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: tokenBody(env, 'authorization_code', code),
  })
  return tokenResponse(response)
}

/** refresh_token → access_token. */
export async function refreshKakaoToken(refreshToken: string, env: NotifyEnv): Promise<KakaoTokens> {
  const response = await fetchOf(env)(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: tokenBody(env, 'refresh_token', refreshToken),
  })
  return tokenResponse(response)
}

const sendBody = (message: AlertMessage): string => {
  const template = {
    object_type: 'text',
    text: message.summary.slice(0, KAKAO_TEXT_MAX),
    link: { web_url: message.url, mobile_web_url: message.url },
    button_title: '열기',
  }
  return new URLSearchParams({ template_object: JSON.stringify(template) }).toString()
}

const kakaoFailure = async (response: Response): Promise<{ status: number; body: Record<string, unknown>; text: string }> => {
  const text = await response.text()
  let body: Record<string, unknown> = {}
  try { body = JSON.parse(text) as Record<string, unknown> } catch { /* 원문만으로 실패 사유를 만든다. */ }
  return { status: response.status, body, text }
}

const sendOnce = async (accessToken: string, message: AlertMessage, env: NotifyEnv) => {
  const response = await fetchOf(env)(KAKAO_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: sendBody(message),
  })
  const result = await kakaoFailure(response)
  const unauthorized = result.status === 401 || result.body.code === -401
  return { response, result, unauthorized }
}

const refreshConfig = async (config: KakaoConfig, env: NotifyEnv): Promise<{ config: KakaoConfig; changed: boolean }> => {
  const tokens = await refreshKakaoToken(config.refreshToken, env)
  return {
    changed: true,
    config: {
      refreshToken: tokens.refreshToken ?? config.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    },
  }
}

/** config는 봉인 해제된 평문 토큰이다. */
export async function sendKakao(config: KakaoConfig, message: AlertMessage, env: NotifyEnv): Promise<SendResult> {
  if (!env.kakaoRestApiKey) return { ok: false, error: 'KAKAO_REST_API_KEY가 설정되지 않았습니다.' }

  let current = config
  let refreshed = false
  try {
    if (!current.accessToken || !current.expiresAt || new Date(current.expiresAt).getTime() <= Date.now()) {
      const result = await refreshConfig(current, env)
      current = result.config
      refreshed = result.changed
    }

    let sent = await sendOnce(current.accessToken!, message, env)
    if (sent.unauthorized) {
      const result = await refreshConfig(current, env)
      current = result.config
      refreshed = result.changed
      sent = await sendOnce(current.accessToken!, message, env)
    }

    if (sent.response.ok && sent.result.body.result_code === 0) {
      return { ok: true, ...(refreshed ? { config: current } : {}) }
    }
    return {
      ok: false,
      error: `카카오 발송 실패(${sent.result.status}): ${sent.result.text.slice(0, 300)}`,
      ...(refreshed ? { config: current } : {}),
    }
  } catch (error) {
    if (error instanceof InvalidGrantError) {
      return { ok: false, gone: true, error: '카카오 연결이 해제되었습니다. 다시 연결해 주세요.' }
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
