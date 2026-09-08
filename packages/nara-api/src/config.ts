import { NaraApiError } from './common'

export interface NaraConfig {
  /** 공공데이터포털 Decoding 인증키. 빈 문자열이면 미설정 */
  serviceKey: string
  /** 오퍼레이션 앞까지의 접두. 브라우저(dev 프록시)='/nara', 서버='https://apis.data.go.kr/1230000' */
  baseUrl: string
  /** 테스트/서버에서 fetch 주입. 미지정 시 호출 시점의 globalThis.fetch 사용 */
  fetchImpl?: typeof fetch
}

const config: NaraConfig = {
  serviceKey: '',
  baseUrl: 'https://apis.data.go.kr/1230000',
}

export function configureNara(cfg: Partial<NaraConfig>): void {
  if (cfg.serviceKey !== undefined) config.serviceKey = cfg.serviceKey.trim()
  if (cfg.baseUrl !== undefined) config.baseUrl = cfg.baseUrl
  if (cfg.fetchImpl !== undefined) config.fetchImpl = cfg.fetchImpl
}

export function naraConfig(): Readonly<NaraConfig> {
  return config
}

export function hasServiceKey(): boolean {
  return !!config.serviceKey
}

/** 미설정이면 `new NaraApiError('10')` 을 throw */
export function serviceKey(): string {
  if (!config.serviceKey) {
    throw new NaraApiError('10')
  }
  return config.serviceKey
}
