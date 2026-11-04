## DEV-56 / DEV-57 / DEV-58 자료 기반 상세 생성 통합

- 상태: 진행 중. 사용자 2026-10-16 구현 승인. FEAT-03/04, AC-SRC-1~8.
- 브랜치: jinumeral/dev-56-dev-build-producer-source-upload-evidence-review-and-private
- 목표: 업로드→가림→근거 검토→18개 모듈 초안→명시적 상품 적용, Gemini 연결 및 가상 자료 검증.
- 범위: apps/producer/src/**, apps/consumer/src/app/**/products/**, packages/api/src/**, packages/ui/src/**, server/app/{source_analysis,ai,core,catalog}/**, server/app/main.py, packages/ui/assets/source/**, server/migrations/**, server/tests/**, server/.env.example, scripts/**, docs/spec/**, docs/wiki/**, docs/design/sales-templates/** 및 해당 폴더 spec/tasks.
- 비범위: AI CS/채팅·로그인·결제·배포. 기존 사용자 worktree 수정 금지.
- 결정: OpenRouter google/gemini-3.1-flash-lite, OCR 기본/선택 페이지 시각 분석. 고가 모델/OpenAI fallback 비활성. 평가 $1/누적 $5 영속 예약·정산. 기존 detailContent 유지, 별도 moduleDetail 및 상품 version으로 적용. 공개 사진 독립 저장.
- [x] DEV-56 업로드·개인정보·근거·재진입 UI 및 계약
- [x] DEV-57 공통 렌더러·사진 공개 복사·버전/멱등 적용
- [ ] DEV-58 제공자·예산·가상20세트·평가 및 회귀
- 완료 조건: 중요 사실/출처/개인정보 오류0, 명확한 필드95%, 테스트·타입·빌드·브라우저 통과. 실호출 미실행은 구분 기록.
- 기록: 신규 이슈 DEV-56→57→58 생성. 기존 DEV-51/53/54 정정, DEV-52 최신 단일 템플릿 진행 중.

- 2026-10-16 구현/검증: 서버 전체173개 + 추가 회귀2개(신규 파일13개 통과), Ruff, 타입4개, mock12개, 실제 API7개, Chromium22개, 두 앱 웹 빌드 통과. 신규 UI는 360/390/430px에서 저장·재진입·미저장 이탈 확인·적용을 검증했다.
- 실제 Gemini 텍스트16세트 정확일치 precision/recall 1.0, 중요 오류0. 동일 고정 사례로 프롬프트를 개선한 결과이며 홀드아웃 성능이 아니다. 이미지19 추출 보류/PDF20 근거 거부로 시각 품질은 미완료; DEV-58 및 배포를 완료 처리하지 않는다. docs/spec/validation/source-integration-2026-10-16.json 참고.
- 커밋 전 수정: 독립 워커 모델 등록, CRLF 정규화, kg→개수 오분류 차단, 가림 이미지 전환/선택 표시, 미저장 편집 이탈 확인, CI 신규 E2E 활성화. 기존 디자인 worktree는 보존했고 복사본의 미커밋 v1 호환 분기만 제거했다.
- 최종 리뷰 보완: 요청 처리 중 상품명·붙여넣기·근거 문구 입력을 잠가 진행 중 입력 손실을 방지했다. 생산자 타입/웹 빌드 및 자료 E2E 3개 재검증 통과. 추가 커밋 스캔: 레거시 후보0건, 회귀 지적 없음.

### DEV-58 통합 회귀 중 초기 입력 손실 (2026-10-17)
- 범위: 기존 producer src 및 scripts/e2e 범위. 세션 확인 중 Tabs가 guest에서 user key로 다시 만들어져 입력이 사라지는 재현을 수정한다. 로그인/API/AI 채팅 동작은 변경하지 않는다. Tabs는 ready 이후에만 표시하고 기존 초안 E2E에 지연된 auth/me 응답 검증을 추가한다.
- 소비자 배송지 E2E는 주소 응답 전 임시 화면을 isVisible로 판단하던 경쟁을 제거한다. 서버 주소 목록을 받은 뒤 동일한 주소 입력/결제/출하 검증을 수행한다.
- [x] 타입/전체 브라우저 회귀 및 커밋 스캔

- 검증: 4 workspace 타입 검사, 실제 API7개 및 Chromium22개 통과. 세션 응답을 명시적으로 지연시켜 입력창이 준비 후에만 열리는 것을 확인했다. 초기 실패 기록은 .artifacts/main-sync-failure에 보존했다. 추가 커밋 스캔 이슈 없음, 레거시 호환 후보0건.

