/** 서버가 uuid 컬럼에 저장하므로 반드시 UUID여야 한다 */
export const uid = (): string => crypto.randomUUID()
