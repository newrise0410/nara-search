import type { ChannelBody, ChannelsResponse, RuleBody, RulesResponse } from './alerts-types'

export const channelsKey = ['alert-channels'] as const
export const rulesKey = ['alert-rules'] as const

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

export function fetchChannels(signal?: AbortSignal): Promise<ChannelsResponse> {
  return fetchJson<ChannelsResponse>('/api/me/channels', { signal })
}

export function createChannel(body: ChannelBody): Promise<{ id: string }> {
  return fetchJson<{ id: string }>('/api/me/channels', jsonInit('POST', body))
}

export function updateChannel(id: string, body: Partial<ChannelBody>): Promise<void> {
  return fetchJson<{ ok: boolean }>(`/api/me/channels/${encodeURIComponent(id)}`, jsonInit('PUT', body)).then(() => undefined)
}

export function deleteChannel(id: string): Promise<void> {
  return fetchJson<{ ok: boolean }>(`/api/me/channels/${encodeURIComponent(id)}`, jsonInit('DELETE', undefined)).then(() => undefined)
}

export function testChannel(id: string): Promise<void> {
  return fetchJson<{ ok: boolean }>(`/api/me/channels/${encodeURIComponent(id)}/test`, jsonInit('POST', {})).then(() => undefined)
}

export function fetchRules(signal?: AbortSignal): Promise<RulesResponse> {
  return fetchJson<RulesResponse>('/api/me/rules', { signal })
}

export function createRule(body: RuleBody): Promise<{ id: string }> {
  return fetchJson<{ id: string }>('/api/me/rules', jsonInit('POST', body))
}

export function updateRule(id: string, body: RuleBody): Promise<void> {
  return fetchJson<{ ok: boolean }>(`/api/me/rules/${encodeURIComponent(id)}`, jsonInit('PUT', body)).then(() => undefined)
}

export function deleteRule(id: string): Promise<void> {
  return fetchJson<{ ok: boolean }>(`/api/me/rules/${encodeURIComponent(id)}`, jsonInit('DELETE', undefined)).then(() => undefined)
}
