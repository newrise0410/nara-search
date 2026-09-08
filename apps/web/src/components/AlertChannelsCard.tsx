'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { Card, Empty, Notice, Tag, Toggle } from '@/components/ui'
import type { AlertChannelView, ChannelBody } from '@/lib/alerts-types'
import { channelsKey, createChannel, deleteChannel, fetchChannels, testChannel, updateChannel } from '@/lib/alerts-client'
import { subscribeWebPush, unsubscribeWebPush } from '@/lib/webpush-client'

const KAKAO_NOTICES: Record<string, string> = {
  connected: '카카오톡 알림을 연결했습니다.',
  denied: '카카오 연결이 취소되었습니다.',
  no_code: '카카오 연결이 완료되지 않았습니다. 다시 시도해 주세요.',
  state_mismatch: '카카오 연결 요청이 만료되었습니다. 다시 시도해 주세요.',
  exchange_failed: '카카오 토큰을 발급받지 못했습니다. 잠시 후 다시 시도해 주세요.',
  unconfigured: 'KAKAO_REST_API_KEY가 설정되지 않았습니다. 관리자에게 문의하세요.',
  no_secret: 'ALERT_SECRET_KEY가 설정되지 않았습니다. 관리자에게 문의하세요.',
}

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

const webhookKindOf = (value: string): string => {
  let host = value.toLowerCase()
  try { host = new URL(value).hostname.toLowerCase() } catch { host = host.split('/')[0]?.split(':')[0] ?? host }
  if (host === 'hooks.slack.com') return 'slack'
  if (host === 'discord.com' || host.endsWith('.discord.com') || host === 'discordapp.com' || host.endsWith('.discordapp.com')) return 'discord'
  return 'generic'
}

export default function AlertChannelsCard(): ReactElement {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const { data, isPending, error } = useQuery({ queryKey: channelsKey, queryFn: ({ signal }) => fetchChannels(signal), staleTime: 30_000, retry: false })
  const channels = data?.channels ?? []
  const available = data?.available ?? {}
  const kakao = channels.find((channel) => channel.type === 'kakao')
  const email = channels.find((channel) => channel.type === 'email')
  const webhooks = channels.filter((channel) => channel.type === 'webhook')
  const webpush = channels.filter((channel) => channel.type === 'webpush')
  const [emailAddress, setEmailAddress] = useState<string>()
  const [webhookUrl, setWebhookUrl] = useState('')
  const [busy, setBusy] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? ''
  const webpushReady = Boolean(vapidPublicKey) && available.webpush !== false

  const invalidate = () => queryClient.invalidateQueries({ queryKey: channelsKey })
  const run = async (name: string, action: () => Promise<unknown>, success = '알림 채널을 저장했습니다.') => {
    setBusy(name)
    setActionError(undefined)
    setNotice(undefined)
    try {
      await action()
      await invalidate()
      setNotice(success)
    } catch (caught) {
      setActionError(errorText(caught))
    } finally {
      setBusy(undefined)
    }
  }
  const test = (channel: AlertChannelView) => run(`test-${channel.id}`, () => testChannel(channel.id), '테스트 알림을 발송했습니다.')
  const remove = (channel: AlertChannelView) => run(`delete-${channel.id}`, () => deleteChannel(channel.id), '알림 채널을 해제했습니다.')

  return (
    <Card>
      <div className="section-title">알림 채널</div>
      {KAKAO_NOTICES[searchParams.get('kakao') ?? ''] ? <Notice>{KAKAO_NOTICES[searchParams.get('kakao') ?? '']}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {isPending ? <div className="faint">알림 채널을 불러오는 중입니다.</div> : null}
      <div className="list-row">
        <div>
          <strong>카카오톡 나에게 보내기</strong>
          <div className="muted">{kakao ? `${kakao.label || '카카오톡'} · 연결됨` : available.kakao ? '카카오 계정을 연결하면 즉시 알림을 받습니다' : '준비 중 · 관리자가 카카오 키를 설정하면 열립니다'}</div>
        </div>
        <span className="spacer" />
        {kakao ? <div className="alert-row-actions"><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void test(kakao)}>테스트</button><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void remove(kakao)}>해제</button></div> : available.kakao ? <a className="btn btn-ghost btn-sm" href="/auth/kakao/start">연결</a> : <Tag tone="gray">준비 중</Tag>}
      </div>
      <div className="list-row">
        <div className="col">
          <strong>이메일</strong>
          {email || available.email ? <input className="input" type="email" defaultValue={email?.target ?? ''} key={email?.id ?? 'new-email'} placeholder="알림 받을 이메일 주소" onChange={(event) => setEmailAddress(event.target.value)} /> : <div className="muted">준비 중 · 관리자가 이메일 발송 키를 설정하면 열립니다</div>}
        </div>
        <span className="spacer" />
        {!email && !available.email ? <Tag tone="gray">준비 중</Tag> : <div className="alert-row-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void run('email-save', () => email ? updateChannel(email.id, { label: email.label || '이메일', config: { address: emailAddress ?? email.target } }) : createChannel({ type: 'email', label: '이메일', config: { address: emailAddress ?? '' } }), '이메일 알림 주소를 저장했습니다.')}>저장</button>
          {email ? <><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void test(email)}>테스트</button><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void remove(email)}>해제</button><Toggle checked={email.enabled} onChange={(checked) => void run(`email-toggle-${email.id}`, () => updateChannel(email.id, { enabled: checked }))} ariaLabel="이메일 알림" /></> : null}
        </div>}
      </div>
      <div className="list-row">
        <div className="col">
          <strong>Slack / Discord 웹훅</strong>
          {webhooks.length ? webhooks.map((channel) => <div className="row" key={channel.id}><span className="alert-target">{channel.target}</span><Tag tone="gray">{webhookKindOf(channel.target)}</Tag></div>) : <div className="muted">팀 채널로 발송</div>}
          <input className="input" value={webhookUrl} placeholder="웹훅 URL" onChange={(event) => setWebhookUrl(event.target.value)} />
        </div>
        <span className="spacer" />
        <div className="alert-row-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void run('webhook-add', async () => { await createChannel({ type: 'webhook', label: '웹훅', config: { url: webhookUrl } }); setWebhookUrl('') })}>웹훅 추가</button>
          {webhooks.map((channel) => <span className="alert-row-actions" key={channel.id}><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void test(channel)}>테스트</button><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void remove(channel)}>삭제</button></span>)}
        </div>
      </div>
      <div className="list-row">
        <div>
          <strong>웹푸시</strong>
          <div className="muted">{webpush.length ? '이 브라우저에서 알림을 받고 있습니다' : webpushReady ? '이 브라우저에서 알림 허용' : '준비 중 · 관리자가 웹푸시 키를 설정하면 열립니다'}</div>
        </div>
        <span className="spacer" />
        <div className="alert-row-actions">
          {webpush.length ? webpush.map((channel) => <span className="alert-row-actions" key={channel.id}><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void test(channel)}>테스트</button><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(busy)} onClick={() => void run(`webpush-remove-${channel.id}`, async () => { await unsubscribeWebPush(); await deleteChannel(channel.id) }, '웹푸시 구독을 해제했습니다.')}>해제</button></span>) : <button type="button" className="btn btn-ghost btn-sm" disabled={!webpushReady || Boolean(busy)} onClick={() => void run('webpush-add', async () => { const subscription = await subscribeWebPush(vapidPublicKey); await createChannel({ type: 'webpush', label: '이 브라우저', config: subscription as ChannelBody['config'] }) }, '웹푸시 알림을 허용했습니다.')}>허용</button>}

        </div>
      </div>
      {error ? <div className="err">오류: {errorText(error)}</div> : null}
      {actionError ? <div className="err">오류: {actionError}</div> : null}
      {channels.length === 0 && !isPending ? <Empty>연결된 알림 채널이 없습니다.</Empty> : null}
    </Card>
  )
}
