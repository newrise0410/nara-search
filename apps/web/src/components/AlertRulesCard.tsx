'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { Card, Empty, Field, Notice, Segmented, Tag, Toggle } from '@/components/ui'
import { Icon } from '@/components/icons'
import { ALERT_KIND_LABELS, ALERT_KINDS, CHANNEL_LABELS } from '@/lib/alerts-types'
import type { AlertRuleView, RuleBody } from '@/lib/alerts-types'
import { channelsKey, fetchChannels, fetchRules, createRule, deleteRule, rulesKey, updateRule } from '@/lib/alerts-client'
import { useStore } from '@/store'

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

const draftOf = (keywords: string[], profileId?: string): RuleBody => ({
  name: '새 알림 규칙', enabled: true, kinds: ['notice'], keywords: [...keywords], profileId: profileId ?? null,
  categoryNames: [], agency: null, amountMin: null, amountMax: null, channelIds: [], digest: 'instant',
})

export default function AlertRulesCard(): ReactElement {
  const queryClient = useQueryClient()
  const keywords = useStore((state) => state.keywords)
  const profiles = useStore((state) => state.profiles)
  const activeProfileId = useStore((state) => state.activeProfileId)
  const { data: rulesData, isPending: rulesPending, error: rulesError } = useQuery({ queryKey: rulesKey, queryFn: ({ signal }) => fetchRules(signal), staleTime: 30_000, retry: false })
  const { data: channelsData, isPending: channelsPending, error: channelsError } = useQuery({ queryKey: channelsKey, queryFn: ({ signal }) => fetchChannels(signal), staleTime: 30_000, retry: false })
  const rules = rulesData?.rules ?? []
  const channels = channelsData?.channels ?? []
  const [draft, setDraft] = useState<RuleBody | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [actionError, setActionError] = useState<string>()

  const patch = (changes: Partial<RuleBody>) => setDraft((current) => current ? { ...current, ...changes } : current)
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: rulesKey }) }
  const openNew = () => { setNotice(undefined); setActionError(undefined); setDraft(draftOf(keywords, activeProfileId)) }
  const openEdit = (rule: AlertRuleView) => {
    setNotice(undefined)
    setActionError(undefined)
    setDraft({ id: rule.id, name: rule.name, enabled: rule.enabled, kinds: [...rule.kinds], keywords: [...rule.keywords], profileId: rule.profileId, categoryNames: [...rule.categoryNames], agency: rule.agency, amountMin: rule.amountMin, amountMax: rule.amountMax, channelIds: [...rule.channelIds], digest: rule.digest })
  }
  const save = async () => {
    if (!draft) return
    if (!draft.name.trim()) { setActionError('규칙 이름을 입력해 주세요.'); return }
    setBusy(true); setActionError(undefined); setNotice(undefined)
    try {
      if (draft.id) await updateRule(draft.id, draft)
      else await createRule(draft)
      await invalidate()
      setDraft(null)
      setNotice('알림 규칙을 저장했습니다.')
    } catch (caught) { setActionError(errorText(caught)) } finally { setBusy(false) }
  }
  const remove = async (id: string) => {
    setBusy(true); setActionError(undefined); setNotice(undefined)
    try { await deleteRule(id); await invalidate(); setNotice('알림 규칙을 삭제했습니다.') } catch (caught) { setActionError(errorText(caught)) } finally { setBusy(false) }
  }
  const selectedProfile = profiles.find((profile) => profile.id === draft?.profileId)
  const categoryOptions = selectedProfile?.categories ?? []
  const keywordOptions = [...new Set([...(keywords), ...(draft?.keywords ?? [])])]

  return (
    <Card pad="sm">
      <div className="keyword-alert"><span className="icon-box icon-yellow"><Icon name="bell" size={18} /></span><div className="col keyword-alert-copy"><strong>이 키워드로 알림 받기</strong><span className="muted">새 공고·낙찰이 수집되면 카카오톡, 이메일, Slack, 웹푸시로 보냅니다. 알림 규칙을 만들면 조건에 맞는 항목만 받아볼 수 있습니다.</span></div><span className="spacer" /><button type="button" className="btn btn-ghost btn-sm" onClick={() => draft ? setDraft(null) : openNew()}>{draft ? '닫기' : '알림 규칙 만들기'}</button></div>
      {notice ? <Notice>{notice}</Notice> : null}
      {draft ? <div className="alert-form">
        <Field label="이름"><input className="input" value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
        <Field label="유형"><div className="alert-chips">{ALERT_KINDS.map((kind) => <button type="button" className={`chip${draft.kinds.includes(kind) ? ' is-active' : ''}`} aria-pressed={draft.kinds.includes(kind)} key={kind} onClick={() => patch({ kinds: draft.kinds.includes(kind) ? draft.kinds.filter((value) => value !== kind) : [...draft.kinds, kind] })}>{ALERT_KIND_LABELS[kind]}</button>)}</div></Field>
        <Field label="키워드"><div className="alert-chips">{keywordOptions.length ? keywordOptions.map((keyword) => <button type="button" className={`chip${draft.keywords.includes(keyword) ? ' is-active' : ''}`} aria-pressed={draft.keywords.includes(keyword)} key={keyword} onClick={() => patch({ keywords: draft.keywords.includes(keyword) ? draft.keywords.filter((value) => value !== keyword) : [...draft.keywords, keyword] })}>{keyword}</button>) : <span className="faint">관심 키워드가 없습니다.</span>}</div></Field>
        <Field label="프로필 카테고리"><select className="select" value={draft.profileId ?? ''} onChange={(event) => { const profileId = event.target.value || null; patch({ profileId, categoryNames: profileId === draft.profileId ? draft.categoryNames : [] }) }}><option value="">프로필 없음</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>{selectedProfile ? <div className="alert-chips">{categoryOptions.map((category) => <button type="button" className={`chip${draft.categoryNames.includes(category.name) ? ' is-active' : ''}`} aria-pressed={draft.categoryNames.includes(category.name)} key={category.id} onClick={() => patch({ categoryNames: draft.categoryNames.includes(category.name) ? draft.categoryNames.filter((name) => name !== category.name) : [...draft.categoryNames, category.name] })}>{category.name}</button>)}</div> : null}</Field>
        <Field label="기관"><input className="input" value={draft.agency ?? ''} placeholder="공고기관 또는 수요기관" onChange={(event) => patch({ agency: event.target.value || null })} /></Field>
        <div className="grid-2"><Field label="최소 금액"><input className="input" inputMode="numeric" value={draft.amountMin == null ? '' : String(draft.amountMin)} onChange={(event) => patch({ amountMin: numberValue(event.target.value) })} /></Field><Field label="최대 금액"><input className="input" inputMode="numeric" value={draft.amountMax == null ? '' : String(draft.amountMax)} onChange={(event) => patch({ amountMax: numberValue(event.target.value) })} /></Field></div>
        <Field label="채널"><div className="alert-chips">{channels.length ? channels.map((channel) => <button type="button" className={`chip${draft.channelIds.includes(channel.id) ? ' is-active' : ''}`} aria-pressed={draft.channelIds.includes(channel.id)} key={channel.id} onClick={() => patch({ channelIds: draft.channelIds.includes(channel.id) ? draft.channelIds.filter((id) => id !== channel.id) : [...draft.channelIds, channel.id] })}>{channel.label || CHANNEL_LABELS[channel.type]}</button>) : <Empty>먼저 설정에서 알림 채널을 연결하세요.</Empty>}</div></Field>
        <Field label="주기"><Segmented options={[{ value: 'instant', label: '즉시' }, { value: 'daily', label: '하루 1회' }]} value={draft.digest} onChange={(value) => patch({ digest: value })} ariaLabel="발송 주기" /></Field>
        <Field label="사용"><Toggle checked={draft.enabled} onChange={(enabled) => patch({ enabled })} ariaLabel="알림 규칙 사용" /></Field>
        <div className="alert-row-actions"><button type="button" className="btn btn-primary btn-sm" disabled={busy || channelsPending} onClick={() => void save()}>저장</button><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDraft(null)}>취소</button></div>
      </div> : null}
      {rulesPending ? <div className="faint">알림 규칙을 불러오는 중입니다.</div> : null}
      {!draft && rules.length ? <div className="dtable"><div className="dtable-head cols-rules"><span>이름</span><span>유형</span><span>채널 수</span><span>주기</span><span>사용</span><span /></div>{rules.map((rule) => <div className="dtable-row cols-rules" key={rule.id}><strong>{rule.name || '이름 없는 규칙'}</strong><span className="muted">{rule.kinds.length ? rule.kinds.map((kind) => ALERT_KIND_LABELS[kind]).join(', ') : '전체 유형'}</span><span className="mono">{rule.channelIds.length}</span><span>{rule.digest === 'daily' ? '하루 1회' : '즉시'}</span><Tag tone={rule.enabled ? 'green' : 'gray'}>{rule.enabled ? '사용' : '중지'}</Tag><span className="alert-row-actions"><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => openEdit(rule)}>편집</button><button type="button" className="btn btn-icon btn-sm" aria-label="알림 규칙 삭제" disabled={busy} onClick={() => void remove(rule.id)}><Icon name="x" size={15} /></button></span></div>)}</div> : null}
      {!draft && !rulesPending && rules.length === 0 ? <Empty>등록된 알림 규칙이 없습니다.</Empty> : null}
      {rulesError ? <div className="err">오류: {errorText(rulesError)}</div> : null}
      {channelsError ? <div className="err">오류: {errorText(channelsError)}</div> : null}
      {actionError ? <div className="err">오류: {actionError}</div> : null}
    </Card>
  )
}

const numberValue = (value: string): number | null => {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return null
  const number = Number(trimmed)
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}
