import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { Icon, type IconName } from "./Icon";
import { T } from "./Text";
import { tokens } from "./tokens";
import { focusRing } from "./web";

export type ButtonVariant = "primary" | "secondary" | "outline" | "text";

type ButtonProps = {
  label: string;
  onPress?: () => void;
  /** primary = 강조색(화면당 하나), secondary = 면 색, outline = 검정 테두리, text = 글자 버튼 */
  variant?: ButtonVariant;
  /** consumer 52 · producer 56 */
  size?: "consumer" | "producer";
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "consumer",
  disabled = false,
  loading = false,
  icon,
  style,
  accessibilityLabel,
}: ButtonProps) {
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
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
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
        (st as { focused?: boolean }).focused && focusRing,
        style,
      ]}
    >
      <View style={styles.inner}>
        {/* 로딩: 글자 자리에 스피너, 폭은 그대로(글자는 투명하게 남김) */}
        {icon && !loading ? <Icon name={icon} size={22} color={fg} /> : null}
        <T
          variant="body"
          weight="semibold"
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
});
