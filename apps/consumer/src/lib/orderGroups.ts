import type { Order } from "@farmclub/api";

export const orderGroups = [
  { value: "confirmed", label: "확정" },
  { value: "pending", label: "미확정" },
  { value: "canceled", label: "취소·환불" },
] as const;
export type OrderGroup = (typeof orderGroups)[number]["value"];
const groups: Record<Order["status"], OrderGroup | null> = {
  PENDING_PAYMENT: null,
  RESERVED: "pending",
  PREPARING: "pending",
  SHIPPED: "pending",
  DELIVERED: "pending",
  COMPLETED: "confirmed",
  CANCELED: "canceled",
  REFUNDED: "canceled",
  PARTIALLY_REFUNDED: "canceled",
};
export const orderGroup = (order: Pick<Order, "status">) =>
  groups[order.status];
export const selectedOrderGroup = (filter: unknown): OrderGroup =>
  orderGroups.find((g) => g.value === filter)?.value ?? "pending";
export function compareOrders(
  a: Pick<Order, "status" | "actions" | "createdAt" | "orderId">,
  b: Pick<Order, "status" | "actions" | "createdAt" | "orderId">,
) {
  const needsAction = (o: typeof a) =>
    orderGroup(o) === "pending" &&
    (o.actions.includes("confirm") ||
      o.actions.includes("respondDeliveryWindow"));
  return (
    Number(needsAction(b)) - Number(needsAction(a)) ||
    b.createdAt.localeCompare(a.createdAt) ||
    b.orderId.localeCompare(a.orderId)
  );
}
