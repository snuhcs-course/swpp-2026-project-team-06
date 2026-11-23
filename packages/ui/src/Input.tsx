import { useState, type Ref } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
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
  /** 입력칸에 초점을 옮길 때 쓰는 ref(예: 우편번호 찾기 뒤 상세 주소, DEV-314) */
  inputRef?: Ref<TextInput>;
  /** 비밀번호 칸(DEV-363): 글자를 가리고 오른쪽에 ‘보기/숨기기’를 둔다. 자동 대문자·맞춤법은 끈다 */
  secure?: boolean;
  /** 아이디처럼 대문자·자동 고침을 끄는 칸 */
  plain?: boolean;
  /** 브라우저·키체인 자동 완성 힌트(username, current-password, new-password) */
  autoComplete?: "username" | "current-password" | "new-password" | "off";
  onSubmitEditing?: () => void;
  selection?: TextInputProps["selection"];
  onSelectionChange?: TextInputProps["onSelectionChange"];
  testID?: string;
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
  inputRef,
  secure,
  plain,
  autoComplete,
  onSubmitEditing,
  selection,
  onSelectionChange,
  testID,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const noAuto = secure || plain;
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
      <View style={secure ? styles.secureRow : undefined}>
      <TextInput
        ref={inputRef}
        testID={testID}
        accessibilityLabel={accessibilityLabel ?? label}
        secureTextEntry={secure && !revealed}
        autoCapitalize={noAuto ? "none" : undefined}
        autoCorrect={noAuto ? false : undefined}
        spellCheck={noAuto ? false : undefined}
        autoComplete={autoComplete}
        onSubmitEditing={onSubmitEditing}
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
        selection={selection}
        onSelectionChange={onSelectionChange}
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
          secure && styles.securePad,
        ]}
      />
      {secure ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? "비밀번호 숨기기" : "비밀번호 보기"}
          onPress={() => setRevealed((v) => !v)}
          style={styles.reveal}
        >
          <T variant="sub" muted>
            {revealed ? "숨기기" : "보기"}
          </T>
        </Pressable>
      ) : null}
      </View>
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
  secureRow: { position: "relative", justifyContent: "center" },
  securePad: { paddingRight: 72 },
  reveal: {
    position: "absolute",
    right: 4,
    minHeight: 44,
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
  },
});
