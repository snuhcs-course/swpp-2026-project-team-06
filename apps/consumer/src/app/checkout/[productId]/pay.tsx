// SCR-11 결제(Mock) (FEAT-09) — design: scr-11, s-11-fail
import { ApiError, newIdempotencyKey, orders } from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Notice,
  Radio,
  Screen,
  Scroll,
  Segmented,
  T,
  TestBand,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useToast } from "../../../lib/toast";
import { LoadError } from "../../../lib/views";

export default function Pay() {
  const { productId, orderId, optionId, quantity } = useLocalSearchParams<{
    productId: string;
    orderId: string;
    optionId?: string;
    quantity?: string;
  }>();
  const router = useRouter();
  const {
    data: o,
    error,
    reload,
  } = useAsync(() => orders.get(orderId), [orderId]);
  const [card, setCard] = useState<"test" | "other">("test");
  const [demo, setDemo] = useState<"success" | "fail">("success");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  // 응답을 못 받으면 같은 키로 다시 보낸다(AC-09-3)
  const [key, setKey] = useState(newIdempotencyKey);
  const toast = useToast();

  async function pay() {
    setBusy(true);
    setFail(null);
    try {
      const r = await orders.pay(orderId, demo, key);
      if (r.result === "success") {
        router.replace(`/orders/${orderId}/done`);
      } else {
        setFail(r.failReason ?? "결제하지 못했어요.");
        setKey(newIdempotencyKey());
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        router.replace({
          pathname: "/checkout/[productId]",
          params: {
            productId,
            optionId: optionId ?? "",
            quantity: quantity ?? "1",
            changed: "1",
          },
        });
      } else if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
        // 응답을 못 받음 → 공통 오류 토스트, 다시 시도는 같은 멱등 키(AC-09-3)
        toast.fail(e, () => void pay());
      } else {
        setFail(e instanceof ApiError ? e.message : "결제하지 못했어요.");
        setKey(newIdempotencyKey());
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeaderBar title="결제" onBack={() => router.back()} />
      <TestBand text="테스트 서비스예요. 실제 돈은 나가지 않아요." />
      {error && !o ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <Scroll bottom={170}>
          <View style={{ paddingHorizontal: 20, paddingTop: 32, gap: 4 }}>
            <T variant="sub" muted>
              결제할 금액
            </T>
            <T variant="title">{o ? won(o.totalAmount) : " "}</T>
            <T variant="sub" muted>
              {o
                ? `${o.productName} ${o.optionLabel} × ${o.quantity} · ${o.farmName}`
                : ""}
            </T>
          </View>
          {fail ? (
            <Notice
              tone="error"
              title="결제하지 못했어요"
              body={fail}
              style={{ marginHorizontal: 20, marginTop: 20 }}
            />
          ) : null}

          <View style={{ paddingHorizontal: 20, paddingTop: 40 }}>
            <T variant="heading" style={{ marginBottom: 8 }}>
              결제 수단
            </T>
            {(
              [
                { k: "test", title: "테스트 카드", sub: "···· 1234 · 일시불" },
                {
                  k: "other",
                  title: "다른 카드",
                  sub: "카드로 내는 간편결제 포함",
                },
              ] as const
            ).map((c, i) => (
              <Pressable
                key={c.k}
                accessibilityRole="radio"
                accessibilityState={{ selected: card === c.k }}
                onPress={() => setCard(c.k)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  minHeight: 72,
                  borderTopWidth: 1,
                  borderTopColor: tokens.color.border,
                  borderBottomWidth: i === 1 ? 1 : 0,
                  borderBottomColor: tokens.color.border,
                }}
              >
                <Radio selected={card === c.k} />
                <View
                  style={{
                    width: 48,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor:
                      c.k === "test" ? tokens.color.text : tokens.color.surface,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <T variant="body" weight="semibold">
                    {c.title}
                  </T>
                  <T variant="sub" muted>
                    {c.sub}
                  </T>
                </View>
              </Pressable>
            ))}
            <T variant="sub" muted style={{ marginTop: 12 }}>
              예약할 때 전액을 한 번에 결제해요.
            </T>
          </View>

          <View
            style={{
              margin: 20,
              marginTop: 32,
              padding: 16,
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: tokens.color.textMuted,
              borderRadius: 16,
              gap: 8,
            }}
          >
            <T variant="caption" weight="semibold" muted>
              개발용 · 실제 서비스에는 없음
            </T>
            <T variant="sub" weight="semibold">
              데모 결과
            </T>
            <Segmented
              value={demo}
              onChange={setDemo}
              options={[
                { value: "success", label: "성공" },
                { value: "fail", label: "실패" },
              ]}
            />
          </View>
        </Scroll>
      )}
      <BottomBar>
        <Button
          label={
            fail
              ? "다시 결제하기"
              : o
                ? `${won(o.totalAmount)} 결제하기`
                : "결제하기"
          }
          disabled={!o}
          loading={busy}
          onPress={pay}
        />
        {fail ? (
          <Button
            label="주문서로 돌아가기"
            variant="text"
            onPress={() => router.back()}
            style={{ alignSelf: "center" }}
          />
        ) : null}
      </BottomBar>
      {toast.node}
    </Screen>
  );
}
