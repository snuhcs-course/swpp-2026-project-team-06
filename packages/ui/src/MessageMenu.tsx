import { onMenuEscape, onMenuOutsidePress } from "./web";
import { useEffect, useRef } from "react";
import { Modal, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { T } from "./Text";
import { tokens } from "./tokens";

export type MenuPoint = { x: number; y: number };
export function MessageMenu({ visible, point, onClose, actions }: {
  visible: boolean;
  point: MenuPoint | null;
  onClose: () => void;
  actions: { label: string; onPress: () => void }[];
}) {
  const menu = useRef<View>(null);
  useEffect(() => {
    if (!visible) return;
    const escape = onMenuEscape(onClose), outside = onMenuOutsidePress(menu, onClose);
    return () => { escape(); outside(); };
  }, [visible, onClose]);
  const { width, height } = useWindowDimensions();
  const desktop = Platform.OS === "web" && point !== null;
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: desktop ? "transparent" : "#00000033" }}
      {...(Platform.OS === "web" ? { onContextMenu: (e: {preventDefault: () => void}) => e.preventDefault(), onKeyDown: (e: {key: string}) => { if (e.key === "Escape") onClose(); } } as object : {})}>
      <Pressable accessibilityLabel="메뉴 닫기" onPressIn={onClose} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
      <View ref={menu} accessibilityRole="menu" accessibilityLabel="메시지 메뉴"
        style={[{ backgroundColor: tokens.color.background, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 12, padding: 4, position: "absolute" },
          desktop ? { width: 208, left: Math.max(8, Math.min(point.x, width - 216)), top: Math.max(8, Math.min(point.y, height - actions.length * 48 - 24)) }
          : { left: 12, right: 12, bottom: 24 }]}>
        {actions.map(action => <Pressable key={action.label} accessibilityRole="menuitem"
          onPress={() => { onClose(); action.onPress(); }}
          style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 16, justifyContent: "center", borderRadius: 8, backgroundColor: pressed ? tokens.color.surface : "transparent" })}>
          <T>{action.label}</T>
        </Pressable>)}
      </View>
    </View>
  </Modal>;
}
