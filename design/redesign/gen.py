# NARA SEARCH 정식 시안 생성기 (방향 A · 따뜻한 모노크롬 데이터 대시보드)
import json, os

# ---------- tokens ----------
BG='#F7F6F3'; PANEL='#FFFFFF'; PANEL2='#F2F1EE'; LINE='#EAEAEA'; INK='#111111'; TEXT='#2F3437'; MUTED='#787774'; FAINT='#A8A6A1'
SEL_BG='#E1F3FE'; SEL_TX='#1F6C9F'
TAG={'green':('#EDF3EC','#346538'),'yellow':('#FBF3DB','#956400'),'blue':('#E1F3FE','#1F6C9F'),'red':('#FDEBEC','#9F2F2D'),'gray':('#F2F1EE','#787774')}
FONT_LINK='<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Hahmlet:wght@500;600&display=swap">'
BASE_CSS=f'''
    body {{ margin: 0; font-family: "IBM Plex Sans KR", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif; color: {TEXT}; background: {BG}; line-height: 1.5; }}
    a {{ color: {SEL_TX}; }} a:hover {{ color: #17557d; }}
    .mono {{ font-family: "IBM Plex Mono", "SF Mono", ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; }}
    .serif {{ font-family: "Hahmlet", "Noto Serif KR", serif; }}
    kbd {{ font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 11px; padding: 1px 6px; border: 1px solid {LINE}; border-radius: 4px; background: {PANEL2}; color: {MUTED}; }}
'''
def page(body, w=1440, h=900, extra_css=''):
    return f'''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {FONT_LINK}
  <style>{BASE_CSS}{extra_css}</style>
</helmet>
{body}
</x-dc>
</body>
</html>
'''
def tag(text, kind='gray'):
    bg,tx=TAG[kind]; return f'<span style="display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 999px; background: {bg}; color: {tx}; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap;">{text}</span>'
def btn(text, kind='primary', h=36):
    if kind=='primary': return f'<div style="display: inline-flex; align-items: center; justify-content: center; height: {h}px; padding: 0 16px; border-radius: 6px; background: {INK}; color: #FFFFFF; font-size: 13px; font-weight: 600; white-space: nowrap;">{text}</div>'
    if kind=='ghost': return f'<div style="display: inline-flex; align-items: center; justify-content: center; height: {h}px; padding: 0 14px; border-radius: 6px; border: 1px solid {LINE}; background: {PANEL}; color: {TEXT}; font-size: 13px; font-weight: 500; white-space: nowrap;">{text}</div>'
    return f'<span style="font-size: 13px; font-weight: 600; color: {SEL_TX}; white-space: nowrap;">{text}</span>'
def card(inner, pad=20, extra=''):
    return f'<div style="display: flex; flex-direction: column; gap: 12px; padding: {pad}px; border: 1px solid {LINE}; border-radius: 10px; background: {PANEL}; {extra}">{inner}</div>'
def label(t): return f'<div style="font-size: 12px; font-weight: 600; color: {MUTED}; letter-spacing: 0.02em;">{t}</div>'
def h1(t, sub=None):
    s=f'<div style="font-size: 13px; color: {MUTED};">{sub}</div>' if sub else ''
    return f'<div style="display: flex; flex-direction: column; gap: 4px;"><div style="font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: {INK};">{t}</div>{s}</div>'

# icons (single stroke width 1.8, 18px grid)
def ico(name, size=18, color='currentColor'):
    P={'grid':'<rect x="3" y="3" width="8" height="8" rx="1.5"></rect><rect x="13" y="3" width="8" height="8" rx="1.5"></rect><rect x="3" y="13" width="8" height="8" rx="1.5"></rect><rect x="13" y="13" width="8" height="8" rx="1.5"></rect>',
       'search':'<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>',
       'list':'<path d="M4 6h16M4 12h16M4 18h10"></path>',
       'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path><circle cx="9.5" cy="7" r="4"></circle><path d="M21 21v-2a4 4 0 0 0-3-3.9"></path>',
       'cube':'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"></path><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"></path>',
       'gear':'<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"></path>',
       'download':'<path d="M12 3v12m0 0l-4-4m4 4l4-4"></path><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path>',
       'bell':'<path d="M6 8a6 6 0 0 1 12 0v5l2 3H4l2-3V8z"></path><path d="M10 20a2 2 0 0 0 4 0"></path>',
       'clock':'<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path>',
       'plus':'<path d="M12 5v14M5 12h14"></path>',
       'check':'<path d="M5 12l5 5 9-10"></path>',
       'arrow':'<path d="M5 12h14M13 6l6 6-6 6"></path>',
       'home':'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9z"></path>',
       'more':'<circle cx="5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle>',
       'x':'<path d="M6 6l12 12M18 6L6 18"></path>'}
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{P[name]}</svg>'

NAV=[('home','대시보드'),('search','검색'),('list','관심 키워드'),('users','경쟁사'),('cube','도메인 프로필'),('gear','설정')]
def sidebar(active):
    items=''
    for k,t in NAV:
        if t==active: items+=f'<div style="display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border-radius: 6px; background: {SEL_BG}; color: {SEL_TX}; font-size: 13px; font-weight: 600;">{ico(k)}<span>{t}</span></div>'
        else: items+=f'<div style="display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border-radius: 6px; color: {TEXT}; font-size: 13px;">{ico(k, color=MUTED)}<span>{t}</span></div>'
    return f'''<aside style="width: 228px; display: flex; flex-direction: column; gap: 2px; padding: 18px 12px; background: {PANEL}; border-right: 1px solid {LINE}; flex-shrink: 0;">
    <div style="display: flex; align-items: center; gap: 10px; padding: 2px 8px 18px 8px;"><div style="width: 26px; height: 26px; border-radius: 6px; background: {INK}; display: flex; align-items: center; justify-content: center;">{ico('search',14,'#FFFFFF')}</div><div style="font-weight: 700; font-size: 14px; letter-spacing: 0.02em; color: {INK};">NARA SEARCH</div></div>
    {items}
    <div style="flex-grow: 1;"></div>
    <div style="display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 8px; background: {PANEL2}; font-size: 12px; color: {MUTED};">
      <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #346538;"></span><span style="font-weight: 600; color: {TEXT};">수집 정상</span></div>
      <div>낙찰 2026-08-25 · 4/4 완료</div>
      <div>다음 수집 03:00</div>
    </div>
    <div style="display: flex; align-items: center; gap: 10px; padding: 10px 8px 0 8px;"><div style="width: 28px; height: 28px; border-radius: 8px; background: #FBF3DB; color: #956400; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">다</div><div style="display: flex; flex-direction: column;"><span style="font-size: 12px; font-weight: 600; color: {TEXT};">NARA SEARCH</span><span style="font-size: 11px; color: {MUTED};">팀 워크스페이스</span></div></div>
  </aside>'''
def topbar(query='', right=''):
    return f'''<div style="display: flex; align-items: center; gap: 12px; height: 60px; padding: 0 28px; background: {PANEL}; border-bottom: 1px solid {LINE}; flex-shrink: 0;">
      <div style="flex-grow: 1; max-width: 640px; display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 12px; border: 1px solid {LINE}; border-radius: 6px; background: {BG}; font-size: 13px;">{ico('search',16,MUTED)}<span style="flex-grow: 1; color: {INK if query else FAINT};">{query or '사업명, 공고번호, 기관명'}</span><kbd>⌘K</kbd></div>
      <div style="flex-grow: 1;"></div>
      {right}
    </div>'''
def shell(active, query, right, content):
    return f'''<div style="width: 1440px; height: 900px; display: flex; background: {BG}; overflow: hidden;">
  {sidebar(active)}
  <main style="flex-grow: 1; display: flex; flex-direction: column; min-width: 0;">
    {topbar(query, right)}
    <div style="display: flex; flex-direction: column; gap: 18px; padding: 22px 28px; overflow: hidden;">
      {content}
    </div>
  </main>
</div>'''

# ---------- data (실측 2026-08-25/26) ----------
ROWS=[('정보시스템 성능시험 지원','R26BK01681323','공공기관','용역 · 규격가격동시입찰','49,000,000',None,None,('시험·인증','yellow')),
      ('2026년 지역문화축제 운영 용역','R26BK01683068','(주)경상일보','용역 · 협상에의한계약','220,000,000',None,None,('행사·공연','red')),
      ('2026 사통팔달 어울림 한마당 피날레 시설 아트쇼 운영 용역(협상)','R26BK01684176','경기도 수원시 팔달구','용역 · 협상에의한계약','59,090,909',None,None,('행사·공연','red')),
      ('2026년 공공시설 안전점검 용역','R26BK01688825','경상북도 경주시','용역 · 소액수의견적','64,170,000','62,500,000','88.15%',('시설 점검','blue'))]
DEADLINES=[('의성군 시설유지보수운영시스템 구축 용역(재공고)','경상북도 의성군','입찰마감 09-01 10:00','90,909,091'),
           ('2026년 지역문화축제 운영 용역(재공고)','(주)경상일보','입찰마감 09-07 17:00','220,000,000'),
           ('「2027 구미시 새희망 카운트다운 행사」시설문화행사 및 행사대행 용역','경상북도 구미시','개찰 09-08 18:00','263,636,364')]

def results_table():
    head=f'<div style="display: grid; grid-template-columns: 1.8fr 1fr 0.9fr 0.7fr 0.8fr 0.6fr; gap: 12px; padding: 10px 16px; background: {PANEL2}; border-bottom: 1px solid {LINE}; font-size: 12px; font-weight: 600; color: {MUTED};"><div>공고 · 사업명</div><div>기관</div><div>구분 · 방법</div><div style="text-align: right;">추정가격</div><div style="text-align: right;">낙찰가 · 낙찰률</div><div>분류</div></div>'
    body=''
    for i,(t,no,ag,m,est,fin,rate,(tg,tk)) in enumerate(ROWS):
        sel= i==3
        fin_html=f'<div style="display: flex; flex-direction: column; align-items: flex-end;"><span class="mono">{fin}</span><span class="mono" style="font-size: 12px; color: {SEL_TX}; font-weight: 600;">{rate}</span></div>' if fin else f'<div class="mono" style="text-align: right; color: {FAINT};">미정</div>'
        body+=f'<div style="display: grid; grid-template-columns: 1.8fr 1fr 0.9fr 0.7fr 0.8fr 0.6fr; gap: 12px; padding: 12px 16px; border-bottom: 1px solid {LINE}; font-size: 13px; align-items: center; background: {"#F5FAFE" if sel else PANEL};"><div style="display: flex; flex-direction: column; gap: 2px;"><div style="font-weight: 600; color: {INK};">{t}</div><div class="mono" style="font-size: 12px; color: {MUTED};">{no} · 08-25</div></div><div>{ag}</div><div style="color: {MUTED};">{m}</div><div class="mono" style="text-align: right;">{est}</div>{fin_html}<div>{tag(tg,tk)}</div></div>'
    return f'<div style="border: 1px solid {LINE}; border-radius: 10px; background: {PANEL}; overflow: hidden;">{head}{body}</div>'

import re
def numfmt(val, size=24):
    m=re.match(r'^([\d,.%:]+)(.*)$', val)
    if not m: return f'<span style="font-size: {size}px;">{val}</span>'
    n,u=m.groups()
    return f'<span class="mono" style="font-size: {size}px;">{n}</span>' + (f'<span style="font-size: {int(size*0.62)}px; font-weight: 500; margin-left: 2px;">{u}</span>' if u else '')
def kpi(lbl, val, sub=None, mono=True):
    s=f'<div style="font-size: 12px; color: {MUTED};">{sub}</div>' if sub else ''
    return f'<div style="display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; border: 1px solid {LINE}; border-radius: 10px; background: {PANEL};">{label(lbl)}<div style="display: flex; align-items: baseline; font-weight: 600; color: {INK}; letter-spacing: -0.01em;">{numfmt(val)}</div>{s}</div>'

# ---------- Results (Main) ----------
chips=''.join(f'<div style="display: inline-flex; align-items: center; height: 30px; padding: 0 10px; border-radius: 6px; {"background: "+SEL_BG+"; color: "+SEL_TX+"; font-weight: 600;" if a else "border: 1px solid "+LINE+"; background: "+PANEL+"; color: "+TEXT+";"} font-size: 13px;">{t}</div>' for t,a in [('낙찰결과',1),('입찰공고',0),('사전규격',0),('계약',0)])
filters=f'<div style="display: flex; align-items: center; gap: 8px;">{chips}<div style="width: 1px; height: 20px; background: {LINE}; margin: 0 4px;"></div>'+''.join(f'<div style="display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 6px; border: 1px solid {LINE}; background: {PANEL}; font-size: 13px;"><span style="color: {MUTED};">{k}</span><span class="{"mono" if k=="기간" else ""}">{v}</span></div>' for k,v in [('기간','2026-08-25'),('업무구분','전체'),('프로필','시설 사업')])+f'<div style="flex-grow: 1;"></div><span style="font-size: 12px; color: {MUTED};">데이터 기준 2026-08-25 03:00</span></div>'
kpis=f'<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;">{kpi("결과","4건")}{kpi("추정가격 합계","392,260,909원")}{kpi("평균 낙찰률","88.15%","낙찰 확정 1건 기준")}<div style="display: flex; flex-direction: column; gap: 8px; padding: 16px 18px; border: 1px solid {LINE}; border-radius: 10px; background: {PANEL};">{label("분류")}<div style="display: flex; gap: 6px; flex-wrap: wrap;">{tag("행사·공연 2","red")}{tag("시설 점검 1","blue")}{tag("시험·인증 1","yellow")}</div></div></div>'
detail=f'''<div style="display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border: 1px solid #BFDCF0; border-radius: 10px; background: {PANEL};">
  <div style="display: flex; align-items: center; gap: 10px; font-size: 13px;"><span style="font-weight: 600; color: {INK};">낙찰 상세</span><span style="color: {MUTED};">2026년 공공시설 안전점검 용역 · 하한율 88%</span><div style="flex-grow: 1;"></div>{btn('낙찰업체를 경쟁사로 등록','link')}</div>
  <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding-top: 10px; border-top: 1px solid {LINE};">
    <div style="display: flex; flex-direction: column; gap: 2px;">{label("낙찰업체")}<span style="font-size: 14px; font-weight: 600; color: {INK};">사인(SAin)</span></div>
    <div style="display: flex; flex-direction: column; gap: 2px;">{label("예정가격")}<span class="mono" style="font-size: 14px;">70,903,825</span></div>
    <div style="display: flex; flex-direction: column; gap: 2px;">{label("낙찰금액")}<span class="mono" style="font-size: 14px;">62,500,000</span></div>
    <div style="display: flex; flex-direction: column; gap: 2px;">{label("낙찰률")}<span class="mono" style="font-size: 14px; font-weight: 600; color: {SEL_TX};">88.15%</span></div>
  </div>
</div>'''
SP='<span style="margin-left: 6px;">'
csv_btn=btn(ico("download",16,TEXT)+SP+'CSV</span>','ghost')
right_actions=csv_btn+btn("조회","primary")
MAIN=page(shell('검색','시설', right_actions, h1('결과','낙찰결과 · 시설 · 2026-08-25')+filters+kpis+results_table()+detail))

# ---------- Dashboard ----------
def row3(items): return f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;">{items}</div>'
dl=''.join(f'<div style="display: grid; grid-template-columns: 1.6fr 0.9fr 0.8fr 0.6fr; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid {LINE}; font-size: 13px;"><div style="font-weight: 600; color: {INK};">{t}</div><div style="color: {MUTED};">{ag}</div><div class="mono" style="font-size: 12px; color: {"#9F2F2D" if "09-01" in d else TEXT};">{d}</div><div class="mono" style="text-align: right;">{amt}</div></div>' for t,ag,d,amt in DEADLINES)
hits=''.join(f'<div style="display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid {LINE}; font-size: 13px;"><span style="font-weight: 600; color: {INK}; width: 110px;">{k}</span><span class="{"mono" if v[0].isdigit() else "txt"}" style="color: {TEXT if v[0].isdigit() else FAINT};">{v}</span><div style="flex-grow: 1;"></div><span style="font-size: 12px; color: {MUTED};">{s}</span></div>' for k,v,s in [('시설','5건','낙찰 08-25'),('전산장비','점검 전',''),('전산장비','점검 전',''),('ERP','점검 전','')])
srcs=''.join(f'<div style="display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid {LINE}; font-size: 13px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: {c};"></span><span style="font-weight: 600; color: {INK}; width: 80px;">{k}</span><span class="mono" style="font-size: 12px; color: {MUTED};">{v}</span></div>' for k,v,c in [('낙찰','2026-08-25 · 112,183행 · 완료','#346538'),('입찰공고','미수집 · 첫 수집 대기','#A8A6A1'),('계약','미수집 · 첫 수집 대기','#A8A6A1'),('사전규격','실시간 조회로 대체','#956400')])
bell_btn=btn(ico("bell",16,TEXT)+SP+'알림 규칙</span>','ghost')
DASH=page(shell('대시보드','', bell_btn+btn("새 검색","primary"),
  h1('좋은 아침입니다','2026-08-28 목요일 · 어젯밤 03:00에 낙찰 데이터를 갱신했습니다')+
  f'<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;">{kpi("어제 개찰 낙찰","1,324건","투찰 112,183행")}{kpi("신규 입찰공고","1,588건","08-26 하루")}{kpi("관심 키워드 히트","5건","시설 · 낙찰")}{kpi("마감 임박 공고","3건","7일 이내")}</div>'+
  f'<div style="display: grid; grid-template-columns: 1.7fr 1fr; gap: 12px; align-items: start;">'+
  card(f'<div style="display: flex; align-items: center;"><span style="font-size: 14px; font-weight: 600; color: {INK};">마감 임박 · 시설 사업 프로필</span><div style="flex-grow: 1;"></div>{btn("전체 보기","link")}</div><div style="display: grid; grid-template-columns: 1.6fr 0.9fr 0.8fr 0.6fr; gap: 12px; font-size: 12px; font-weight: 600; color: {MUTED};"><div>공고</div><div>기관</div><div>일정</div><div style="text-align: right;">추정가격</div></div>{dl}')+
  f'<div style="display: flex; flex-direction: column; gap: 12px;">'+card(f'<div style="font-size: 14px; font-weight: 600; color: {INK};">관심 키워드</div>{hits}',16)+card(f'<div style="font-size: 14px; font-weight: 600; color: {INK};">데이터 소스</div>{srcs}',16)+'</div></div>'))

# ---------- Search ----------
def field(lbl, val, placeholder=False, w=None):
    return f'<div style="display: flex; flex-direction: column; gap: 6px; {"width: "+str(w)+"px;" if w else "flex-grow: 1;"}">{label(lbl)}<div style="display: flex; align-items: center; height: 38px; padding: 0 12px; border: 1px solid {LINE}; border-radius: 6px; background: {PANEL}; font-size: 13px; color: {FAINT if placeholder else INK};">{val}</div></div>'
def seg(opts, active):
    return f'<div style="display: inline-flex; border: 1px solid {LINE}; border-radius: 6px; overflow: hidden; background: {PANEL};">'+''.join(f'<div style="display: flex; align-items: center; height: 36px; padding: 0 14px; font-size: 13px; {"background: "+SEL_BG+"; color: "+SEL_TX+"; font-weight: 600;" if o==active else "color: "+TEXT+";"}">{o}</div>' for o in opts)+'</div>'
quick=''.join(f'<div style="display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 6px; font-size: 12px; {"background: "+SEL_BG+"; color: "+SEL_TX+"; font-weight: 600;" if q=="1일" else "border: 1px solid "+LINE+"; background: "+PANEL+"; color: "+TEXT+";"}">{q}</div>' for q in ['1일','3일','7일','14일','1개월','3개월','6개월','1년'])
recent=''.join(f'<div style="display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid {LINE}; background: {PANEL}; font-size: 12px;">{q}</div>' for q in ['시설','시설 유지보수','전산장비 측량','열화상'])
SEARCH=page(shell('검색','', btn('조회','primary'),
  h1('검색','수집된 DB에서 조회합니다 · 사전규격은 실시간')+
  card(f'<div style="display: flex; align-items: center; gap: 12px;">{seg(["낙찰결과","입찰공고","사전규격","계약"],"낙찰결과")}<div style="flex-grow: 1;"></div><span style="font-size: 12px; color: {MUTED};">낙찰: 개찰일 기준 · 하루 약 11만 투찰 행</span></div>'
       f'<div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px;">{field("검색어","사업명, 공고번호, 기관명",True)}{field("공고기관 (선택)","공고기관 또는 수요기관",True)}<div style="display: flex; flex-direction: column; gap: 6px;">{label("업무구분")}{seg(["전체","물품","용역","공사","외자"],"전체")}</div></div>'
       f'<div style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 12px; align-items: end;">{field("시작일","2026-08-25")}{field("종료일","2026-08-25")}<div style="display: flex; flex-direction: column; gap: 6px;">{label("빠른 기간")}<div style="display: flex; gap: 6px; flex-wrap: wrap;">{quick}</div></div></div>'
       f'<div style="display: flex; align-items: center; gap: 10px; padding-top: 4px; border-top: 1px solid {LINE};"><span style="font-size: 12px; color: {MUTED};">프리셋</span>{tag("시설 낙찰 · 최근 7일","blue")}{tag("유지보수 용역 · 경북","blue")}<span style="font-size: 12px; color: {SEL_TX}; font-weight: 600;">+ 현재 조건 저장</span></div>',22)+
  f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">'+card(f'<div style="font-size: 14px; font-weight: 600; color: {INK};">최근 검색어</div><div style="display: flex; gap: 6px; flex-wrap: wrap;">{recent}</div>')+card(f'<div style="font-size: 14px; font-weight: 600; color: {INK};">추천 검색어 <span style="font-weight: 400; color: {MUTED};">· 시설 사업 프로필</span></div><div style="display: flex; gap: 6px; flex-wrap: wrap;">'+''.join(f'<div style="display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid {LINE}; background: {PANEL}; font-size: 12px;">{q}</div>' for q in ['시설','전산장비','전산장비','ERP','유지보수','측량'])+'</div>')+'</div>'))

# ---------- Profiles ----------
CATS=[('장비 구매','#9F2F2D','시설 구매, 장비 구매, 전산장비 구매, 시설 도입',''),('유지보수','#956400','유지보수',''),('측량·매핑','#346538','측량, 매핑, 3d',''),('시설 점검','#1F6C9F','점검, 진단, 모니터링, 예찰',''),('교육','#6B4FA3','교육, 양성, 전문인력','시험'),('관제·SW','#0E7490','관제, 플랫폼, 시스템 구축',''),('행사·공연','#9F2F2D','문화행사, 아트쇼, 공연, 행사',''),('시험·인증','#956400','성능시험, 시험, 인증','')]
cat_rows=''.join(f'<div style="display: grid; grid-template-columns: 28px 1.1fr 2.2fr 1.4fr 60px; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid {LINE}; font-size: 13px;"><span style="width: 14px; height: 14px; border-radius: 4px; background: {c};"></span><span style="font-weight: 600; color: {INK};">{n}</span><span class="mono" style="font-size: 12px; color: {TEXT};">{inc}</span><span class="mono" style="font-size: 12px; color: {FAINT};">{ex or "없음"}</span><span style="font-size: 12px; color: {MUTED}; text-align: right;">편집</span></div>' for n,c,inc,ex in CATS)
PROFILES=page(shell('도메인 프로필','', btn('+ 새 프로필','primary'),
  h1('도메인 프로필','내 사업 분야의 분류 규칙과 요건 키워드를 정의합니다. 활성 프로필은 검색 결과에 자동 적용됩니다.')+
  f'<div style="display: grid; grid-template-columns: 280px 1fr; gap: 12px;">'+
  card(f'{label("프로필")}<div style="display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 10px; border-radius: 6px; background: {SEL_BG}; color: {SEL_TX}; font-size: 13px; font-weight: 600;"><span>시설 사업</span>{tag("활성","blue")}</div><div style="display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 10px; border-radius: 6px; font-size: 13px;"><span>소방·안전 장비</span><span style="font-size: 12px; color: {MUTED};">활성화</span></div><div style="height: 1px; background: {LINE};"></div><div style="font-size: 12px; color: {MUTED}; line-height: 1.6;">규칙은 사업명과 기관명에 대해 대소문자 구분 없이 부분 일치합니다. 포함 단어 중 하나라도 맞고 제외 단어가 없으면 분류됩니다.</div>',16)+
  card(f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">{field("프로필 이름","시설 사업")}{field("설명","시설 장비·서비스·교육 관련 조달 분류")}</div>{field("기본 검색어","시설, 전산장비, 전산장비, ERP")}{field("요건 키워드 · 사업명에 있으면 강조","참가자격, 사용사업 등록, 전문인력 증명, 보험, 계약 관련 규정, 사업 승인")}<div style="display: flex; align-items: center; padding-top: 6px;"><span style="font-size: 14px; font-weight: 600; color: {INK};">분류 카테고리 <span class="mono" style="font-weight: 400; color: {MUTED};">8</span></span><div style="flex-grow: 1;"></div>{btn("+ 분류 추가","ghost",30)}</div><div style="display: grid; grid-template-columns: 28px 1.1fr 2.2fr 1.4fr 60px; gap: 12px; font-size: 12px; font-weight: 600; color: {MUTED};"><div></div><div>이름</div><div>포함 단어</div><div>제외 단어</div><div></div></div>{cat_rows}',20)+'</div>'))

# ---------- Keywords ----------
kw_rows=''.join(f'<div style="display: grid; grid-template-columns: 1.2fr 0.6fr 0.6fr 0.6fr 0.8fr 40px; gap: 12px; align-items: center; padding: 11px 16px; border-top: 1px solid {LINE}; font-size: 13px;"><span style="font-weight: 600; color: {INK};">{k}</span><span class="{"mono" if a[0].isdigit() else "txt"}" style="color: {TEXT if a[0].isdigit() else FAINT};">{a}</span><span style="color: {FAINT};">{b}</span><span style="color: {FAINT};">{c}</span><span style="font-size: 12px; color: {MUTED};">{s}</span><span style="color: {FAINT}; text-align: right;">{ico("x",14,FAINT)}</span></div>' for k,a,b,c,s in [('시설','5','점검 전','점검 전','낙찰 08-25 기준'),('전산장비','점검 전','점검 전','점검 전',''),('전산장비','점검 전','점검 전','점검 전',''),('ERP','점검 전','점검 전','점검 전','')])
KEYWORDS=page(shell('관심 키워드','', btn('키워드 점검','primary'),
  h1('관심 키워드','최대 30개 · 점검 시 유형별 최근 구간을 DB에서 대조합니다')+
  card(f'<div style="display: flex; align-items: center; gap: 10px;"><div style="flex-grow: 1; display: flex; align-items: center; height: 38px; padding: 0 12px; border: 1px solid {LINE}; border-radius: 6px; background: {PANEL}; font-size: 13px; color: {FAINT};">키워드 입력 후 Enter</div>{btn("등록","ghost",38)}<span class="mono" style="font-size: 12px; color: {MUTED};">4/30</span></div>',16)+
  f'<div style="border: 1px solid {LINE}; border-radius: 10px; background: {PANEL}; overflow: hidden;"><div style="display: grid; grid-template-columns: 1.2fr 0.6fr 0.6fr 0.6fr 0.8fr 40px; gap: 12px; padding: 10px 16px; background: {PANEL2}; font-size: 12px; font-weight: 600; color: {MUTED};"><div>키워드</div><div>낙찰</div><div>공고</div><div>사전규격</div><div>기준</div><div></div></div>{kw_rows}</div>'+
  card(f'<div style="display: flex; align-items: center; gap: 12px;"><div style="width: 36px; height: 36px; border-radius: 8px; background: #FBF3DB; color: #956400; display: flex; align-items: center; justify-content: center;">{ico("bell",18,"#956400")}</div><div style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 14px; font-weight: 600; color: {INK};">이 키워드로 알림 받기</span><span style="font-size: 13px; color: {MUTED};">새 공고·낙찰이 수집되면 카카오톡, 이메일, Slack, 웹푸시로 보냅니다. 알림 규칙은 설정에서 채널을 연결한 뒤 만들 수 있습니다.</span></div><div style="flex-grow: 1;"></div>{btn("알림 규칙 만들기","ghost")}</div>',16)))

# ---------- Competitors ----------
COMPET=page(shell('경쟁사','', btn('+ 경쟁사 등록','primary'),
  h1('경쟁사','사업자번호 기준으로 투찰 참여·낙찰·계약 실적을 집계합니다')+
  f'<div style="border: 1px solid {LINE}; border-radius: 10px; background: {PANEL}; overflow: hidden;"><div style="display: grid; grid-template-columns: 1.4fr 1fr 0.6fr 0.6fr 0.6fr 1fr 0.7fr 1.2fr 40px; gap: 12px; padding: 10px 16px; background: {PANEL2}; font-size: 12px; font-weight: 600; color: {MUTED};"><div>업체</div><div>사업자번호</div><div style="text-align: right;">투찰 참여</div><div style="text-align: right;">낙찰</div><div style="text-align: right;">계약</div><div style="text-align: right;">낙찰·계약 금액</div><div style="text-align: right;">평균 낙찰률</div><div>주요 발주기관</div><div></div></div>'
  f'<div style="display: grid; grid-template-columns: 1.4fr 1fr 0.6fr 0.6fr 0.6fr 1fr 0.7fr 1.2fr 40px; gap: 12px; align-items: center; padding: 12px 16px; border-top: 1px solid {LINE}; font-size: 13px;"><span style="font-weight: 600; color: {INK};">사인(SAin)</span><span class="mono" style="color: {MUTED};">등록됨</span><span class="mono" style="text-align: right;">1</span><span class="mono" style="text-align: right;">1</span><span class="mono" style="text-align: right;">0</span><span class="mono" style="text-align: right;">62,500,000</span><span class="mono" style="text-align: right; color: {SEL_TX}; font-weight: 600;">88.15%</span><span style="color: {MUTED};">경상북도 경주시</span><span style="text-align: right;">{ico("more",16,FAINT)}</span></div></div>'+
  card(f'<div style="display: flex; align-items: center; gap: 14px;"><div style="width: 40px; height: 40px; border-radius: 8px; background: {PANEL2}; display: flex; align-items: center; justify-content: center;">{ico("users",20,MUTED)}</div><div style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 14px; font-weight: 600; color: {INK};">결과 화면의 낙찰업체를 바로 등록할 수 있습니다</span><span style="font-size: 13px; color: {MUTED};">낙찰 상세의 “낙찰업체를 경쟁사로 등록”을 누르면 사업자번호가 자동으로 채워집니다. 수집 범위가 넓어질수록 집계가 정확해집니다.</span></div></div>',18)))

# ---------- Settings ----------
def toggle(on): return f'<div style="width: 34px; height: 20px; border-radius: 999px; background: {INK if on else LINE}; position: relative;"><div style="position: absolute; top: 2px; {"right" if on else "left"}: 2px; width: 16px; height: 16px; border-radius: 50%; background: #FFFFFF;"></div></div>'
def srow(t, s, right): return f'<div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid {LINE};"><div style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 13px; font-weight: 600; color: {INK};">{t}</span><span style="font-size: 12px; color: {MUTED};">{s}</span></div><div style="flex-grow: 1;"></div>{right}</div>'
SETTINGS=page(shell('설정','', '',
  h1('설정','알림 채널, 데이터 소스, 화면, 백업')+
  f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">'+
  card(f'<div style="font-size: 14px; font-weight: 600; color: {INK};">알림 채널</div>'+srow('카카오톡 나에게 보내기','카카오 계정을 연결하면 즉시 알림을 받습니다',btn('연결','ghost',30))+srow('이메일','developer@example.com',toggle(True))+srow('Slack / Discord 웹훅','팀 채널로 발송',btn('웹훅 추가','ghost',30))+srow('웹푸시','이 브라우저에서 알림 허용',btn('허용','ghost',30)),20)+
  f'<div style="display: flex; flex-direction: column; gap: 12px;">'+card(f'<div style="font-size: 14px; font-weight: 600; color: {INK};">데이터</div>'+srow('낙찰','마지막 수집 2026-08-25 03:00 · 112,183행',tag('정상','green'))+srow('입찰공고','첫 수집 대기',tag('대기','gray'))+srow('계약','첫 수집 대기',tag('대기','gray'))+srow('사전규격','DB 미적재 시 조달청 실시간 조회',tag('실시간','yellow')),20)+card(f'<div style="font-size: 14px; font-weight: 600; color: {INK};">화면</div>'+srow('테마','시스템 설정을 따릅니다',seg(["시스템","라이트","다크"],"시스템"))+srow('밀도','표 행 높이',seg(["보통","조밀"],"보통")),20)+card(f'<div style="font-size: 14px; font-weight: 600; color: {INK};">백업</div>'+srow('프로필·키워드·경쟁사·프리셋','JSON 파일로 내보내고 가져옵니다','<div style="display: flex; gap: 8px;">'+btn('내보내기','ghost',30)+btn('가져오기','ghost',30)+'</div>'),20)+'</div></div>'))

# ---------- Landing (flow, 1440 x 1560) ----------
def feature(title, body, visual, flip=False):
    txt=f'<div style="display: flex; flex-direction: column; gap: 12px; justify-content: center;"><div class="serif" style="font-size: 30px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25; color: {INK};">{title}</div><div style="font-size: 15px; line-height: 1.7; color: {TEXT}; max-width: 46ch;">{body}</div></div>'
    return f'<div style="display: grid; grid-template-columns: {"1.15fr 1fr" if flip else "1fr 1.15fr"}; gap: 48px; align-items: center;">{(visual+txt) if flip else (txt+visual)}</div>'
mini_table=f'<div style="border: 1px solid {LINE}; border-radius: 10px; background: {PANEL}; overflow: hidden; box-shadow: 0 1px 2px rgba(17,17,17,0.03);"><div style="display: grid; grid-template-columns: 1.6fr 0.7fr 0.6fr; gap: 10px; padding: 9px 14px; background: {PANEL2}; font-size: 11px; font-weight: 600; color: {MUTED};"><div>사업명</div><div style="text-align: right;">낙찰률</div><div>분류</div></div>'+''.join(f'<div style="display: grid; grid-template-columns: 1.6fr 0.7fr 0.6fr; gap: 10px; align-items: center; padding: 10px 14px; border-top: 1px solid {LINE}; font-size: 12px;"><div style="font-weight: 600; color: {INK};">{t}</div><div class="mono" style="text-align: right; color: {SEL_TX if r!="미정" else FAINT};">{r}</div><div>{tag(g,k)}</div></div>' for t,r,(g,k) in [('2026년 공공시설 안전점검 용역','88.15%',('시설 점검','blue')),('정보시스템 성능시험 지원','미정',('시험·인증','yellow')),('2026년 지역문화축제 운영 용역','미정',('행사·공연','red'))])+'</div>'
rules_visual=card(f'{label("분류 규칙 · 시설 사업")}'+''.join(f'<div style="display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid {LINE}; font-size: 12px;"><span style="width: 12px; height: 12px; border-radius: 3px; background: {c};"></span><span style="font-weight: 600; color: {INK}; width: 80px;">{n}</span><span class="mono" style="color: {MUTED};">{inc}</span></div>' for n,c,inc,_ in CATS[:4]),18)
alert_visual=card(f'{label("알림 · 2026-08-28 03:12")}<div style="font-size: 13px; font-weight: 600; color: {INK};">시설 · 새 낙찰 5건</div><div style="font-size: 12px; color: {TEXT}; line-height: 1.6;">2026년 공공시설 안전점검 용역 · 경주시 · 낙찰률 88.15%<br>정보시스템 성능시험 지원 · 공공기관 · 추정 4,900만원</div><div style="display: flex; gap: 6px;">{tag("카카오톡","yellow")}{tag("이메일","blue")}{tag("Slack","gray")}</div>',18)
LANDING=page(f'''<div style="width: 1440px; min-height: 1900px; display: flex; flex-direction: column; background: {BG};">
  <div style="display: flex; align-items: center; gap: 28px; height: 64px; padding: 0 64px;">
    <div style="display: flex; align-items: center; gap: 10px;"><div style="width: 26px; height: 26px; border-radius: 6px; background: {INK}; display: flex; align-items: center; justify-content: center;">{ico('search',14,'#FFFFFF')}</div><span style="font-weight: 700; font-size: 14px; letter-spacing: 0.02em; color: {INK};">NARA SEARCH</span></div>
    <div style="display: flex; gap: 22px; font-size: 13px; color: {TEXT};"><span>기능</span><span>데이터</span><span>요금</span></div>
    <div style="flex-grow: 1;"></div>
    <span style="font-size: 13px; color: {TEXT};">로그인</span>{btn('무료로 시작하기','primary',34)}
  </div>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 56px; padding: 72px 64px 56px 64px; align-items: center;">
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <div class="serif" style="font-size: 52px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.12; color: {INK}; text-wrap: balance;">나라장터의 하루 11만 건 투찰 데이터를, 내 분야 기준으로.</div>
      <div style="font-size: 17px; line-height: 1.65; color: {TEXT}; max-width: 44ch;">공고·낙찰·계약·사전규격을 매일 새벽 수집해 두고, 직접 정한 분류 규칙으로 걸러 보여줍니다. 누가 얼마에 낙찰받았는지까지.</div>
      <div style="display: flex; align-items: center; gap: 12px;">{btn('무료로 시작하기','primary',44)}{btn('데모 화면 보기','ghost',44)}</div>
      <div style="font-size: 12px; color: {MUTED};">신용카드 없이 시작 · 조달청 공공데이터 기반</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">{mini_table}<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">{kpi("어제 수집","112,183행","투찰 단위")}{kpi("평균 낙찰률","88.15%","시설 · 08-25")}</div></div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin: 0 64px; border-top: 1px solid {LINE}; border-bottom: 1px solid {LINE};">
    {''.join(f'<div style="display: flex; flex-direction: column; gap: 4px; padding: 22px 24px; {"border-left: 1px solid "+LINE+";" if i else ""}"><span class="mono" style="font-size: 26px; font-weight: 500; color: {INK};">{v}</span><span style="font-size: 13px; color: {MUTED};">{k}</span></div>' for i,(v,k) in enumerate([('112,183','하루 투찰 행 수집'),('1,588','하루 신규 공고'),('4','데이터 소스'),('03:00','매일 갱신')]))}
  </div>
  <div style="display: flex; flex-direction: column; gap: 72px; padding: 80px 64px;">
    {feature('분류는 내가 정한다', '“시설”이라고 다 같은 공고가 아닙니다. 장비 구매, 유지보수, 측량, 점검, 교육처럼 내 사업 단위로 포함·제외 단어를 정하면, 모든 결과에 자동으로 태그가 붙고 그 기준으로 걸러집니다. 프로필은 여러 개 만들어 바꿔 쓸 수 있습니다.', rules_visual)}
    {feature('낙찰가와 투찰업체까지 한 화면에', '낙찰 데이터는 투찰업체 단위로 저장됩니다. 추정가격, 예정가격, 하한율, 낙찰률, 참여 업체를 공고별로 묶어 보여주고, 낙찰업체는 한 번의 클릭으로 경쟁사 목록에 올라갑니다.', mini_table, flip=True)}
    {feature('새벽에 수집하고, 아침에 알려드립니다', '관심 키워드와 프로필 조건에 맞는 새 공고·낙찰이 들어오면 카카오톡, 이메일, Slack, 웹푸시로 보냅니다. 같은 공고를 두 번 보내지 않습니다.', alert_visual)}
  </div>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 48px; margin: 0 64px; padding: 56px 0; border-top: 1px solid {LINE}; align-items: center;">
    <div style="display: flex; flex-direction: column; gap: 10px;"><div class="serif" style="font-size: 30px; font-weight: 600; letter-spacing: -0.02em; color: {INK};">요금</div><div style="font-size: 15px; color: {TEXT}; line-height: 1.7; max-width: 44ch;">개인은 무료로 시작하고, 팀은 워크스페이스 단위로 씁니다. 가격은 정식 출시 때 확정됩니다.</div></div>
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
      {card(f'{label("개인")}<div class="mono" style="font-size: 28px; font-weight: 500; color: {INK};">0원</div><div style="font-size: 13px; color: {TEXT}; line-height: 1.7;">프로필 1개 · 키워드 10개<br>낙찰·공고 조회 · CSV</div>{btn("시작하기","ghost",36)}',22)}
      {card(f'{label("팀")}<div class="mono" style="font-size: 28px; font-weight: 500; color: {INK};">[가격]</div><div style="font-size: 13px; color: {TEXT}; line-height: 1.7;">프로필·키워드 무제한 · 알림 4채널<br>팀 워크스페이스 · 경쟁사 분석</div>{btn("문의하기","primary",36)}',22,f"border-color: {INK};")}
    </div>
  </div>
  <div style="display: flex; align-items: center; gap: 20px; padding: 24px 64px; border-top: 1px solid {LINE}; font-size: 12px; color: {MUTED};"><span>© 2026 NARA SEARCH</span><span>개인정보처리방침</span><span>이용약관</span><div style="flex-grow: 1;"></div><span>데이터 출처: 조달청 나라장터 공공데이터</span></div>
</div>''', h=1560)

# ---------- Login ----------
LOGIN=page(f'''<div style="width: 1440px; height: 900px; display: grid; grid-template-columns: 1.1fr 1fr; background: {BG}; overflow: hidden;">
  <div style="display: flex; flex-direction: column; justify-content: space-between; padding: 40px 56px; background: {PANEL2}; border-right: 1px solid {LINE};">
    <div style="display: flex; align-items: center; gap: 10px;"><div style="width: 26px; height: 26px; border-radius: 6px; background: {INK}; display: flex; align-items: center; justify-content: center;">{ico('search',14,'#FFFFFF')}</div><span style="font-weight: 700; font-size: 14px; letter-spacing: 0.02em; color: {INK};">NARA SEARCH</span></div>
    <div style="display: flex; flex-direction: column; gap: 22px; max-width: 520px;">
      <div class="serif" style="font-size: 40px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.2; color: {INK}; text-wrap: balance;">어제 개찰된 낙찰 1,324건이 이미 정리돼 있습니다.</div>
      {mini_table}
    </div>
    <div style="font-size: 12px; color: {MUTED};">데이터 기준 2026-08-25 · 매일 03:00 갱신</div>
  </div>
  <div style="display: flex; align-items: center; justify-content: center; padding: 40px;">
    <div style="width: 380px; display: flex; flex-direction: column; gap: 18px;">
      <div style="display: flex; flex-direction: column; gap: 6px;"><div style="font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: {INK};">로그인</div><div style="font-size: 13px; color: {MUTED};">처음이신가요? <span style="color: {SEL_TX}; font-weight: 600;">무료로 시작하기</span></div></div>
      {field('이메일','name@company.com',True)}
      <div style="display: flex; flex-direction: column; gap: 6px;"><div style="display: flex; align-items: center;">{label('비밀번호')}<div style="flex-grow: 1;"></div><span style="font-size: 12px; color: {SEL_TX};">비밀번호 찾기</span></div><div style="display: flex; align-items: center; height: 38px; padding: 0 12px; border: 1px solid {LINE}; border-radius: 6px; background: {PANEL}; font-size: 13px; color: {FAINT};">••••••••</div></div>
      {btn('로그인','primary',42)}
      <div style="display: flex; align-items: center; gap: 12px; color: {FAINT}; font-size: 12px;"><div style="flex-grow: 1; height: 1px; background: {LINE};"></div>또는<div style="flex-grow: 1; height: 1px; background: {LINE};"></div></div>
      {btn('이메일로 로그인 링크 받기','ghost',42)}
      <div style="font-size: 12px; color: {MUTED}; line-height: 1.6;">로그인하면 이용약관과 개인정보처리방침에 동의하는 것으로 봅니다.</div>
    </div>
  </div>
</div>''')

# ---------- Mobile (390 x 844) ----------
def mshell(active, title, content, top_right=''):
    tabs=''.join(f'<div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex-grow: 1; font-size: 10px; color: {SEL_TX if t==active else MUTED}; font-weight: {600 if t==active else 400};">{ico(k,22,SEL_TX if t==active else MUTED)}<span>{t}</span></div>' for k,t in [('home','홈'),('search','검색'),('list','키워드'),('more','더보기')])
    return f'''<div style="width: 390px; height: 844px; display: flex; flex-direction: column; background: {BG}; overflow: hidden;">
  <div style="display: flex; align-items: center; gap: 10px; padding: 56px 20px 12px 20px; background: {PANEL}; border-bottom: 1px solid {LINE};"><span style="font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: {INK};">{title}</span><div style="flex-grow: 1;"></div>{top_right}</div>
  <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; overflow: hidden;">{content}</div>
  <div style="display: flex; align-items: flex-start; padding: 10px 8px 26px 8px; background: {PANEL}; border-top: 1px solid {LINE};">{tabs}</div>
</div>'''
mcards=''
for t,no,ag,m,est,fin,rate,(tg,tk) in ROWS[:3]+[ROWS[3]]:
    amt=f'<div style="display: flex; align-items: baseline; gap: 6px;"><span class="mono" style="font-size: 16px; font-weight: 600; color: {INK};">{fin or est}</span><span style="font-size: 11px; color: {MUTED};">{"낙찰 · "+rate if fin else "추정가격"}</span></div>'
    mcards+=f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid {LINE}; border-radius: 10px; background: {PANEL};"><div style="display: flex; align-items: center; gap: 6px;">{tag("낙찰","blue")}{tag(tg,tk)}<div style="flex-grow: 1;"></div><span class="mono" style="font-size: 11px; color: {MUTED};">08-25</span></div><div style="font-size: 14px; font-weight: 600; color: {INK}; line-height: 1.4;">{t}</div><div style="font-size: 12px; color: {MUTED};">{ag} · {m.split(" · ")[1]}</div>{amt}</div>'
MRESULTS=page(mshell('검색','결과 <span class="mono" style="font-size: 13px; font-weight: 400; color: '+MUTED+';">4</span>', f'<div style="display: flex; gap: 6px; overflow: hidden;">{tag("낙찰결과","blue")}{tag("08-25","gray")}{tag("시설","gray")}{tag("시설 사업","gray")}</div>{mcards}', btn(ico('download',16,TEXT),'ghost',32)), 390, 844)
MHOME=page(mshell('홈','대시보드', f'<div style="font-size: 13px; color: {MUTED};">어젯밤 03:00 갱신 · 낙찰 1,324건</div><div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">{kpi("관심 키워드 히트","5건","시설 · 낙찰")}{kpi("마감 임박","3건","7일 이내")}</div>'+card(f'<div style="font-size: 14px; font-weight: 600; color: {INK};">마감 임박</div>'+''.join(f'<div style="display: flex; flex-direction: column; gap: 3px; padding: 10px 0; border-top: 1px solid {LINE};"><div style="font-size: 13px; font-weight: 600; color: {INK}; line-height: 1.4;">{t}</div><div style="display: flex; gap: 8px; font-size: 12px;"><span style="color: {MUTED};">{ag}</span><span class="mono" style="color: {"#9F2F2D" if "09-01" in d else TEXT};">{d}</span></div></div>' for t,ag,d,_ in DEADLINES),14)+f'<div style="font-size: 12px; color: {MUTED}; text-align: center;">데이터 소스 상태는 더보기에서</div>', btn(ico('bell',18,TEXT),'ghost',32)), 390, 844)
MSEARCH=page(mshell('검색','검색', f'<div style="display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 14px; border: 1px solid {LINE}; border-radius: 8px; background: {PANEL}; font-size: 14px; color: {FAINT};">{ico("search",18,MUTED)}사업명, 공고번호, 기관명</div><div style="display: flex; gap: 6px; flex-wrap: wrap;">{seg(["낙찰","공고","사전규격","계약"],"낙찰")}</div><div style="display: flex; flex-direction: column; gap: 6px;">{label("기간")}<div style="display: flex; gap: 6px; flex-wrap: wrap;">{quick}</div></div><div style="display: flex; flex-direction: column; gap: 6px;">{label("업무구분")}{seg(["전체","물품","용역","공사"],"전체")}</div>{btn("조회","primary",44)}'+card(f'<div style="font-size: 13px; font-weight: 600; color: {INK};">최근 검색어</div><div style="display: flex; gap: 6px; flex-wrap: wrap;">{recent}</div>',14)), 390, 844)

# ---------- write ----------
files={'Main.dc.html':MAIN,'Dashboard.dc.html':DASH,'Search.dc.html':SEARCH,'Profiles.dc.html':PROFILES,'Keywords.dc.html':KEYWORDS,'Competitors.dc.html':COMPET,'Settings.dc.html':SETTINGS,'Landing.dc.html':LANDING,'Login.dc.html':LOGIN,'MobileHome.dc.html':MHOME,'MobileResults.dc.html':MRESULTS,'MobileSearch.dc.html':MSEARCH}
for k,v in files.items(): open(k,'w').write(v)
X=1540
canvas={'pages':[{'id':'page-1','name':'데스크톱'},{'id':'page-2','name':'랜딩 · 로그인 · 모바일'},{'id':'page-3','name':'방향 탐색 (보관)'}],
 'artboards':[
  {'file':'Dashboard.dc.html','title':'대시보드 홈','x':0,'y':0,'w':1440,'h':900,'page':'page-1'},
  {'file':'Main.dc.html','title':'결과','x':X,'y':0,'w':1440,'h':900,'page':'page-1'},
  {'file':'Search.dc.html','title':'검색','x':2*X,'y':0,'w':1440,'h':900,'page':'page-1'},
  {'file':'Profiles.dc.html','title':'도메인 프로필','x':0,'y':1040,'w':1440,'h':900,'page':'page-1'},
  {'file':'Keywords.dc.html','title':'관심 키워드','x':X,'y':1040,'w':1440,'h':900,'page':'page-1'},
  {'file':'Competitors.dc.html','title':'경쟁사','x':2*X,'y':1040,'w':1440,'h':900,'page':'page-1'},
  {'file':'Settings.dc.html','title':'설정','x':0,'y':2080,'w':1440,'h':900,'page':'page-1'},
  {'file':'Landing.dc.html','title':'랜딩','x':0,'y':0,'w':1440,'h':1900,'page':'page-2','print':'flow'},
  {'file':'Login.dc.html','title':'로그인','x':X,'y':0,'w':1440,'h':900,'page':'page-2'},
  {'file':'MobileHome.dc.html','title':'모바일 · 홈','x':X,'y':1040,'w':390,'h':844,'page':'page-2'},
  {'file':'MobileResults.dc.html','title':'모바일 · 결과','x':X+480,'y':1040,'w':390,'h':844,'page':'page-2'},
  {'file':'MobileSearch.dc.html','title':'모바일 · 검색','x':X+960,'y':1040,'w':390,'h':844,'page':'page-2'},
  {'file':'DirectionB.dc.html','title':'B · 다크·핑크 (미채택)','x':0,'y':0,'w':1440,'h':900,'page':'page-3'},
  {'file':'DirectionC.dc.html','title':'C · 밝은 SaaS (미채택)','x':X,'y':0,'w':1440,'h':900,'page':'page-3'}],
 'annotations':[
  {'id':'sys','x':0,'y':-320,'w':720,'page':'page-1','text':'방향 A 확정 · 디자인 시스템\n바탕 #F7F6F3 / 패널 #FFFFFF / 경계 #EAEAEA / 잉크 #111111 / 본문 #2F3437 / 보조 #787774\n포인트색 하나: 선택 상태 #E1F3FE·#1F6C9F. 태그는 파스텔(연녹·연노랑·연파랑·연빨강·회색).\n글꼴: IBM Plex Sans KR(UI) · IBM Plex Mono(숫자·번호, tabular) · Hahmlet(랜딩·로그인 제목)\n버튼: #111 솔리드 6px · 고스트는 1px 경계. 카드 10px, 내부 요소 6px. 그림자 없음.\n데이터는 전부 2026-08-25/26 실측값. “점검 전”, “미수집”은 아직 없는 데이터를 정직하게 표시한 것.'},
  {'id':'mob','x':X,'y':930,'w':560,'page':'page-2','text':'모바일: 하단 탭 4개(홈·검색·키워드·더보기), 표는 카드로 전환, 상태 표시줄·키보드는 실제 기기 것이 올라오므로 그리지 않음.'},
  {'id':'land','x':0,'y':-200,'w':600,'page':'page-2','text':'랜딩: 한 문장 제안 + 단일 CTA(무료로 시작하기) 반복. 숫자는 실측(112,183행/일 등). 팀 요금은 [가격] 자리표시자.'}],
 'launch':{'view':'canvas','page':'page-1'}}
json.dump(canvas, open('canvas.json','w'), ensure_ascii=False, indent=1)
print('ok', len(files), 'artboards')
