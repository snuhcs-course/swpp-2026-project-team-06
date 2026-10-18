// SCR-11 입금 안내 (FEAT-09 개정, DEV-68, R-01·R-02·R-28, policy 6장)
// 소비자는 농가 계좌로 직접 입금한다. 이 화면은 주문서에서 받은 입금 대기 주문을 보여 주기만 하고, 돈을 받지 않는다.
import { ApiError, orders } from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Notice,
  Screen,
  Scroll,
  T,
  TestBand,
  useAsync,
  won,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useToast } from "../../../lib/toast";
import { DepositCard } from "../../../lib/DepositCard";
import { LoadError, copyText } from "../../../lib/views";

export default function DepositGuide() {
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
    setData,
  } = useAsync(() => orders.get(orderId), [orderId]);
  const [busy, setBusy] = useState(false);
  const [escrow, setEscrow] = useState(false);
  const toast = useToast();

  // 기한이 지나 취소된 주문은 주문서로 돌려보낸다(R-28)
  const expired = o?.status === "CANCELED";
  useEffect(() => {
    if (!expired) return;
    router.replace({
      pathname: "/checkout/[productId]",
      params: {
        productId,
        optionId: optionId ?? "",
        quantity: quantity ?? "1",
        changed: "1",
      },
    });
  }, [expired, router, productId, optionId, quantity]);
  if (expired) return null;

  async function reported() {
    if (!o) return;
    setBusy(true);
    try {
      const next = o.actions.includes("reportDeposit")
        ? await orders.depositReported(o.orderId)
        : o;
      setData(() => next);
      router.replace(`/orders/${o.orderId}/done`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await reload();
      else toast.fail(e, () => void reported());
    } finally {
      setBusy(false);
    }
  }

  const copy = async (text: string, what: string) =>
    (await copyText(text)) && toast.show(`${what}를 복사했어요`);

  return (
    <Screen>
      <HeaderBar title="입금 안내" onBack={() => router.back()} />
      <TestBand text="테스트 서비스예요. 실제 돈은 나가지 않아요." />
      {error && !o ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <Scroll bottom={190}>
          <View style={{ paddingHorizontal: 20, paddingTop: 32, gap: 4 }}>
            <T variant="sub" muted>
              입금할 금액
            </T>
            <T variant="title">{o ? won(o.totalAmount) : " "}</T>
            <T variant="sub" muted>
              {o
                ? `${o.productName} ${o.optionLabel} × ${o.quantity} · ${o.farmName}`
                : ""}
            </T>
          </View>

          {o ? (
            <>
              <DepositCard o={o} onCopy={copy} />
              <T
                variant="caption"
                muted
                style={{ marginHorizontal: 20, marginTop: 8 }}
              >
                입금자명을 주문 번호로 적어야 농가가 주문을 찾아요. 기한이
                지나면 예약이 자동으로 취소돼요.
              </T>

              <View style={{ paddingHorizontal: 20, paddingTop: 32, gap: 4 }}>
                <T variant="heading">판매자</T>
                <T variant="body">
                  {o.sellerInfo?.farmName ?? o.farmName}
                  {o.sellerInfo?.ownerName
                    ? ` · 대표 ${o.sellerInfo.ownerName}`
                    : ""}
                </T>
                <T variant="sub" muted>
                  {[o.sellerInfo?.region, o.sellerInfo?.phone]
                    .filter(Boolean)
                    .join(" · ")}
                </T>
                <Notice
                  title="farmclub은 통신판매중개자예요"
                  body={`거래 당사자가 아니에요. 상품·배송·환불의 책임은 판매자인 ${o.sellerInfo?.farmName ?? o.farmName}에 있어요.`}
                  style={{ marginTop: 12 }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: escrow }}
                  onPress={() => setEscrow((v) => !v)}
                  style={{ minHeight: 48, justifyContent: "center" }}
                >
                  <T variant="sub" muted>
                    더 안전하게 보내고 싶다면{" "}
                    <T variant="sub" weight="semibold">
                      에스크로이체
                    </T>{" "}
                    {escrow ? "⌃" : "⌄"}
                  </T>
                </Pressable>
                {escrow ? (
                  <T variant="caption" muted>
                    내 은행 앱의 에스크로이체(국민·우리 등)로 이 계좌에 보낼 수
                    있어요. 가격은 같고 은행 수수료는 보내는 사람이 내요.
                    farmclub이나 농가가 따로 가입할 것은 없어요.
                  </T>
                ) : null}
              </View>
            </>
          ) : null}
        </Scroll>
      )}
      <BottomBar summary="입금한 뒤에도 주문 상세에서 계좌를 다시 볼 수 있어요.">
        <Button
          label="입금을 마쳤어요"
          disabled={!o}
          loading={busy}
          onPress={reported}
        />
        <Button
          label="나중에 입금할게요"
          variant="text"
          disabled={!o || busy}
          onPress={() => o && router.replace(`/orders/${o.orderId}/done`)}
          style={{ alignSelf: "center" }}
        />
      </BottomBar>
      {toast.node}
    </Screen>
  );
}
