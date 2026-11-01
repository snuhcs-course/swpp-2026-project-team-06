# source_analysis tasks

## DEV-172 I3 평가 corpus·holdout·필드 채점 규칙 동결

- 이슈: [DEV-172](https://linear.app/sswp6/issue/DEV-172)
- 브랜치: `jinumeral/dev-172-i3-t10-freeze-source-analysis-evaluation-corpus-holdout-and`
- 기능·인수 조건: FEAT-03/04/07, AC-SRC-1/2/3/5/6/8
- 상태: 진행 중 (독립 holdout 확보 BLOCKED)

### 목표
프롬프트 개발 사례와 독립 평가를 분리하고 재현 가능한 필드 채점·중요 사실 감사를 고정한다.

### 범위 (수정 허용 경로)
- `server/app/source_analysis/{tasks.md,spec.md,corpus_score.py}`
- `server/tests/test_source_corpus.py`
- `docs/spec/validation/source-corpus-i3-v1.json`
- `docs/spec/validation/source-corpus-i3-v1.md`
- `docs/spec/{source-analysis.md,source-integration.md}`
- `docs/wiki/Source-Analysis.md`, `Makefile`

### 비범위
- 제품 추출/OCR/프롬프트 변경, 모델 호출, 새 의존성, 원문/개인정보/비공개 자료 커밋
- push·PR·다른 worktree 수정·운영 환경·배포·Linear 외부 메시지 (사용자 지시)

### 결정 사항
- 11/01 2차 리뷰: 모든 actual 후보(categories=[] 포함)에 supported·gold sourceSpanIds를 요구하고 evidenceSupport의 supported/total/rate를 전체·text/image/PDF 게이트별로 출력한다. 확인된 무근거는 FAIL, 누락 감사는 BLOCKED다. 분모0은 null과 이유를 보고하며 정의된 지표 실패 없이 판정 불가하면 BLOCKED다.
- 11/01 2차 리뷰 정규화: 범위 기호 -/~는 서로 보존하되 뒤 수량의 단위 공백·후행0은 동일하게 정리한다. 숫자 사이 쉼표 주변 공백은 보존하고 해당 숫자 조각은 정규화하지 않는다(1, 050g≠1,050g). 비공개 gold53개를 재검증하고 해시 변경 수·manifest SHA를 동기화한다. Makefile 무효 주석은 제거하고 subprocess cwd와 spec 표 날짜 순서를 고친다.
- 11/01 리뷰 수정은 사용자 지시대로 미커밋 v1에 반영하며 커밋·push·라이브 모델 호출·다른 worktree 수정은 하지 않는다. 정규화는 쉼표 숫자 그룹과 명시적 부호를 보존하고 비공개 gold 전체에서 normalized 해시를 재생성한다.
- 11/01 DEV-152(origin/main `docs/evaluation/i3-journeys/protocol.md`)에 맞춰 95% exact P/R 판정은 text·image(image+long_image)·PDF 3그룹으로 한다. image/long_image 개별 진단과 PDF origin별 집계를 병행하며 원본 crop과 image_to_pdf를 case별로 명시한다.
- 11/01 적용 페이지에 무근거 중요 사실이 도달했는지는 저장 추출 run만으로 확인할 수 없다. 별도 appliedPageAudit를 BLOCKED(적용/저장/렌더 증거 없음)로 보고하고 DEV-170 담당자의 격리 환경 검증을 요구한다. 오프라인 추출 PASS로 이 항목이나 readiness를 대체하지 않는다.
- 11/01 criticalAudit는 gold sourceSpans만 참조할 수 있다. gold 누락은 새 manifest 버전에서 보완하고 그 전에는 BLOCKED/확인된 무근거는 FAIL로 남긴다. null/비객체 감사 입력은 점수 없는 ValueError로 거절한다.
- 11/01 산출물 위치는 기존 source 평가·제품 스펙과의 연속성 때문에 `docs/spec/validation`, 오프라인 채점 구현은 소유 모듈인 `server/app/source_analysis`로 유지한다. `docs/evaluation/i3-*`의 여정 실행 프로토콜과 중복 복사하지 않고 DEV-152 계약을 참조한다.
- 11/01 환경·임시 DB·캐시·Git 권한 관련 실행 기록은 이 tasks.md에만 유지하고 평가 규칙 문서에서는 제거한다.
- 10/31 제공된 이슈 본문과 Linear 읽기 조회(In Progress)를 기준으로 한다. 기존 server/tasks.md의 타 이슈와 충돌하지 않게 모듈별 작업 기록을 만든다.
- 10/31 I2 real 12건 manifest SHA 일치 확인. 과거 holdout 4건도 개발 반복에 사용되어 I3 split은 development, 당시 split은 별도 보존한다.
- 10/31 vision 6건은 real 12건의 부분집합(이미지5+긴 이미지1)이다. 합성18건은 텍스트16+이미지1+PDF1이며 계약 전용2건도 별도 인벤토리에 보존한다.
- 10/31 비공개 원문·gold 전문은 복사하지 않는다. 필드/대상과 exact·normalized 값 해시, 근거 quote 해시·위치로 gold를 동결하고 로컬 예측만 비교한다. 원본 파일 해시와 안전한 모델 입력 해시를 구분한다.
- 10/31 독립 신규 자료의 안전성/승인이 확인되지 않아 새 자료를 추가하지 않는다. holdout IDs는 빈 집합으로 동결하고 BLOCKED 및 형식별 다음 확보 행동을 명시한다.
- 10/31 평가 규칙은 제품 동작을 바꾸지 않는다. exact/normalized 점수와 완전한 수동 중요 사실 감사를 분리하며 미실행/감사 누락은 PASS가 될 수 없다.
- 10/31 원문 gold53개 중42개만 저장 OCR span에 공백 차이만으로 연결됐다. 나머지11개는 위치 검수 BLOCKED로 보존한다. 중요 사실 감사는 후보별 categories를 명시하고 불완전한 감사에 이미 확인된 무근거 주장이 있으면 FAIL을 숨기지 않는다.

### 작업
- [x] 인벤토리·해시·gold·holdout 상태·개인정보 검토 동결 (미확인 상태는 BLOCKED)
- [x] 오프라인 결정적 채점 CLI 및 회귀 테스트90개 (11/01 2차 리뷰 수정 포함)
- [x] 한국어 spec/영문 wiki 갱신
- [x] ruff·format check·focused pytest 실행과 결과 기록, 현재 수정 경로9개 범위 감사 (Makefile diff 제거)
- [x] 수정 전 전체 pytest 통과: 리뷰어 `cd server && uv run pytest` → 513 passed / 0 failed (2026-11-01, sandbox 밖 격리 로컬 PostgreSQL). 이번 수정 후 재실행 예정.
- [ ] 이번 2차 리뷰 수정 후 전체 pytest 재실행 (리뷰어, sandbox 밖 격리 로컬 PostgreSQL)
- [ ] 작은 논리 단위 커밋 (11/01 사용자 지시로 이번 세션에서는 수행하지 않음)

### 완료 조건
- [x] 로컬 산출물과 신규 focused 테스트 검증
- [ ] 독립 holdout 확보 및 승인 (BLOCKED: 기존 사례 모두 개발 노출)
- [ ] 사람 리뷰 및 머지 (이번 요청 범위 밖)

### 기록
- 10/31 작업 시작. 사용자 요청으로 spec 첫 커밋만 로컬 생성하며 push/PR은 하지 않는다. Agent 시간/Tokens는 세션 종료 기록에 기재하되 계측 불가능한 수치는 추정해 확정하지 않는다.
- 10/31 spec 첫 커밋 시도 실패: `git add server/app/source_analysis/tasks.md` → `.git/worktrees/farmclub-source-eval/index.lock: Operation not permitted`. sandbox 내 Git 메타데이터 쓰기 차단으로 커밋 BLOCKED. 실제 커밋0개; 준비된 산출물 검증을 계속한다.
- 10/31 `uv sync --frozen` 성공(새 의존성 추가 없음). 기존 PostgreSQL이 없어 분리 컨테이너 `farmclub-dev172-db` / localhost:55472 / DB `farmclub_dev172_test`를 생성했다. 다른 worktree/기존 DB는 수정하지 않았다.
- 10/31 1차: `cd server && uv run ruff check .` 통과, `uv run pytest tests/test_source_corpus.py -q` 40 passed. 전체 `uv run ruff check . && uv run pytest`는 ruff 통과, pytest **462 passed / 32 failed**(85.46s). 기존 source worker의 PROCESSING_FAILED 연쇄 원인 확인 중; 전체 통과로 보고하지 않는다.
- 10/31 진단: 기존 실패1개를 worker.fail의 예외 형식만 출력하는 메모리 내 래퍼로 재현(제품/테스트 파일 변경 없음): `PermissionError [Errno 1] Operation not permitted (originated from sysctl() malloc 1/3)`. sandbox의 psutil 메모리 조회 차단이 대표 실패의 원인이다. 진단 테스트1 failed; 통과로 바꾸지 않는다. 다음 행동: 담당자가 sysctl 조회 가능한 로컬/CI에서 전체 묶음을 재실행한다. 테스트 약화/예외 무시는 하지 않았다.
- 10/31 최종: `cd server && uv run ruff check . && uv run pytest tests/test_source_corpus.py -q` → ruff 통과, **41 passed / 0 failed**(11.58s). `UV_CACHE_DIR=/private/tmp/farmclub-dev172-uv-cache`, `DATABASE_URL`은 분리 로컬55472의 `farmclub_dev172` 사용(pytest가 `_test` 추가). 전체 테스트는 위 실패 상태로 남긴다.
- 10/31 기존 비공개 source-v4 저장 응답30건을 메모리에서 재채점: TP34/FP23/FN19, exact P/R59.65%/64.15%. 새 실호출 측정이 아니며 감사 누락/근거11개 미연결로 최종 **BLOCKED**다. 원문·응답은 저장소에 복사하지 않았다. 합성 개인정보 사례의 safeInput 가림3개·가상 연락처 잔존0개를 내용 출력 없이 확인했다.
- 10/31 커밋 전 스캔: 감사 categories 누락 시 PASS 가능성과 불완전 감사의 알려진 unsupported 은폐를 고치고 회귀 테스트를 통과했다. 남은 CRITICAL/WARNING0건. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건(정규화는 도메인 채점 규칙, 선택적 감사/거절 입력은 명시된 현재 계약).
- 10/31 `git diff main...HEAD`에는 로컬 main이 오래되어 이번 작업과 무관한 기존625파일 차이가 있다. 사용자 지정 base `origin/main`(2ab0c2f)과 HEAD 차이0, 실제 수정/신규10경로는 위 범위와 일치한다. 다른 브랜치/refs는 갱신하지 않았다.
- 10/31 Agent 시간 / Tokens: 세션 전체 시간·토큰 계측값 제공 안 됨(임의 수치 미기재). 대표 프롬프트: “기존 개발 노출을 보존하고 독립 자료 없으면 BLOCKED, 원문 비공개·무실호출로 manifest/채점 동결.” 남은 작업: 독립12건 권한/가림/2인 gold 검수, 기존11구절 위치 확인, 제한 없는 환경 전체 pytest, Git 쓰기 권한 복구 후 커밋. 배포/PR/push/Linear 알림 없음.
- 10/31 검증 후 이번 작업에서 만든 임시 PostgreSQL 컨테이너/볼륨만 삭제했다. `.venv`/기존 lock 의존성은 유지한다. 미실행 커밋 분리안: `docs(source): AC-SRC-2/6 평가 범위 기록 (DEV-172)` → `docs(source): AC-SRC-2/3/6 개발 corpus와 평가 규칙 동결 (DEV-172)` → `feat(source): AC-SRC-1/2/3/5 오프라인 필드 채점과 회귀 검증 (DEV-172)`. Git 권한 복구 후 담당자가 현재 브랜치를 확인하고 실행해야 한다.
- 11/01 리뷰 WARNING1/2·INFO 반영: 숫자 그룹·부호 보존, PDF별 origin(crop2/image_to_pdf2), DEV-152 3그룹 판정과 개별 진단, appliedPageAudit BLOCKED, gold span 한계 문서화, 감사 입력 타입 검증, Makefile 주석 위치, 평가 문서의 환경 기록 제거. 범위는 기존10경로 그대로다.
- 11/01 private `.artifacts/source-real/cases.json`의 기존 SHA 일치 확인 후 real gold와 `.artifacts/source-synthetic-flash-comparison/report.json`의 저장 expected를 읽기 전용 대조했다. 모든53개 target/field/exact hash 일치, normalized hash53개 재생성, 변경0개(기존 gold는 이번 버그의 영향을 받지 않음). 원문/응답/값은 출력·복사하지 않았다. v1 manifest 새 SHA-256: `95a75ca765ccf66c559dc0fc24ed41b2a0c268d2a8aca7206bdec8e2fc41cd6d` (PDF origin 추가에 따른 변경). md·tests·wiki를 같은 값으로 갱신했다.
- 11/01 환경 준비: 시스템 python은 pydantic 미설치라 해시 재생성 import가 실패했고 기존 `server/.venv/bin/python`으로 성공했다. 기본 uv 캐시는 권한 거부로 format 실행 전 실패하여 `UV_CACHE_DIR=/private/tmp/farmclub-dev172-uv-cache`를 지정했다. 이번 세션 전용 PostgreSQL `farmclub-dev172-review-db`(localhost:55472, DB `farmclub_dev172_review`, pytest `_test`)를 생성해 다른 작업 DB와 분리했다. 기존 컨테이너/다른 worktree는 변경하지 않았다.
- 11/01 검증: 위 UV_CACHE_DIR와 DATABASE_URL을 지정하고 `cd server && uv run ruff check . && uv run pytest tests/test_source_corpus.py -q` → `All checks passed!`, **59 passed / 0 failed**, 8.93s, 종료0. `python3 -m json.tool docs/spec/validation/source-corpus-i3-v1.json > /dev/null` → 종료0. 전체 pytest는 사용자 지시대로 리뷰어가 sandbox 밖에서 재실행하며 이 세션에서는 실행하지 않았다.
- 11/01 남은 사람 작업: 독립 holdout 권한/개인정보·gold 합의, 기존11개 gold 위치 검수, DEV-170 적용/저장/렌더 감사, 전체 pytest 재실행. Agent 시간 / Tokens: 세션 계측값 제공 안 됨(임의 추정 미기재). 커밋·push·실호출·외부 메시지0회.
- 11/01 최종 범위 확인: `git diff main...HEAD`는 기존625경로 차이, `git diff origin/main...HEAD`는0경로이며 실제 미커밋/신규10경로 모두 허용 범위 안이다. `git diff HEAD --check` 통과, manifest/md/tests/wiki SHA pin 일치. 이번 세션 전용 임시 PostgreSQL 컨테이너는 검증 후 종료·자동 삭제했다.

- 11/01 2차 리뷰 시작: 리뷰어가 이번 수정 전 `cd server && uv run pytest`를 sandbox 밖 격리 로컬 PostgreSQL에서 실행해 **513 passed / 0 failed**를 확인했다. 이전 sandbox 실패는 과거 기록이며 현재 전체 테스트 BLOCKED 상태가 아니다. 이번 변경 후 전체 묶음 재실행 예정; 이 세션은 요청된 ruff·format check·focused pytest·json.tool을 실행한다.
- 11/01 2차 리뷰 반영: 모든 actual 후보 근거율(전체/3그룹), 일반 무근거 FAIL·감사 누락 BLOCKED, 분모0 N/A 이유·판정 불가 BLOCKED, 범위 기호 보존/단위 공백 정규화·숫자 쉼표 공백 보존 회귀 검증. md 감사/정규화와 영문 wiki 결과 문구를 갱신하고 subprocess cwd를 고정했다. spec 결정 표는 날짜 오름차순, Makefile 주석 삭제로 해당 diff 전체 제거.
- 11/01 2차 리뷰 해시 검증: 비공개 real 원본 SHA 일치 확인 후 저장 real/synthetic gold53개의 target/field/exact hash 일치. normalized 해시53개 재생성, **변경0개**. 현재 manifest SHA-256은 **`95a75ca765ccf66c559dc0fc24ed41b2a0c268d2a8aca7206bdec8e2fc41cd6d`**로 유지하며 md/CLI 예시/tests/wiki pin 일치. 비공개 값은 출력·복사하지 않았다.
- 11/01 2차 리뷰 실행: 전용 PostgreSQL `farmclub-dev172-review2-db`(localhost:55472, DB `farmclub_dev172_review2`, pytest `_test`)와 `UV_CACHE_DIR=/private/tmp/farmclub-dev172-uv-cache`, `DATABASE_URL=postgresql+psycopg://farmclub:farmclub@localhost:55472/farmclub_dev172_review2`를 사용했다. `cd server && uv run ruff check . && uv run ruff format --check app/source_analysis/corpus_score.py tests/test_source_corpus.py && uv run pytest tests/test_source_corpus.py -q` → **All checks passed! / 2 files already formatted / 90 passed, 0 failed (18.02s), 종료0**. `python3 -m json.tool docs/spec/validation/source-corpus-i3-v1.json > /dev/null` → 종료0. 수정 후 전체 pytest는 아직 실행하지 않았으며 리뷰어 재실행 예정이다.
- 11/01 2차 리뷰 최종 감사: `git diff main...HEAD`는 기존625경로, `git diff origin/main...HEAD`는0경로, 실제 미커밋/신규9경로는 허용 범위 안이다. `git diff HEAD --check` 통과. 이번 테스트 전용 컨테이너는 검증 후 종료·자동 삭제하며 기존 DB/다른 worktree는 수정하지 않는다. Agent 시간 / Tokens는 세션 계측값 미제공. 커밋·push·라이브 모델 호출·외부 메시지0회.

### 커밋 전 3차 스캔 후속(INFO, v1 커밋 뒤 처리)
- normalize 단위 정규식 뒤 경계·유니코드 숫자 처리(진단용 normalized만 영향, 바꾸면 해시 재생성 → v2).
- CLI 입력 오류/다이제스트 불일치 종료 코드를 채점 FAIL(1)과 구분하고 OSError도 traceback 없이 처리.
- v1 FieldKey 20개를 manifest 상수로 고정하고 테스트로 schemas.FieldKey와 대조.
- DEV-152 '부재·충돌 시 빈칸/표시' 감사 기록 필드 또는 DEV-170 범위 명시, p50/p95는 DEV-170 몫으로 명시.
- 10/31 재채점 수치는 11/01 규칙 변경 전 채점기 기준임을 표시, 범위의 Makefile 제거.
- 11/01 전체 pytest(격리 로컬 Postgres, sandbox 밖) 2차 수정 후 544 passed / 0 failed.
- 11/01 결정(DEV-172 소유자): I3 holdout 후보로 새로 수집한 공개 자료(원문·이미지·web_print PDF), 출처 URL, 가림본, DRAFT 라벨, 검토표는 레포에 올리지 않고 로컬 비공개 폴더에만 보관한다(레포는 GitHub·Wiki로 공개 동기화되고 농가 페이지 일부는 복제 금지를 명시). v2 잠금 때도 레포에는 후보 ID·형식·해시·집계 결과만 남긴다. 현재 상태: 후보 12건 중 텍스트3·이미지3·긴 이미지3 라벨 검토 대기, PDF(web_print)3 중 2건 인쇄 완료·1건 확인 문구 불일치로 재확인 필요, 모든 라벨 DRAFT·holdout 미잠금.

## DEV-186 Two-stage product draft · 상세 문구 정리

- 이슈: [DEV-186](https://linear.app/sswp6/issue/DEV-186)
- 브랜치: `jinumeral/dev-186-two-stage-refine-draft`
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-1/2/3/5/6/7/10/11
- 상태: 커밋 전 검증 완료(샌드박스 밖) — ruff 통과, pytest **743 passed**, typecheck 통과, test:mock **46 passed**, Playwright **35 passed**. UI 검증 상세는 producer 기록 참조.

### 목표
원문 후보·근거를 보존하면서 대상별 2차 문구 정리로 금액·효능·운영 문구를 상세에서 제외한다.

### 범위 (수정 허용 경로)
- `server/app/ai/{source_analysis,source_refine}.py`, `server/app/source_analysis/**`
- `server/migrations/versions/0023_source_refinement.py`, `server/tests/test_source_refine.py`
- `apps/producer/src/lib/{NewProductComposer,PageCanvas,SourceDetailsEditor,SourceWorkspace,SourceExclusions}.tsx`, `apps/producer/tasks.md`
- `packages/api/src/{sourceAnalysis,sourceTextSafety}.ts`
- `scripts/mock-tsconfig.json`, `scripts/{mock-server,test-spec12,test-capacity,test-navigation,test-storefront,test-ai-feedback}.mjs`
- `scripts/e2e/{new-product-composer,source-review-regressions}.spec.ts`
- `docs/spec/{source-analysis,source-integration,ia}.md`, `docs/wiki/Source-Analysis.md`
- `.github/workflows/{ci,deploy-vercel}.yml`

### 비범위
- Stage-1 추출 프롬프트 변경(명시적 mock fixture 추가만 허용), 의존성 추가, corpus/gold/holdout 변경, 운영 접근·실호출·push·PR·커밋.

### 결정 사항
- 전처리·추출이 모두 성공한 뒤 대상별 REFINE Item을 큐에 넣고 기존 lease/비용 예약/정산 경로를 사용한다. REFINE 단독 재시도도 지원하며 불확실 전송은 자동 재호출하지 않는다.
- Item.refinement에 후보 ID·정리 모듈·excluded·프롬프트 버전·안전 목록 SHA256을 저장한다. 현재 후보·버전·해시가 모두 일치해야 재사용하고 불일치 시 다음 분석에서 다시 정리한다. `source-refine-v3`는 건강 효능 후보 전체 인용을 금지한다.
- 유효한 정리에서 누락·거절한 필드는 되살리지 않는다. 취소/삭제/버전 변경으로 오래된 비활성 정리는 대상 키를 생략해 원문 fallback을 허용하고 실제 현재 후보 REFINE 대기만 None이다. 원문 fallback도 금액/효능/플랫폼 후보를 걸러내고 usable 대상별 단일/충돌을 공통 unassigned보다 우선한다.
- 조회 때 정리 문구를 현재 금액/효능 detector로 재검사하고 price/health 제외 사유로 보낸다. 내부 modules는 editor 계산에만 사용하며 review 응답에 노출하지 않는다.
- 생산자 수정·확정·제외는 재분석으로 덮어쓰지 않는다. REFINED 저장은 저장된 문구·ID 및 현재 근거와 대조한다. editor는 활성·비제외 필드만, 비편집 save_drafts는 비활성 포함 모든 CONFIRMED 필드를 검사한다. historicalSales 확정 금지; 가격 없는 이력은 REFINED farmStory로 허용.
- 성공 REFINE의 error는 null; 거절은 diagnostics/excluded에 기록한다. post-call SOURCE_CHANGED/PRIVACY_CHANGED는 usage/request_id를 보존한다. 실패 안내는 anchor 파일명과 분리한다.
- detector 단일 원천은 UTF-8 `text_safety_lists.json`; TS 직접 상대 import와 mock rootDir 정렬로 심링크를 제거했다. 금액/효능 저장 차단, 수치/단위·개인정보·대상 검증 유지. JSON 단독 변경도 apps CI와 Vercel 배포를 실행한다(integration은 server/**로 이미 포함).
- 11/01 이번 리뷰의 위 결정과 workflow 범위 확장을 코드 수정 전에 기록했다. 서버 migration0023은 앱보다 먼저/동시에 적용하며 구버전 API 호환 UI는 producer 기록을 따른다. 사용자 지시대로 spec push·PR·알림을 생략한다.

### 작업
- [ ] 서버 구현·회귀 및 전체 검증 최종 확인 (아래 실제 실행 결과 기준)
- [ ] 사람 UI 회귀·Figma 후속 확인 (producer 기록)

### 완료 조건
- [ ] 관련 서버·앱 테스트가 모두 통과한 현재 트리 확인
- [ ] 사람 리뷰 후 별도 PR·머지 (이번 세션 범위 밖)

### 기록
- 11/01 이전 회차 이력 요약: 서버 신규 검증 48→109→176→190개. sandbox pytest 결과 560/32 실패→621/32→688/32→702/32(734개). 실패 ID는 같은 기존32개였고 psutil/sysctl 권한 오류를 재현했다. 실제 전처리 보호·기존 테스트는 완화하지 않았다. 이전 migration upgrade/current는0023, 단일 head 확인. 커밋 시도는 index.lock 권한 거부로 실패했으며 미커밋 유지.
- 11/01 최신 사람 제공 sandbox 밖 결과(이번 수정 전): `cd server && uv run ruff check . && uv run pytest` → ruff 통과, **734 passed / 0 failed**. 기존 sandbox 미완료 기록을 현재 외부 실패로 취급하지 않는다.
- 11/01 이번 리뷰 회귀: 취소 후 추출/자료 삭제2경우, 프롬프트/안전 해시/누락 해시3경우의 fallback→재분석, 조회 금액/효능2경우, 프롬프트 전체 health 제외, UTF-8/파일 SHA 검증. API internal modules 비노출과 안전 필드 보존도 단언한다. 기존 REFINE pending·건강 후보 영양소 복원 금지·shared-only 테스트 유지.
- 11/01 추가 회귀의 최초 실행은 업로드 fixture가 오래된 batchVersion을 사용해2실패/197통과였으며 최신 batch 조회를 추가해2/2 통과했다. 모델·운영 호출은 없다.
- 11/01 이번 수정 후 최종 검증(기존 의존성, `<로컬 DB>`와 `<로컬 캐시>`):
  - `cd server && uv run ruff check . && uv run pytest` → ruff **0 errors**, pytest **711 passed / 32 failed**(743개,129.70초). `test_source_refine.py` **199개 모두 통과**(기존190 + 신규9). 실패 node ID를 실행 전 pytest cache와 대조해 **동일32개 / 신규0개 / 해소0개**를 확인했다. 기존 sandbox 전처리 실패 집합이며 이번 실행의 전체 통과로 기록하지 않는다. 기존 테스트/생산 보호를 완화하지 않았다.
  - 사용자 제공 수정 전 sandbox 밖 **734 passed / 0 failed**와 이번 sandbox 결과를 구분한다. 현재 트리의 전체 pytest743개는 sandbox 밖 재실행이 필요하다. UI/mock 최종 결과는 producer 기록 참조.
  - `git diff --check` 통과. `git diff main...HEAD`652경로는 세션 전 local main 차이이고 `git diff origin/main...HEAD`0건. 미커밋/신규38경로를 위 범위와 대조해 범위 이탈0개. HEAD/ref/index 변경·커밋·실호출·push·PR·새 의존성 없음.
- 11/01 작업 기록 정리: DEV-186의 과거 반복 로그는 이 절로 요약했고 UI 상세는 producer 기록에만 남긴다. 환경은 `<로컬 DB>`·`<로컬 캐시>`로 표기한다. 대표 프롬프트: pre-commit 지적12개 수정과 각 코드 회귀 요청. Agent 시간 / Tokens: 계측 미제공.

### 의도한 커밋 (실행하지 않음)
1. `docs(source): AC-SRC-1/2/3/11 정리 계약과 배포 순서 기록 (DEV-186)` — docs/spec 3개·영문 wiki·server spec/tasks·producer tasks.
2. `feat(source): AC-SRC-2/3/5/10/11 안전한 대상별 정리와 fallback (DEV-186)` — 서버 코드·JSON·migration0023·test_source_refine.py.
3. `feat(producer): AC-SRC-3/5/11 제외 안내와 구버전 API 호환 (DEV-186)` — producer UI·api·workflow·mock harness·Playwright 회귀.
- 11/01 Claude 리뷰 반영(커밋 전 마지막): 정리 결과의 `version`·`safetyListsHash`는 항상 기록되는 필수 키라 `[]`로 읽고, 커밋된 적 없는 해시 없는 형태를 받아주던 테스트 매개변수를 지웠다. `process()`의 버전 중복 검사를 지웠다(`check_inputs`가 검사). 문구에 실제로 반영된 중복·금액 없는 과거 판매 후보는 '뺀 문구' 안내에서 뺀다. DEV-172 절에 잘못 들어간 기록 수정은 되돌렸다.
- 11/01 최종 검증(샌드박스 밖, `<로컬 DB>`): `cd server && uv run ruff check .` → All checks passed. `uv run pytest` → **742 passed**. `npm run typecheck` → 통과. `npm run test:mock` → **46 passed / 0 failed**. Playwright `new-product-composer`·`new-product-two-step`·`source-detail-design`·`source-review-regressions`·`source-editor`·`source-workspace-ui` → **35 passed**. Codex가 브라우저 없이 쓴 회귀 spec은 가짜 API 응답(`serveReview`)과 편집 탭 열기를 고쳐 통과시켰다(앱 코드 문제 아님).
- 11/01 Claude 리뷰 반영(최종 스캔): 배포 전에 저장된 자동 값(UNREVIEWED·EXTRACTED/REFINED)에 금액·효능·운영 문구가 있으면 다시 계산해 자동 채움하지 않는다(`test_AC_SRC_3_legacy_saved_autofill_with_money_is_recomputed`). runs 응답에서 내부 `refinement`를 뺐다(review의 excluded·refinementVersion만 공개). '뺀 문구' 숨김 조건을 `historical`과 `historicalSales` 필드 둘 다로 맞췄다. CI apps 필터에 `text_safety_cases.json`을 더했다. editor.py·service.py 포맷을 정리했다. 재검증: ruff 통과, pytest **743 passed**, Playwright 6개 spec **35 passed**.
