import { Pressable, StyleSheet, Text } from "react-native";

import { tokens } from "./tokens";

type ButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
};

export function Button({ label, onPress, disabled = false }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tokens.touchTarget.min,
    minWidth: tokens.touchTarget.min,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  label: {
    fontSize: tokens.fontSize.body,
    fontWeight: "600",
    color: tokens.color.onPrimary,
  },
});
