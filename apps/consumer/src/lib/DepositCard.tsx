// 농가 계좌·입금자명·기한 카드 (SCR-11·12·14, DEV-68). 복사는 계좌번호·입금자명 둘 다.
import type { Order } from "@farmclub/api";
import { T, deadline, tokens, won } from "@farmclub/ui";
import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

/** 농가 계좌·입금자명·기한. SCR-12·14에서도 같은 카드를 쓴다 */
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
    <View
      style={[
        {
          marginHorizontal: 20,
          marginTop: 28,
          padding: 16,
          borderRadius: 16,
          backgroundColor: tokens.color.surface,
        },
        style,
      ]}
    >
      <KV k="은행" v={a?.bankName ?? "—"} />
      <KV
        k="계좌번호"
        v={a?.accountNumber ?? "—"}
        onCopy={a ? () => onCopy(a.accountNumber, "계좌번호") : undefined}
      />
      <KV
        k="예금주"
        v={a ? `${a.accountHolder} (${o.farmName})` : "—"}
      />
      <KV
        k="입금자명"
        v={o.orderNo}
        bold
        onCopy={() => onCopy(o.orderNo, "입금자명")}
      />
      <KV k="입금액" v={won(o.totalAmount)} bold />
      <KV k="입금 기한" v={`${deadline(o.depositDueAt)}까지`} last />
    </View>
  );
}

function KV({
  k,
  v,
  bold,
  last,
  onCopy,
}: {
  k: string;
  v: string;
  bold?: boolean;
  last?: boolean;
  onCopy?: () => void;
}) {
  const value: ReactNode = (
    <T
      variant="body"
      weight={bold ? "bold" : "regular"}
      style={{ flexShrink: 1, textAlign: "right" }}
    >
      {v}
    </T>
  );
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        minHeight: 48,
        paddingVertical: 8,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: tokens.color.border,
      }}
    >
      <T variant="sub" muted>
        {k}
      </T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
        {value}
        {onCopy ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${k} 복사`}
            onPress={onCopy}
            style={{
              minHeight: 48,
              minWidth: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T variant="sub" weight="bold">
              복사
            </T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
