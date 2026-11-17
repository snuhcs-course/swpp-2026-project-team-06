// 가격 계단(SCR-04, FEAT-07 AC-07-9, DEV-348). DEV-311 통합안 11/17 최종: 테두리 칸, 높이는 기간 순서,
// 지금 칸만 채움, 가격은 마지막 칸 아래 하나. 계산은 stairSteps.ts.
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { T } from "./Text";
import { md, won } from "./format";
import { priceStair, STAIR_MAX, type StairInput } from "./stairSteps";
import { tokens } from "./tokens";

/** 칸 사이·라벨 줄 간격(보드 값) */
const GAP = 6;
const BORDER = 1.5;

export function PriceStair({ p }: { p: StairInput }) {
  const stair = priceStair(p, { md, won });
  if (!stair) return null;
  const { steps, nowAbove, nowLabel, lastPrice } = stair;
  const last = steps.length - 1;
  const spoken = [
    "일찍 예약할수록 싸요",
    `지금 가격은 ${steps[0].date || "지금 기간"}`,
    ...steps.slice(1).map((s, i) => (i + 1 === last ? `${s.date} ${lastPrice}` : s.date)),
  ].join(", ");
  return (
    <View testID="price-stair" accessible accessibilityLabel={spoken}>
      <T variant="sub" weight="semibold">
        일찍 예약할수록 싸요
      </T>
      <View
        testID="price-stair-bars"
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: GAP,
          height: STAIR_MAX,
          marginTop: 8,
        }}
      >
        {steps.map((s, i) => (
          <View key={i} style={{ flex: 1, minWidth: 0, gap: 2 }}>
            {s.now && nowAbove ? (
              <T variant="caption" weight="semibold" numberOfLines={1}>
                지금
              </T>
            ) : null}
            <View
              testID={s.now ? "price-stair-now" : "price-stair-step"}
              style={{
                height: s.height,
                borderWidth: BORDER,
                borderColor: s.now ? tokens.color.text : tokens.color.textMuted,
                backgroundColor: s.now ? tokens.color.text : tokens.color.background,
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                borderBottomLeftRadius: 2,
                borderBottomRightRadius: 2,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: GAP, marginTop: GAP }}>
        {steps.map((s, i) => (
          <View key={i} style={{ flex: 1, minWidth: 0 }}>
            {s.now ? (
              <T variant="caption" weight="semibold">
                {nowLabel}
              </T>
            ) : (
              <T variant="caption" muted>
                {s.date}
              </T>
            )}
            {i === last ? (
              <T variant="caption" muted>
                {lastPrice}
              </T>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * 정적 계단 표식(홈 개념 상자 28×20, DEV-311 통합안 표식 g1). 데이터를 읽지 않는 장식이라 화면 읽기에서 숨긴다.
 * 홈 카드처럼 상품마다 지금 단계를 보이는 표식은 목록 API에 기간 필드가 필요해 후속이다.
 */
export function StairMark({ width = 28, color = tokens.color.text }: { width?: number; color?: string }) {
  return (
    <View
      testID="stair-mark"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={width} height={(width * 10) / 14} viewBox="0 0 14 10">
        <Rect x={0} y={6} width={3} height={4} rx={0.5} fill={color} />
        <Rect x={5.5} y={3.5} width={2} height={6} rx={0.5} fill="none" stroke={color} strokeWidth={1} />
        <Rect x={10.5} y={0.5} width={2} height={9} rx={0.5} fill="none" stroke={color} strokeWidth={1} />
      </Svg>
    </View>
  );
}
