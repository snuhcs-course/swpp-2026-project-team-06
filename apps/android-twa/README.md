# apps/android-twa — 설치형 Android 앱 (TWA)

웹 앱을 Chrome으로 전체 화면에 띄우는 Trusted Web Activity 껍데기다([ADR 0013](../../docs/spec/tech-design/adr/0013-android-twa.md)). 화면은 웹 그대로라 웹을 고치면 앱을 다시 빌드할 필요가 없다.

| 폴더 | 패키지명 | 여는 주소 |
| -- | -- | -- |
| `consumer/` | `kr.farmclub.consumer` | `https://farmclub.kr/` |
| (예정) `producer/` | `kr.farmclub.producer` | `https://farm.farmclub.kr/` |

npm workspace가 아니다(`package.json` 없음). 앱 하나는 Bubblewrap이 만든 Gradle 프로젝트이고 원본 설정은 `twa-manifest.json`이다.

## 준비물
- Android SDK(`~/Library/Android/sdk`, build-tools 35 이상, platforms;android-36) — Android Studio가 설치한 것을 그대로 쓴다.
- JDK 17 또는 21(Android Studio 내장 JBR 21 가능). `build-apk.sh`가 `java_home`으로 찾는다.
- 서명 키스토어 `~/.farmclub/android/farmclub-release.keystore`(레포 밖, 아래).

## 배포된 APK
- 소비자 1.0.0: GitHub Release [`android-consumer-v1.0.0`](https://github.com/snuhcs-course/swpp-2026-project-team-06/releases/tag/android-consumer-v1.0.0)(prerelease, 공개). 본문은 `INSTALL.md`.
- 새 버전: `appVersionCode`를 올려 빌드한 뒤 `gh release create android-consumer-v<버전> apps/android-twa/dist/farmclub-consumer-<버전>.apk --prerelease --notes-file …`

## APK 빌드
```bash
apps/android-twa/build-apk.sh consumer
```
키스토어 비밀번호를 물으면 직접 입력한다. 결과는 `apps/android-twa/dist/farmclub-consumer-<버전>.apk`(gitignore)이고, 마지막에 서명 인증서 SHA-256을 출력한다.

새 버전을 낼 때는 `twa-manifest.json`의 `appVersionCode`(정수, 반드시 증가)와 `appVersion`을 올리고 아래 "프로젝트 다시 생성"을 한 뒤 빌드한다.

## 서명 키 (비밀값, 커밋 금지)
- 위치: `~/.farmclub/android/farmclub-release.keystore`, 별칭 `farmclub`, PKCS12(키 비밀번호 = 저장소 비밀번호). 다른 경로는 `FARMCLUB_KEYSTORE`로 지정.
- 처음 만들 때(한 번만):
  ```bash
  keytool -genkeypair -v -storetype PKCS12 -keystore ~/.farmclub/android/farmclub-release.keystore -alias farmclub -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=farmclub, O=Farmclub, C=KR"
  ```
- **잃어버리면 같은 앱으로 업데이트할 수 없다**(사용자가 지우고 새로 설치해야 함). 키스토어 파일과 비밀번호를 팀 비밀번호 관리자(1Password 등)에 첨부해 백업하고, 레포·이슈·채팅에는 올리지 않는다.
- 키를 바꾸면 `apps/consumer/public/.well-known/assetlinks.json`의 SHA-256도 바꿔야 주소창이 사라진다.

## 주소창 없이 뜨게 하기 (Digital Asset Links)
- `apps/consumer/public/.well-known/assetlinks.json`에 패키지명과 서명 인증서 SHA-256을 둔다. 소비자 앱이 배포되면 `https://farmclub.kr/.well-known/assetlinks.json`이 `application/json` 200으로 나와야 한다(Vercel은 파일이 있으면 `vercel.json` rewrite보다 파일을 먼저 준다).
- 확인: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://farmclub.kr&relation=delegate_permission/common.handle_all_urls`
- 배포 전 에뮬레이터에서 확인하려면 Chrome 명령줄 플래그로 검증을 끈다:
  ```bash
  adb shell "echo '_ --disable-digital-asset-link-verification-for-url=https://farmclub.kr' > /data/local/tmp/chrome-command-line"
  ```
  그리고 에뮬레이터 Chrome의 `chrome://flags`에서 "Enable command line on non-rooted devices"를 켜고 Chrome을 다시 시작한다.

## 프로젝트 다시 생성
`twa-manifest.json`을 고친 뒤 Gradle 프로젝트를 다시 만든다. Bubblewrap CLI는 JDK 17과 sdkmanager를 요구해서, 생성만 하는 `@bubblewrap/core@1.27.0`을 임시 폴더에 받아 쓴다.
```bash
apps/android-twa/generate.sh consumer
```
- 아이콘은 `iconUrl`(배포된 `https://farmclub.kr/icons/icon-512.png`)에서 받아 만든다.
- 버전 필드 이름은 `appVersion`(versionName)과 `appVersionCode`다. `minSdkVersion`은 androidbrowserhelper 2.7 때문에 24 이상.
- 생성된 파일(Gradle·Java·res)은 손으로 고치지 않는다. 다시 생성하면 덮어쓴다.
