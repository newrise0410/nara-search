# NARA SEARCH (Next.js)

처음 백엔드를 구성한다면 [루트 README의 구축 가이드](../../README.md)를 먼저 따라 하세요. API별 활용신청, DB 연결, 환경변수, 초기 수집과 오류 대응을 설명합니다.

나라장터 입찰공고·낙찰·사전규격·계약 통합검색. 사용자 커스텀 **도메인 프로필**로 결과를 자동 분류합니다.

```bash
cd ../..
cp apps/web/.env.example apps/web/.env   # NARA_API_KEY와 DATABASE_URL 입력
pnpm install
pnpm --filter web dev
pnpm --filter web test
```

## 데이터 소스 (자체 DB)

브라우저는 `/api/search`를 호출하고, 서버가 Supabase Postgres의 수집 데이터를 `pg_trgm` 검색으로 조회합니다. 사전규격이 DB에 없을 때만 서버에서 조달청 OpenAPI를 실시간으로 조회합니다.

| 조회 유형 | 날짜 기준 | 키워드 검색 |
|---|---|---|
| 입찰공고 | 공고일 | DB 검색(pg_trgm) · 나라장터 실시간(공고명 검색) |
| 낙찰결과 | 개찰일 | DB 검색(pg_trgm) |
| 계약정보 | 계약체결일 | DB 검색(pg_trgm) |
| 사전규격 | 접수일 | DB 검색(pg_trgm), 미적재분 실시간 조회 |

입찰공고는 검색 화면의 **조회 소스** 토글로 `DB` 또는 `나라장터 실시간`을 고를 수 있습니다. 실시간 조회는 조달청 입찰공고정보서비스를 서버에서 직접 호출하며(월 × 업무구분 단위, 최대 12개월), 받은 결과를 같은 요청 안에서 `notices` 테이블에 저장합니다. 낙찰의 공고명 실시간 조회는 현재 구현되어 있지 않습니다. 낙찰 DB 수집에는 공공데이터개방표준서비스를 사용합니다.

워커가 청크 단위로 수집한 결과를 `DATABASE_URL`의 Postgres에 저장하며, 일일 입찰공고 수집은 입찰공고정보서비스를 업무구분별로 우선 사용해 첨부파일 URL과 상세 URL을 `notices`에 저장합니다. `/api/status`에서 수집 상태를 확인할 수 있습니다. `NARA_API_KEY`는 서버 전용 환경변수입니다.

## 인증(Google 로그인)

`/login`의 Google 버튼으로 가입과 로그인을 함께 처리합니다. 계정이 없으면 Supabase가 자동으로 만들고, 앱 DB의 `app_users`에는 사용자 ID와 이메일, 가입 시각, 마지막 로그인 시각만 저장합니다. Google이 Supabase `auth.users`에 보관하는 메타데이터는 앱에서 읽거나 `app_users`로 복사하지 않습니다.

실제 로그인을 연결하려면 다음 외부 설정을 완료하세요.

1. `DATABASE_URL`을 설정한 뒤 저장소 루트에서 `pnpm db:migrate`를 실행하고 `public.app_users` 테이블을 확인합니다.
2. Google Cloud Console에서 웹 애플리케이션 OAuth 클라이언트를 만들고 승인된 리디렉션 URI에 `https://<project-ref>.supabase.co/auth/v1/callback`을 등록합니다. 승인된 JavaScript 원본에는 `http://localhost:3000`과 `https://<프로덕션 도메인>`을 추가합니다.
3. Supabase Dashboard의 `Authentication → Providers → Google`에서 Google 프로바이더를 활성화하고 Client ID와 Client Secret을 저장합니다.
4. Supabase Dashboard의 Authentication → URL Configuration에서 Site URL과 아래 Redirect URLs를 등록합니다.
   - `http://localhost:3000/auth/callback**`
   - `https://<프로덕션 도메인>/auth/callback**`
   - 코드가 붙이는 `?next=...`도 허용되도록 경로 끝의 패턴을 포함합니다.
5. Vercel Production·Preview 환경에 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`가 있는지 확인합니다.

Supabase 프로젝트의 OAuth 콜백 주소는 앱 도메인이 아니라 `https://<project-ref>.supabase.co/auth/v1/callback`입니다. `<프로덕션 도메인>`은 실제 배포 주소로 바꿔 입력하세요.

## 사용자 데이터 동기화

로그인하면 `/api/me/state`에서 계정별 프로필·키워드·경쟁사·프리셋·최근 검색어·테마를 하이드레이트합니다.
변경 사항은 500ms 디바운스 후 해당 슬라이스만 PUT으로 서버에 저장합니다.
서버에 초기화된 데이터가 없으면 최초 1회 기존 브라우저 데이터를 계정으로 업로드합니다.

## 알림

설정에서 카카오톡 나에게 보내기·이메일·Slack/Discord 웹훅·웹푸시 네 가지 채널을 연결하고, 관심 키워드 화면에서 유형·키워드·프로필 카테고리·기관·금액 범위와 발송 주기를 조합한 알림 규칙을 만듭니다. 워커는 `updated_at`이 갱신된 공고·낙찰·사전규격·계약을 규칙과 대조하며, `(규칙, 항목, 채널)` 고유 장부로 같은 알림의 중복 발송을 막습니다. 예약 실행은 기본적으로 꺼져 있습니다. 직접 운영할 때 워커 CLI나 직접 구성한 GitHub Actions로 같은 평가기를 호출할 수 있습니다.

실제 발송에는 `ALERT_SECRET_KEY`와 VAPID 키를 먼저 설정하고, 카카오·Resend·웹푸시 서비스의 외부 콘솔 설정을 완료해야 합니다. `DATABASE_URL`을 설정한 뒤 저장소 루트에서 `pnpm db:migrate`를 실행하고, Vercel과 GitHub Actions Secrets에 `APP_URL`, 채널별 키, VAPID 설정을 등록하세요. `KAKAO_REDIRECT_URI`는 배포 도메인의 `/auth/kakao/callback`으로 지정합니다.

## 구조

- `../../packages/nara-api/src/common.ts` — 공통 응답 파싱, 에러코드, 페이징, 동시성 풀
- `../../packages/nara-api/src/opnstd.ts` — 공공데이터개방표준서비스 v1.2 어댑터
- `../../packages/nara-api/src/prespec.ts` — 사전규격정보서비스 v1.0 어댑터
- `src/server/*` — DB 검색·상태·대시보드·경쟁사 집계와 서버 환경 설정
- `src/app/*` — 랜딩·로그인과 사이드바 앱 셸 라우트
- `src/app/api/*` — 검색·상태·대시보드·경쟁사·Cron API 라우트·사용자 데이터
- `src/app/api/me/*` — 계정별 알림 채널·알림 규칙과 사용자 데이터 API
- `public/sw.js` — 웹푸시 수신·시스템 알림 서비스워커
- `src/store.ts` — 프로필·키워드·경쟁사·프리셋 (서버 저장 + localStorage 캐시)
- `src/components/*View.tsx` — 랜딩 / 로그인 / 대시보드 / 검색 / 결과 / 도메인 프로필 / 관심 키워드 / 경쟁사 / 설정
- `src/components/AppShell.tsx` — 데스크톱 사이드바·상단바와 모바일 하단 탭
- `src/components/ResultsTable.tsx`, `ResultsCards.tsx`, `ResultDetail.tsx` — 결과 표·모바일 카드·상세 패널

## 소스코드 공개와 실행

이 저장소는 개발된 소스코드를 공유합니다. 운영 웹사이트나 사용자 DB, API 키, OAuth 설정은 제공하지 않습니다. Vercel 자동 Git 배포와 예약 Cron은 비활성화되어 있고, GitHub 워크플로 파일은 로컬 전용으로 저장소에서 제외합니다.

직접 실행하려면 본인 소유의 Supabase 프로젝트, 조달청 API 키 및 필요한 알림 서비스를 설정하세요. `.env.example`에는 변수 이름만 있으며, `.env`와 `.env.local`은 커밋하지 않습니다. `NEXT_PUBLIC_*` 값은 브라우저에 공개되므로 비밀키를 넣으면 안 됩니다.

배포하려면 호스팅 프로젝트를 새로 연결하고 환경변수와 OAuth 리디렉션 주소를 본인 도메인으로 설정한 뒤 `vercel.json`의 자동 배포 설정 및 예약 작업을 필요에 맞게 활성화하세요.
