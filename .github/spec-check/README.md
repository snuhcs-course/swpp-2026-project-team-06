# Spec-to-code review 운영 안내

[DEV-40](https://linear.app/sswp6/issue/DEV-40) / [SWPP-90](https://linear.app/sswp6/issue/SWPP-90).
구현 결정은 [spec.md](spec.md), 허용 경로·진행 기록은 이슈별 [tasks/](tasks/) 파일(분리 전 목록은 [tasks.md](tasks.md)).
제품 동작은 바꾸지 않는 CI 전용 도구다.

2026-10-16 사용자 승인으로 배포 범위를 분리했다. DEV-40/PR #107은 기본 비활성인 checker 기반을 제공한다. 아래 API 설정·실제 모델 mismatch/PASS·finding의 사람 판단은 [DEV-55](https://linear.app/sswp6/issue/DEV-55)에서 진행하며, core 머지나 다른 개발의 선행 조건이 아니다. Core PR 자체의 사람 승인 규칙은 유지한다.

## 1. 관리자가 한 번 설정할 항목

현재 작성 시점(2026-10-16)에는 checker 전용 API 키·모델·보호 환경이 확인되지 않았다.
이 README는 설정 완료를 주장하지 않는다.

1. 키/과금 소유자, 사용할 Claude API model ID, 사용 한도를 합의한다. 모델 ID를 추측하거나 fallback하지 않는다.
2. GitHub repository Settings → Environments → spec-check를 생성한다.
3. Required reviewers는 두지 않는다(2026-11-03 DEV-196). 2026-10-18~11-03(DEV-55)에는 팀원 승인을 요구했지만, 결과가 머지를 막지 않는 참고용 체크인데 승인 전까지 체크가 pending으로 남아 PM이 매번 눌러야 했다. 환경은 키·모델 변수를 PR 코드와 분리해 두는 용도로만 쓴다.
4. 이 환경에만 secret `SPEC_CHECK_API_KEY`, variable `SPEC_CHECK_MODEL`을 추가한다. 제품 키·Claude 앱 로그인·개인 CLI 인증을 재사용하지 않는다.
5. 키 소유자는 별도 API workspace의 예산·사용량을 관리한다. 키 값·개인정보는 PR/Linear/로그에 넣지 않는다.
6. checker, prompt, workflow를 바꾸는 PR은 사람 리뷰어가 그 변경을 먼저 본다(모델 job은 그 PR에서도 자동으로 돈다).
7. (DEV-144, 선택) 비용 기록: spec-check 환경에 variable `SPEC_CHECK_USAGE_URL`=`https://api.farmclub.kr/internal/spec-check-runs`, secret `SPEC_CHECK_USAGE_TOKEN`을 넣는다. 같은 값을 Railway `farmclub-api` 변수 `SPEC_CHECK_USAGE_TOKEN`에 넣는다. 지난 실행(artifact 7일치)은 한 번 `SPEC_CHECK_USAGE_URL=… SPEC_CHECK_USAGE_TOKEN=… python3 .github/spec-check/backfill_usage.py`(먼저 `--dry-run`)로 채운다.
8. 팀이 live 실행을 시작할 준비가 되면 Settings → Secrets and variables → Actions → Variables에 repository variable `SPEC_CHECK_ENABLED`를 `true`로 설정한다. 이 값은 environment variable이 아니라 **repository variable**이어야 job 조건에서 읽을 수 있다. 비활성화하려면 삭제하거나 false로 바꾼다.

사용자 요청에 따라 현재 live 실행은 보류한다. 활성화 변수를 설정하지 않았다. 비활성화 시 live job은 SKIPPED이며 모델 PASS가 생성되지 않는다. 활성화 후 접근 오류는 INCOMPLETE로 실패한다.

모델 job은 draft PR에서는 돌지 않고, draft를 해제(ready_for_review)하거나 ready PR에 push·본문 수정이 있을 때 돈다. 같은 PR의 이전 실행은 취소된다(`concurrency: cancel-in-progress`).

### 1.1 결과가 fail일 때

`spec-code-review`는 참고용 체크다. MISMATCH·INCOMPLETE로 fail이어도 머지를 막지 않는다. 대신 PR 작성자가 Checks → 해당 run → Summary(또는 report artifact)를 읽고 PR 코멘트에 처리 결정을 적는다:
- MISMATCH: finding마다 고쳤는지, 스펙을 바꿨는지, 오탐인지(6장 양식).
- INCOMPLETE: 원인(표 형식·경로·입력 한도, 또는 finding+문맥 부족)과 사람 리뷰어가 대신 확인할 것. finding 0건에 UNVERIFIED만 남으면 NO_FINDINGS(초록)이라 코멘트 의무가 없다.
리뷰어는 이 코멘트가 없으면 Approve를 미룬다. 표 형식 문제는 push 전에 `python3 .agents/skills/pr-context/check_table.py <본문 파일>`로 잡는다.

## 2. 일반 PR 작성

SWPP-89의 기존 `Spec ↔ Code 확인` 표를 그대로 사용한다. 별도 체크리스트를 만들지 않는다.
요구사항 셀에는 적용 spec 파일, 구현 셀에는 코드/문서 파일을 backtick으로 기록한다.
한 셀에 여러 경로를 쓸 수 있다. 폴더/glob/외부 URL 대신 정확한 repo 상대 경로를 쓴다.

예시:
```markdown
## Spec ↔ Code 확인
### 작성자 기록
- 적용 스펙 및 FEAT/AC/규칙 ID: 관련 AC를 명시
- 스펙 변경: 없음 — 기존 계약 구현
- 작업 기록: `server/app/orders/tasks/DEV-123.md`

| 요구사항 또는 AC | 구현 파일·함수 또는 변경 문서 | 테스트·검토 근거 |
| --- | --- | --- |
| `docs/spec/functional/FEAT-09-mock-payment.md` AC-09-2 | `server/app/orders/service.py` | 관련 테스트/검토 링크 |

### 사람 리뷰어 확인
- 확인자: @실제리뷰어
- 검토 커밋: 실제 검토 후 기록
- 결과: 확인 전
- 리뷰 링크 및 판단 근거: 실제 검토 후 기록
```

예시 DEV-123은 실제 이슈/완료 증거가 아니다. 실제 PR의 파일과 이슈로 바꾼다.
변경된 파일은 모두 표의 spec/구현 경로에 포함한다. 누락된 변경, 참조할 수 없는 파일, 없는 작업 기록 파일(또는 옛 형식의 없는 tasks.md 이슈 절)은 INCOMPLETE다.

작업 기록은 이슈 파일 `<폴더>/tasks/DEV-123.md`를 가리킨다(DEV-219, ADR 0014). 앵커는 필요 없고 이슈 키는 파일 이름에서 읽는다. 분리 전 형식 `<폴더>/tasks.md#dev-123`도 받으며, 같은 폴더에 `tasks/DEV-123.md`가 있으면 그 파일을 읽는다.
제품 spec이 참조하는 규칙·계약·관련 구현도 표에 넣어 충분한 문맥을 제공한다. 1열 경로 뒤나 3열에 AC·R·M ID(`AC-09-2`, `R-06`)를 적으면 FEAT·rules.md에서 그 항목만 발췌해 보낸다(아래 2.1절).
문서/절차 변경도 관련 spec과 변경 문서 경로로 매핑한다. 확인되지 않은 사람 검토는 채우지 않는다.

### 2.1 모델에 보내는 것·안 보내는 것 (DEV-81)

checker는 바뀐 파일을 통째로 보내지 않는다. 모델이 받는 `context`는 아래와 같고, 합쳐서 1024 KiB(DEV-197, 그 전 256 KiB)를 넘으면 모델 호출 없이 INCOMPLETE("Split the PR")다. 측정(2026-10-23, 머지된 PR 4개): 이전 845 KiB~2.4 MB → 이후 65~231 KiB. #270(76개 파일)은 256 KiB를 넘어 한도를 올렸다.

| 보내는 것 | 내용 |
| --- | --- |
| `diff` | merge-base → head `git diff --unified=5`. lock 파일(`*.lock`, `package-lock.json` 등)·스냅샷·이미지·폰트·`*.min.*`·`*.map`·`docs/wiki/**`는 빼고 `excluded_paths`에 경로만 |
| `documents[<폴더>/tasks/DEV-xx.md]` | 작업 기록 이슈 파일 전체(DEV-219). 옛 형식이면 `tasks.md`의 `## <이슈 키>` 섹션만 |
| `documents[FEAT-xx]` | PR 표(`## Spec ↔ Code 확인` 절 전체)와 작업 기록에 적힌 `AC-xx-y`·`R-xx`·`M-xx`가 있는 줄 + 들여쓴 하위 줄. ID가 없으면 `- [ ] AC-…` 항목 전부 |
| `documents[rules.md]` | 적힌 R·M ID의 표 행만. 없으면 전문 |
| `documents[<폴더>/spec.md]` | "결정" 표에서 이슈 키 또는 ID가 있는 행(+표 머리). 없으면 최근 10행. 결정 표가 없으면 이슈 키 절, 그것도 없으면 제목 줄 |
| 그 밖의 1열 파일 | `경로#앵커`면 그 제목 절만. 아니면 `reference_paths`에 크기만(내용은 보내지 않음) |
| 2열의 **바뀌지 않은** 파일 | 전문(`kind: full`, `selection: context: …`). 판단에 필요한 diff 밖 코드(예: 호출하는 서비스 함수, 스키마, 기존 테스트)를 작성자가 표 2열에 적어 보낸다(DEV-197). 제외 규칙·비밀값 검사는 같다. head에 없는 경로는 `reference_paths`에 `size: null`, 폴더·심링크는 `kind: tree|symlink`로만 남기고 읽지 않는다(DEV-199). finding은 여전히 스펙 세그먼트와 diff 줄만 인용한다 |
| `changed_files` | 바뀐 파일마다 status·크기·이전 크기 |

| 안 보내는 것 | 대신 |
| --- | --- |
| 표의 파일 전문(`files`), 이전 버전 전문(`previous_files`), base 변경본(`target_changes`) | diff가 바뀐 줄을 보여 준다. 보이지 않는 코드·스펙이 판단에 필요하면 모델은 `missing_context`에 `UNVERIFIED: …`를 적고 PASS를 내지 않는다 |
| `docs/spec/README.md` 자동 포함 | 필요하면 표 1열에 `docs/spec/README.md#앵커`로 적는다 |

발췌 문서의 줄 번호는 원본 파일 기준이라 보고서의 `rules.md:12`는 실제 파일 12행이다. 코드 인용은 diff에서 계산한 새 쪽 줄 번호(추가·문맥 줄)만 받고, 지운 줄은 인용할 수 없다. 틀린 줄 번호·인용이 붙은 지적은 검증에서 버려지고 summary에 `n finding(s) dropped`로 남는다(DEV-211). 버린 뒤 검증된 지적이 없으면 INCOMPLETE → NO_FINDINGS(초록), 검증된 지적이 남으면 MISMATCH 그대로. 모델이 PASS라며 지적을 붙인 경우는 INCOMPLETE다. 어느 경우에도 PASS로 새지 않는다.

## 3. 실행과 결과

- main 대상 PR의 생성/커밋/본문 수정/재오픈/ready 이벤트에 실행한다. 결정론 job(`eligibility`·`figma-line`·`checker-tests`)은 draft에서도 돌고, 모델 job(`spec-code-review`·`live-demo`)은 draft를 건너뛴다(DEV-196).
- fork/bot PR은 SKIPPED 안내 후 수동 리뷰한다.
- `checker-tests`는 키 없이 계약을 검증한다.
- checker 실행 파일은 GitHub의 고정 test-merge SHA에서 가져오므로 core 머지 전 생성된 feature branch에도 checker가 존재한다. 검토 대상의 head/base SHA는 바꾸지 않으며 실행 코드의 runner SHA를 별도로 기록한다.
- `spec-code-review`는 ready PR에서 자동으로 고정한 PR revision을 읽고 실제 모델을 호출한다(draft 제외, DEV-196).
- live job은 `SPEC_CHECK_ENABLED=true`일 때만 실행한다. 비활성화된 동안에도 키 없는 계약 검증은 실행한다.
- Checks → 해당 run → Summary와 report artifact를 확인한다.
- 비용(DEV-144): 모델이 응답한 실행은 PR 번호·제목·결과·모델·입력/출력 토큰을 farmclub 서버(`SPEC_CHECK_USAGE_URL`)로 보내고, 관리자 페이지 [AI 비용](https://admin.farmclub.kr/ai-cost)의 '코드 리뷰(spec-check)' 줄과 목록에서 본다(서버 AI 기능 비용과 함께 합계). 금액은 서버 단가표(`server/app/admin/ai_usage.py` `PRICES`)로 계산한 추정치다. 보고 실패는 경고 한 줄만 남기고 리뷰 결과는 그대로다. `SPEC_CHECK_USAGE_URL`(environment variable)·`SPEC_CHECK_USAGE_TOKEN`(environment secret)이 없으면 보내지 않는다.

| 결과 | 의미와 조치 |
| --- | --- |
| PASS (exit 0) | 제공된 범위에서 불일치가 발견되지 않음. 일반 테스트/사람 리뷰 계속 |
| NO_FINDINGS (exit 0) | 보이는 범위에서 지적(finding) 0건이지만 diff 밖 문맥이 있어 모델이 `UNVERIFIED`를 남김(DEV-197), 또는 인용을 확인할 수 없어 버린 지적만 있었음(summary의 `dropped`, DEV-211). 체크는 초록. PASS가 아니므로 `Missing context` 항목은 사람 리뷰어가 본다. 더 보여 주려면 표 2열에 그 파일을 적는다(2.1절) |
| MISMATCH (exit 1) | 검증 가능한 근거가 있는 지적. 사람이 확인·해결 |
| INCOMPLETE (exit 2) | 키/모델/표 형식/응답 오류 또는 크기 제한, 또는 finding이 있는데 문맥이 모자라 MISMATCH로 확정하지 못함. 원인을 해소하고 재실행 |
| SKIPPED (exit 0 + 명시 안내) | v1 지원 대상이 아님. PASS가 아님 |

모델 응답의 `thinking`·`redacted_thinking` 블록(adaptive thinking 기본값인 모델)은 읽지 않고 버리고, text 블록의 리뷰 JSON만 검증한다(DEV-79). text 블록이 없거나 다른 블록(`tool_use` 등)이 섞이면 `Unexpected model content type: <type>.` INCOMPLETE이며, 메시지에는 블록 type 이름만 남는다.

보고서는 metadata의 head/base/merge-base SHA, PR 본문 digest, mode, 모델/프롬프트 버전과 실행 URL에 연결된다.
코드나 PR 본문이 바뀌면 과거 결과를 최신 검토 증거로 사용하지 않는다.
상세/JSON 보고서는 7일 보관한다. 주요 finding과 사람 판단은 만료 전에 PR/Linear에 복사한다.
새 check는 초기에는 branch protection의 필수 항목으로 등록하지 않는다. 확인된 결함을 무시해도 된다는 뜻은 아니다.

## 4. DEV-40 genuine demo 증거

API 설정 후 이 PR 본문에 `<!-- spec-check-demo -->`를 넣거나 유지한다.
그러면 별도 live-demo mismatch/matched job이 같은 수집·모델·검증·보고 경로로 각 fixture를 읽는다.
두 파일은 생산 코드와 연결되지 않는다. 결과를 hardcode하거나 mock 모델을 쓰지 않는다.

- mismatch.py는 0을 허용하므로 실제 모델이 DEMO-AC-01 위반을 보고해야 한다. MISMATCH 보고와 **빨간 job**이 예상 결과다.
- matched.py는 > 0으로 고친 버전이다. 실제 모델의 PASS와 **초록 job**을 확보한다.
- 추가 assertion은 실제 보고서가 예상 결과인지 확인할 뿐, 보고서 내용을 바꾸지 않는다.
- INCOMPLETE/키 오류/계약 테스트 성공을 genuine 모델 증거로 대신 쓰지 않는다.
- demonstration mode는 두 fixture만 평가한다. 일반 PR 전체 검토 결과와 구분한다.
- 전체 PR(diff + 발췌 + 문맥 파일)이 1024 KiB를 넘으면 일반 검토는 INCOMPLETE일 수 있다. demo PASS로 전체 PR 검토를 통과 처리하지 않는다. demo 모드는 fixture `spec.md`를 full 문서로, 구현 fixture를 빈 트리 대비 diff로 보내 같은 검증 경로를 쓴다.

실제 모델 결과가 예상과 다르면 그 결과를 보존하고 프롬프트/수집 문맥/검증을 조사한다.
단순 재실행으로 원래 finding이 사라졌다고 해결 처리하지 않는다.
실제 run URL 및 사람 판단은 [EVIDENCE.md](EVIDENCE.md)에 기록한다.

## 5. 사람이 지적을 해결하는 법

PR 댓글 또는 리뷰에 다음을 남긴다:
```text
Finding ID / run URL:
검토 head SHA:
실제 리뷰어:
판단: CONFIRMED_CODE_DEFECT / APPROVED_SPEC_CHANGE / FALSE_POSITIVE / NEEDS_CLARIFICATION
spec/code/test 근거:
수정 commit 또는 수정하지 않는 이유:
후속 run URL:
남은 제한:
```

코드 결함이면 수정 후 다시 확인한다. 의도한 요구사항 변경이면 사람의 합의를 기록하고 spec/wiki/테스트를 맞춘다.
false positive면 실제 근거와 리뷰어 판단을 남긴다. 요구사항이 모호하면 명확히 한 뒤 승인한다.
AI/작성자는 사람 승인·리뷰어 이름을 대신 기록하지 않는다.

## 6. 검증 및 제한

```sh
python3 -m unittest discover -s .github/spec-check -p 'test_*.py' -v
actionlint .github/workflows/spec-check.yml
```

계약 검증은 API 응답을 mock하며 비용이 없다. genuine API 결과와 구분한다.
제품 코드를 실행/설치/import하지 않는다. Python 표준 라이브러리만 사용한다.
review input와 prompt 합계 1024 KiB(DEV-197), 출력 16000 tokens(thinking 포함), 요청 90초, transient retry 1회, job 5분이다.
문맥을 잘라 PASS로 만들지 않는다. 발췌(2.1절)는 정해진 규칙으로 고르고, 다 못 보내면 INCOMPLETE다. 바이너리/비밀 파일/누락 경로/큰 diff는 INCOMPLETE로 수동 검토가 필요하다.
v1은 명시적 경로 표를 사용한다. 자동 의미 검색·외부 문서 수집·모든 종류의 비밀 탐지·정확성 보증을 제공하지 않는다.
비밀로 의심되는 선택 문맥은 전송하지 않지만, 검토자는 선택한 파일에 민감 정보가 없는지 확인해야 한다.

## 참고

- [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub protected environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create)
- [Claude workspace limits](https://platform.claude.com/docs/en/manage-claude/workspaces)

## 7. Figma 줄 검사 (DEV-88)

만든 계기: [DEV-74](https://linear.app/sswp6/issue/DEV-74)(PR #158, 생산자 앱 카카오 로그인)는 `apps/producer/src/app/login.tsx`의 로그인 화면(P02)을 바꿨지만 `tasks.md` 비범위에 "Figma"를 적고 넘어갔다. 머지 뒤 Figma P02만 옛 화면으로 남아 10/19에 손으로 맞췄다. #158 본문과 바뀐 파일로 이 검사를 돌리면 "Figma 줄이 없다"로 실패한다.

`figma-line` 잡은 모델·키 없이 도는 결정적 검사다(`figma_line.py`, 테스트 `test_figma_line.py`는 checker-tests가 함께 돌린다).
`apps/*/src/**`, `packages/ui/src/**`, `scripts/admin-web/**`(테스트·문서·설정 파일 제외: 점 파일, `*.md`, `package.json`, `vercel.json`)가 바뀐 PR은 본문 `## Figma` 절에 한 줄을 적어야 한다.

```text
Figma: 반영함 — https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=343-5945
Figma: 해당 없음 — 서버 호출만 바꿨고 화면은 같다
Figma: 후속 — DEV-90
```

줄이 없거나, 둘 이상이거나, 세 값 밖이거나, 값 뒤가 비었거나, `반영함`에 Figma 링크·node-id가 없거나, `후속`에 `DEV-숫자`가 없으면 실패한다. HTML 주석 안 줄은 세지 않는다. 본문을 고치면 다시 돈다.

```sh
python3 -m unittest discover -s .github/spec-check -p 'test_figma_line.py' -v
```
