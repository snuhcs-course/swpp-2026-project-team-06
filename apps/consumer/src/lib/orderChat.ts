/** Navigation context and paid-order context are deliberately separate. */
type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function orderChatTarget(farmId: string, orderId: string, paid = true): string {
  const farm = encodeURIComponent(farmId), order = encodeURIComponent(orderId);
  const context = paid ? `orderId=${order}` : "context=general";
  return `/chats/${farm}?start=1&${context}&from=order&fromOrder=${order}`;
}

export function chatEntry(params: Params) {
  const generalOrderEntry = one(params.context) === "general" && one(params.from) === "order";
  const requestedOrderId = one(params.orderId) ??
    (one(params.from) === "order" && !generalOrderEntry ? one(params.fromOrder) : undefined);
  return {
    farmId: one(params.farmId) ?? "",
    productId: one(params.productId),
    requestedOrderId,
    shouldStart: one(params.start) === "1" || requestedOrderId !== undefined,
    generalOrderEntry,
  };
}

export function initialOrderId(
  requested: string | undefined, orders: readonly { orderId: string }[],
): string | undefined {
  if (requested !== undefined)
    return orders.some(o => o.orderId === requested) ? requested : undefined;
  return orders.length === 1 ? orders[0].orderId : undefined;
}

/** A bounded network wait, unrelated to timeline/layout restoration. */
export async function chatRequest<T>(request: Promise<T>, milliseconds = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("연결이 오래 걸려요. 다시 시도해 주세요.")), milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
