import { Button, Icon, T, tokens, won } from "@farmclub/ui";
import { Modal, ScrollView, View } from "react-native";

export function CheckoutChangeModal({
  visible, title, body, previousTotal, total, busy, canReserve, refreshing, onReload, onClose, onReserve,
}: {
  visible: boolean;
  title: string;
  body: string;
  previousTotal: number | null;
  total: number | null;
  busy: boolean;
  canReserve: boolean;
  refreshing: boolean;
  onReload: () => void;
  onClose: () => void;
  onReserve: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={{ flex: 1, backgroundColor: tokens.color.overlay, justifyContent: "center", alignItems: "center", padding: tokens.space.gutter }}>
        <View accessibilityViewIsModal accessibilityRole="alert" style={{ width: "100%", maxWidth: 360, maxHeight: "90%", borderRadius: tokens.radius.md, padding: tokens.space.lg, gap: tokens.space.md, backgroundColor: tokens.color.background }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
            <Icon name="warning" color={tokens.color.error} />
            <T variant="heading" accessibilityRole="header" style={{ flex: 1 }}>{title}</T>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: tokens.space.md }}>
            <T>{body}</T>
            <View style={{ padding: tokens.space.md, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.surface, gap: tokens.space.sm }}>
              {previousTotal != null ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: tokens.space.sm }}>
                  <T variant="sub" muted>처음 본 총 입금액</T>
                  <T variant="sub" muted style={{ textDecorationLine: "line-through" }}>{won(previousTotal)}</T>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: tokens.space.sm }}>
                <T variant="sub" weight="semibold">현재 총 입금액</T>
                {total != null ? <T variant="title">{won(total)}</T> : <T variant="sub" muted>확인이 필요해요</T>}
              </View>
            </View>
            {total == null ? <View style={{ gap: tokens.space.xs, alignItems: "flex-start" }}>
              <T variant="sub" muted>{refreshing ? "최신 금액을 확인하고 있어요." : "최신 금액을 불러오지 못했어요. 다시 확인해 주세요."}</T>
              <Button label="다시 확인하기" variant="text" compact loading={refreshing} disabled={refreshing} onPress={onReload} />
            </View> : null}
          </ScrollView>
          <View style={{ gap: tokens.space.xs }}>
            <Button label="바뀐 금액으로 예약하기" disabled={!canReserve || busy} loading={busy} onPress={onReserve} />
            <Button label="주문서로 돌아가기" variant="text" compact disabled={busy} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
