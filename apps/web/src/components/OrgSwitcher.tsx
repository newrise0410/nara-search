'use client'

import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { ORG_ROLE_LABELS } from '@/lib/org-types'
import { fetchOrgs, orgsKey, switchOrg } from '@/lib/org-client'
import { useStore } from '@/store'

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

export default function OrgSwitcher(): ReactElement | null {
  const { data, error, isPending } = useQuery({ queryKey: orgsKey, queryFn: ({ signal }) => fetchOrgs(signal), staleTime: 60_000, retry: false })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [actionError, setActionError] = useState<string>()

  if (isPending || error || !data?.orgs.length) return null

  const active = data.orgs.find((org) => org.active) ?? data.orgs[0]
  const selectOrg = async (orgId: string) => {
    setOpen(false)
    setActionError(undefined)
    if (orgId === active.id) return
    setBusy(orgId)
    try {
      await switchOrg(orgId)
      useStore.persist.clearStorage()
      window.location.assign('/dashboard')
    } catch (caught) {
      setActionError(errorText(caught))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="org-switch">
      <button type="button" className="org-switch-btn" aria-expanded={open} onClick={() => { setOpen((current) => !current); setActionError(undefined) }}>
        <span className="org-switch-name">{active.name}</span>
        <span aria-hidden="true">⌃</span>
      </button>
      {open ? <div className="org-menu" role="menu">
        {data.orgs.map((org) => <button type="button" role="menuitem" className={`org-menu-item${org.id === active.id ? ' is-active' : ''}`} key={org.id} disabled={Boolean(busy)} onClick={() => void selectOrg(org.id)}><span className="org-switch-name">{org.name}</span><span className="muted">{ORG_ROLE_LABELS[org.role]}</span></button>)}
      </div> : null}
      {actionError ? <div className="err">오류: {actionError}</div> : null}
    </div>
  )
}
