## DEV-68 무통장 입금: 입금 계좌(SCR-30 하위)·입금 대기 탭·입금 확인·환불 송금(SCR-29)·현황 할 일(SCR-22)
- 이슈: [DEV-68](https://linear.app/sswp6/issue/DEV-68) · 브랜치 `nemodleo/dev-68-dev-무통장-입금소비자-농가-계좌-직접-생산자-계좌` · FEAT-14, FEAT-17 AC-17-7·8, FEAT-09 AC-09-8 · 상태: 진행 중

### 목표
생산자가 입금 계좌를 등록하고, 주문 현황에서 통장과 대조해 「입금 확인」을 누르며, 환불은 송금 뒤 「송금 완료」로 닫는다. 디자인: https://claude.ai/artifact/Pfj8bHERB3FXqH4iD1D6HL

### 범위 (수정 허용 경로)
- `apps/producer/src/app/(tabs)/farm/index.tsx`, `apps/producer/src/app/(tabs)/farm/edit/[field].tsx`, (필요 시) `apps/producer/src/app/(tabs)/farm/account.tsx`
- `apps/producer/src/app/ship.tsx`, `apps/producer/src/app/(tabs)/index.tsx`
- `apps/producer/src/app/(tabs)/products/[id]/edit.tsx` (409 `NO_FARM_ACCOUNT` 안내 한 곳)
- `apps/producer/spec.md`, `apps/producer/tasks.md`

### 비범위
- 가입 신청(SCR-20)에는 계좌를 넣지 않는다. 계좌조회 자동 매칭. 채팅·소식.

### 결정 사항
- 10/18 계좌 입력은 별도 화면 `/farm/account`(은행·계좌번호·예금주 세 칸 한 화면, 미리보기, 저장 56). 프로필 줄 「입금 계좌」에서 진입.
- 10/18 SCR-29 탭: 전체·입금 대기·예약·출하 준비·출하·환불할 것. 입금 대기 줄은 배송지를 보여 주지 않는다(R-15). 「입금 확인」 → 시트 → `confirmDeposit`. 환불할 것 줄은 「송금 완료」 → `refundSettled`.
- 10/18 SCR-22: 제목 아래 할 일 목록(ListRow: 입금 확인 n건 / 환불 송금 n건 / 계좌 등록). 전체 주문 수에 입금 대기 포함.

### 작업
- [x] 농가 프로필 「입금 계좌」 줄 + `/farm/account` 화면
- [x] 현황 할 일 목록
- [x] 주문 현황 입금 대기·환불할 것 탭, 확인 시트, 송금 완료
- [x] 상품 편집 승인 요청 409 `NO_FARM_ACCOUNT` 안내
- [ ] `npm run typecheck`, e2e 통과

### 완료 조건
- [ ] 이슈 완료 조건(생산자 항목) · 테스트 통과 · 리뷰 1명 승인 후 main 머지

### 기록
- 10/18 섹션 작성.
- 10/18 범위 수정: 409 `NO_FARM_ACCOUNT` 안내는 `products/[id]/edit.tsx`가 아니라 승인 요청이 있는 `products/[id]/sales.tsx`에 넣었고, 상태 문구 표 `src/lib/views.tsx`(AWAITING_DEPOSIT) 추가.
- 10/18 AI 1차 리뷰 반영: 취소·입금 안내 재요청 시 만료 검사, 환불 송금 완료는 REFUNDED만, 입금했어요 잠금 순서(상품 → 주문), 입금 안내 화면 만료 리다이렉트를 useEffect로.
- 10/18 구현 완료, typecheck 통과. 결정: 계좌 화면은 `/farm/account`(세 칸 한 화면), SCR-29 탭 6개(전체·입금 대기·예약·출하 준비·출하·환불), 입금 확인 시트는 주황 56 버튼.
- 10/18 박현 피드백 반영: 환불 탭 「환불했어요 ›」 → 확인 시트(아니요 : 환불 완료)로 농가가 환불 완료를 기록, 계좌 화면의 소비자 미리보기 제거, 입금 확인 시트 버튼을 기존 시트처럼 가로 배치.
- 10/18 박현 피드백: 입금 대기·환불 줄의 확인 시트를 없애고 줄 안 ‘미승인’ 1 : ‘승인’ 2로 바꿈. 미승인은 줄 안에 펼침(입금: 입금 대기로 두기/주문 취소, 사유 바로 고르기 3개 + 사유 입력 필수). 줄에 ‘미승인 사유: …’ 표시. AC-09-9·AC-17-8.
- 10/18 박현 피드백: 사유 바로 고르기를 ‘미승인 사유’ 아래 토글(사유 3개 + ‘직접 입력’)로 옮김. 직접 입력을 켜야 입력 칸이 열림. Mock 생산자 앱(크롬)에서 환불 줄 미승인 → 직접 입력 → 보내기 → 줄에 ‘미승인 사유: …’ 확인.
- 10/18 박현 피드백: 사유 선택이 입력 칸과 똑같아 보여 헷갈림 → 사유 선택은 기존 Radio 줄(로그인 계정 고르기 부품), 입력 칸은 ‘직접 입력’을 켰을 때만 ‘사유 직접 쓰기’ 라벨과 함께. Mock 앱(크롬)·Figma에서 확인.
- 10/18 입금 대기 줄 기한이 지나면 ‘· 기한 지남’(입금했다고 알린 주문은 취소되지 않고 남음).

