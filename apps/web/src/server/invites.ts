import { createHash, randomBytes } from 'node:crypto'
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { appUsers, findMembershipIn, listUserOrgs, memberships, orgInvites, orgs, userSettings } from '@nara/db'
import type { NaraDb, OrgContext } from '@nara/db'
import { sendToChannel, loadNotifyEnv } from 'worker'
import type { AlertMessage, NotifyChannel } from 'worker'
import { INVITE_PENDING_MAX, INVITE_TTL_DAYS, ORG_ROLES } from '@/lib/org-types'
import type { AcceptInviteResult, CreateInviteResult, OrgInviteView, OrgMemberView, OrgMembersResponse, OrgRole, OrgSummary, OrgsResponse } from '@/lib/org-types'
import { isUuid, LIMITS } from '@/lib/user-state'
import { channelAvailability, LIMITS_ALERTS } from '@/server/alerts'
import { ForbiddenError, InvalidBodyError, NotFoundError } from '@/server/user-data'
import { uid } from '@/lib/id'

const INVALID_BODY = '요청 본문 형식이 올바르지 않습니다.'
const ORG_NOT_FOUND = '워크스페이스를 찾을 수 없습니다.'
const MEMBER_NOT_FOUND = '멤버를 찾을 수 없습니다.'
const INVITE_NOT_FOUND = '초대를 찾을 수 없습니다.'

type RecordValue = Record<string, unknown>

const asRecord = (value: unknown): RecordValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
const has = (value: RecordValue, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)

/** 초대 토큰 원문(32바이트 base64url). 저장하지 않고 링크에만 쓴다 */
export function createInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

/** 토큰 원문을 DB에 저장할 sha256 hex로 바꾼다 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function parseOrgNameBody(value: unknown): string {
  const body = asRecord(value)
  if (!body || !has(body, 'name') || typeof body.name !== 'string') throw new InvalidBodyError(INVALID_BODY)
  const name = body.name.trim()
  if (!name) throw new InvalidBodyError('워크스페이스 이름을 입력해 주세요.')
  if (name.length > LIMITS.text) throw new InvalidBodyError(INVALID_BODY)
  return name
}

export function parseInviteBody(value: unknown): { email: string; role: OrgRole } {
  const body = asRecord(value)
  if (!body || !has(body, 'email')) throw new InvalidBodyError(INVALID_BODY)
  if (typeof body.email !== 'string') throw new InvalidBodyError(INVALID_BODY)
  const email = body.email.trim().toLowerCase()
  if (email.length > LIMITS_ALERTS.email) throw new InvalidBodyError(INVALID_BODY)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvalidBodyError('이메일 주소가 올바르지 않습니다.')
  const role = body.role === undefined ? 'member' : body.role
  if (typeof role !== 'string' || !ORG_ROLES.includes(role as OrgRole)) throw new InvalidBodyError('역할이 올바르지 않습니다.')
  return { email, role: role as OrgRole }
}

export function parseRoleBody(value: unknown): OrgRole {
  const body = asRecord(value)
  if (!body || !has(body, 'role')) throw new InvalidBodyError(INVALID_BODY)
  if (typeof body.role !== 'string' || !ORG_ROLES.includes(body.role as OrgRole)) throw new InvalidBodyError('역할이 올바르지 않습니다.')
  return body.role as OrgRole
}

export function parseSwitchBody(value: unknown): string {
  const body = asRecord(value)
  if (!body || !has(body, 'orgId')) throw new InvalidBodyError(INVALID_BODY)
  const orgId = body['orgId']
  if (!isUuid(orgId)) throw new InvalidBodyError(INVALID_BODY)
  return orgId
}

export function parseAcceptBody(value: unknown): string {
  const body = asRecord(value)
  if (!body || !has(body, 'token')) throw new InvalidBodyError(INVALID_BODY)
  if (typeof body.token !== 'string') throw new InvalidBodyError('초대 링크가 올바르지 않습니다.')
  const token = body.token.trim()
  if (!token || token.length > 200) throw new InvalidBodyError('초대 링크가 올바르지 않습니다.')
  return token
}

export async function loadOrg(db: NaraDb, ctx: OrgContext): Promise<OrgSummary> {
  const rows = await db.select({ id: orgs.id, name: orgs.name, plan: orgs.plan }).from(orgs).where(eq(orgs.id, ctx.orgId)).limit(1)
  const row = rows[0]
  if (!row) throw new NotFoundError(ORG_NOT_FOUND)
  return { ...row, role: ctx.role }
}

export async function renameOrg(db: NaraDb, ctx: OrgContext, name: string): Promise<void> {
  if (ctx.role !== 'owner') throw new ForbiddenError('워크스페이스 이름은 소유자만 바꿀 수 있습니다.')
  await db.update(orgs).set({ name }).where(eq(orgs.id, ctx.orgId))
}

export async function loadMembers(db: NaraDb, ctx: OrgContext): Promise<OrgMembersResponse> {
  const memberRows = await db.select({ userId: memberships.userId, email: appUsers.email, role: memberships.role, joinedAt: memberships.createdAt })
    .from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(eq(memberships.orgId, ctx.orgId))
    .orderBy(asc(memberships.createdAt), asc(appUsers.email))
  const members: OrgMemberView[] = memberRows.map((row) => ({ userId: row.userId, email: row.email, role: row.role as OrgRole, joinedAt: row.joinedAt.toISOString() }))
  if (ctx.role !== 'owner') return { members, invites: [] }

  const now = new Date()
  const inviteRows = await db.select({ id: orgInvites.id, email: orgInvites.email, role: orgInvites.role, expiresAt: orgInvites.expiresAt, createdAt: orgInvites.createdAt })
    .from(orgInvites)
    .where(and(eq(orgInvites.orgId, ctx.orgId), isNull(orgInvites.acceptedAt)))
    .orderBy(desc(orgInvites.createdAt))
  const invites: OrgInviteView[] = inviteRows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role as OrgRole,
    expiresAt: row.expiresAt.toISOString(),
    expired: row.expiresAt <= now,
    createdAt: row.createdAt.toISOString(),
  }))
  return { members, invites }
}

export async function changeMemberRole(db: NaraDb, ctx: OrgContext, userId: string, role: OrgRole): Promise<void> {
  if (ctx.role !== 'owner') throw new ForbiddenError('역할 변경은 소유자만 할 수 있습니다.')
  const target = await findMembershipIn(db, ctx.orgId, userId)
  if (!target) throw new NotFoundError(MEMBER_NOT_FOUND)
  if (target.role === 'owner' && role === 'member') {
    const owners = await db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.role, 'owner')))
    if (owners.length === 1) throw new InvalidBodyError('마지막 소유자의 역할은 바꿀 수 없습니다. 다른 멤버를 소유자로 지정한 뒤 다시 시도하세요.')
  }
  await db.update(memberships).set({ role }).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, userId)))
}

export async function removeMember(db: NaraDb, ctx: OrgContext, userId: string): Promise<void> {
  const target = await findMembershipIn(db, ctx.orgId, userId)
  if (!target) throw new NotFoundError(MEMBER_NOT_FOUND)
  if (ctx.role !== 'owner' && userId !== ctx.userId) throw new ForbiddenError('다른 멤버 제거는 소유자만 할 수 있습니다.')
  if (target.role === 'owner') {
    const owners = await db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.role, 'owner')))
    if (owners.length === 1) throw new InvalidBodyError('마지막 소유자는 제거할 수 없습니다. 다른 멤버에게 소유자를 넘긴 뒤 다시 시도하세요.')
  }
  await db.transaction(async (tx) => {
    await tx.delete(memberships).where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, userId)))
    await tx.update(userSettings).set({ activeOrgId: null }).where(and(eq(userSettings.userId, userId), eq(userSettings.activeOrgId, ctx.orgId)))
  })
}

const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const inviteMessage = (orgName: string, inviterEmail: string, inviteUrl: string, expiresAt: Date): AlertMessage => {
  const summary = `${inviterEmail} 님이 ${orgName} 워크스페이스로 초대했습니다.`
  const expiresYmd = expiresAt.toISOString().slice(0, 10)
  const text = `${summary}\n\n아래 링크에서 구글 로그인 후 수락하세요.\n${inviteUrl}\n이 링크는 ${expiresYmd}까지 유효합니다.`
  const html = `<p>${esc(summary)}</p><p>아래 링크에서 구글 로그인 후 수락하세요.</p><p><a href="${esc(inviteUrl)}">${esc(inviteUrl)}</a></p><p>이 링크는 ${esc(expiresYmd)}까지 유효합니다.</p>`
  return {
    title: `[NARA SEARCH] ${orgName} 워크스페이스 초대`,
    summary,
    text,
    html,
    url: inviteUrl,
    total: 0,
    items: [],
  }
}

export async function createInvite(db: NaraDb, ctx: OrgContext, body: { email: string; role: OrgRole }, origin: string): Promise<CreateInviteResult> {
  if (ctx.role !== 'owner') throw new ForbiddenError('멤버 초대는 소유자만 할 수 있습니다.')
  const memberRows = await db.select({ userId: memberships.userId }).from(memberships)
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(and(eq(memberships.orgId, ctx.orgId), sql`lower(${appUsers.email}) = ${body.email}`))
    .limit(1)
  if (memberRows.length > 0) throw new InvalidBodyError('이미 워크스페이스 멤버인 이메일입니다.')

  const now = new Date()
  const pendingRows = await db.select({ id: orgInvites.id }).from(orgInvites).where(and(
    eq(orgInvites.orgId, ctx.orgId), eq(orgInvites.email, body.email), isNull(orgInvites.acceptedAt), gt(orgInvites.expiresAt, now),
  )).limit(1)
  if (pendingRows.length === 0) {
    const countRows = await db.select({ id: orgInvites.id }).from(orgInvites).where(and(
      eq(orgInvites.orgId, ctx.orgId), isNull(orgInvites.acceptedAt), gt(orgInvites.expiresAt, now),
    ))
    if (countRows.length >= INVITE_PENDING_MAX) throw new InvalidBodyError('대기 중인 초대는 최대 20개까지 만들 수 있습니다.')
  }

  const token = createInviteToken()
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  const inviteId = uid()
  const inserted = await db.insert(orgInvites).values({
    id: inviteId, orgId: ctx.orgId, email: body.email, role: body.role, tokenHash: hashInviteToken(token), invitedBy: ctx.userId, expiresAt,
  }).onConflictDoUpdate({
    target: [orgInvites.orgId, orgInvites.email],
    set: { role: body.role, tokenHash: hashInviteToken(token), invitedBy: ctx.userId, expiresAt, acceptedAt: null, createdAt: new Date() },
  }).returning({ id: orgInvites.id })
  const id = inserted[0]?.id ?? inviteId
  const inviteUrl = `${origin}/invite/${token}`
  let emailSent = false
  if (channelAvailability().email) {
    try {
      const [inviterRows, orgRows] = await Promise.all([
        db.select({ email: appUsers.email }).from(appUsers).where(eq(appUsers.id, ctx.userId)).limit(1),
        db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, ctx.orgId)).limit(1),
      ])
      const orgName = orgRows[0]?.name
      if (!orgName) throw new NotFoundError(ORG_NOT_FOUND)
      const channel: NotifyChannel = { id, userId: ctx.userId, type: 'email', label: '워크스페이스 초대', config: { address: body.email }, enabled: true }
      const result = await sendToChannel(channel, inviteMessage(orgName, inviterRows[0]?.email ?? '', inviteUrl, expiresAt), loadNotifyEnv())
      emailSent = result.ok
    } catch (error) {
      console.error(error)
    }
  }
  return { id, email: body.email, role: body.role, expiresAt: expiresAt.toISOString(), inviteUrl, emailSent }
}

export async function cancelInvite(db: NaraDb, ctx: OrgContext, id: string): Promise<void> {
  if (ctx.role !== 'owner') throw new ForbiddenError('초대 취소는 소유자만 할 수 있습니다.')
  if (!isUuid(id)) throw new InvalidBodyError('id가 올바르지 않습니다.')
  const result = await db.delete(orgInvites).where(and(eq(orgInvites.id, id), eq(orgInvites.orgId, ctx.orgId))).returning({ id: orgInvites.id })
  if (result.length === 0) throw new NotFoundError(INVITE_NOT_FOUND)
}

export async function acceptInvite(db: NaraDb, ctx: OrgContext, token: string): Promise<AcceptInviteResult> {
  const rows = await db.select({ id: orgInvites.id, orgId: orgInvites.orgId, role: orgInvites.role, acceptedAt: orgInvites.acceptedAt, expiresAt: orgInvites.expiresAt })
    .from(orgInvites).where(eq(orgInvites.tokenHash, hashInviteToken(token))).limit(1)
  const invite = rows[0]
  if (!invite) throw new NotFoundError(INVITE_NOT_FOUND)
  const existing = await findMembershipIn(db, invite.orgId, ctx.userId)
  if (existing) {
    await db.transaction(async (tx) => {
      await tx.insert(memberships).values({ orgId: invite.orgId, userId: ctx.userId, role: invite.role as OrgRole }).onConflictDoNothing()
      await tx.update(orgInvites).set({ acceptedAt: new Date() }).where(eq(orgInvites.id, invite.id))
      await tx.insert(userSettings).values({ userId: ctx.userId, orgId: invite.orgId, activeOrgId: invite.orgId })
        .onConflictDoUpdate({ target: userSettings.userId, set: { activeOrgId: invite.orgId } })
    })
  } else {
    if (invite.acceptedAt !== null) throw new InvalidBodyError('이미 사용된 초대 링크입니다.')
    if (invite.expiresAt <= new Date()) throw new InvalidBodyError('초대 링크가 만료되었습니다.')
    await db.transaction(async (tx) => {
      await tx.insert(memberships).values({ orgId: invite.orgId, userId: ctx.userId, role: invite.role as OrgRole }).onConflictDoNothing()
      await tx.update(orgInvites).set({ acceptedAt: new Date() }).where(eq(orgInvites.id, invite.id))
      await tx.insert(userSettings).values({ userId: ctx.userId, orgId: invite.orgId, activeOrgId: invite.orgId })
        .onConflictDoUpdate({ target: userSettings.userId, set: { activeOrgId: invite.orgId } })
    })
  }
  const orgRows = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, invite.orgId)).limit(1)
  const orgName = orgRows[0]?.name
  if (!orgName) throw new NotFoundError(ORG_NOT_FOUND)
  return { orgId: invite.orgId, orgName }
}

export async function loadOrgs(db: NaraDb, ctx: OrgContext): Promise<OrgsResponse> {
  const rows = await listUserOrgs(db, ctx.userId)
  return { orgs: rows.map((row) => ({ id: row.orgId, name: row.name, plan: row.plan, role: row.role, active: row.orgId === ctx.orgId })) }
}

export async function switchOrg(db: NaraDb, ctx: OrgContext, orgId: string): Promise<void> {
  const membership = await findMembershipIn(db, orgId, ctx.userId)
  if (!membership) throw new NotFoundError(ORG_NOT_FOUND)
  await db.insert(userSettings).values({ userId: ctx.userId, orgId, activeOrgId: orgId })
    .onConflictDoUpdate({ target: userSettings.userId, set: { activeOrgId: orgId } })
}
