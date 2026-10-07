// SCR-04 상품 상세 (FEAT-07) — design: scr-04, s-04-soldout, s-04-ended, scr-04-sheet
import { apiUrl, catalog, farms, isMock } from "@farmclub/api";
import {
  BottomBar,
  Button,
  EmptyState,
  HeaderBar,
  Icon,
  IconButton,
  Photo,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  StageBar,
  T,
  dday,
  md,
  period,
  safe,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { useSession } from "../../lib/session";
import { useToast } from "../../lib/toast";
import {
  Avatar,
  LoadError,
  OptionSheet,
  copyText,
  isStatus,
} from "../../lib/views";

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
  const next =
    p.stages.find((s) => cur && s.seq === cur.seq + 1) ??
    p.stages.find((s) => s.startsAt > (cur?.endsAt ?? "")) ??
    null;
  const opt = p.options.find((o) => o.optionId === optionId) ?? p.options[0];
  const firstOpt = p.options[0].optionId;
  const left = cur
    ? Math.min(
        Math.floor(p.remainingGrams / (p.options[0].weightKg * 1000)),
        cur.options[firstOpt].quantity - cur.options[firstOpt].reservedCount,
      )
    : 0;
  const save = p.nextPrice && p.currentPrice ? p.nextPrice - p.currentPrice : 0;
  const unit = cur?.options[opt.optionId]?.price ?? 0;
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
    <Screen fullBleed>
      <Scroll bottom={150}>
        <View style={{ height: 390 }}>
          <Photo
            uri={p.photo}
            width="100%"
            height={390}
            radius={0}
            alt={p.name}
            kind="product"
          />
          <View style={{ position: "absolute", top: safe("top", 8), left: 8 }}>
            <IconButton
              icon="back"
              label="뒤로"
              onPhoto
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace(`/farms/${p.farmId}`)
              }
            />
          </View>
          <View style={{ position: "absolute", top: safe("top", 8), right: 8 }}>
            <IconButton
              icon="share"
              label="농가 링크 공유"
              onPhoto
              onPress={async () => {
                // Mock 배포에는 /s 서버가 없어서 이 앱의 농가 주소를 쓴다
                const url = isMock
                  ? `${typeof window !== "undefined" ? window.location.origin : ""}/farms/${p.farmId}`
                  : `${apiUrl}/s/farms/${p.farmId}`;
                toast.show((await copyText(url)) ? "링크를 복사했어요" : url);
              }}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open === "window" }}
          onPress={() => toggle("window")}
          style={{
            minHeight: 48,
            paddingHorizontal: 20,
            paddingVertical: 12,
            backgroundColor: tokens.color.surface,
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <T variant="sub" weight="semibold">
              {period(p.deliveryWindow.start, p.deliveryWindow.end)} 도착 예정
            </T>
            <Icon
              name={open === "window" ? "chevronDown" : "chevron"}
              size={20}
              color={tokens.color.textMuted}
            />
          </View>
          {open === "window" ? (
            <T variant="sub">
              {period(p.deliveryWindow.start, p.deliveryWindow.end)} 사이에
              받아요. 농가 사정으로 바뀌면 새 기간으로 받거나 전액 환불받을 수
              있어요. {md(p.maxDelayUntil)}까지 보내지 못하면 자동으로 전액
              환불해 드려요.
            </T>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/farms/${p.farmId}`)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: tokens.color.border,
          }}
        >
          <Avatar uri={p.farmPhoto} name={p.farmName} />
          <View style={{ flex: 1 }}>
            <T variant="body" weight="semibold">
              {p.farmName}
            </T>
            <T variant="sub" muted>
              {p.farmRegion}
            </T>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <T variant="body" weight="bold">
              당도 기록 {p.brixRecordCount}회
            </T>
            <T variant="caption" muted>
              실측 공개
            </T>
          </View>
        </Pressable>

        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <T variant="heading" accessibilityRole="header">
            {p.name}
          </T>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 4 }}>
          {p.soldOut ? (
            <>
              <T variant="sub" muted>
                {cur
                  ? `${md(cur.startsAt)} ~ ${md(cur.endsAt)} · ${won(cur.options[firstOpt].price)}`
                  : "예약 일정"}
              </T>
              <T variant="title">{availabilityText}</T>
              <T variant="sub" style={{ marginTop: 4 }}>
                {p.salesPaused
                  ? "농가가 잠시 새 예약을 쉬고 있어요. 기존 예약은 그대로 유지돼요."
                  : p.availability === "TOTAL_SOLD_OUT"
                    ? "농가가 정한 전체 판매 물량이 소진됐어요."
                    : p.nextStageStartsAt
                      ? `다음 예약은 ${md(p.nextStageStartsAt)}에 열려요.`
                      : "지금은 새 예약을 받지 않아요."}
              </T>
            </>
          ) : (
            <>
              <T variant="sub" muted>
                지금 예약하면
              </T>
              <T variant="title">{won(p.currentPrice)}</T>
              <T variant="sub" style={{ marginTop: 4 }}>
                {[
                  save > 0 ? `다음 기간보다 ${won(save)} 이득` : null,
                  `마감 ${dday(p.dDay)}`,
                  `${left}박스 남음`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </T>
            </>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open === "fee" }}
            onPress={() => toggle("fee")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              minHeight: 48,
            }}
          >
            <T variant="sub" muted>
              배송비{" "}
              {p.shippingFeeType === "FREE" ? "무료" : won(p.shippingFee)} ·
              도서산간 추가
            </T>
            <Icon name="chevronDown" size={18} color={tokens.color.textMuted} />
          </Pressable>
          {open === "fee" ? (
            <T variant="sub">
              {p.shippingFeeType === "FREE"
                ? "무료배송이에요."
                : `배송비 ${won(p.shippingFee)}이 따로 붙어요.`}{" "}
              도서산간 주소는 추가 운임 {won(p.remoteAreaFee)}이 붙어요.
            </T>
          ) : null}
          <View style={{ marginTop: 20, gap: 10 }}>
            <T weight="bold">예약 시기에 따른 가격</T>
            {p.stages.map((s) => (
              <View
                key={s.stageId}
                style={{
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor:
                    s.stageId === p.currentStageId
                      ? "#F3F0E8"
                      : tokens.color.surface,
                  gap: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <T variant="sub" weight="semibold">
                    {md(s.startsAt)} ~ {md(s.endsAt)}
                  </T>
                  {s.stageId === p.currentStageId ? (
                    <T variant="caption" weight="bold">
                      지금 예약
                    </T>
                  ) : null}
                </View>
                {p.options.map((o) => (
                  <View
                    key={o.optionId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <T variant="sub" muted>
                      {o.label}
                    </T>
                    <T variant="sub" weight="semibold">
                      {won(s.options[o.optionId]?.price)}
                    </T>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 40,
            flexDirection: "row",
            gap: 12,
          }}
        >
          <Icon name="drop" />
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="body" weight="semibold">
              {p.measuredBrix
                ? `당도 실측 ${p.measuredBrix}Brix`
                : `당도 예상 ${p.expectedBrix ?? "-"}Brix`}
            </T>
            <T variant="sub" muted>
              {p.measuredBrix
                ? `${md(p.measuredBrixAt)} 측정`
                : "실측 당도는 수확 후 소식으로 올라와요"}
            </T>
          </View>
        </View>

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
            {p.description ? (
              <T variant="sub" style={{ marginTop: 8 }}>
                {p.description}
              </T>
            ) : null}
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

      <BottomBar
        summary={
          p.soldOut
            ? availabilityText
            : `${p.name.split(" / ")[0].replace(/\s\d+kg$/, "")} ${opt.label} × ${qty} · ${fee}`
        }
        summaryRight={p.soldOut ? undefined : won(unit * qty)}
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="1:1 채팅하기"
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
