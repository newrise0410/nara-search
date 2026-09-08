import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { configureNara } from '@nara/api'

export interface WorkerEnv {
  databaseUrl: string
  naraApiKey: string
  naraBaseUrl: string
  budgetMs: number
}

/** apps/worker/.env 가 있으면 process.loadEnvFile()로 읽고(node 24 내장), configureNara()까지 수행 */
export function loadEnv(): WorkerEnv {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url))
  if (existsSync(envPath)) process.loadEnvFile(envPath)
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? ''
  const naraApiKey = process.env.NARA_API_KEY?.trim() || process.env.VITE_NARA_API_KEY?.trim() || ''
  const naraBaseUrl = process.env.NARA_BASE_URL?.trim() || 'https://apis.data.go.kr/1230000'
  const parsedBudget = Number(process.env.WORKER_BUDGET_MS)
  const budgetMs = Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : 600_000
  configureNara({ serviceKey: naraApiKey, baseUrl: naraBaseUrl })
  return { databaseUrl, naraApiKey, naraBaseUrl, budgetMs }
}

/** databaseUrl이 비어 있으면 사람이 읽을 수 있는 메시지로 throw */
export function requireDatabaseUrl(env: WorkerEnv): string {
  if (!env.databaseUrl) throw new Error('DATABASE_URL이 설정되지 않았습니다. apps/worker/.env 또는 환경변수에 DATABASE_URL을 지정하세요.')
  return env.databaseUrl
}
