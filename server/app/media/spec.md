# server/app/media spec

> 구현하는 기능: 공개 미디어 업로드(FEAT-02 농가 사진, FEAT-04 상품 사진, FEAT-15 소식 사진·영상, storefront-1.5 상세 이미지) · 인수 조건: AC-02-3, AC-12-10, AC-19-3 · 한도: FQ-05(stack.md)
> API 원본: docs/spec/contracts-1.2.md "공개 미디어"

## 역할
누구나 보는 사진·영상을 파일로 받아 저장소(R2)에 두고 주소를 돌려준다. 농가·상품·소식·상세 필드에는 이 주소만 저장한다. 비공개 사진(채팅·문의 첨부)은 messaging이 따로 다룬다.

## 구조
- `router.py` — `POST /api/media`(multipart `file`), `GET /api/media/{id}.{ext}`
- `models.py` — `PublicMedia`(`public_media`): 농가·업로더·형식·크기·저장소 키
- `service.py` — `check`(형식·용량), `save`(저장소 + 행), `upload`, `read`
- `migrate_inline.py` — DB에 남은 data URL을 옮기는 운영 명령

## 계약
- 업로드는 농가가 있는 생산자면 된다(승인 대기 포함, `PATCH /api/farms/me`와 같은 기준). 소비자·농가 없는 생산자는 403, 비로그인 401.
- 사진은 `core/images.sanitize`(JPEG·PNG·WebP, 10MB, EXIF·메타데이터 제거), 영상은 MP4(ftyp)·WebM(EBML) 100MB. 영상 길이 60초는 앱이 확인한다. 형식·용량 위반은 400 `VALIDATION_ERROR`(`details.fields.file`).
- 응답 `{url, kind, mimeType, size}`. `url`은 `/api/media/<id>.<ext>`이고 앱은 `apiUrl`을 붙여 절대 주소로 저장한다.
- 조회는 인증 없이, 저장한 MIME으로, `Cache-Control: public, max-age=31536000, immutable`. id·확장자가 맞지 않으면 404.
- 저장소는 `source_analysis.storage.Storage`를 그대로 쓴다. 자료 분석 worker의 24시간 정리 작업은 `PublicMedia.storage_key`를 지우지 않는다.
- 사진 필드(농가 `photo`, 상품 `photos`, 소식 `photos`·`videos`, 상세 이미지 블록)는 `core/detail.MediaUri`로 HTTPS 또는 서비스 상대 경로, 500자까지만 받는다. data URL은 400.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-21 | 새 공개 버킷 없이 자료 분석의 비공개 R2 버킷·`Storage`를 재사용하고 API가 내보낸다. 내용이 바뀌지 않는 주소라 긴 캐시를 준다 | 새 인프라 설정 없이 바로 배포. CDN 공개 버킷은 나중에 바꿀 수 있음 | AC-02-3 |
| 2026-10-21 | 주소에 확장자를 붙인다 | 앱 `RoomMedia`와 messaging이 확장자로 영상을 판별 | AC-12-10 |
| 2026-10-21 | 앱은 절대 주소(`apiUrl + url`)를 저장한다 | 소비자 앱 이미지·공유 미리보기(`farms/share.py`)가 접두 처리 없이 표시 | AC-19-3 |
| 2026-10-21 | MP4·MOV(ftyp) 영상은 모두 `video/mp4`, `.mp4`로 저장한다 | 앱·서버의 영상 판별이 mp4·webm 기준. 휴대폰 MOV도 올릴 수 있게 | AC-12-10 |
| 2026-10-21 | 쓰이지 않는 업로드(올렸지만 저장하지 않은 파일)는 지우지 않는다 | 참조 추적 없이 시작. 용량 문제가 생기면 정리 작업을 추가 | — |
