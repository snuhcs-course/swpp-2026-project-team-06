// SCR-29 주문·출하 처리 (FEAT-17, FEAT-09 AC-09-8 입금 확인, AC-17-7 환불 송금, R-07·15·19·28, DEV-68) — design: p-scr-29, DEV-68 보드
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
  // 입금 확인 시트(DEV-68): 통장과 대조한 뒤 누른다
  const [depositFor, setDepositFor] = useState<ProducerOrder | null>(null);

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

  // 입금 확인(AC-09-8): 입금 대기 → 예약 완료. 409면 최신 상태로 다시 그린다
  async function confirmDeposit() {
    const o = depositFor;
    if (!o || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await orders.confirmDeposit(o.orderId);
      setDepositFor(null);
      toast(`${o.orderNo} 입금을 확인했어요 · 예약 완료`);
      await load();
    } catch (e) {
      setDepositFor(null);
      if (e instanceof ApiError && e.status === 409) {
        setNotice("이미 상태가 바뀌었어요. 최신 상태로 다시 보여 드려요.");
        await load();
      } else if (isConnectionError(e)) failToast(e, () => setDepositFor(o));
      else setNotice(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // 환불 송금 완료(AC-17-7)
  async function settleRefund(o: ProducerOrder) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await orders.refundSettled(o.orderId);
      toast("송금 완료로 표시했어요");
      await load();
    } catch (e) {
      if (isConnectionError(e)) failToast(e, () => void settleRefund(o));
      else {
        setNotice(errMsg(e));
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

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
                  {awaiting ? ` · 기한 ${deadline(o.depositDueAt)}` : ""}
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
                {awaiting ? (
                  // 기존 출하 준비 줄의 ‘택배사·송장 번호 넣기 ›’와 같은 글자 링크
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${o.orderNo} 입금 확인`}
                    disabled={busy}
                    onPress={() => setDepositFor(o)}
                    style={{ minHeight: 48, justifyContent: "center" }}
                  >
                    <T variant="sub" weight="semibold">
                      입금 확인 ›
                    </T>
                  </Pressable>
                ) : refunded ? (
                  o.refundSettledAt ? (
                    <T variant="sub" weight="semibold" muted>
                      {md(o.refundSettledAt)} 송금 완료
                    </T>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${o.orderNo} 송금 완료로 표시`}
                      disabled={busy}
                      onPress={() => void settleRefund(o)}
                      style={{ minHeight: 48, justifyContent: "center" }}
                    >
                      <T variant="sub" weight="semibold">
                        송금 완료로 표시 ›
                      </T>
                    </Pressable>
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
                      accessibilityState={{ checked: sel }}
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
              ? "통장에서 입금자명(주문 번호)과 금액을 확인한 뒤 「입금 확인」을 눌러 주세요. 확인하면 소비자에게 예약 완료로 보여요. 24시간 안에 입금이 없으면 자동으로 취소돼요."
              : tab === "REFUNDED"
                ? "환불은 소비자가 입금했던 계좌로 직접 보내 주세요. 보낸 뒤 「송금 완료」를 누르면 소비자 주문 상세에 환불 완료로 보여요."
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
                accessibilityState={{ checked: on }}
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

      {/* 입금 확인 시트(DEV-68 결정 4): 금액·입금자명을 다시 보여 주고 확인한다 */}
      <Sheet
        visible={!!depositFor}
        onClose={() => {
          if (!busy) setDepositFor(null);
        }}
      >
        <T variant="heading">
          {depositFor ? won(depositFor.totalAmount) : ""} 입금을 확인했나요?
        </T>
        {depositFor ? (
          <T variant="sub" muted>
            입금자명 {depositFor.orderNo} · {who(depositFor)}
          </T>
        ) : null}
        <T variant="sub">
          통장에 같은 입금자명과 금액이 들어왔을 때만 눌러 주세요. 확인하면
          소비자에게 예약 완료로 보여요.
        </T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="아니요"
            variant="secondary"
            size="producer"
            disabled={busy}
            style={{ flex: 1 }}
            onPress={() => setDepositFor(null)}
          />
          <Button
            label="입금 확인"
            size="producer"
            style={{ flex: 2 }}
            loading={busy}
            onPress={() => void confirmDeposit()}
          />
        </View>
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
