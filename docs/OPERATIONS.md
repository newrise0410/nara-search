# 운영 메모

## 정체된 수집 잡 (running 리퍼)

`run.ts`의 `STALE_RUNNING_MINUTES=30` — `updated_at`이 30분 이상 갱신되지 않은 `running` 잡은 다음 `run-once`/`backfill`이 다시 선점한다. 정상 실행은 페이지마다 `updated_at`을 갱신하므로 살아 있는 잡을 뺏지 않는다.

확인 SQL:

```sql
select id, kind, status, attempts, deferrals, updated_at from ingest_jobs where status <> 'done' order by updated_at;
```

## 대량 백필 직후 알림 누락 방지

`DEFAULT_MAX_ITEMS = 500`(kind별). 백필로 수만 행의 `updated_at`이 한꺼번에 바뀌면 초과분은 평가되지 않는다. 대응: 백필 직후 `pnpm --filter worker alerts run --since <ISO 8601>`을 시간대를 좁혀 여러 번 실행한다.

## DB 확인 스니펫 (node 대신 tsx)

`@nara/db`는 확장자 없는 TS import를 쓰므로 Node로 직접 실행하면 `ERR_MODULE_NOT_FOUND`가 난다. 아래 형태를 쓴다(008 REVIEW MINOR-1).

```bash
cd apps/worker
./node_modules/.bin/tsx --env-file=.env -e "
import { createDb, notices } from '@nara/db'
async function main() {
  const { db, close } = createDb(process.env.DATABASE_URL!)
  console.log(await db.select().from(notices).limit(1))
  await close()
}
main()
"
```

## 재수집 절차

```sql
update ingest_jobs set status='pending', attempts=0, next_page=1, rows=0, total_count=null where …;
```

## 018 조직 전환 배포 순서

기존 사용자 데이터가 있는 실 DB에서는 0006과 0007 사이에 백필을 실행한다. 순서를 바꾸면 0007의 NOT NULL 적용이 실패할 수 있다.

```bash
cd apps/worker
./node_modules/.bin/tsx src/cli.ts migrate --to 0006
./node_modules/.bin/tsx src/cli.ts orgs backfill
./node_modules/.bin/tsx src/cli.ts orgs backfill
./node_modules/.bin/tsx src/cli.ts migrate
./node_modules/.bin/tsx src/cli.ts alerts run --dry-run
```

두 번째 `orgs backfill`의 `orgsCreated`, `membershipsCreated`, `rows`는 모두 0이어야 한다. 0007 적용 전후 8개 조직 대상 테이블의 행 수가 같고 `org_id IS NULL`이 0건인지 확인한 뒤 즉시 배포한다.

## 019 초대 배포 순서

018의 백필과 0007 적용이 끝난 실 DB에서 0008을 적용한 뒤 웹을 배포한다. 0008은 `org_invites` 테이블과 nullable `user_settings.active_org_id`만 추가하므로 중간에 끊어 적용하지 않는다.

```bash
cd apps/worker
./node_modules/.bin/tsx src/cli.ts migrate
./node_modules/.bin/tsx src/cli.ts alerts run --dry-run
```

배포 후 임시 사용자로 초대 생성·수락·멤버 목록·마지막 소유자 보호·멤버 제거를 확인하고, 임시 `app_users`·`orgs`·`memberships`·`org_invites` 행을 모두 삭제한다. Resend를 사용할 때는 `RESEND_API_KEY`와 `ALERT_FROM_EMAIL`을 웹 환경에 설정하고 설정 화면에서 메일 링크와 수락 흐름을 확인한다.

## 010 관리자 알림·상태 점검

`ADMIN_WEBHOOK_URL`을 워커와 GitHub Actions 환경변수에 설정하면 운영 실패 알림을 관리자 웹훅으로 보낸다. URL이 비어 있으면 알림을 보내지 않고 미설정 로그만 남기므로 개발 환경에서도 명령 자체는 계속 실행된다. Slack 웹훅은 그대로 사용할 수 있고, Discord 웹훅은 URL 뒤에 `/slack`을 붙여 Slack 호환 형식으로 받는다.

관리자 알림 발송 지점은 다음 네 곳이다.

1. 워커 `alerts run`의 알림 평가·발송 실패.
2. 워커 `backfill`의 pending/running 잔류, 시도 횟수 소진 또는 처리 실패.
3. 워커 명령의 처리되지 않은 실행 오류.
4. 별도로 구성한 스케줄러에서 수집·알림 실행 실패나 상태 점검 결과를 확인해 운영자 웹훅으로 보낼 수 있다. 워크플로 파일은 저장소에 포함하지 않는다.

`stale`은 각 수집 종류의 마지막 `done` 시각이 26시간을 초과했다는 뜻이다. 첫 수집 전이라 `lastDoneAt`이 없는 종류는 stale로 보지 않는다. 대시보드의 `데이터 소스` 카드와 상태 점검 응답에서 종류와 경과 시간을 확인하고, 해당 종류의 잡 상태와 최근 실행 로그를 점검한 뒤 필요한 날짜를 재수집한다. `failed` 잡 수만으로는 상태 점검의 `ok`가 false가 되지 않으며, 재시도 전까지 매일 같은 경고가 반복되는 것을 막기 위한 동작이다.

필요한 시크릿은 `ADMIN_WEBHOOK_URL`, `CRON_SECRET`, `APP_URL`이다. `CRON_SECRET`과 `APP_URL`은 HTTP 상태 점검 호출에 사용하며, `ADMIN_WEBHOOK_URL`은 운영자 알림을 사용할 때 설정한다. 직접 구성한 스케줄러와 웹 배포 환경에 맞게 등록한다.

수동 상태 확인:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/health"
```

응답의 `stale` 배열이 비어 있으면 모든 이력 있는 수집 종류가 최근 26시간 안에 완료된 상태다. `alerts`가 `null`이면 알림 실행 이력이 아직 없는 상태다.

## 011 금액 numeric 전환

금액 컬럼을 `numeric(18,2)`로 전환해 외자(Frgcpt) 소수점 금액을 원값으로 보존한다.
012의 `bidder_summary`·015의 `award_stats` 금액 집계가 원값을 전제로 하므로 011을 먼저 적용한다.
테이블 재작성과 잠금 비용은 데이터가 더 커지기 전인 지금이 가장 낮다.

적용 전 오버플로 점검 — 전부 0이어야 한다. 0이 아니면 해당 행 금액을 NULL로 정리한 뒤 진행한다.

```sql
select
  (select count(*) from awards    where greatest(coalesce(estimated_price,0), coalesce(reserved_price,0), coalesce(base_amount,0), coalesce(final_amount,0)) >= 1e16) as awards_over,
  (select count(*) from bidders   where coalesce(amount,0) >= 1e16) as bidders_over,
  (select count(*) from notices   where greatest(coalesce(budget_amt,0), coalesce(estimated_price,0)) >= 1e16) as notices_over,
  (select count(*) from contracts where greatest(coalesce(amount,0), coalesce(total_amount,0), coalesce(reserved_price,0)) >= 1e16) as contracts_over,
  (select count(*) from prespecs  where coalesce(budget_amt,0) >= 1e16) as prespecs_over;
```

배포 순서:

```bash
cd apps/worker
./node_modules/.bin/tsx src/cli.ts migrate   # 0009 적용 — awards·bidders 전체 재작성, ACCESS EXCLUSIVE
```

- 0009는 파티션 부모 1문장이 자식 전부에 전파되므로 자식별 실행이 필요 없다.
- 웹(Vercel) 배포보다 먼저 돌린다. 실시간 조회 write-through(`/api/search?source=live`)가 소수점 금액을 아직 bigint인 컬럼에 넣으면 실패한다.
- 수집 실행 전에 `pnpm --filter worker migrate`로 스키마 적용을 확인한다. 자동 워크플로는 포함하지 않으며, 잠금이 겹치지 않게 수집 시간대는 피한다.

## 012 무료 티어 예산·보존 정책

보존 정책과 용량 예산은 `apps/worker/src/retention.ts`의 `RETENTION`과 `STORAGE_BUDGET_BYTES`에 둔다. 투찰은 7일, 공고는 60일, 계약은 30일을 보존하며 데이터베이스 예산은 500MiB다. 유료 플랜으로 전환할 때는 이 파일만 고친다.

prune은 다음 순서로 실행한다. 요약 선행 생성 → 안전 검사(`PruneSafetyError`) → 월 단위 투찰 파티션 `DROP TABLE` → 남은 범위 `DELETE` → `VACUUM`. `awards`·`companies`·`agencies`·`prespecs`와 사용자 데이터는 절대 지우지 않는다. 직접 구성하는 스케줄러에서도 알림 평가 뒤에 prune을 실행해 그날 수집한 공고·계약이 알림 평가 전에 사라지지 않게 한다.

수동 점검·실행:

```bash
cd apps/worker
./node_modules/.bin/tsx src/cli.ts prune --dry-run    # 삭제 예정 건수만
./node_modules/.bin/tsx src/cli.ts prune              # 실제 실행. stdout JSON 보관
```

삭제 전 반드시 0이어야 하는 SQL(요약 없는 낙찰의 투찰행):

```sql
select count(*) from awards a
where a.opening_date < current_date - 7
  and a.bidder_summary is null
  and exists (select 1 from bidders b
              where b.bid_ntce_no = a.bid_ntce_no and b.award_ord = a.ord and b.opening_date = a.opening_date);
```

용량은 `select pg_size_pretty(pg_database_size(current_database()));`로 확인한다. 파티션 `DROP TABLE` 몫은 즉시 회수되지만 `DELETE` 몫은 `VACUUM` 후에도 파일 크기가 바로 줄지 않고 재사용 공간으로 남는다. `/api/status`의 `storage`와 설정 화면 사용량 바는 같은 값을 본다. 임시로 예산을 바꿔 경고를 시험하려면 웹 환경변수 `STORAGE_BUDGET_BYTES`를 쓴다.

낙찰 3개월 헤더+요약 백필은 사용자가 나중에 실행한다.

```
GitHub → Actions → "낙찰 백필" → Run workflow
  from = <오늘로부터 3개월 전>, to = <어제>, mode = summary-only
```

- 일일 수집(03:10 KST)과 겹치지 않는 시간에 시작한다. `concurrency: backfill`이라 일일 수집을 막지 않는다.
- 하루 4구분 실측은 13분 27초(169 요청, 166,065행)다. 90일이면 약 20시간이므로 timeout 350분 안에 들어가려면 `from`/`to`를 2~3주 단위로 5~6회 나눠 돌린다.
- 끝난 뒤 확인: `select count(*) from awards where opening_date between '<from>' and '<to>';`(API 공고 수와 대조), `select count(*) from bidders where opening_date < current_date - 7;`(0이어야 정상), `select pg_size_pretty(pg_database_size(current_database()));`(예산 대비 여유).
- 백필 직후에는 `updated_at`이 대량으로 갱신되므로 "대량 백필 직후 알림 누락 방지" 절에 따라 `alerts run --since`를 시간대를 좁혀 나눠 돌린다.

## 015 낙찰 통계 재집계

`award_stats`는 낙찰 백필이 끝난 뒤 최신 창으로 한 번 재집계한다. 명령은 지정한 월을 끝 달로 하는 12개월 창으로 테이블 전체를 교체하므로 월별로 반복 실행하지 않는다.

```bash
cd apps/worker
./node_modules/.bin/tsx src/cli.ts stats rebuild --month 2026-08
```

출력의 `sourceRows`, `cells`, `byLevel`, `window`를 보관하고, `byLevel`에 0~4단계가 모두 포함되는지 확인한다. `--month`를 생략하면 awards의 오늘 이전 최신 개찰월을 자동으로 사용한다. awards가 비어 있으면 `{ "skipped": "no-awards" }`를 출력하고 정상 종료한다.

백필을 여러 구간으로 나누어 실행했다면 모든 구간이 끝난 뒤 위 명령을 한 번 더 실행한다. `/api/status`에서 `stats.window`, `stats.cells`, `stats.computedAt`, `stats.stale`을 확인하고, `stats.stale`은 경고용이며 cron health의 `ok` 판정에는 포함되지 않는다.
