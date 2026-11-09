import { apiUrl } from "@farmclub/api";
// SCR-04 상품 상세 (FEAT-07) — design: scr-04, s-04-soldout, s-04-ended, scr-04-sheet
import { track } from "@farmclub/analytics";
import { catalog, farms, referencePrice } from "@farmclub/api";
import {
  BottomBar,
  Button,
  defaultOptionId,
  EmptyState,
  HeaderBar,
  PRODUCT_PHOTO_HEIGHT,
  ProductPageBody,
  Screen,
  Scroll,
  Sheet,
  useSheetLeave,
  Skeleton,
  T,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Share, View } from "react-native";

import { useHideTabBar, useSession } from "../../../lib/session";
import { useToast } from "../../../lib/toast";
import { LoadError, OptionSheet, copyText, isStatus } from "../../../lib/views";
import { goBackOr } from "../../../lib/nav";

declare const process: { env: { EXPO_PUBLIC_CONSUMER_URL?: string } };

/** 상품 공유(결정 26): 웹은 공유 시트, 없으면 주소 복사. 앱은 OS 공유 시트 */
async function shareProduct(
  name: string,
  path: string,
  onCopied: () => void,
): Promise<void> {
  const base =
    Platform.OS === "web" && typeof location !== "undefined"
      ? location.origin
      : (process.env.EXPO_PUBLIC_CONSUMER_URL || "https://farmclub.kr").replace(/\/+$/, "");
  const url = `${base}${path}`;
  if (Platform.OS !== "web") {
    await Share.share({ message: `${name} ${url}`, url });
    return;
  }
  const nav = (globalThis as { navigator?: { share?: (d: object) => Promise<void> } }).navigator;
  if (nav?.share) {
    try {
      await nav.share({ title: name, url });
      return;
    } catch {
      // 사용자가 닫았거나 막혔다: 복사로 넘어가지 않는다
      return;
    }
  }
  if (await copyText(url)) onCopied();
}

export default function ProductPage() {
  // 구매 화면은 하단 탭 바를 숨기고 CTA만 둔다(DEV-293)
  useHideTabBar();
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
    // 첫 옵션이 품절이면 살 수 있는 옵션을 먼저 고른다(DEV-291)
    if (p && !optionId) setOptionId(defaultOptionId(p));
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
      const o = resume.data?.optionId ?? defaultOptionId(p);
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
            <Skeleton width="100%" height={PRODUCT_PHOTO_HEIGHT} radius={0} />
            <View style={{ padding: tokens.space.gutter, gap: 12 }}>
              <Skeleton width="60%" height={22} />
              <Skeleton width="40%" height={22} />
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
      {/* 머리 없이 사진이 곧 머리: 사진 위 뒤로·공유(결정 26, DEV-293) */}
      <Scroll bottom={120}>
        <ProductPageBody
          p={p}
          reference={(o) => referencePrice(p, o)}
          mediaUrl={(uri) => (uri.startsWith("/") ? apiUrl + uri : uri)}
          onFarmPress={() => router.push(`/farms/${p.farmId}`)}
          onBack={() => goBackOr(router, `/farms/${p.farmId}`)}
          onShare={() =>
            void shareProduct(p.name, here, () =>
              toast.show("링크를 복사했어요"),
            )
          }
        />
      </Scroll>

      <BottomBar>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="채팅"
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
        <T variant="body">채팅은 팔로우한 농가와만 할 수 있어요.</T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Button
            label="닫기"
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
        body="판매가 끝났거나 아직 승인 전이에요."
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
