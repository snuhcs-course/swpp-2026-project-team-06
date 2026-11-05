import { apiUrl } from "@farmclub/api";
// SCR-04 상품 상세 (FEAT-07) — design: scr-04, s-04-soldout, s-04-ended, scr-04-sheet
import { track } from "@farmclub/analytics";
import { catalog, farms, referencePrice } from "@farmclub/api";
import {
  BottomBar,
  Button,
  EmptyState,
  HeaderBar,
  ProductPageBody,
  Screen,
  Scroll,
  Sheet,
  useSheetLeave,
  Skeleton,
  T,
  useAsync,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { useSession } from "../../../lib/session";
import { useToast } from "../../../lib/toast";
import { LoadError, OptionSheet, isStatus } from "../../../lib/views";
import { goBackOr } from "../../../lib/nav";

export default function ProductPage() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();
  const { user, requireLogin, resume, clearResume } = useSession();
  const {
    data: p,
    error,
    reload,
  } = useAsync(() => catalog.product(productId), [productId]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [optionId, setOptionId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const toast = useToast();
  const [chatConfirm, setChatConfirm] = useState(false);
  // 시트에서 주문서·채팅으로 갈 때 시트를 바로 닫고 이동한다(DEV-225)
  const sheetLeave = useSheetLeave();
  const here = `/products/${productId}`;

  useEffect(() => {
    if (p && !optionId) setOptionId(p.options[0]?.optionId ?? "");
  }, [p, optionId]);

  // 구매 퍼널 1단계(트래킹 플랜 product_viewed, DEV-71)
  const viewedId = p?.productId;
  const viewedFarm = p?.farmId;
  useEffect(() => {
    if (viewedId && viewedFarm)
      track("product_viewed", { productId: viewedId, farmId: viewedFarm });
  }, [viewedId, viewedFarm]);

  function goCheckout(o: string, q: number) {
    router.push({
      pathname: "/checkout/[productId]",
      params: { productId, optionId: o, quantity: String(q) },
    });
  }

  // 채팅하기: 팔로우한 농가면 바로 채팅, 아니면 ‘팔로우하고 대화를 시작해요’ 확인(SCR-03과 같다)
  async function chatNow(farmId: string) {
    try {
      const f = await farms.get(farmId);
      if (f.isFollowing)
        router.push({
          pathname: "/chats/[farmId]",
          params: { farmId, start: "1", productId },
        });
      else setChatConfirm(true);
    } catch (e) {
      toast.fail(e, () => void chatNow(farmId));
    }
  }

  // 로그인 뒤 돌아오면 누른 행동을 잇는다(결정 25, D-17): 예약은 고른 옵션·수량 그대로 주문서, 채팅은 채팅 시작
  useEffect(() => {
    if (!user || !resume || resume.next !== here || !p) return;
    clearResume();
    if (resume.action === "reserve") {
      const o = resume.data?.optionId ?? p.options[0].optionId;
      const q = Number(resume.data?.quantity ?? 1) || 1;
      setOptionId(o);
      setQty(q);
      goCheckout(o, q);
    } else if (resume.action === "chat") {
      void chatNow(p.farmId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId, resume, p?.productId]);

  if (error && isStatus(error, 404)) return <Ended />;
  if (!p)
    return (
      <Screen>
        {error ? (
          <>
            <HeaderBar onBack={() => goBackOr(router, "/")} />
            <LoadError error={error} onRetry={reload} />
          </>
        ) : (
          <View>
            <Skeleton width="100%" height={390} radius={0} />
            <View style={{ padding: 20, gap: 12 }}>
              <Skeleton width="60%" height={22} />
              <Skeleton width="40%" height={34} />
            </View>
          </View>
        )}
      </Screen>
    );

  const opt = p.options.find((o) => o.optionId === optionId) ?? p.options[0];

  // 예약하기 → 옵션·수량 시트. 로그인 관문은 시트의 ‘주문서로’에서 띄운다(D-17)
  function reserve() {
    setSheetOpen(true);
  }

  return (
    <Screen>
      <HeaderBar
        title="상품 상세"
        onBack={() =>
          goBackOr(router, `/farms/${p.farmId}`)
        }
      />
      <Scroll bottom={180}>
        <ProductPageBody
          p={p}
          reference={(o) => referencePrice(p, o)}
          mediaUrl={(uri) => (uri.startsWith("/") ? apiUrl + uri : uri)}
          onFarmPress={() => router.push(`/farms/${p.farmId}`)}
        />
      </Scroll>

      <BottomBar aboveTabs>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="1:1 채팅"
            variant="secondary"
            onPress={() =>
              requireLogin("chat", here, () => void chatNow(p.farmId))
            }
            style={{ flex: 1 }}
          />
          <Button
            label="예약하기"
            disabled={p.soldOut}
            onPress={reserve}
            style={{ flex: 2 }}
          />
        </View>
      </BottomBar>

      <OptionSheet
        visible={sheetOpen}
        product={p}
        optionId={opt.optionId}
        quantity={qty}
        onChange={(o, q) => {
          setOptionId(o);
          setQty(q);
        }}
        onClose={() => setSheetOpen(false)}
        instant={sheetLeave.instant}
        onSubmit={() =>
          sheetLeave.leave(
            () => setSheetOpen(false),
            // 비로그인이면 여기서 관문 → 로그인 뒤 고른 옵션·수량 그대로 주문서(결정 25)
            () =>
              requireLogin(
                "reserve",
                here,
                () => goCheckout(opt.optionId, qty),
                { optionId: opt.optionId, quantity: String(qty) },
              ),
          )
        }
      />
      <Sheet
        visible={chatConfirm}
        onClose={() => setChatConfirm(false)}
        instant={sheetLeave.instant}
      >
        <T variant="heading">팔로우하고 대화를 시작해요</T>
        <T variant="body">
          채팅은 팔로우한 농가와만 할 수 있어요. {p.farmName}을 팔로우하고
          대화를 시작할까요?
        </T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Button
            label="아니요"
            variant="secondary"
            onPress={() => setChatConfirm(false)}
            style={{ flex: 1 }}
          />
          <Button
            label="시작하기"
            onPress={() =>
              sheetLeave.leave(
                () => setChatConfirm(false),
                () =>
                  router.push({
                    pathname: "/chats/[farmId]",
                    params: { farmId: p.farmId, start: "1", productId },
                  }),
              )
            }
            style={{ flex: 2 }}
          />
        </View>
      </Sheet>
      {toast.node}
    </Screen>
  );
}

function Ended() {
  const router = useRouter();
  return (
    <Screen>
      <HeaderBar
        onBack={() =>
          goBackOr(router, "/")
        }
      />
      <EmptyState
        icon="box"
        title="판매 중이 아닌 상품이에요"
        body="판매가 끝났거나 아직 승인 전인 상품이에요. 농가의 다른 상품을 볼 수 있어요."
        action={
          <Button
            label={router.canGoBack() ? "농가 페이지로" : "농가 둘러보기"}
            variant="outline"
            onPress={() =>
              goBackOr(router, "/farms")
            }
            style={{ marginTop: 12, alignSelf: "center" }}
          />
        }
      />
    </Screen>
  );
}
