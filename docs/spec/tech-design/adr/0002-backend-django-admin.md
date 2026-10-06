# 0002 백엔드: Django + DRF, 운영자 화면은 Django Admin

- 상태: 결정 (2026-10-07)
- 관련: R-06, R-22, R-25, FEAT-23, N-06

## 배경
운영자는 생산자·상품 승인, 배송 완료, 환불을 처리해야 한다. I1에서는 운영자 화면을 만들 시간이 없어 스크립트로 처리하기로 했었다.

## 결정
Django 5.2 LTS + Django REST Framework를 Railway에 올리고 PostgreSQL을 쓴다. 운영자 업무는 Django Admin에서 처리한다. 파일은 Cloudflare R2(django-storages)에 둔다.

## 결과
- 운영자 업무를 I1부터 화면으로 처리한다(전용 운영자 화면 FEAT-23은 P2 유지).
- 물량 차감은 트랜잭션과 행 잠금으로 처리해 초과 판매를 막는다(AC-09-1).
- 언어가 둘(TypeScript, Python)이 된다.

## 검토한 대안
- FastAPI: 가볍지만 관리 화면·인증·마이그레이션을 직접 조립해야 한다.
- Supabase: 백엔드 코드가 적지만 물량·단계 가격·AI 로직이 함수로 흩어지고 운영자 권한 설계가 필요하다.
