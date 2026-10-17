import { apiUrl } from "@farmclub/api";
import { ModuleStory, DetailStory, Price, BrixReading } from "@farmclub/ui";
// SCR-04 상품 상세 (FEAT-07) — design: scr-04, s-04-soldout, s-04-ended, scr-04-sheet
import { catalog, farms, referencePrice } from "@farmclub/api";
import {
  BottomBar,
  Button,
  EmptyState,
  HeaderBar,
  Icon,
  Photo,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  T,
  dday,
  md,
  period,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useSession } from "../../../lib/session";
import { useToast } from "../../../lib/toast";
import { LoadError, OptionSheet, isStatus } from "../../../lib/views";

export default function ProductPage() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();
  const { user, requireLogin, resume, clearResume } = useSession();
  const {
    data: p,
    error,
    reload,
  } = useAsync(() => catalog.product(productId), [productId]);
  const [open, setOpen] = useState<null | "window" | "fee" | "info" | "cancel">(
    null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [optionId, setOptionId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const toast = useToast();
  const [chatConfirm, setChatConfirm] = useState(false);
  const here = `/products/${productId}`;

  useEffect(() => {
    if (p && !optionId) setOptionId(p.options[0]?.optionId ?? "");
  }, [p, optionId]);

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
          params: { farmId, start: "1" },
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
            <HeaderBar onBack={() => router.back()} />
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

  const cur = p.stages.find((s) => s.stageId === p.currentStageId) ?? null;
  const opt = p.options.find((o) => o.optionId === optionId) ?? p.options[0];
  const firstOpt = p.options[0].optionId;
  const left = cur
    ? Math.min(
        Math.floor(p.remainingGrams / Math.round(p.options[0].weightKg * 1000)),
        cur.options[firstOpt].quantity - cur.options[firstOpt].reservedCount,
      )
    : 0;
  const fee =
    p.shippingFeeType === "FREE" ? "무료배송" : `배송비 ${won(p.shippingFee)}`;
  const toggle = (k: NonNullable<typeof open>) =>
    setOpen((o) => (o === k ? null : k));

  // 예약하기 → 옵션·수량 시트. 로그인 관문은 시트의 ‘주문서로’에서 띄운다(D-17)
  function reserve() {
    setSheetOpen(true);
  }

  const availabilityText = {
    PAUSED: "판매 일시 중지",
    ENDED: "예약 종료",
    NOT_OPEN: "예약 시작 전",
    TOTAL_SOLD_OUT: "전체 물량 품절",
    PERIOD_SOLD_OUT: "이번 기간 품절",
    AVAILABLE: "예약 가능",
  }[p.availability];
  return (
    <Screen>
      <HeaderBar
        title="상품 상세"
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(`/farms/${p.farmId}`)
        }
      />
      <Scroll bottom={180}>
        <Photo
          uri={p.photo}
          width="100%"
          height={244}
          radius={0}
          alt={p.name}
          kind="product"
        />

        <View style={{ padding: 20, gap: 16 }}>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/farms/${p.farmId}`)}
            style={{ minHeight: 48, justifyContent: "center" }}
          >
            <T
              variant="sub"
              weight="semibold"
              color={tokens.color.accent}
              numberOfLines={1}
            >
              {p.farmName} ›
            </T>
          </Pressable>
          <T variant="title" accessibilityRole="header">
            {p.name}
          </T>
          <Fold
            label={`${period(p.deliveryWindow.start, p.deliveryWindow.end)} 도착 예정`}
            open={open === "window"}
            onPress={() => toggle("window")}
          >
            <T variant="sub">
              농가 사정으로 바뀌면 새 기간으로 받거나 전액 환불받을 수 있어요.{" "}
              {md(p.maxDelayUntil)}까지 보내지 못하면 자동으로 전액 환불해
              드려요.
            </T>
          </Fold>
          {p.soldOut ? (
            <>
              <T variant="heading">{availabilityText}</T>
              <T variant="sub" muted>
                {p.nextStageStartsAt
                  ? `다음 예약은 ${md(p.nextStageStartsAt)}에 열려요.`
                  : "지금은 새 예약을 받지 않아요."}
              </T>
            </>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
              {p.options.map((o) => {
                const value = cur?.options[o.optionId];
                const sold =
                  !value ||
                  value.reservedCount >= value.quantity ||
                  p.remainingGrams < Math.round(o.weightKg * 1000);
                return (
                  <View
                    key={o.optionId}
                    style={{ minWidth: 145, flex: 1, gap: 8 }}
                  >
                    <T weight="semibold" numberOfLines={1}>
                      {o.label}
                    </T>
                    <Price
                      large
                      current={value?.price ?? null}
                      reference={referencePrice(p, o.optionId)}
                      soldOut={sold}
                    />
                  </View>
                );
              })}
            </View>
          )}
          {!p.soldOut ? (
            <T variant="sub" muted numberOfLines={1}>
              {left}박스 남음 · 마감 {dday(p.dDay)}
            </T>
          ) : null}
          <Fold
            label={fee + " · 도서산간 추가"}
            open={open === "fee"}
            onPress={() => toggle("fee")}
          >
            <T variant="sub">
              도서산간 주소는 추가 운임 {won(p.remoteAreaFee)}이 붙어요.
            </T>
          </Fold>
        </View>

        {p.moduleDetail ? (
          <ModuleStory
            content={p.moduleDetail}
            mediaUrl={(uri) => (uri.startsWith("/") ? apiUrl + uri : uri)}
          />
        ) : (
          <DetailStory
            content={p.detailContent}
            fallback={p.description}
            title="농가 이야기"
          />
        )}

        <BrixReading
          measured={p.measuredBrix}
          measuredAt={p.measuredBrixAt}
          expected={p.expectedBrix}
        />

        {p.farmerNote ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 40, gap: 8 }}>
            <T variant="sub" muted>
              {p.farmName}의 한마디
            </T>
            <T variant="body">{p.farmerNote}</T>
          </View>
        ) : null}

        <View style={{ marginHorizontal: 20, marginTop: 40 }}>
          <Fold
            label="상품정보"
            open={open === "info"}
            onPress={() => toggle("info")}
          >
            {[
              ["원산지", p.info.origin],
              ["생산자", p.info.producer],
              ["중량·수량", p.info.size],
              ["포장일", p.info.packedAt],
              ["보관 방법", p.info.storage],
              ["상담", p.info.contact],
            ].map(([k, v]) => (
              <View key={k} style={{ flexDirection: "row", gap: 12 }}>
                <T variant="sub" muted style={{ width: 80 }}>
                  {k}
                </T>
                <T variant="sub" style={{ flex: 1 }}>
                  {v}
                </T>
              </View>
            ))}
          </Fold>
          <Fold
            label="취소 규정"
            open={open === "cancel"}
            onPress={() => toggle("cancel")}
            last
          >
            <T variant="sub">예약할 때 전액을 한 번에 결제해요.</T>
            <T variant="sub">
              보내기 전에는 언제든 취소할 수 있고 전액 환불돼요. 수수료는
              없어요.
            </T>
            <T variant="sub">
              신선식품이라 보낸 뒤에는 단순 변심으로 취소·반품할 수 없어요. 받은
              상품에 문제가 있으면 받은 뒤 24시간 안에 사진과 함께 알려주세요.
            </T>
          </Fold>
        </View>
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
        onSubmit={() => {
          setSheetOpen(false);
          // 비로그인이면 여기서 관문 → 로그인 뒤 고른 옵션·수량 그대로 주문서(결정 25)
          requireLogin("reserve", here, () => goCheckout(opt.optionId, qty), {
            optionId: opt.optionId,
            quantity: String(qty),
          });
        }}
      />
      <Sheet visible={chatConfirm} onClose={() => setChatConfirm(false)}>
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
            onPress={() => {
              setChatConfirm(false);
              router.push(`/chats/${p.farmId}?start=1`);
            }}
            style={{ flex: 2 }}
          />
        </View>
      </Sheet>
      {toast.node}
    </Screen>
  );
}

function Fold({
  label,
  open,
  onPress,
  children,
  last,
}: {
  label: string;
  open: boolean;
  onPress: () => void;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: tokens.color.border,
        borderBottomWidth: last ? 1 : 0,
        borderBottomColor: tokens.color.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 52,
        }}
      >
        <T variant="body">{label}</T>
        <Icon
          name={open ? "chevronDown" : "chevron"}
          color={tokens.color.textMuted}
        />
      </Pressable>
      {open ? (
        <View style={{ paddingBottom: 16, gap: 8 }}>{children}</View>
      ) : null}
    </View>
  );
}

function Ended() {
  const router = useRouter();
  return (
    <Screen>
      <HeaderBar
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/")
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
              router.canGoBack() ? router.back() : router.replace("/farms")
            }
            style={{ marginTop: 12, alignSelf: "center" }}
          />
        }
      />
    </Screen>
  );
}
