## DEV-33 생산자 앱 EAS 네이티브 빌드 전환

- 이슈: [DEV-33](https://linear.app/sswp6/issue/DEV-33) · 목표·결정·검증 기록은 `apps/consumer/tasks.md#DEV-33`에 모은다.
- 범위: `app.json`·`eas.json`·`vercel.json`·`public/{index.html,manifest.webmanifest,.well-known/**}`, `src/app/login.tsx`·`src/app/auth/kakao.tsx`, `src/lib/kakao.native.ts`·`kakaoAuth(.native).ts`(새 파일), `src/lib/pick.native.ts`·`sourceFiles.native.ts`(새 파일), `sourceFiles.ts`(`PickedFile` 타입)·`SourceAttachments.tsx`(`PickedFile`, 네이티브 미리보기 uri), `DetailEditor.tsx`·`ProductPageEditor.tsx`·`SourceWorkspace.tsx`(beforeunload는 웹에서만), `views.tsx`(copyText).
- 10/23 결정: 식별자 `kr.farmclub.producer`, 복귀 주소 `https://farm.farmclub.kr/auth/kakao`(서버 값 그대로), 앱 스킴 `farmclub-producer`. `kakao.ts`(웹)는 기존 export의 동작을 그대로 두고 앱 전달용 export(`appReturnUrl`·`forwardToApp`·`kakaoCallbackUri`·`parseKakaoReturn`·`appOrigin`)만 더해 `scripts/test-producer-kakao.mjs`가 그대로 돈다. 원본 자료 사진 picker 품질은 소비자와 같은 0.8. 원본 자료 PDF·텍스트 첨부는 웹 전용(네이티브는 사진만).
- [x] 설정·의존성 [x] 카카오 네이티브 복귀 [x] 사진·영상 선택 [x] beforeunload·복사 가드 [x] well-known·manifest

