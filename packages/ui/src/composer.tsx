// 1:1 채팅(ChatThread)과 소식방(NewsRoom)이 같이 쓰는 입력줄·떠 있는 알약·복사(DEV-295, Figma 1:38·7:78·7:90).
import type { ReactNode, Ref } from "react";
import { ActivityIndicator, Platform, Pressable, TextInput, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { T } from "./Text";
import { tokens } from "./tokens";

/** 입력줄 한 칸 높이: 도구 버튼·입력칸·보내기 모두 40, 세로 가운데(Figma '40 / 40 / 40') */
export const COMPOSER_ROW = 40;
/** 40 칸을 터치 48로 넓히는 여백(N-02) */
const HIT = (tokens.touchTarget.min - COMPOSER_ROW) / 2;
const INPUT_LINE = 22;

export function Composer({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  editable,
  maxLength,
  onSend,
  canSend,
  busy,
  tool,
  inputRef,
  above,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  editable: boolean;
  maxLength: number;
  onSend: () => void;
  /** 보내기를 누를 수 있는지(빈 글·준비 전이면 false) */
  canSend: boolean;
  busy: boolean;
  /** 입력칸 왼쪽 동그란 아이콘 버튼(예: 사진 첨부) */
  tool?: {
    icon: IconName;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    expanded?: boolean;
  };
  inputRef?: Ref<TextInput>;
  /** 입력줄 위(답장 대상, 첨부 사진, 도구 칩 등) */
  above?: ReactNode;
}) {
  return (
    <View style={{ gap: tokens.space.sm }}>
      {above}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: tokens.space.sm }}>
        {tool ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tool.label}
            aria-expanded={tool.expanded}
            disabled={tool.disabled}
            onPress={tool.onPress}
            hitSlop={HIT}
            style={{
              width: COMPOSER_ROW,
              height: COMPOSER_ROW,
              borderRadius: COMPOSER_ROW / 2,
              backgroundColor: tokens.color.surface,
              alignItems: "center",
              justifyContent: "center",
              opacity: tool.disabled ? 0.35 : 1,
            }}
          >
            <Icon name={tool.icon} size={22} />
          </Pressable>
        ) : null}
        <TextInput
          ref={inputRef}
          accessibilityLabel={accessibilityLabel}
          placeholder={placeholder}
          placeholderTextColor={tokens.color.textMuted}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          multiline
          // 웹 textarea는 기본 2줄 높이라 한 줄(40)로 시작하게 한다. 긴 글은 maxHeight까지 스크롤
          {...(Platform.OS === "web" ? { numberOfLines: 1 } : null)}
          maxLength={maxLength}
          textAlignVertical="center"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: COMPOSER_ROW,
            maxHeight: 120,
            paddingHorizontal: tokens.space.md,
            paddingVertical: (COMPOSER_ROW - INPUT_LINE) / 2,
            borderRadius: COMPOSER_ROW / 2,
            backgroundColor: tokens.color.surface,
            fontSize: tokens.fontSize.input,
            lineHeight: INPUT_LINE,
            fontFamily: tokens.fontFamily,
            color: tokens.color.text,
            ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="전송"
          aria-busy={busy}
          onPress={onSend}
          disabled={!canSend || busy}
          hitSlop={HIT}
          style={{
            width: COMPOSER_ROW,
            height: COMPOSER_ROW,
            borderRadius: COMPOSER_ROW / 2,
            backgroundColor: tokens.color.accent,
            opacity: !canSend || busy ? 0.35 : 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {busy ? (
            <ActivityIndicator color={tokens.color.onAccent} />
          ) : (
            <Icon name="send" size={22} color={tokens.color.onAccent} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** 대화 위에 떠 있는 작은 알약 버튼(예: '새 메시지 보기 ↓'). 입력줄 위 가운데, 전체 폭으로 끼어들지 않는다 */
export function FloatingPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: tokens.space.sm, alignItems: "center" }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        hitSlop={HIT}
        style={{
          height: 36,
          paddingHorizontal: tokens.space.md,
          borderRadius: tokens.radius.full,
          backgroundColor: tokens.color.background,
          borderWidth: 1,
          borderColor: tokens.color.border,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        }}
      >
        <T variant="caption" weight="semibold">
          {label}
        </T>
      </Pressable>
    </View>
  );
}

/** 작은 도구 칩(높이 32 + 터치 48). 예: 생산자 소식방 '사진·영상' */
export function ToolChip({
  icon,
  label,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={(tokens.touchTarget.min - 32) / 2}
      style={{
        alignSelf: "flex-start",
        height: 32,
        paddingHorizontal: 12,
        borderRadius: tokens.radius.full,
        borderWidth: 1,
        borderColor: tokens.color.border,
        backgroundColor: tokens.color.background,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Icon name={icon} size={16} />
      <T variant="caption" weight="semibold">
        {label}
      </T>
    </Pressable>
  );
}

/** 메시지 복사. 앱이 넘긴 복사 함수(expo-clipboard)를 먼저 쓰고, 없으면 웹 클립보드 */
export async function copyToClipboard(
  text: string,
  copy?: (text: string) => Promise<unknown>,
): Promise<boolean> {
  try {
    if (copy) return (await copy(text)) !== false;
    const clip = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } })
      .navigator?.clipboard;
    if (!clip?.writeText) return false;
    await clip.writeText(text);
    return true;
  } catch {
    return false;
  }
}
