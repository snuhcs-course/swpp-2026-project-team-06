## DEV-33 네이티브 분기(포그라운드 판단·사진 선택)

- 이슈: [DEV-33](https://linear.app/sswp6/issue/DEV-33) · 기록은 `apps/consumer/tasks.md#DEV-33`
- 범위: `src/foreground.ts`(새 파일, `document.hidden` 대신 `AppState`), `ChatThread.tsx`·`NewsRoom.tsx`·`useLiveList.ts`(호출만 바꿈), `src/pickPhoto.ts`·`pickPhoto.native.ts`(새 파일, 네이티브 `expo-image-picker`), `PrivatePhotos.tsx`(네이티브에서 ‘사진 첨부’ 버튼), `src/index.ts`, `package.json`(peer)
- 10/23 결정: 보이는 모습·동작은 웹에서 바뀌지 않는다. 비공개 사진 첨부의 `upload`는 `File` 대신 `{uri,name,type}`도 받는 `UploadFile`.
