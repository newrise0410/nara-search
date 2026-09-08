'use client'

import { download } from '@nara/api'
import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Suspense, useState } from 'react'
import AlertChannelsCard from '@/components/AlertChannelsCard'
import OrgMembersCard from '@/components/OrgMembersCard'
import { Card, PageHeader, Segmented, StatusDot, Tag } from '@/components/ui'
import { fetchStatus, statusKey } from '@/lib/api-client'
import { bytes } from '@/lib/format'
import { useStore } from '@/store'

const SOURCE_LABELS = { award: '낙찰', notice: '입찰공고', contract: '계약', prespec: '사전규격' } as const

export default function SettingsView(): ReactElement {
  const store = useStore()
  const [backupError, setBackupError] = useState<string>()
  const { data: status } = useQuery({ queryKey: statusKey, queryFn: ({ signal }) => fetchStatus(signal), staleTime: 60_000, retry: false })
  const storage = status?.storage
  const usedPercent = storage ? Math.min(100, Math.round(storage.usedRatio * 100)) : 0
  const usageTone = !storage ? 'gray' : storage.overBudget ? 'red' : usedPercent >= 70 ? 'yellow' : 'green'

  const exportAll = () => download(`nara-backup-${Date.now()}.json`, JSON.stringify({ profiles: store.profiles, keywords: store.keywords, competitors: store.competitors, presets: store.presets }, null, 2), 'application/json')
  const importAll = (file?: File) => file?.text().then((text) => store.importAll(JSON.parse(text))).catch((error: unknown) => setBackupError(error instanceof Error ? error.message : String(error)))
  return (
    <>
      <PageHeader title="설정" sub="워크스페이스 멤버, 알림 채널, 데이터 소스, 화면, 백업" />
      <div className="grid-2">
        <div className="col"><Suspense fallback={null}><AlertChannelsCard /></Suspense><OrgMembersCard /></div>
        <div className="col">
          <Card>
            <div className="section-title">데이터</div>
            {(['award', 'notice', 'contract', 'prespec'] as const).map((kind) => {
              const current = status?.kinds.find((item) => item.kind === kind)
              const realtime = kind === 'prespec'
              const ok = Boolean(current?.done)
              const failed = Boolean(current?.failed)
              return <div className="list-row" key={kind}><StatusDot tone={realtime ? 'yellow' : failed ? 'red' : ok ? 'green' : 'gray'} /><strong>{SOURCE_LABELS[kind]}</strong><span className="spacer" /><span className="muted">{realtime ? 'DB 미적재 시 조달청 실시간 조회' : ok ? `마지막 수집 ${current?.latestChunkStart ?? '-'} · 완료 ${current?.done ?? 0}건` : '첫 수집 대기'}</span><Tag tone={realtime ? 'yellow' : failed ? 'red' : ok ? 'green' : 'gray'}>{realtime ? '실시간' : failed ? '실패' : ok ? '정상' : '대기'}</Tag></div>
            })}
            {storage ? <div className="usage">
              <div className="list-row"><strong>저장 용량</strong><span className="spacer" /><span className="mono muted">{bytes(storage.databaseBytes)} / {bytes(storage.budgetBytes)}</span><Tag tone={usageTone}>{usedPercent}%</Tag></div>
              <div className="usage-bar"><div className={`usage-bar-fill is-${usageTone}`} style={{ width: `${usedPercent}%` }} /></div>
              <div className="faint">보존 창 · 투찰 {storage.retention.bidders}일 · 공고 {storage.retention.notices}일 · 계약 {storage.retention.contracts}일 · 그 밖은 나라장터 실시간 조회</div>
            </div> : null}
          </Card>
          <Card>
            <div className="section-title">화면</div>
            <div className="list-row"><div><strong>테마</strong><div className="muted">라이트 고정 · 다크는 준비 중입니다</div></div><span className="spacer" /><Segmented options={[{ value: 'system', label: '시스템', disabled: true }, { value: 'light', label: '라이트' }, { value: 'dark', label: '다크', disabled: true }]} value="light" onChange={() => store.setTheme('light')} ariaLabel="테마" size="sm" /></div>
            <div className="list-row"><div><strong>밀도</strong><div className="muted">표 행 높이</div></div><span className="spacer" /><Segmented options={[{ value: 'normal', label: '보통' }, { value: 'compact', label: '조밀' }]} value={store.density} onChange={store.setDensity} ariaLabel="밀도" size="sm" /></div>
          </Card>
          <Card>
            <div className="section-title">백업</div>
            <div className="muted">프로필·키워드·경쟁사·프리셋</div><div className="muted">JSON 파일로 내보내고 가져옵니다</div>
            <div className="row"><button type="button" className="btn btn-ghost btn-sm" onClick={exportAll}>내보내기</button><label className="btn btn-ghost btn-sm">가져오기<input type="file" accept="application/json" hidden onChange={(event) => importAll(event.target.files?.[0])} /></label></div>
            {backupError ? <div className="err">오류: {backupError}</div> : null}
          </Card>
        </div>
      </div>
    </>
  )
}
