import type { ReactNode } from "react";
import { Text as RNText, type StyleProp, type TextStyle } from "react-native";

import { tokens } from "./tokens";

export type TextVariant =
  | "display"
  | "title"
  | "heading"
  | "body"
  | "input"
  | "sub"
  | "chat"
  | "caption";

type Props = {
  variant?: TextVariant;
  weight?: "regular" | "semibold" | "bold";
  muted?: boolean;
  color?: string;
  center?: boolean;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
  accessibilityRole?: "header" | "text" | "link";
  /** 개인정보(이름·연락처·주소·계좌 등). 세션 녹화에서 이 글자만 가린다(N-05, DEV-104) */
  masked?: boolean;
};

/** react-native-web이 data-ph-private로 내보낸다. RN 타입에는 dataSet이 없어 넓은 타입으로 둔다 */
const MASKED = { dataSet: { phPrivate: "1" } } as object;

const letterSpacing: Partial<Record<TextVariant, number>> = {
  display: -0.96,
  title: -0.68,
  heading: -0.22,
};

const defaultWeight: Partial<Record<TextVariant, Props["weight"]>> = {
  display: "bold",
  title: "bold",
  heading: "bold",
};

/** 글자 단계 34/22/17/15/13 + 입력 16·채팅 15·할 일 숫자 48. 숫자는 tabular-nums. */
export function T({
  variant = "body",
  weight,
  muted,
  color,
  center,
  numberOfLines,
  style,
  children,
  accessibilityRole,
  masked,
}: Props) {
  const w = weight ?? defaultWeight[variant] ?? "regular";
  return (
    <RNText
      {...(masked ? MASKED : null)}
      accessibilityRole={accessibilityRole}
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: tokens.fontFamily,
          fontSize: tokens.fontSize[variant],
          lineHeight: tokens.lineHeight[variant],
          fontWeight: tokens.fontWeight[w],
          color: color ?? (muted ? tokens.color.textMuted : tokens.color.text),
          letterSpacing: letterSpacing[variant] ?? 0,
          fontVariant: ["tabular-nums"],
          textAlign: center ? "center" : undefined,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
