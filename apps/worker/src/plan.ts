import { chunkRange, MAX_PAGES, PRESPEC_MAX_PAGES } from '@nara/api'
import type { PrespecBizDiv } from '@nara/api'
import { ingestJobs } from '@nara/db'
import type { NaraDb } from '@nara/db'

export type JobKind = 'notice' | 'award' | 'contract' | 'prespec'
export const JOB_KINDS: readonly JobKind[] = ['notice', 'award', 'contract', 'prespec']

/** kind별 chunkRange 단위 — packages/nara-api 의 chunkRange를 그대로 쓴다 */
export const CHUNK_UNIT: Record<JobKind, 'day' | 'week' | 'month'> = {
  notice: 'month', award: 'day', contract: 'week', prespec: 'day',
}
/** kind별 청크당 최대 페이지. notice/award/contract는 @nara/api 의 MAX_PAGES 재사용 */
export const KIND_MAX_PAGES: Record<JobKind, number> = {
  notice: MAX_PAGES.notice, award: MAX_PAGES.award, contract: MAX_PAGES.contract, prespec: PRESPEC_MAX_PAGES,
}
/** biz_div 로 나뉘는 kind — notice는 입찰공고정보서비스가 업무구분별 오퍼레이션이라 함께 나눈다 */
export const DIVIDED_KINDS: readonly JobKind[] = ['notice', 'award', 'prespec']
export const ALL_BIZ_DIVS: readonly PrespecBizDiv[] = ['Thng', 'Servc', 'Cnstwk', 'Frgcpt']

export interface PlanOptions {
  kind: JobKind
  from: string
  to: string
  bizDivs?: PrespecBizDiv[]
}
export interface PlanResult { created: number; existing: number }

/** chunkRange와 업무구분 조합을 체크포인트 행으로 예약하고 기존 진행 상태는 보존한다. */
export async function planJobs(db: NaraDb, opts: PlanOptions): Promise<PlanResult> {
  const ranges = chunkRange(opts.from, opts.to, CHUNK_UNIT[opts.kind])
  const divs = DIVIDED_KINDS.includes(opts.kind) ? (opts.bizDivs?.length ? opts.bizDivs : ALL_BIZ_DIVS) : ['' as const]
  const values = divs.flatMap((bizDiv) => ranges.map(([chunkStart, chunkEnd]) => ({ kind: opts.kind, bizDiv, chunkStart, chunkEnd })))
  if (values.length === 0) return { created: 0, existing: 0 }
  const inserted = await db.insert(ingestJobs).values(values).onConflictDoNothing({ target: [ingestJobs.kind, ingestJobs.bizDiv, ingestJobs.chunkStart] }).returning({ id: ingestJobs.id })
  const created = inserted.length
  return { created, existing: values.length - created }
}
