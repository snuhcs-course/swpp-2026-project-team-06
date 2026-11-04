## DEV-67 소비자·생산자 앱 Vercel 자동 배포

- 이슈: [DEV-67](https://linear.app/sswp6/issue/DEV-67) · GitHub #134
- 브랜치: `nemodleo/dev-67-dev-소비자생산자-앱-vercel-자동-배포actions-export`
- 기능·인수 조건: 배포(DEV-65·66 후속). 제품 FEAT·AC 없음. 생산자 앱도 같은 워크플로라 기록은 여기 한 곳에 둔다
- 상태: 리뷰 중

### 목표
앱 코드가 main에 머지되면 사람이 로컬에서 export·업로드하지 않아도 두 앱이 Vercel에 배포되게 한다. 서버 주소·Mock 여부는 레포 설정으로 바꾼다.

### 범위 (수정 허용 경로)
- `.github/workflows/deploy-vercel.yml`(새 파일), `README.md` Apps on Vercel 절, `docs/spec/tech-design/stack.md` CI/CD 행, `apps/consumer/tasks.md`

### 비범위
- 앱·패키지 코드, `scripts/local.mjs`(`npm run build:web`은 로컬 Mock 빌드로 유지), Vercel 프로젝트 설정·GitHub 연결, 레포 시크릿·변수 등록(사람)

### 결정 사항
- 10/18 서버 배포(DEV-66)와 같은 방식: `workflow_run`(CI 성공, main push) → CI가 검사한 `head_sha` 체크아웃 → 그 커밋에 `apps/`·`packages/`·루트 `package*.json`·`.nvmrc`·워크플로 변경이 있으면 배포. 수동 실행은 항상 배포.
- 10/18 `VERCEL_TOKEN`이 없으면 실패가 아니라 건너뛰고 notice(옵트인). 라이브 앱이 바뀌는 시점을 토큰 등록이라는 사람의 행동에 묶는다. 서버(DEV-65)는 이미 켜져 있어 없으면 실패시키는 것과 다름.
- 10/18 모드는 레포 변수 `APP_API_URL`: 비면 `EXPO_PUBLIC_API_MOCK=1`, 있으면 `EXPO_PUBLIC_API_MOCK=0` + 그 주소. `EXPO_PUBLIC_CONSUMER_URL`·`PRODUCER_URL`은 Vercel 도메인으로 고정(로컬 `build:web`은 localhost를 넣음).
- 10/18 Vercel 식별자(조직·프로젝트 ID)는 비밀값이 아니라 워크플로에 직접 둔다. `vercel deploy <dist> --prod`는 `VERCEL_ORG_ID`·`VERCEL_PROJECT_ID` 환경 변수로 링크 없이 동작. CLI는 로컬과 같은 48.x.
- 10/18 배포 뒤 사이트 200 응답을 최대 2분 확인.

### 작업
- [x] 워크플로 [x] README·stack.md [x] actionlint [x] 로컬에서 서버 모드 export 확인

### 완료 조건
- [x] `actionlint` 통과
- [ ] 토큰 등록 뒤 수동 실행 1회로 두 사이트 200 확인(사람이 시점 결정)

### 기록
- 10/18 로컬 확인: `apps/consumer`에서 `EXPO_PUBLIC_API_MOCK=0 EXPO_PUBLIC_API_URL=https://farmclub-api-production.up.railway.app … npx expo export -p web` 성공, 번들에 서버 주소 포함, `localhost:808x` 참조 없음. 실제 Vercel 업로드는 토큰이 없어 실행하지 않음.

