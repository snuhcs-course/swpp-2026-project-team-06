## DEV-54 기존 자료 일괄 분석 백엔드

- 이슈: https://linear.app/sswp6/issue/DEV-54 · GitHub #103
- 브랜치: jinumeral/dev-54-dev-implement-grounded-bulk-source-analysis-backend
- 관련: FEAT-03/04/07, M-10~13/M-18, AC-SRC-1~8
- 상태: 구현·로컬 검증 완료, PR #104 검토 중. 기존 리뷰 중 작업은 main에 있는 구현을 기준으로 보존한다.
- 목표: 비공개 자료 등록 → 분석 → 근거 검토 → 상품별 상세 초안 저장.
- 수정 허용 경로: server/**, docs/spec/source-analysis.md, docs/spec/README.md, docs/spec/functional/FEAT-03-ai-product-draft.md, docs/spec/functional/FEAT-04-product-edit.md, docs/spec/functional/FEAT-07-product-detail.md, docs/spec/ia.md, docs/spec/screens.md, docs/spec/tech-design/adr/**, docs/wiki/Source-Analysis.md.
- 비범위: 앱 UI·공개 상품 변경·이미지 생성·배포·머지. 사용자가 제외한 내부 백엔드 계획 문서는 커밋하지 않는다.
- 결정: 2026-10-14 Mock으로 검증하고 Sol은 별도 어댑터로 구현. 사용자 키·실제 자료 전송 없이 테스트한다. 작업 시간은 실제 UTC 시계를 사용해 데모 FIXED_NOW와 분리한다.
- [x] 자료 저장·전처리·개인정보 검토
- [x] 영속 큐·재시도·취소·근거 검증
- [x] 검토·18개 모듈 비공개 초안
- [x] Sol 어댑터·Mock·테스트·명세 동기화
- 기록: 사용자 구현 지시로 DEV-54를 시작. Linear MCP는 읽기 전용이므로 상태 변경 불가. Agent 시간/Tokens 미측정.

- 결정 사항: OCR은 별도 프로세스와 명시적 모델 설치를 사용하고, 모든 실제 전송은 가림 검토 후 진행한다. 원본 사진·수동 문구는 생산자가 확인하며 공개 Product에 쓰지 않는다. 삭제 정리는 tombstone 반영 후 파일을 제거한다.
- 검증: PostgreSQL 16에서 pytest 151개 통과, Ruff 통과. Alembic 0006 upgrade/downgrade/re-upgrade/check 통과. 고정 모델 파일로 한국어 OCR 샘플 판독 확인. 실제 Sol·R2 연결 및 실제 농가 20묶음 평가는 미실행.
- 기록: 로컬 Windows 자원 부족 오류와 테스트 DB 시간대 차이를 분리한 후 전체 테스트를 재실행했다. 자동 리뷰에서 삭제 플래그 flush 누락을 수정했다. 키·원본 자료·내부 구현 계획은 커밋에서 제외한다.

