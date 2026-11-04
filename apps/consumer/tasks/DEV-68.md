## DEV-68 무통장 입금: 입금 안내(SCR-11)·주문 접수(SCR-12)·입금 대기 상세(SCR-14)
- 이슈: [DEV-68](https://linear.app/sswp6/issue/DEV-68) · 브랜치 `nemodleo/dev-68-dev-무통장-입금소비자-농가-계좌-직접-생산자-계좌` · FEAT-09(개정) AC-09-2·3·7, FEAT-10 · 상태: 진행 중

### 목표
카드 결제 화면을 농가 계좌 입금 안내로 바꾼다. 계좌·입금자명(주문 번호)·기한·판매자 정보·중개자 고지·에스크로 안내를 보여 주고, 「입금했어요」 신호와 입금 대기 상태 표시·취소를 지원한다. 디자인: https://claude.ai/artifact/Pfj8bHERB3FXqH4iD1D6HL

### 범위 (수정 허용 경로)
- `apps/consumer/src/app/checkout/[productId]/{index,pay}.tsx`
- `apps/consumer/src/app/(tabs)/orders/[orderId]/{done,index}.tsx`, `apps/consumer/src/app/(tabs)/orders/index.tsx`
- `apps/consumer/src/lib/{orderText,orderGroups}.ts`
- `apps/consumer/spec.md`, `apps/consumer/tasks.md`

### 비범위
- 카드 입력 화면(#120 DEV-37), PortOne(#124). 알림.

### 결정 사항
- 10/18 SCR-10 하단 버튼 「예약하기」. 성공 시 `orders.deposit(orderId, key)` 호출 후 SCR-11(입금 안내)로. 409는 기존처럼 주문서로 돌아감.
- 10/18 SCR-11 하단 「입금을 마쳤어요」(deposit-reported → SCR-12), 글자 버튼 「나중에 입금할게요」(SCR-12). 「결제」 단어 사용 금지.
- 10/18 SCR-14 입금 대기: 제목 「입금 확인 중」, 4단계 막대 비움, 입금 정보 Row 재표시, 취소는 환불 없이 즉시. 만료 취소·환불 송금(입금했던 계좌로) 문구.
- 10/18 주문 내역 그룹: 입금 대기는 '진행 중'(pending), 취소(CANCELED)는 '취소·환불' 탭.

### 작업
- [x] 주문서 버튼·deposit 호출
- [x] SCR-11 입금 안내 재작성(복사 2개, 기한, 판매자, 고지, 에스크로 접힘)
- [x] SCR-12 입금 확인 중 표(계좌·입금액·기한·복사)
- [x] SCR-14 입금 대기·만료·환불 송금 상태, 취소 시트 문구
- [x] 주문 내역 상태 문구·그룹
- [ ] `npm run typecheck`, e2e checkout 스펙 통과

### 완료 조건
- [ ] 이슈 완료 조건(소비자 항목) · 테스트 통과 · 리뷰 1명 승인 후 main 머지

### 기록
- 10/18 섹션 작성.
- 10/18 구현 완료, typecheck 통과. 결정: DepositCard는 `src/lib/DepositCard.tsx`로 분리(라우트 파일은 default만 export). 입금 대기·취소(CANCELED)도 주문 내역에 보인다(Mock도 동일).
- 10/18 박현 피드백 반영: 입금 정보는 입금액·계좌번호·입금자명만 굵게, 복사는 계좌번호·입금자명 둘만, SCR-12 주문 번호 복사 제거·입금 대기 중 주문 번호/합계 줄 생략, 구매안전서비스 고지는 권유 없는 한 줄. 주문 번호 형식은 FC-MMDD-NNNN 유지(NNNN 무작위).
- 10/18 농가 미승인(AC-09-9·AC-17-8): 주문 상세에 Notice ‘농가가 입금을 확인하지 못했어요 · 사유’/‘환불 송금이 늦어지고 있어요 · 사유’, 내역 카드 ‘입금 확인 안 됨 · 사유를 봐 주세요’·‘환불 송금 늦어짐’.
- 10/18 기한이 지났지만 입금했다고 알린 주문: 주문 상세 문장 ‘입금했다고 알려 주셨어요. 농가 확인이 늦어져 farmclub이 농가에 연락하고 있어요. 주문은 취소되지 않아요.’

