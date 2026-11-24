// 1:1 채팅(ChatThread)과 소식방(NewsRoom)이 같이 쓰는 입력줄·떠 있는 알약·복사(DEV-295, Figma 1:38·7:78·7:90).
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { ActivityIndicator, Platform, Pressable, TextInput, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { T } from "./Text";
import { tokens } from "./tokens";

/** 입력줄 한 칸 높이: 도구 버튼·입력칸·보내기 모두 40, 세로 가운데(Figma '40 / 40 / 40') */
export const COMPOSER_ROW = 40;
/** 40 칸을 터치 48로 넓히는 여백(N-02) */
const HIT = (tokens.touchTarget.min - COMPOSER_ROW) / 2;
const INPUT_LINE = 22;
const INPUT_PAD = (COMPOSER_ROW - INPUT_LINE) / 2;
/** 입력칸이 늘어나는 최대 높이: 6줄. 그보다 길면 입력칸 안에서 스크롤(DEV-342) */
const COMPOSER_MAX_HEIGHT = INPUT_LINE * 6 + INPUT_PAD * 2;

/**
 * 웹 textarea는 글이 길어져도 스스로 커지지 않는다(앱의 multiline은 maxHeight까지 커짐).
 * 웹에서만 글이 바뀔 때·폭이 바뀔 때 scrollHeight로 높이를 다시 재서 COMPOSER_MAX_HEIGHT까지 늘린다.
 * 줄어들 때도 맞도록 잴 때 잠깐 높이를 0으로 둔다.
 */
function useWebAutoHeight(value: string) {
  const node = useRef<TextInput | null>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const measure = useCallback(() => {
    if (Platform.OS !== "web") return;
    const el = node.current as unknown as HTMLTextAreaElement | null;
    if (!el || typeof el.scrollHeight !== "number" || !el.style) return;
    const prev = el.style.height, top = el.scrollTop;
    el.style.height = "0px";
    const content = el.scrollHeight;
    el.style.height = prev;
    el.scrollTop = top; // 6줄을 넘겨 입력칸 안에서 스크롤 중이어도 위치를 지킨다
    const next = Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_ROW, Math.ceil(content)));
    setHeight((cur) => (cur === next ? cur : next));
  }, []);
  useLayoutEffect(measure, [value, measure]);
  return { node, height, measure };
}

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
  trailing,
  sendOnEnter = false,
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
  /** 1:1 채팅에서 Enter 전송을 사용한다. 소식 작성은 줄바꿈을 유지한다. */
  sendOnEnter?: boolean;
  /** 입력칸 안 오른쪽 버튼(예: 이모티콘 웃는 얼굴, DEV-478). 있으면 입력칸과 한 알약 안에 놓는다 */
  trailing?: ReactNode;
}) {
  const auto = useWebAutoHeight(value);
  const composing = useRef(false), allowNewline = useRef(false), imeEnter = useRef(false);
  const sendState = useRef({ editable, canSend, busy, onSend });
  sendState.current = { editable, canSend, busy, onSend };
  const submit = () => {
    const state = sendState.current;
    if (state.editable && state.canSend && !state.busy && !composing.current) state.onSend();
  };
  useLayoutEffect(() => {
    if (!sendOnEnter || Platform.OS !== "web") return;
    // RN Web filters composition props; subscribe on the actual textarea.
    const node = auto.node.current as unknown as HTMLTextAreaElement | null;
    const start = () => { composing.current = true; imeEnter.current = false; };
    const end = () => { composing.current = false; };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.keyCode === 229) imeEnter.current = false;
    };
    const beforeInput = (event: InputEvent) => {
      if (!["insertLineBreak", "insertParagraph"].includes(event.inputType) || event.isComposing || composing.current) return;
      // Safari can end composition before the 229 Enter and its line-break event.
      if (imeEnter.current) { imeEnter.current = false; event.preventDefault(); return; }
      if (allowNewline.current) { allowNewline.current = false; return; }
      event.preventDefault();
      submit();
    };
    node?.addEventListener("keyup", keyUp);
    node?.addEventListener("beforeinput", beforeInput);
    node?.addEventListener("compositionstart", start);
    node?.addEventListener("compositionend", end);
    return () => {
      node?.removeEventListener("keyup", keyUp);
      node?.removeEventListener("beforeinput", beforeInput);
      node?.removeEventListener("compositionstart", start);
      node?.removeEventListener("compositionend", end);
    };
  }, [sendOnEnter]);

  // 바깥 inputRef(포커스 등)와 높이 재기용 ref를 함께 건다
  const setRef = useCallback(
    (el: TextInput | null) => {
      auto.node.current = el;
      if (typeof inputRef === "function") inputRef(el);
      else if (inputRef) (inputRef as { current: TextInput | null }).current = el;
    },
    [inputRef, auto.node],
  );
  const field = (
    <TextInput
      ref={setRef}
      accessibilityLabel={accessibilityLabel}
      placeholder={sendOnEnter && !value ? `${placeholder} · Enter로 전송` : placeholder}
      placeholderTextColor={tokens.color.textMuted}
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      multiline
      returnKeyType={sendOnEnter ? "send" : "default"}
      submitBehavior={sendOnEnter && Platform.OS !== "web" ? "submit" : "newline"}
      onSubmitEditing={sendOnEnter && Platform.OS !== "web" ? submit : undefined}
      {...(sendOnEnter && Platform.OS === "web" ? {
        enterKeyHint: "send",
        onKeyPress: (e: { key: string; shiftKey: boolean; keyCode?: number; nativeEvent?: { isComposing?: boolean; keyCode?: number }; isComposing?: boolean; preventDefault: () => void }) => {
          imeEnter.current = e.key === "Enter" && Boolean(composing.current || e.isComposing ||
            e.nativeEvent?.isComposing || e.keyCode === 229 || e.nativeEvent?.keyCode === 229);
          allowNewline.current = e.key === "Enter" && e.shiftKey;
          if (e.key !== "Enter" || e.shiftKey || composing.current || e.isComposing ||
              e.nativeEvent?.isComposing || e.keyCode === 229 || e.nativeEvent?.keyCode === 229) return;
          e.preventDefault();
          submit();
        },
      } as object : {})}
      // 웹 textarea는 기본 2줄 높이라 한 줄(40)로 시작하게 하고, 글이 길어지면 6줄까지 늘린다(DEV-342). 그 뒤는 스크롤
      {...(Platform.OS === "web" ? { numberOfLines: 1, onLayout: auto.measure } : null)}
      maxLength={maxLength}
      textAlignVertical="center"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: COMPOSER_ROW,
        maxHeight: COMPOSER_MAX_HEIGHT,
        ...(Platform.OS === "web" && auto.height ? { height: auto.height } : null),
        paddingHorizontal: tokens.space.md,
        paddingVertical: INPUT_PAD,
        borderRadius: COMPOSER_ROW / 2,
        backgroundColor: trailing ? "transparent" : tokens.color.surface,
        ...(trailing ? { paddingRight: 0 } : null),
        fontSize: tokens.fontSize.input,
        lineHeight: INPUT_LINE,
        fontFamily: tokens.fontFamily,
        color: tokens.color.text,
        ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
      }}
    />
  );
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
        {trailing ? (
          <View style={{
            flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-end",
            borderRadius: COMPOSER_ROW / 2, backgroundColor: tokens.color.surface,
          }}>
            {field}
            {trailing}
          </View>
        ) : field}
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
