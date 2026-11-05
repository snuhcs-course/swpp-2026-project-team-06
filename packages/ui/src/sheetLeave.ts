// DEV-225: 시트 안 버튼으로 다른 화면으로 갈 때 쓰는 순서. import 없이 두어 node 테스트가 바로 읽는다.
// 닫힘 애니메이션을 기다리지 않는다: react-native-web Modal은 닫힘을 CSS animationend로 끝내므로,
// 창이 가려져 애니메이션이 멈추면 끝(onDismiss)이 오지 않아 시트가 새 화면 위에 계속 남는다.

export type SheetAnimation = "slide" | "none";

/** 시트를 그릴 애니메이션. 이동하며 닫는 동안(instant)만 애니메이션 없이 바로 사라진다. */
export function sheetAnimation(instant: boolean | undefined): SheetAnimation {
  return instant ? "none" : "slide";
}

/**
 * 즉시 닫기를 켜고(markInstant) → 시트를 닫고(close) → 같은 틱에 이동한다(go).
 * 세 상태 변경이 한 번에 그려지므로 새 화면이 나올 때 시트는 이미 없다.
 */
export function leaveSheet(
  markInstant: () => void,
  close: () => void,
  go: () => void,
): void {
  markInstant();
  close();
  go();
}
