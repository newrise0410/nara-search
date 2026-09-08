# 나라장터 사전규격정보서비스 (HrcspSsstndrdInfoService) v1.0 요약

출처: 조달청 OpenAPI 참고자료 (2025-01-06 배포). 원문 docx는 저장소에 포함하지 않음.

- Base URL: `https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService`
- 인증: `ServiceKey` 쿼리 파라미터 (공공데이터포털 인증키). `type=json`으로 JSON 응답.
- 갱신주기 수시, 30 tps.

## 오퍼레이션

| # | 오퍼레이션 | 설명 |
|---|---|---|
| 1/4/7/10 | `getPublicPrcureThngInfo{Thng,Frgcpt,Servc,Cnstwk}` | 업무별 전체 목록 (inqryDiv 1 등록일시 / 2 등록번호 / 3 변경일시) |
| 2/5/8/11 | `getInsttAcctoThngListInfo{…}` | 기관별 목록 |
| 3/6/9/12 | `getThngDetailMetaInfo{…}` | 품목별 목록 |
| 13~16 | `getPublicPrcureThngInfo{…}PPSSrch` | **나라장터 검색조건 조회** (앱에서 사용) |
| 17~20 | `getPublicPrcureThngOpinionInfo{…}` | 규격서 의견 목록 |

업무구분 접미사: `Thng` 물품, `Frgcpt` 외자, `Servc` 용역, `Cnstwk` 공사.

## PPSSrch 요청 파라미터

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `numOfRows`, `pageNo` | ○ | 페이징 |
| `inqryDiv` | ○ | 1 접수일시 범위, 2 사전규격등록번호, 3 참조번호 |
| `inqryBgnDt`, `inqryEndDt` | inqryDiv=1 | `YYYYMMDDHHMM` |
| `bfSpecRgstNo` | inqryDiv=2 | 사전규격등록번호 |
| `refNo` | inqryDiv=3 | 참조번호 |
| `ntceInsttCd` / `ntceInsttNm` | | 공고기관 코드/명 |
| `dminsttCd` / `dminsttNm` | | 수요기관 코드/명 |
| `prdctClsfcNoNm` | | 품명(사업명) 부분검색 |
| `swBizObjYn` | | SW사업대상여부 (물품·외자·용역만) |
| `dtilPrdctClsfcNo` | | 세부품명번호 (물품·용역만) |

## PPSSrch 응답 항목 (`response.body.items[]`)

| 필드 | 설명 |
|---|---|
| `bfSpecRgstNo` | 사전규격등록번호 (필수) |
| `bsnsDivNm` | 업무구분명 (물품/외자/용역/공사) |
| `refNo` | 참조번호 |
| `prdctClsfcNoNm` | 품명(사업명) |
| `orderInsttNm` | 발주기관명 |
| `rlDminsttNm` | 실수요기관명 |
| `asignBdgtAmt` | 배정예산금액(원) |
| `rcptDt` | 접수일시 `YYYY-MM-DD HH:MM:SS` |
| `opninRgstClseDt` | 의견등록마감일시 |
| `dlvrTmlmtDt`, `dlvrDaynum` | 납품기한일시 / 납품일수 |
| `ofclNm`, `ofclTelNo` | 담당자명 / 전화 |
| `swBizObjYn` | SW사업대상여부 |
| `specDocFileUrl1`~`5` | 규격문서 파일 URL |
| `prdctDtlList` | 물품상세목록 `[순번^세부품명번호^세부품명],[…]` (공사 없음) |
| `rgstDt`, `chgDt` | 등록/변경일시 |
| `bidNtceNoList` | 연계 입찰공고번호 목록 (쉼표 구분) |

## 의견 조회 응답 (`getPublicPrcureThngOpinionInfo…`)
`bfSpecRgstNo, refNo, opninNo, rplyNo, opninTitl, mkngCorpNm, mkrNm, inptDt, mkrTel, mkrEmail, specDocOpninFileUrl1~5, opninCntnts`

## 에러코드
| 코드 | 의미 |
|---|---|
| 00 | 정상 |
| 01/02/04/05 | 제공기관 장애 (Application/DB/HTTP/timeout) |
| 03 | 데이터 없음 |
| 06 | 날짜 형식 오류 |
| 07 | 입력범위 초과 |
| 08/11 | 필수값 누락 |
| 10 | ServiceKey 파라미터 없음 |
| 12 | 서비스 없음/폐기 (URL 오류) |
| 20 | 활용승인 안 됨 |
| 22 | 일일 트래픽 초과 |
| 30 | 등록되지 않은 서비스키 (URL 인코딩 확인) |
| 31 | 기한 만료 키 |
| 32 | 미등록 도메인/IP |
