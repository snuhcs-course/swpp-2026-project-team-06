import { Icon, T, tokens } from "@farmclub/ui";
import { Pressable, View } from "react-native";
export function EditorActions({ preview, onPreview, aiOpen, onAi }: {
  preview: boolean; onPreview: () => void; aiOpen?: boolean; onAi?: () => void;
}) {
  return <View style={{ flexDirection: "row" }}>
    <Pressable accessibilityRole="button" accessibilityLabel={preview ? "편집하기" : "구매자 화면 보기"}
      aria-pressed={preview} accessibilityState={{ selected: preview }} onPress={onPreview}
      style={{ minWidth: 48, minHeight: 48, gap: 2, alignItems: "center", justifyContent: "center" }}>
      <Icon name={preview ? "pencil" : "page"} size={24} color={preview ? tokens.color.accent : tokens.color.text} />
      <T color={preview ? tokens.color.accent : tokens.color.text} style={{ fontSize: 11, lineHeight: 14 }}>{preview ? "편집하기" : "미리보기"}</T>
    </Pressable>
    {onAi ? <Pressable accessibilityRole="button" accessibilityLabel={aiOpen ? "AI 시트 닫기" : "AI 시트 열기"}
      accessibilityState={{ expanded: !!aiOpen }} onPress={onAi}
      style={{ minWidth: 48, minHeight: 48, gap: 2, alignItems: "center", justifyContent: "center" }}>
      <Icon name="sparkles" size={24} color={aiOpen ? tokens.color.accent : tokens.color.text} />
      <T color={aiOpen ? tokens.color.accent : tokens.color.text} style={{ fontSize: 11, lineHeight: 14 }}>AI 초안</T>
    </Pressable> : null}
  </View>;
}
