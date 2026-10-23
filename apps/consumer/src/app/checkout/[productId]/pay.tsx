// SCR-11 입금 안내 (FEAT-09 개정, DEV-68, R-01·R-02·R-28, policy 6장)
// 소비자는 농가 계좌로 직접 입금한다. 이 화면은 주문서에서 받은 입금 대기 주문을 보여 주기만 하고, 돈을 받지 않는다.
import { track } from "@farmclub/analytics";
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
import { View } from "react-native";

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
      // 구매 퍼널 4단계: 입금했어요(DEV-71). 입금 확인(order_paid)은 생산자 확인 뒤 서버가 보낸다
      if (next !== o) track("deposit_reported", { orderId: o.orderId });
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
                {/* 구매안전서비스 고지(전자상거래법 13조② 10호): 권유 없이 사실만 한 줄 */}
                <T variant="caption" muted style={{ marginTop: 12 }}>
                  구매안전서비스(은행 에스크로이체)는 소비자가 원할 때 자기
                  은행에서 이용할 수 있어요. 가격은 같아요.
                </T>
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
