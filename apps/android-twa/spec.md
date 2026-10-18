# apps/android-twa spec

> 구현하는 것: 설치형 Android 앱(I2 내부 테스트 C-21). 제품 FEAT·AC 없음 — 화면·동작은 웹 앱(`apps/consumer`, `apps/producer`) spec을 따른다.
> 결정 근거: [ADR 0013](../../docs/spec/tech-design/adr/0013-android-twa.md), 사용법: [README.md](./README.md)

## 역할
배포된 웹 앱을 Trusted Web Activity로 여는 Android 껍데기. 앱 코드는 Bubblewrap이 생성하고, 원본 설정은 앱 폴더의 `twa-manifest.json` 하나다.

## 구조
- `<앱>/twa-manifest.json` — 패키지명·호스트·이름·색·아이콘 URL·버전·서명 키 위치(경로만, 비밀번호 없음)
- `<앱>/app/`, `build.gradle` 등 — `generate.sh`가 만든 Gradle 프로젝트. 손으로 고치지 않는다
- `generate.sh` — `twa-manifest.json` → 프로젝트 재생성
- `build-apk.sh` — `assembleRelease` → zipalign → apksigner 서명 → `dist/`
- 웹 쪽 짝: `apps/consumer/public/manifest.webmanifest`, `apps/consumer/public/.well-known/assetlinks.json`

## 계약
- 패키지명은 한 번 배포하면 바꾸지 않는다: 소비자 `kr.farmclub.consumer`, 생산자(예정) `kr.farmclub.producer`.
- 서명 키스토어·비밀번호는 레포에 두지 않는다(`~/.farmclub/android/`). 같은 키로만 업데이트 설치가 된다.
- `assetlinks.json`의 `sha256_cert_fingerprints`는 배포 APK의 서명 인증서와 같아야 한다. 키를 바꾸면 같은 PR에서 고친다.
- `appVersionCode`는 배포마다 1씩 올린다(낮거나 같으면 기존 설치 위에 업데이트가 안 됨).

## 구현 결정 이력
| 날짜 | 결정 | 이유 | 관련 |
| --- | --- | --- | --- |
| 2026-10-19 | 네이티브(EAS)·WebView가 아니라 TWA | 카카오 로그인 intent·파일 선택·뒤로가기·로그인 유지가 Chrome과 같음, 웹 수정이 바로 반영 | ADR 0013 |
| 2026-10-19 | Bubblewrap 1.27.0 생성 프로젝트를 커밋하고, 생성은 `@bubblewrap/core`로, 빌드는 Gradle + apksigner를 직접 부른다 | CLI는 JDK 17·sdkmanager를 요구하는데 팀 Mac에는 Android Studio JBR 21과 SDK만 있음 | DEV-33 |
| 2026-10-19 | `minSdkVersion` 24, `targetSdk` 36, 세로 고정, 알림 위임 끔, 대체는 Custom Tabs | androidbrowserhelper 2.7.4 최소 24, 웹이 세로 전용(D-04) | DEV-33 |
| 2026-10-19 | `enableSiteSettingsShortcut`는 `true`로 둔다(끄지 않는다) | 끄면 manifest에서 `ManageDataLauncherActivity`가 빠지는데 androidbrowserhelper 2.7.4 `LauncherActivity`가 실행 때 그 컴포넌트를 `setComponentEnabledSetting`으로 바꾸려다 `IllegalArgumentException`으로 바로 종료됨(에뮬레이터 실측) | DEV-33 |
| 2026-10-19 | 상태바·내비게이션 바·스플래시 흰색(#FFFFFF), 아이콘은 웹 `icons/icon-512.png`(마스커블 겸용) | 웹 `theme-color`가 흰색, 아이콘 글자가 가운데 안전 영역 안에 있음 | DEV-33 |
