# 자료 분석 명세·계획 문서 관리

DEV-53의 문서 전용 작업 폴더다. 기능 원본은 [제품 명세](../../spec/source-analysis.md), 영문 요약은 [Source Analysis](../../wiki/Source-Analysis.md)다. 구현 결정은 후속 백엔드 계획에서 정의하며 서버 코드 구현 시 해당 코드 폴더 spec과 server/tasks에 옮긴다.

- 현재 템플릿 구현과 분리하여 main에서 문서만 추가한다.
- 기존 API와 모델 설정은 변경하지 않는다. 새 기능은 GPT-6.1 Sol + 명시적 Mock/실제 모드로 계획한다.
- 작업 범위·검증·기록은 tasks.md에 유지한다.
