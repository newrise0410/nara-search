import { addDays } from '@nara/api'

/**
 * 무료 티어(500MB) 보존 창(일). **유료 전환 시 이 파일만 고친다.**
 * bidders 7일 ≈ 170MB · notices 60일 ≈ 125MB · contracts 30일 ≈ 150MB (docs/ROADMAP.md 실측)
 */
export const RETENTION = { bidders: 7, notices: 60, contracts: 30 } as const
export type Retention = { bidders: number; notices: number; contracts: number }

/** Supabase 무료 플랜 DB 상한 500MiB */
export const STORAGE_BUDGET_BYTES = 500 * 1024 * 1024

/** 사용률이 이 값을 넘으면 상태 점검이 경고한다 */
export const STORAGE_WARN_RATIO = 0.9

/** 보존 창은 [today - days, today]. 반환값 **미만**(<)이 삭제 대상이다 */
export const cutoffDate = (today: string, days: number): string => addDays(today, -days)
