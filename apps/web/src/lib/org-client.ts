import type {
  AcceptInviteResult,
  CreateInviteBody,
  CreateInviteResult,
  OrgMembersResponse,
  OrgRole,
  OrgSummary,
  OrgsResponse,
} from './org-types'

export const orgKey = ['org'] as const
export const orgsKey = ['orgs'] as const
export const membersKey = ['org-members'] as const

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  let body: unknown
  try { body = await response.json() } catch { body = undefined }
  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : `HTTP ${response.status}`
    throw new Error(error)
  }
  return body as T
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export function fetchOrg(signal?: AbortSignal): Promise<OrgSummary> {
  return fetchJson<OrgSummary>('/api/me/org', { signal })
}

export function fetchOrgs(signal?: AbortSignal): Promise<OrgsResponse> {
  return fetchJson<OrgsResponse>('/api/me/orgs', { signal })
}

export function fetchMembers(signal?: AbortSignal): Promise<OrgMembersResponse> {
  return fetchJson<OrgMembersResponse>('/api/me/org/members', { signal })
}

export function renameOrg(name: string): Promise<void> {
  return fetchJson<{ ok: boolean }>('/api/me/org', jsonInit('POST', { name })).then(() => undefined)
}

export function switchOrg(orgId: string): Promise<void> {
  return fetchJson<{ ok: boolean }>('/api/me/orgs/switch', jsonInit('POST', { orgId })).then(() => undefined)
}

export function createInvite(body: CreateInviteBody): Promise<CreateInviteResult> {
  return fetchJson<CreateInviteResult>('/api/me/org/invites', jsonInit('POST', body))
}

export function cancelInvite(id: string): Promise<void> {
  return fetchJson<{ ok: boolean }>(`/api/me/org/invites/${encodeURIComponent(id)}`, jsonInit('DELETE', undefined)).then(() => undefined)
}

export function changeMemberRole(userId: string, role: OrgRole): Promise<void> {
  return fetchJson<{ ok: boolean }>(`/api/me/org/members/${encodeURIComponent(userId)}`, jsonInit('PUT', { role })).then(() => undefined)
}

export function removeMember(userId: string): Promise<void> {
  return fetchJson<{ ok: boolean }>(`/api/me/org/members/${encodeURIComponent(userId)}`, jsonInit('DELETE', undefined)).then(() => undefined)
}

export function acceptInvite(token: string): Promise<AcceptInviteResult> {
  return fetchJson<AcceptInviteResult>('/api/invites/accept', jsonInit('POST', { token }))
}
