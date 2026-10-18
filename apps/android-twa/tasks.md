# apps/android-twa tasks

## DEV-33 설치형 소비자 앱(Android TWA) 빌드와 다운로드 배포

- 이슈: [DEV-33](https://linear.app/sswp6/issue/DEV-33) · 기기 확인은 [DEV-41](https://linear.app/sswp6/issue/DEV-41)
- 브랜치: `nemodleo/dev-33-i2-t15-set-up-installable-consumer-builds-and-download`
- 기능·인수 조건: 제품 FEAT 없음. 내부 테스트 시트 「현_소비자」 C-21 "Android 앱 다운로드·설치·실행", 이슈 완료 조건 "호환 Android 빌드를 비공개 다운로드 링크로 설치할 수 있다"
- 상태: 진행 중

### 목표
test2(2026-10-20) 참여자가 링크에서 APK를 받아 설치하고, 웹과 똑같이(카카오 로그인·사진 첨부·뒤로가기·로그인 유지) 소비자 앱을 쓸 수 있게 한다.

### 범위 (수정 허용 경로)
- `apps/android-twa/**`(새 폴더: README·spec·tasks, `consumer/` 생성 프로젝트, `generate.sh`, `build-apk.sh`, `.gitignore`)
- `apps/consumer/public/manifest.webmanifest`(새 파일), `apps/consumer/public/.well-known/assetlinks.json`(새 파일), `apps/consumer/public/index.html`(manifest 링크·홈 화면 메타)
- `apps/producer/public/manifest.webmanifest`(새 파일), `apps/producer/public/index.html`(manifest 링크·홈 화면 메타) — 10/19 추가(아래 결정)
- `apps/consumer/tasks.md`, `apps/producer/tasks.md`(이 절을 가리키는 짧은 절)
- `docs/spec/tech-design/adr/0013-android-twa.md`(새 파일), `docs/spec/tech-design/stack.md`(2·3·7·9장), `docs/wiki/Design-Documentation.md`(라이브러리·배포 표)

### 비범위
- 생산자 앱 TWA(같은 방식으로 별도 이슈), iOS 설치형, Play 스토어 등록, 네이티브(EAS) 빌드
- 웹 화면·로직 변경, `vercel.json`(파일이 rewrite보다 먼저 나가므로 수정 불필요)
- 실제 카카오 계정 로그인(사용자가 직접), 참여자 실기기 확인(DEV-41)

### 결정 사항
- 10/19 패키지명 `kr.farmclub.consumer`(사용자 결정: 소비자·생산자 앱 둘 예정). 폴더 `apps/android-twa/consumer/`.
- 10/19 Bubblewrap CLI는 JDK 17 고정·build-tools 36.1.0·sdkmanager를 요구 → 생성은 `@bubblewrap/core@1.27.0`(`generate.sh`), 빌드는 Gradle(JBR 21) + build-tools 36.0.0 zipalign·apksigner(`build-apk.sh`).
- 10/19 `minSdkVersion` 24(androidbrowserhelper 2.7.4 요구, 23이면 manifest merge 실패).
- 10/19 키스토어 `~/.farmclub/android/farmclub-release.keystore`(PKCS12, 별칭 `farmclub`), 비밀번호는 사용자가 직접 입력. 레포 `.gitignore`에 `*.keystore`·`*.jks`·`*.apk`.
- 10/19 범위 추가(C-22, DEV-41): iPhone 홈 화면에 추가한 생산자 앱만 Safari 주소창·도구막대가 보임. 두 앱 모두 manifest가 없어 iOS가 추가한 경로를 범위로 잡은 것으로 추정 → 생산자에도 manifest(start_url·scope `/`, standalone, 이름 ‘farmclub 농가’)와, 두 앱에 `mobile-web-app-capable`·`apple-mobile-web-app-capable`·status-bar-style 메타. 생산자는 TWA 대상이 아니라 assetlinks 없음.
- 10/19 첫 서명 APK(사이트 설정 바로가기 끔)가 실행 직후 종료: `Component class R.u does not exist`(R8 매핑 = `ManageDataLauncherActivity`). 바로가기를 끄면 manifest에서 빠지는데 라이브러리가 실행 때 그 컴포넌트를 켜고 끄려 함 → `enableSiteSettingsShortcut: true`로 재생성. `twa-manifest.json`에 서명 지문도 기록(공개값).
- 10/19 사용자 요청: 개발 중 커밋하지 않고 끝난 뒤 의미 단위로 나눠 커밋, 그다음 PR(첫 spec 커밋·draft PR 단계 생략).

### 작업
- [x] 웹 manifest·index.html 링크, export에 `.well-known`·manifest 포함 확인
- [x] 생산자 manifest·홈 화면 메타, export 포함 확인
- [ ] iPhone 홈 화면 추가로 두 앱 주소창 없음 확인(배포 뒤, 사용자)
- [x] TWA 프로젝트 생성, unsigned release 빌드
- [x] 키스토어 생성(사용자) → 서명 APK 빌드 → SHA-256으로 `assetlinks.json`
- [x] 에뮬레이터 설치·실행·주요 화면·카카오 버튼 이동 확인(검증 플래그로 주소창 없음 확인)
- [ ] 배포 뒤 `https://farmclub.kr/.well-known/assetlinks.json` 200 `application/json`, Digital Asset Links API 확인
- [ ] APK 다운로드 링크(GitHub Release, 사용자 확인 뒤) · 참여자 설치 안내
- [x] 문서(ADR 0013, stack.md, wiki), 참여자 설치 안내 초안 `INSTALL.md`

### 완료 조건
- [x] 서명된 release APK가 에뮬레이터에 설치·실행되고 farmclub.kr이 뜬다
- [ ] 배포 뒤 주소창 없이 뜬다(assetlinks 검증)
- [ ] 비공개 다운로드 링크에서 받아 설치할 수 있다
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/19 main c98be9b에서 시작. 현재 `https://farmclub.kr/.well-known/assetlinks.json`·`/manifest.json`은 SPA 폴백으로 `text/html` 200 → 이 PR 배포 전까지 주소창이 보인다.
- 10/19 서명 APK `farmclub-consumer-1.0.0.apk`(versionCode 1, 서명 SHA-256 `DE:8D:…:33:31`, apksigner v2·v3 검증 통과).
- 10/19 에뮬레이터(Android 17 이미지, Chrome 153): 설치 → 실행 → 홈(발견) → 내 정보 탭 → 로그인 시트 → 로그인 화면 → ‘카카오로 시작하기’ → accounts.kakao.com(앱 안, 범위 밖이라 상단 주소 막대·X) → 뒤로가기로 로그인 화면 복귀. Chrome 명령줄 `--disable-digital-asset-link-verification-for-url=https://farmclub.kr`일 때 주소창 없음, 플래그를 빼면 `farmclub.kr` 주소 막대가 보임(assetlinks 미배포라 예상대로). 첫 실행 때 Chrome 첫 화면(약관)이 먼저 뜰 수 있어 에뮬레이터는 `--disable-fre`로 건너뜀(약관 동의 안 함). 실제 카카오 로그인은 미확인(사용자).
- 10/19 테스트: `npm run typecheck` 통과(4개 workspace), `npm run test:mock` 15/15 통과. 소비자·생산자 `expo export -p web` 성공(manifest·`.well-known` 포함).
