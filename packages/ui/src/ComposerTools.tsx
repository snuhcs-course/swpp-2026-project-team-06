// 작성창 사진·이모티콘 도구(DEV-468 → DEV-478 카톡 방식).
// ‘+’는 메뉴 없이 사진 고르기를 바로 열고, 이모티콘은 입력칸 안 웃는 얼굴로 연다.
// 패널은 키보드 자리(입력줄 아래)에 칸 바탕·테두리 없이 그림만 4열로 놓는다.
// 고른 이모티콘은 입력줄 바로 위 대화 영역에 크게 띄워 한 번 더 누르면 보내고, 원형 ✕로 취소한다.
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { EMOTICONS, emoticonLabel, type EmoticonId } from "@farmclub/api";
import { EmoticonImage } from "./Emoticon";
import { Icon } from "./Icon";
import { T } from "./Text";
import { tokens } from "./tokens";

type Props = {
  selected?: EmoticonId;
  onSelect: (id: EmoticonId | undefined) => void;
  onSend: () => void;
  disabled: boolean;
  /** 사진 고르기를 바로 연다(앨범·파일 선택). 없으면 ‘+’를 두지 않는다 */
  onPhoto?: () => void;
  photoLabel?: string;
  photoDisabled?: boolean;
};

const PANEL_HEIGHT = 248;
const PREVIEW = 136;

function FaceIcon({ active }: { active: boolean }) {
  const color = active ? tokens.color.accent : tokens.color.text;
  return <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={1.7} />
    <Circle cx={9} cy={10} r={0.9} fill={color} />
    <Circle cx={15} cy={10} r={0.9} fill={color} />
    <Path d="M8.5 14.2s1.2 2.3 3.5 2.3 3.5-2.3 3.5-2.3" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
  </Svg>;
}

/** Selection belongs to the caller, so failed sends preserve it and context changes can clear it. */
export function useComposerTools({ selected, onSelect, onSend, disabled, onPhoto, photoLabel = "사진", photoDisabled }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const label = selected ? emoticonLabel(selected) : undefined;
  return {
    close,
    /** 입력칸 왼쪽 ‘+’: 사진 고르기를 바로 연다 */
    tool: onPhoto ? {
      icon: "plus" as const,
      label: photoLabel,
      disabled: disabled || photoDisabled,
      onPress: () => { onSelect(undefined); setOpen(false); onPhoto(); },
    } : undefined,
    /** 입력칸 안 오른쪽 웃는 얼굴 */
    trailing: <Pressable accessibilityRole="button" accessibilityLabel="이모티콘" aria-expanded={open}
      accessibilityState={{ expanded: open, disabled }} disabled={disabled}
      onPress={() => setOpen(!open)} hitSlop={4}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
        opacity: disabled ? 0.35 : 1 }}>
      <FaceIcon active={open} />
    </Pressable>,
    /** 고른 이모티콘: 입력줄 바로 위 대화 영역에 떠 있는 큰 미리보기(자리를 차지하지 않는다) */
    above: selected ? <View testID="emoticon-selection" pointerEvents="box-none"
      style={{ position: "absolute", left: -tokens.space.md, right: -tokens.space.md, bottom: "100%",
        height: PREVIEW + 40, alignItems: "center", justifyContent: "flex-end", paddingBottom: 6,
        backgroundColor: "rgba(245,245,243,0.94)", zIndex: 2 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? "이모티콘"} 보내기`} disabled={disabled}
        onPress={onSend}
        style={({ pressed }) => ({ width: PREVIEW, height: PREVIEW, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <EmoticonImage id={selected} size={PREVIEW} />
      </Pressable>
      <T variant="caption" muted>한 번 더 누르면 보내요</T>
      <Pressable accessibilityRole="button" accessibilityLabel="이모티콘 선택 취소" disabled={disabled}
        onPress={() => onSelect(undefined)}
        style={{ position: "absolute", right: tokens.space.sm, top: 0, width: 48, height: 48,
          alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(17,17,17,0.55)",
          alignItems: "center", justifyContent: "center" }}>
          <Icon name="close" size={14} color={tokens.color.onAccent} />
        </View>
      </Pressable>
    </View> : null,
    /** 키보드 자리 패널 */
    below: open ? <View style={{ height: PANEL_HEIGHT, marginTop: tokens.space.sm,
      marginHorizontal: -tokens.space.md,
      backgroundColor: tokens.color.surface, borderTopWidth: 1, borderTopColor: tokens.color.border }}>
      <View style={{ height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: tokens.space.sm,
        borderBottomWidth: 1, borderBottomColor: tokens.color.border }}>
        <View accessibilityRole="tab" aria-selected style={{ height: 44, paddingHorizontal: 10, flexDirection: "row",
          alignItems: "center", gap: 6, borderBottomWidth: 2, borderBottomColor: tokens.color.text }}>
          <EmoticonImage id="farmclub-reserved" size={24} />
          <T variant="caption" weight="semibold">팜클럽</T>
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 8 }}>
        <View accessibilityLabel="이모티콘 10종" style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {EMOTICONS.map(item => <Pressable key={item.id} accessibilityRole="button"
            accessibilityLabel={`${item.label} 선택`} accessibilityState={{ selected: selected === item.id, disabled }}
            disabled={disabled} onPress={() => selected === item.id ? onSend() : onSelect(item.id)}
            style={({ pressed }) => ({ width: "25%", aspectRatio: 1, padding: 6, alignItems: "center",
              justifyContent: "center", transform: [{ scale: pressed ? 0.92 : 1 }] })}>
            <EmoticonImage id={item.id} size={68} />
          </Pressable>)}
        </View>
      </ScrollView>
    </View> : null,
  };
}
