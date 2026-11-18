// 수확 시작 확인 시트(DEV-231 → DEV-361, FEAT-17 AC-17-11).
// 수확 시작 = 출하 준비 시작: 주문·출하 화면 예약 탭에서 고른 예약 완료 주문을 한 번에 출하 준비로 옮긴다.
// 받는 시기는 상품마다 하나라 예약 기간(가격 기간)별로 나누지 않는다(PM 11/17).
import {
  ApiError,
  newIdempotencyKey,
  orders,
  serverNow,
  type ProducerOrder,
} from "@farmclub/api";
import { Button, Sheet, T, tokens, won } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { orderWho } from "./orderWho";

/** 한국 날짜(서버 시각 기준, DEV-229) */
export function seoulToday(): string {
  return new Date(serverNow() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 서버가 한 번에 받는 주문 수(`HarvestOrdersInput.order_ids` max_length). 넘으면 나눠 보낸다 */
const BATCH = 500;

/** 확인 시트. picked가 있으면 열린다. 서버가 실제로 옮긴 수를 onDone으로 알린다 */
export function HarvestSheet({
  picked,
  onClose,
  onDone,
  onStale,
}: {
  picked: ProducerOrder[] | null;
  onClose: () => void;
  onDone: (changed: number) => void;
  onStale: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 같은 시트에서 다시 누르면 같은 키(재시도가 두 번 옮기지 않게). 나눠 보내면 조각마다 키 하나. 시트를 새로 열면 새 키
  const keys = useRef<string[]>([]);
  const open = !!picked;
  useEffect(() => {
    if (!open) return;
    keys.current = [];
    setError(null);
  }, [open]);

  // 닫히는 동안(모달 애니메이션)에도 마지막 주문을 보여 '0건'으로 깜빡이지 않게 한다
  const last = useRef<ProducerOrder[]>([]);
  if (picked) last.current = picked;
  const list = picked ?? last.current;
  const n = list.length;
  const start = async () => {
    if (!open || !n || busy) return;
    setBusy(true);
    setError(null);
    // 500건이 넘으면 나눠 보낸다. 다시 누르면 이미 보낸 조각은 같은 키라 서버가 첫 결과를 그대로 준다
    let changed = 0;
    try {
      for (let i = 0; i * BATCH < n; i += 1) {
        keys.current[i] ??= newIdempotencyKey();
        const r = await orders.harvestOrders(
          list.slice(i * BATCH, (i + 1) * BATCH).map((o) => o.orderId),
          keys.current[i],
        );
        changed += r.changed;
      }
      onDone(changed);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
        // 앞 조각을 이미 옮겼으면 그 수를 먼저 알린다
        if (changed > 0) onDone(changed);
        onStale();
      } else setError("수확을 시작하지 못했어요. 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };
  const shown = list.slice(0, 3);
  const more = n - shown.length;
  return (
    <Sheet
      visible={open}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <T variant="heading">수확을 시작할까요?</T>
      <View>
        {shown.map((o, i) => (
          <View
            key={o.orderId}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 12,
              minHeight: 52,
              alignItems: "center",
              borderTopWidth: 1,
              borderBottomWidth: i === shown.length - 1 && !more ? 1 : 0,
              borderColor: tokens.color.border,
            }}
          >
            <T variant="body" style={{ flexShrink: 1 }}>
              {orderWho(o)}
            </T>
            <T variant="body" muted>
              {won(o.totalAmount)}
            </T>
          </View>
        ))}
        {more > 0 ? (
          <View
            style={{
              minHeight: 52,
              justifyContent: "center",
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: tokens.color.border,
            }}
          >
            <T variant="body" muted>
              외 {more}건
            </T>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 8 }}>
        <T variant="sub">
          예약 완료 {n}건이 출하 준비로 옮겨져요. 출하 준비 탭에서 송장을 넣고
          보내요.
        </T>
        <T variant="sub">
          소비자 주문 상세에는 ‘수확·포장 중’으로 보여요. 보내기 전까지는
          소비자가 취소(전액 환불)할 수 있어요.
        </T>
        <T variant="sub">출하 준비에서 예약 완료로 되돌릴 수 없어요.</T>
      </View>
      {error ? (
        <View accessibilityRole="alert">
          <T variant="sub" color={tokens.color.error}>
            {error}
          </T>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label="아니요"
          variant="secondary"
          size="producer"
          disabled={busy}
          style={{ flex: 1 }}
          onPress={onClose}
        />
        <Button
          label={`수확 시작 · ${n}건`}
          size="producer"
          loading={busy}
          disabled={busy || !n}
          style={{ flex: 2 }}
          onPress={start}
        />
      </View>
    </Sheet>
  );
}
