import { useId } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Icon, type IconName } from "./Icon";
import { T } from "./Text";
import { tokens } from "./tokens";
import { focusRing, showFocus } from "./web";

export type ButtonVariant = "primary" | "secondary" | "outline" | "text";

type ButtonProps = {
  label: string;
  compact?: boolean;
  onPress?: () => void;
  /** primary = 강조색(화면당 하나), secondary = 면 색, outline = 검정 테두리, text = 글자 버튼.
   *  compact = 칩·작은 버튼 32(터치 48은 hitSlop) */
  variant?: ButtonVariant;
  /** 두 앱 모두 52(기준표, DEV-293). producer는 예전 호출부 호환용 이름 */
  size?: "consumer" | "producer";
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** 화면 읽기 전용 설명(예: 꺼진 이유). 눈에 보이지 않는다. 앱은 accessibilityHint, 웹은 aria-describedby */
  accessibilityHint?: string;
};

export function Button({
  label,
  compact = false,
  onPress,
  variant = "primary",
  size = "consumer",
  disabled = false,
  loading = false,
  icon,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const hintId = `btn-hint-${useId().replace(/:/g, "")}`;
  const webHint = Platform.OS === "web" && !!accessibilityHint;
  const height =
    size === "producer" ? tokens.height.buttonProducer : tokens.height.button;
  const isDisabled = disabled || loading;
  const fg =
    variant === "primary" && !isDisabled
      ? tokens.color.onAccent
      : isDisabled && variant !== "text"
        ? tokens.color.textMuted
        : tokens.color.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      {...(webHint ? { "aria-describedby": hintId } : null)}
      aria-busy={loading}
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={compact ? 8 : undefined}
      style={({ pressed, ...st }) => [
        styles.base,
        { minHeight: variant === "text" ? tokens.touchTarget.min : height },
        variant === "primary" && {
          backgroundColor: pressed
            ? tokens.color.accentPressed
            : tokens.color.accent,
        },
        variant === "secondary" && { backgroundColor: tokens.color.surface },
        variant === "outline" && styles.outline,
        variant === "text" && styles.text,
        isDisabled &&
          variant !== "text" && {
            backgroundColor: tokens.color.surface,
            borderColor: tokens.color.surface,
          },
        pressed && variant !== "primary" && { opacity: 0.7 },
        showFocus(st as { focused?: boolean }) && focusRing,
        compact && {
          minHeight: tokens.height.chip,
          paddingHorizontal: 12,
          ...(variant === "outline"
            ? { borderWidth: 1, borderColor: tokens.color.border }
            : {}),
        },
        style,
      ]}
    >
      <View style={styles.inner}>
        {/* 로딩: 글자 자리에 스피너, 폭은 그대로(글자는 투명하게 남김) */}
        {icon && !loading ? <Icon name={icon} size={22} color={fg} /> : null}
        <T
          variant={compact ? "sub" : "body"}
          weight={compact ? "regular" : "semibold"}
          color={fg}
          style={loading ? { opacity: 0 } : undefined}
        >
          {label}
        </T>
        {loading ? (
          <View style={StyleSheet.absoluteFill}>
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator color={fg} />
            </View>
          </View>
        ) : null}
      </View>
      {webHint ? (
        // 웹 화면 읽기용 설명. 눈에는 보이지 않게(visually hidden) 둔다
        <Text nativeID={hintId} style={styles.srOnly}>
          {accessibilityHint}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.space.md,
  },
  outline: {
    borderWidth: 1.5,
    borderColor: tokens.color.text,
    backgroundColor: tokens.color.background,
  },
  text: {
    backgroundColor: "transparent",
    paddingHorizontal: 4,
    minWidth: 48,
    alignSelf: "flex-start",
  },
  inner: { flexDirection: "row", alignItems: "center", gap: 8 },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
});
