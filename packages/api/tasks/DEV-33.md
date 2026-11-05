## DEV-33 네이티브 저장소·업로드

- 이슈: [DEV-33](https://linear.app/sswp6/issue/DEV-33) · 기록은 `apps/consumer/tasks.md#DEV-33`
- 범위: `src/storage.ts`(웹·Node: localStorage)·`src/storage.native.ts`(SecureStore), `src/upload.ts`(`UploadFile`·`appendFile`), `src/client.ts`(저장소 호출을 옮김, `uploadMedia`·`uploadAttachment`가 `{uri,name,type}`도 받음), `src/productWorkspace.ts`(`uploadPhoto`)·`src/sourceAnalysis.ts`(`uploadSource`)의 파일 타입, `src/objectUrl.ts`·`.native.ts`(비공개 사진 주소: 웹 blob URL, 네이티브 data URL), `src/index.ts`
- 10/23 결정: `readStore`·`writeStore` 동작은 웹에서 그대로(localStorage, 앱별 이름공간). 네이티브는 SecureStore 동기 API로 같은 동기 계약을 지킨다.
