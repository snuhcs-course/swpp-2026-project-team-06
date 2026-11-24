// SCR-29 주문 카드(DEV-466). 한 카드에 누가(이름·주문 번호·주문 시각) → 무엇을(상품 사진·상품·옵션 × 수량·금액)
// → 지금 할 일(입금자명·송장·사유) → 동작 줄을 묶는다. 표시만 맡고 상태 변경·API 호출은 ship.tsx가 한다.
import type { OrderStatus, ProducerOrder } from "@farmclub/api";
import { Icon, Photo, T, focusRing, tokens, won } from "@farmclub/ui";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { ORDER_STATUS } from "./views";
import { orderItemParts } from "./orderWho";

/** "11.24 10:24" — 주문 시각(한국 시간). 주문 번호와 한 줄에 둔다 */
export function orderTime(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

// 손이 가야 하는 상태만 강조색(Figma PR542 ⑤). 환불은 송금을 마치면 할 일이 없다
const ACTION_STATUS = new Set<OrderStatus>(["AWAITING_DEPOSIT", "PREPARING", "REFUNDED"]);

export type CardAction = {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  /** 주문 상세 펼침: 아래 화살표, 펼치면 뒤집는다 */
  chevron?: "down" | "up";
};

export function OrderCard({
  order,
  photo,
  select,
  onStatus,
  statusLabel,
  task,
  body,
  detail,
  actions,
  busy,
}: {
  order: ProducerOrder;
  photo: string | null | undefined;
  /** 배송 대기 탭의 고르기 칸 */
  select?: ReactNode;
  /** 상태 칩을 눌러 상태 변경 시트를 연다. 없으면 칩은 표시만 한다 */
  onStatus?: () => void;
  statusLabel?: string;
  /** 회색 띠: 입금자명·송장·사유 */
  task?: ReactNode;
  /** 승인·미승인 버튼이나 미승인 사유 칸 */
  body?: ReactNode;
  /** ‘주문 상세’를 펼쳤을 때 */
  detail?: ReactNode;
  actions: CardAction[];
  busy?: boolean;
}) {
  const item = orderItemParts(order);
  const strong = ACTION_STATUS.has(order.status) && !(order.status === "REFUNDED" && order.refundSettledAt);
  const canceled = order.status === "CANCELED";
  const label = statusLabel ?? ORDER_STATUS[order.status];
  const chip = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
        minHeight: 28,
        paddingLeft: 10,
        paddingRight: onStatus ? 6 : 10,
        borderRadius: tokens.radius.sm,
        backgroundColor: strong ? tokens.color.accentSoft : tokens.color.surface,
      }}
    >
      <T variant="caption" weight="semibold" color={strong ? tokens.color.accent : tokens.color.textMuted}>
        {label}
      </T>
      {onStatus ? (
        <Icon name="chevronDown" size={14} color={strong ? tokens.color.accent : tokens.color.textMuted} />
      ) : null}
    </View>
  );
  return (
    <View
      testID={`order-card-${order.orderNo}`}
      style={{
        backgroundColor: tokens.color.background,
        borderRadius: tokens.radius.md,
        paddingTop: tokens.space.md,
        paddingHorizontal: tokens.space.md,
        overflow: "hidden",
        shadowColor: "#111111",
        shadowOpacity: 0.04,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
      }}
    >
      {/* 누가: 이름(18) · 주문 번호 · 주문 시각 / 상태 칩 */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 }}>
          {select}
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="heading" weight="semibold" numberOfLines={1} masked style={{ opacity: canceled ? 0.5 : 1 }}>
              {order.recipientName}
            </T>
            <T variant="caption" muted numberOfLines={1}>
              {order.orderNo} · {orderTime(order.createdAt)}
            </T>
          </View>
        </View>
        {onStatus ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${order.orderNo} 상태 ${label}, 변경`}
            disabled={busy}
            onPress={onStatus}
            style={(st) =>
              [
                { minHeight: tokens.touchTarget.min, justifyContent: "center", paddingLeft: 8 },
                (st as { focused?: boolean }).focused && focusRing,
              ] as never
            }
          >
            {chip}
          </Pressable>
        ) : (
          chip
        )}
      </View>

      {/* 무엇을: 상품 사진 56 · 상품명(길면 상품명만 줄임, AC-17-10) · 옵션 × 수량 / 금액 */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: tokens.space.md, opacity: canceled ? 0.5 : 1 }}>
        <Photo uri={photo} width={56} height={56} radius={tokens.radius.sm} kind="product" alt={item.name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {item.name ? (
            <T weight="semibold" numberOfLines={1}>
              {item.name}
            </T>
          ) : null}
          {/* 옵션 × 수량은 줄이지 않는다(길면 다음 줄로, AC-17-10). 줄일 수 있는 건 상품명뿐 */}
          <T variant="sub" muted>
            {item.tail}
          </T>
        </View>
        <T weight="bold" style={{ flexShrink: 0, alignSelf: "flex-start", marginTop: item.name ? 6 : 0 }}>
          {won(order.totalAmount)}
        </T>
      </View>

      {task ? (
        <View
          style={{
            marginTop: tokens.space.md,
            minHeight: 44,
            paddingHorizontal: 12,
            paddingVertical: 12,
            borderRadius: tokens.radius.sm,
            backgroundColor: tokens.color.surface,
            gap: tokens.space.xs,
            justifyContent: "center",
          }}
        >
          {task}
        </View>
      ) : null}
      {body ? <View style={{ marginTop: tokens.space.sm }}>{body}</View> : null}
      {detail ? (
        <View
          style={{
            marginTop: tokens.space.md,
            paddingLeft: 12,
            borderLeftWidth: 2,
            borderLeftColor: tokens.color.border,
            gap: tokens.space.xs,
          }}
        >
          {detail}
        </View>
      ) : null}

      {/* 동작 줄: 주문 상세 | 채팅하기 / 송장 입력·수정 */}
      <View
        style={{
          flexDirection: "row",
          marginTop: tokens.space.md,
          marginHorizontal: -tokens.space.md,
          borderTopWidth: 1,
          borderTopColor: tokens.color.border,
        }}
      >
        {actions.map((a, i) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            accessibilityLabel={a.accessibilityLabel}
            disabled={busy}
            onPress={a.onPress}
            style={(st) =>
              [
                {
                  flex: 1,
                  minHeight: tokens.touchTarget.min,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  paddingHorizontal: tokens.space.sm,
                  borderLeftWidth: i ? 1 : 0,
                  borderLeftColor: tokens.color.border,
                },
                (st as { focused?: boolean }).focused && focusRing,
              ] as never
            }
          >
            <T variant="sub" weight="semibold" numberOfLines={1}>
              {a.label}
            </T>
            {a.chevron ? (
              <View style={{ transform: [{ rotate: a.chevron === "up" ? "180deg" : "0deg" }] }}>
                <Icon name="chevronDown" size={16} color={tokens.color.textMuted} />
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
