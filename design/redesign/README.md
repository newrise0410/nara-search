# 리디자인 시안 (방향 A · 따뜻한 모노크롬 데이터 대시보드)

캔버스: https://claude.ai/code/artifact/fde6fab5-78bc-4edd-b2da-0d41e5c1d63e

- `gen.py` — 디자인 토큰(색·글꼴·간격)과 공통 크롬(사이드바·상단바·버튼·태그·KPI·표)을 정의하고 12개 아트보드를 생성한다. **토큰과 컴포넌트 규칙의 원본.**
- `*.dc.html` — 생성된 정적 목업. 데스크톱 1440×900(사이드바 228px), 랜딩 1440 flow, 모바일 390×844.
- `canvas.json` — 캔버스 배치.

## 토큰
바탕 `#F7F6F3` · 패널 `#FFFFFF` · 패널2 `#F2F1EE` · 경계 `#EAEAEA` · 잉크 `#111111` · 본문 `#2F3437` · 보조 `#787774` · 흐림 `#A8A6A1`
선택 상태 `#E1F3FE` / `#1F6C9F` (유일한 포인트색)
태그 파스텔: 연녹 `#EDF3EC/#346538` · 연노랑 `#FBF3DB/#956400` · 연파랑 `#E1F3FE/#1F6C9F` · 연빨강 `#FDEBEC/#9F2F2D` · 회색 `#F2F1EE/#787774`
글꼴: IBM Plex Sans KR(UI) · IBM Plex Mono(숫자·번호, tabular-nums) · Hahmlet(랜딩·로그인 제목) — Google Fonts `<link>`
반경: 카드 10px · 컨트롤 6px · 태그 999px. 그림자 없음. 버튼: 기본 `#111` 솔리드, 고스트 1px 경계.
