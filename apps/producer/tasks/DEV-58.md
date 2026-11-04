## DEV-58 Gemini OCR 제품 연결 안내 (2026-10-17)
- 사용자 채택 버전을 실제 경로에 연결. 범위: src/lib/SourceWorkspace.tsx, spec.md, tasks.md.
- 이미지/PDF는 가림 승인 후 문자인식에 전송됨을 알리고 기존 선택적 추가 시각 분석 안내와 구분한다. API 계약은 유지한다.

- [x] 전송 안내 반영, 타입4 workspace/mock12개 및 실제 제공자 UI 전체 흐름 검증. 사용자 직접 인수는 대기.

## DEV-58 자료 작업 화면 정리 (2026-10-17)
- 사용자 요청: 분석 상태를 눈에 띄게 표시하고 업로드 사진/파일 썸네일, 기존 생산자 규격의 컴팩트한 화면으로 정리.
- 범위: apps/producer/src/lib/SourceWorkspace.tsx, apps/producer/{spec.md,tasks.md}, scripts/e2e/{source-workspace-ui,source-analysis}.spec.ts, docs/spec/source-integration.md, docs/wiki/Source-Analysis.md.
- 결정: 공용 토큰(20px 좌우/16px 카드/64px 썸네일/48px 터치)을 사용. 진행 상태는 탭 위에서 표시하고 개인정보 승인 대기는 구분한다. 이미지 업로드 직후 로컬 미리보기, 준비 후 권한 보호된 가림 페이지 썸네일. PDF는 준비 후 첫 쪽, TXT는 파일 타일. 연결/삭제·추가 시각 설정은 펼쳐보기로 보존한다. 키/원문을 공개 저장하지 않는다.
- [x] 상태·썸네일·컴팩트 UI 반영 및 브라우저 확인

- 검증: 타입4 workspace/mock12개 통과. 격리 mock API·DB의 source-analysis/source-workspace-ui Playwright6개 통과(360/390/430px 업로드·편집·저장·공개, 진행 상태 전환, 준비 전/후 썸네일, 가로 넘침/콘솔 오류 없음). 최초 격리 환경은 테이블 미생성과 별도 포트 CORS 누락으로 실행 실패해 환경을 수정한 뒤 최종6개 통과. 실제 데모 DB와 유료 호출은 변경하지 않았다.
- scan-before-commit: 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. object URL 해제·가림 이미지 전환·기존 조작 경로 및 신규 테스트 전체 확인.
## DEV-58 새 상품 진입 연결 (2026-10-17)
- 사용자 요청: 새 상품 버튼에서 자료 업로드 화면으로 바로 진입.
- 범위: apps/producer/src/app/(tabs)/products/{new,manual}.tsx, apps/producer/src/lib/SourceWorkspace.tsx, apps/producer/{spec.md,tasks.md}, scripts/e2e/{source-workspace-ui,producer-i2,producer-and-privacy}.spec.ts, docs/spec/source-integration.md, docs/wiki/Source-Analysis.md.
- 결정: 새 비공개 상품 생성 후 연결된 자료 작업을 생성해 업로드 화면을 연다. 기존 입력 경로는 manual로 유지. 같은 effect의 생성 Promise를 공유하고 작업 재시도는 기존 상품과 멱등 키를 사용한다. 상품 정보/판매 설정 이동을 제공한다. 공개/승인은 기존 계약을 유지한다.
- [x] 경로 연결 및 회귀 검증
- 검증: 타입4 workspace, mock12개, 격리 API/DB의 producer-i2/producer-and-privacy/source-analysis/source-workspace-ui Playwright16개 통과(46초). 새 상품 버튼→업로드 직접 진입·동일 상품 기본 정보 편집, batch 실패 시 상품1회 생성·멱등 키 유지 확인. 기존 manual 폼은 이전 커밋 파일과 바이트 동일. 추가 AI 호출 없음.
- scan-before-commit: 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. 신규 진입·재시도·unmount·기존 직접 입력 경로/호출부 확인. PR #113 머지 보류 유지.

### DEV-58 중복 진입 버튼 제거
- 사용자 요청: 상품 목록의 자료로 상세 만들기 버튼 삭제, 새 상품 진입으로 통일.
- 범위 추가: apps/producer/src/app/(tabs)/products/index.tsx. 기존 상품의 저장 작업 편집 경로는 유지한다.
- 검증: 생산자 타입 검사 및 새 상품 진입/재시도 Playwright2개 통과. 앞선 관련 전체16개 통과 이후 버튼 삭제만 반영. scan-before-commit 이슈 없음. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건.

## DEV-58 생산자 전체 UI·상품 편집 동선 (2026-10-17)
- 승인 계획/범위: server/tasks.md의 상품별 편집 작업·생산자 흐름 안정화와 동일. apps/producer/**, packages/ui/src의 생산자 공용 구성, packages/api/**, scripts/e2e/**, 관련 spec/wiki/tasks.
- 기존4탭 유지. 상품 목록의 판매페이지 수정은 해당 상품의 초안/공개 내용을 직접 연다. 현황·주문/출하·농가·설정·상태 안내 공통 규격과 뒤로가기/오류/입력 보존을 점검. AI 채팅 기능은 제외.
- [x] 구현·회귀·완료 영상3개

- 구현 완료: 상품별 현재 내용 재개·비공개 저장·명시적 적용, 18모듈 추가/숨김/문구 편집 및 기존 블록 보존, 새 상품 원자 생성/응답 유실 멱등 재시도. source 적용과 수정본 충돌 보호, 삭제된 원본 작업과 독립 편집, 본인 전용 사진 조회를 포함한다.
- 검증: 전체 `pytest -q` 281개, `npm run typecheck` 4 workspace, `npm run test:mock` 13개, Ruff 통과. 격리 API/DB의 생산자/자료 Playwright18개 통과, 사진 권한 보완 후 상품 편집·자료 적용4개 및 응답 유실 재시도2개 추가 통과. migration0011 upgrade/downgrade0010/re-upgrade 통과.
- 화면 점검: 현황의 제목/여백, 상품 목록 카드/판매페이지 진입, 환경설정 카드, 농가 프로필/출하 간격을 공통 토큰에 맞췄다. 기존4탭·URL 상품 필터/출하 상태 및 기존 송장 오류 보존 계약을 유지한다. 로그인/승인/정지 안내는 기존 공용 컴포넌트 유지, AI 채팅 동작은 수정하지 않았다.
- scan-before-commit: 새 상품 effect의 미커밋 중간 코드 제거, 잠금 대기 후 workspace 재조회, 비공개/숨김 사진 접근 보완. 최종 이슈 없음. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건 (detailContent: b464eba, moduleDetail: 388d956).
- 사용자 영상 확인 전 PR113 Draft/미머지 유지. 추가 AI 호출/배포 없음. Agent 시간/Tokens 미측정.

- 영상: `.artifacts/in-app-v4/flow-review/index.html` 및01-create/02-edit/03-navigation.webm. 새 상품 사진 준비·개인정보 확인·사진 연결·초안 저장은 격리 mock 제공자, 기존 판매페이지 편집은 실제 Gemini 저장 결과 재사용. 녹화 환경의 모델 SHA 누락을 고쳐 사진 준비/썸네일/초안 포함까지 재녹화했다. 테스트 브라우저는 모두 닫았다.

## DEV-58 상세 편집 통합·항목별 ON/OFF
- 사용자 승인: 근거 검토 별도 탭/개별 확정 제거, 기존18항목별 스위치, 자동 채움·직접 편집·선택적 원문 보기.
- 범위: apps/producer/src/lib/{SourceWorkspace,SourceDetailsEditor,ProductPageEditor}.tsx, packages/api/src/sourceAnalysis.ts, server/app/source_analysis/**, server/tests/**, scripts/e2e/**, 해당 spec/tasks 및 docs/spec/source-integration.md/docs/wiki/Source-Analysis.md.
- 결정: 유효한 단일 후보만 자동 채움(UNREVIEWED 유지), 충돌/과거/오래된/불명확한 후보 제외. 기존 저장 내용/선택 우선, OFF내용 보존. 편집값+모듈 선택 원자 저장 API와 기존 API 병행. 사진 승인/버전/명시적 공개 유지. 추가 AI 호출·머지·배포 없음.
- [x] 구현/회귀/영상/커밋 스캔

- 범위 추가: docs/spec/source-analysis.md의 예전 개별 확인 필수 문구를 승인된 자동 채움·항목별 선택 계약에 맞춘다. OFF된 오래된 사진은 비공개 보존하고 다시 켤 때 준비/연결 검증을 수행한다.

- 완료: 근거 검토 탭/개별 확정 제거, 자동 채움·18항목 스위치·직접 편집·접히는 원문, 문구/선택 원자 저장. 자동 값은 UNREVIEWED 유지, OFF 값/사진 보존, 충돌·오래된 항목은 선택적 해결. 기존 상품 편집도 같은 스위치로 통일했다.
- 검증: 전체 pytest284개 통과 후 오래된 OFF 사진 케이스 추가/보완을 포함한 최종 관련22개 통과. Ruff, 타입4 workspace, mock13개 통과. 기존 생산자·자료 Playwright18개 + 저장 실패/동일 요청 재시도1개 통과; 직접 탭 진입/분석 완료 갱신 보완 후 관련9개 재검증 통과.
- scan-before-commit: 상세 편집 탭 직접 진입 시 최신 결과를 읽지 않던 경로와 분석 중 열린 편집 화면의 초기 선택 갱신을 보완. 미저장 입력은 기존 버전에 고정해 충돌 시 보존한다. 최종 이슈 없음. 레거시 호환 점검: 후보1건 — 지적0건 / 커밋된 구조1건 (기존 review/drafts CONFIRMED 계약: 4d7eece).
- 영상: .artifacts/in-app-v4/toggle-review/index.html. 새 상품 mock 분석의 자동 채움/OFF저장/재진입/ON복원, 기존 실제 Gemini 생성 상품의 수정/반영을 녹화. 추가 유료 AI 호출0, PR113 Draft·머지/배포 보류. Agent 시간/Tokens 미측정.

### DEV-58 스위치 시각 정리
- 사용자 요청: 주황/초록이 섞인 ON/OFF 표시를 단순하게 정리.
- 범위 추가: apps/producer/src/lib/SectionSwitch.tsx. 두 편집 화면에 동일한 둥근 트랙/흰 손잡이를 사용하며 ON은 accent, OFF는 border로 고정한다. 기존 접근성 switch 역할·키보드 조작·disabled·값 보존을 유지한다.
- 추가 사용자 요청: 상세 사진 아래 캡션 제거. 범위 추가: packages/ui/src/SourcePhoto.tsx. 이미지 대체 텍스트는 유지하고 미리보기/공개 페이지의 시각 캡션만 제거한다.
- 검증: 타입4 workspace 통과, 스위치 ARIA 수정 후 관련 Playwright9개 통과(40.1초). Space/Enter 키보드 토글 및 실제 공개 페이지 사진 캡션 제거를 별도 headless 확인. 기존 accessibilityState가 웹에서 checked로 전달되지 않는 문제와 switch의 Space 조작을 보완했다. 커밋/머지/배포 없음.

## DEV-58 분석 완료 표시·업로드 개인정보 안내 전환
- 사용자 지시: 실행별 완료 n/n 제거, 최신 분석 상태 하나만 표시. 개인정보 가리기/승인 기능 대신 업로드 전 직접 가리기 안내.
- 범위: apps/producer/src/lib/SourceWorkspace.tsx, server/app/source_analysis/{worker,service}.py, server/tests/test_source*.py, scripts/e2e/source*.ts, apps/producer/{spec,tasks}.md, server/{spec,tasks}.md, docs/spec/{source-analysis,source-integration}.md, docs/wiki/Source-Analysis.md.
- 결정: 개인정보는 업로드 전에 사용자가 직접 제거. 새로 준비된 자료는 자동 가림 없이 분석 가능 상태로 전환한다. 기존 가림본과 버전 취소/예산/권한 보호는 유지한다. 기존 대기 작업은 취소 후 새 분석으로 이어갈 수 있도록 안내한다. 추가 유료 호출·머지·배포 없음.
- [x] 구현·관련 회귀 검증

## DEV-58 두 첨부함·설명 기반 사진 배치·페이지 직접 편집
- 사용자 승인 계획: 자료/상품사진 별도 썸네일 박스, 텍스트 자료 수정, 상품사진 한 줄 설명으로만 AI 위치 분류, 완료 후 편집 진입, 실제 페이지에서 문구/사진/ON-OFF 편집.
- 범위: apps/producer/src/lib/**, packages/{ui,api}/src/**, server/app/{source_analysis,ai}/**, server/migrations/versions/**, server/tests/test_source*.py, scripts/e2e/source*.ts, 관련 spec/tasks 및 docs/spec/{source-analysis,source-integration}.md, docs/wiki/Source-Analysis.md.
- 결정: 사진 설명은 캡션/상품 사실로 사용하지 않는다. 상품사진은 OCR 없이 준비하고 위치 분류에 이미지 전송하지 않는다. 미배치 사진 수동 선택, 수동 수정 우선. 기존 초안/가림본 보존. 추가 유료 검증/배포/PR113 머지 없음.
- [x] 백엔드·직접 편집기·통합 검증·영상

- DEV-58 scope addition: docs/spec/source-editor.md; current source-editor contract supersedes the previous UI/approval flow.

- 완료: 자료/상품사진 두 박스·텍스트 수정·설명만 이용하는 사진 배치, 분석 완료 후 페이지 직접 편집, 사진 추가/제외/이동/순서 및 원래 위치의 OFF 접기. 최신 상태 하나와 업로드 전 개인정보 제거 안내로 전환. 비공개 저장/명시적 적용·버전·권한 보호 유지.
- 검증: 전체 `pytest -q` 291개, `npm run typecheck` 4 workspace, `npm run test:mock` 13개, Ruff 통과. 격리 DB/API의 source-analysis/source-editor/source-workspace-ui/product-page-workspace Playwright 11개 통과. migration0012 upgrade/downgrade0011/re-upgrade 통과.
- 영상: `.artifacts/in-app-v4/page-editor-review/index.html` (새 자료→직접 편집→저장/공개, 기존 상품 사진 추가/제외/복원/순서→저장/공개). mock 제공자 및 기존 저장 결과만 사용, 추가 유료 호출 0. 사진 설명 분류의 실제 모델 품질 평가는 별도 미실시.
- scan-before-commit: 사진 업로드 중 중복 조작·사진 풀 중복·분류 재시도 중복·버전 충돌 보호 보완 후 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보3건 — 지적0건 / 커밋된 구조3건 (privacy_approved: 4d7eece, modules/blocks: 839503e, SourceRun inputs 없는 실행: 388d956).
- 사용자 영상 확인 전 PR113 Draft/미머지·미배포 유지. Agent 시간/Tokens 미측정.

## DEV-58 첨부 카드·사진 추가·눈 아이콘 편집 UX
- 사용자 승인: 파일명 제거, 텍스트 요약 타일의 연필/×, 카드 내 사진 설명 즉시 편집, 얇고 작은 조작부, 점선 둥근 사진 추가 칸, 눈 아이콘으로 끄면 접고 흐리게/켜면 펼침. 켜진 항목만 별도 접기 가능.
- 범위: apps/producer/src/lib/{SourceAttachments,SourceWorkspace,PageCanvas,SectionSwitch}.tsx, packages/ui/src/Icon.tsx, scripts/e2e/source*.spec.ts, apps/producer/{spec,tasks}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: 설명은 blur 및 분석 직전 저장, 실패 입력 보존/재시도. 기존 API/DB 유지. 접기 상태는 로컬 전용, 공개는 enabled만 사용. 기존 판매페이지 본문 디자인 유지. PR113 Draft/미머지/미배포, 유료 검증 없음.
- [x] 구현·타입/관련 브라우저 회귀·영상·커밋 스캔
- 범위 추가: packages/ui/src/Button.tsx — 편집 도구에만 opt-in compact(13px regular/44px/얇은 테두리)를 제공하며 기존 버튼 기본 규격은 유지한다.

- 범위 추가: SourceDetailsEditor.tsx의 미배치 사진 안내를 기존 편집 버튼에서 새 + 사진 추가 칸으로 갱신한다.

- 검증: 최종 격리 DB/API Playwright12개(52.3초) 통과. 360/390/430px, 파일명 미노출·텍스트 연필/삭제, 사진 설명 저장 실패/재시도·분석 직전 최신 입력, 눈 아이콘 Space/Enter·접기/복원·공개 화면 확인. 타입4 workspace 및 mock13개 통과. 이번 변경은 프론트만 수정하여 서버 전체 테스트는 재실행하지 않음(직전291개 및 CI 통과).
- 스캔: 설명 저장 중 추가 입력·삭제/업로드 순서 보호, 사진 이동 중 목록 변경 보호, 충돌 항목 확인 경로 유지. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건.
- 검증 중 기존 파일명 선택자와 실행 입력 스냅샷 테스트 필드를 실제 계약에 맞췄다. 의도한503 테스트를 정상 네트워크 검사와 분리했다. 키보드 테스트는 확인창 닫기 애니메이션 종료를 기다린 뒤 검사한다. 웹 눈 아이콘은 기본 button의 Space/Enter 동작을 사용한다.

- 영상2개를 새 카드 설명/눈 아이콘/접기/점선 사진 추가 UX로 재녹화했다: `.artifacts/in-app-v4/page-editor-review/index.html`. 격리 mock 제공자만 사용, 추가 유료 호출0. 녹화 브라우저 종료. 사용자 확인 전 PR113 Draft·미머지·미배포 유지. Agent 시간/Tokens 미측정.

## DEV-58 첨부 오버레이·접기 제거
- 승인: 첨부 내용이 카드 전체를 채우고 연필/×는 우측 상단 오버레이. 별도 접기 화살표/상태 제거, 기존 눈 ON/OFF만 유지. 큰 섹션 제목 접기 추가 없음.
- 범위: apps/producer/src/lib/{SourceAttachments,PageCanvas}.tsx, scripts/e2e/{source-analysis,source-workspace-ui}.spec.ts, apps/producer/{spec,tasks}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: 첨부 이미지는 정사각 썸네일 cover, 공개 사진 원본 비율/프레임 유지. 텍스트는 최소 안쪽 여백과 아이콘 겹침 방지. 카드 아래 사진 설명 inline 유지. API/DB 변경 없음. PR113 미머지·미배포 유지.
- [x] 구현·타입/브라우저·영상·커밋 스캔
- 검증: 타입4 workspace 통과 후 미리보기 오류 안내 추가에 대해 생산자 타입 재검사 통과. 격리 mock API/DB Playwright12개(52.6초) 통과: 360/390/430px 카드 경계·오버레이 위치, 텍스트 수정/삭제, 설명 저장/재시도, 눈 Space/Enter·내용 복원·저장/공개. 첫 실행의 이미지 선택자가 SVG 아이콘까지 찾던 문제는 미리보기 영역으로 범위를 좁혔다.
- scan-before-commit: 미리보기 이미지 오류 안내/URL 변경 복원, 아이콘 클릭 분리·44px 영역, 별도 접힘 상태 완전 제거 및 공개/충돌 처리 유지 확인. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. 추가 유료 호출 없음.

- 영상2개를 오버레이 카드/눈 아이콘만 있는 화면으로 갱신: `.artifacts/in-app-v4/page-editor-review/index.html`. 녹화 브라우저 종료. PR113 Draft·머지/배포 보류. Agent 시간/Tokens 미측정.

## DEV-58 텍스트 카드 클릭 편집
- 사용자 요청: 첨부 텍스트 연필 제거, 카드 본문 클릭으로 전체 내용 수정. 우측 상단 삭제 × 유지.
- 범위: apps/producer/src/lib/SourceAttachments.tsx, scripts/e2e/source-analysis.spec.ts, apps/producer/{tasks,spec}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 기존 카드 onEdit/API 사용. 상세페이지 충돌 해결의 연필은 별도 기능이므로 유지. 머지·배포 없음.
- [x] 구현·타입·기존 흐름 검증·커밋 스캔

- 생산자 타입 검사 통과, 기존 source-analysis Playwright3개(360/390/430px,23.9초) 통과. 카드 본문 클릭으로 전체 텍스트를 열고 삭제 시 편집 화면이 열리지 않는 동작, 저장/공개까지 확인. scan-before-commit 이슈 없음. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. 추가 AI 호출/머지/배포 없음.

## DEV-58 큰 섹션 눈 아이콘·항목 제외
- 승인 계획: 큰 제목 왼쪽 눈으로 섹션 전체 제어, OFF 제목/장식 흐림, 하위 항목·사진 우측 상단 ×, 연한 placeholder. 별도 회색 조작 줄/접기 없음.
- 범위: apps/producer/src/lib/{PageCanvas,SourceDetailsEditor,ProductPageEditor}.tsx, packages/{ui,api}/src/**, server/app/source_analysis/**, server/tests/{test_source*,test_product_workspace}.py, scripts/e2e/{source-analysis,source-editor,product-page-workspace}.spec.ts, apps/producer/{spec,tasks}.md, server/{spec,tasks}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: hiddenSectionIds는 JSON 초안/API에 저장하며 기존 enabled와 분리. 숨김은 공개/활성 근거 검증에서 제외, 재활성화 시 재검증. 기존 초안은 빈 배열 기본값. ×는 비파괴 제외, 항목 추가/사진 풀에서 복원. SQL 마이그레이션 없음. PR113 Draft/미머지/미배포, 유료 AI 호출 없음.
- [x] 구현·저장/공개 회귀·타입·브라우저·커밋 스캔

- 완료: 큰 제목 바로 왼쪽 눈·OFF 제목/장식/구분선 흐림, 하위 항목/사진 ×와 복원, 연한 placeholder, 섹션 숨김/개별 제외 독립 저장·공개 필터 적용.
- 검증: server/에서 `pytest -q tests/test_source_editor.py tests/test_product_workspace.py tests/test_source_integration.py tests/test_source_analysis.py` 57개 통과(12.72초), 타입4 workspace 및 최종 생산자 타입 검사 통과, mock13개 통과. 격리 DB/API Playwright15개 최종 통과(1.0분), 360/390/430px 정렬·흐림·제외/복원·placeholder·새로고침·미리보기/공개 확인. Ruff/diff 검사 통과.
- 스캔: 여러 저장본 중 최신 hiddenSectionIds 선택 및 활성 충돌 항목 확인 경로 보완. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건 (Draft snapshot:4d7eece, PageSnapshot:839503e).
- 검증 과정의 루트 cwd 실행은 전처리 subprocess 환경 때문에 실패하여 server/에서 정상 재검증. 브라우저 fixture 모델 등록 및 실제 사진 선택자를 수정했다. 화면 캡처 `.artifacts/section-editor-{360,390,430}.png` 확인. 기존 영상은 이번 조작 변경 전 기록으로 남김. 로컬 API 재시작만 수행, 기존 데이터 재시드/AI 호출 없음. PR113 Draft/미머지/미배포. Agent 시간/Tokens 미측정.

## DEV-58 빈 항목 직접 입력·오버레이 정렬
- 사용자 승인: 항목 추가 버튼/목록 제거. 모든 빈 항목은 제자리의 연한 `내용을 입력해주세요`, 빈 섹션은 제목/장식/구분선도 흐림. 내용 입력/사진 추가 시 자동 반영, 빈 내용은 공개 제외. 눈은 섹션 머리 맨 오른쪽으로 이동.
- 범위: apps/producer/src/lib/{PageCanvas,SourceAttachments,SourceDetailsEditor}.tsx, packages/ui/src/ModuleStory.tsx, server/app/source_analysis/{service,workspace}.py, server/tests/{test_source_editor,test_product_workspace}.py, scripts/e2e/{source-analysis,source-editor,product-page-workspace}.spec.ts, 관련 spec/tasks 및 docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: × 제외는 값 보존/흐림, 클릭 편집으로 다시 반영. 빈 항목 × 숨김. 숨김 눈은 수동 상태 유지. 첨부 텍스트/항목 ×를 첫 줄에 겹쳐 배치하고 오른쪽 공간만 확보. API/DB 필드 추가 없음. 격리 mock 영상2개 갱신, PR113 머지·배포 없음.
- [x] 구현·검증·영상·커밋 스캔

- 검증 완료: 타입4 workspace, mock13개, Ruff/diff 검사 통과. server/에서 관련 source-editor/product-workspace/source-integration/source-analysis pytest58개(13.86초), 격리 DB/API Playwright15개(1.1분) 통과. 빈 항목 입력/사진 활성화, 공백 제외, 빈 섹션 제목 흐림, 오른쪽 눈/× 정렬, 제외 후 클릭 복원·저장/공개 확인.
- scan-before-commit: 호출부·전체 diff·빈 상태/충돌 경로 검토 후 이슈 없음. 커밋 안전. 레거시 호환 점검: 신규 후보0건 — 지적0건 / 커밋된 구조0건. 기존 hiddenSectionIds 기본값은 기존 커밋의 변경 없는 동작.
- 영상2개 최신 녹화: `.artifacts/in-app-v4/page-editor-review/index.html`. 항목 추가 없이 직접 입력, 빈 섹션 흐림/오른쪽 눈/× 제외·클릭 복원, 사진 추가/제외/순서 및 저장/공개. 격리 mock만 사용, 추가 유료 호출0. 로컬 API 갱신, 실제 데모 데이터 유지. PR113 Draft/미머지/미배포. Agent 시간/Tokens 미측정.

## DEV-58 편집/미리보기 정렬·사진 제안 제거
- 승인: 공개 페이지와 편집/미리보기의 가운데 정렬 일치. 사진 추가 제안 UI 제거.
- 범위: apps/producer/src/lib/{PageCanvas,SourceWorkspace}.tsx, packages/ui/src/ModuleStory.tsx, scripts/e2e/{source-analysis,source-editor}.spec.ts, apps/producer/{spec,tasks}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: 상품명/소개 문구는 공통 스타일의 중앙 정렬, 이름 눈은 오른쪽 오버레이와 균형 잡힌 좌우 공간. 본문은 기존 좌측 정렬 유지. 사진 요청 API/원본 데이터는 유지하고 UI/토글 상태만 제거. PR113 미머지·미배포.
- [x] 구현·검증·커밋 스캔

- 검증: 타입4 workspace 및 최종 생산자 타입 검사 통과. 격리 DB/API Playwright15개(1.1분) 통과, 모바일3폭 상품명 중심 좌표·소개 중앙 정렬·사진 요청이 있는 응답의 제안 UI 미노출·저장/공개 확인. 이번 UI 변경은 서버/mock 동작 변경 없어 직전 서버58개/mock13개 결과 유지(이번 재실행 아님).
- scan-before-commit: 삭제된 토글 상태/호출부, 편집·공개 공통 스타일 및 조작부 중심 간섭 검토. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건.
- 기존 영상2개를 최신 중앙 정렬 화면으로 재녹화: `.artifacts/in-app-v4/page-editor-review/index.html`. 추가 유료 호출0, 녹화 브라우저 종료. PR113 Draft/미머지·미배포. Agent 시간/Tokens 미측정.


## DEV-58 기본 정보 입력과 빈 항목 안내 (AC-SRC-11, FEAT-03/04/07)
- 범위: apps/producer/src/lib/{SourceWorkspace,SourceBasicInfo,PageCanvas}.tsx, packages/api/src/sourceAnalysis.ts, server/app/source_analysis/{schemas,service,router,editor}.py, server/tests/test_source*.py, scripts/e2e/source*.spec.ts, 관련 spec/tasks/wiki 및 로컬 검토 영상.
- 결정: 품종 필수, 사이즈·예상 당도 선택. 대상별 basicInfo JSON 저장, 기존 상품 기본값 복사, 분석 전 저장/필수 검증. 직접 편집 CONFIRMED/EXCLUDED > 기본 정보 > 추출 결과. 실측값으로 변환하지 않음. 기본 정보 저장만으로 공개 상품 변경 없음.
- 결정: 기본 정보만 변경할 때 추출 근거는 무효화하지 않으며 reviewVersion을 증가시켜 오래된 편집 저장을 막는다. 기본 정보에서 만든 미확정 제안은 변경 시 새로 만들고 직접 편집은 유지한다.
- [x] 구현·API/mock 타입·관련 문서 갱신
- [x] backend/typecheck/mock/브라우저 검증 및 headless 영상 갱신
- [x] 커밋 전 스캔, PR #113 갱신 (미머지)

- 검증: server/에서 관련 pytest 61개 통과(15.39초). npm run typecheck 4 workspace, npm run test:mock 13개, 격리 DB/API Playwright 16개(1.1분), 변경 Python Ruff 및 git diff --check 통과.
- 스캔: 기본 정보 우선순위가 오래된 사진 검증을 생략하던 경로를 보완하고, 화면 전환 후 늦은 응답/flush 참조 수명을 수정했다. 수정 후 관련 검증 통과. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보 2건 — 지적 0건 / 커밋된 구조 2건 (SourceTarget:388d956, Batch.targets:4d7eece).
- 화면 확인: .artifacts/basic-info-390.png. 기존 영상 페이지 .artifacts/in-app-v4/page-editor-review/index.html에 기본 정보 입력부터 분석·편집·저장·공개 영상(32.68초)과 기존 상품 사진 편집(12.4초)을 갱신하고 재생 확인. headless 브라우저 종료, 추가 유료 호출 0. 기존 실제 데모 DB를 보존해 로컬 API만 갱신했다.
- PR113 Draft/미머지/미배포 유지. Agent 시간/Tokens 미측정.


## DEV-58 카드 직접 입력·대표사진 필수 (FEAT-03/04/07, AC-SRC-11)
- 범위: apps/producer/src/lib/{SourceAttachments,SourceWorkspace,SourceBasicInfo,SourceDetailsEditor,ProductPageEditor,PageCanvas}.tsx, packages/api/src/{sourceAnalysis,productWorkspace}.ts, packages/ui/src/{Icon,content}.tsx, server/app/source_analysis/{representative,service,schemas,router,publish,workspace}.py, 관련 source/workspace pytest 및 scripts/e2e 테스트, 관련 spec/tasks/wiki, 로컬 검토 영상.
- 결정: 텍스트 추가 즉시 첨부함에 카드·포커스 생성. 카드 내 편집, blur/분석 전 저장, 빈 신규 카드는 업로드하지 않음. 저장 실패 입력 유지. 기존 텍스트를 비우면 입력 또는 × 삭제 안내로 분석 차단.
- 결정: 첫 성공 상품사진을 상품별 대표로 자동 지정, × 왼쪽 별로 변경. 대표 삭제 시 다음 첫 사진으로 대체, 마지막 삭제 가능하나 새 분석/공개에 대표사진 필수. 자료 이미지는 불가. 대상/초안 JSON에 대표 ID, 기존 상품 작업 JSON에 대표 URI를 저장하며 공개 반영 시 product.photos 첫 사진과 동기화. 섹션 숨김과 별개 대표 커버 유지.
- 결정: 원본 사진 공개 경로는 상세 사진뿐 아니라 현재 상품 대표사진으로 참조되는지도 검사한다. 공용 Photo의 서버 상대 미디어 경로를 API 주소로 해석해 앱 간 동일하게 표시한다.
- [x] 구현 및 스펙 반영
- [x] backend/typecheck/mock/browser 검증·영상 갱신
- [x] 커밋 스캔; PR113/Linear에 이 기록 반영, Draft·미머지 유지

- 검증: server/에서 `DATABASE_URL=… .venv/bin/pytest -q --tb=short tests/test_source_*.py tests/test_product_workspace.py` 99 passed. `npm run typecheck` 4 workspace, `npm run test:mock` 13 passed. 격리 API/DB Playwright 4 spec 17 passed. Ruff 및 git diff --check 통과.
- 스캔: 공개 대표사진 접근 판정, 자동 지정 전 DB flush, 카드 sibling key 중복, 신규 카드 삭제/blur 경합 보완. 미해결 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보 3건 — 지적 0건 / 커밋된 구조 3건 (SourceTarget:388d956, Batch.targets:4d7eece, PageSnapshot:839503e).
- 화면: 기존 영상 페이지 `.artifacts/in-app-v4/page-editor-review/index.html` 갱신, 36.24초/12.28초 재생 확인. 카드 입력/대표사진 캡처 포함. headless 브라우저 종료, 추가 유료 호출 0. 실제 데모 DB 보존 후 로컬 API 갱신. Agent 시간/Tokens 미측정.

## DEV-58 PR113 최종 머지 리뷰 (FEAT-03/04/07, AC-SRC-9/11)
- 범위: apps/producer/src/lib/ProductPageEditor.tsx, packages/api/src/productWorkspace.ts, server/app/source_analysis/workspace.py, server/tests/test_product_workspace.py, scripts/e2e/product-page-workspace.spec.ts, 관련 spec/tasks/wiki.
- 결정: main에 없던 PageSnapshot 중간 형식의 대표사진 보충·누락 요청 보존 분기를 제거한다. 현재 snapshot은 대표 URI를 명시한다. 로컬 기존 검토 데이터는 필요 시 별도 보정하고 제품 호환 분기를 두지 않는다.
- 결정: 사진 업로드 직후 대표 지정과 모듈 배치가 연속 실행돼도 이전 snapshot으로 덮어쓰지 않도록 함수형 상태 갱신한다.
- [x] 구현·회귀 검증·최종 리뷰 완료. 최신 CI 확인 뒤 squash merge 결과는 PR/Linear에 기록.

- 검증: 전체 pytest 300 passed(37.17초), typecheck 4 workspace 통과, Ruff 전체 통과, 격리 Playwright 4 spec 18 passed. 변경하지 않은 mock 계약 13 passed 결과 재사용. 마이그레이션 0008→0009→0010→0011→0012 단일 체인 확인.
- 리뷰 수정: 첫 사진 업로드의 대표 지정 덮어쓰기 수정, PageSnapshot 브랜치 전용 호환 제거, 현재 스펙 우선순위/마이그레이션 설명 정정. 새 첫 업로드·저장·재접속 및 누락/다른 상품 사진/null 대표 계약 회귀 테스트 추가. 커밋 전 스캔 이슈 없음, 신규 호환 후보 0건.
- 머지 스캔: 후보 7건 — 지적 1건(수정 완료) / 정당 6건. ProductWorkspace.snapshot은 origin/main 이력 0건(브랜치839503e→b36fe10)이라 제거. Batch.targets·Draft.snapshot·Run.inputs·Page.spans·Asset.privacy_approved는 base4d7eece, Product.detail_content는 baseb464eba에 존재해 유지. 새 사진 저장 이후 공개 참조·소유권·버전·예약/취소 경로 검토.
- 사용자 승인: Draft 해제·리뷰 수정 후 머지 명시 요청. 기존 사람 승인 병목 없이 각자 충돌 해소 후 머지하는 팀 방침에 따라 진행. Agent 시간/Tokens 미측정, 추가 유료 AI 호출 0.

