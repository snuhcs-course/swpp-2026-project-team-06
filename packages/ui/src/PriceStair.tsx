// 가격 계단(SCR-04, FEAT-07 AC-07-9, DEV-348). DEV-311 통합안 11/17 최종: 테두리 칸, 높이는 기간 순서,
// 지금 칸만 채움. 칸마다 날짜와 그 기간 가격(11/17 PM 결정으로 마지막 칸만 → 모든 칸), 같은 가격은 한 칸. 계산은 stairSteps.ts.
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
  const { steps, nowAbove, nowLabel, basis } = stair;
  const spoken = [
    `일찍 예약할수록 싸요, ${basis} 기준`,
    ...steps.map((s) => (s.now ? `지금 ${s.date} ${s.price}` : `${s.date} ${s.price}`)),
  ].join(", ");
  return (
    <View testID="price-stair" accessible accessibilityLabel={spoken}>
      <T variant="sub" weight="semibold">
        일찍 예약할수록 싸요
        <T variant="sub" muted weight="regular">
          {` · ${basis} 기준`}
        </T>
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
      {/* 칸마다 날짜 + 그 기간 가격(DEV-348 11/17 PM 결정). 지금 칸은 굵게 #111, 뒤 칸은 보조색 */}
      <View style={{ flexDirection: "row", gap: GAP, marginTop: GAP }}>
        {steps.map((s, i) => (
          <View key={i} testID="price-stair-label" style={{ flex: 1, minWidth: 0 }}>
            <T variant="caption" weight={s.now ? "semibold" : "regular"} muted={!s.now}>
              {s.now ? nowLabel : s.date}
            </T>
            <T variant="caption" weight={s.now ? "semibold" : "regular"} muted={!s.now}>
              {s.price}
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

/** 알약 기둥 셋(viewBox 14×10, 바닥 정렬, 폭 3·간격 2·반경 1.5). 첫 기둥(지금)만 100%, 나머지는 28%(DEV-348 11/17 결정, 보드 S3) */
const STAIR_MARK_PILLS = [
  { x: 0.5, height: 5 },
  { x: 5.5, height: 7.5 },
  { x: 10.5, height: 10 },
];

/**
 * 정적 계단 표식(홈 개념 상자 28×20, DEV-311 통합안 S3 알약 기둥). 단계 수와 무관하게 언제나 기둥 셋. 데이터를 읽지 않는 장식이라 화면 읽기에서 숨긴다.
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
        {STAIR_MARK_PILLS.map((p, i) => (
          <Rect
            key={p.x}
            x={p.x}
            y={10 - p.height}
            width={3}
            height={p.height}
            rx={1.5}
            ry={1.5}
            fill={color}
            fillOpacity={i === 0 ? 1 : 0.28}
          />
        ))}
      </Svg>
    </View>
  );
}
