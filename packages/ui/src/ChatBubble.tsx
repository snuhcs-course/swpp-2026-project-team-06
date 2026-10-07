import type { ReactNode } from "react";
import { View } from "react-native";

import { T } from "./Text";
import { tokens } from "./tokens";

type Props = {
  /** farm = 농가(면 색, 왼쪽) · me = 나(검정, 오른쪽) · ai = AI 안내(테두리 + 배지, 왼쪽) */
  kind: "farm" | "me" | "ai";
  text: string;
  /** 보낸 시각 */
  time?: string;
  /** 보낸 사람 표시(농가 이름 등) */
  sender?: string;
  /** AI 근거 요약 */
  basis?: string;
  /** 말풍선 아래 보조 줄(넘긴 이유, 연락처 가림 안내 등) */
  note?: string;
  children?: ReactNode;
};

/** 채팅 말풍선: 15 · 줄 간격 1.45 · 안쪽 8/12 · 최대 폭 270 · 꼬리 쪽 모서리 4 */
export function ChatBubble({
  kind,
  text,
  time,
  sender,
  basis,
  note,
  children,
}: Props) {
  const mine = kind === "me";
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: 4 }}>
      {kind === "ai" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AiBadge />
          {time ? (
            <T variant="caption" muted>
              {time}
            </T>
          ) : null}
        </View>
      ) : sender || (!mine && time) ? (
        <T variant="caption" muted>
          {[sender, time].filter(Boolean).join(" · ")}
        </T>
      ) : null}
      {children}
      {text || basis ? (
        <View
          style={{
            maxWidth: 270,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: tokens.radius.md,
            ...(mine
              ? { borderTopRightRadius: tokens.radius.bubbleTail }
              : { borderTopLeftRadius: tokens.radius.bubbleTail }),
            backgroundColor:
              kind === "farm"
                ? tokens.color.surface
                : kind === "me"
                  ? tokens.color.text
                  : tokens.color.background,
            borderWidth: kind === "ai" ? 1 : 0,
            borderColor: tokens.color.text,
          }}
        >
          <T variant="chat" color={mine ? "#FFFFFF" : undefined}>
            {text}
          </T>
          {basis ? (
            <T variant="caption" muted style={{ marginTop: 4 }}>
              근거: {basis}
            </T>
          ) : null}
        </View>
      ) : null}
      {mine && time ? (
        <T variant="caption" muted>
          {time}
        </T>
      ) : null}
      {note ? (
        <T variant="caption" muted style={{ maxWidth: 300 }}>
          {note}
        </T>
      ) : null}
    </View>
  );
}

export function AiBadge() {
  return (
    <View
      style={{
        height: 22,
        paddingHorizontal: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: tokens.color.text,
        justifyContent: "center",
      }}
    >
      <T variant="caption" weight="semibold">
        AI 안내
      </T>
    </View>
  );
}
