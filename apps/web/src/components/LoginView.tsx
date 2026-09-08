'use client'

import type { ReactElement } from 'react'
import { useState } from 'react'
import { Icon } from '@/components/icons'
import { Notice, Tag } from '@/components/ui'
import { createClient } from '@/utils/supabase/client'

function MiniTable(): ReactElement {
  return <div className="dtable landing-mini-table">
    <div className="dtable-head cols-mini"><span>사업명</span><span className="cell-right">낙찰률</span><span>분류</span></div>
    <div className="dtable-row cols-mini"><span className="landing-mini-title">2026년 공공시설 안전점검 용역</span><span className="mono cell-right result-rate">88.15%</span><span><Tag tone="blue">시설 점검</Tag></span></div>
    <div className="dtable-row cols-mini"><span className="landing-mini-title">정보시스템 성능시험 지원</span><span className="mono cell-right faint">미정</span><span><Tag tone="yellow">시험·인증</Tag></span></div>
    <div className="dtable-row cols-mini"><span className="landing-mini-title">2026년 지역문화축제 운영 용역</span><span className="mono cell-right faint">미정</span><span><Tag tone="red">행사·공연</Tag></span></div>
  </div>
}

export default function LoginView({ next, errorMessage }: { next: string; errorMessage: string | null }): ReactElement {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(errorMessage)
  const start = async () => {
    setPending(true); setError(null)
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, scopes: 'email', queryParams: { prompt: 'select_account' } },
    })
    if (oauthError) { setError('구글 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'); setPending(false) }
  }
  return <main id="main" className="login">
    <aside className="login-aside"><div className="landing-brand"><span className="brand-mark"><Icon name="search" size={14} /></span><span>NARA SEARCH</span></div><h1>어제 개찰된 낙찰 1,324건이 이미 정리돼 있습니다.</h1><MiniTable /><div className="login-aside-footer">데이터 기준 2026-08-25 · 매일 03:00 갱신</div></aside>
    <div className="login-form-wrap"><div className="login-form"><h1>로그인 / 회원가입</h1><div className="form-intro">구글 계정으로 계속하면 계정이 없을 때 자동으로 만들어집니다.</div><button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={pending}>{pending ? '구글로 이동 중…' : 'Google로 계속하기'}</button>{error ? <Notice>{error}</Notice> : null}<p className="terms">가입 시 이메일 주소만 저장합니다. 이름·프로필 사진은 저장하지 않습니다.</p><p className="terms">계속하면 NARA SEARCH의 이용약관 및 개인정보처리방침에 동의하는 것으로 봅니다.</p></div></div>
  </main>
}
