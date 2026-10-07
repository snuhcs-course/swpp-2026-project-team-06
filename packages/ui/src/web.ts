// 웹 전용 스타일 도우미. react-native-web이 CSS 문자열을 그대로 넘긴다.
import { Platform, type ViewStyle } from "react-native";

const isWeb = Platform.OS === "web";

/** 기기 안전 영역(env(safe-area-inset-*))을 더한 여백. 웹이 아니면 숫자 그대로. */
export function safe(edge: "top" | "bottom", px: number): number {
  return (isWeb
    ? `calc(${px}px + env(safe-area-inset-${edge}))`
    : px) as unknown as number;
}

/** 키보드 포커스 링: 2px #111111, 2px 띄움(디자인 D-11) */
export const focusRing = (isWeb
  ? {
      outlineStyle: "solid",
      outlineWidth: 2,
      outlineColor: "#111111",
      outlineOffset: 2,
    }
  : {}) as unknown as ViewStyle;
