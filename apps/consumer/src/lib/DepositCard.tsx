// 농가 계좌·입금자명·기한 목록 (SCR-11·12·14, DEV-68). 기존 주문 상세·주문 완료와 같은 Row 목록 부품, 복사는 글자 버튼.
import type { Order } from "@farmclub/api";
import { Button, T, deadline, tokens, won } from "@farmclub/ui";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export function DepositCard({
  o,
  onCopy,
  style,
}: {
  o: Order;
  onCopy: (text: string, what: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const a = o.depositAccount;
  return (
    <View style={[{ paddingHorizontal: 20 }, style]}>
      <Row k="은행" v={a?.bankName ?? "—"} />
      <Row k="계좌번호">
        <Value
          text={a?.accountNumber ?? "—"}
          onCopy={a ? () => onCopy(a.accountNumber, "계좌번호") : undefined}
        />
      </Row>
      <Row k="예금주" v={a ? `${a.accountHolder} (${o.farmName})` : "—"} />
      <Row k="입금자명">
        <Value text={o.orderNo} bold onCopy={() => onCopy(o.orderNo, "입금자명")} />
      </Row>
      <Row k="입금액" v={won(o.totalAmount)} bold />
      <Row k="입금 기한" v={`${deadline(o.depositDueAt)}까지`} last />
    </View>
  );
}

function Value({
  text,
  bold,
  onCopy,
}: {
  text: string;
  bold?: boolean;
  onCopy?: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
      <T variant="body" weight={bold ? "bold" : "regular"} style={{ flexShrink: 1, textAlign: "right" }}>
        {text}
      </T>
      {onCopy ? <Button label="복사" variant="text" onPress={onCopy} /> : null}
    </View>
  );
}

function Row({
  k,
  v,
  children,
  bold,
  last,
}: {
  k: string;
  v?: string;
  children?: ReactNode;
  bold?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        minHeight: 48,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: tokens.color.border,
        borderBottomWidth: last ? 1 : 0,
        borderBottomColor: tokens.color.border,
      }}
    >
      <T variant="body" muted>
        {k}
      </T>
      {children ?? (
        <T variant="body" weight={bold ? "bold" : "regular"} style={{ flexShrink: 1, textAlign: "right" }}>
          {v}
        </T>
      )}
    </View>
  );
}
