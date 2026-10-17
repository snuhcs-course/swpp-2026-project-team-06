import { Icon, tokens } from "@farmclub/ui";
import { createElement } from "react";
import { Platform, Pressable } from "react-native";

export function SectionSwitch({
  value,
  disabled,
  accessibilityLabel,
  onValueChange,
}: {
  value: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  onValueChange: (value: boolean) => void;
}) {
  const icon = (
    <Icon
      name={value ? "eye" : "eyeOff"}
      size={20}
      color={tokens.color.textMuted}
      strokeWidth={1.5}
    />
  );
  const style = {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    opacity: disabled ? 0.45 : 1,
  };
  if (Platform.OS === "web")
    return createElement(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-label": accessibilityLabel,
        "aria-checked": value,
        disabled,
        onClick: () => onValueChange(!value),
        style: {
          ...style,
          display: "flex",
          padding: 0,
          border: 0,
          borderRadius: 6,
          background: "transparent",
          cursor: disabled ? "default" : "pointer",
        },
      },
      icon,
    );
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={style}
    >
      {icon}
    </Pressable>
  );
}
