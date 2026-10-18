# Spec-to-code review 운영 안내

[DEV-40](https://linear.app/sswp6/issue/DEV-40) / [SWPP-90](https://linear.app/sswp6/issue/SWPP-90).
구현 결정은 [spec.md](spec.md), 허용 경로·진행 기록은 [tasks.md](tasks.md).
제품 동작은 바꾸지 않는 CI 전용 도구다.

2026-10-16 사용자 승인으로 배포 범위를 분리했다. DEV-40/PR #107은 기본 비활성인 checker 기반을 제공한다. 아래 API 설정·실제 모델 mismatch/PASS·finding의 사람 판단은 [DEV-55](https://linear.app/sswp6/issue/DEV-55)에서 진행하며, core 머지나 다른 개발의 선행 조건이 아니다. Core PR 자체의 사람 승인 규칙은 유지한다.

## 1. 관리자가 한 번 설정할 항목

현재 작성 시점(2026-10-16)에는 checker 전용 API 키·모델·보호 환경이 확인되지 않았다.
이 README는 설정 완료를 주장하지 않는다.

1. 키/과금 소유자, 사용할 Claude API model ID, 사용 한도를 합의한다. 모델 ID를 추측하거나 fallback하지 않는다.
2. GitHub repository Settings → Environments → spec-check를 생성한다.
3. Required reviewers에 팀원을 추가한다. 2026-10-18 팀 결정(DEV-55)으로 Prevent self-review는 필수가 아니다. PR 작성자가 승인자 목록에 있으면 자기 PR의 실행을 직접 승인할 수 있다. 관리자의 우회 승인(Allow administrators to bypass)은 끈다.
4. 이 환경에만 secret `SPEC_CHECK_API_KEY`, variable `SPEC_CHECK_MODEL`을 추가한다. 제품 키·Claude 앱 로그인·개인 CLI 인증을 재사용하지 않는다.
5. 키 소유자는 별도 API workspace의 예산·사용량을 관리한다. 키 값·개인정보는 PR/Linear/로그에 넣지 않는다.
6. PR에서 실행할 checker, prompt, workflow, action commit을 검토한 뒤에 환경 job을 승인한다. 환경 승인은 코드 리뷰의 Approve와 별개다.
7. 팀이 live 실행을 시작할 준비가 되면 Settings → Secrets and variables → Actions → Variables에 repository variable `SPEC_CHECK_ENABLED`를 `true`로 설정한다. 이 값은 environment variable이 아니라 **repository variable**이어야 job 조건에서 읽을 수 있다. 비활성화하려면 삭제하거나 false로 바꾼다.

사용자 요청에 따라 현재 live 실행은 보류한다. 활성화 변수를 설정하지 않았다. 비활성화 시 live job은 SKIPPED이며 모델 PASS가 생성되지 않는다. 활성화 후 접근 오류는 INCOMPLETE로 실패한다.

모델 job에는 환경 설정을 읽는 `actions: read`도 필요하다. 설정을 읽지 못하거나 required reviewers가 없으면 API 호출 전에 INCOMPLETE가 된다(prevent-self-review는 확인하지 않는다). 저장소 설정 권한이 없는 작성자는 관리자가 처리해야 한다.

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
- 작업 기록: `server/app/orders/tasks.md#dev-123`

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
변경된 파일은 모두 표의 spec/구현 경로에 포함한다. 누락된 변경, 참조할 수 없는 파일, 없는 tasks 이슈 절은 INCOMPLETE다.
제품 spec이 참조하는 규칙·계약·관련 구현도 표에 넣어 충분한 문맥을 제공한다.
문서/절차 변경도 관련 spec과 변경 문서 경로로 매핑한다. 확인되지 않은 사람 검토는 채우지 않는다.

## 3. 실행과 결과

- main 대상 PR의 생성/커밋/본문 수정/재오픈/ready 이벤트에 실행한다. draft에서도 실행한다.
- fork/bot PR은 SKIPPED 안내 후 수동 리뷰한다.
- `checker-tests`는 키 없이 계약을 검증한다.
- checker 실행 파일은 GitHub의 고정 test-merge SHA에서 가져오므로 core 머지 전 생성된 feature branch에도 checker가 존재한다. 검토 대상의 head/base SHA는 바꾸지 않으며 실행 코드의 runner SHA를 별도로 기록한다.
- `spec-code-review`는 보호 환경 승인 후 고정한 PR revision을 읽고 실제 모델을 호출한다.
- live job은 `SPEC_CHECK_ENABLED=true`일 때만 실행한다. 비활성화된 동안에도 키 없는 계약 검증은 실행한다.
- Checks → 해당 run → Summary와 report artifact를 확인한다.

| 결과 | 의미와 조치 |
| --- | --- |
| PASS (exit 0) | 제공된 범위에서 불일치가 발견되지 않음. 일반 테스트/사람 리뷰 계속 |
| MISMATCH (exit 1) | 검증 가능한 근거가 있는 지적. 사람이 확인·해결 |
| INCOMPLETE (exit 2) | 키/모델/환경/문맥/응답 오류 또는 크기 제한. 원인을 해소하고 재실행 |
| SKIPPED (exit 0 + 명시 안내) | v1 지원 대상이 아님. PASS가 아님 |

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
- 전체 PR이 60 KiB를 넘으면 일반 검토는 INCOMPLETE일 수 있다. demo PASS로 전체 PR 검토를 통과 처리하지 않는다.

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
review input와 prompt 합계 60 KiB, 출력 4096 tokens, 요청 60초, transient retry 1회, job 5분이다.
문맥을 잘라 PASS로 만들지 않는다. 바이너리/비밀 파일/누락 경로/큰 파일은 INCOMPLETE로 수동 검토가 필요하다.
v1은 명시적 경로 표를 사용한다. 자동 의미 검색·외부 문서 수집·모든 종류의 비밀 탐지·정확성 보증을 제공하지 않는다.
비밀로 의심되는 선택 문맥은 전송하지 않지만, 검토자는 선택한 파일에 민감 정보가 없는지 확인해야 한다.

## 참고

- [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub protected environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create)
- [Claude workspace limits](https://platform.claude.com/docs/en/manage-claude/workspaces)
