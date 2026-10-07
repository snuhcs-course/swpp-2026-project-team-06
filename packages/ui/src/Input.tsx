import { useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { T } from "./Text";
import { tokens } from "./tokens";

type Props = {
  label?: string;
  optional?: boolean;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  multiline?: boolean;
  /** 긴 글 입력 높이. 붙여넣기 칸은 200 */
  height?: number;
  keyboardType?: KeyboardTypeOptions;
  editable?: boolean;
  maxLength?: number;
  counter?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** 입력칸: 높이 48, 글자 16, 라벨 15 굵게. 오류는 오류색 테두리 + 아래 설명. */
export function Input({
  label,
  optional,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  multiline,
  height,
  keyboardType,
  editable = true,
  maxLength,
  counter,
  style,
  accessibilityLabel,
}: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <T variant="sub" weight="semibold">
          {label}
          {optional ? (
            <T variant="sub" muted>
              {" "}
              선택
            </T>
          ) : null}
        </T>
      ) : null}
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.color.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        editable={editable}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          multiline && {
            height: height ?? 120,
            paddingTop: 12,
            lineHeight: 26,
            textAlignVertical: "top",
          },
          !editable && styles.readonly,
          focused && styles.focused,
          error ? styles.error : null,
        ]}
      />
      {error ? (
        <T variant="sub" color={tokens.color.error}>
          {error}
        </T>
      ) : hint || counter ? (
        <View style={styles.hintRow}>
          <T variant="caption" muted>
            {hint ?? ""}
          </T>
          {counter ? (
            <T variant="caption" muted>
              {value.length.toLocaleString("ko-KR")}
              {maxLength ? ` / ${maxLength.toLocaleString("ko-KR")}` : ""}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  input: {
    minHeight: tokens.height.input,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 16,
    fontSize: tokens.fontSize.input,
    fontFamily: tokens.fontFamily,
    color: tokens.color.text,
    backgroundColor: tokens.color.background,
  },
  readonly: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.surface,
  },
  focused: { borderColor: tokens.color.text, borderWidth: 1.5 },
  error: { borderColor: tokens.color.error, borderWidth: 1.5 },
  hintRow: { flexDirection: "row", justifyContent: "space-between" },
});
