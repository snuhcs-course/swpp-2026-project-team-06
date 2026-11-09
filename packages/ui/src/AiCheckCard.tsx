import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Icon } from "./Icon";
import { T } from "./Text";
import { tokens } from "./tokens";
import type { AiCheckLabel } from "./aiCheck";

/** 깃발 색(Figma 10:116·10:289): 요청 = 오류 빨강 면, 확인·바로잡음 = 초록 면 */
export const AI_CHECK_COLOR = {
  flag: { text: tokens.color.error, background: "#FEF3F2" },
  done: { text: "#1B7F3B", background: "#ECF7EF" },
} as const;

/** 작은 칩: 깃발(요청)·체크(확인·바로잡음) 아이콘 + 글자. 높이 22, 터치 대상 아님 */
export function AiCheckChip({ label, testID }: { label: AiCheckLabel; testID?: string }) {
  const color = AI_CHECK_COLOR[label.tone];
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        minHeight: 22,
        paddingHorizontal: 8,
        borderRadius: 4,
        backgroundColor: color.background,
        alignSelf: "flex-start",
      }}
    >
      <Icon name={label.tone === "flag" ? "flag" : "check"} size={12} strokeWidth={2.5} color={color.text} />
      <T variant="caption" weight="semibold" color={color.text}>
        {label.text}
      </T>
    </View>
  );
}

/**
 * 생산자 대화방의 확인 카드(Figma 10:238). 깃발 답변 바로 아래에 소비자가 덧붙인 말을 인용하고
 * [답이 맞아요] / [바로잡기] 두 버튼. 바로잡기는 입력칸에 AI 답변 인용을 붙인다(호출하는 쪽)
 */
export function AiCheckCard({
  name,
  followUp,
  onConfirm,
  onCorrect,
  disabled,
}: {
  /** 소비자 가림 이름(김○○). 없으면 '소비자' */
  name?: string;
  followUp: string | null;
  onConfirm: () => Promise<unknown>;
  onCorrect: () => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <View
      testID="ai-check-card"
      style={{
        alignSelf: "stretch",
        padding: tokens.space.md,
        gap: tokens.space.sm,
        borderWidth: 1,
        borderColor: tokens.color.border,
        borderRadius: 12,
        backgroundColor: tokens.color.background,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="flag" size={16} strokeWidth={2} color={tokens.color.error} />
        <T variant="sub" weight="semibold" style={{ flex: 1 }}>
          {`${name ? `${name}님이` : "소비자가"} 이 답변 확인을 요청했어요`}
        </T>
      </View>
      {followUp ? (
        <T variant="sub" muted numberOfLines={2}>
          {`“${followUp}”`}
        </T>
      ) : null}
      <View style={{ flexDirection: "row", gap: tokens.space.sm }}>
        <CardButton
          label="답이 맞아요"
          disabled={disabled || busy}
          busy={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        />
        <CardButton label="바로잡기" primary disabled={disabled || busy} onPress={onCorrect} />
      </View>
    </View>
  );
}

function CardButton({
  label,
  primary,
  disabled,
  busy,
  onPress,
}: {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 48,
        borderRadius: tokens.radius.sm,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
        opacity: disabled && !busy ? 0.5 : 1,
        backgroundColor: primary
          ? pressed
            ? tokens.color.accentPressed
            : tokens.color.accent
          : pressed
            ? tokens.color.border
            : tokens.color.surface,
      })}
    >
      {busy ? <ActivityIndicator size="small" color={primary ? tokens.color.onAccent : tokens.color.text} /> : null}
      <T weight="semibold" color={primary ? tokens.color.onAccent : tokens.color.text}>
        {label}
      </T>
    </Pressable>
  );
}
