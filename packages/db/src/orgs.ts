import { asc, and, desc, eq, sql } from 'drizzle-orm'
import { memberships, orgs, userSettings } from './schema'
import type { NaraDb } from './client'

export type OrgRole = 'owner' | 'member'

/** 요청 한 건의 조직 컨텍스트. orgId·role은 서버가 memberships에서만 만든다 */
export interface OrgContext { userId: string; orgId: string; role: OrgRole }

/** 개인 org의 id를 사용자 id와 같게 해 동시 요청과 백필 재실행에도 하나만 생기게 한다 */
export function personalOrgId(userId: string): string {
  return userId
}

/** 이메일 로컬파트를 개인 org 이름으로 사용하고, 비어 있으면 기본 이름을 쓴다 */
export function orgNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? ''
  return (localPart || '내 워크스페이스').slice(0, 100)
}

/** 사용자의 현재 org. 활성 org가 멤버십에 있으면 우선하고, 없으면 가장 먼저 만든 org로 폴백한다 */
export async function findMembership(db: NaraDb, userId: string): Promise<{ orgId: string; role: OrgRole } | null> {
  const rows = await db.select({ orgId: memberships.orgId, role: memberships.role })
    .from(memberships)
    .leftJoin(userSettings, eq(userSettings.userId, memberships.userId))
    .where(eq(memberships.userId, userId))
    .orderBy(desc(sql`(to_jsonb(${userSettings}) ->> 'active_org_id' = ${memberships.orgId}::text)`), asc(memberships.createdAt), asc(memberships.orgId))
    .limit(1)
  const row = rows[0]
  return row ? { orgId: row.orgId, role: row.role as OrgRole } : null
}

/** 특정 org의 멤버십 1건을 권한 검사에 사용한다 */
export async function findMembershipIn(db: NaraDb, orgId: string, userId: string): Promise<{ role: OrgRole } | null> {
  const rows = await db.select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1)
  const row = rows[0]
  return row ? { role: row.role as OrgRole } : null
}

export interface UserOrg { orgId: string; name: string; plan: string; role: OrgRole; joinedAt: Date }

/** 사용자가 속한 org 전부를 가입 순으로 반환한다 */
export async function listUserOrgs(db: NaraDb, userId: string): Promise<UserOrg[]> {
  const rows = await db.select({
    orgId: memberships.orgId,
    name: orgs.name,
    plan: orgs.plan,
    role: memberships.role,
    joinedAt: memberships.createdAt,
  })
    .from(memberships)
    .innerJoin(orgs, eq(orgs.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt), asc(orgs.id))
  return rows.map((row) => ({ ...row, role: row.role as OrgRole }))
}

/** 개인 org와 owner 멤버십을 멱등하게 보장하고 이번 호출의 생성 여부를 반환한다 */
export async function ensurePersonalOrg(
  db: NaraDb,
  user: { id: string; email: string },
): Promise<{ orgId: string; role: OrgRole; created: boolean }> {
  const orgId = personalOrgId(user.id)
  const inserted = await db.insert(orgs).values({ id: orgId, name: orgNameFromEmail(user.email) })
    .onConflictDoNothing().returning({ id: orgs.id })
  await db.insert(memberships).values({ orgId, userId: user.id, role: 'owner' }).onConflictDoNothing()
  return { orgId, role: 'owner', created: inserted.length > 0 }
}
