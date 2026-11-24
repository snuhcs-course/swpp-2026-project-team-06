import { TrackingNumberInput } from "../lib/TrackingNumberInput";
// SCR-29 주문·출하 처리 (FEAT-17, FEAT-09 AC-09-8 입금 확인·AC-09-9 미승인, AC-17-7 환불 송금·AC-17-8 미승인, R-07·15·19·28, DEV-68) — design: p-scr-29, DEV-68 보드
// 입금 승인은 확인 시트 후 처리하고 환불 완료는 줄에서 처리한다. 미승인은 줄 안에 사유(필수) 칸이 펼쳐진다.
// 받는 사람 실명·전체 주소는 이 화면에서만 보인다(배송 목적, R-15). 입금 대기 줄에는 배송지가 없다. 여러 건 출하는 주문마다 ship API를 반복 호출한다.
// DEV-466: 주문 한 건을 카드 하나로 보인다(OrderCard). 상태 칩은 서버가 허용하는 다음 처리와 직전 처리 되돌리기(DEV-455)만 연다.
import {
  ApiError,
  CARRIERS,
  carrierLabel,
  formatTrackingNumber,
  allPages,
  catalog,
  messaging,
  orders,
  newIdempotencyKey,
  serverNow,
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
import { depositCheckMessage, depositorName, orderItem, orderWho } from "../lib/orderWho";
import { goBackOr } from "../lib/nav";
import { setChatDraft } from "../lib/chatDraft";
import { OrderCard, orderTime, type CardAction } from "../lib/OrderCard";
import { track, type FormErrorCode } from "@farmclub/analytics";

/** 출하 처리 화면의 오류 안내 위치·종류만 보낸다(글자 없음, DEV-312) */
const shownError = (code: FormErrorCode) => track("form_error_shown", { screen: "ship", code });

type Data = {
  awaiting: ProducerOrder[];
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
  "입금자명이 달라요",
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
    | "PREPARING"
    | "SHIPPED"
    | "REFUNDED";
  const tab: Tab =
    status === "all" ||
    status === "AWAITING_DEPOSIT" ||
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
  // DEV-466 카드: 검색어(주문 번호·이름·입금자명·송장), 펼친 상세, 상품 사진, 상태 변경 시트
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [statusFor, setStatusFor] = useState<ProducerOrder | null>(null);
  // DEV-455 실행 취소: 최근 처리 목록 → 확인 → 되돌리기. 같은 처리의 재시도는 같은 Idempotency-Key
  const [undoList, setUndoList] = useState(false);
  const [undoFor, setUndoFor] = useState<ProducerOrder | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const undoKeys = useRef(new Map<string, string>());
  // 상태 칩 ‘출하로’는 그 주문만 골라 확인을 연다. 닫거나 출하한 뒤 이전 선택을 되살린다
  const restorePick = useRef<string[] | null>(null);
  const closeConfirm = () => {
    setConfirm(false);
    if (restorePick.current) setPicked(restorePick.current);
    restorePick.current = null;
  };
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

  // 카드의 상품 사진은 내 상품 목록의 대표 사진을 쓴다(홈 화면과 같은 방식). 못 받으면 기본 사진
  useEffect(() => {
    let alive = true;
    allPages((cursor) => catalog.mine({ limit: 50, cursor }))
      .then((items) => {
        if (alive) setPhotos(Object.fromEntries(items.map((p) => [p.productId, p.photo])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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
        : tab === "PREPARING"
          ? data.preparing
          : tab === "REFUNDED"
            ? data.refunded
            : data.shipped;
  // 검색: 주문 번호·이름·입금자명·송장 번호. 송장은 하이픈 없이 숫자만 넣어도 찾는다
  const needle = query.trim().toLowerCase();
  const digits = needle.replace(/[\s-]/g, "");
  const matches = (o: ProducerOrder) => {
    if (!needle) return true;
    const fields = [o.orderNo, o.recipientName, o.depositCode, o.trackingNumber, invoices[o.orderId]?.no]
      .filter((v): v is string => !!v)
      .map((v) => v.toLowerCase());
    return fields.some((v) => v.includes(needle) || (!!digits && v.replace(/[\s-]/g, "").includes(digits)));
  };
  const shown = list.filter(matches);
  // 출하 대상은 지금 보이는(검색에 걸린) 배송 대기 주문 중 고른 것만. 검색에 가려진 선택은 출하하지 않는다
  const chosen = data.preparing.filter((o) => picked.includes(o.orderId) && matches(o));
  const hiddenPicked = data.preparing.filter((o) => picked.includes(o.orderId) && !matches(o)).length;

  // 직전 처리 되돌리기(DEV-455): 서버가 지금 상태와 기록이 맞는지 다시 확인한다. 409면 이유를 보여 주고 다시 그린다
  async function undoOne(o: ProducerOrder) {
    const action = o.undoAction;
    if (busy || !action) return;
    let key = undoKeys.current.get(action.actionId);
    if (!key) {
      key = newIdempotencyKey();
      undoKeys.current.set(action.actionId, key);
    }
    setBusy(true);
    setUndoError(null);
    try {
      await orders.undoProducerAction(o.orderId, action.actionId, key);
      undoKeys.current.delete(action.actionId);
      setInvoices((old) => {
        const next = { ...old };
        delete next[o.orderId];
        return next;
      });
      setUndoFor(null);
      toast(`${o.orderNo} ‘${action.label}’ 전으로 되돌렸어요 · ${ORDER_STATUS[action.previousStatus]}`);
      await load();
    } catch (e) {
      // 연결이 끊기면 같은 키로 다시 시도한다(서버가 이미 처리했어도 한 번만 되돌린다)
      if (isConnectionError(e)) failToast(e, () => void undoOne(o));
      else if (e instanceof ApiError && (e.status === 409 || e.status === 404)) {
        // 그사이 다른 처리가 이어졌으면 시트를 닫고 이유와 최신 상태를 보인다
        undoKeys.current.delete(action.actionId);
        setUndoFor(null);
        setNotice(errMsg(e));
        await load();
      } else {
        undoKeys.current.delete(action.actionId);
        setUndoError(errMsg(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function shipAll() {
    if (busy || !chosen.length) return;
    setBusy(true);
    setNotice(null);
    let ok = 0;
    let conflicted = 0;
    let lost: unknown = null; // 연결 문제로 못 바꾼 주문은 고른 채로 두고 다시 시도
    let failedShown = false;
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
        // 주문마다 처리 시각을 남긴다(송장 번호는 보내지 않음, DEV-312)
        track("order_shipped", { orderId: o.orderId, hasCarrier: !!inv?.carrier });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) conflicted += 1;
        else {
          left.push(o.orderId);
          if (isConnectionError(e)) lost = e;
          else {
            failedShown = true;
            setNotice(errMsg(e));
          }
        }
      }
    }
    // 안내는 한 번 보이므로 실패가 여러 건이어도 한 번만 센다(DEV-312)
    if (failedShown && !conflicted) shownError("other"); // 409 안내가 덮으면 보이지 않은 안내라 세지 않는다
    setConfirm(false);
    const before = restorePick.current;
    const shippedIds = chosen.map((o) => o.orderId).filter((id) => !left.includes(id));
    if (lost) {
      // 연결이 끊긴 건만 다시 시도한다. 이전 선택은 시트를 닫거나 출하를 마친 뒤 되살린다
      setPicked(left);
    } else {
      restorePick.current = null;
      setPicked(before ? [...new Set([...before.filter((id) => !shippedIds.includes(id)), ...left])] : left);
    }
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
    const no = formatTrackingNumber(draft.carrier, draft.no.trim());
    if (no.length > 50) {
      shownError("tracking_too_long");
      return setInvoiceError("송장 번호는 50자까지예요");
    }
    if ((no || invoiceFor.status === "SHIPPED") && !draft.carrier) {
      shownError("carrier_required");
      return setInvoiceError("택배사를 골라 주세요");
    }
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
        track("invoice_saved", { orderId: invoiceFor.orderId, hasCarrier: true, afterShipped: true });
        setInvoiceFor(null);
        toast("송장을 수정했어요");
        await load();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setInvoiceFor(null);
          setNotice(errMsg(e));
          await load();
        } else {
          if (!isConnectionError(e)) shownError("other");
          setInvoiceError(errMsg(e));
        }
      } finally { setBusy(false); }
      return;
    }
    setInvoices((m) => ({
      ...m,
      [invoiceFor.orderId]: { carrier: draft.carrier, no },
    }));
    if (!picked.includes(invoiceFor.orderId))
      setPicked((p) => [...p, invoiceFor.orderId]);
    // 출하 전 송장은 화면에만 저장한다(서버에는 출하 때 함께). 송장 번호는 보내지 않는다
    track("invoice_saved", { orderId: invoiceFor.orderId, hasCarrier: !!draft.carrier, afterShipped: false });
    setInvoiceFor(null);
    toast("송장을 저장했어요");
  }

  // 승인·미승인 공통: 409면 최신 상태로 다시 그린다
  async function act(run: () => Promise<unknown>, done: string, retry: () => void, onDone?: () => void) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await run();
      onDone?.();
      setReject(null);
      toast(done);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setReject(null);
        setNotice("이미 상태가 바뀌었어요. 최신 상태로 다시 보여 드려요.");
        await load();
      } else if (isConnectionError(e)) failToast(e, retry);
      else if (e instanceof ApiError && e.details.fields?.reason) {
        shownError("reason_required");
        setReasonError(String(e.details.fields.reason));
      } else {
        shownError("other");
        setNotice(errMsg(e));
      }
    } finally {
      setBusy(false);
    }
  }

  // 입금 승인(AC-09-8)은 확인 후, 환불 완료(AC-17-7)는 줄에서 처리
  const approve = (o: ProducerOrder) =>
    o.status === "AWAITING_DEPOSIT"
      ? act(
          () => orders.confirmDeposit(o.orderId),
          `${o.orderNo} 입금을 승인했어요 · 배송 대기`,
          () => void approve(o),
          () => track("deposit_decided", { orderId: o.orderId, decision: "approved" }),
        )
      : act(
          () => orders.refundSettled(o.orderId),
          `${o.orderNo} 환불 완료로 기록했어요`,
          () => void approve(o),
        );

  // 입금 대기 줄 ‘채팅하기’(DEV-342): 그 주문의 소비자와 대화를 열고 확인 글을 입력칸에만 넣는다(보내지 않음)
  async function chatAbout(o: ProducerOrder) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const thread = await messaging.producerStartForOrder(o.orderId);
      setChatDraft(thread.consumerId, depositCheckMessage(o));
      router.push({ pathname: "/chats/[consumerId]", params: { consumerId: thread.consumerId } });
    } catch (e) {
      if (isConnectionError(e)) failToast(e, () => void chatAbout(o));
      else setNotice(errMsg(e, "대화를 열지 못했어요. 다시 눌러 주세요."));
    } finally {
      setBusy(false);
    }
  }

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
    if (!text) {
      shownError("reason_required");
      return setReasonError(
        preset === CUSTOM ? "사유를 적어 주세요" : "미승인 사유를 골라 주세요",
      );
    }
    if (reject?.kind === "deposit")
      return act(
        () => orders.rejectDeposit(o.orderId, text, cancelOrder),
        cancelOrder
          ? `${o.orderNo} 주문을 취소했어요`
          : `${o.orderNo} 미승인 사유를 소비자에게 알렸어요`,
        () => sendReject(o),
        // 사유 글자는 보내지 않고 고른 방식만(DEV-312)
        () => track("deposit_decided", { orderId: o.orderId, decision: "rejected", reasonKind: preset === CUSTOM ? "custom" : "preset", cancelOrder }),
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
    { value: "PREPARING", label: "배송 대기", count: data.preparing.length },
    { value: "SHIPPED", label: "출하", count: data.shipped.length },
    { value: "REFUNDED", label: "환불", count: data.refunded.length },
  ];
  // 탭 안내는 한 줄(DEV-294). 배송 대기·예약(DEV-361)은 전체 선택 줄이 대신한다
  const helper =
    tab === "AWAITING_DEPOSIT"
      ? "입금자명·금액 확인 후 승인 · 24시간 안에 입금이 없으면 자동 취소"
      : tab === "REFUNDED"
        ? "입금했던 계좌로 직접 보낸 뒤 승인"
        : tab === "SHIPPED"
          ? "배송 완료는 farmclub이 확인해서 바꿔요"
          : null;
  const pickTab = tab === "PREPARING";
  const pickedCount = chosen.length;
  const pickable = pickTab ? shown : [];
  const allPicked = pickable.length > 0 && pickable.every((o) => picked.includes(o.orderId));
  const isPicked = (id: string) => picked.includes(id);
  const togglePick = (id: string) =>
    setPicked((ids) => ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]);
  const toggleAll = () =>
    setPicked((ids) => {
      const visible = pickable.map((o) => o.orderId);
      return allPicked ? ids.filter((id) => !visible.includes(id)) : [...new Set([...ids, ...visible])];
    });
  const hasBar = pickTab && data.preparing.length > 0;
  // 상태 칩 시트의 선택지: 서버가 받는 다음 처리와, 서버가 알려 준 직전 처리 되돌리기(DEV-455)만
  type StatusOption = { label: string; hint: string; onPress: () => void };
  function statusOptions(o: ProducerOrder): StatusOption[] {
    const close = (next: () => void) => () => {
      setStatusFor(null);
      next();
    };
    const out: StatusOption[] = [];
    if (o.status === "AWAITING_DEPOSIT") {
      out.push({ label: "배송 대기로", hint: "입금자명·금액을 확인했어요 · 입금 승인", onPress: close(() => setDepositFor(o)) });
      out.push({ label: "미승인", hint: "입금 대기로 두거나 주문을 취소해요", onPress: close(() => openReject(o)) });
    } else if (o.status === "PREPARING") {
      out.push({
        label: "출하로",
        hint: "송장을 확인하고 이 주문을 출하 처리해요",
        onPress: close(() => {
          if (tab !== "PREPARING") setTab("PREPARING");
          restorePick.current = picked;
          setPicked([o.orderId]);
          setConfirm(true);
        }),
      });
    } else if (o.status === "REFUNDED" && !o.refundSettledAt) {
      out.push({ label: "환불 완료로", hint: "입금했던 계좌로 송금을 마쳤어요", onPress: close(() => void approve(o)) });
      out.push({ label: "미승인", hint: "아직 송금하지 못한 사유를 알려요", onPress: close(() => openReject(o)) });
    }
    if (o.undoAction) {
      const action = o.undoAction;
      out.push({
        label: `${ORDER_STATUS[action.previousStatus]}로 되돌리기`,
        hint: `방금 한 ‘${action.label}’ 전으로 돌아가요`,
        onPress: close(() => {
          setUndoError(null);
          setUndoFor(o);
        }),
      });
    }
    return out;
  }
  const undoable = data.all
    .filter((o) => o.undoAction)
    .sort((a, b) => b.undoAction!.createdAt.localeCompare(a.undoAction!.createdAt));

  return (
    <Screen>
      <HeaderBar
        title={SHIP_TABS.has(tab) ? "배송 현황" : "주문 현황"}
        onBack={back}
        rightWidth={104}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="실행 취소"
            disabled={busy}
            onPress={() => setUndoList(true)}
            style={(st) =>
              [
                { minHeight: tokens.touchTarget.min, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 },
                (st as { focused?: boolean }).focused && focusRing,
              ] as never
            }
          >
            <Icon name="refund" size={18} color={tokens.color.text} />
            <T variant="sub">실행 취소</T>
          </Pressable>
        }
      />
      <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.sm }}>
        <Input
          accessibilityLabel="주문 검색"
          value={query}
          onChangeText={setQuery}
          placeholder="주문번호 · 이름 · 송장 검색"
        />
      </View>
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
      <View style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <Scroll bottom={hasBar ? 120 : 60}>
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
        <View style={{ paddingHorizontal: tokens.space.gutter, gap: 12, paddingTop: helper || (pickTab && shown.length) ? 0 : 12 }}>
          {pickTab && shown.length ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                minHeight: tokens.height.listRowProducer,
                marginBottom: -4,
              }}
            >
              <Pressable
                accessibilityRole="checkbox"
                aria-checked={allPicked}
                accessibilityLabel="전체 선택"
                disabled={busy}
                onPress={toggleAll}
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
                {shown.length}건 중 {pickedCount}건
                {hiddenPicked ? ` · 검색에 가려진 ${hiddenPicked}건 제외` : ""}
              </T>
            </View>
          ) : null}
          {shown.length === 0 ? (
            <T variant="sub" muted style={{ paddingVertical: tokens.space.lg }}>
              {query.trim()
                ? "찾는 주문이 없어요. 주문 번호·이름·송장 번호를 다시 확인해 주세요"
                : tab === "PREPARING"
                  ? "배송 대기 주문이 없어요"
                  : tab === "AWAITING_DEPOSIT"
                    ? "입금을 기다리는 주문이 없어요"
                    : tab === "REFUNDED"
                      ? "환불할 주문이 없어요"
                      : "해당 상태의 주문이 없어요"}
            </T>
          ) : null}
          {shown.map((o) => {
            const sel = isPicked(o.orderId);
            const inv =
              o.status === "PREPARING"
                ? invoices[o.orderId]
                : { carrier: o.carrier, no: o.trackingNumber ?? "" };
            const filled = !!(inv?.carrier || inv?.no);
            const awaiting = o.status === "AWAITING_DEPOSIT";
            const refunded = o.status === "REFUNDED";
            const canceled = o.status === "CANCELED";
            const open = expanded.includes(o.orderId);
            // 배송 대기 줄의 송장은 그 탭의 고르기·출하 바와 묶여 있어, 전체 탭에서는 그 탭으로 옮긴 뒤 연다(DEV-291)
            const editInvoice = () => {
              if (o.status === "PREPARING" && tab !== "PREPARING") setTab("PREPARING");
              openInvoice(o);
            };
            const showInvoice =
              (o.status === "PREPARING" || o.status === "SHIPPED") &&
              (tab === "all" || tab === "PREPARING" || tab === "SHIPPED");
            const decide = (awaiting || refunded) && !o.refundSettledAt;
            const task = awaiting ? (
              // 입금 전에는 배송지 대신 입금자명(R-15, DEV-68). 통장과 대조할 짧은 코드(DEV-342)
              <>
                <T variant="sub" muted>
                  입금자명{"  "}
                  {/* 닉네임이 들어 있어 녹화에서 값을 가린다(N-05) */}
                  <T variant="sub" weight="semibold" masked>
                    {depositorName(o)}
                  </T>
                </T>
                {/* 기한 지남은 기기 시계가 아니라 서버 시각으로 판단한다(DEV-229, R-28) */}
                <T variant="caption" muted>
                  {o.depositDueAt && Date.parse(o.depositDueAt) <= serverNow()
                    ? "입금 기한 지남"
                    : `입금 기한 ${deadline(o.depositDueAt)}`}
                </T>
                {o.depositReportedAt ? (
                  <T variant="caption" muted>소비자가 입금했다고 알렸어요</T>
                ) : null}
                {o.depositIssue ? (
                  <T variant="caption" muted>미승인 사유: {o.depositIssue}</T>
                ) : null}
              </>
            ) : o.status === "PREPARING" || o.status === "SHIPPED" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
                <Icon name="truck" size={18} color={tokens.color.textMuted} />
                {filled ? (
                  <T variant="sub" numberOfLines={1} style={{ flexShrink: 1 }}>
                    <T variant="sub" muted>{carrierLabel(inv?.carrier)}</T>
                    {inv?.no ? (
                      <T variant="sub" weight="semibold">{`  ${inv.no}`}</T>
                    ) : null}
                  </T>
                ) : (
                  <T variant="sub" muted>송장 미등록</T>
                )}
              </View>
            ) : refunded ? (
              <>
                <T variant="sub" muted={!o.refundSettledAt} weight={o.refundSettledAt ? "semibold" : "regular"}>
                  {o.refundSettledAt ? `${md(o.refundSettledAt)} 송금 완료` : "입금했던 계좌로 돌려보내요"}
                </T>
                {o.refundIssue ? (
                  <T variant="caption" muted>미승인 사유: {o.refundIssue}</T>
                ) : null}
              </>
            ) : canceled ? (
              <T variant="sub" muted>취소된 주문이에요</T>
            ) : null;
            const body = decide ? (
              reject?.orderId === o.orderId ? (
                rejectForm(o)
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
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
            ) : o.status === "PREPARING" ? (
              // 배송 대기 목록: 받는 곳·배송 예정 기간(AC-17-3). 연락처·메모는 주문 상세
              <View style={{ gap: 2 }}>
                <T variant="sub" muted numberOfLines={1} masked>
                  {[o.address, o.addressDetail].filter(Boolean).join(" ")}
                </T>
                {o.deliveryWindow ? (
                  <T variant="caption" muted>배송 예정 {o.deliveryWindow.start} ~ {o.deliveryWindow.end}</T>
                ) : null}
              </View>
            ) : null;
            const hidden = awaiting || !o.address;
            const detail = open ? (
              hidden ? (
                <T variant="sub" muted>
                  {awaiting ? "입금을 확인하면 배송 정보가 보여요" : "배송 정보는 보호돼요"}
                </T>
              ) : (
                <>
                  <T variant="caption" muted>배송지</T>
                  <T variant="sub" masked>
                    {o.recipientName} · {o.recipientPhone}
                  </T>
                  <T variant="sub" masked>
                    {[o.postalCode && `(${o.postalCode})`, o.address, o.addressDetail].filter(Boolean).join(" ")}
                  </T>
                  {o.deliveryNote ? (
                    <T variant="sub" muted>메모: {o.deliveryNote}</T>
                  ) : null}
                </>
              )
            ) : null;
            const actions: CardAction[] = [
              {
                label: open ? "상세 접기" : "주문 상세",
                accessibilityLabel: `${o.orderNo} ${open ? "상세 접기" : "주문 상세"}`,
                chevron: open ? "up" : "down",
                onPress: () =>
                  setExpanded((ids) =>
                    ids.includes(o.orderId) ? ids.filter((id) => id !== o.orderId) : [...ids, o.orderId],
                  ),
              },
            ];
            if (awaiting)
              actions.push({
                label: "채팅하기",
                accessibilityLabel: `${o.orderNo} 채팅하기`,
                onPress: () => void chatAbout(o),
              });
            if (showInvoice)
              actions.push(
                filled
                  ? { label: "송장 수정", accessibilityLabel: `${o.orderNo} 송장 수정`, onPress: editInvoice }
                  : { label: "송장 입력", accessibilityLabel: `${o.orderNo} ${who(o)} 송장 입력`, onPress: editInvoice },
              );
            return (
              <OrderCard
                key={o.orderId}
                order={o}
                photo={photos[o.productId]}
                busy={busy}
                statusLabel={refunded && o.refundSettledAt ? "환불 완료" : undefined}
                onStatus={statusOptions(o).length ? () => setStatusFor(o) : undefined}
                select={
                  pickTab ? (
                    // 체크 칸: 보이는 24, 누르는 영역 48(DEV-294)
                    <Pressable
                      accessibilityRole="checkbox"
                      disabled={busy}
                      aria-checked={sel}
                      accessibilityLabel={`${o.orderNo} ${who(o)} 고르기`}
                      onPress={() => togglePick(o.orderId)}
                      style={(st) =>
                        [
                          { width: 48, height: 48, marginLeft: -12, alignItems: "center", justifyContent: "center" },
                          (st as { focused?: boolean }).focused && focusRing,
                        ] as never
                      }
                    >
                      <Box on={sel} />
                    </Pressable>
                  ) : undefined
                }
                task={task}
                body={body}
                detail={detail}
                actions={actions}
              />
            );
          })}
        </View>
      </Scroll>
      </View>

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
                  setDraft((d) => {
                    const carrier = on ? null : c.code;
                    return { ...d, carrier, no: formatTrackingNumber(carrier, d.no) };
                  });
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
        <TrackingNumberInput
          carrier={draft.carrier}
          value={draft.no}
          editable={!busy}
          onChange={no => {
            setDraft(d => ({ ...d, no }));
            setInvoiceError(null);
          }}
          error={invoiceError ?? undefined}
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
        {/* 통장의 ‘받는 분 통장 표시’와 대조할 입금자명을 맨 위에(DEV-342) */}
        {depositFor ? <View style={{ gap: 8 }}>
          <T>
            입금자명{" "}
            <T weight="bold" masked>{depositorName(depositFor)}</T>
          </T>
          <T>{who(depositFor)}</T>
          <T>{won(depositFor.totalAmount)}</T>
          <T variant="sub" muted>주문 번호 {depositFor.orderNo}</T>
        </View> : null}
        <T variant="sub" muted>승인하면 배송 대기로 옮겨져요</T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="닫기" variant="secondary" disabled={busy} style={{ flex: 1 }} onPress={() => setDepositFor(null)} />
          <Button label="확인 · 입금 승인" loading={busy} disabled={busy} style={{ flex: 2 }} onPress={async () => {
            if (!depositFor) return;
            await approve(depositFor);
            setDepositFor(null);
          }} />
        </View>
      </Sheet>

      {/* 상태 칩 → 상태 변경(DEV-466). 어떤 주문인지 다시 보여 준 뒤 다음 처리를 고른다 */}
      <Sheet visible={!!statusFor} onClose={() => { if (!busy) setStatusFor(null); }}>
        <T variant="heading">주문 상태 변경</T>
        {statusFor ? (
          <>
            <OrderIdentity o={statusFor} />
            <T variant="sub" muted>
              지금 상태 · {ORDER_STATUS[statusFor.status]}
            </T>
            <View accessibilityRole="list" style={{ gap: tokens.space.sm }}>
              {statusOptions(statusFor).map((opt) => (
                <Pressable
                  key={opt.label}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  disabled={busy}
                  onPress={opt.onPress}
                  style={(st) =>
                    [
                      {
                        minHeight: tokens.height.button,
                        paddingHorizontal: tokens.space.md,
                        paddingVertical: 12,
                        borderRadius: tokens.radius.sm,
                        borderWidth: 1,
                        borderColor: tokens.color.border,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: tokens.space.sm,
                      },
                      (st as { focused?: boolean }).focused && focusRing,
                    ] as never
                  }
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T weight="semibold">{opt.label}</T>
                    <T variant="caption" muted>{opt.hint}</T>
                  </View>
                  <Icon name="chevron" size={18} color={tokens.color.textMuted} />
                </Pressable>
              ))}
            </View>
            <T variant="caption" muted>배송 완료는 farmclub이 배송 결과를 확인해서 바꿔요</T>
          </>
        ) : null}
        <Button label="닫기" variant="secondary" disabled={busy} onPress={() => setStatusFor(null)} />
      </Sheet>

      {/* 실행 취소(DEV-455): 서버가 되돌릴 수 있다고 알려 준 최근 처리만 */}
      <Sheet visible={undoList} onClose={() => { if (!busy) setUndoList(false); }}>
        <T variant="heading">최근 처리 되돌리기</T>
        {undoable.length ? (
          <>
            <T variant="sub" muted>되돌릴 처리를 고른 뒤 내용을 확인해 주세요</T>
            <View>
              {undoable.slice(0, 10).map((o, i) => (
                <Pressable
                  key={o.orderId}
                  accessibilityRole="button"
                  accessibilityLabel={`${o.orderNo} ${o.undoAction!.label} 되돌리기`}
                  disabled={busy}
                  onPress={() => {
                    setUndoList(false);
                    setUndoError(null);
                    setUndoFor(o);
                  }}
                  style={(st) =>
                    [
                      {
                        minHeight: tokens.height.rowTwoLine,
                        paddingVertical: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        borderTopWidth: i ? 1 : 0,
                        borderTopColor: tokens.color.border,
                      },
                      (st as { focused?: boolean }).focused && focusRing,
                    ] as never
                  }
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <T weight="semibold">{o.undoAction!.label}</T>
                    <T variant="sub" muted numberOfLines={1} masked>
                      {o.recipientName} · {orderItem(o)}
                    </T>
                    <T variant="caption" muted>
                      {o.orderNo} · {orderTime(o.undoAction!.createdAt)}
                    </T>
                  </View>
                  <Icon name="chevron" size={18} color={tokens.color.textMuted} />
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <T variant="sub" muted>
            되돌릴 수 있는 처리가 없어요. 입금 승인·미승인·출하·환불 표시를 하면 그 직후에 여기서 되돌릴 수 있어요.
          </T>
        )}
        <Button label="닫기" variant="secondary" disabled={busy} onPress={() => setUndoList(false)} />
      </Sheet>

      <Sheet visible={!!undoFor} onClose={() => { if (!busy) setUndoFor(null); }}>
        <T variant="heading">이 처리를 되돌릴까요?</T>
        {undoFor?.undoAction ? (
          <>
            <OrderIdentity o={undoFor} />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                minHeight: tokens.height.button,
                paddingHorizontal: tokens.space.md,
                borderRadius: tokens.radius.sm,
                borderWidth: 1,
                borderColor: tokens.color.border,
              }}
            >
              <T muted>{ORDER_STATUS[undoFor.status]}</T>
              <Icon name="forward" size={18} color={tokens.color.textMuted} />
              <T weight="semibold" color={tokens.color.accent}>
                {ORDER_STATUS[undoFor.undoAction.previousStatus]}
              </T>
            </View>
            <T variant="sub" muted>
              ‘{undoFor.undoAction.label}’ 전으로 앱의 처리 기록만 되돌려요. 실제 입금·송금이나 택배 발송은 취소되지 않아요.
            </T>
          </>
        ) : null}
        {undoError ? <T variant="sub" color={tokens.color.error}>{undoError}</T> : null}
        <View style={{ flexDirection: "row", gap: tokens.space.sm }}>
          <Button label="닫기" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => setUndoFor(null)} />
          <Button
            label="되돌리기"
            style={{ flex: 2 }}
            disabled={busy || !undoFor?.undoAction}
            loading={busy}
            onPress={() => undoFor && void undoOne(undoFor)}
          />
        </View>
      </Sheet>

      {/* 출하 확인 */}
      <Sheet
        visible={confirm}
        onClose={() => { if (!busy) closeConfirm(); }}
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
            onPress={closeConfirm}
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

/** 시트 맨 위의 대상 주문: 이름 · 주문 번호 · 상품 · 금액(같은 이름의 다른 주문과 헷갈리지 않게) */
function OrderIdentity({ o }: { o: ProducerOrder }) {
  return (
    <View style={{ padding: tokens.space.md, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.surface, gap: 2 }}>
      <T variant="heading" weight="semibold" masked numberOfLines={1}>
        {o.recipientName}
      </T>
      <T variant="caption" muted>
        {o.orderNo} · {orderTime(o.createdAt)}
      </T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginTop: tokens.space.sm }}>
        <T variant="sub" numberOfLines={1} style={{ flex: 1 }}>
          {orderItem(o)}
        </T>
        <T weight="bold">{won(o.totalAmount)}</T>
      </View>
    </View>
  );
}
