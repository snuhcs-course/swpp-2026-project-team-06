// DEV-300: 옵션 한 줄 '5kg  32,000원   24박스 / 72박스'. 현황·상품 목록·판매 설정이 같이 쓴다.
// 11/10 생산자 인터뷰: 옵션별 박스당 가격과 박스가 주이고 kg 총량은 보조(각 화면이 따로 작게 보인다).
import { T, tokens } from "@farmclub/ui";
import { View } from "react-native";
import {
  optionBoxesLabel,
  optionBoxesText,
  optionPriceText,
  type OptionBoxes,
} from "./optionBoxes";

export function OptionBoxRow({
  row,
  variant = "sub",
  labelled = false,
}: {
  row: OptionBoxes;
  /** 판매 설정 표는 body(16), 현황·카드는 sub(14) */
  variant?: "sub" | "body";
  /** 줄 하나를 묶어 읽게 할 때(판매 설정 표). 웹은 role 없는 div의 aria-label을 읽지 않아 group으로 묶는다 */
  labelled?: boolean;
}) {
  const price = optionPriceText(row);
  return (
    <View
      accessible={labelled || undefined}
      role={labelled ? "group" : undefined}
      accessibilityLabel={labelled ? optionBoxesLabel(row) : undefined}
      style={{ flexDirection: "row", alignItems: "baseline", gap: tokens.space.sm }}
    >
      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "baseline",
          gap: tokens.space.sm,
        }}
      >
        <T variant={variant} numberOfLines={1} style={{ minWidth: 40, flexShrink: 1 }}>
          {row.label}
        </T>
        {price ? (
          <T variant={variant} weight="semibold" numberOfLines={1}>
            {price}
          </T>
        ) : null}
      </View>
      <T variant={variant} weight="semibold" numberOfLines={1}>
        {optionBoxesText(row)}
      </T>
    </View>
  );
}
