# 0013 설치형 Android 앱: 웹 앱을 감싼 TWA

- 상태: 결정 (2026-10-19)
- 관련: [0001](./0001-frontend-expo-web.md)(Expo 웹 출력), [0003](./0003-auth-kakao.md)(카카오 로그인), [0012](./0012-domains-cloudflare.md)(도메인), [stack.md](../stack.md) 7장, DEV-33, DEV-41

## 배경
I2 내부 테스트(test2, 2026-10-20)에 "Android 앱 다운로드·설치·실행" 항목이 있다(DEV-33 설치형 빌드, DEV-41 기기 확인). 지금 서비스는 Expo Router 웹 출력만 Vercel에 올리고 있고, 레포에 EAS·네이티브 Android 설정이 없다. 0001과 stack.md 7장은 "같은 Expo 코드로 EAS 빌드"를 열어 두었다.

## 결정
- Android 설치형 앱은 **Trusted Web Activity(TWA)** 로 만든다. 앱은 `https://farmclub.kr`을 사용자의 Chrome으로 전체 화면에 띄우는 껍데기이고, 화면·로직은 웹 그대로다.
- 프로젝트는 Bubblewrap(@bubblewrap/core)으로 생성해 `apps/android-twa/<앱>/`에 둔다. 소비자 앱 패키지명은 `kr.farmclub.consumer`. 생산자 앱은 같은 방식으로 `kr.farmclub.producer`(`farm.farmclub.kr`)를 나중에 추가한다.
- 웹 쪽은 소비자 앱 `public/`에 Web App Manifest와 `/.well-known/assetlinks.json`(Digital Asset Links)을 둔다. 서명 인증서 SHA-256이 맞으면 Chrome이 주소창 없이 띄운다.
- 서명 키스토어는 레포 밖(`~/.farmclub/android/`)에 두고 커밋하지 않는다. 같은 키로 서명해야 업데이트 설치가 되므로 키와 비밀번호를 백업한다.
- 배포는 Play 스토어가 아니라 APK 파일 직접 배포(GitHub Release 첨부)로 시작한다. Expo/EAS 계정은 쓰지 않는다.

## 고른 이유
- **네이티브(EAS) 빌드 대신**: 웹 출력 전제로 만든 화면(웹 전용 API, sessionStorage 복귀 정보 등)과 카카오 로그인 딥링크·리다이렉트를 네이티브용으로 다시 맞춰야 해서 test2 전까지 위험이 크다.
- **WebView 대신**: TWA는 Chrome 자체라 카카오 로그인(카카오톡 `intent://` 이동 포함), 사진 첨부(파일 선택), 뒤로 가기, 쿠키·로그인 유지가 Chrome 브라우저와 똑같이 동작한다. WebView는 이것들을 하나씩 직접 구현해야 한다.
- 웹을 고치면 앱 재배포 없이 바로 반영된다.

## 결과
- 기기에 Chrome(또는 TWA를 지원하는 브라우저)이 있어야 한다. 없으면 Custom Tab으로 열린다(`fallbackType: customtabs`).
- assetlinks 검증이 실패하면(파일 미배포, 다른 키로 서명) 상단에 주소창이 보인다. 동작은 그대로다.
- 앱 아이콘·이름·스플래시 색은 `twa-manifest.json`에서 바꾸고 프로젝트를 다시 생성한다. 웹 화면 변경은 앱 재빌드가 필요 없다.
- iOS 설치형은 이 결정에 포함하지 않는다(홈 화면에 추가로 대신).
