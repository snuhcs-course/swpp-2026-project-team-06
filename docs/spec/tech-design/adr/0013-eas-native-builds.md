# 0013 소비자·생산자 앱 스토어 배포: 같은 Expo 코드로 EAS 네이티브 빌드

- 상태: 결정 (2026-10-23). PR #164의 초안 "0013 설치형 Android 앱: 웹 앱을 감싼 TWA"(2026-10-19)를 대체한다
- 관련: [0001](./0001-frontend-expo-web.md)(Expo 웹 출력), [0003](./0003-auth-kakao.md)(카카오 로그인), [0005](./0005-analytics-posthog.md)(PostHog), [0012](./0012-domains-cloudflare.md)(도메인), [stack.md](../stack.md) 2장·7장, DEV-33, DEV-128(계정), DEV-129(CI), DEV-41(설치 확인)
- 근거 문서: [소비자·생산자 앱 스토어 배포 방식 결정](https://claude.ai/artifact/RMzRFujnLGCMvGB927ozKc)(2026-10-23, 후보 6개 비교)

## 배경
처음 요구는 "소비자 앱을 Android에 설치형으로"였고, 10/19에는 test2 전 위험을 피해 TWA(Chrome으로 farmclub.kr을 감싼 Android 셸)로 가기로 했다(PR #164). 10/23에 요구가 "소비자·생산자 앱을 iOS·Android 앱스토어에 등록해 실사용"으로 바뀌었다. 웹은 앞으로도 자주 바뀌고, 바뀔 때마다 앱에 빠르고 안정적으로 반영돼야 한다.

## 결정
- **같은 Expo 코드로 iOS·Android 네이티브 앱을 낸다.** 빌드는 EAS Build, JS·화면 변경은 EAS Update로 심사 없이 반영한다. 웹 출력(Vercel)은 그대로다. 소비자·생산자 프로젝트 2개에서 웹·iOS·Android 네 타깃이 나온다.
- 식별자: iOS `bundleIdentifier`·Android `package` = `kr.farmclub.consumer` / `kr.farmclub.producer`. 앱 스킴은 `farmclub-consumer` / `farmclub-producer`(기존 값).
- 런타임 버전 정책 `fingerprint`: 네이티브 코드가 바뀌면 EAS가 런타임 버전을 자동으로 바꿔 옛 빌드에 새 JS가 가지 않는다. 채널은 `preview`(TestFlight·Play 내부 테스트)와 `production`. 빌드 번호는 `autoIncrement`, `version`은 사람이 올린다.
- `updates.url`·`extra.eas.projectId`는 EAS 프로젝트가 생긴 뒤 `eas init` → `eas update:configure`가 `app.json`에 쓴다. 레포에 자리표시자를 두지 않는다(잘못된 주소로 빌드되면 시작 때 업데이트 설정 오류).
- 웹 전용 코드는 플랫폼별 파일(`*.native.ts`)이나 `Platform.OS === "web"` 분기로 나눈다. 공용 패키지(`packages/*`)에서 `window`·`document`·`localStorage`·`sessionStorage` 직접 호출은 웹 전용 파일 밖에서 금지하고 `scripts/test-native-config.mjs`가 검사한다.
  - 토큰·앱별 저장값: 웹 localStorage, 네이티브 `expo-secure-store`(동기 API).
  - PostHog: 웹 posthog-js(허용 호스트 검사 DEV-125 포함), 네이티브 posthog-react-native(화면 이벤트만, 녹화 없음).
  - 사진 선택: 웹 `<input type="file">`, 네이티브 `expo-image-picker`. 업로드는 `{uri, name, type}`을 FormData에 붙인다. 생산자 원본 자료의 PDF·텍스트 첨부는 웹 전용으로 남긴다.
  - 복사 `expo-clipboard`, 바깥 주소 `Linking`, 화면 숨김 판단 `AppState`(웹에서는 `document.visibilityState`를 비춘다).
- **카카오 로그인 복귀(앱)**: 카카오 콘솔·서버의 복귀 주소는 그대로 `https://farmclub.kr/auth/kakao`(생산자 `https://farm.farmclub.kr/auth/kakao`)다. 앱은 `expo-web-browser` 인증 세션으로 인가 화면을 열고 `state`를 `app-<nonce>`로 보낸다. 웹 복귀 화면은 `state`가 `app-`으로 시작하면 코드를 그대로 앱 스킴(`farmclub-consumer://auth/kakao?code&state`)으로 넘기고, 앱의 같은 `/auth/kakao` 화면이 메모리에 둔 복귀 정보로 대조한 뒤 서버에 보낸다. 서버가 받는 `redirectUri`는 웹과 같아 서버 변경이 없다(ADR 0003 유지).
  - Universal Links·App Links 대신 커스텀 스킴을 쓰는 이유: 인증 세션 안의 302 리다이렉트는 앱 링크로 앱을 열지 않고, App Links 검증에는 DEV-128 뒤에야 생기는 서명 지문이 필요하다.
  - `apple-app-site-association`·`assetlinks.json`은 두 앱 `public/.well-known/`에 둔다(Team ID·지문 자리표시자, `vercel.json`이 `application/json`으로 응답). 지금은 앱 링크로 여는 경로가 없다(AASA 경로 전부 제외, Android https 인텐트 필터 없음). `/auth/kakao`를 앱 링크로 열면 웹에서 시작한 로그인까지 앱으로 넘어와 복귀 정보가 없어지므로, 앱 링크를 켤 때 어느 경로를 열고 웹 시작 로그인을 어떻게 돌려보낼지 먼저 정한다(후속).
- 계정(Apple Developer·Google Play·Expo)과 인증서는 사람이 만들고(DEV-128), 비밀값은 EAS가 관리한다. 레포·이슈·PR에 쓰지 않는다. CI 자동화(`eas update`·`eas build`)는 DEV-129.
- PR #164은 TWA 셸(`apps/android-twa`)을 버리고 manifest·assetlinks·홈 화면 메타만 이 결정에 가져왔다.

## 고른 이유
- iOS가 들어오면 TWA는 선택지에서 빠진다(Android·Chrome 전용). WebView 셸로 iOS를 내면 App Store 지침 4.2(웹사이트를 다시 포장한 앱) 거절 위험이 크다.
- 코드가 이미 Expo라 새 앱을 만드는 게 아니다. 바꿀 곳은 웹 전용 코드 13곳과 카카오 복귀 흐름뿐이다.
- 화면·로직 변경은 `eas update`로 다음 실행 때 반영되고, 네이티브 변경(SDK·권한·모듈)만 심사를 거친다. 웹 변경 속도를 잃지 않는다.

## 결과
- 네이티브 의존성이 늘었다: expo-updates, expo-secure-store, expo-web-browser, expo-image-picker, expo-clipboard, expo-file-system·application·device·localization(PostHog), posthog-react-native. 웹 번들에도 같은 패키지의 웹 구현이 들어간다.
- EAS 무료 플랜 한도: 빌드 OS당 월 15회, Update 월 활성 사용자 1,000명. 네이티브 변경은 모아서 빌드하고, 넘으면 Starter(USD 19/월).
- 스토어 요건(Sign in with Apple, 앱 안 회원 탈퇴, 처리방침 URL, 심사용 로그인)은 방법과 무관하게 걸리며 별도 이슈(DEV-130·DEV-75·DEV-94·DEV-131)다. TestFlight·Play 내부 테스트는 심사 없이 된다.
- 인증 세션 안에서 카카오톡 앱으로 넘어가는 ‘카카오톡으로 로그인’ 버튼이 동작하는지는 실기기에서 확인한다(DEV-41). 안 되면 카카오계정(아이디·비밀번호) 로그인은 된다. Android는 expo-web-browser가 복귀 스킴을 `Linking` 이벤트로 받고 expo-router가 같은 이벤트로 `/auth/kakao`를 여므로 로그인 화면은 다시 이동하지 않는다(이중 처리 방지).
