# 나라장터 공공데이터개방표준서비스 (PubDataOpnStdService) v1.2 요약

출처: 조달청 OpenAPI 참고자료 (v1.0 2025-01 → v1.1 2025-08 계약 기관필터 추가 → v1.2 2026-04 계약 범위 1주일, 2026-06 낙찰 범위 1일).

- Base URL: `https://apis.data.go.kr/1230000/ao/PubDataOpnStdService`
- 인증 `ServiceKey`, `type=json`. 30 tps. 갱신 수시.
- **검색 파라미터가 날짜 범위(+낙찰은 업무구분)뿐** — 키워드·기관 필터는 클라이언트에서 수행해야 함.

## 오퍼레이션 및 범위 제한

| 오퍼레이션 | 필수 파라미터 | 범위 제한 |
|---|---|---|
| `getDataSetOpnStdBidPblancInfo` 입찰공고 | `bidNtceBgnDt`, `bidNtceEndDt` (YYYYMMDDHHMM) | **1개월** |
| `getDataSetOpnStdScsbidInfo` 낙찰 | `bsnsDivCd` (1 물품, 2 외자, 3 공사, 5 용역), `opengBgnDt`, `opengEndDt` | **1일** |
| `getDataSetOpnStdCntrctInfo` 계약 | `cntrctCnclsBgnDate`, `cntrctCnclsEndDate` (YYYYMMDD); 옵션 `insttDivCd`(1 계약기관/2 수요기관) + `insttCd` | **1주일** |

## 입찰공고 응답 항목
`bidNtceNo, bidNtceOrd, refNtceNo, refNtceOrd, ppsNtceYn, bidNtceNm, bidNtceSttusNm, bidNtceDate, bidNtceBgn, bsnsDivNm, intrntnlBidYn, cmmnCntrctYn, cmmnReciptMethdNm, elctrnBidYn, cntrctCnclsSttusNm, cntrctCnclsMthdNm, bidwinrDcsnMthdNm, ntceInsttNm, ntceInsttCd, ntceInsttOfclDeptNm, ntceInsttOfclNm, ntceInsttOfclTel, ntceInsttOfclEmailAdrs, dmndInsttNm, dmndInsttCd, dmndInsttOfcl*, presnatnOprtnYn/Date/Tm/Plce (설명회), bidPrtcptQlfctRgstClseDate/Tm (참가자격등록마감), cmmnReciptAgrmntClseDate/Tm, bidBeginDate/Tm, bidClseDate/Tm (입찰마감), opengDate/Tm/Plce (개찰), asignBdgtAmt (배정예산), presmptPrce (추정가격), rsrvtnPrceDcsnMthdNm, rgnLmtYn, prtcptPsblRgnNm (참가가능지역), indstrytyLmtYn, bidprcPsblIndstrytyNm (투찰가능업종), bidNtceUrl, dataBssDate`

## 낙찰 응답 항목 (투찰업체 1건 = 1행)
`bidNtceNo, bidNtceOrd, bidNtceNm, bsnsDivNm, cntrctCnclsSttusNm, cntrctCnclsMthdNm, bidwinrDcsnMthdNm, ntceInsttNm, ntceInsttCd, dmndInsttNm, dmndInsttCd, sucsfLwstlmtRt (낙찰하한율), presmptPrce, rsrvtnPrce (예정가격), bssAmt (기초금액), opengDate, opengTm, opengRsltDivNm, opengRank (개찰순위), bidprcCorpBizrno, bidprcCorpNm, bidprcCorpCeoNm, bidprcAmt, bidprcRt (투찰율), bidprcDate, bidprcTm, sucsfYn (낙찰여부), dqlfctnRsn (부적격사유), fnlSucsfAmt, fnlSucsfRt, fnlSucsfDate, fnlSucsfCorpNm, fnlSucsfCorpCeoNm, fnlSucsfCorpOfclNm, fnlSucsfCorpBizrno, fnlSucsfCorpAdrs, fnlSucsfCorpContactTel, dataBssDate`

→ 앱에서는 `bidNtceNo+bidNtceOrd`로 그룹화해 공고 1건 + 투찰업체 목록으로 변환.

## 계약 응답 항목
`cntrctNo, untyCntrctNo, cntrctOrd, cntrctNm, bsnsDivNm, cntrctCnclsSttusNm, cntrctCnclsMthdNm, lngtrmCtnuDivNm, cmmnCntrctYn, cntrctCnclsDate, cntrctPrd, cntrctAmt, ttalCntrctAmt, cntrctInfoUrl, bidNtceNo, bidNtceOrd, bidNtceNm, opengDate, opengTm, rsrvtnPrce, prvtcntrctRsn (수의계약사유), bidNtceUrl, cntrctInsttDivNm, cntrctInsttNm, cntrctInsttCd, cntrctInstt*(담당), dmndInsttDivNm, dmndInsttNm, dmndInsttCd, dmndInstt*(담당), rprsntCorpNm, dmstcCorpYn, rprsntCorpCeoNm, rprsntCorpOfclNm, rprsntCorpBizrno, rprsntCorpAdrs, rprsntCorpContactTel, dataBssDate`

## 에러코드
`docs/api/prespec.md`와 동일 (00 정상, 03 데이터 없음, 22 트래픽 초과, 30 잘못된 키, 32 미등록 IP …).

## 실측 (2026-08-26, 운영키)
- `numOfRows=999` 그대로 수용. 응답 필드명은 문서와 완전 일치.
- 범위 경계: 계약 **7일 포함** OK / 8일 → 07 오류. 공고 31·32일 OK. 낙찰 2일 → 07 오류.
- 하루 물량(낙찰, 투찰업체 행 단위): 물품 23,373 · 공사 **77,867** · 용역 9,749 · 외자 4 → 약 11.1만 행/일 ≈ 115페이지.
- 공고 하루 ≈ 1,588건, 30일 ≈ 34,479건. 계약 7일 ≈ 27,370건.
- 오류 응답은 문서와 다른 JSON 래퍼로 온다:
  - 범위/파라미터 오류: `{"nkoneps.com.response.ResponseError":{"header":{"resultCode":"07","resultMsg":"입력범위값 초과 에러"}}}` (HTTP 200)
  - 키/승인 오류: `{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"returnReasonCode":"30","returnAuthMsg":"등록되지 않은 서비스키","errMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}` (HTTP 403)
- 서비스별로 활용신청이 따로 필요하다: 개방표준서비스 승인 키로 사전규격정보서비스를 호출하면 코드 30.

## 구현 메모 (web/src/api/opnstd.ts)
- 기간을 제한 단위(월/일/주)로 청킹 → 동시성 4로 호출 → 진행률 콜백 → 메모리 캐시(청크 단위) → 클라이언트 필터.
- 낙찰 3개월 = 약 90일 × 업무구분 수 호출. 캐시 덕에 같은 기간 내 키워드 변경은 재호출 없음.
