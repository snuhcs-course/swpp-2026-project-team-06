## DEV-97 소비자 채팅 AI가 상품 페이지에서 연 채팅의 상품을 모름
- 이슈: [DEV-97](https://linear.app/sswp6/issue/DEV-97)
- 브랜치: `zahra/dev-97-chat-product-context`
- 기능·인수 조건: FEAT-13 AC-13-1·AC-13-3, FEAT-12(SCR-04 채팅하기 → SCR-16), M-18
- 상태: 완료

### 목표
AI 근거(`build_evidence`)는 주문 > 지정 상품 > 판매 중 상품 1개 순으로 상품을 고르는데, 소비자 채팅 보내기는 상품을 넘기지 않는다. 판매 중 상품이 2개 이상인 농가(`f-kang`)에서 상품 페이지로 연 채팅의 당도·배송 질문이 등록 정보가 있어도 농가에 전달된다. 상품 페이지에서 연 채팅이 그 상품을 근거로 쓰게 한다.

### 범위 (수정 허용 경로)
- `server/app/messaging/schemas.py`(`SendInput`), `server/app/messaging/service.py`(`consumer_send`, `_evidence`), `server/app/messaging/spec.md`(구현 결정 한 줄), `server/tests/test_messaging.py`, `server/tasks.md`
- `packages/api/src/endpoints.ts`(`messaging.send`), `packages/api/src/mock/conversations.ts`(`send`), `scripts/test-ai-feedback.mjs`, `packages/api/tasks.md`
- `apps/consumer/src/app/(tabs)/products/[productId].tsx`(채팅하기 경로), `apps/consumer/src/app/(tabs)/chats/[farmId].tsx`(보내기), `apps/consumer/tasks.md`
- `docs/spec/screens.md`(보내기 API 행), `docs/wiki/Design-Documentation.md`(보내기 행)

### 비범위 (건드리지 않음)
- `Thread` 모델·Alembic 마이그레이션(상품 문맥을 대화에 저장하지 않음)
- `build_evidence`의 우선순위, 생산자 AI 미리보기(`farms/service.py`), ai 어댑터·프롬프트
- 채팅 목록·주문 상세에서 여는 채팅 경로

### 결정 사항
- 10/20 상품 문맥은 메시지마다 보낸다(사용자 결정). 대화에 저장하지 않아 마이그레이션이 없다. 채팅 목록에서 다시 열면 기존 대체 규칙(판매 중 상품 1개면 그 상품, 아니면 없음).
- 10/20 `productId`는 그 농가의 판매 중(PUBLISHED) 상품만. 아니면 404 `찾을 수 없는 상품이에요.`이고 메시지를 저장하지 않는다(미리보기와 같은 문구). 판매 중이 아닌 상품을 근거로 쓰면 판매하지 않는 상품의 배송 기간을 안내할 수 있어서다.
- 10/20 SWPP-116 wiki 페이지(`docs/wiki/AI-Customer-Support.md`)는 아직 main에 없다(브랜치 `zahra/swpp-116-ai-cs-wiki`). 8절의 이 한계 문구는 이 PR이 먼저 머지되면 SWPP-116 브랜치에서 고치고, 반대면 이 PR에 범위를 추가한다.
- 10/20 주문과 상품이 함께 오면 주문이 이긴다(`build_evidence` 그대로). Mock `preview`는 상품이 주문보다 앞서므로 Mock 보내기는 주문이 없을 때만 상품을 넘긴다.

### 작업
- [x] 서버: `SendInput.product_id`, 검증(다른 농가·미판매 404, 저장 전), `_evidence`에 전달
- [x] pytest: 상품 2개 농가가 지정 상품 당도로 답함 / 상품 없으면 전달 / 다른 농가·미판매 상품 404·메시지 미저장
- [x] `packages/api`: `messaging.send(…, productId?)`, Mock 검증·전달, `test-ai-feedback.mjs` 케이스
- [x] 소비자 앱: 상품 페이지 채팅하기 두 곳이 `productId`를 넘기고 채팅 화면이 보내기에 싣는다
- [x] 문서: screens.md·wiki 보내기 행, `messaging/spec.md` 구현 결정
- [x] SWPP-116 8절 한계 문구(위 결정대로, 머지 순서에 따라) — SWPP-116 브랜치에서 고침(#165)

### 완료 조건
- [x] 이슈 완료 조건(서버 `productId`·404, 소비자 앱 전달, Mock 일치, 문서)
- [x] 테스트 통과: `uv run pytest`, `npm run test:mock`, `npm run typecheck`
- [x] main 머지(I2는 승인 없이 머지하기로 팀 합의) — #197 `f30f0f2`

### 기록
- 10/20 main `1c8ec35`에서 시작.
- 10/20 구현. 시드 대화 f-kang·u-minji는 HUMAN(version 2)이라 테스트에서 AUTO로 돌린다. 새 pytest 3개는 수정 전 코드에서 2개 실패(당도·404), 수정 후 통과. 검증: `uv run pytest` 378 passed, `ruff check` 통과(`ruff format --check`의 14파일은 main에도 있던 것), `npm run test:mock` 16/16, `npm run typecheck` 4개 통과. 남은 일: AI 1차 리뷰.
- 10/20 소비자 앱 Mock 화면 확인(Chrome): 비로그인 → 하우스 감귤 상품 페이지 ‘1:1 채팅’ → 카카오(Mock) 로그인·온보딩 → ‘팔로우하고 대화 시작’ 시트 → 채팅 URL `/chats/f-kang?start=1&productId=p-house` → “당도가 몇이에요?” → AI 안내 ‘등록된 실측 당도는 11.8Brix예요.’ 같은 대화를 상품 없이(`/chats/f-kang`) 열고 같은 질문 → ‘농가에 전달했어요’. 콘솔 오류 0.
- 10/20 AI 1차 리뷰(PR 코멘트): must 없음. should 반영 — 주문+상품 동시 전송 시 주문 우선 테스트 추가(pytest 379 passed). 후속 제안: 전달된 질문에 상품 문맥이 없어 농가가 어느 상품 질문인지 모름(범위 밖). draft 해제, 사람 리뷰 대기.
- 10/23 main(`1256583`)을 병합. 충돌은 문서 5개(tasks.md 3개·`messaging/spec.md`는 양쪽 유지, wiki는 main의 새 API 절에 `productId` 설명을 다시 넣음). 검증: `ruff check` 통과, `uv run pytest` 426 passed, `alembic check` 변경 없음, `npm run test:mock` 32/32, `npm run typecheck` 통과, admin 18/18. `make`는 Xcode 라이선스 미동의로 실행 못 해 같은 명령을 직접 실행. 남은 일: 머지, SWPP-116 8절 문구.
- 10/23 #197 squash 머지(`f30f0f2`), 머지 전 원격 CI 통과(`spec-code-review`는 수동 승인 대기로 미실행). SWPP-116 브랜치에 main을 병합하고 wiki 3·7·8절을 DEV-97에 맞춰 고친 뒤 #165 머지(`93cf7aa`). DEV-97·SWPP-116 Linear Done.

