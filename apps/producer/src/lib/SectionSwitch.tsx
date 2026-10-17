import { tokens } from "@farmclub/ui";
import { Platform, Pressable, View } from "react-native";

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
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      aria-checked={value}
      aria-disabled={!!disabled}
      disabled={disabled}
      {...(Platform.OS === "web"
        ? {
            onKeyDown: (event: {
              key: string;
              repeat: boolean;
              preventDefault: () => void;
            }) => {
              if (event.key === " ") {
                event.preventDefault();
                if (!disabled && !event.repeat) onValueChange(!value);
              }
            },
          }
        : {})}
      onPress={() => onValueChange(!value)}
      style={{
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View
        style={{
          width: 40,
          height: 24,
          padding: 3,
          borderRadius: 12,
          backgroundColor: value ? tokens.color.accent : tokens.color.border,
          alignItems: value ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "#FFFFFF",
          }}
        />
      </View>
    </Pressable>
  );
}
