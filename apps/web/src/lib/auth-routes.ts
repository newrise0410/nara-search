/** 로그인해야 볼 수 있는 페이지 경로 접두사 */
export const PROTECTED_PREFIXES = [
  '/dashboard', '/search', '/results', '/profiles', '/keywords', '/competitors', '/companies', '/settings',
] as const

/** 정확히 일치하거나 하위 경로면 보호 대상 */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** 인증 상태에 따라 미들웨어가 보낼 목적지를 돌려준다 */
export function authRedirect(pathname: string, search: string, signedIn: boolean): string | null {
  if (pathname.startsWith('/api/')) return null
  if (signedIn && pathname === '/login') return '/dashboard'
  if (!signedIn && isProtectedPath(pathname)) {
    return `/login?next=${encodeURIComponent(pathname + search)}`
  }
  return null
}

/** 오픈 리다이렉트를 막고 안전한 다음 경로를 돌려준다 */
export function safeNextPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.startsWith('/login') || value.startsWith('/auth')) {
    return fallback
  }
  return value
}

/** NEXT_PUBLIC_SITE_URL이 설정돼 있으면 그 호스트만 프록시 헤더로 인정한다(미설정이면 검사하지 않음) */
function allowedForwardedHost(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw) return undefined
  try { return new URL(raw).host.toLowerCase() } catch { return undefined }
}

/** 프록시 헤더를 반영한 절대 origin. 화이트리스트와 다른 x-forwarded-host는 무시하고 요청 URL로 폴백한다 */
export function originOf(request: Request): string {
  const direct = new URL(request.url).origin
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim()
  if (!forwardedHost) return direct
  const allowed = allowedForwardedHost()
  if (allowed && forwardedHost.toLowerCase() !== allowed) return direct
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || 'https'
  return `${forwardedProto}://${forwardedHost}`
}

/** OAuth 오류 코드를 사용자에게 보여줄 한국어 문구로 바꾼다 */
export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null
  if (code === 'no_code') return '구글 로그인이 완료되지 않았습니다. 다시 시도해 주세요.'
  if (code === 'exchange_failed') return '로그인 세션을 만들지 못했습니다. 다시 시도해 주세요.'
  if (code === 'oauth_error') return '구글 계정 연결이 취소되었거나 거부되었습니다.'
  return '로그인 중 문제가 발생했습니다. 다시 시도해 주세요.'
}
