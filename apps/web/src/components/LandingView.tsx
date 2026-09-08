import Link from 'next/link'
import type { ReactElement } from 'react'
import { Icon } from '@/components/icons'
import { Kpi, Tag } from '@/components/ui'
import { LANDING_STATS } from '@/lib/landing-stats'

const FEATURE_CATEGORIES = [
  { name: '물품 구매', color: '#9F2F2D', words: '구매, 납품, 물품' },
  { name: '유지보수', color: '#956400', words: '유지보수, 보수, 정비' },
  { name: '시설 공사', color: '#346538', words: '공사, 시공, 설치' },
  { name: '점검·진단', color: '#1F6C9F', words: '점검, 진단, 검사' },
] as const

function MiniTable(): ReactElement {
  return <div className="dtable landing-mini-table">
    <div className="dtable-head cols-mini"><span>사업명</span><span className="cell-right">낙찰률</span><span>분류</span></div>
    <div className="dtable-row cols-mini"><span className="landing-mini-title">2026년 공공시설 안전점검 용역</span><span className="mono cell-right result-rate">88.15%</span><span><Tag tone="blue">시설 점검</Tag></span></div>
    <div className="dtable-row cols-mini"><span className="landing-mini-title">정보시스템 성능시험 지원</span><span className="mono cell-right faint">미정</span><span><Tag tone="yellow">시험·인증</Tag></span></div>
    <div className="dtable-row cols-mini"><span className="landing-mini-title">2026년 지역문화축제 운영 용역</span><span className="mono cell-right faint">미정</span><span><Tag tone="red">행사·공연</Tag></span></div>
  </div>
}

export default function LandingView(): ReactElement {
  return <main id="main" className="landing">
    <nav className="landing-nav" aria-label="랜딩 메뉴">
      <div className="landing-brand"><span className="brand-mark"><Icon name="search" size={14} /></span><span>NARA SEARCH</span></div>
      <div className="landing-nav-links"><a href="#features">기능</a><a href="#data">데이터</a><a href="#pricing">요금</a></div>
      <div className="landing-nav-actions"><Link href="/login" className="landing-login">로그인</Link><Link href="/login" className="btn btn-primary">무료로 시작하기</Link></div>
    </nav>
    <section className="landing-hero">
      <div className="landing-hero-copy"><h1>나라장터의 하루 11만 건 투찰 데이터를, 내 분야 기준으로.</h1><p>공고·낙찰·계약·사전규격을 매일 새벽 수집해 두고, 직접 정한 분류 규칙으로 걸러 보여줍니다. 누가 얼마에 낙찰받았는지까지.</p><div className="landing-actions"><Link href="/login" className="btn btn-primary btn-lg">무료로 시작하기</Link><Link href="/dashboard" className="btn btn-ghost btn-lg">데모 화면 보기</Link></div><div className="landing-note">신용카드 없이 시작 · 조달청 공공데이터 기반</div></div>
      <div className="landing-hero-art"><MiniTable /><div className="grid-2"><Kpi label="어제 수집" value={LANDING_STATS.bidRowsPerDay} unit="행" sub="투찰 단위" /><Kpi label="평균 낙찰률" value="88.15" unit="%" sub="예시 데이터" /></div></div>
    </section>
    <section id="data" className="landing-stats" aria-label="데이터 통계"><div className="landing-stat"><div className="landing-stat-value">{LANDING_STATS.bidRowsPerDay}</div><div className="landing-stat-label">하루 투찰 행 수집</div></div><div className="landing-stat"><div className="landing-stat-value">{LANDING_STATS.noticesPerDay}</div><div className="landing-stat-label">하루 신규 공고</div></div><div className="landing-stat"><div className="landing-stat-value">{LANDING_STATS.sources}</div><div className="landing-stat-label">데이터 소스</div></div><div className="landing-stat"><div className="landing-stat-value">{LANDING_STATS.refreshAt}</div><div className="landing-stat-label">매일 갱신</div></div></section>
    <div className="landing-measured">측정 기준 {LANDING_STATS.measuredAt} · 조달청 나라장터 공공데이터</div>
    <div className="landing-feature-wrap">
      <section id="features" className="landing-feature"><div className="landing-feature-copy"><h2>분류는 내가 정한다</h2><p>같은 검색어로 찾은 공고도 업무는 다릅니다. 물품 구매, 유지보수, 공사, 점검, 교육처럼 내 사업 단위로 포함·제외 단어를 정하면, 모든 결과에 자동으로 태그가 붙고 그 기준으로 걸러집니다. 프로필은 여러 개 만들어 바꿔 쓸 수 있습니다.</p></div><div className="landing-feature-art"><div className="landing-rule-card"><div className="label">분류 규칙 · 기본 조달 분류</div>{FEATURE_CATEGORIES.map((category) => <div key={category.name} className="landing-rule-row"><span className="category-color" style={{ background: category.color }} /><strong>{category.name}</strong><span className="mono muted">{category.words}</span></div>)}</div></div></section>
      <section className="landing-feature"><div className="landing-feature-copy"><h2>낙찰가와 투찰업체까지 한 화면에</h2><p>낙찰 데이터는 투찰업체 단위로 저장됩니다. 추정가격, 예정가격, 하한율, 낙찰률, 참여 업체를 공고별로 묶어 보여주고, 낙찰업체는 한 번의 클릭으로 경쟁사 목록에 올라갑니다.</p></div><div className="landing-feature-art"><MiniTable /></div></section>
      <section className="landing-feature"><div className="landing-feature-copy"><h2>새벽에 수집하고, 아침에 알려드립니다</h2><p>관심 키워드와 프로필 조건에 맞는 새 공고·낙찰이 들어오면 카카오톡, 이메일, Slack, 웹푸시로 보냅니다. 같은 공고를 두 번 보내지 않습니다.</p></div><div className="landing-feature-art"><div className="landing-rule-card"><div className="label">알림 · 2026-08-28 03:12</div><strong>관심 분야 · 새 낙찰 5건</strong><div className="muted">2026년 공공시설 안전점검 용역 · 경주시 · 낙찰률 88.15%<br />정보시스템 성능시험 지원 · 공공기관 · 추정 4,900만원</div><div className="row"><Tag tone="yellow">카카오톡</Tag><Tag tone="blue">이메일</Tag><Tag tone="gray">Slack</Tag></div></div></div></section>
    </div>
    <section id="pricing" className="landing-pricing"><div className="landing-pricing-head"><div><h2>요금</h2><p className="landing-pricing-sub">개인은 무료로 시작하고, 팀은 워크스페이스 단위로 씁니다. 가격은 정식 출시 때 확정됩니다.</p></div></div><div className="landing-price-grid"><div className="landing-price-card"><div className="landing-price-name">개인</div><div className="landing-price">0원</div><p>프로필 1개 · 키워드 10개<br />낙찰·공고 조회 · CSV</p><Link href="/login" className="btn btn-ghost">시작하기</Link></div><div className="landing-price-card is-team"><div className="landing-price-name">팀</div><div className="landing-price">[가격]</div><p>프로필·키워드 무제한 · 알림 4채널<br />팀 워크스페이스 · 경쟁사 분석</p><Link href="/login" className="btn btn-primary">문의하기</Link></div></div></section>
    <footer className="landing-footer"><span>© 2026 NARA SEARCH · 개인정보처리방침 · 이용약관</span><span>데이터 출처: 조달청 나라장터 공공데이터</span></footer>
  </main>
}
