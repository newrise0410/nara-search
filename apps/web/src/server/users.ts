import { appUsers } from '@nara/db'
import type { NaraDb } from '@nara/db'
import type { AuthUser } from '@/server/auth'

/** 로그인할 때마다 이메일과 마지막 로그인 시각만 갱신한다 */
export async function upsertAppUser(db: NaraDb, user: AuthUser, signedInAt?: Date): Promise<void> {
  const at = signedInAt ?? new Date()
  await db.insert(appUsers)
    .values({ id: user.id, email: user.email, lastSignInAt: at })
    .onConflictDoUpdate({ target: appUsers.id, set: { email: user.email, lastSignInAt: at } })
}

/** 데이터 저장 전에 FK 대상 사용자를 보장하되 로그인 시각은 보존한다 */
export async function ensureAppUser(db: NaraDb, user: AuthUser): Promise<void> {
  await db.insert(appUsers).values({ id: user.id, email: user.email }).onConflictDoNothing()
}
