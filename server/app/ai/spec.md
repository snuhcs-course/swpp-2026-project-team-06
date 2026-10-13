# server/app/ai spec

> 구현하는 기능: FEAT-03(초안 생성), FEAT-13(문의 응답) · I2: FEAT-17(출하 문장 해석) · 지키는 규칙: M-05, M-06, M-07, M-08, M-10, M-11, M-12, M-15, M-18, N-04, N-05, N-08 · 인수 조건: AC-03-1~3, AC-13-1~4 · I2: AC-17-1, AC-13-5(M-17)
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-03·13·17, rules.md (여기에 다시 쓰지 않는다)
> 흐름: docs/spec/tech-design/stack.md 5장 "AI 호출", ADR 0004

## 역할
Claude API 호출 어댑터. 상품 초안, 문의 응답 두 작업(I2에 출하 문장 해석)의 입력 정리·호출·출력 검증·기록을 맡는다.

## 구조
- `router.py` — prefix `/ai`. 앱에 직접 여는 경로는 두지 않을 예정(기능 API는 catalog·messaging·orders가 연다). 등록만 해 둔다.
- `models.py` — 담당 엔티티: 없음(AI 기록은 Langfuse. 초안 저장은 catalog의 `ProductDraft`)
- `schemas.py` — 작업별 입력·출력 JSON 형식(Pydantic)
- `service.py` — 공통 Claude client와 `draft_product(...)`, `answer_question(...)` 어댑터. `parse_shipping(...)`(FEAT-17)은 I2
- `grounding.py` — 한국어 중량·숫자·날짜 정규화, 초안 필드와 모델 답변의 근거 검증

## 계약
- **어댑터 한 곳**: Claude 호출은 이 모듈의 service에서만 한다. 다른 모듈은 모델 이름·SDK를 모른다. 모델은 `claude-haiku-4-5`(ADR 0004), 이름은 설정값.
- **개인정보 제거(M-18)**: 보내기 전에 연락처·주소·계좌를 지운다. 주문 상태·배송 예정 기간처럼 답에 필요한 값만 넘긴다. 받는 사람 이름도 보내지 않는다.
- **JSON·근거 출력**: 작업별 Pydantic 스키마로 받고 형식 오류는 실패로 처리한다. 초안은 원문에서 필드별 근거를 다시 확인해 없는 값만 빈 칸(M-11)으로 두며 가격·예약 기간은 만들지 않는다(M-12). 답변은 실제로 보낸 `sourceRef`만 인용하고 숫자·날짜·금지 주제를 저장 전에 검증한다.
- **시간 제한(N-04)**: 상품·상세 초안은 20초, 문의 응답과 설정 미리보기는 8초다. SDK 재시도는 끄며 문의 실패는 messaging이 ‘농가에 전달’로 처리한다.
- **근거 기록(M-08)**: 실응답 메시지의 `source_refs`, `source_summary`, `settings_version`을 저장한다. Langfuse provider tracing(N-08)은 후속 작업이다.
- 다른 모듈과의 경계
  - catalog(초안 저장), messaging(응답 저장·전달), (I2) orders(출하 확정)가 결과를 받아 저장·반영한다. 이 모듈은 DB에 쓰지 않는다.
- 의존성은 기존 `anthropic`만 사용한다. Langfuse는 DEV-31에서 추가하지 않는다. 설정 이름은 `.env.example`.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | ai 모듈은 저장하지 않고 결과만 돌려준다 | 어댑터만 바꿔 자체 모델로 옮길 수 있게(stack.md 7장) | — |
| 2026-10-08 | `draft_product`는 키가 없거나 형식 오류·네트워크 오류·20초 초과면 None(초안 failed). 가격은 스키마에 없고 `price_mentioned`로 안내만, 연락처는 보내기 전에 가림 | AC-03-2·3, M-12, M-18 | AC-03-3 |
| 2026-10-08 | `answer_question`: DISABLED → 필수 전달 주제 → 등록 사실 규칙(배송비·받는 시기·당도·FAQ·소량 원칙) → 키가 있으면 Claude(근거 JSON 안에서만) → 실패·근거 없음은 HANDOFF. 원칙·FAQ가 정책을 바꾸려 하면 쓰지 않는다 | M-05~M-08·M-15, contracts-1.2 5장 | AC-13-1~3 |
| 2026-10-13 | 공통 Claude client는 재시도 없이 초안 20초·답변 8초를 적용한다. 초안은 kg/키로 계열과 필드별 사실을 원문에 대조하고, 답변은 전송한 문자열 `sourceRef`·한국어 숫자/날짜·예상 당도 표기·금지 주제·농가 1인칭을 검증한다 | N-04, M-06·08·11·15·18 | AC-03-1~3, AC-13-1~3·8 |
| 2026-10-13 | 환불·보상 의도는 AI 설정/방 모드와 무관하게 감지하고 멱등 커밋 결과의 메시지 ID가 요청에서 만든 ID와 같을 때만 개인정보 없는 운영 로그를 남긴다. 미리보기·rollback·경쟁 loser·cached replay는 로그하지 않는다 | M-07·20 | AC-13-7 |
| 2026-10-13 | 과거 `ai:evidence` 참조는 마이그레이션 없이 표시한다. 새 답의 근거는 `product:*`, `order:*`, `farm:faq`, `farm:smallOrderPolicy`, `farm:reservationShippingPolicy` 문자열을 쓴다 | M-08 | AC-13-4 |
