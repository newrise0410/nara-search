import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const KEY_ERROR = 'ALERT_SECRET_KEY는 32바이트 hex(64자)여야 합니다.'
const OPEN_ERROR = '저장된 토큰을 복호화하지 못했습니다. ALERT_SECRET_KEY가 바뀌었는지 확인하세요.'

const keyOf = (keyHex: string): Buffer => {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error(KEY_ERROR)
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error(KEY_ERROR)
  return key
}

/** 봉인 문자열 형식: '<iv>.<ciphertext>.<tag>' (전부 base64url) */
export function seal(plain: string, keyHex: string): string {
  const key = keyOf(keyHex)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, ciphertext, tag].map((part) => part.toString('base64url')).join('.')
}

export function open(sealed: string, keyHex: string): string {
  const key = keyOf(keyHex)
  try {
    if (!isSealed(sealed)) throw new Error('malformed sealed value')
    const [iv, ciphertext, tag] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'))
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    throw new Error(OPEN_ERROR)
  }
}

/** '<a>.<b>.<c>' 3파트 base64url 이면 true */
export function isSealed(value: unknown): value is string {
  return typeof value === 'string' && value.split('.').length === 3 && value
    .split('.')
    .every((part) => /^[A-Za-z0-9_-]+$/.test(part))
}
