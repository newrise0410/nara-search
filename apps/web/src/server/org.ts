import { ensurePersonalOrg, findMembership } from '@nara/db'
import type { NaraDb, OrgContext } from '@nara/db'
import type { AuthUser } from '@/server/auth'
import { ensureAppUser } from '@/server/users'

/** 로그인 사용자의 조직 컨텍스트를 멤버십에서 찾고 없으면 개인 org를 만든다 */
export async function resolveContext(db: NaraDb, user: AuthUser): Promise<OrgContext> {
  const membership = await findMembership(db, user.id)
  if (membership) return { userId: user.id, orgId: membership.orgId, role: membership.role }
  await ensureAppUser(db, user)
  const personal = await ensurePersonalOrg(db, user)
  return { userId: user.id, orgId: personal.orgId, role: personal.role }
}
