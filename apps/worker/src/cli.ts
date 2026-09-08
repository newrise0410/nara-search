import { pathToFileURL } from 'node:url'
import { and, eq, gte, lte } from 'drizzle-orm'
import { isYmd } from '@nara/api'
import { createDb, ingestJobs, runMigrations } from '@nara/db'
import type { PrespecBizDiv } from '@nara/api'
import { ALL_BIZ_DIVS, JOB_KINDS, planJobs } from './plan'
import type { JobKind } from './plan'
import { loadEnv, requireDatabaseUrl } from './env'
import type { WorkerEnv } from './env'
import { MAX_ATTEMPTS, runOnce } from './run'
import type { RunOnceResult } from './run'
import { runAlerts } from './alerts/run'
import { backfillOrgs } from './orgs/backfill'
import { notifyAdmin } from './ops/notify-admin'
import { prune } from './prune'
import { latestAwardMonth, rebuildAwardStats } from './stats'

const USAGE = `사용법:
  worker migrate [--to <tag>]
  worker orgs backfill
  worker run-once [--budget-ms <ms>] [--max-jobs <n>]
  worker alerts run [--since <ISO 8601>] [--dry-run]
  worker plan [--kind <notice|award|contract|prespec>] --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--biz-div <Thng|Servc|Cnstwk|Frgcpt>[,...]]
  worker prune [--today <YYYY-MM-DD>] [--dry-run]
  worker stats rebuild [--month <YYYY-MM>] [--window-months <n>]
  worker backfill --kind <kind> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--biz-div <...>] [--budget-ms <ms>] [--summary-only]`

const FLAG_NAMES = new Set(['--kind', '--from', '--to', '--biz-div', '--budget-ms', '--max-jobs', '--since', '--dry-run', '--summary-only', '--today', '--month', '--window-months'])
const BOOLEAN_FLAGS = new Set(['--dry-run', '--summary-only'])

class UsageError extends Error {}

/** notifyAdmin을 이미 보낸 오류. main()의 최상위 catch가 중복 발송하지 않게 표시한다 */
class ReportedError extends Error {}

interface ParsedArgs {
  command?: string
  sub?: string
  values: Map<string, string>
}

function parseArgs(argv: string[]): ParsedArgs {
  const tokens = argv.filter((token) => token !== '--')
  const command = tokens.shift()
  const sub = (command === 'alerts' || command === 'orgs' || command === 'stats') && tokens[0] && !tokens[0].startsWith('--') ? tokens.shift() : undefined
  const values = new Map<string, string>()
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token.startsWith('--')) throw new UsageError('알 수 없는 인자입니다.')
    const equal = token.indexOf('=')
    const flag = equal < 0 ? token : token.slice(0, equal)
    if (!FLAG_NAMES.has(flag)) throw new UsageError(`알 수 없는 플래그: ${flag}`)
    if (BOOLEAN_FLAGS.has(flag) && equal < 0) {
      values.set(flag, '1')
      continue
    }
    const value = equal < 0 ? tokens[++i] : token.slice(equal + 1)
    if (!value || value.startsWith('--')) throw new UsageError(`${flag} 값이 필요합니다.`)
    values.set(flag, value)
  }
  return { command, sub, values }
}

function required(values: Map<string, string>, flag: string): string {
  const value = values.get(flag)
  if (!value) throw new UsageError(`${flag} 값이 필요합니다.`)
  return value
}

function kindValue(value: string): JobKind {
  if (!JOB_KINDS.includes(value as JobKind)) throw new UsageError(`잘못된 kind입니다: ${value}`)
  return value as JobKind
}

function dateValue(value: string, flag: string): string {
  if (!isYmd(value)) throw new UsageError(`${flag} 날짜는 YYYY-MM-DD 형식이어야 합니다.`)
  return value
}

function monthValue(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new UsageError('--month는 YYYY-MM 형식이어야 합니다.')
  return value
}

function divsValue(value?: string): PrespecBizDiv[] | undefined {
  if (!value) return undefined
  const divs = value.split(',').map((item) => item.trim())
  if (!divs.length || divs.some((div) => !ALL_BIZ_DIVS.includes(div as PrespecBizDiv))) throw new UsageError(`잘못된 --biz-div 값입니다: ${value}`)
  return [...new Set(divs)] as PrespecBizDiv[]
}

function numberValue(value: string, flag: string): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new UsageError(`${flag} 값은 양수여야 합니다.`)
  return number
}

function blankFlags(values: Map<string, string>, allowed: string[]): void {
  if ([...values.keys()].some((flag) => !allowed.includes(flag))) throw new UsageError('이 명령에서 사용할 수 없는 플래그입니다.')
}

const emptyResult = (): RunOnceResult => ({ claimed: 0, completed: 0, deferred: 0, failed: 0, rows: 0, requests: 0, elapsedMs: 0 })
const addResult = (a: RunOnceResult, b: RunOnceResult): RunOnceResult => ({ claimed: a.claimed + b.claimed, completed: a.completed + b.completed, deferred: a.deferred + b.deferred, failed: a.failed + b.failed, rows: a.rows + b.rows, requests: a.requests + b.requests, elapsedMs: a.elapsedMs + b.elapsedMs })

/** backfill 루프가 볼 진행 중 잡 수. pending과 running을 나눠 센다 */
async function jobCounts(db: ReturnType<typeof createDb>['db'], kind: JobKind, from: string, to: string): Promise<{ pending: number; running: number; total: number }> {
  const rows = await db.select({ status: ingestJobs.status }).from(ingestJobs)
    .where(and(eq(ingestJobs.kind, kind), gte(ingestJobs.chunkStart, from), lte(ingestJobs.chunkStart, to)))
  const pending = rows.filter((row) => row.status === 'pending').length
  const running = rows.filter((row) => row.status === 'running').length
  return { pending, running, total: pending + running }
}

async function exhaustedCount(db: ReturnType<typeof createDb>['db'], kind: JobKind, from: string, to: string): Promise<number> {
  const rows = await db.select({ id: ingestJobs.id }).from(ingestJobs).where(and(
    eq(ingestJobs.kind, kind), gte(ingestJobs.chunkStart, from), lte(ingestJobs.chunkStart, to),
    eq(ingestJobs.status, 'failed'), gte(ingestJobs.attempts, MAX_ATTEMPTS),
  ))
  return rows.length
}

async function command(argv: string[], env: WorkerEnv): Promise<void> {
  const { command: name, sub, values } = parseArgs(argv)
  if (!name) throw new UsageError(USAGE)
  if (name === 'migrate') {
    blankFlags(values, ['--to'])
    await runMigrations(requireDatabaseUrl(env), values.has('--to') ? { to: values.get('--to')! } : undefined); console.log('migrated'); return
  }
  if (name === 'orgs') {
    if (sub !== 'backfill') throw new UsageError('orgs 명령은 backfill 만 지원합니다.')
    blankFlags(values, [])
    const handle = createDb(requireDatabaseUrl(env))
    try {
      const result = await backfillOrgs(handle.db)
      console.log(JSON.stringify(result))
    } finally { await handle.close() }
    return
  }
  if (name === 'run-once') {
    blankFlags(values, ['--budget-ms', '--max-jobs'])
    const budgetMs = values.has('--budget-ms') ? numberValue(values.get('--budget-ms')!, '--budget-ms') : env.budgetMs
    const maxJobs = values.has('--max-jobs') ? numberValue(values.get('--max-jobs')!, '--max-jobs') : undefined
    const handle = createDb(requireDatabaseUrl(env))
    try {
      const result = await runOnce({ db: handle.db, budgetMs, maxJobs })
      console.log(JSON.stringify(result))
    } finally { await handle.close() }
    return
  }
  if (name === 'alerts') {
    if (sub !== 'run') throw new UsageError('alerts 명령은 run 만 지원합니다.')
    blankFlags(values, ['--since', '--dry-run'])
    const sinceRaw = values.get('--since')
    const since = sinceRaw ? new Date(sinceRaw) : undefined
    if (since && Number.isNaN(since.getTime())) throw new UsageError('--since는 ISO 8601 형식이어야 합니다.')
    const handle = createDb(requireDatabaseUrl(env))
    try {
      const result = await runAlerts({ db: handle.db, since, dryRun: values.has('--dry-run') })
      console.log(JSON.stringify(result))
    } finally { await handle.close() }
    return
  }
  if (name === 'plan') {
    blankFlags(values, ['--kind', '--from', '--to', '--biz-div'])
    const from = dateValue(required(values, '--from'), '--from'); const to = dateValue(required(values, '--to'), '--to')
    if (from > to) throw new Error('--from은 --to보다 늦을 수 없습니다.')
    const kinds = values.has('--kind') ? [kindValue(values.get('--kind')!)] : [...JOB_KINDS]
    const divs = divsValue(values.get('--biz-div')); const handle = createDb(requireDatabaseUrl(env))
    try {
      const planned: Record<string, { created: number; existing: number }> = {}
      for (const kind of kinds) planned[kind] = await planJobs(handle.db, { kind, from, to, bizDivs: divs })
      console.log(JSON.stringify(planned))
    } finally { await handle.close() }
    return
  }
  if (name === 'prune') {
    blankFlags(values, ['--today', '--dry-run'])
    const todayValue = values.has('--today') ? dateValue(values.get('--today')!, '--today') : undefined
    const handle = createDb(requireDatabaseUrl(env))
    try {
      const result = await prune({ db: handle.db, today: todayValue, dryRun: values.has('--dry-run') })
      console.log(JSON.stringify(result))
    } finally { await handle.close() }
    return
  }
  if (name === 'stats') {
    if (sub !== 'rebuild') throw new UsageError('stats 명령은 rebuild 만 지원합니다.')
    blankFlags(values, ['--month', '--window-months'])
    const month = values.has('--month') ? monthValue(values.get('--month')!) : undefined
    const windowMonths = values.has('--window-months') ? numberValue(values.get('--window-months')!, '--window-months') : undefined
    const handle = createDb(requireDatabaseUrl(env))
    try {
      const targetMonth = month ?? await latestAwardMonth(handle.db)
      if (!targetMonth) { console.log(JSON.stringify({ skipped: 'no-awards' })); return }
      console.log(JSON.stringify(await rebuildAwardStats({ db: handle.db, month: targetMonth, windowMonths })))
    } finally { await handle.close() }
    return
  }
  if (name === 'backfill') {
    blankFlags(values, ['--kind', '--from', '--to', '--biz-div', '--budget-ms', '--summary-only'])
    const kind = kindValue(required(values, '--kind')); const from = dateValue(required(values, '--from'), '--from'); const to = dateValue(required(values, '--to'), '--to')
    if (from > to) throw new Error('--from은 --to보다 늦을 수 없습니다.')
    if (values.has('--summary-only') && kind !== 'award') throw new UsageError('--summary-only는 --kind award에서만 쓸 수 있습니다.')
    const divs = divsValue(values.get('--biz-div')); const budgetMs = values.has('--budget-ms') ? numberValue(values.get('--budget-ms')!, '--budget-ms') : env.budgetMs
    const handle = createDb(requireDatabaseUrl(env))
    try {
      const planned = await planJobs(handle.db, { kind, from, to, bizDivs: divs }); let aggregate = emptyResult(); let runs = 0; let stalled = false; let noProgressRuns = 0
      while (true) {
        const one = await runOnce({ db: handle.db, budgetMs, filter: { kind, from, to }, summaryOnly: values.has('--summary-only') }); aggregate = addResult(aggregate, one); runs++
        noProgressRuns = values.has('--summary-only') && one.completed === 0 ? noProgressRuns + 1 : 0
        const counts = await jobCounts(handle.db, kind, from, to)
        if (counts.total === 0) break
        if (one.claimed === 0 || (values.has('--summary-only') && noProgressRuns >= 2)) { stalled = true; break }
      }
      const counts = await jobCounts(handle.db, kind, from, to)
      const exhausted = await exhaustedCount(handle.db, kind, from, to)
      console.log(JSON.stringify({ planned: { [kind]: planned }, runs, result: aggregate, pending: counts.total, running: counts.running, exhausted }))
      if (stalled || exhausted > 0 || aggregate.failed > 0) {
        await notifyAdmin('[나라장터] 백필 미완료', [
          `명령: worker backfill --kind ${kind} --from ${from} --to ${to}`,
          `pending=${counts.pending}, running=${counts.running}, failed=${aggregate.failed}, attempts 소진=${exhausted}`,
          `완료 ${aggregate.completed}건 · 행 ${aggregate.rows} · 요청 ${aggregate.requests} · 실행 ${runs}회`,
        ].join('\n'))
        throw new ReportedError(`backfill 미완료: pending=${counts.pending}, running=${counts.running}, failed=${aggregate.failed}, attempts 소진=${exhausted}`)
      }
    } finally { await handle.close() }
    return
  }
  throw new UsageError(USAGE)
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const env = loadEnv()
  try { await command(argv, env); return 0 } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(error instanceof UsageError ? `${message}\n${USAGE}` : message)
    if (!(error instanceof UsageError) && !(error instanceof ReportedError)) {
      await notifyAdmin('[나라장터] 워커 명령 실패', `명령: worker ${argv.join(' ')}\n오류: ${message.slice(0, 500)}`)
    }
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then((code) => { process.exitCode = code })
