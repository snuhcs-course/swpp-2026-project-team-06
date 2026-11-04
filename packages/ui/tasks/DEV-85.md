## DEV-85 Apply approved Farmclub logo variants

- 이슈: [DEV-85](https://linear.app/sswp6/issue/DEV-85/apply-approved-farmclub-logo-variants-to-app-headers-and-producer)
- 브랜치: `jinumeral/dev-85-apply-approved-farmclub-logo-variants-to-app-headers-and`
- 기능·인수 조건: FEAT-01 / AC-01-3·6, FEAT-06 / AC-06-6, FEAT-14 / AC-14-4, N-02
- 상태: 완료

### 목표
사용자가 최종 검토한 로고 원본과 화면 배치를 실제 앱에 반영하고 별도 PR로 올린다.

### 범위 (수정 허용 경로)
- `packages/ui/assets/brand/**`, `packages/ui/src/BrandLogo.tsx`, `packages/ui/src/{Storefront,index}.tsx` 또는 `index.ts`, `packages/ui/{spec,tasks}.md`
- `apps/consumer/src/app/(tabs)/index.tsx`
- `apps/producer/src/app/(tabs)/index.tsx`, `apps/producer/src/app/login.tsx`, `apps/producer/src/lib/views.tsx` (더 이상 쓰지 않는 Wordmark 제거)
- `docs/design/brand-review/**`, `docs/spec/conversation-ui-1.6.md`, `docs/wiki/Design-Documentation.md`
- `scripts/e2e/brand-logo.spec.ts`

### 비범위
인증·API·DB·배포 설정·잠금파일·기존 다른 작업, 미검토 랜딩/파비콘/공유이미지 재설계.

### 결정 사항
- 10/19 소비자 홈은 글자형으로 통일, 검색 버튼 유지. 생산자 현황은 확대 전 36×40px·좌우 12px·제목 간격 12px로 복원.
- 10/19 로그인 상단의 글자형 제거, ‘계정을 골라/시작하세요’ 오른쪽에 조합형. 172×129px, 제목 30/32px, gap 8px, 조합형 translate(-16,-10) 승인. 카카오 환경의 ‘농가로/시작하세요’에도 동일 배치.
- 10/19 보이는 FARM/CLUB 두 줄을 제목 두 줄과 맞춘 광학 정렬이며 원본 알파와 비율은 보존. 원본 4종을 저장하고 실제 화면은 3종만 사용한다.
- 10/19 사용자 ‘다 푸쉬’ 요청을 승인된 범위의 커밋·push 및 draft PR 생성 승인으로 적용. 별도 worktree로 기존 미커밋 작업을 보존한다.

### 작업
- [x] 공용 로고 및 승인된 세 화면 적용
- [x] 원본 4종·최종 정적 미리보기 보존
- [x] 스펙·영문 디자인 문서 반영
- [x] typecheck, Mock 테스트, 양 앱 웹 export, 실제 화면 검증
- [x] 커밋 전·브랜치 스캔, push 및 draft PR 갱신

### 완료 조건
- [x] 360/390px에서 제목 두 줄·로고 정렬·검색/로그인 버튼이 유지된다.
- [x] 카카오/테스트 로그인과 상태별 접근 제어를 보존한다.
- [x] 관련 로컬 검증 통과 및 draft PR 생성 (원격 CI 별도 확인)
- [x] 사용자 시각 검토 및 최종 승인 확인 (2026-10-19 명시적 머지 지시)

### 기록
- 10/19 origin/main 79eaea7에서 격리 worktree 생성, npm ci 완료. 사용자 승인 배치를 구현 전 기록.
- 10/19 `npm run typecheck`: 4 workspace 통과. `npm run test:mock`: 15 passed, 0 failed. 각 앱의 `npx expo export -p web`: consumer/producer 통과. Node 24.15.0, CI와 동일 major.
- 10/19 `npx playwright test scripts/e2e/brand-logo.spec.ts`: 실제 앱과 격리 Shared Mock에서 360/390px 2 passed. 검색 진입, 생산자 계정 선택·로그인, 현황 심볼 확인. 첫 실행은 기존 공용 helper가 카카오·테스트 버튼을 동시에 선택해 실패했고, 이 spec에서 선택 계정의 정확한 버튼을 쓰도록 수정 후 통과했다.
- 10/19 export 산출물의 카카오 전용 화면: config 응답만 enabled=true로 고정, 360/390px 제목·조합형·카카오 버튼 1개·테스트 계정 숨김·JS 오류 없음 확인. 외부 인가 서버는 호출하지 않았다.
- 10/19 새 Playwright spec 별도 타입 검사(`tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck --types node`) 통과. 원본 PNG 4개의 SHA-256 일치 및 미리보기 로컬 링크 검증 완료.
- 10/19 커밋 전 스캔 지적 없음. BrandHeader에서 logo 미지정 시 기존 헤더를 유지하는 것은 main 6343b24의 공개 API 사용처를 보존한다. 레거시 호환 점검: 후보 0건 — 지적 0건 / 커밋된 구조 0건.
- 10/19 PR #173 draft 생성. 로컬은 관련 앱 검증만 수행했다. 전체 실제 서버/DB 통합은 최신 push의 원격 CI 결과로 구분해 확인한다. Agent 시간/Tokens 미측정.
- 10/19 origin/main 79eaea7 대비 최종 diff 스캔: 범위 이탈·새 버그·미사용 Wordmark 잔재 없음. 원본 4종 외 이전 시안·중간 캡처는 제외했다. 레거시 호환 점검: 후보 0건 — 지적 0건 / 정당 0건. 최신 원격 CI는 이전 실행 뒤 대기 중이며 통과로 표시하지 않는다. Draft·미머지 유지.
- 10/19 head eb84fce의 원격 CI 39225825560에서 apps/server/integration 모두 success 확인. server는 변경 없음으로 실제 서버 검사 생략이며 integration은 실제 서버/DB/Chromium 검사다. 유료 spec-check는 승인 대기로 호출하지 않았다.
- 10/19 사용자가 로고 시각 검토 후 명시적으로 main 머지를 지시했다. 이를 최종 사람 승인으로 기록하며 GitHub의 별도 Approve 리뷰를 대신 작성하지 않는다. 기존 비범위였던 main 머지를 이번 지시에 따라 허용한다.
- 10/19 최신 origin/main abe28df를 충돌 없이 병합했다. 이후 typecheck 4 workspace, Mock 15 passed, 로고 화면 E2E 2 passed 재확인. 최종 브랜치 스캔 이슈 없음. 레거시 호환 점검: 후보 0건 — 지적 0건 / 정당 0건. 실제 squash merge 결과는 PR #173에서 확인한다.

