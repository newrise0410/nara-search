import { asc, and, eq, isNull } from 'drizzle-orm'
import {
  alertChannels,
  alertRules,
  appUsers,
  ensurePersonalOrg,
  findMembership,
  userCompetitors,
  userKeywords,
  userPresets,
  userProfiles,
  userRecentSearches,
  userSettings,
} from '@nara/db'
import type { NaraDb } from '@nara/db'

export const ORG_SCOPED_TABLES = [
  'user_profiles', 'user_settings', 'user_keywords', 'user_competitors',
  'user_presets', 'user_recent_searches', 'alert_channels', 'alert_rules',
] as const
export type OrgScopedTable = (typeof ORG_SCOPED_TABLES)[number]

export interface BackfillOrgsResult {
  /** 훑은 app_users 수 */
  users: number
  /** 이번 실행에서 새로 만든 org 수 */
  orgsCreated: number
  /** 이번 실행에서 새로 만든 멤버십 수 */
  membershipsCreated: number
  /** 테이블별로 org_id를 채운 행 수 (전부 0이면 이미 완료된 상태) */
  rows: Record<OrgScopedTable, number>
  elapsedMs: number
}

type OrgScopedSchema = typeof userProfiles | typeof userSettings | typeof userKeywords | typeof userCompetitors
  | typeof userPresets | typeof userRecentSearches | typeof alertChannels | typeof alertRules

const tables: readonly [OrgScopedTable, OrgScopedSchema][] = [
  ['user_profiles', userProfiles],
  ['user_settings', userSettings],
  ['user_keywords', userKeywords],
  ['user_competitors', userCompetitors],
  ['user_presets', userPresets],
  ['user_recent_searches', userRecentSearches],
  ['alert_channels', alertChannels],
  ['alert_rules', alertRules],
]

/** org_id가 비어 있는 사용자 데이터를 개인 org로 이관하고, 이미 채워진 행은 건너뛴다 */
export async function backfillOrgs(db: NaraDb): Promise<BackfillOrgsResult> {
  const startedAt = Date.now()
  const rows = Object.fromEntries(ORG_SCOPED_TABLES.map((name) => [name, 0])) as Record<OrgScopedTable, number>
  const users = await db.select({ id: appUsers.id, email: appUsers.email })
    .from(appUsers)
    .orderBy(asc(appUsers.createdAt), asc(appUsers.id))
  let orgsCreated = 0
  let membershipsCreated = 0

  for (const user of users) {
    await db.transaction(async (tx) => {
      const found = await findMembership(tx, user.id)
      const ensured = found ? undefined : await ensurePersonalOrg(tx, user)
      const orgId = found?.orgId ?? ensured!.orgId
      if (!found) {
        if (ensured!.created) orgsCreated++
        membershipsCreated++
      }

      for (const [name, table] of tables) {
        const updated = await tx.update(table)
          .set({ orgId })
          .where(and(eq(table.userId, user.id), isNull(table.orgId)))
          .returning({ orgId: table.orgId })
        rows[name] += updated.length
      }
    })
  }

  return { users: users.length, orgsCreated, membershipsCreated, rows, elapsedMs: Date.now() - startedAt }
}
