// 웹 전용 스타일 도우미. react-native-web이 CSS 문자열을 그대로 넘긴다.
import { Platform, type ViewStyle } from "react-native";

const isWeb = Platform.OS === "web";

/** 기기 안전 영역(env(safe-area-inset-*))을 더한 여백. 웹이 아니면 숫자 그대로. */
export function safe(edge: "top" | "bottom", px: number): number {
  return (isWeb
    ? `calc(${px}px + env(safe-area-inset-${edge}))`
    : px) as unknown as number;
}

// 마지막 입력이 키보드였는지(웹 :focus-visible과 같은 기준). 손가락·마우스로 누른 뒤에는 포커스 링을 그리지 않는다.
let keyboard = false;
if (isWeb && typeof document !== "undefined") {
  document.addEventListener("keydown", () => (keyboard = true), true);
  document.addEventListener("pointerdown", () => (keyboard = false), true);
}
/** focused 상태에서 포커스 링을 그릴지: 키보드로 이동했을 때만. */
export const showFocus = (st: { focused?: boolean }) =>
  !!st.focused && (!isWeb || keyboard);

/** 키보드 포커스 링: 2px #111111, 2px 띄움(디자인 D-11) */
export const focusRing = (isWeb
  ? {
      outlineStyle: "solid",
      outlineWidth: 2,
      outlineColor: "#111111",
      outlineOffset: 2,
    }
  : {}) as unknown as ViewStyle;
