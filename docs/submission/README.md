# I1 문서와 그림 관리

요구사항·설계의 편집 원본은 `docs/wiki/`의 두 영문 Markdown이다. 이번 작업에서는 사용자 요청에 따라 PDF 출력을 보류한다. 아래 도구는 Wiki에 들어가는 그림을 재생성하며 제품 의존성이나 런타임을 변경하지 않는다.

## 그림 변경 시

다이어그램 5개는 `figures.py`가 SVG와 PNG로 생성한다. Python 환경에 `PyMuPDF`가 필요하다.

```sh
python docs/submission/figures.py
```

화면 패널 3개는 기존 `docs/design/screens/` HTML의 상단/하단 viewport를 캡처해 구성한다. Node 환경의 `playwright`와 설치된 Chromium, Python의 `Pillow`, 한국어 글꼴이 필요하다. Windows에서는 환경 변수 `PLAYWRIGHT_CHANNEL=msedge`로 설치된 Edge를 사용할 수 있다. 외부 요청은 차단하고 로컬 이미지와 시스템 글꼴을 사용한다.

```sh
node docs/submission/capture.cjs ../tmp/screens
python docs/submission/screen_panels.py ../tmp/screens --font /path/to/sans.ttf
```

긴 화면은 일부만 보이므로 각 패널에 viewport excerpt를 표시했다. 디자인 참조이며 실제 앱 실행·배포·테스트 증거가 아니다. HTML 화면을 고쳤으면 다시 캡처한다.

## 제출 경계

- 본 문서의 구현 기준은 main `747f588`이다. 외부 서비스·운영 자동화 등의 미완료 사항을 설계 문서에 구분했다.
- 통합 테스트 기록은 별도 `Testing-Documentation.md`에서 확인한다. 이번 문서 작업은 제품 테스트 재실행을 의미하지 않는다.
- AI 보고서의 실제 프롬프트·경험과 일정표의 실제 시간·토큰은 팀이 확인해 작성한다.
- 추후 문서 PDF와 일정표 XLSX가 완성되면 `team6-iter1-reqspec.pdf`, `team6-iter1-design.pdf`, `team6-iter1-schedule.xlsx`, `team6-iter1-AI-collaboration-report.pdf`를 `team6-iter1.zip`에 넣는다.
- Wiki는 PR이 main에 머지된 후 기존 동기화 workflow가 반영한다.
