## DEV-33 소비자·생산자 앱 EAS 네이티브 빌드 전환

- 이슈: [DEV-33](https://linear.app/sswp6/issue/DEV-33) · 결정 근거: [소비자·생산자 앱 스토어 배포 방식 결정](https://claude.ai/artifact/RMzRFujnLGCMvGB927ozKc) · 관련 DEV-128(계정, 사람), DEV-129(CI, 범위 밖), DEV-41(설치 확인)
- 브랜치: `nemodleo/dev-33-eas-native-builds`
- 기능·인수 조건: FEAT-01 AC-01-13·AC-01-16(카카오 로그인 복귀가 앱에서도 같은 화면으로), PRD N-01은 웹 그대로 유지 · 화면 변경 없음
- 상태: 리뷰 중
- 생산자 앱 쪽 기록: `apps/producer/tasks.md#DEV-33`, 공용 패키지: `packages/api/tasks.md#DEV-33`, `packages/ui/tasks.md#DEV-33`

### 목표
같은 Expo 코드로 iOS·Android 네이티브 앱을 EAS Build로 내고 JS는 EAS Update로 반영한다(결정 2026-10-23). 웹 출력·배포는 그대로 두고, 웹 전용 코드를 플랫폼별 파일로 나누며, 카카오 로그인이 앱에서도 돌아오게 한다. 계정(DEV-128)이 없어 빌드·제출은 사용자가 실행할 명령으로 남긴다.

### 범위 (수정 허용 경로)
- `apps/consumer/{app.json,eas.json,package.json,vercel.json,README.md}`, `apps/consumer/public/{index.html,manifest.webmanifest,.well-known/**}`
- `apps/consumer/src/app/login.tsx`, `src/app/auth/kakao.tsx`, `src/lib/kakao.ts`(웹), 새 파일 `src/lib/kakao.native.ts`, `src/lib/kakaoAuth.ts`·`kakaoAuth.native.ts`, `src/lib/views.tsx`(copyText)
- `apps/producer/**` 같은 경로(`apps/producer/tasks.md#DEV-33`), `apps/producer/src/lib/{pick,sourceFiles}.native.ts`, `sourceFiles.ts`(`PickedFile` 타입)·`SourceAttachments.tsx`(`PickedFile`, 네이티브 미리보기 uri), `DetailEditor.tsx`·`ProductPageEditor.tsx`·`SourceWorkspace.tsx`(beforeunload 가드), `views.tsx`(copyText)
- `packages/api/src/{client.ts,storage.ts,storage.native.ts,objectUrl.ts,objectUrl.native.ts,upload.ts,index.ts,productWorkspace.ts,sourceAnalysis.ts}`(뒤 둘은 업로드 함수의 파일 타입만), `packages/api/package.json`
- `packages/analytics/src/{index.ts,client.ts,client.native.ts}`, `packages/analytics/package.json`
- `packages/ui/src/{ChatThread.tsx,NewsRoom.tsx,useLiveList.ts,foreground.ts,PrivatePhotos.tsx,pickPhoto.ts,pickPhoto.native.ts,index.ts}`, `packages/ui/package.json`, `packages/ui/src/web.ts`(`safe()`에 네이티브 안전 영역 인셋, 10/23 iOS 확인에서 추가)
- `apps/consumer/src/app/_layout.tsx`·`apps/producer/src/app/_layout.tsx`(`<StatusBar style="dark" />` 한 줄, 10/24 Android 확인에서 추가. 화면 모양 변경 아님)
- 루트 `package.json`·`package-lock.json`(의존성, `test:mock`), `scripts/test-native-config.mjs`(새 파일), `.gitignore`
- 문서: `docs/spec/tech-design/stack.md`, `docs/spec/tech-design/adr/0013-eas-native-builds.md`(새 파일), `docs/wiki/Design-Documentation.md`, `README.md`, 두 앱 `spec.md`·`tasks.md`, `packages/{api,ui,analytics}/spec.md`, `packages/{api,ui}/tasks.md`, `docs/evaluation/he-2026-11-04/README.md`(11/03 APK Release 링크 한 줄)

### 비범위 (건드리지 않음)
- 서버(`server/**`): 카카오 복귀 주소 검증은 지금 값(`<앱 주소>/auth/kakao`)을 그대로 쓴다. 서버 변경 없음.
- `.github/workflows/**`(CI·배포 자동화는 DEV-129), 스토어·EAS 계정과 인증서(DEV-128), 스토어 심사 제출 정보(DEV-131), Sign in with Apple(DEV-130), 회원 탈퇴(DEV-75·94)
- 로컬 네이티브 빌드(`expo run:*`, `eas build --local`), prebuild 산출물(`ios/`·`android/`) — 커밋하지 않는다
- PR #164의 `apps/android-twa` 셸(닫기는 사용자 확인 뒤), Figma v6
- 푸시 알림(FEAT-18), 앱 딥링크(농가·상품 주소를 앱으로 열기)

### 결정 사항
- 10/23 식별자: iOS `bundleIdentifier`·Android `package` = `kr.farmclub.consumer` / `kr.farmclub.producer`(DEV-128 콘솔 앱 생성 값과 같게). `scheme`은 지금 값(`farmclub-consumer`·`farmclub-producer`) 유지.
- 10/23 플랫폼 분기는 Metro 확장자(`*.native.ts`)를 우선하고, 한 줄 차이는 `Platform.OS === "web"`으로 한다. 웹 파일(`kakao.ts` 등)은 런타임 import 없이 두어 기존 Node 테스트(`scripts/test-producer-kakao.mjs`)가 그대로 돈다. 공용 패키지의 `window`·`document`·`localStorage`·`sessionStorage` 직접 호출은 `*.web.ts`·`web.ts` 밖에서 금지하고 `scripts/test-native-config.mjs`가 검사한다(결정 문서 "웹 전용 코드 격리").
- 10/23 카카오 복귀(네이티브): 카카오 콘솔·서버의 복귀 주소는 그대로 `https://farmclub.kr/auth/kakao`(생산자 `https://farm.farmclub.kr/auth/kakao`)다. 앱은 `expo-web-browser` `openAuthSessionAsync`로 인가 화면을 열고 `state`를 `app-<nonce>`로 보낸다. 웹 복귀 화면(`/auth/kakao`)은 `state`가 `app-`으로 시작하면 코드를 그대로 앱 스킴(`farmclub-consumer://auth/kakao?code&state`)으로 넘기고, 앱은 그 결과로 `/auth/kakao` 화면을 열어 기존 흐름(state 대조 → `POST /api/auth/kakao` → 복귀)을 탄다. 서버가 받는 `redirectUri`는 웹과 같은 값이라 서버 변경이 없다. Universal Links·App Links 대신 커스텀 스킴을 쓰는 이유: 인증 세션(ASWebAuthenticationSession·Custom Tabs) 안의 302 리다이렉트는 앱 링크로 앱을 열지 않고, App Links 검증에는 DEV-128 뒤에야 생기는 서명 지문이 필요하다. `apple-app-site-association`·`assetlinks.json`은 두 앱 `public/.well-known/`에 자리표시자(Team ID·지문)로 두고 `vercel.json`이 `application/json`으로 응답하게 한다. 지문·Team ID를 채우면 같은 `/auth/kakao` 화면이 앱 링크 진입도 처리한다.
- 10/23 Android(AI 1차 리뷰): expo-web-browser 57은 Android에서 인증 세션을 폴리필로 돌려 복귀 스킴을 `Linking` ‘url’ 이벤트로 받고, 같은 이벤트를 expo-router도 받아 `/auth/kakao`로 먼저 이동한다. 로그인 화면이 다시 `router.replace`하면 화면이 리마운트돼 두 번째 인스턴스가 ‘만료’를 띄우므로, `kakaoAuth.native.ts`는 Android에서 결과를 돌려주지 않고(null) 딥링크 이동에 맡긴다. iOS는 ASWebAuthenticationSession이 스킴을 가로채 딥링크가 오지 않으므로 결과로 이동한다. DEV-41 확인 항목: Android 복귀 뒤 `next`·`resume` 유지.
- 10/23 iOS 키체인 값(토큰)은 앱을 지워도 남는다. 첫 실행에 지울지는 DEV-41·탈퇴(DEV-75) 때 결정한다(지금은 그대로).
- 10/23 복귀 정보(`next`·`resume`·nonce)는 네이티브에서 메모리에 둔다. 인증 세션이 열려 있는 동안 앱 프로세스가 살아 있고, 드물게 죽으면 홈으로 간다(기존 만료 안내).
- 10/23 토큰: 네이티브는 `expo-secure-store`(동기 `getItem`·`setItem`, 키의 `:`는 `.`로). 그 밖의 앱별 저장값(도움말 본 기록 등)도 2KB 이하면 SecureStore, 넘으면 메모리(Mock DB는 웹 전용). 웹은 지금처럼 localStorage.
- 10/23 PostHog: 네이티브는 `posthog-react-native`(화면 이벤트 `screen`, identify·reset 같음, 세션 녹화 끔). DEV-125 허용 호스트 검사는 웹에만. 키는 EAS 환경 변수 `EXPO_PUBLIC_POSTHOG_KEY`로 빌드 때 넣는다.
- 10/23 사진 선택: 네이티브는 `expo-image-picker`(비공개 사진 첨부, 생산자 사진·영상·소식). 업로드는 `{uri, name, type}`을 `FormData`에 붙인다(`UploadFile` 타입). 600px 축소는 웹에서만 하고 네이티브는 picker `quality: 0.8`로 보낸다. 생산자 원본 자료의 PDF·텍스트 첨부는 웹 전용으로 남긴다(네이티브는 사진만, 후속).
- 10/23 복사·공유: 복사는 `expo-clipboard`(지시 목록에 없던 의존성 하나. 주문 번호·계좌·운송장·링크 복사 버튼 5곳이 네이티브에서 조용히 실패하지 않게). 바깥 주소는 기존 `Linking`.
- 10/23 `eas.json`: `development`(dev client, internal) · `preview`(채널 `preview`, 스토어 형식 빌드라 TestFlight·Play 내부 테스트에 바로 제출) · `production`(채널 `production`). `autoIncrement`, `appVersionSource: remote`. 서버 주소 등 `EXPO_PUBLIC_*`는 프로필 env에 둔다(웹 배포 워크플로와 같은 값).
- 10/23 `internal` 프로필 추가(사용자 요청): `preview`를 상속하고 `distribution: internal`, Android APK, iOS 시뮬레이터 빌드. 스토어 유료 등록이 I3로 미뤄져 I2 내부 테스트는 Expo 무료 계정만으로 Android 실기기(APK 링크)·iOS 시뮬레이터에서 한다. README "Internal testing without store accounts".
- 10/23 `updates.url`은 EAS 프로젝트 ID가 있어야 하는 값이라 레포에 자리표시자를 두지 않는다(잘못된 URL로 빌드되면 앱이 시작 때 업데이트 설정 오류를 낸다). `eas init` → `eas update:configure`가 `extra.eas.projectId`·`updates.url`을 app.json에 쓴다(README). `runtimeVersion: { policy: "fingerprint" }`는 지금 넣는다.
- 10/23 두 앱 `index.html`에 PR #164의 manifest·홈 화면 메타를 가져온다(DEV-41 iOS 생산자 홈 화면 주소창 문제). `assetlinks.json`의 TWA 지문은 EAS 서명 키와 다르므로 자리표시자로 바꾼다.
- 10/23 웹 복귀 화면의 앱 전달은 `window.location.replace(앱 스킴)`이고, Android Chrome(Custom Tabs)이 스크립트로 시작한 커스텀 스킴 이동을 사용자 제스처 없이 막을 수 있어 ‘앱 열기’ 버튼(사용자 탭)을 같이 보인다. 실기기 확인은 DEV-41. 안 되면 서버 콜백이 302로 앱 스킴으로 보내는 방식(서버 변경)을 후속으로 검토한다.
- 10/23 `expo-doctor`가 알리는 기존 패키지 패치 버전 차이(expo·expo-router·expo-constants·expo-linking·@expo/metro-runtime)는 이번 변경과 무관해 올리지 않았다(의존성 일괄 변경 금지). 첫 빌드 전에 `npx expo install --check`로 맞추는 것을 권한다.

### 작업
- [x] 소비자 `app.json`·`eas.json`, 의존성(`npx expo install` expo-updates·secure-store·web-browser·image-picker·clipboard·file-system·application·device·localization, posthog-react-native)
- [x] `packages/api` 저장소 분리(SecureStore), `UploadFile`, 비공개 사진 주소
- [x] `packages/analytics` posthog-react-native 분기
- [x] `packages/ui` 포그라운드 판단(AppState), 비공개 사진 네이티브 선택
- [x] 소비자 카카오: 네이티브 인가 세션·메모리 복귀 정보·웹 복귀 화면의 앱 전달
- [x] 생산자 같은 방식 + 사진·영상 선택·beforeunload 가드·복사
- [x] `public/.well-known`·manifest·`vercel.json` 헤더(두 앱)
- [x] `scripts/test-native-config.mjs`(설정·JSON·웹 전용 코드 격리·카카오 상태 값) → `test:mock`
- [x] 검증: `npx expo-doctor`, `npx expo config --type public`, `expo export -p web|ios|android`(JS 번들만), `npm run typecheck`, `npm run test:mock`, Playwright 카카오 spec(아래 기록)
- [x] 문서: stack.md, ADR 0013, wiki 한 줄, README(사용자가 실행할 순서), spec.md

### 완료 조건
- [ ] 소비자·생산자 앱 EAS 전환(이슈 완료 조건 2·3): 설정·식별자·플랫폼 분리·토큰·카카오 복귀·PostHog. 웹 빌드·`test:mock`·Playwright 그대로 통과
- [ ] `eas build`·`eas submit`·설치 확인은 계정(DEV-128) 뒤 사용자가 실행 → 이슈 기록에 명령 체크리스트
- [ ] 테스트 통과
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/23 origin/main 9436171에서 시작. 디스크 여유 약 4GB라 루트 `npm ci` 한 번, 로컬 네이티브 빌드는 하지 않는다.
- 10/23 검증(모두 이 worktree에서 실행): `npm run typecheck` 5개 워크스페이스 통과 · `npm run test:mock` 51/51(새 `test-native-config.mjs` 11개 포함) · `npx expo config --type public` 두 앱 식별자·`runtimeVersion` 확인 · `npx expo export -p web`(두 앱, `dist/.well-known`·`manifest.webmanifest` 포함) · `npx expo export -p ios`·`-p android`(두 앱, Hermes 번들에 expo-secure-store·posthog-react-native·openAuthSessionAsync 포함, posthog-js 없음; 웹 번들은 반대) · `npx expo-doctor` 17/18(실패 1은 기존 패키지 패치 버전 차이) · 실서버 통합(`FARMCLUB_INTEGRATION_SKIP_DOCKER=1`, DB `farmclub_dev33`, `node scripts/run-integration.mjs scripts/e2e/consumer-kakao.spec.ts scripts/e2e/producer-kakao.spec.ts scripts/e2e/discovery-and-gates.spec.ts`): 실서버 시나리오 7/7, Playwright 9/9. 하지 않은 것: `eas build`·`eas submit`·실기기 설치(계정 DEV-128 뒤 사용자, README "Native apps with EAS" 순서).
- 10/23 origin/main(DEV-91·DEV-132) 병합: 충돌 3곳(두 tasks.md, 생산자 복귀 화면의 가입 토큰 분기 + `kakaoCallbackUri()`) 해결. DEV-132의 가입 대기 저장(`writeStore("kakao-signup")`)은 네이티브에서 SecureStore로 간다(작은 JSON, 2KB 이하). 병합 뒤 `npm run typecheck`·`npm run test:mock` 51/51·실서버 통합(시나리오 7/7, Playwright 카카오·관문·동의 spec 9/9) 다시 통과.
- 10/23 사용자와 함께: Expo 로그인(GitHub 연동 계정이라 `eas login --device`로), 조직 `snu-omm` 아래 `eas init`·`eas update:configure`(두 앱, `owner`·`extra.eas.projectId`·`updates.url` 커밋). `update:configure`가 `internal` 프로필에 `channel: internal`을 넣고 `associatedDomains`를 중복시켜 `channel: preview`로 고치고 중복을 지웠다(테스트에 추가). 다음: internal 빌드(Android APK는 첫 빌드에서 키스토어 생성 확인이 필요해 사용자 터미널에서, iOS 시뮬레이터는 자격 증명 없이).
- 10/23 iOS 시뮬레이터(iPhone 16, internal 빌드 646ee78e) 확인: 설치·실행·홈(운영 API)·관문 시트·로그인 화면·‘카카오로 시작하기’ → ASWebAuthenticationSession 동의 → accounts.kakao.com 로그인 페이지까지 동작, 취소하면 로그인 화면으로 복귀(busy 해제). 복귀 끝까지는 PR #270 웹 배포 뒤. 발견: 상단 안전 영역이 비어 헤더가 상태 표시줄·다이내믹 아일랜드와 겹침 → `packages/ui/src/web.ts` `safe()`가 앱에서 `initialWindowMetrics` 인셋을 더하도록 고치고 `eas update --channel preview`로 반영.
- 10/23 결정(사용자): 테스트 빌드(internal·preview)에서는 PostHog를 켜지 않는다. 네이티브는 빌드 변수 `EXPO_PUBLIC_POSTHOG_KEY`가 있어야 시작하고 EAS `preview` 환경에는 변수가 없으므로 지금 빌드는 꺼져 있다. 키는 EAS `production` 환경에만 둔다(README). `eas update`는 `--environment preview`가 필요하다(non-interactive).
- 10/23 iOS 시뮬레이터에서 `eas update --channel preview` 적용 확인(두 번째 실행 때 헤더가 안전 영역 아래로). 그런데 소식·상품이 ‘불러오지 못했어요’ → 원인: `eas update`는 eas.json 빌드 프로필 `env`를 쓰지 않고 EAS 환경 변수만 읽어 `EXPO_PUBLIC_API_URL`이 기본값 localhost가 됨. 조치: 두 프로젝트 `preview`·`production` 환경에 `EXPO_PUBLIC_API_URL`·`API_MOCK`·`CONSUMER_URL`·`PRODUCER_URL`을 `eas env:create`로 등록하고 업데이트를 다시 올림(README에 기록). 생산자 업데이트 첫 시도는 병렬 셸의 작업 폴더가 소비자로 잡혀 소비자 프로젝트에 중복 그룹이 하나 더 올라감(같은 코드, 영향 없음).
- 10/24 internal 빌드 결과(Expo 조직 snu-omm, 프로필 internal, 채널 preview). 소비자 iOS 시뮬레이터 646ee78e · 생산자 iOS 시뮬레이터 174e7183 · 소비자 Android APK 28528091(https://expo.dev/accounts/snu-omm/projects/farmclub-consumer/builds/28528091-faa4-4141-bfc2-b431bfd52e13) · 생산자 Android APK db07a7db(https://expo.dev/accounts/snu-omm/projects/farmclub-producer/builds/db07a7db-4ac7-4fe2-8d12-77a906fd0213). 빌드 페이지의 설치 링크·QR로 팀 Android 폰에 설치한다.
- 10/24 Android 에뮬레이터(Medium_Phone) 확인: 두 앱 설치·실행, 소비자 홈(운영 API)·관문 시트·로그인 화면·‘카카오로 시작하기’ → Chrome Custom Tab에 accounts.kakao.com 로그인 페이지, 닫으면 로그인 화면으로 복귀. 생산자 로그인 화면. 발견 2건을 `eas update`로 반영: ① 상태 표시줄 아이콘이 흰 배경에 흰색이라 보이지 않음 → 두 앱 `_layout.tsx`에 `<StatusBar style="dark" />`(재실행 뒤 보임) ② 에뮬레이터에 PR #164의 TWA(같은 패키지명, 다른 서명 키)가 남아 있으면 `adb install`이 조용히 실패하고 옛 TWA가 실행됨 → 팀 폰에서도 TWA APK를 먼저 지워야 한다(README·DEV-41 확인 항목).
- 10/24 iOS·Android 모두 로그인 끝까지(앱 복귀)는 PR #270의 웹 `/auth/kakao` 배포 뒤 확인. 그 뒤 화면(온보딩·주문·채팅·사진 첨부)도 같은 조건. 상태: 리뷰 중(사람 리뷰 대기).
- 11/03 spec-check(run 41614675465) MISMATCH 3건 반영: 범위 목록에 `packages/ui/src/web.ts`·두 앱 `_layout.tsx`를 추가(기록에는 있었지만 범위에 빠짐). 루트 `app.json`(`{"expo": {}}`, 10/23 커밋 107cb73에 섞여 들어감)은 어디서도 읽지 않아 삭제. `eas` CLI를 루트에서 실행했을 때 생긴 것으로 보인다.
- 11/03 APK 두 개를 GitHub Release `apk-internal-2026-10-23`에 보관(EAS 산출물 30일 만료 대비, SHA-256 포함). HE README·루트 README에 링크. JS는 preview 채널 업데이트라 네이티브가 바뀔 때만 새 Release.

