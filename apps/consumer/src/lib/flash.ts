// 다음 화면(뒤로 돌아간 화면)에서 띄울 성공 토스트 한 개. 예: 배송지 저장 → 배송지 관리에서 '저장했어요'
let pending: string | null = null;

export function setFlash(message: string) {
  pending = message;
}

export function takeFlash(): string | null {
  const m = pending;
  pending = null;
  return m;
}
