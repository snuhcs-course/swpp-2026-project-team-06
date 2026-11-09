// SCR-29 주문·출하 처리 (FEAT-17, FEAT-09 AC-09-8 입금 확인·AC-09-9 미승인, AC-17-7 환불 송금·AC-17-8 미승인, R-07·15·19·28, DEV-68) — design: p-scr-29, DEV-68 보드
// 입금 승인은 확인 시트 후 처리하고 환불 완료는 줄에서 처리한다. 미승인은 줄 안에 사유(필수) 칸이 펼쳐진다.
// 받는 사람 실명·전체 주소는 이 화면에서만 보인다(배송 목적, R-15). 입금 대기 줄에는 배송지가 없다. 여러 건 출하는 주문마다 ship API를 반복 호출한다.
import {
  ApiError,
  CARRIERS,
  carrierLabel,
  allPages,
  orders,
  newIdempotencyKey,
  serverNow,
  type Carrier,
  type HarvestTarget,
  type OrderStatus,
  type ProducerOrder,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Icon,
  Input,
  ListRow,
  Notice,
  Radio,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  T,
  deadline,
  focusRing,
  md,
  tokens,
  won,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { isConnectionError, useSession } from "../lib/session";
import { LoadError, ORDER_STATUS, errMsg } from "../lib/views";
import { orderItemParts, orderWho } from "../lib/orderWho";
import { goBackOr } from "../lib/nav";

type Data = {
  awaiting: ProducerOrder[];
  reserved: ProducerOrder[];
  preparing: ProducerOrder[];
  shipped: ProducerOrder[];
  refunded: ProducerOrder[];
  all: ProducerOrder[];
};

type Invoice = { carrier: Carrier | null; no: string };

const SHIP_TABS = new Set(["PREPARING", "SHIPPED"]);
type Reject = { orderId: string; kind: "deposit" | "refund" };
// 미승인 사유: 하나를 골라 켜고(토글), ‘직접 입력’을 켜면 입력 칸이 열린다
const CUSTOM = "직접 입력";
const DEPOSIT_REASONS = [
  "입금이 아직 들어오지 않았어요",
  "금액이 달라요",
  "입금자명이 주문 번호와 달라요",
];
const REFUND_REASONS = [
  "환불받을 계좌를 확인해야 해요",
  "소비자와 연락하고 있어요",
  "환불 대상이 아니에요",
];
/** 시트·화면 읽기 라벨: "김민지 · 하우스 감귤 5kg × 1"(DEV-226) */
const who = (o: ProducerOrder) => orderWho(o);
/** "CJ대한통운 6012-3456-7890" / "송장 없음" */
const invoiceText = (
  carrier: Carrier | null | undefined,
  no: string | null | undefined,
) => [carrierLabel(carrier), no].filter(Boolean).join(" ") || "송장 없음";

export default function Ship() {
  const router = useRouter();
  const { status } = useLocalSearchParams<{ status?: string }>();
  const { toast, failToast } = useSession();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<unknown>(null);
  type Tab =
    | "all"
    | "AWAITING_DEPOSIT"
    | "RESERVED"
    | "PREPARING"
    | "SHIPPED"
    | "REFUNDED";
  const tab: Tab =
    status === "all" ||
    status === "AWAITING_DEPOSIT" ||
    status === "RESERVED" ||
    status === "SHIPPED" ||
    status === "REFUNDED"
      ? status
      : "PREPARING";
  const setTab = (value: Tab) => router.setParams({ status: value });
  const [picked, setPicked] = useState<string[]>([]);
  const [invoices, setInvoices] = useState<Record<string, Invoice>>({});
  const [invoiceFor, setInvoiceFor] = useState<ProducerOrder | null>(null);
  const [draft, setDraft] = useState<Invoice>({ carrier: null, no: "" });
  const trackingKeys = useRef(new Map<string, string>());
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [depositFor, setDepositFor] = useState<ProducerOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 줄 안 미승인 칸(DEV-68). 한 번에 한 줄만 펼친다
  const [reject, setReject] = useState<Reject | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [cancelOrder, setCancelOrder] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  // DEV-231: 예약 탭 맨 위 '수확 시작하기' 줄(누르면 그 예약 기간 카드로)
  const [targets, setTargets] = useState<HarvestTarget[]>([]);

  const load = useCallback(async () => {
    setError(null);
    void orders
      .dashboard()
      .then((d) => setTargets(d.todo.harvestTargets ?? []))
      .catch(() => setTargets([]));
    try {
      const all = await allPages((cursor) =>
        orders.producerOrders({ limit: 50, cursor }),
      );
      const preparing = all.filter((o) => o.status === "PREPARING");
      setData({
        all,
        awaiting: all.filter((o) => o.status === "AWAITING_DEPOSIT"),
        reserved: all.filter((o) => o.status === "RESERVED"),
        preparing,
        shipped: all.filter((o) => o.status === "SHIPPED"),
        refunded: all.filter((o) => o.status === "REFUNDED"),
      });
      setPicked((old) =>
        old.filter((id) => preparing.some((o) => o.orderId === id)),
      );
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const back = () => (goBackOr(router, "/"));

  if (!data) {
    return (
      <Screen>
        <HeaderBar
          title={SHIP_TABS.has(tab) ? "배송 현황" : "주문 현황"}
          onBack={back}
        />
        {error ? (
          <LoadError error={error} onRetry={load} />
        ) : (
          <Skeleton width="90%" height={200} style={{ margin: 20 }} />
        )}
      </Screen>
    );
  }

  const list =
    tab === "all"
      ? data.all
      : tab === "AWAITING_DEPOSIT"
        ? data.awaiting
        : tab === "RESERVED"
          ? data.reserved
          : tab === "PREPARING"
            ? data.preparing
            : tab === "REFUNDED"
              ? data.refunded
              : data.shipped;
  const chosen = data.preparing.filter((o) => picked.includes(o.orderId));
  const has = (id: string) => !!(invoices[id]?.carrier || invoices[id]?.no);
  const withInvoice = chosen.filter((o) => has(o.orderId)).length;

  async function shipAll() {
    if (busy || !chosen.length) return;
    setBusy(true);
    setNotice(null);
    let ok = 0;
    let conflicted = 0;
    let lost: unknown = null; // 연결 문제로 못 바꾼 주문은 고른 채로 두고 다시 시도
    const left: string[] = [];
    for (const o of chosen) {
      const inv = invoices[o.orderId];
      try {
        await orders.ship(
          o.orderId,
          inv?.no.trim() || undefined,
          inv?.carrier ?? null,
        );
        ok += 1;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) conflicted += 1;
        else {
          left.push(o.orderId);
          if (isConnectionError(e)) lost = e;
          else setNotice(errMsg(e));
        }
      }
    }
    setConfirm(false);
    setPicked(left);
    if (conflicted)
      setNotice(
        `${conflicted}건은 이미 상태가 바뀌었어요. 최신 상태로 다시 보여 드려요.`,
      ); // 409 → 다시 그림
    if (lost) failToast(lost, () => setConfirm(true));
    else if (ok) toast(`${ok}건을 출하 처리했어요`);
    await load();
    setBusy(false);
  }

  function openInvoice(o: ProducerOrder) {
    setInvoiceFor(o);
    setDraft(o.status === "SHIPPED"
      ? { carrier: o.carrier, no: o.trackingNumber ?? "" }
      : invoices[o.orderId] ?? { carrier: null, no: "" });
    setInvoiceError(null);
  }

  // 시트에서 저장하면 그 주문을 고르고 토스트(SCR-29 버튼 동작). 서버에는 출하할 때 함께 보낸다.
  async function saveInvoice() {
    if (!invoiceFor || busy) return;
    const no = draft.no.trim();
    if (no.length > 50) return setInvoiceError("송장 번호는 50자까지예요");
    if ((no || invoiceFor.status === "SHIPPED") && !draft.carrier)
      return setInvoiceError("택배사를 골라 주세요");
    if (invoiceFor.status === "SHIPPED" && draft.carrier) {
      const payload = JSON.stringify([invoiceFor.orderId, invoiceFor.trackingVersion, draft.carrier, no]);
      let key = trackingKeys.current.get(payload);
      if (!key) {
        key = newIdempotencyKey();
        trackingKeys.current.set(payload, key);
      }
      setBusy(true);
      try {
        await orders.updateTracking(invoiceFor.orderId, invoiceFor.trackingVersion, draft.carrier, no || null, key);
        trackingKeys.current.delete(payload);
        setInvoiceFor(null);
        toast("송장을 수정했어요");
        await load();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setInvoiceFor(null);
          setNotice(errMsg(e));
          await load();
        } else setInvoiceError(errMsg(e));
      } finally { setBusy(false); }
      return;
    }
    setInvoices((m) => ({
      ...m,
      [invoiceFor.orderId]: { carrier: draft.carrier, no },
    }));
    if (!picked.includes(invoiceFor.orderId))
      setPicked((p) => [...p, invoiceFor.orderId]);
    setInvoiceFor(null);
    toast("송장을 저장했어요");
  }

  // 승인·미승인 공통: 409면 최신 상태로 다시 그린다
  async function act(run: () => Promise<unknown>, done: string, retry: () => void) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await run();
      setReject(null);
      toast(done);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setReject(null);
        setNotice("이미 상태가 바뀌었어요. 최신 상태로 다시 보여 드려요.");
        await load();
      } else if (isConnectionError(e)) failToast(e, retry);
      else if (e instanceof ApiError && e.details.fields?.reason)
        setReasonError(String(e.details.fields.reason));
      else setNotice(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // 입금 승인(AC-09-8)은 확인 후, 환불 완료(AC-17-7)는 줄에서 처리
  const approve = (o: ProducerOrder) =>
    o.status === "AWAITING_DEPOSIT"
      ? act(
          () => orders.confirmDeposit(o.orderId),
          `${o.orderNo} 입금을 승인했어요 · 예약 완료`,
          () => void approve(o),
        )
      : act(
          () => orders.refundSettled(o.orderId),
          `${o.orderNo} 환불 완료로 기록했어요`,
          () => void approve(o),
        );

  function openReject(o: ProducerOrder) {
    setReject({
      orderId: o.orderId,
      kind: o.status === "AWAITING_DEPOSIT" ? "deposit" : "refund",
    });
    setPreset(null);
    setReason("");
    setCancelOrder(false);
    setReasonError(null);
  }

  // 미승인(AC-09-9·AC-17-8): 사유 필수, 소비자에게 그대로 보인다
  function sendReject(o: ProducerOrder) {
    const text = preset === CUSTOM ? reason.trim() : (preset ?? "");
    if (!text)
      return setReasonError(
        preset === CUSTOM ? "사유를 적어 주세요" : "미승인 사유를 골라 주세요",
      );
    if (reject?.kind === "deposit")
      return act(
        () => orders.rejectDeposit(o.orderId, text, cancelOrder),
        cancelOrder
          ? `${o.orderNo} 주문을 취소했어요`
          : `${o.orderNo} 미승인 사유를 소비자에게 알렸어요`,
        () => sendReject(o),
      );
    return act(
      () => orders.refundIssue(o.orderId, text),
      `${o.orderNo} 환불 미승인 사유를 소비자에게 알렸어요`,
      () => sendReject(o),
    );
  }

  // 로그인 화면 계정 고르기와 같은 Radio 줄(눌러서 켜고, 다시 누르면 끈다)
  const radioRow = (label: string, on: boolean, onPress: () => void, last: boolean) => (
    <Pressable
      key={label}
      accessibilityRole="radio"
      aria-checked={on}
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      style={(st) =>
        [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: tokens.touchTarget.min,
            borderTopWidth: 1,
            borderTopColor: tokens.color.border,
            borderBottomWidth: last ? 1 : 0,
            borderBottomColor: tokens.color.border,
          },
          (st as { focused?: boolean }).focused && focusRing,
        ] as never
      }
    >
      <Radio selected={on} />
      <T variant="body" style={{ flex: 1 }}>
        {label}
      </T>
    </Pressable>
  );

  const rejectForm = (o: ProducerOrder) => {
    const deposit = reject?.kind === "deposit";
    const presets = deposit ? DEPOSIT_REASONS : REFUND_REASONS;
    return (
      <View style={{ gap: 12, paddingTop: 8 }}>
        {deposit ? (
          <>
            <T variant="sub" weight="semibold">
              미승인하면
            </T>
            {/* DEV-294: 두 칸 칩 → 사유와 같은 세로 목록 */}
            <View accessibilityRole="radiogroup" accessibilityLabel="미승인하면">
              {radioRow("입금 대기로 두기", !cancelOrder, () => setCancelOrder(false), false)}
              {radioRow("주문 취소", cancelOrder, () => setCancelOrder(true), true)}
            </View>
          </>
        ) : null}
        <View style={{ gap: 2 }}>
          <T variant="sub" weight="semibold">
            미승인 사유
          </T>
          <T variant="caption" muted>
            소비자에게 그대로 보여요
          </T>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="미승인 사유">
          {[...presets, CUSTOM].map((p, i, all) =>
            radioRow(
              p,
              preset === p,
              () => {
                setPreset((cur) => (cur === p ? null : p));
                setReasonError(null);
              },
              i === all.length - 1,
            ),
          )}
        </View>
        {preset === CUSTOM ? (
          <Input
            accessibilityLabel="미승인 사유 직접 쓰기"
            value={reason}
            onChangeText={(v) => {
              setReason(v);
              setReasonError(null);
            }}
            placeholder="사유를 적어 주세요"
            maxLength={200}
            error={reasonError ?? undefined}
          />
        ) : reasonError ? (
          <T variant="sub" color={tokens.color.error}>
            {reasonError}
          </T>
        ) : null}
        <T variant="sub" muted>
          {deposit
            ? cancelOrder
              ? "주문이 취소되고 물량이 돌아가요"
              : "입금 대기로 남아 소비자가 다시 입금을 알릴 수 있어요"
            : "환불 송금 대기로 남아요"}
        </T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="닫기"
            variant="secondary"
            size="producer"
            disabled={busy}
            style={{ flex: 1 }}
            onPress={() => setReject(null)}
          />
          <Button
            label={deposit && cancelOrder ? "미승인 · 주문 취소" : "미승인"}
            size="producer"
            style={{ flex: 2 }}
            loading={busy}
            disabled={!preset || (preset === CUSTOM && !reason.trim())}
            onPress={() => void sendReject(o)}
          />
        </View>
      </View>
    );
  };

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "all", label: "전체", count: data.all.length },
    { value: "AWAITING_DEPOSIT", label: "입금 대기", count: data.awaiting.length },
    { value: "RESERVED", label: "예약", count: data.reserved.length },
    { value: "PREPARING", label: "출하 준비", count: data.preparing.length },
    { value: "SHIPPED", label: "출하", count: data.shipped.length },
    { value: "REFUNDED", label: "환불", count: data.refunded.length },
  ];
  // 탭 안내는 한 줄(DEV-294). 출하 준비는 전체 선택 줄이 대신한다
  const helper =
    tab === "AWAITING_DEPOSIT"
      ? "입금자명·금액 확인 후 승인 · 24시간 안에 입금이 없으면 자동 취소"
      : tab === "REFUNDED"
        ? "입금했던 계좌로 직접 보낸 뒤 승인"
        : tab === "RESERVED"
          ? "예약 기간에서 수확을 시작하면 출하 준비로 옮겨져요"
          : tab === "SHIPPED"
            ? "배송 완료는 farmclub이 확인해서 바꿔요"
            : null;
  const allPicked =
    data.preparing.length > 0 && chosen.length === data.preparing.length;
  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Screen>
      <HeaderBar
        title={SHIP_TABS.has(tab) ? "배송 현황" : "주문 현황"}
        onBack={back}
      />
      {/* 밑줄 탭: 가로로 넘겨 보고, 글자가 잘리지 않는다(DEV-294) */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: tokens.color.border }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="tablist"
          contentContainerStyle={{ paddingHorizontal: tokens.space.gutter - 12 }}
        >
          {tabs.map((t) => {
            const on = t.value === tab;
            return (
              <Pressable
                key={t.value}
                accessibilityRole="tab"
                accessibilityLabel={`${t.label} ${t.count}`}
                aria-selected={on}
                onPress={() => setTab(t.value)}
                style={(st) =>
                  [
                    {
                      minHeight: tokens.touchTarget.min,
                      paddingHorizontal: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      borderBottomWidth: 2,
                      borderBottomColor: on ? tokens.color.text : "transparent",
                      marginBottom: -1,
                    },
                    (st as { focused?: boolean }).focused && focusRing,
                  ] as never
                }
              >
                <T variant="sub" weight={on ? "bold" : "regular"} muted={!on}>
                  {t.label}
                </T>
                <T
                  variant="sub"
                  weight={on ? "bold" : "regular"}
                  color={on && t.count ? tokens.color.accent : tokens.color.textMuted}
                >
                  {t.count}
                </T>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <Scroll bottom={tab === "PREPARING" && data.preparing.length ? 120 : 60}>
        {error ? <LoadError error={error} onRetry={load} /> : null}
        {notice ? (
          <Notice
            title={notice}
            style={{ marginHorizontal: tokens.space.gutter, marginTop: tokens.space.md }}
          />
        ) : null}
        {helper ? (
          <T
            variant="caption"
            muted
            style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 12 }}
          >
            {helper}
          </T>
        ) : null}
        {tab === "RESERVED" && targets.length ? (
          <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 4 }}>
            {targets.map((t, i) => (
              <ListRow
                key={t.stageId}
                label={`${t.productName} ${t.stageName} · ${t.count}건 수확 시작하기`}
                sub={
                  t.closed
                    ? "예약 기간이 끝났어요"
                    : `예약 기간 ${Number(t.endsAt.slice(5, 7))}월 ${Number(t.endsAt.slice(8, 10))}일까지`
                }
                onPress={() =>
                  router.push(`/products/${t.productId}/stages?stage=${t.stageId}`)
                }
                last={i === targets.length - 1}
              />
            ))}
          </View>
        ) : null}
        <View style={{ paddingHorizontal: tokens.space.gutter }}>
          {tab === "PREPARING" && list.length ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: tokens.height.listRowProducer,
              }}
            >
              <Pressable
                accessibilityRole="checkbox"
                aria-checked={allPicked}
                accessibilityLabel="전체 선택"
                disabled={busy}
                onPress={() =>
                  setPicked(allPicked ? [] : data.preparing.map((o) => o.orderId))
                }
                style={(st) =>
                  [
                    {
                      minHeight: tokens.touchTarget.min,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    },
                    (st as { focused?: boolean }).focused && focusRing,
                  ] as never
                }
              >
                <Box on={allPicked} />
                <T>전체 선택</T>
              </Pressable>
              <T variant="caption" muted>
                {list.length}건 중 {chosen.length}건
              </T>
            </View>
          ) : null}
          {list.length === 0 ? (
            <T variant="sub" muted style={{ paddingVertical: tokens.space.lg }}>
              {tab === "PREPARING"
                ? "출하 준비 주문이 없어요"
                : tab === "AWAITING_DEPOSIT"
                  ? "입금을 기다리는 주문이 없어요"
                  : tab === "REFUNDED"
                    ? "환불할 주문이 없어요"
                    : "해당 상태의 주문이 없어요"}
            </T>
          ) : null}
          {list.map((o, i) => {
            const sel = picked.includes(o.orderId);
            const inv =
              o.status === "PREPARING"
                ? invoices[o.orderId]
                : { carrier: o.carrier, no: o.trackingNumber ?? "" };
            const filled = !!(inv?.carrier || inv?.no);
            const awaiting = o.status === "AWAITING_DEPOSIT";
            const refunded = o.status === "REFUNDED";
            const canceled = o.status === "CANCELED";
            const checkable = tab === "PREPARING";
            const item = orderItemParts(o);
            // 출하 준비 줄의 송장은 그 탭의 고르기·출하 바와 묶여 있어, 전체 탭에서는 그 탭으로 옮긴 뒤 연다(DEV-291)
            const editInvoice = () => {
              if (o.status === "PREPARING" && tab !== "PREPARING") setTab("PREPARING");
              openInvoice(o);
            };
            const showInvoice =
              (o.status === "PREPARING" || o.status === "SHIPPED") &&
              (tab === "all" || tab === "PREPARING" || tab === "SHIPPED");
            const info = (
              <View style={{ flex: 1, minWidth: 0, gap: 2, opacity: canceled ? 0.5 : 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
                  {tab === "all" ? (
                    <StatusChip status={o.status} settled={!!o.refundSettledAt} />
                  ) : null}
                  <T weight="semibold" numberOfLines={1} masked style={{ flexShrink: 1 }}>
                    {o.recipientName}
                  </T>
                  <T
                    variant="caption"
                    muted
                    numberOfLines={1}
                    style={{ flex: 1, textAlign: "right" }}
                  >
                    {o.orderNo}
                    {awaiting
                      ? o.depositDueAt && Date.parse(o.depositDueAt) <= serverNow()
                        ? " · 기한 지남"
                        : ` · 기한 ${deadline(o.depositDueAt)}`
                      : ""}
                  </T>
                </View>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: tokens.space.sm }}>
                  {/* 길면 상품명만 줄이고 ‘옵션 × 수량’은 끝까지(AC-17-10) */}
                  <View style={{ flex: 1, minWidth: 0, flexDirection: "row" }}>
                    {item.name ? (
                      <T numberOfLines={1} style={{ flexShrink: 1 }}>
                        {item.name}
                      </T>
                    ) : null}
                    {/* 줄인 조각 끝 공백은 웹에서 사라져 띄어쓰기를 옵션 쪽에 둔다 */}
                    <T style={{ flexShrink: 0 }}>
                      {item.name ? ` ${item.tail}` : item.tail}
                    </T>
                  </View>
                  <T weight="semibold" style={{ flexShrink: 0 }}>
                    {won(o.totalAmount)}
                  </T>
                </View>
                {awaiting ? (
                  // 입금 전에는 배송지 대신 입금자명(R-15, DEV-68)
                  <T variant="sub" muted>
                    입금자명{" "}
                    <T variant="sub" weight="bold">
                      {o.orderNo}
                    </T>
                  </T>
                ) : refunded ? (
                  <T variant="sub" muted>
                    입금했던 계좌로 돌려보내요
                  </T>
                ) : canceled ? null : (
                  <T variant="sub" muted numberOfLines={1} masked>
                    {[o.address, o.addressDetail].filter(Boolean).join(" ")}
                  </T>
                )}
                {awaiting && o.depositReportedAt ? (
                  <T variant="sub" muted>
                    소비자가 입금했다고 알렸어요
                  </T>
                ) : null}
                {o.deliveryNote && !awaiting ? (
                  <T variant="sub" muted numberOfLines={1}>
                    메모: {o.deliveryNote}
                  </T>
                ) : null}
                {awaiting && o.depositIssue ? (
                  <T variant="sub" muted>
                    미승인 사유: {o.depositIssue}
                  </T>
                ) : null}
                {refunded && o.refundIssue ? (
                  <T variant="sub" muted>
                    미승인 사유: {o.refundIssue}
                  </T>
                ) : null}
                {refunded && o.refundSettledAt ? (
                  <T variant="sub" weight="semibold" muted>
                    {md(o.refundSettledAt)} 송금 완료
                  </T>
                ) : awaiting || refunded ? (
                  // 확인 창 없이 줄에서 바로 승인·미승인(DEV-68)
                  reject?.orderId === o.orderId ? (
                    rejectForm(o)
                  ) : (
                    <View style={{ flexDirection: "row", gap: 8, paddingTop: 8 }}>
                      <Button
                        label="미승인"
                        variant="secondary"
                        size="producer"
                        disabled={busy}
                        style={{ flex: 1 }}
                        accessibilityLabel={`${o.orderNo} ${awaiting ? "입금" : "환불"} 미승인`}
                        onPress={() => openReject(o)}
                      />
                      <Button
                        label="승인"
                        size="producer"
                        disabled={busy}
                        style={{ flex: 2 }}
                        accessibilityLabel={`${o.orderNo} ${awaiting ? "입금 승인" : "환불 완료"}`}
                        onPress={() => awaiting ? setDepositFor(o) : void approve(o)}
                      />
                    </View>
                  )
                ) : null}
                {showInvoice ? (
                  <View style={{ flexDirection: "row", paddingTop: tokens.space.sm }}>
                    {filled ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${o.orderNo} 송장 수정`}
                        disabled={busy}
                        onPress={editInvoice}
                        hitSlop={8}
                        style={(st) =>
                          [
                            {
                              minHeight: 32,
                              maxWidth: "100%",
                              paddingHorizontal: 12,
                              borderRadius: tokens.radius.sm,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              backgroundColor: tokens.color.surface,
                            },
                            (st as { focused?: boolean }).focused && focusRing,
                          ] as never
                        }
                      >
                        <T variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {invoiceText(inv?.carrier, inv?.no)}
                        </T>
                        <T variant="caption" weight="semibold" color={tokens.color.accent}>
                          수정
                        </T>
                      </Pressable>
                    ) : (
                      <SmallButton
                        label="송장 입력"
                        accessibilityLabel={`${o.orderNo} ${who(o)} 송장 입력`}
                        disabled={busy}
                        onPress={editInvoice}
                      />
                    )}
                  </View>
                ) : null}
              </View>
            );
            return (
              <View
                key={o.orderId}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingVertical: tokens.space.md,
                  // 전체 탭은 탭 밑줄 바로 아래에서 시작해 첫 줄 선을 겹치지 않는다
                  borderTopWidth: i === 0 && tab === "all" ? 0 : 1,
                  borderTopColor: tokens.color.border,
                  minHeight: tokens.height.listRowProducer,
                }}
              >
                {checkable ? (
                  // 체크 칸: 보이는 24, 누르는 영역 48, 줄 가운데(DEV-294)
                  <Pressable
                    accessibilityRole="checkbox"
                    disabled={busy}
                    aria-checked={sel}
                    accessibilityLabel={`${o.orderNo} ${who(o)} 고르기`}
                    onPress={() => togglePick(o.orderId)}
                    style={(st) =>
                      [
                        {
                          width: 48,
                          minHeight: 48,
                          alignSelf: "stretch",
                          justifyContent: "center",
                        },
                        (st as { focused?: boolean }).focused && focusRing,
                      ] as never
                    }
                  >
                    <Box on={sel} />
                  </Pressable>
                ) : null}
                {info}
              </View>
            );
          })}
          {list.length ? (
            <View
              style={{ borderTopWidth: 1, borderTopColor: tokens.color.border }}
            />
          ) : null}
        </View>
      </Scroll>

      {tab === "PREPARING" && data.preparing.length ? (
        <BottomBar>
          <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.md }}>
            <T weight="semibold" style={{ flexShrink: 0 }}>
              {chosen.length}건 선택
            </T>
            <Button
              label="출하 처리"
              accessibilityLabel={`${chosen.length}건 출하 처리`}
              size="producer"
              style={{ flex: 1 }}
              disabled={!chosen.length || busy || !!error}
              onPress={() => setConfirm(true)}
            />
          </View>
        </BottomBar>
      ) : null}

      {/* 택배사·송장 번호(선택) — design: s-29-invoice */}
      <Sheet visible={!!invoiceFor} onClose={() => { if (!busy) setInvoiceFor(null); }}>
        <T variant="heading">택배사·송장 번호</T>
        {invoiceFor ? (
          <T variant="sub" muted>
            {who(invoiceFor)} · {invoiceFor.orderNo}
          </T>
        ) : null}
        <T variant="sub" weight="semibold" style={{ marginTop: 4 }}>
          택배사
        </T>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="택배사"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
        >
          {CARRIERS.map((c) => {
            const on = draft.carrier === c.code;
            return (
              <Pressable
                key={c.code}
                accessibilityRole="radio"
                disabled={busy}
                aria-checked={on}
                accessibilityLabel={c.label}
                onPress={() => {
                  setDraft((d) => ({ ...d, carrier: on ? null : c.code }));
                  setInvoiceError(null);
                }}
                style={(st) =>
                  [
                    {
                      flexBasis: "30%",
                      flexGrow: 1,
                      height: tokens.touchTarget.min,
                      borderRadius: tokens.radius.sm,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: tokens.color.background,
                      borderWidth: on ? 1.5 : 1,
                      borderColor: on ? tokens.color.text : tokens.color.border,
                    },
                    (st as { focused?: boolean }).focused && focusRing,
                  ] as never
                }
              >
                <T variant="sub" weight="semibold" muted={!on}>
                  {c.label}
                </T>
              </Pressable>
            );
          })}
        </View>
        <Input
          label="송장 번호"
          optional
          editable={!busy}
          value={draft.no}
          onChangeText={(v) => {
            setDraft((d) => ({ ...d, no: v }));
            setInvoiceError(null);
          }}
          placeholder="예: 6012-3456-7890"
          error={invoiceError ?? undefined}
          hint="넣으면 소비자가 배송을 조회할 수 있어요"
          maxLength={50}
        />
        <Button
          label="저장"
          size="producer"
          onPress={() => void saveInvoice()}
          disabled={busy}
          loading={busy}
          style={{ marginTop: 8 }}
        />
      </Sheet>

      <Sheet visible={!!depositFor} onClose={() => { if (!busy) setDepositFor(null); }}>
        <T variant="heading">입금을 승인할까요?</T>
        {depositFor ? <View style={{ gap: 8 }}>
          <T>{depositFor.orderNo}</T>
          <T>{who(depositFor)}</T>
          <T>{won(depositFor.totalAmount)}</T>
        </View> : null}
        <T variant="sub" muted>승인하면 소비자에게 예약 완료로 보여요</T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="닫기" variant="secondary" disabled={busy} style={{ flex: 1 }} onPress={() => setDepositFor(null)} />
          <Button label="확인 · 입금 승인" loading={busy} disabled={busy} style={{ flex: 2 }} onPress={async () => {
            if (!depositFor) return;
            await approve(depositFor);
            setDepositFor(null);
          }} />
        </View>
      </Sheet>

      {/* 출하 확인 */}
      <Sheet
        visible={confirm}
        onClose={() => { if (!busy) setConfirm(false); }}
      >
        <T variant="heading">{chosen.length}건을 출하 처리할까요?</T>
        <View>
          {chosen.map((o, i) => (
            <View
              key={o.orderId}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
                minHeight: tokens.touchTarget.min,
                alignItems: "center",
                borderTopWidth: 1,
                borderBottomWidth: i === chosen.length - 1 ? 1 : 0,
                borderColor: tokens.color.border,
              }}
            >
              <T variant="body" style={{ flexShrink: 1 }}>
                {who(o)}
              </T>
              <T variant="body" muted>
                {invoiceText(
                  invoices[o.orderId]?.carrier,
                  invoices[o.orderId]?.no,
                )}
              </T>
            </View>
          ))}
        </View>
        <T variant="sub" muted>출하 후에는 소비자가 취소할 수 없어요</T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="닫기"
            disabled={busy}
            variant="secondary"
            size="producer"
            style={{ flex: 1 }}
            onPress={() => setConfirm(false)}
          />
          <Button
            label={`${chosen.length}건 출하 처리`}
            size="producer"
            style={{ flex: 2 }}
            loading={busy}
            onPress={shipAll}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

/** 체크 상자: 보이는 24 */
function Box({ on }: { on: boolean }) {
  return (
    <View
      style={[
        {
          width: 24,
          height: 24,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
        },
        on
          ? { backgroundColor: tokens.color.accent }
          : { borderWidth: 1.5, borderColor: tokens.color.border },
      ]}
    >
      {on ? <Icon name="check" size={16} color={tokens.color.onAccent} /> : null}
    </View>
  );
}

/** 작은 버튼: 높이 32, hitSlop으로 누르는 영역 48(기준표) */
function SmallButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={(st) =>
        [
          {
            minHeight: 32,
            paddingHorizontal: 12,
            borderRadius: tokens.radius.sm,
            borderWidth: 1,
            borderColor: tokens.color.border,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tokens.color.background,
          },
          (st as { focused?: boolean }).focused && focusRing,
        ] as never
      }
    >
      <T variant="caption" weight="semibold">
        {label}
      </T>
    </Pressable>
  );
}

// 전체 탭 상태 칩(Figma PR542 ⑤): 손이 가야 하는 상태만 강조색
const ACTION_STATUS = new Set<OrderStatus>(["AWAITING_DEPOSIT", "PREPARING", "REFUNDED"]);
function StatusChip({ status, settled }: { status: OrderStatus; settled: boolean }) {
  // 환불은 송금을 마치면 더 할 일이 없다
  const strong = ACTION_STATUS.has(status) && !(status === "REFUNDED" && settled);
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: strong ? "#FDECE2" : tokens.color.surface,
      }}
    >
      <T
        variant="caption"
        weight="semibold"
        color={strong ? tokens.color.accent : tokens.color.textMuted}
      >
        {ORDER_STATUS[status]}
      </T>
    </View>
  );
}
