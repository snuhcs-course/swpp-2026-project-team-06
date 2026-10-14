# 에셋 출처와 사용 범위

## Pretendard
- 배포: 공식 `orioncactus/pretendard` v1.3.9.
- 원본: https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2
- 라이선스: SIL Open Font License 1.1. `OFL-Pretendard.txt` 원문 및 저작권 고지 동봉. 폰트 파일은 변형하지 않음.
- 다운로드: 2026-10-14. 상업적 사용·임베딩·재배포 조건은 동봉 원문을 따른다. 폰트 자체 단독 판매와 수정판 Reserved Font Name 제한 유지.

## paper-wash.png
- 2026-10-14 Codex 내장 imagegen으로 제작한 1536×1024 추상 종이 질감.
- 프롬프트: Warm off-white handmade paper, subtle fibers, soft terracotta and muted sage abstract brush washes at edges. Blank center. No text, letters, logos, fruit, leaves, plants, farms, people, products, photography or objects.
- 검수: 문자·실물·상품·농장·인물 없음. 농가 이야기 표지의 배경 장식에만 사용하고 의미를 전달하지 않아 대체 텍스트 없이 CSS background로 적용.
- 원본 생성 파일: exec-0c714826-2ac4-4f3c-bea6-11803bb21963.png. 작업실 실행 중 이미지 생성 호출 없음.

기본 상태에는 사진을 제공하지 않는다. 아래 예시 사진은 명시적 데모에서만 사용한다. 로컬 업로드 사진과 생성 장식을 구분한다.

## 추가 서체 — SIL OFL 1.1
- Do Hyeon: Google Fonts 공식 https://github.com/google/fonts/tree/main/ofl/dohyeon 의 DoHyeon-Regular.ttf / OFL.txt. 2026-10-14 다운로드.
- Gowun Batang: https://github.com/google/fonts/tree/main/ofl/gowunbatang 의 GowunBatang-Regular.ttf, GowunBatang-Bold.ttf / OFL.txt. 2026-10-14 다운로드.
- fontTools TTFont의 flavor='woff2'로 웹 컨테이너 변환. 글리프·서체명·저작권 정보 변경 없음. 라이선스 원문은 OFL-DoHyeon.txt / OFL-GowunBatang.txt에 동봉. 저작권 고지 유지, 폰트 자체 단독 판매 금지.

## 명시적 데모 자료
- 사진: 기존 docs/design/assets/{basket,farmer,greenhouse,harvest-hand,tangerine-box,branch}.jpg를 그대로 복사. 실제 강씨네 귤밭/판매 구성임을 보증하는 사진이 아님. 새로 생성·합성하지 않음.
- 원문: docs/design/screens/scr-03.html의 가상 농가 이름·소개·이야기·소식·산지·5kg 상품명과 scr-04.html의 맛 소개(110행), 크기 편차(117행), 수확 당일 선별(117행), 5kg × 1 구성(126행) 원문. 단락을 나눠 동일 문구를 사용. 포장·배송·보관 정보는 만들지 않고 빈 상태.
- demo.mjs에 출처용 디자인 예시 안내. 작업실에 항상 표시, JSON은 demo=true. 상점에 자동 게시하지 않음.
