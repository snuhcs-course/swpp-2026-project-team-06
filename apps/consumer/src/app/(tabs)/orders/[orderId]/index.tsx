// SCR-14 주문 상세 (FEAT-10, 11, R-07, R-14, R-21) — design: scr-14, s-14-*
import {
  ApiError,
  carrierLabel,
  orders,
  trackingUrl,
  type Order,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Icon,
  Photo,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  T,
  md,
  period,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { STATUS_LABEL, STEPS, stepIndex } from "../../../../lib/orderText";
import { useHideTabBar } from "../../../../lib/session";
import { isNetworkError, useToast } from "../../../../lib/toast";
import {
  Forbidden,
  LoadError,
  copyText,
  isStatus,
  openExternal,
} from "../../../../lib/views";

export default function OrderDetail() {
  useHideTabBar();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const {
    data: o,
    error,
    reload,
    setData,
  } = useAsync(() => orders.get(orderId), [orderId]);
  const [cancelSheet, setCancelSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast(180);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(fn: () => Promise<Order>, success?: string) {
    setBusy(true);
    setActionError(null);
    try {
      const next = await fn();
      setData(() => next);
      if (success) toast.show(success);
    } catch (e) {
      if (isNetworkError(e)) {
        // 연결 문제 → 공통 오류 토스트와 다시 시도
        toast.fail(e, () => void act(fn, success));
      } else {
        // 409: 이미 상태가 바뀜 → 최신 상태로 다시 그린다
        setActionError(
          e instanceof ApiError ? e.message : "잠시 뒤 다시 시도해 주세요.",
        );
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  if (error && isStatus(error, 403)) return <Forbidden />;
  if (error && isStatus(error, 404)) {
    router.replace("/orders");
    return null;
  }

  const changing = o?.actions.includes("respondDeliveryWindow");
  const title = !o
    ? ""
    : changing
      ? "받는 시기가\n바뀌었어요"
      : STATUS_LABEL[o.status];
  const sentence = !o
    ? ""
    : changing && o.proposedDeliveryWindow
      ? `농가 사정으로 받는 시기가 ${period(o.proposedDeliveryWindow.start, o.proposedDeliveryWindow.end)}로 바뀌었어요. 새 기간으로 받거나 전액 환불받을 수 있어요.`
      : o.status === "PREPARING"
        ? `농가가 수확을 시작했어요. ${period(o.deliveryWindow.start, o.deliveryWindow.end)} 사이에 받아요.`
        : o.status === "SHIPPED"
          ? `${md(o.shippedAt)}에 보냈어요. ${trackingUrl(o.carrier, o.trackingNumber) ? "배송 조회로 위치를 볼 수 있어요." : "곧 도착해요."}`
          : o.status === "DELIVERED" || o.status === "COMPLETED"
            ? `${md(o.deliveredAt)}에 도착했어요.`
            : o.status === "REFUNDED"
              ? `${won(o.totalAmount)}을 결제한 카드로 돌려드렸어요.`
              : `${period(o.deliveryWindow.start, o.deliveryWindow.end)} 사이에 받아요.`;

  return (
    <Screen>
      <HeaderBar
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/orders")
        }
      />
      {!o ? (
        error ? (
          <LoadError error={error} onRetry={reload} />
        ) : (
          <View style={{ padding: 20, gap: 12 }}>
            <Skeleton width="50%" height={34} />
            <Skeleton width="80%" height={17} />
          </View>
        )
      ) : (
        <Scroll bottom={170}>
          {o.paidAt ? (
            <View style={{ padding: 20 }}>
              <Button
                label="상품 문제 문의 · 사진 첨부"
                variant="outline"
                onPress={() => router.push(`/orders/${o.orderId}/inquiry`)}
              />
            </View>
          ) : null}
          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            <T variant="sub" muted>
              {o.orderNo} · {md(o.createdAt)} 예약
            </T>
            <T variant="title" accessibilityRole="header">
              {title}
            </T>
            <T variant="body">{sentence}</T>
            {changing ? (
              <T variant="sub" muted>
                이전 {period(o.deliveryWindow.start, o.deliveryWindow.end)}
              </T>
            ) : null}
            {o.status === "REFUNDED" && o.refundReason ? (
              <T variant="sub" weight="semibold" style={{ marginTop: 8 }}>
                사유 · {o.refundReason}
              </T>
            ) : null}
            {stepIndex(o) > 0 ? (
              <View
                style={{ flexDirection: "row", gap: 8, marginTop: 16 }}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={`주문 단계 ${STEPS.length}개 중 ${stepIndex(o)}번째, 지금 ${STEPS[stepIndex(o) - 1]}`}
              >
                {STEPS.map((s, i) => {
                  const on = i < stepIndex(o);
                  return (
                    <View key={s} style={{ flex: 1, gap: 8 }}>
                      <View
                        style={{
                          height: 4,
                          borderRadius: 999,
                          backgroundColor: on
                            ? tokens.color.text
                            : tokens.color.border,
                        }}
                      />
                      <T
                        variant="caption"
                        weight={i === stepIndex(o) - 1 ? "semibold" : "regular"}
                        muted={!on}
                        numberOfLines={1}
                      >
                        {s}
                      </T>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>

          {actionError ? (
            <T
              variant="sub"
              color={tokens.color.error}
              style={{ marginHorizontal: 20, marginTop: 16 }}
            >
              {actionError}
            </T>
          ) : null}

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/products/${o.productId}`)}
            style={{
              marginHorizontal: 20,
              marginTop: 40,
              flexDirection: "row",
              gap: 16,
              alignItems: "center",
            }}
          >
            <Photo
              uri={o.photo}
              width={tokens.thumb.summary}
              height={tokens.thumb.summary}
              alt={o.productName}
              kind="product"
            />
            <View style={{ flex: 1 }}>
              <T variant="body" weight="semibold">
                {o.productName} {o.optionLabel} × {o.quantity}
              </T>
              <T variant="sub" muted>
                {o.farmName} · 예약가 {won(o.unitPrice)}
              </T>
            </View>
            <Icon name="chevron" color={tokens.color.textMuted} />
          </Pressable>

          <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
            {o.status === "SHIPPED" && o.carrier ? (
              <Tracking
                o={o}
                onCopied={() => toast.show("송장 번호를 복사했어요")}
              />
            ) : null}
            <Row k="합계">
              <T
                variant="body"
                weight="bold"
                style={{ flexShrink: 1, textAlign: "right" }}
              >
                {won(o.totalAmount)}
                {o.shippingFee + o.remoteAreaFee === 0 ? (
                  <T variant="sub" muted weight="regular">
                    {" "}
                    무료배송
                  </T>
                ) : null}
              </T>
            </Row>
            <Row k="받는 사람" v={`${o.recipientName} · ${o.recipientPhone}`} />
            <Row
              k="주소"
              v={`${o.address}${o.addressDetail ? `, ${o.addressDetail}` : ""}`}
            />
            <Row k="배송 메모" v={o.deliveryNote ?? "없음"} last />
          </View>
          <Button
            label="농가에 물어보기 ›"
            variant="text"
            onPress={() => router.push(`/chats/${o.farmId}`)}
            style={{ marginHorizontal: 20, marginTop: 16 }}
          />
        </Scroll>
      )}

      {o ? (
        <Bar
          o={o}
          busy={busy}
          onCancel={() => setCancelSheet(true)}
          act={act}
        />
      ) : null}

      <Sheet visible={cancelSheet} onClose={() => setCancelSheet(false)}>
        <T variant="heading">예약을 취소할까요?</T>
        <T variant="body">
          보내기 전이라 {won(o?.totalAmount)} 전액 환불돼요. 수수료는 없어요.
        </T>
        <T variant="sub" muted>
          환불은 결제한 카드의 승인 취소로 처리돼요. 3영업일 안에 처리돼요.
        </T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Button
            label="아니요"
            variant="secondary"
            onPress={() => setCancelSheet(false)}
            style={{ flex: 1 }}
          />
          <Button
            label="예약 취소하기"
            loading={busy}
            onPress={() => {
              setCancelSheet(false);
              void act(() => orders.cancel(orderId), "예약을 취소했어요");
            }}
            style={{ flex: 2 }}
          />
        </View>
      </Sheet>
      {toast.node}
    </Screen>
  );
}

function Bar({
  o,
  busy,
  onCancel,
  act,
}: {
  o: Order;
  busy: boolean;
  onCancel: () => void;
  act: (fn: () => Promise<Order>) => Promise<void>;
}) {
  if (o.actions.includes("respondDeliveryWindow"))
    return (
      <BottomBar summary="고르기 전까지 주문은 그대로 있어요.">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="전액 환불"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              act(() => orders.respondDeliveryWindow(o.orderId, "refund"))
            }
            style={{ flex: 1 }}
          />
          <Button
            label="새 기간으로 받기"
            loading={busy}
            onPress={() =>
              act(() => orders.respondDeliveryWindow(o.orderId, "accept"))
            }
            style={{ flex: 2 }}
          />
        </View>
      </BottomBar>
    );
  if (o.actions.includes("cancel"))
    return (
      <BottomBar summary="보내기 전에는 언제든 취소할 수 있고 전액 환불돼요.">
        <Button
          label="예약 취소하기"
          variant="outline"
          disabled={busy}
          onPress={onCancel}
        />
      </BottomBar>
    );
  if (o.actions.includes("confirm"))
    return (
      <BottomBar
        summary={
          <T variant="sub" style={{ flex: 1 }}>
            잘 받으셨다면 구매 확정을 눌러주세요. 배송 완료 후 8일이 지나면
            자동으로 확정돼요.
          </T>
        }
      >
        <Button
          label="구매 확정"
          loading={busy}
          onPress={() => act(() => orders.confirm(o.orderId))}
        />
      </BottomBar>
    );
  if (o.status === "SHIPPED")
    return (
      <BottomBar summary="신선식품이라 보낸 뒤에는 단순 변심으로 취소·반품할 수 없어요. 받은 상품에 문제가 있으면 받은 뒤 24시간 안에 사진과 함께 알려주세요.">
        <View />
      </BottomBar>
    );
  if (o.status === "REFUNDED")
    return (
      <BottomBar summary="환불은 3영업일 안에 처리돼요. 카드사에 따라 반영까지 며칠 더 걸릴 수 있어요.">
        <View />
      </BottomBar>
    );
  return null;
}

/** 배송 중: 택배사 · 송장 번호 · 복사 · 배송 조회(결정 33, D-02). 송장이 없으면 택배사만, 배송 조회는 숨김 */
function Tracking({ o, onCopied }: { o: Order; onCopied: () => void }) {
  const url = trackingUrl(o.carrier, o.trackingNumber);
  return (
    <Row k="택배">
      <View style={{ alignItems: "flex-end", flexShrink: 1 }}>
        <T variant="body" style={{ textAlign: "right" }}>
          {carrierLabel(o.carrier)}
          {o.trackingNumber ? ` · ${o.trackingNumber}` : ""}
        </T>
        {o.trackingNumber ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="송장 번호 복사"
              onPress={async () =>
                (await copyText(o.trackingNumber ?? "")) && onCopied()
              }
              style={{
                minHeight: 48,
                minWidth: 48,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T variant="sub" weight="semibold">
                복사
              </T>
            </Pressable>
            {url ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${carrierLabel(o.carrier)} 배송 조회, 새 창`}
                onPress={() => openExternal(url)}
                style={{
                  minHeight: 48,
                  minWidth: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <T variant="sub" weight="semibold">
                  배송 조회
                </T>
                <Icon name="external" size={16} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Row>
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
        <T
          variant="body"
          weight={bold ? "bold" : "regular"}
          style={{ flexShrink: 1, textAlign: "right" }}
        >
          {v}
        </T>
      )}
    </View>
  );
}
