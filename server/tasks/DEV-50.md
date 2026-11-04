## DEV-50 운영자·AI 스토리 테스트 재실행 (수정 후)
- 이슈: [DEV-50](https://linear.app/sswp6/issue/DEV-50) (GitHub [#95](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/95))
- 브랜치: `zahra/dev-50-manager-ai-regression`
- 스토리: M01·M02·M03·C06 (Linear 문서 "I2 user stories")
- 상태: 완료

### 목표
I2 수정(DEV-30·31·35·39·59·47) 뒤 운영자·AI 테스트를 main에서 다시 돌리고, 결과를 스토리별로 연결해 `docs/wiki/Testing-Documentation.md`에 남긴다.

### 범위 (수정 허용 경로)
- `docs/wiki/Testing-Documentation.md`(DEV-50 절만), `server/tasks.md`
- 제품 코드·테스트 변경 없음

### 결정 사항
- 10/18 Railway에서는 읽기만 한다(접근 차단, 운영자 조회, AI 미리보기). 승인·환불 같은 변경은 테스트 2 공용 시드를 지키려고 로컬에서만 한다.
- 10/18 테스트 1은 Mock 빌드라 서버 기록이 없어 이 재실행 범위에 넣지 않는다.

### 기록
- 10/18 main `a7e41db`: pytest 328 통과, Ruff 통과. 스토리별 M01 13·M02 4·M03 30·C06 33 통과. mock 13, typecheck 4 workspace 통과. `test:integration:full` 실서버 7 + Chromium 43 통과(재시도 없음). 첫 실행은 시작 중에 `npm ci`를 같이 돌려 Expo가 뜨지 못해 실패했고, 단독 재실행으로 통과. 로컬 HTTP 체크 49/49.
- 10/18 Railway(배포 `a7e41db`) AI 미리보기: "원산지가 어디예요?" ×2 HANDOFF, 상품명 ANSWER(`product:p-house`), 실측 당도 ANSWER, 농약 HANDOFF. 비운영자 72요청 401/403/403. 운영자 조회 7개 200은 02:20 배포 `850a1a9`에서 현님이 발급한 토큰으로 확인(새 시드라 목록은 비어 있음).
- 10/19 main `c98be9b`(DEV-68 #141, 카카오 로그인 #121·#158 포함)를 병합해 다시 확인: pytest 364 통과, Ruff 통과, 스토리별 M01 13·M02 4·M03 30·C06 33 그대로, mock 15, typecheck 4 workspace 통과. 로컬 typecheck가 처음엔 `/farm/account`·`/onboarding` 경로 오류로 실패했는데, 예전 `expo start`가 만든 `.expo/types/router.d.ts`(gitignore)가 낡아서였고 지운 뒤 통과(CI에는 이 파일이 없음).

