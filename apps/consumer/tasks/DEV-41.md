## DEV-41 [I3] HE(11/4) 안내 문서와 11/3 사전 점검 보고서

- 이슈: [DEV-41](https://linear.app/sswp6/issue/DEV-41) (관련: DEV-33 APK Release, DEV-198 평가 주소, DEV-205·206 APK 문제)
- 브랜치: `nemodleo/dev-41-he-guide-pwa-notes`, PR #388
- 기능·인수 조건: 없음(평가 안내 문서·보고서). 제품 동작 변경 없음.
- 상태: 문서 완료, 리뷰 대기

### 목표
11/4 Heuristic Evaluation을 Android 폰에서 APK 대신 PWA(Chrome에서 평가 주소를 연 뒤 홈 화면에 추가)로 하도록 안내를 바꾸고, 11/3 밤 Claude 사전 점검 보고서 3편(웹·APK·PWA)을 레포에 보관한다.

### 범위 (수정 허용 경로)
- `docs/evaluation/he-2026-11-04/README.md`: 1절 '앱 여는 법' 표(Android 줄을 Chrome/PWA로), 평가 주소 기억 설명(DEV-198), APK 금지 줄(DEV-205·206), 3절 생산자 흐름 1번·소비자 흐름 4번 안내, 4절 보고서 링크, 팀용 체크리스트 한 항목
- 새 파일 `docs/evaluation/he-2026-11-04/he-claude-2026-11-03.md`(웹 30건), `he-claude-phone-2026-11-03.md`(APK), `he-claude-pwa-2026-11-03.md`(PWA 설치·확인)
- 이 파일(이 절)

### 비범위
- 앱·서버 코드, Figma v6, DEV-33 절의 EAS 범위(그 절은 그대로 둔다)

### 결정 사항
- 11/04 APK는 쓰지 않는다: 키보드가 입력칸을 가림(DEV-205), 생산자 투어가 레이아웃을 반으로 밂(DEV-206). PWA는 #386(localStorage 평가 모드)으로 홈 아이콘에서도 테스트 계정이 보인다(PWA 보고서 추가 확인 표).
- 11/04 보고서에서 레포 밖 경로와 실제 가입자 이름은 지웠다. 심각도 3 이상은 DEV-207~210으로 등록해 같은 날 머지했다.

### 작업
- [x] README 안내 수정, 보고서 3편 추가
- [x] 테스트: 없음(문서만)

### 기록
- 11/04 spec-check가 DEV-33 절("README 한 줄")을 기준으로 범위 이탈(MISMATCH SC-001·002)을 잡아 이 절을 따로 만들었다. 체커 수정(DEV-211)이 먼저 머지된 뒤의 결과.
