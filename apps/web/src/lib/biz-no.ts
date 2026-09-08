/** DB마다 다른 사업자번호 표기를 하나의 숫자만 표기로 정규화한다. */
export function plainBizNo(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

/** 숫자 10자리만 DB의 하이픈 표기로 바꿔 잘못된 링크를 막는다. */
export function hyphenBizNo(value: string): string {
  const numeric = plainBizNo(value)
  if (numeric.length !== 10) return ''
  return `${numeric.slice(0, 3)}-${numeric.slice(3, 5)}-${numeric.slice(5)}`
}

/** 프로파일 경로에는 숫자만 남긴 사업자번호 10자리만 허용한다. */
export function isBizNoParam(value: string | null | undefined): boolean {
  return value != null && plainBizNo(value).length === 10
}

/** 유효한 사업자번호만 숫자 표기의 프로파일 경로로 연결한다. */
export function companyHref(value: string | null | undefined): string | null {
  if (!isBizNoParam(value)) return null
  return `/companies/${plainBizNo(value ?? '')}`
}
