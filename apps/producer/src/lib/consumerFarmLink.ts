// '소비자 앱에서 내 농가 보기'를 둘지(SCR-30·SCR-33, FEAT-02 AC-02-3, DEV-477).
// 공유 링크(`MyFarm.shareUrl`)가 있는 농가만 소비자 앱에서 열린다. 승인 전·테스트·심사용으로 숨긴 농가(DEV-472)는
// 서버가 shareUrl을 주지 않는다. 농가 정보를 받기 전·조회 실패·농가 없음도 링크를 모르니 줄을 두지 않는다.
// React 없이 Node 테스트에서 부를 수 있게 따로 둔다.

/** 열 농가 ID. 줄을 두지 않으면 null */
export function consumerFarmTarget(
  farm: { farmId: string; shareUrl: string | null } | null | undefined,
): string | null {
  return farm?.farmId && farm.shareUrl ? farm.farmId : null;
}
