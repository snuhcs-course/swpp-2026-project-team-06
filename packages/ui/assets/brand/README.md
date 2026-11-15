# Farmclub 로고 원본

사용자가 승인한 투명 PNG 원본 4종이다. 생성 원본의 알파·비율을 보존한다.

- `logo-wordmark.png`: 기본 글자형. 소비자 홈에서 사용한다.
- `logo-icon.png`: 심볼. 생산자 현황에서 기존 36×40px 영역에 표시한다.
- `logo-paper-glow-clean.png`: 두 줄 조합형. 생산자 로그인 안내 제목 오른쪽에 사용한다.
- `logo-horizontal.png`: 가로 조합형 원본 보존. 현재 화면에서는 사용하지 않는다.

앱에서는 공용 `BrandLogo`를 사용한다. 로그인 광학 정렬은 그림 박스 대신 FARM/CLUB 글자 두 줄을 기준으로 승인했으며, 구체적인 배치값은 `packages/ui/spec.md`의 DEV-85 절에 있다. 승인 검토 페이지는 `docs/design/brand-review/index.html`이다.

DEV-287: 흑백 표시는 두 줄 조합형 원본에 grayscale(1)을 적용해 생성한 `logo-grayscale.png`를 사용한다. 구형 f. 앱 아이콘과 Expo 기본 자산은 승인된 두 줄 로고를 여백 안에 맞춘 PNG로 교체한다. 재생성: `node scripts/generate-brand-icons.mjs` (Playwright Chromium 필요). 원본 PNG를 다시 만들면 앱이 쓰는 `*.display.webp` 사본도 아래 DEV-325 표의 크기로 `cwebp`로 다시 만든다.

DEV-325: 앱(`BrandLogo`)은 원본 대신 표시용 사본 `*.display.webp`를 쓴다. 원본 PNG는 그대로 보존한다. 크기는 `BrandLogo` 기본 크기 × 3이다.

| 사본 | 원본 | 크기 | 기준 |
| --- | --- | --- | --- |
| `logo-wordmark.display.webp` | `logo-wordmark.png` | 522×174 | 글자형 174px |
| `logo-icon.display.webp` | `logo-icon.png` | 120×120 | 36×40px 영역 |
| `logo-grayscale.display.webp` | `logo-grayscale.png` | 516×387 | 흑백 172px(현재 최대 80px) |
| `logo-paper-glow-clean.display.webp` | `logo-paper-glow-clean.png` | 516×387 | 로그인 조합형 172px |

재생성: `cwebp -q 82 -alpha_q 90 -m 6 -resize <너비> 0 <원본>.png -o <원본>.display.webp`
