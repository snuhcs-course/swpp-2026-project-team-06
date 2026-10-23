// SCR-29 주문·출하 처리 (FEAT-17, FEAT-09 AC-09-8 입금 확인·AC-09-9 미승인, AC-17-7 환불 송금·AC-17-8 미승인, R-07·15·19·28, DEV-68) — design: p-scr-29, DEV-68 보드
// 입금 대기·환불 줄은 확인 창 없이 줄 안에서 바로 승인한다. 미승인은 줄 안에 사유(필수) 칸이 펼쳐진다.
// 받는 사람 실명·전체 주소는 이 화면에서만 보인다(배송 목적, R-15). 입금 대기 줄에는 배송지가 없다. 여러 건 출하는 주문마다 ship API를 반복 호출한다.
import {
  ApiError,
  CARRIERS,
  carrierLabel,
  allPages,
  orders,
  type Carrier,
  type ProducerOrder,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Icon,
  Input,
  Notice,
  Radio,
  Screen,
  Scroll,
  Segmented,
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
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { isConnectionError, useSession } from "../lib/session";
import { LoadError, errMsg } from "../lib/views";

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
const who = (o: ProducerOrder) =>
  `${o.recipientName} · ${o.optionLabel} × ${o.quantity}`;
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
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 줄 안 미승인 칸(DEV-68). 한 번에 한 줄만 펼친다
  const [reject, setReject] = useState<Reject | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [cancelOrder, setCancelOrder] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
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

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

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
    else if (ok) toast(`${ok}건을 출하로 바꿨어요`);
    await load();
    setBusy(false);
  }

  function openInvoice(o: ProducerOrder) {
    setInvoiceFor(o);
    setDraft(invoices[o.orderId] ?? { carrier: null, no: "" });
    setInvoiceError(null);
  }

  // 시트에서 저장하면 그 주문을 고르고 토스트(SCR-29 버튼 동작). 서버에는 출하할 때 함께 보낸다.
  function saveInvoice() {
    if (!invoiceFor) return;
    const no = draft.no.trim();
    if (no.length > 50) return setInvoiceError("송장 번호는 50자까지예요");
    if (no && !draft.carrier) return setInvoiceError("택배사를 골라 주세요");
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

  // 입금 승인(AC-09-8)·환불 완료(AC-17-7): 확인 창 없이 줄에서 바로
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

  // 기존 송장 시트의 택배사 고르기와 같은 칸
  const choice = (
    label: string,
    on: boolean,
    onPress: () => void,
  ) => (
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
            flexBasis: "45%",
            flexGrow: 1,
            minHeight: 48,
            paddingHorizontal: 12,
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
      <T variant="sub" weight="semibold" muted={!on} style={{ textAlign: "center" }}>
        {label}
      </T>
    </Pressable>
  );

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
            minHeight: 52,
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
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="미승인하면"
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
            >
              {choice("입금 대기로 두기", !cancelOrder, () =>
                setCancelOrder(false),
              )}
              {choice("주문 취소", cancelOrder, () => setCancelOrder(true))}
            </View>
          </>
        ) : null}
        <T variant="sub" weight="semibold">
          미승인 사유
        </T>
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
            placeholder="소비자에게 그대로 보여요"
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
              ? "주문이 취소되고 물량이 돌아가요. 사유는 소비자에게 그대로 보여요."
              : "주문은 입금 대기로 남고, 소비자가 다시 입금했다고 알릴 수 있어요. 사유는 소비자에게 그대로 보여요."
            : "환불 송금 대기로 남아요. 보낸 뒤 「승인」을 눌러 주세요. 사유는 소비자에게 그대로 보여요."}
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

  return (
    <Screen>
      <HeaderBar
        title={SHIP_TABS.has(tab) ? "배송 현황" : "주문 현황"}
        onBack={back}
      />
      <Scroll bottom={tab === "PREPARING" && data.preparing.length ? 170 : 60}>
        {error ? <LoadError error={error} onRetry={load} /> : null}
        {notice ? (
          <Notice
            title={notice}
            style={{ marginHorizontal: 20, marginTop: 16 }}
          />
        ) : null}
        <ScrollView
          horizontal
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: tokens.space.md }}
        >
          <View style={{ minWidth: 640 }}>
            <Segmented
              options={[
                { value: "all", label: `전체 ${data.all.length}` },
                {
                  value: "AWAITING_DEPOSIT",
                  label: `입금 대기 ${data.awaiting.length}`,
                },
                { value: "RESERVED", label: `예약 ${data.reserved.length}` },
                {
                  value: "PREPARING",
                  label: `출하 준비 ${data.preparing.length}`,
                },
                { value: "SHIPPED", label: `출하 ${data.shipped.length}` },
                { value: "REFUNDED", label: `환불 ${data.refunded.length}` },
              ]}
              value={tab}
              onChange={setTab}
            />
          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          {list.length === 0 ? (
            <T variant="sub" muted style={{ paddingVertical: 24 }}>
              {tab === "PREPARING"
                ? "출하 준비 주문이 없어요."
                : tab === "AWAITING_DEPOSIT"
                  ? "입금을 기다리는 주문이 없어요."
                  : tab === "REFUNDED"
                    ? "환불할 주문이 없어요."
                    : "해당 상태의 주문이 없어요."}
            </T>
          ) : null}
          {list.map((o) => {
            const sel = picked.includes(o.orderId);
            const inv =
              tab === "PREPARING"
                ? invoices[o.orderId]
                : { carrier: o.carrier, no: o.trackingNumber ?? "" };
            const filled = !!(inv?.carrier || inv?.no);
            const awaiting = o.status === "AWAITING_DEPOSIT";
            const refunded = o.status === "REFUNDED";
            const info = (
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <T variant="sub" muted numberOfLines={1}>
                  {o.orderNo}
                  {awaiting
                    ? o.depositDueAt && Date.parse(o.depositDueAt) <= Date.now()
                      ? " · 기한 지남"
                      : ` · 기한 ${deadline(o.depositDueAt)}`
                    : ""}
                </T>
                <T variant="body" weight="semibold">
                  {who(o)}
                </T>
                {awaiting ? (
                  // 입금 전에는 배송지 대신 금액·입금자명(R-15, DEV-68)
                  <T variant="body">
                    {won(o.totalAmount)} · 입금자명{" "}
                    <T variant="body" weight="bold">
                      {o.orderNo}
                    </T>
                  </T>
                ) : refunded ? (
                  <T variant="body">
                    {won(o.totalAmount)} · 입금했던 계좌로 돌려보내요
                  </T>
                ) : (
                  <T variant="sub" muted>
                    {[o.address, o.addressDetail].filter(Boolean).join(" ")}
                    {o.deliveryNote ? " · 메모 있음" : ""}
                  </T>
                )}
                {awaiting && o.depositReportedAt ? (
                  <T variant="sub" muted>
                    소비자가 입금했다고 알렸어요
                  </T>
                ) : null}
                {o.deliveryNote ? (
                  <T variant="sub" muted>
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
                        onPress={() => void approve(o)}
                      />
                    </View>
                  )
                ) : (
                  <T variant="sub" weight="semibold" muted={!filled}>
                    {tab === "PREPARING"
                      ? filled
                        ? `${invoiceText(inv?.carrier, inv?.no)} ›`
                        : "택배사·송장 번호 넣기 ›"
                      : o.status === "RESERVED"
                        ? "예약 완료"
                        : invoiceText(inv?.carrier, inv?.no)}
                  </T>
                )}
              </View>
            );
            return (
              <View
                key={o.orderId}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 4,
                  borderTopWidth: 1,
                  borderTopColor: tokens.color.border,
                  minHeight: tokens.height.listRowProducer,
                }}
              >
                {tab === "PREPARING" ? (
                  <>
                    {/* 체크 칸: 보이는 24, 누르는 영역 48 */}
                    <Pressable
                      accessibilityRole="checkbox"
                      disabled={busy}
                      aria-checked={sel}
                      accessibilityLabel={`${o.orderNo} ${who(o)} 고르기`}
                      onPress={() =>
                        setPicked((p) =>
                          sel
                            ? p.filter((x) => x !== o.orderId)
                            : [...p, o.orderId],
                        )
                      }
                      style={(st) =>
                        [
                          {
                            width: 48,
                            minHeight: 48,
                            paddingTop: 16,
                            alignItems: "flex-start",
                            justifyContent: "flex-start",
                          },
                          (st as { focused?: boolean }).focused && focusRing,
                        ] as never
                      }
                    >
                      <View
                        style={[
                          {
                            width: 24,
                            height: 24,
                            borderRadius: 8,
                            alignItems: "center",
                            justifyContent: "center",
                          },
                          sel
                            ? { backgroundColor: tokens.color.text }
                            : {
                                borderWidth: 1.5,
                                borderColor: tokens.color.textMuted,
                              },
                        ]}
                      >
                        {sel ? (
                          <Icon name="check" size={16} color="#FFFFFF" />
                        ) : null}
                      </View>
                    </Pressable>
                    {/* 줄 전체를 누르면 택배사·송장 시트(D-07) */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${o.orderNo} ${who(o)}, ${filled ? invoiceText(inv?.carrier, inv?.no) : "택배사·송장 번호 넣기"}`}
                      disabled={busy}
                      onPress={() => openInvoice(o)}
                      style={(st) =>
                        [
                          {
                            flex: 1,
                            paddingVertical: 16,
                            flexDirection: "row",
                          },
                          (st as { focused?: boolean }).focused && focusRing,
                        ] as never
                      }
                    >
                      {info}
                    </Pressable>
                  </>
                ) : (
                  <View
                    style={{
                      flex: 1,
                      paddingVertical: 16,
                      flexDirection: "row",
                    }}
                  >
                    {info}
                  </View>
                )}
              </View>
            );
          })}
          {list.length ? (
            <View
              style={{ borderTopWidth: 1, borderTopColor: tokens.color.border }}
            />
          ) : null}
          <T variant="sub" muted style={{ marginTop: 16 }}>
            {tab === "AWAITING_DEPOSIT"
              ? "통장에서 입금자명(주문 번호)과 금액을 확인하고 「승인」을 누르면 소비자에게 예약 완료로 보여요. 맞지 않으면 「미승인」에 사유를 적어 주세요. 24시간 안에 입금이 없으면 자동으로 취소돼요."
              : tab === "REFUNDED"
                ? "환불은 소비자가 입금했던 계좌로 직접 보내 주세요. 보낸 뒤 「승인」을 누르면 소비자 주문 상세에 환불 완료로 보여요. 보내지 못하면 「미승인」에 사유를 적어 주세요."
                : "배송 완료는 farmclub이 확인해서 바꿔요."}
          </T>
        </View>
      </Scroll>

      {tab === "PREPARING" && data.preparing.length ? (
        <BottomBar
          summary={
            chosen.length
              ? `${chosen.length}건 골랐어요 · 송장 ${withInvoice}건 입력`
              : "보낸 주문을 골라 주세요"
          }
        >
          <Button
            label={
              chosen.length
                ? `${chosen.length}건 출하로 바꾸기`
                : "출하로 바꾸기"
            }
            size="producer"
            disabled={!chosen.length || busy || !!error}
            onPress={() => setConfirm(true)}
          />
        </BottomBar>
      ) : null}

      {/* 택배사·송장 번호(선택) — design: s-29-invoice */}
      <Sheet visible={!!invoiceFor} onClose={() => setInvoiceFor(null)}>
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
                      height: 48,
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
          value={draft.no}
          onChangeText={(v) => {
            setDraft((d) => ({ ...d, no: v }));
            setInvoiceError(null);
          }}
          placeholder="예: 6012-3456-7890"
          error={invoiceError ?? undefined}
          hint="송장 번호를 넣으면 소비자가 주문 상세에서 배송을 조회할 수 있어요."
          maxLength={50}
        />
        <Button
          label="저장"
          size="producer"
          onPress={saveInvoice}
          style={{ marginTop: 8 }}
        />
      </Sheet>

      {/* 출하 확인 */}
      <Sheet
        visible={confirm}
        onClose={() => { if (!busy) setConfirm(false); }}
      >
        <T variant="heading">{chosen.length}건을 출하로 바꿀까요?</T>
        <View>
          {chosen.map((o, i) => (
            <View
              key={o.orderId}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
                minHeight: 52,
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
        <T variant="sub">출하로 바꾸면 소비자는 더 이상 취소할 수 없어요.</T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="아니요"
            disabled={busy}
            variant="secondary"
            size="producer"
            style={{ flex: 1 }}
            onPress={() => setConfirm(false)}
          />
          <Button
            label={`${chosen.length}건 출하로 바꾸기`}
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
