// 플랫폼별 스타일 도우미. 웹은 react-native-web이 CSS 문자열을 그대로 넘기고, 앱은 숫자로 계산한다.
import { Platform, type ViewStyle } from "react-native";
import { initialWindowMetrics } from "react-native-safe-area-context";

const isWeb = Platform.OS === "web";

/**
 * 기기 안전 영역을 더한 여백. 웹은 CSS env(safe-area-inset-*), 앱은 시작 때 잰 인셋(노치·홈 표시줄)을 더한다(DEV-33).
 * 앱 인셋이 없으면(구형 기기·시뮬레이터 초기화 전) 숫자 그대로.
 */
export function safe(edge: "top" | "bottom", px: number): number {
  if (isWeb)
    return `calc(${px}px + env(safe-area-inset-${edge}))` as unknown as number;
  return px + (initialWindowMetrics?.insets[edge] ?? 0);
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
