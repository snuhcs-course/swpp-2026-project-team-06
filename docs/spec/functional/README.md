# farmclub 기능 명세 (I1-P16)

## 기능 파일

| 기능 | 파일 |
| --- | --- |
| FEAT-01 회원가입·로그인 | [FEAT-01-login.md](./FEAT-01-login.md) |
| FEAT-02 농가 프로필 | [FEAT-02-farm-profile.md](./FEAT-02-farm-profile.md) |
| FEAT-03 AI 상품 초안 | [FEAT-03-ai-product-draft.md](./FEAT-03-ai-product-draft.md) |
| FEAT-04 상품·중량 옵션 편집·게시 요청 | [FEAT-04-product-edit.md](./FEAT-04-product-edit.md) |
| FEAT-05 단계·가격·물량 설정 | [FEAT-05-stage-pricing.md](./FEAT-05-stage-pricing.md) |
| FEAT-06 농가 탐색(홈·검색)·팔로우 | [FEAT-06-farm-search-follow.md](./FEAT-06-farm-search-follow.md) |
| FEAT-07 상품 상세 | [FEAT-07-product-detail.md](./FEAT-07-product-detail.md) |
| FEAT-08 예약 주문 | [FEAT-08-reservation-order.md](./FEAT-08-reservation-order.md) |
| FEAT-09 카드 결제(Mock) | [FEAT-09-mock-payment.md](./FEAT-09-mock-payment.md) |
| FEAT-10 주문 내역·상세 | [FEAT-10-order-history.md](./FEAT-10-order-history.md) |
| FEAT-11 출하 전 취소 | [FEAT-11-cancel-before-shipping.md](./FEAT-11-cancel-before-shipping.md) |
| FEAT-12 1:N 소식·1:1 채팅 | [FEAT-12-messaging.md](./FEAT-12-messaging.md) |
| FEAT-13 AI 응답·전달·생산자 답변 | [FEAT-13-ai-reply.md](./FEAT-13-ai-reply.md) |
| FEAT-14 생산자 현황 | [FEAT-14-producer-dashboard.md](./FEAT-14-producer-dashboard.md) |
| FEAT-15 농가 소식 목록·반응 | [FEAT-15-farm-news.md](./FEAT-15-farm-news.md) |
| FEAT-17 출하 처리 | [FEAT-17-shipping.md](./FEAT-17-shipping.md) |
| FEAT-19 농가 링크 공유 | [FEAT-19-farm-link.md](./FEAT-19-farm-link.md) |

규칙 전문: [rules.md](./rules.md)

이 문서는 PRD의 기능(FEAT)과 비즈니스 규칙(R·M)을 구현 수준으로 푼어 쓴 기능 명세다. PRD에는 핵심 원칙만 남기고, 규칙 전문과 기능별 동작·예외·인수 조건은 여기에 둔다.

## 0. 문서 정보

| 항목 | 내용 |
| --- | --- |
| 문서 | farmclub 기능 명세 (Functional Spec) |
| 태스크 | \[I1-P16\] SWPP-20 |
| 상태 | P22 반영 — P0 기능 17개, 인수 조건 62개(I2로 미룬 2개 포함), 열린 질문 9개 모두 결정(3장) |
| 담당 | 박현(PM) |
| 상위 문서 | farmclub PRD (I1-P14). 충돌하면 PRD가 우선한다 |
| 참조 방식 | PRD의 FEAT·R·M ID를 그대로 쓴다. 새 ID를 만들면 PRD 14.2 표기를 따른다 |
| 관련 문서 | 서비스 정책(P17)은 이 규칙을 사용자 문구로, 기술 설계(P19)는 데이터·상태로 옮긴다 |
| 앱 구분 | 소비자 앱과 생산자 앱은 별도 모바일 웹이다. 기능마다 어느 앱의 어느 화면(IA SCR-xx)에서 일어나는지 2장에 적는다 |
| 참조 문서 | PRD v0.6(I1-P14), IA·사용자 흐름(I1-P15), 화면 명세([screens.md](/docs/spec/screens.md), P21·P22), 기술 설계(/docs/spec/tech-design/README.md) |
| 인수 조건 형식 | Given(전제) / When(행동) / Then(결과). 테스트 이름에 AC ID를 넣는다 |

## 2. 기능별 명세

PRD 7.1의 P0 기능 17개를 FEAT ID별로 쓴다. 기능마다 같은 틀을 쓴다: 우선순위·출처, 앱·화면, 목적, 사전 조건, 정상 흐름, 예외 흐름(E), 사후 조건, 입력·검증, 규칙, 인수 조건(AC, Given/When/Then). 화면은 IA의 SCR ID다. 정하지 못한 것은 FQ 번호로 표시하고 3장에 모은다.

### 2.5 추적표

기능 하나가 어느 PRD 시나리오에서 나오고, 어느 화면에서 일어나며, 어떤 규칙을 지키고, 어떤 인수 조건으로 확인하는지 보여준다. 테스트 계획과 코드 리뷰는 이 표를 기준으로 한다. P0 17개, 인수 조건 62개이고, 그중 AC-13-5·AC-17-1은 I2로 미뤘다(I1 테스트 대상 60개).

| FEAT | PRD | 화면 | 규칙 | 인수 조건 |
| --- | --- | --- | --- | --- |
| FEAT-01 | S-1, S-2 | SCR-05, 20, 21 | R-22 | AC-01-1\~5 |
| FEAT-02 | S-1 | SCR-30, 03 | — | AC-02-1\~2 |
| FEAT-03 | S-1 | SCR-24 | M-10\~12 | AC-03-1\~3 |
| FEAT-04 | S-1 | SCR-23, 25 | R-18, 20, 21, 23, 25, M-13 | AC-04-1\~4 |
| FEAT-05 | S-1 | SCR-26 | R-06, 17, 18, 25 | AC-05-1\~3 |
| FEAT-06 | S-2 | SCR-01, 02, 03, 17 | — | AC-06-1\~5 |
| FEAT-07 | S-2 | SCR-04 | R-05, 06, 16, 20, M-15 | AC-07-1\~2 |
| FEAT-08 | S-2 | SCR-10, 17 | R-03, 06, 17, 20, 23 | AC-08-1\~5 |
| FEAT-09 | S-2 | SCR-11, 12 | R-01, 02, 06, 13, 17 | AC-09-1\~3 |
| FEAT-10 | S-2, S-4 | SCR-13, 14, 17 | R-05, 13, 14, 21, 24 | AC-10-1\~3 |
| FEAT-11 | S-4 | SCR-14 | R-07, 08 | AC-11-1\~2 |
| FEAT-12 | S-3 | SCR-03, 04, 15, 16, 18, 27 | M-01\~04, 14, 16 | AC-12-1\~5 |
| FEAT-13 | S-3 | SCR-16, 28 | M-05\~09, 15, 18 (M-17은 I2) | AC-13-1\~5 (AC-13-5는 I2) |
| FEAT-14 | S-4 | SCR-22 | R-15 | AC-14-1\~2 |
| FEAT-15 | S-3 | SCR-01, 03, 18 | M-02, 03, 14 | AC-15-1\~5 |
| FEAT-17 | S-4 | SCR-29 | R-07, 15, 19 | AC-17-1\~5 (AC-17-1은 I2) |
| FEAT-19 | S-1 | SCR-30 | — | AC-19-1\~3 |

표에 없는 규칙은 시스템·운영자 단에서 동작한다. R-04·09·10(자동 환불, FEAT-24, P2), R-11·12(환불 정책), R-14 정산의 실행(FEAT-21, P2)이다.

## 3. 열린 질문

- [x] FQ-01. 카카오 로그인에서 받을 정보(이름·전화번호). 못 받으면 주문서에서 직접 입력 → 결정: 이름만 받고 연락처는 직접 입력. P22: 카카오 로그인은 I2로, I1은 테스트 계정(FEAT-01)
- [x] FQ-02. 판매 중 상품·단계를 고칠 때 다시 승인받아야 하는 범위 → 결정: 가격·옵션·단계만 재승인(R-25)
- [x] FQ-03. 주문서에서 결제까지 물량을 잠시 잡아둘지 → 결정: 잡아두지 않음, 결제 순간 선착순
- [x] FQ-04. 소비자 답장에 사진 첨부를 허용할지 → 결정: 글 + 사진
- [x] FQ-05. 메시지 사진·영상 개수·용량 (기술 설계와 함께) → 결정: 생산자 메시지는 사진 최대 5장(장당 10MB), 영상 1개(60초, 100MB). 소비자 답장은 사진 최대 3장(장당 10MB). 서버에서 다시 검사(stack.md)
- [x] FQ-06. ‘출하 준비’ 상태를 누가 바꾸는지, 아니면 없앨지 → 결정: 생산자가 수확 시작 때 바꿈(FEAT-17)
- [x] FQ-09. (P22) 소식 반응을 I1에 넣는가 → 결정: 넣는다. ‘좋아요’ 하나, 로그인 필요, 한 사람 한 번 토글(FEAT-15)
- [x] FQ-07. 도서산간 여부를 어떻게 판정하는지 → 결정: 생산자가 상품마다 지역을 정하고 주문서에서 자동 적용(R-20)
- [x] FQ-08. AI 초안에 넣을 문구 길이 제한 → 결정: 최대 3,000자(stack.md)

## 4. 변경 이력

| 날짜 | 버전 | 내용 |
| --- | --- | --- |
| 2026-10-07 | 0.5 | P22(SWPP-26): FEAT-01 Mock 로그인, FEAT-06 홈, FEAT-12 소식·채팅 분리와 자동 팔로우, FEAT-15 반응, FEAT-17 상태 변경+송장(자연어는 I2), M-17·AC-13-5 I2, 멱등 키(AC-09-3). 인수 조건 50 → 62개 |
| 2026-10-06 | 0.4 | 기존 docs/specs/i1 문서와 대조해 보강: 배송지 저장(AC-08-5), 동의 문구 버전, 원산지·보관 방법 필수, 마지막 단계 종료일 검증, 팔로우 해제 동작, AI 원문 보존, M-07 주제 추가, M-18(AI 개인정보 제외) |
| 2026-10-06 | 0.3 | 업계 표준 틀로 재작성: 사전·사후 조건, 정상·예외 흐름, 입력·검증 추가. 인수 조건을 Given/When/Then 47개로, 추적표·참조 문서 추가 |
| 2026-10-06 | 0.2 | P0 기능 17개 명세, 열린 질문 FQ-01\~08 중 6개 결정, R-24·25 추가 |
| 2026-10-06 | 0.1 | PRD 7.2 규칙 전문 이관 |
