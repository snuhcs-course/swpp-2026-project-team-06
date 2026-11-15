// AC-07-3(DEV-327, PM 11/15 Figma 승인): 홈 '제철 상품' 카드와 농가 목록 줄의 사진 위 '품절' 덮개.
// 상품 상세·농가 판매 품목·소식 선반에는 쓰지 않는다. Photo(content.tsx)는 바꾸지 않고 바깥에서 감싼다.
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { T } from "./Text";
import { tokens } from "./tokens";

/** 흰색 62% 막 */
const SCRIM = "rgba(255,255,255,0.62)";
/** #4A4A4A 85% */
const LABEL = "rgba(74,74,74,0.85)";

/** 사진 높이에서 글자 크기를 구한다: 홈 카드 173 → 28, 농가 목록 104 → 20 */
export const soldOutFontSize = (height: number) =>
  Math.max(20, Math.min(28, Math.round(height * 0.16)));

/** 사진(children)을 감싸고, show면 같은 모서리 반경의 막과 가운데 '품절'을 얹는다.
 *  style(바깥 여백 등)은 감싼 View가 받는다. show가 거짓이어도 같은 View라 배치가 같다. */
export function SoldOutOverlay({
  show,
  height,
  radius = tokens.radius.md,
  style,
  children,
}: {
  show: boolean;
  /** 감싼 사진의 높이(글자 크기 계산) */
  height: number;
  /** 감싼 사진의 모서리 반경(Photo 기본값과 같음) */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const size = soldOutFontSize(height);
  return (
    // 가로 줄(농가 목록)에서 줄 높이로 늘어나지 않게 사진 크기에 맞춘다
    <View style={[{ alignSelf: "flex-start" }, style]}>
      {children}
      {show ? (
        <View
          testID="sold-out-overlay"
          accessibilityLabel="품절"
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: radius,
            backgroundColor: SCRIM,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <T
            weight="bold"
            color={LABEL}
            accessibilityRole="text"
            style={{ fontSize: size, lineHeight: Math.round(size * 1.3) }}
          >
            품절
          </T>
        </View>
      ) : null}
    </View>
  );
}
