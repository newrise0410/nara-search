export type OrgRole = 'owner' | 'member'
export const ORG_ROLES: readonly OrgRole[] = ['owner', 'member']
export const ORG_ROLE_LABELS: Record<OrgRole, string> = { owner: '소유자', member: '멤버' }
/** 초대 링크 유효 기간 */
export const INVITE_TTL_DAYS = 7
/** org당 동시에 대기할 수 있는 초대 수 */
export const INVITE_PENDING_MAX = 20

export interface OrgSummary { id: string; name: string; plan: string; role: OrgRole }
export interface OrgListItem { id: string; name: string; plan: string; role: OrgRole; active: boolean }
export interface OrgMemberView { userId: string; email: string; role: OrgRole; joinedAt: string }
export interface OrgInviteView { id: string; email: string; role: OrgRole; expiresAt: string; expired: boolean; createdAt: string }
export interface OrgMembersResponse { members: OrgMemberView[]; invites: OrgInviteView[] }
export interface OrgsResponse { orgs: OrgListItem[] }
export interface OrgNameBody { name: string }
export interface CreateInviteBody { email: string; role?: OrgRole }
export interface CreateInviteResult { id: string; email: string; role: OrgRole; expiresAt: string; inviteUrl: string; emailSent: boolean }
export interface AcceptInviteResult { orgId: string; orgName: string }
