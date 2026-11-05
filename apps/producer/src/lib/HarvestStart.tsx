// 예약 기간 카드의 '수확' 칸과 확인 시트(DEV-231, FEAT-17 AC-17-11).
// 수확 시작 = 출하 준비 시작: 그 기간의 예약 완료 주문만 출하 준비로 옮긴다.
import {
  ApiError,
  allPages,
  newIdempotencyKey,
  orders,
  serverNow,
  type MyStage,
  type ProducerOrder,
} from "@farmclub/api";
import { Button, ListRow, Sheet, T, tokens, won } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { orderWho } from "./orderWho";

/** 'MM.DD' → '10.01—10.12' */
const span = (s: Pick<MyStage, "startsAt" | "endsAt">) =>
  `${s.startsAt.slice(5).replace("-", ".")}—${s.endsAt.slice(5).replace("-", ".")}`;

/** 한국 날짜(서버 시각 기준, DEV-229) */
export function seoulToday(): string {
  return new Date(serverNow() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 기간 카드 맨 아래 '수확' 칸. 보일 것이 없으면 null */
export function HarvestRow({
  stage,
  dirty,
  busy,
  onStart,
  onOpenPreparing,
}: {
  stage: MyStage;
  dirty: boolean;
  busy: boolean;
  onStart: () => void;
  onOpenPreparing: () => void;
}) {
  const reserved = stage.reservedOrderCount;
  const awaiting = stage.awaitingOrderCount;
  const started = stage.harvestStarted;
  if (!reserved && !awaiting && !started) return null;
  const counts = [
    reserved ? `예약 완료 ${reserved}건` : "",
    awaiting ? `입금 대기 ${awaiting}건` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View
      testID={`harvest-${stage.stageId}`}
      style={{
        gap: 10,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: tokens.color.text,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <T weight="semibold">수확</T>
        {counts ? (
          <T variant="sub" muted style={{ flexShrink: 1, textAlign: "right" }}>
            {counts}
          </T>
        ) : null}
      </View>
      {reserved ? (
        <>
          <Button
            label={
              started
                ? `남은 예약 ${reserved}건도 출하 준비로`
                : `수확 시작 · 출하 준비 ${reserved}건`
            }
            variant="outline"
            size="producer"
            disabled={dirty || busy}
            onPress={onStart}
          />
          {dirty ? (
            <T variant="caption" muted>
              저장한 뒤 수확을 시작할 수 있어요.
            </T>
          ) : awaiting ? (
            <T variant="caption" muted>
              입금 대기 주문은 승인한 뒤 따로 옮겨요.
            </T>
          ) : null}
        </>
      ) : started ? (
        <ListRow
          label={
            stage.preparingOrderCount
              ? `수확 시작함 · 출하 준비 ${stage.preparingOrderCount}건 보기`
              : "수확 시작함 · 배송 현황 보기"
          }
          onPress={onOpenPreparing}
          last
        />
      ) : (
        <T variant="caption" muted>
          입금을 승인하면 수확을 시작할 수 있어요.
        </T>
      )}
    </View>
  );
}

/** 확인 시트. 열 때 그 기간의 예약 완료 주문을 읽어 보여 준다 */
export function HarvestSheet({
  productId,
  productName,
  stage,
  onClose,
  onDone,
  onStale,
}: {
  productId: string;
  productName: string;
  stage: MyStage | null;
  onClose: () => void;
  onDone: (changed: number) => void;
  onStale: () => void;
}) {
  const [list, setList] = useState<ProducerOrder[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 같은 시트에서 다시 누르면 같은 키(재시도가 두 번 옮기지 않게)
  const key = useRef<string>("");
  useEffect(() => {
    if (!stage) return;
    key.current = newIdempotencyKey();
    setList(null);
    setError(null);
    let cancelled = false;
    void allPages((cursor) =>
      orders.producerOrders({ status: "RESERVED", productId, limit: 50, cursor }),
    )
      .then((all) => {
        if (!cancelled) setList(all.filter((o) => o.stageId === stage.stageId));
      })
      .catch(() => {
        // 주문 줄을 못 읽어도 시트는 카드의 건수로 진행한다(서버가 실제로 옮긴 수를 토스트로 알린다)
        if (!cancelled) setList(null);
      });
    return () => {
      cancelled = true;
    };
  }, [stage?.stageId, productId]);

  const n = list?.length ?? stage?.reservedOrderCount ?? 0;
  const open = !!stage && stage.endsAt >= seoulToday();
  const start = async () => {
    if (!stage || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await orders.harvestStart(productId, stage.stageId, key.current);
      onDone(r.changed);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 409)) onStale();
      else setError("수확을 시작하지 못했어요. 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };
  const shown = (list ?? []).slice(0, 3);
  const more = (list?.length ?? 0) - shown.length;
  return (
    <Sheet
      visible={!!stage}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={{ gap: 2 }}>
        <T variant="heading">
          {stage?.harvestStarted ? `남은 예약 ${n}건도 옮길까요?` : "수확을 시작할까요?"}
        </T>
        {stage ? (
          <T variant="sub" muted>
            {productName} · {stage.name}({span(stage)})
          </T>
        ) : null}
      </View>
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
        {open && stage ? (
          <T variant="sub">
            이 기간은 {Number(stage.endsAt.slice(5, 7))}월{" "}
            {Number(stage.endsAt.slice(8, 10))}일까지 예약을 받아요. 그 뒤 들어온
            주문은 다시 눌러 옮겨요.
          </T>
        ) : null}
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
