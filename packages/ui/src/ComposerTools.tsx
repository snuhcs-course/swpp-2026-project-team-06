import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { EMOTICONS, type EmoticonId } from "@farmclub/api";
import { EmoticonImage } from "./Emoticon";
import { Icon } from "./Icon";
import { T } from "./Text";
import { tokens } from "./tokens";

type Props = {
  selected?: EmoticonId;
  onSelect: (id: EmoticonId | undefined) => void;
  onSend: () => void;
  disabled: boolean;
  onPhoto?: () => void;
  photoLabel?: string;
  photoDisabled?: boolean;
};

function FaceIcon() {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={8} stroke={tokens.color.text} strokeWidth={1.75} />
    <Circle cx={9} cy={9} r={1} fill={tokens.color.text} />
    <Circle cx={15} cy={9} r={1} fill={tokens.color.text} />
    <Path d="M8 14s1 3 4 3 4-3 4-3" stroke={tokens.color.text} strokeWidth={1.75} strokeLinecap="round" />
  </Svg>;
}

/** Selection belongs to the caller, so failed sends preserve it and context changes can clear it. */
export function useComposerTools({ selected, onSelect, onSend, disabled, onPhoto, photoLabel = "사진", photoDisabled }: Props) {
  const [mode, setMode] = useState<"closed" | "menu" | "emoticons">("closed");
  const close = useCallback(() => setMode("closed"), []);
  useEffect(() => { if (disabled) setMode("closed"); }, [disabled]);
  const buttonStyle = { minHeight: 48, paddingHorizontal: 14, flexDirection: "row" as const,
    alignItems: "center" as const, gap: 8, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 12 };
  return {
    close,
    tool: { icon: mode === "closed" ? "plus" as const : "close" as const,
      label: "사진·이모티콘", expanded: mode !== "closed", disabled,
      onPress: () => setMode(mode === "closed" ? "menu" : "closed") },
    above: selected ? <View testID="emoticon-selection" style={{ flexDirection: "row", alignItems: "center", gap: 8,
      paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: tokens.color.border }}>
      <EmoticonImage id={selected} size={112} />
      <T variant="caption" muted style={{ flex: 1 }}>목록에서 한 번 더 누르거나 전송하면 보내요.</T>
      <Pressable accessibilityRole="button" accessibilityLabel="이모티콘 선택 취소" disabled={disabled}
        onPress={() => onSelect(undefined)} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
        <Icon name="close" size={18} />
      </Pressable>
    </View> : null,
    below: mode !== "closed" ? <View style={{ paddingTop: 8, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {onPhoto ? <Pressable accessibilityRole="button" accessibilityLabel={photoLabel}
          disabled={disabled || photoDisabled} style={[buttonStyle, { opacity: disabled || photoDisabled ? 0.35 : 1 }]}
          onPress={() => { onSelect(undefined); close(); onPhoto(); }}>
          <Icon name="photo" size={22} /><T variant="sub">{photoLabel}</T>
        </Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="이모티콘" disabled={disabled}
          aria-expanded={mode === "emoticons"} style={buttonStyle}
          onPress={() => setMode(mode === "emoticons" ? "menu" : "emoticons")}>
          <FaceIcon /><T variant="sub">이모티콘</T>
        </Pressable>
      </View>
      {mode === "emoticons" ? <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
        <View accessibilityLabel="이모티콘 10종" style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {EMOTICONS.map(item => <Pressable key={item.id} accessibilityRole="button"
            accessibilityLabel={`${item.label} 선택`} accessibilityState={{ selected: selected === item.id }}
            disabled={disabled} onPress={() => selected === item.id ? onSend() : onSelect(item.id)}
            style={{ width: "20%", minHeight: 72, alignItems: "center", justifyContent: "center", borderRadius: 8,
              backgroundColor: selected === item.id ? "#FFF2E9" : "transparent" }}>
            <EmoticonImage id={item.id} size={64} />
          </Pressable>)}
        </View>
      </ScrollView> : null}
    </View> : null,
  };
}
