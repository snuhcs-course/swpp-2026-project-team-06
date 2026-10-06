# tasks.md — I1 프로토타입 스펙 (P14~P22)

- 이슈: SWPP-18(P14) · SWPP-19(P15) · SWPP-20(P16) · SWPP-21(P17) · SWPP-22(P18) · SWPP-23(P19) · SWPP-24(P20) · SWPP-25(P21) · SWPP-26(P22)
- 브랜치: `nemodleo/swpp-18-i1-p14-p22-prototype-spec`
- 상태: 진행 중 (단계별로 PM 결정 반영)

## 목표
10/04 유저스터디 분석 회의 결정과 proposal을 바탕으로 I1 프로토타입 스펙(개요·IA·기능 요구사항·정책·확정 스펙·기술 스택·와이어프레임·화면 명세)을 확정해, 프론트(DEV-3)·백엔드(DEV-4)가 바로 구현을 시작할 수 있게 한다.

## 범위 (수정 허용 경로)
- `docs/spec/**` — 한국어 스펙 원본 (팀 내부)
- `docs/wiki/Requirements-and-Specifications.md`, `docs/wiki/Design-Documentation.md` — 영문 평가 문서 (P22 확정 후 반영)

## 비범위
- 앱 코드, `AGENTS.md`의 기술 스택 섹션(스택 확정 후 별도 PR)
- BM·법인·정산 등 사업 사항 (레포에 쓰지 않음)

## 입력
- Proposal (팀 프로젝트 설명), 회의록 `docs/wiki/meetings/2026-10-04-user-study-analysis-target.md` 외
- 가설·기능 후보: 팀 Notion Problems / Feature DB 사본
- Tech Stack 사본 (Linear 문서)

## 작업
- [x] P14 프로토타입 개요 → `prd.md`
- [x] P15 IA·사용자 흐름 → `ia.md`
- [x] P16 기능 명세 → `functional/` (`README.md`, `rules.md`, `FEAT-xx-*.md`)
- [x] P17 서비스 정책 → `policy.md`
- [ ] P18 프로토타입 스펙 확정 → P14~P17 문서 간 정합성 확인, `README.md` 갱신
- [ ] P19 기술 스택 → `tech-design/README.md`, 결정 기록은 `tech-design/adr/`
- [ ] P20 와이어프레임 → `wireframes.md`
- [ ] P21 화면 명세 → `screens.md`
- [ ] P22 검토·확정 → 전체 스펙 검토, 영문 wiki 반영

## 결정 사항
- 10/06 I1 결제는 Mock 결제 (주문 상태 전이만 구현, 실결제는 I2 이후)
- 10/06 P20·P21은 PM이 새로 작성 (기존 Figma·docx는 접근 불가 → P22에서 대조)
- 10/07 스펙 원본 위치를 `docs/specs/i1/`에서 `docs/spec/`으로 통합, 파일 이름에서 P 번호를 뺀다 (안내는 `docs/spec/README.md`)

## 기록
- 10/06 브랜치·spec 생성
- 10/07 P14~P17 `docs/spec/`으로 이관 완료, 이 파일을 `docs/spec/tasks.md`로 이동
