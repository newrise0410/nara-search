# NARA SEARCH

나라장터 입찰공고·낙찰·사전규격·계약을 검색하고, 사용자 규칙으로 분류하는 웹 애플리케이션입니다. Next.js 웹/API, 데이터 수집 워커, PostgreSQL 스키마와 테스트를 포함합니다.

이 저장소는 **소스코드 공유용**입니다. 운영 데이터, 개인 계정, 인증키, 이전 개발 기록은 포함하지 않습니다. 자동 배포와 예약 실행은 꺼져 있습니다. 아래 절차로 본인 소유의 서비스를 연결해야 실제 검색·로그인·알림을 사용할 수 있습니다.

## 구축 순서

1. 공공데이터포털에서 아래 API 3종의 활용신청을 완료합니다.
2. Supabase 프로젝트를 만들고 DB 연결과 Google 로그인을 설정합니다.
3. 웹과 워커의 환경변수를 각각 입력하고 DB 마이그레이션을 실행합니다.
4. 짧은 기간의 데이터를 수집한 뒤 로그인·검색을 확인합니다.
5. 필요한 알림 채널을 연결하고, 수동 실행을 확인한 후 예약 실행을 구성합니다.

공식 서비스 링크는 2026-09-08에 확인했습니다. 신청 화면·승인 정책·호출 한도는 각 서비스의 현재 안내가 우선입니다. 아래 명령은 별도 설명이 없으면 **저장소 루트**에서 실행합니다.

## 1. 필요한 서비스와 계정

| 서비스 | 필요한 기능 | 준비할 값 |
|---|---|---|
| 공공데이터포털 | 원본 공고·낙찰·계약·사전규격 수집 | 활용신청이 승인된 인증키 |
| Supabase PostgreSQL | 수집 데이터와 사용자 설정 저장 | DB 접속 문자열과 DB 비밀번호 |
| Supabase Auth + Google OAuth | 현재 웹 앱의 가입·로그인 | 프로젝트 URL, publishable key, Google Client ID/Secret |
| 카카오 개발자 앱 | 선택: 카카오톡 나에게 보내기 | REST API 키, 활성화했다면 Client Secret |
| Resend | 선택: 이메일 알림·조직 초대 메일 | API 키, 인증된 발신 도메인 |
| Slack/Discord | 선택: 웹훅 알림 | 수신 채널의 웹훅 URL |
| Web Push | 선택: 브라우저 알림 | 직접 생성한 VAPID 공개키·비밀키 |

데이터 수집만 하려면 PostgreSQL과 공공데이터 인증키부터 준비하면 됩니다. 현재 웹 인증은 Supabase Auth에 연결되어 있으므로 일반 PostgreSQL만 설치해도 Google 로그인까지 자동으로 구성되는 것은 아닙니다.

## 2. 조달청 API 활용신청

### 신청할 API

공공데이터포털에서 아래 **서비스별로** 활용신청합니다. 키를 발급받은 것과 해당 서비스의 사용 권한이 있는 것은 별개이므로 각 신청 상태를 확인하세요.

| 신청 페이지 | 코드에서 사용하는 기능 | 연결 코드 |
|---|---|---|
| [조달청_나라장터 공공데이터개방표준서비스](https://www.data.go.kr/data/15058815/openapi.do) | 낙찰·투찰업체, 계약 수집, 입찰공고 대체 수집 | [opnstd.ts](packages/nara-api/src/opnstd.ts) |
| [조달청_나라장터 입찰공고정보서비스](https://www.data.go.kr/data/15129394/openapi.do) | 입찰공고 수집, 첨부·상세 링크, 공고명 실시간 검색 | [bidpublic.ts](packages/nara-api/src/bidpublic.ts) |
| [조달청_나라장터 사전규격정보서비스](https://www.data.go.kr/data/15129437/openapi.do) | 사전규격 수집·검색과 의견 조회 | [prespec.ts](packages/nara-api/src/prespec.ts) |

현재 낙찰·계약 수집은 첫 번째 **공공데이터개방표준서비스**를 사용합니다. 별도의 `ScsbidInfoService`나 `CntrctInfoService`만 신청해서는 이 코드의 호출 권한을 대신할 수 없습니다. 낙찰의 공고명 실시간 검색은 현재 구현되어 있지 않습니다.

### 신청과 인증키 설정

1. [공공데이터포털](https://www.data.go.kr/)에 가입·로그인합니다.
2. 위 링크에서 서비스명을 확인하고 **활용신청**을 누릅니다.
3. 신청 화면에 맞춰 개발 목적, 활용 내용, 이용 기간 등을 입력합니다. 활용 내용은 본인이 구축하는 공고 검색·분석 서비스에 맞게 작성합니다.
4. 신청 내역에서 승인 여부와 사용 기간, 허용 트래픽을 확인합니다. 세 서비스가 모두 사용할 키에 연결되어 있는지 확인하세요. 승인·반영에 걸리는 시간은 고정값으로 가정하지 않습니다.
5. 인증정보에 Encoding/Decoding 구분이 있으면 **일반 인증키(Decoding)**를 `NARA_API_KEY`에 입력합니다. 이 코드는 `URLSearchParams`로 요청을 인코딩하므로 미리 인코딩된 키를 넣으면 이중 인코딩될 수 있습니다.
6. `apps/web/.env`와 `apps/worker/.env`에 같은 키를 설정합니다. 현재 설정은 서비스별 개별 키가 아닌 공통 키 한 개를 사용합니다.
7. 대량 수집 전에 각 서비스의 호출 한도를 확인합니다. 개발 한도가 부족하면 활용사례·운영계정·트래픽 증가 신청 절차를 해당 신청 페이지에서 확인합니다.

조회 시간 제한이나 점검 공지도 확인하세요. 과거 조달청 API의 이용 시간 제한 공지가 있었으므로, 연결 실패를 모두 코드 오류로 판단하지 않습니다. [공식 이용 시간 안내](https://www.data.go.kr/bbs/ntc/selectNotice.do?originId=NOTICE_0000000003915)

### 실제 호출 경로

`NARA_BASE_URL`은 기본값인 `https://apis.data.go.kr/1230000`을 사용합니다. 여기에 서비스 경로를 중복해서 붙이지 마세요.

| 용도 | 기본 URL 뒤에 붙는 경로 | 날짜 기준 |
|---|---|---|
| 낙찰 수집 | `/ao/PubDataOpnStdService/getDataSetOpnStdScsbidInfo` | 개찰일, 일 단위 |
| 계약 수집 | `/ao/PubDataOpnStdService/getDataSetOpnStdCntrctInfo` | 계약체결일, 코드에서 최대 1주 단위로 분할 |
| 공고 대체 수집 | `/ao/PubDataOpnStdService/getDataSetOpnStdBidPblancInfo` | 공고일 |
| 공고 기본 수집·실시간 조회 | `/ad/BidPublicInfoService/getBidPblancListInfo{업무구분}PPSSrch` | 공고일, 월 단위 분할 |
| 사전규격 수집·조회 | `/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfo{업무구분}PPSSrch` | 접수일 |

`{업무구분}`은 `Thng`(물품), `Servc`(용역), `Cnstwk`(공사), `Frgcpt`(외자)입니다. CLI의 `--biz-div`도 이 값을 사용합니다. 표준 낙찰 API에 넣는 숫자 코드는 어댑터가 변환합니다.

입찰공고정보서비스가 특정 권한·서비스 오류를 반환하면 워커는 첫 페이지에서 표준서비스로 대체 수집할 수 있습니다. 이 경우 첨부·상세 필드가 부족할 수 있습니다. **공고 수집 성공만으로 세 서비스의 승인이 모두 확인된 것은 아닙니다.**

### DB 저장 없이 API 연결 확인

아래 예제는 워커 환경변수를 읽고 세 서비스에 각각 1행을 요청합니다. 인증키와 원본 응답은 출력하지 않습니다. `00`은 정상, `03`은 조회 결과 없음입니다. 날짜는 한국 시간 기준 어제로 계산합니다.

```sh
node --env-file=apps/worker/.env --input-type=module <<'JS'
const key = process.env.NARA_API_KEY?.trim();
if (!key) throw new Error('NARA_API_KEY를 설정하세요.');
const day = new Date(Date.now() + 9 * 3600000 - 86400000)
  .toISOString().slice(0, 10).replaceAll('-', '');
const base = process.env.NARA_BASE_URL?.trim() || 'https://apis.data.go.kr/1230000';
const requests = [
  ['표준 낙찰', '/ao/PubDataOpnStdService/getDataSetOpnStdScsbidInfo',
    { bsnsDivCd: '5', opengBgnDt: day + '0000', opengEndDt: day + '2359' }],
  ['입찰공고', '/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch',
    { inqryDiv: '1', inqryBgnDt: day + '0000', inqryEndDt: day + '2359' }],
  ['사전규격', '/ao/HrcspSsstndrdInfoService/getPublicPrcureThngInfoServcPPSSrch',
    { inqryDiv: '1', inqryBgnDt: day + '0000', inqryEndDt: day + '2359' }],
];
for (const [name, path, dates] of requests) {
  try {
    const params = new URLSearchParams({ ServiceKey: key, type: 'json', pageNo: '1', numOfRows: '1', ...dates });
    const response = await fetch(base + path + '?' + params, { signal: AbortSignal.timeout(30000) });
    const text = await response.text();
    let code;
    try {
      const data = JSON.parse(text);
      code = data.response?.header?.resultCode
        ?? data['nkoneps.com.response.ResponseError']?.header?.resultCode;
    } catch { /* 인증 게이트웨이는 XML 오류를 반환할 수 있습니다. */ }
    code ??= text.match(/<(?:returnReasonCode|resultCode)>([^<]+)</)?.[1];
    const safeCode = /^\d{2}$/.test(String(code)) ? String(code) : 'unknown';
    console.log(name, 'HTTP', response.status, 'code', safeCode);
    if (!response.ok || !['00', '03'].includes(safeCode)) process.exitCode = 1;
  } catch {
    console.log(name, '연결 실패: DNS·네트워크·이용 시간·시간 초과를 확인하세요.');
    process.exitCode = 1;
  }
}
JS
```

## 3. Supabase와 DB 준비

1. [Supabase Dashboard](https://supabase.com/dashboard)에서 본인 프로젝트를 생성하고 DB 비밀번호를 보관합니다.
2. 프로젝트의 **Connect**에서 PostgreSQL 연결 문자열을 복사합니다. 비밀번호의 특수문자는 URL 형식에 맞게 인코딩해야 합니다.
3. 웹과 워커는 같은 앱 DB를 바라보도록 `DATABASE_URL`을 설정합니다. 이 값은 Supabase HTTPS 프로젝트 URL이나 API 키가 아닙니다.
4. 프로젝트 설정에서 **Project URL**과 **publishable key**를 별도로 복사합니다. 이 두 값은 웹의 Supabase Auth 연결에 사용합니다. Google OAuth Client ID/Secret도 이 값들과 별개입니다.

### 이 코드에 맞는 DB 연결 방식

현재 [DB 클라이언트](packages/db/src/client.ts)는 `postgres` 드라이버의 prepared statements를 비활성화하지 않습니다. 따라서 처음에는 **Direct 5432** 또는 **Session pooler 5432** 연결을 사용하세요. Direct가 IPv6 네트워크 문제로 연결되지 않으면 Session pooler를 확인합니다.

**Transaction pooler 6543을 그대로 사용하지 마세요.** 해당 방식은 prepared statements를 지원하지 않으므로 이를 사용하려면 드라이버에 `prepare: false`를 적용하고 별도 검증해야 합니다. 마이그레이션은 Direct 연결을 우선합니다. [Supabase 연결 방식 문서](https://supabase.com/docs/guides/database/connecting-to-postgres)

### 앱 테이블의 외부 접근

이 앱은 Next.js 서버에서 사용자·조직 권한을 확인한 뒤 PostgreSQL에 직접 접근합니다. 마이그레이션은 앱 전체의 Supabase Data API용 RLS 정책을 구성하지 않습니다. 전용 프로젝트를 새로 구축한다면 **사용하지 않는 Data API를 비활성화**해 앱 테이블의 별도 접근 경로를 닫으세요. Data API도 사용할 계획이라면 노출 스키마·권한·RLS를 별도로 설계해야 합니다. [Supabase API 보호 문서](https://supabase.com/docs/guides/api/securing-your-api)

## 4. 설치와 환경변수

Node.js **24 이상**, 루트 [package.json](package.json)에 지정된 pnpm 버전이 필요합니다. pnpm이 없다면 설치한 Node 환경의 패키지 관리 방식으로 먼저 준비하세요.

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env
cp apps/worker/.env.example apps/worker/.env
```

이미 설정한 `.env`가 있다면 복사 명령으로 덮어쓰지 말고 필요한 항목만 추가합니다.

### 최소 필수값

| 변수 | 설정 위치 | 의미 |
|---|---|---|
| `DATABASE_URL` | 웹 `.env`, 워커 `.env` | 같은 앱 PostgreSQL DB의 연결 문자열 |
| `NARA_API_KEY` | 웹 `.env`, 워커 `.env` | 세 서비스에 승인된 Decoding 인증키 |
| `NARA_BASE_URL` | 웹 `.env`, 워커 `.env` | 기본 `https://apis.data.go.kr/1230000` |
| `NEXT_PUBLIC_SUPABASE_URL` | 웹 `.env.local` | 본인 Supabase 프로젝트의 HTTPS URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 웹 `.env.local` | 해당 프로젝트의 공개 publishable key |
| `APP_URL` | 웹 `.env`, 워커 `.env` | 로컬 `http://localhost:3000`, 운영 시 본인 HTTPS 도메인 |

`apps/web/.env.local`은 다음처럼 직접 만듭니다. 빈 값에 본인 프로젝트의 값을 넣으세요.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Next.js는 웹 폴더의 환경변수를 읽고, 워커는 [env.ts](apps/worker/src/env.ts)에서 **`apps/worker/.env`**를 읽습니다. 웹의 `.env.local`에만 DB/API 키를 넣으면 워커에는 전달되지 않습니다. 셸·호스팅에 이미 설정된 환경변수도 확인하세요.

`NEXT_PUBLIC_*`는 브라우저 번들에 들어갑니다. DB 비밀번호·공공데이터 인증키·Supabase secret/service-role 키·Google Client Secret을 넣으면 안 됩니다. 공개 환경변수를 바꾸면 개발 서버를 재시작하고 운영 빌드는 다시 만듭니다.

### DB 초기화

빈 DB에 아래 명령을 실행합니다. `pg_trgm` 확장과 앱 테이블, `drizzle.__drizzle_migrations` 기록이 생성됩니다. DB 계정에는 스키마·테이블·확장을 만들 권한이 필요합니다.

```sh
pnpm db:migrate
```

성공하면 `migrated`가 출력됩니다. SQL Editor 또는 DB 클라이언트에서 확인합니다.

```sql
select extname from pg_extension where extname = 'pg_trgm';
select count(*) as applied_migrations from drizzle.__drizzle_migrations;
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

적용 개수는 [마이그레이션 목록](packages/db/migrations/meta/_journal.json)의 항목 수와 일치해야 합니다. 기존 데이터가 있는 DB의 업그레이드는 빈 DB 초기화와 다릅니다. 특히 조직 전환 마이그레이션 전후에는 사용자 데이터 백필이 필요하므로 [운영 문서](docs/OPERATIONS.md)와 해당 CLI 구현을 검토하고 백업본으로 먼저 검증하세요.

## 5. Google 로그인 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에서 본인 프로젝트를 선택하고 Google Auth Platform의 앱 정보·대상 사용자·동의 화면을 설정합니다. 테스트 상태라면 테스트 사용자에 사용할 계정을 등록합니다.
2. OAuth 클라이언트를 **웹 애플리케이션** 유형으로 만듭니다.
3. 승인된 JavaScript 원본에 `http://localhost:3000`과 사용할 운영 원본을 추가합니다.
4. 승인된 리디렉션 URI에 Supabase Dashboard가 표시하는 `https://<project-ref>.supabase.co/auth/v1/callback`을 등록합니다.
5. Supabase Authentication의 Google Provider를 활성화하고 Google **Client ID와 Client Secret**을 입력합니다. 이 비밀값은 앱의 공개 환경변수에 넣지 않습니다.
6. Supabase Authentication의 URL Configuration에서 Site URL을 로컬 또는 운영 사이트로 설정하고, 아래 앱 콜백 주소를 허용 목록에 등록합니다.

| 등록 위치 | 로컬 개발 기준 값 | 역할 |
|---|---|---|
| Google OAuth 리디렉션 URI | Supabase가 제공한 `/auth/v1/callback` URL | Google → Supabase |
| Supabase Site URL | `http://localhost:3000` | 기본 복귀 주소 |
| Supabase Redirect URLs | `http://localhost:3000/auth/callback**` | Supabase → 앱, 코드의 `?next=...` 포함 |

운영 시 `http://localhost:3000` 부분을 본인의 정확한 HTTPS 원본으로 바꾼 앱 콜백 패턴도 등록합니다. 포트가 다르면 포트까지 맞춰야 합니다. 위 패턴은 이 코드가 붙이는 `next` 쿼리를 허용하기 위한 것으로, 호스트 전체를 와일드카드로 열 필요는 없습니다. [Google 로그인 공식 가이드](https://supabase.com/docs/guides/auth/social-login/auth-google), [Supabase 리디렉션 매칭 규칙](https://supabase.com/docs/guides/auth/redirect-urls)

```sh
pnpm dev
```

`http://localhost:3000/login`에서 로그인 후 `/dashboard`로 이동하는지 확인합니다. Supabase `auth.users`와 앱의 `public.app_users`에 사용자가 생성되는지도 확인하세요. 앱 콜백은 `app_users` 동기화 오류를 서버 로그에 남기므로, 로그인 성공과 앱 DB 준비 상태를 함께 확인해야 합니다.

## 6. 첫 데이터 수집과 검색 확인

마이그레이션만으로 운영 데이터가 생기지는 않습니다. 아래 날짜는 **명령 형식 예시**이므로 조회할 최근 날짜로 바꾸세요. 처음에는 하루·한 업무구분으로 확인합니다.

```sh
pnpm --filter worker backfill --kind notice --from 2026-09-01 --to 2026-09-01 --biz-div Servc
pnpm --filter worker backfill --kind award --from 2026-09-01 --to 2026-09-01 --biz-div Servc
pnpm --filter worker backfill --kind contract --from 2026-09-01 --to 2026-09-01
pnpm --filter worker backfill --kind prespec --from 2026-09-01 --to 2026-09-01 --biz-div Servc
pnpm --filter worker stats rebuild
```

`--biz-div`는 공고·낙찰·사전규격의 업무구분을 제한합니다. 계약 표준 API는 이 방식의 업무구분 제한을 사용하지 않습니다. `--biz-div`를 생략하면 지원하는 전체 업무구분을 수집합니다.

- 출력의 `pending`, `running`, `exhausted`, `result.failed`와 종료 코드를 확인합니다. 명령이 끝났다는 이유만으로 수집 완료로 판단하지 마세요.
- `WORKER_BUDGET_MS` 또는 `--budget-ms`는 워커 1회 처리 예산입니다. **`backfill`은 여러 번 반복 실행하므로 전체 명령의 시간 상한이 아닙니다.** 짧게 실행하려면 `plan` + `run-once`를 사용합니다.
- `--summary-only`는 낙찰 원본 투찰행을 저장하지 않는 옵션입니다. 업체별 투찰 이력이 필요하면 사용하지 마세요.
- 낙찰은 투찰업체 행까지 수집하므로 긴 기간은 요청 수와 DB 용량이 크게 늘어날 수 있습니다. 먼저 소량 수집 결과를 기준으로 범위를 늘립니다.

수집 예약과 실행을 나누는 예:

```sh
pnpm --filter worker plan --kind notice --from 2026-09-01 --to 2026-09-01 --biz-div Servc
pnpm --filter worker run-once --budget-ms 60000 --max-jobs 1
```

DB와 로그인한 브라우저에서 결과를 확인합니다.

```sql
select count(*) from notices;
select count(*) from awards;
select count(*) from contracts;
select count(*) from prespecs;
select kind, status, count(*) from ingest_jobs group by kind, status order by kind, status;
```

로그인한 브라우저에서 `/api/status`와 `/search`를 엽니다. 수집한 날짜·유형으로 검색해야 결과를 확인할 수 있습니다. `/api/status` 등 보호 API에 로그인 쿠키 없이 요청하면 `401`을 반환합니다. 공고의 실시간 조회는 입찰공고정보서비스를 직접 사용하며, 낙찰·계약 검색은 먼저 수집된 DB를 사용합니다.

## 7. 선택 기능: 알림과 조직 초대

조회가 정상 동작한 뒤 필요한 채널만 설정합니다. 웹과 워커가 모두 사용하는 서버 비밀값은 두 실행 환경에 동일하게 넣습니다. 채널 연결과 수신 대상 선택은 로그인 후 앱의 설정 화면에서 진행합니다.

| 기능 | 환경변수 | 외부 설정 |
|---|---|---|
| 카카오톡 | `KAKAO_REST_API_KEY`, 필요 시 `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`, `ALERT_SECRET_KEY` | 앱 생성, 카카오 로그인 활성화, 메시지 동의, 콜백 등록 |
| 이메일·초대 메일 | `RESEND_API_KEY`, `ALERT_FROM_EMAIL` | 발신 도메인 DNS 인증, 발송 권한 API 키 |
| Slack/Discord | 일반 채널은 앱 설정에 웹훅 URL 저장 | 본인 워크스페이스·서버에서 웹훅 생성 |
| 웹푸시 | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | 같은 키 쌍 유지, 브라우저 알림 허용 |
| 웹푸시 공개키 | 웹에 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 추가 | `VAPID_PUBLIC_KEY`와 같은 값, 변경 시 재빌드 |
| 운영자 오류 알림 | 실행 환경에 `ADMIN_WEBHOOK_URL` | 운영자 전용 수신 웹훅 |

### 카카오톡

[카카오 개발자 콘솔](https://developers.kakao.com/)에서 앱을 만들고 카카오 로그인을 활성화합니다. `talk_message` 동의를 구성하고 `KAKAO_REDIRECT_URI`와 같은 주소를 등록합니다. 로컬 예시는 `http://localhost:3000/auth/kakao/callback`입니다. 메시지에 넣을 사이트 링크도 앱의 제품 링크 설정과 맞춥니다.

이 구현은 로그인한 사용자의 **나와의 채팅**으로 보내는 방식입니다. 카카오 계정 연결 전에 앱의 Google 로그인이 필요합니다. 공개 사용자 대상 이용 권한과 동의 설정은 [카카오 메시지 공식 가이드](https://developers.kakao.com/docs/ko/kakaotalk-message/rest-api)를 확인합니다.

`ALERT_SECRET_KEY`는 카카오 토큰 암호화용 32바이트 hex 값입니다. 로컬에서 생성해 웹·워커에 동일하게 넣고 공개하지 마세요. 교체하면 기존 암호화 토큰을 해독하지 못할 수 있어 계정 재연결이 필요합니다.

```sh
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'));"
```

### 이메일

Resend에서 도메인을 추가하고 안내된 DNS 레코드로 인증합니다. 발송 권한이 있는 API 키를 만들고 `RESEND_API_KEY`에 넣습니다. `ALERT_FROM_EMAIL`에는 인증한 도메인의 발신 주소를 넣습니다. 테스트 도메인의 수신자 제한도 확인하세요. [도메인 인증](https://resend.com/docs/dashboard/domains/introduction), [API 키 생성](https://resend.com/docs/dashboard/api-keys/introduction)

### 웹푸시

아래 명령으로 이 코드가 사용하는 P-256/base64url 형식의 키 쌍을 만듭니다. 출력되는 비밀키는 로컬 환경변수 또는 호스팅의 비밀값 저장소에만 보관합니다.

```sh
node --input-type=module <<'JS'
import { createECDH } from 'node:crypto';
const keys = createECDH('prime256v1');
keys.generateKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.getPublicKey().toString('base64url'));
console.log('VAPID_PRIVATE_KEY=' + keys.getPrivateKey().toString('base64url'));
JS
```

`VAPID_SUBJECT`는 본인 서비스의 연락 URL 또는 `mailto:` 연락처로 설정합니다. 운영 환경은 HTTPS를 사용하고 서비스워커가 등록되는지 확인합니다. 키를 교체하면 기존 구독의 재등록도 확인해야 합니다.

채널과 규칙을 만든 뒤 먼저 발송 없이 평가합니다. 실제 발송은 `--dry-run`을 제거했을 때 수행됩니다.

```sh
pnpm --filter worker alerts run --dry-run
```

## 8. 직접 배포·예약 실행을 구성할 때

이 공개본의 `apps/web/vercel.json`에는 `git.deploymentEnabled: false`가 설정되어 있습니다. `.github/workflows`를 포함한 로컬 자동화 파일은 저장소에 제공하지 않습니다. 이전 운영 서비스와 연결되는 자동 설정은 제공하지 않습니다.

웹은 Next.js 실행을 지원하는 호스팅에 연결합니다. Vercel을 쓰면 Root Directory를 `apps/web`으로 지정하고, 웹 환경변수를 호스팅에 등록한 다음 빌드합니다. 다른 호스팅에서는 저장소 루트에서 다음 명령을 사용합니다.

```sh
pnpm build
pnpm --filter web start
```

운영 도메인으로 `APP_URL`, `NEXT_PUBLIC_SITE_URL`, Google/Supabase 콜백 허용 목록과 선택적으로 `KAKAO_REDIRECT_URI`를 맞춥니다. 본인 프로젝트에서 자동 배포를 원할 때만 `git.deploymentEnabled` 설정을 변경합니다. [Vercel Git 설정](https://vercel.com/docs/project-configuration/git-configuration)

워커는 Node.js 24 환경에서 별도로 실행합니다. GitHub Actions를 사용할 경우 저장소 설정에서 Actions를 활성화하고 직접 작성한 워크플로에 필요한 Secrets를 등록한 뒤 **수동 실행부터** 확인하세요.

| 실행 방식 | 필요한 설정 |
|---|---|
| 워커 직접 수집 | `DATABASE_URL`, `NARA_API_KEY`, 필요 시 `WORKER_BUDGET_MS` |
| 워커 알림 발송 | DB 설정 + `APP_URL` + 사용하는 채널의 비밀값 |
| HTTP Cron/상태 점검 | 웹에 `CRON_SECRET`, 호출자에 동일한 Bearer 토큰 |
| 직접 구성한 GitHub 상태 점검 | `APP_URL`, `CRON_SECRET`, 선택적 `ADMIN_WEBHOOK_URL` |

`/api/cron/ingest`, `/api/cron/alerts`, `/api/cron/health`는 `Authorization: Bearer <CRON_SECRET>`으로 호출합니다. 웹의 수집 엔드포인트는 코드에 300초 실행 시간이 선언되어 있으므로 초기 대량 수집은 워커 CLI에서 진행하세요. 실제 호스팅 한도도 별도로 확인합니다.

일일 수집 → 알림 평가 → 필요 시 보존 정책 정리 → 통계 재집계 순으로 예약할 수 있습니다. 웹 Cron과 워커를 중복 예약하지 않도록 실행 주체를 정하고, UTC/KST 변환·API 허용 시간·호출량을 맞춥니다. 삭제를 수행하는 보존 정책은 먼저 `pnpm --filter worker run prune --dry-run`으로 확인하세요.

## 9. 자주 막히는 지점

| 증상 | 확인할 내용 |
|---|---|
| API `20` / `30` | 서비스별 활용신청 상태, 선택한 키, Decoding 여부, 공백·이중 인코딩 |
| API `22` / `23` | 일일·초당 호출량; 수집 범위와 빈도를 줄이고 필요 시 트래픽 신청 |
| API `31` | 인증키·신청 이용 기간 만료 여부 |
| API `07` / `10` | 요청 파라미터와 날짜 범위; API의 코드와 앱 내부 오류를 구분 |
| HTTP 200인데 실패 | JSON의 `resultCode` 또는 XML 게이트웨이 오류도 확인 |
| 결과가 0건 | 실제 데이터 유무, 수집 날짜와 검색 날짜 기준, 업무구분, DB 수집 여부 |
| Supabase DNS/연결 실패 | 본인 프로젝트 URL 오타, 프로젝트 활성 상태, Direct 연결의 IPv6 지원 |
| DB prepared statement 오류 | 6543 Transaction pooler 사용 여부; 위 DB 연결 방식 참조 |
| `DATABASE_URL` 미설정 | 웹·워커 각각의 환경변수 파일과 실제 실행 환경 |
| `relation does not exist` | 같은 DB에 마이그레이션을 적용했는지, 적용 개수와 서버 로그 |
| Google `redirect_uri_mismatch` | Google에 등록한 URI가 Supabase 콜백인지, 프로젝트가 일치하는지 |
| Google 인증 후 엉뚱한 주소로 복귀 | Supabase Site URL과 앱 콜백·쿼리 패턴, 포트, 운영 도메인 |
| `exchange_failed` | 같은 원본에서 로그인 시작/완료했는지, PKCE 쿠키, HTTPS·프록시·콜백 서버 로그 |
| `/api/status` 401 | 로그인 세션이 필요한 API; Cron 토큰으로 대신 인증하지 않음 |
| Cron 401 / 503 | Bearer 토큰 불일치 / 웹의 `CRON_SECRET` 미설정; DB 누락 여부도 응답에서 확인 |
| 알림이 오지 않음 | 채널 활성화·규칙·수신 주기·평가 실행·서버 로그; 저장만으로 자동 발송되지 않음 |

오류 코드는 [공공데이터포털 서비스 안내](https://www.data.go.kr/data/15129394/openapi.do)의 현재 설명과 함께 확인하세요. 키가 들어간 요청 URL·DB 연결 문자열·OAuth 토큰을 이슈나 로그에 공개하지 마세요.

## 검증과 코드 위치

```sh
pnpm typecheck
pnpm test
pnpm lint
```

자동 테스트는 모의 API와 PGlite 테스트 DB로 실행됩니다. 테스트 통과가 본인 계정의 활용신청 승인·Google OAuth·실제 알림 발송까지 보장하지는 않습니다. 위 연결 확인·소량 수집·로그인 확인은 별도로 수행하세요.

- [웹 구성](apps/web/README.md)
- [워커 CLI](apps/worker/src/cli.ts), [작업 계획](apps/worker/src/plan.ts)
- [DB 스키마](packages/db/src/schema.ts), [마이그레이션](packages/db/migrations/)
- [표준 API](docs/api/opnstd.md), [입찰공고 API](docs/api/bidpublic.md), [사전규격 API](docs/api/prespec.md)
- [운영 참고](docs/OPERATIONS.md)

## 로컬에만 보관하는 파일

`.agents/skills/`, `.claude/skills/`, `.github/workflows/`, `.pnb/`는 개발자 로컬 설정·자동화·작업 기록입니다. `.gitignore`로 제외하며, 소스를 실행하는 데 필수인 파일은 아닙니다. 예약 수집은 위 CLI 명령으로 본인의 스케줄러나 CI에서 직접 구성하세요.
