# 나라장터 입찰공고정보서비스 (BidPublicInfoService) — 실측 기반 요약

문서(docx) 없이 2026-08-28 실호출로 확인한 내용. 키워드 검색이 가능한 유일한 공고 API라 "나라장터 실시간 조회" 모드에 쓴다.

- Base URL: `https://apis.data.go.kr/1230000/ad/BidPublicInfoService`
- 검색 오퍼레이션: `getBidPblancListInfo{Thng|Servc|Cnstwk|Frgcpt}PPSSrch` (물품/용역/공사/외자 — 각각 따로 호출)
- 인증 `ServiceKey`, `type=json`, `numOfRows` 999 수용, `pageNo`.

## 요청 파라미터 (확인된 것)
| 파라미터 | 설명 |
|---|---|
| `inqryDiv` | 1 = 공고일시 범위 |
| `inqryBgnDt`, `inqryEndDt` | `YYYYMMDDHHMM`. **범위 ≤ 1개월** (3개월 → resultCode 07 "입력범위값 초과") |
| `bidNtceNm` | 공고명 부분검색 (예: 시설, 유지보수) |
| (문서 미확인) `ntceInsttNm`, `dminsttNm`, `refNo`, `bidNtceNo` 등 | 표준 PPSSrch 계열과 동일할 가능성 높음 — 사용 전 시험 호출 |

## 응답 항목 (113개 중 앱에서 쓰는 것)
`bidNtceNo, bidNtceOrd, reNtceYn(재공고), ntceKindNm(등록공고/취소공고…), bidNtceDt('YYYY-MM-DD HH:MM:SS'), refNo, bidNtceNm, ntceInsttCd/Nm, dminsttCd/Nm, bidMethdNm(전자시담…), cntrctCnclsMthdNm, sucsfbidMthdNm(낙찰방법), sucsfbidLwltRate(낙찰하한율), ntceInsttOfclNm/TelNo/EmailAdrs, bidQlfctRgstDt(참가자격등록마감), bidBeginDt, bidClseDt, opengDt, opengPlce, presmptPrce(추정가격), asignBdgtAmt(배정예산), VAT, bidNtceDtlUrl(상세 URL), bidNtceUrl, ntceSpecDocUrl1..10 / ntceSpecFileNm1..10(첨부), stdNtceDocUrl, rgnLmtBidLocplcJdgmBssNm(지역제한 기준), prtcptLmtRgnNm?(미확인), indstrytyLmtYn, bidPrtcptLmtYn, pqEvalYn, tpEvalYn, techAbltEvlRt, bidPrceEvlRt, pubPrcrmntLrgClsfcNm/MidClsfcNm/ClsfcNo/ClsfcNm(품명 분류), bfSpecRgstNo(연계 사전규격), purchsObjPrdctList, dcmtgOprtnDt/Plce(설명회), rgstDt, chgDt, chgNtceRsn`
전체 목록은 실호출 결과 참조(113개).

## 오류 응답
표준서비스와 동일: 범위 초과 `{"nkoneps.com.response.ResponseError":{"header":{"resultCode":"07"}}}`, 미승인 키 `OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode` 30/20.

## 실측 규모 (2026-08, 용역, 키워드 없음)
totalCount 11,341 → 999행 × 12페이지.
bfSpecRgstNo(연계 사전규격): 2026-08-20~25 용역 100행 중 70행 채워짐(빈 값은 "") — 013의 정방향 연결 주 경로.

## 낙찰정보서비스 (ScsbidInfoService) — 미승인 (2026-08-28 코드 30)
`/1230000/as/ScsbidInfoService/getScsbidListSttus{Thng|Servc|Cnstwk|Frgcpt}PPSSrch`, `bidNtceNm` 검색 예상. 승인 후 같은 절차로 실측해 추가.
