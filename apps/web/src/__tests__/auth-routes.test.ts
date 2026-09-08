import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authErrorMessage, authRedirect, originOf, isProtectedPath, safeNextPath } from '@/lib/auth-routes'

describe('인증 경로 헬퍼', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SITE_URL', ''))
  afterEach(() => vi.unstubAllEnvs())

  it('보호 경로와 공개 경로를 구분한다', () => {
    expect(['/dashboard', '/search', '/results', '/profiles', '/keywords', '/competitors', '/companies', '/settings'].every(isProtectedPath)).toBe(true)
    expect(isProtectedPath('/settings/alerts')).toBe(true)
    expect(['/','/login','/auth/callback','/api/search'].some(isProtectedPath)).toBe(false)
  })

  it('/companies 업체 프로파일을 로그인 게이트로 보호한다', () => {
    expect(isProtectedPath('/companies/4121098706')).toBe(true)
    expect(authRedirect('/companies/4121098706', '', false)).toBe('/login?next=%2Fcompanies%2F4121098706')
    expect(authRedirect('/companies/4121098706', '', true)).toBeNull()
  })

  it('미로그인 보호 경로를 next 파라미터와 함께 /login으로 보낸다', () => {
    expect(authRedirect('/dashboard', '', false)).toBe('/login?next=%2Fdashboard')
    expect(authRedirect('/results', '?kind=award', false)).toBe('/login?next=%2Fresults%3Fkind%3Daward')
  })

  it('/api 경로는 미들웨어에서 리다이렉트하지 않는다', () => {
    expect(authRedirect('/api/search', '?kind=award', false)).toBeNull()
  })

  it('로그인 상태에서 /login은 /dashboard로 보낸다', () => {
    expect(authRedirect('/login', '', true)).toBe('/dashboard')
    expect(authRedirect('/dashboard', '', true)).toBeNull()
  })

  it('safeNextPath가 외부 URL과 리다이렉트 루프를 막는다', () => {
    expect(safeNextPath(null)).toBe('/dashboard')
    expect(safeNextPath('https://evil.com')).toBe('/dashboard')
    expect(safeNextPath('//evil.com')).toBe('/dashboard')
    expect(safeNextPath('/login')).toBe('/dashboard')
    expect(safeNextPath('/auth/callback')).toBe('/dashboard')
    expect(safeNextPath('/results?kind=award')).toBe('/results?kind=award')
  })

  it('originOf가 x-forwarded-host를 우선한다', () => {
    const forwarded = new Request('http://localhost:3000/path', { headers: { 'x-forwarded-host': 'app.example.com' } })
    const direct = new Request('http://localhost:3000/path')
    expect(originOf(forwarded)).toBe('https://app.example.com')
    expect(originOf(direct)).toBe(new URL(direct.url).origin)
  })

  it('originOf가 NEXT_PUBLIC_SITE_URL과 다른 x-forwarded-host를 무시한다', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.example.com')
    const evil = new Request('http://localhost:3000/path', { headers: { 'x-forwarded-host': 'evil.example.com' } })
    const allowed = new Request('http://localhost:3000/path', { headers: { 'x-forwarded-host': 'app.example.com' } })
    expect(originOf(evil)).toBe('http://localhost:3000')
    expect(originOf(allowed)).toBe('https://app.example.com')
  })

  it('authErrorMessage가 코드별 문구를 돌려준다', () => {
    expect(authErrorMessage('no_code')).toBe('구글 로그인이 완료되지 않았습니다. 다시 시도해 주세요.')
    expect(authErrorMessage('exchange_failed')).toBe('로그인 세션을 만들지 못했습니다. 다시 시도해 주세요.')
    expect(authErrorMessage('oauth_error')).toBe('구글 계정 연결이 취소되었거나 거부되었습니다.')
    expect(authErrorMessage('other')).toBe('로그인 중 문제가 발생했습니다. 다시 시도해 주세요.')
    expect(authErrorMessage(null)).toBeNull()
  })
})
