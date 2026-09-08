'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { Card, Empty, Notice, Tag } from '@/components/ui'
import { ORG_ROLE_LABELS } from '@/lib/org-types'
import type { CreateInviteResult, OrgRole } from '@/lib/org-types'
import { changeMemberRole, cancelInvite, createInvite, fetchMembers, fetchOrg, membersKey, orgKey, orgsKey, removeMember, renameOrg } from '@/lib/org-client'

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

export default function OrgMembersCard(): ReactElement {
  const queryClient = useQueryClient()
  const { data: org, isPending: orgPending, error: orgError } = useQuery({ queryKey: orgKey, queryFn: ({ signal }) => fetchOrg(signal), staleTime: 60_000, retry: false })
  const { data: membersData, isPending: membersPending, error: membersError } = useQuery({ queryKey: membersKey, queryFn: ({ signal }) => fetchMembers(signal), staleTime: 30_000, retry: false })
  const [nameDraft, setNameDraft] = useState<{ orgId: string; value: string }>()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('member')
  const [busy, setBusy] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [inviteResult, setInviteResult] = useState<CreateInviteResult>()

  const isOwner = org?.role === 'owner'
  const name = nameDraft && nameDraft.orgId === org?.id ? nameDraft.value : org?.name ?? ''
  const members = membersData?.members ?? []
  const invites = membersData?.invites ?? []
  const run = async (actionName: string, action: () => Promise<unknown>, success: string): Promise<unknown> => {
    setBusy(actionName)
    setNotice(undefined)
    setActionError(undefined)
    setInviteResult(undefined)
    try {
      const result = await action()
      setNotice(success)
      return result
    } catch (caught) {
      setActionError(errorText(caught))
      return undefined
    } finally {
      setBusy(undefined)
    }
  }

  const invalidate = (key: readonly unknown[]) => queryClient.invalidateQueries({ queryKey: key })
  const saveName = () => {
    const nextName = name.trim()
    if (!nextName) { setActionError('워크스페이스 이름을 입력해 주세요.'); return }
    void run('rename-org', async () => {
      await renameOrg(nextName)
      await Promise.all([invalidate(orgKey), invalidate(orgsKey), invalidate(membersKey)])
    }, '워크스페이스 이름을 저장했습니다.')
  }
  const updateRole = (userId: string, role: OrgRole) => void run(`role-${userId}`, async () => {
    await changeMemberRole(userId, role)
    await invalidate(membersKey)
  }, '멤버 역할을 저장했습니다.')
  const leaveOrRemove = (userId: string) => void run(`remove-${userId}`, async () => {
    await removeMember(userId)
    await invalidate(membersKey)
    await invalidate(orgsKey)
  }, isOwner ? '멤버를 제거했습니다.' : '워크스페이스에서 나왔습니다.')
  const sendInvite = async () => {
    const result = await run('create-invite', async () => {
      const created = await createInvite({ email: inviteEmail, role: inviteRole })
      await invalidate(membersKey)
      setInviteEmail('')
      return created
    }, '초대를 만들었습니다.')
    if (result) setInviteResult(result as CreateInviteResult)
  }
  const cancel = (id: string) => void run(`cancel-${id}`, async () => {
    await cancelInvite(id)
    await invalidate(membersKey)
  }, '초대를 취소했습니다.')

  return (
    <Card>
      <div className="section-title">워크스페이스</div>
      <div className="row">
        <input className="input" value={name} disabled={!isOwner || orgPending} onChange={(event) => setNameDraft({ orgId: org?.id ?? '', value: event.target.value })} aria-label="워크스페이스 이름" />
        <button type="button" className="btn btn-ghost btn-sm" disabled={!isOwner || Boolean(busy)} onClick={saveName}>저장</button>
      </div>
      {!isOwner && org ? <div className="muted">소유자만 바꿀 수 있습니다</div> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {inviteResult ? <Notice><div className="col"><div>{inviteResult.emailSent ? '초대 메일을 발송했습니다.' : '초대 링크를 만들었습니다.'}</div><input className="input" value={inviteResult.inviteUrl} readOnly aria-label="초대 링크" />{!inviteResult.emailSent ? <div>메일 발송이 꺼져 있어 링크를 직접 전달해야 합니다.</div> : null}</div></Notice> : null}
      {orgPending || membersPending ? <div className="faint">멤버 정보를 불러오는 중입니다.</div> : null}
      <div className="section-title">멤버</div>
      {members.length ? <div className="dtable"><div className="dtable-head cols-members"><span>이메일</span><span>역할</span><span>가입일</span><span>액션</span></div>{members.map((member) => <div className="dtable-row cols-members" key={member.userId}><span>{member.email}</span>{isOwner ? <select className="select" value={member.role} disabled={Boolean(busy)} aria-label={`${member.email} 역할`} onChange={(event) => updateRole(member.userId, event.target.value as OrgRole)}><option value="owner">{ORG_ROLE_LABELS.owner}</option><option value="member">{ORG_ROLE_LABELS.member}</option></select> : <span>{ORG_ROLE_LABELS[member.role]}</span>}<span className="muted">{member.joinedAt.slice(0, 10)}</span><span className="alert-row-actions">{isOwner ? <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => leaveOrRemove(member.userId)}>제거</button> : member.role === 'member' ? <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => leaveOrRemove(member.userId)}>나가기</button> : null}</span></div>)}</div> : !membersPending ? <Empty>워크스페이스 멤버가 없습니다.</Empty> : null}
      {isOwner ? <>
        <div className="section-title">멤버 초대</div>
        <div className="alert-form">
          <div className="row"><input className="input" type="email" value={inviteEmail} placeholder="초대할 이메일 주소" onChange={(event) => setInviteEmail(event.target.value)} /><select className="select" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as OrgRole)} aria-label="초대 역할"><option value="member">{ORG_ROLE_LABELS.member}</option><option value="owner">{ORG_ROLE_LABELS.owner}</option></select><button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => void sendInvite()}>초대</button></div>
        </div>
        {invites.length ? <div className="dtable"><div className="dtable-head cols-invites"><span>이메일</span><span>역할</span><span>만료일</span><span>상태</span><span /></div>{invites.map((invite) => <div className="dtable-row cols-invites" key={invite.id}><span>{invite.email}</span><span>{ORG_ROLE_LABELS[invite.role]}</span><span className="muted">{invite.expiresAt.slice(0, 10)}</span><Tag tone={invite.expired ? 'gray' : 'yellow'}>{invite.expired ? '만료' : '대기'}</Tag><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => cancel(invite.id)}>취소</button></div>)}</div> : <Empty>대기 중인 초대가 없습니다.</Empty>}
      </> : null}
      {orgError ? <div className="err">오류: {errorText(orgError)}</div> : null}
      {membersError ? <div className="err">오류: {errorText(membersError)}</div> : null}
      {actionError ? <div className="err">오류: {actionError}</div> : null}
    </Card>
  )
}
