import { configureNara } from '@nara/api'

/** NARA_API_KEY 미설정 — 라우트가 503으로 변환한다 */
export class MissingNaraKeyError extends Error {
  constructor() { super('NARA_API_KEY가 설정되지 않았습니다. apps/web/.env 또는 배포 환경변수에 지정하세요.') }
}

/** @nara/api 를 서버 키로 설정한다. 매 호출 idempotent. */
export function ensureNaraConfigured(): boolean {
  const serviceKey = process.env.NARA_API_KEY?.trim() || process.env.VITE_NARA_API_KEY?.trim() || ''
  const baseUrl = process.env.NARA_BASE_URL?.trim() || 'https://apis.data.go.kr/1230000'
  configureNara({ serviceKey, baseUrl })
  return !!serviceKey
}
