// SCR-10 주문서 (FEAT-08, R-03 동의 4개 + 제3자 제공은 policy.md 2장 문구, 항목은 ORDER_CONSENT_KEYS) — design: scr-10, s-10-noconsent, s-10-remote, s-10-stagechanged, s-10-noaddr
// 409 안내·버튼은 lib/checkoutConflict.ts(AC-08-8·AC-08-9, DEV-216·DEV-218, 보드 docs/design/proposals/dev-216-checkout-stage-changed.html)
import { track } from "@farmclub/analytics";
import {
  ApiError,
  ORDER_CONSENT_KEYS,
  agreedCount,
  auth,
  catalog,
  newIdempotencyKey,
  orderConsents,
  orders,
  type Address,
  type OrderConsentKey,
  type Recipient,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  Checkbox,
  defaultOptionId,
  HeaderBar,
  Icon,
  Input,
  Notice,
  Photo,
  Screen,
  Scroll,
  Section,
  Sheet,
  useSheetLeave,
  T,
  TestBand,
  md,
  period,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import {
  availabilityConflict,
  clearsOnSelection,
  conflictView,
  mismatchStep,
  recheckedConflict,
  seenValues,
  type CheckoutConflict,
} from "../../../lib/checkoutConflict";
import { useSession } from "../../../lib/session";
import { isNetworkError, useToast } from "../../../lib/toast";
import { LoadError, OptionSheet } from "../../../lib/views";
import { goBackOr } from "../../../lib/nav";

// 예약 전 확인 문구 버전(R-03). DEV-120에서 개인정보 제3자 제공 동의를 더해 올렸다
const CONSENT_VERSION = "policy-2026-10-23";
/** 저장 배송지 한도(서버 ADDRESS_LIMIT) */
const ADDRESS_LIMIT = 50;
const isRemote = (postal: string, address: string) =>
  /^(63|40[0-2]|23[01])/.test(postal) || /(울릉|옹진|도서)/.test(address);
/** policy.md 2장 날짜 표기: "11월 10일~11월 20일" */
const fullPeriod = (a: string, b: string) => `${md(a)}~${md(b)}`;
/** 배송 메모 고르기(쿠팡식 선택 목록 + 직접 입력, DEV-293) */
const MEMO_PRESETS = [
  "문 앞에 놓아 주세요",
  "경비실에 맡겨 주세요",
  "택배함에 넣어 주세요",
  "배송 전에 연락 주세요",
] as const;

export default function Checkout() {
  const params = useLocalSearchParams<{
    productId: string;
    optionId?: string;
    quantity?: string;
    changed?: string;
  }>();
  const router = useRouter();
  const { user, ready, pendingRecipient, setPendingRecipient } = useSession();
  const product = useAsync(
    () => catalog.product(params.productId),
    [params.productId],
  );
  const addresses = useAsync(
    () => (user ? auth.addresses() : Promise.resolve([] as Address[])),
    [user?.userId],
  );

  const [optionId, setOptionId] = useState(params.optionId ?? "");
  const [qty, setQty] = useState(Number(params.quantity ?? 1) || 1);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [memo, setMemo] = useState("");
  const [consents, setConsents] = useState(() => orderConsents(false));
  const [sheet, setSheet] = useState<null | "option" | "address" | "memo">(
    null,
  );
  // 배송 메모를 직접 쓰는 중인지(목록에 없는 글이면 직접 입력칸을 보인다)
  const [memoTyping, setMemoTyping] = useState(false);
  // 동의 항목 본문은 ‘보기’를 눌렀을 때만 펼친다(DEV-293)
  const [openConsent, setOpenConsent] = useState<OrderConsentKey | null>(null);
  // 받는 곳 시트의 ‘새 주소 입력’은 시트를 바로 닫고 배송지 입력으로 간다(DEV-225)
  const sheetLeave = useSheetLeave();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // 409 또는 입금 기한 만료 복귀(SCR-11 → changed=1). 입력값은 어떤 경우에도 지우지 않는다
  const [conflict, setConflict] = useState<CheckoutConflict | null>(() =>
    params.changed ? { reason: "EXPIRED", details: {} } : null,
  );
  // 마지막으로 보낸 '본 값'(다시 확인하기 뒤 가격도 바뀌었는지 비교)
  const sentRef = useRef<ReturnType<typeof seenValues>>(null);
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  // 입금 안내(물량 선점)도 멱등 키로 한 번만(AC-09-3)
  const [depositKey, setDepositKey] = useState(newIdempotencyKey);
  // 이 주문서로 만든 입금 대기 주문(DEV-291). 입금 안내에서 뒤로 와 내용을 바꿔 내면 새 주문을 만들지 않고 이 주문을 알린다
  type Placed = { orderId: string; optionId: string; quantity: number };
  const placedRef = useRef<Placed | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const toast = useToast();
  const addressHref = {
    pathname: "/checkout/[productId]/address" as const,
    params: { productId: params.productId },
  };

  // 로그인 안 했으면 로그인으로, 가입 온보딩이 남았으면 온보딩으로 (주문은 둘 다 필요, AC-01-12).
  // 화면이 보일 때(처음 열 때·돌아올 때)만 본다. 보는 중이나 스택 아래에서 로그아웃·토큰 만료로 user가 바뀌면
  // 세션이 이동을 맡는다(로그아웃 → 홈, 401 → 로그인). 여기서도 바꾸면 끝난 주문서가 로그인 next로 남는다(DEV-222)
  const userRef = useRef(user);
  userRef.current = user;
  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      const u = userRef.current;
      const here = `/checkout/${params.productId}?optionId=${encodeURIComponent(optionId)}&quantity=${qty}`;
      if (!u) router.replace({ pathname: "/login", params: { next: here } });
      else if (u.needsOnboarding)
        router.replace({ pathname: "/onboarding", params: { next: here } });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, params.productId, router]),
  );

  // 새 주소 입력에서 돌아오면 그 값을 쓴다. 아니면 기본 배송지
  useFocusEffect(
    useCallback(() => {
      if (pendingRecipient) {
        const { saveAddress: save, ...r } = pendingRecipient;
        setRecipient(r);
        setSaveAddress(!!save);
        setPendingRecipient(null);
      }
    }, [pendingRecipient, setPendingRecipient]),
  );
  useEffect(() => {
    if (!recipient && addresses.data?.length) {
      const a = addresses.data.find((x) => x.isDefault) ?? addresses.data[0];
      setRecipient(a);
    }
  }, [addresses.data, recipient]);

  const p = product.data;
  // 구매 퍼널 2단계: 로그인한 사용자에게 주문서가 열림(트래킹 플랜 checkout_started, DEV-71)
  const startedId = user && p ? p.productId : null;
  useEffect(() => {
    if (startedId) track("checkout_started", { productId: startedId });
  }, [startedId]);
  useEffect(() => {
    if (p && !optionId) setOptionId(defaultOptionId(p));
  }, [p, optionId]);

  const stage = p?.stages.find((s) => s.stageId === p.currentStageId);
  const opt = p?.options.find((o) => o.optionId === optionId) ?? p?.options[0];
  const unit = (opt && stage?.options[opt.optionId]?.price) || 0;
  const remoteFee =
    recipient && p && isRemote(recipient.postalCode, recipient.address)
      ? p.remoteAreaFee
      : 0;
  const shipping = p?.shippingFeeType === "SEPARATE" ? p.shippingFee : 0;
  const total = unit * qty + shipping + remoteFee;
  // 항목 수는 ORDER_CONSENT_KEYS에서 센다(DEV-138). 숫자를 직접 쓰지 않는다
  const consentTotal = ORDER_CONSENT_KEYS.length;
  const agreed = agreedCount(consents);
  const allAgreed = agreed === consentTotal;
  // 예약할 수 있나는 서버 soldOut 대신 availability로 본다(soldOut은 판매 중지를 보지 않음, DEV-215 전).
  // 409 안내가 없거나 기한 만료 복귀 안내만 있을 때는 상품 availability가 앞선다
  const shown =
    p && (!conflict || conflict.reason === "EXPIRED")
      ? (availabilityConflict(p) ?? conflict)
      : conflict;
  const view = p
    ? conflictView(
        shown,
        { product: p, optionId: opt?.optionId ?? "", quantity: qty },
        { md, won },
      )
    : null;
  const leaving = view?.primary.action === "backToProduct";
  const canPay =
    leaving ||
    (!!recipient && allAgreed && !!p && (view ? view.primary.enabled : true));

  const consentText = useMemo(() => {
    if (!p) return null;
    // 항목마다 문구를 하나씩. 키가 빠지면 타입 오류가 난다(DEV-138). 순서는 ORDER_CONSENT_KEYS
    const text: Record<OrderConsentKey, { title: string; body: string }> = {
      deliveryWindow: {
        title: "받는 시기",
        body: `이 상품은 수확 전 예약 상품이에요. ${fullPeriod(p.deliveryWindow.start, p.deliveryWindow.end)} 사이에 받아요. 농가 사정으로 바뀌면 새 기간으로 받거나 전액 환불받을 수 있어요.`,
      },
      delayRefund: {
        title: "지연 시 환불",
        body: `${md(p.maxDelayUntil)}까지 출하되지 않으면 자동으로 전액 환불해 드려요.`,
      },
      shortage: {
        title: "흉작·수량 부족",
        body: "날씨 등으로 수확량이 모자라면 받을 수 있는 만큼 나눠 보내고, 나머지는 바로 환불해 드려요.",
      },
      cancelPolicy: {
        title: "취소·반품 조건",
        body: "출하 전에는 언제든 취소하고 전액 환불받을 수 있어요. 신선식품이라 출하 후에는 단순 변심 취소·반품이 안 되고, 받은 상품에 문제가 있을 때만 환불·교환해 드려요.",
      },
      // 개인정보 제3자 제공 동의(DEV-120, 개인정보보호법 제17조 ②의 고지 5가지)
      thirdParty: {
        title: "개인정보 제3자 제공 (판매자)",
        body: `받는 분: 판매자 ${p.farmName}. 목적: 상품 배송, 주문 이행, 주문 문의 응대. 항목: 받는 사람 이름·연락처·주소·배송 메모, 주문 내용, 닉네임. 기간: 주문 이행이 끝날 때까지(판매자는 법령이 정한 기간 동안 보관할 수 있어요). 동의하지 않을 수 있지만, 그러면 판매자가 보낼 곳을 몰라 예약할 수 없어요.`,
      },
    };
    return ORDER_CONSENT_KEYS.map((key) => ({ key, ...text[key] }));
  }, [p]);

  function backToProduct() {
    router.replace(`/products/${params.productId}`);
  }

  // '다시 확인하기': 상품을 다시 읽어 예약할 수 있으면 안내를 지운다. 가격도 바뀌었으면 가격 안내로
  async function recheck() {
    if (!opt) return;
    setBusy(true);
    try {
      const fresh = await catalog.product(params.productId);
      product.setData(() => fresh);
      if (
        conflict?.reason === "SALES_PAUSED" &&
        fresh.availability === "PAUSED"
      )
        toast.show("아직 예약을 쉬고 있어요");
      else if (fresh.availability === "AVAILABLE")
        setConflict(
          recheckedConflict(sentRef.current, fresh, opt.optionId, total),
        );
      else setConflict(null);
    } catch (e) {
      toast.fail(e, () => void recheck());
    } finally {
      setBusy(false);
    }
  }

  async function submit(retried = false) {
    if (leaving) return backToProduct();
    if (!p || !opt || !recipient) return;
    setBusy(true);
    setErrors({});
    setPlaced(null);
    // 주문서가 지금 보여 준 기간·단가·중량. 서버가 지금 값과 비교한다(AC-08-8)
    const seen = seenValues(p, opt.optionId);
    sentRef.current = seen;
    const shownTotal = total;
    try {
      const o = await orders.create(
        {
          productId: p.productId,
          optionId: opt.optionId,
          quantity: qty,
          recipientName: recipient.recipientName,
          recipientPhone: recipient.recipientPhone,
          postalCode: recipient.postalCode,
          address: recipient.address,
          addressDetail: recipient.addressDetail,
          deliveryNote: memo.trim() || undefined,
          consents,
          consentVersion: CONSENT_VERSION,
          saveAddress,
          ...(seen
            ? {
                expectedStageId: seen.stageId ?? undefined,
                expectedUnitPrice: seen.unitPrice ?? undefined,
                expectedUnitWeightGrams: seen.unitWeightGrams ?? undefined,
              }
            : {}),
        },
        idemKey,
      );
      // DEV-68: 주문을 만든 뒤 바로 입금 안내를 받는다(물량 선점, 입금 대기)
      await orders.deposit(o.orderId, depositKey);
      placedRef.current = { orderId: o.orderId, optionId: opt.optionId, quantity: qty };
      // 구매 퍼널 3단계: 주문서 제출 → 입금 안내(DEV-71). 받는 사람·주소는 보내지 않는다
      track("checkout_submitted", {
        productId: p.productId,
        orderId: o.orderId,
        quantity: qty,
      });
      router.push({
        pathname: "/checkout/[productId]/pay",
        params: {
          productId: p.productId,
          orderId: o.orderId,
          optionId: opt.optionId,
          quantity: String(qty),
        },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const reason = String(e.details.reason ?? "");
        const step =
          reason === "IDEMPOTENCY_MISMATCH"
            ? mismatchStep(placedRef.current?.orderId ?? null, retried)
            : null;
        if (step === "showPlaced") {
          // 이미 만든 주문이 있다: 키를 그대로 두어 다시 눌러도 두 번째 주문이 생기지 않게 한다
          setPlaced(placedRef.current);
          return;
        }
        // 409도 멱등 결과로 저장되므로 키를 둘 다 새로 만든다
        const nextOrderKey = newIdempotencyKey();
        setIdemKey(nextOrderKey);
        setDepositKey(newIdempotencyKey());
        if (step) {
          // 같은 키에 다른 본문(앱 버그)이고 만든 주문이 없다: 새 키로 한 번만 다시 보낸다
          if (step === "fail") setErrors({ _: "잠시 뒤 다시 시도해 주세요." });
          else setRetryKey(nextOrderKey);
        } else {
          // 서버 최신 가격·물량으로 다시 그리고 입력값은 유지, 안내는 reason으로 고른다
          setConflict({
            reason,
            details: e.details,
            firstTotal: reason === "STAGE_CHANGED" ? shownTotal : undefined,
          });
          await product.reload();
        }
      } else if (e instanceof ApiError && e.details.fields) {
        setErrors(e.details.fields);
      } else if (isNetworkError(e)) {
        // 같은 멱등 키로 다시 보낸다(입력 유지)
        toast.fail(e, () => void submit());
      } else {
        setErrors({
          _: e instanceof ApiError ? e.message : "잠시 뒤 다시 시도해 주세요.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  // IDEMPOTENCY_MISMATCH 뒤 새 키가 state에 들어간 다음 한 번 다시 보낸다
  const [retryKey, setRetryKey] = useState<string | null>(null);
  useEffect(() => {
    if (retryKey && retryKey === idemKey) {
      setRetryKey(null);
      void submit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, idemKey]);

  if (product.error && !p)
    return (
      <Screen>
        <HeaderBar
          title="주문서"
          onBack={() => goBackOr(router, `/products/${params.productId}`)}
        />
        <LoadError error={product.error} onRetry={product.reload} />
      </Screen>
    );

  return (
    <Screen>
      <HeaderBar
        title="주문서"
        onBack={() =>
          goBackOr(router, `/products/${params.productId}`)
        }
      />
      <TestBand text="테스트 서비스예요 · 실제 입금·배송은 없어요" />
      <Scroll bottom={170}>
        {view ? (
          <Notice
            style={{ margin: tokens.space.gutter, marginBottom: 0 }}
            title={view.title}
            body={view.body}
            action={
              view.inline ? (
                <View style={{ alignItems: "flex-start" }}>
                  <Button
                    label={view.inline.label}
                    variant="text"
                    onPress={() =>
                      view.inline?.action === "recheck"
                        ? void recheck()
                        : setSheet("option")
                    }
                  />
                </View>
              ) : undefined
            }
          />
        ) : null}

        {/* 이 주문서로 만든 입금 대기 예약이 있을 때(DEV-291). 제목 + 한 문장, 이동은 하단 버튼(DEV-293, Figma 11:133 ②) */}
        {placed ? (
          <Notice
            style={{ margin: tokens.space.gutter, marginBottom: 0 }}
            title="입금을 기다리는 예약이 있어요"
            body="옵션·수량을 바꾸려면 그 예약을 취소하고 다시 예약해 주세요."
          />
        ) : null}

        {p && opt ? (
          <View
            style={{
              paddingHorizontal: tokens.space.gutter,
              paddingTop: tokens.space.lg,
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
            }}
          >
            <Photo
              uri={p.photo}
              width={tokens.thumb.summary}
              height={tokens.thumb.summary}
              radius={8}
              alt={p.name}
              kind="product"
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T variant="body" weight="semibold" numberOfLines={1}>
                {p.name.split(" / ")[0].replace(/\s\d+kg$/, "")} {opt.label} ×{" "}
                {qty}
              </T>
              <T variant="sub" muted numberOfLines={1}>
                {p.farmName} ·{" "}
                {!stage
                  ? "지금은 예약 기간이 아니에요"
                  : shown?.reason === "SOLD_OUT"
                    ? "품절"
                    : `${period(p.deliveryWindow.start, p.deliveryWindow.end)} 도착`}
              </T>
            </View>
            <LinkButton
              label="변경"
              accessibilityLabel="옵션·수량 변경"
              onPress={() => setSheet("option")}
            />
          </View>
        ) : null}

        <Section
          divided
          title="받는 곳"
          right={
            recipient ? (
              <LinkButton
                label="변경"
                accessibilityLabel="받는 곳 변경"
                onPress={() => setSheet("address")}
              />
            ) : undefined
          }
        >
          {recipient ? (
            <View style={{ gap: 2 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <T variant="body" weight="semibold" masked>
                  {recipient.recipientName}
                </T>
                {"isDefault" in recipient && (recipient as Address).isDefault ? (
                  <Tag label="기본" />
                ) : saveAddress ? (
                  <Tag label="기본으로 저장" />
                ) : null}
              </View>
              <T variant="body" masked>
                {recipient.recipientPhone}
              </T>
              <T variant="body" masked>
                {recipient.address}
                {recipient.addressDetail ? `, ${recipient.addressDetail}` : ""}{" "}
                ({recipient.postalCode})
              </T>
              {remoteFee ? (
                <T variant="sub" weight="semibold" style={{ marginTop: 4 }}>
                  이 주소는 추가 운임 {won(remoteFee)}이 붙어요.
                </T>
              ) : null}
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(addressHref)}
              style={{
                height: 64,
                flexDirection: "row",
                gap: 8,
                borderRadius: 16,
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: tokens.color.text,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="plus" size={20} />
              <T variant="body" weight="semibold">
                받는 사람과 주소 입력
              </T>
            </Pressable>
          )}
          {errors.address || errors.recipientPhone || errors.recipientName ? (
            <T variant="sub" color={tokens.color.error}>
              {errors.address ?? errors.recipientPhone ?? errors.recipientName}
            </T>
          ) : null}
          {/* 배송 메모: 선택 목록 + 직접 입력(DEV-293) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              memoTyping
                ? "배송 메모 직접 입력, 바꾸기"
                : memo
                  ? `배송 메모 ${memo}, 바꾸기`
                  : "배송 메모 (선택) 고르기"
            }
            onPress={() => setSheet("memo")}
            style={{
              minHeight: tokens.height.input,
              paddingHorizontal: tokens.space.md,
              borderRadius: tokens.radius.sm,
              borderWidth: 1,
              borderColor: tokens.color.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <T
              variant="body"
              muted={!memo || memoTyping}
              numberOfLines={1}
              style={{ flex: 1 }}
              masked={!!memo}
            >
              {memoTyping ? "직접 입력" : memo || "배송 메모 (선택)"}
            </T>
            <Icon name="chevron" size={20} color={tokens.color.textMuted} />
          </Pressable>
          {memoTyping ? (
            <Input
              label="배송 메모"
              optional
              value={memo}
              onChangeText={setMemo}
              placeholder="예: 공동현관 비밀번호는 농가 채팅으로 알려 드릴게요"
              maxLength={100}
              error={errors.deliveryNote}
            />
          ) : errors.deliveryNote ? (
            <T variant="sub" color={tokens.color.error}>
              {errors.deliveryNote}
            </T>
          ) : null}
        </Section>

        {view?.hideAmount ? null : (
          <Section divided title="입금 금액">
            <View style={{ gap: 8 }}>
              <Line k="상품 금액" v={won(unit * qty)} />
              <Line
                k="배송비"
                v={
                  p?.shippingFeeType === "SEPARATE" && !shipping
                    ? "배송비 확정 전"
                    : won(shipping)
                }
              />
              {remoteFee ? (
                <Line k="도서산간 추가 운임" v={won(remoteFee)} />
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: 12,
                  marginTop: 4,
                  borderTopWidth: 1,
                  borderTopColor: tokens.color.border,
                }}
              >
                <T variant="body" weight="bold">
                  총 입금액
                </T>
                <T variant="title" color={tokens.color.accent}>
                  {won(total)}
                </T>
              </View>
              {view?.firstTotal != null && view.firstTotal !== total ? (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <T variant="sub" muted>
                    처음 본 합계
                  </T>
                  <T
                    variant="sub"
                    muted
                    style={{ textDecorationLine: "line-through" }}
                  >
                    {won(view.firstTotal)}
                  </T>
                </View>
              ) : null}
            </View>
          </Section>
        )}

        <Section divided title="예약 전 확인">
          <Checkbox
            checked={allAgreed}
            label="모두 동의해요"
            onPress={() => setConsents(orderConsents(!allAgreed))}
          >
            <T variant="body" weight="bold">
              모두 동의해요
            </T>
          </Checkbox>
          <View>
            {consentText?.map((c) => (
              <View key={c.key}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <View style={{ flex: 1 }}>
                    <Checkbox
                      checked={consents[c.key]}
                      label={`${c.title} (필수)`}
                      onPress={() =>
                        setConsents((s) => ({ ...s, [c.key]: !s[c.key] }))
                      }
                    >
                      <T variant="sub">{c.title} (필수)</T>
                    </Checkbox>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${c.title} 보기`}
                    aria-expanded={openConsent === c.key}
                    onPress={() =>
                      setOpenConsent((k) => (k === c.key ? null : c.key))
                    }
                    style={{
                      minHeight: tokens.touchTarget.min,
                      minWidth: tokens.touchTarget.min,
                      alignItems: "flex-end",
                      justifyContent: "center",
                    }}
                  >
                    <T variant="sub" muted>
                      {openConsent === c.key ? "접기" : "보기"}
                    </T>
                  </Pressable>
                </View>
                {openConsent === c.key ? (
                  <T
                    variant="sub"
                    muted
                    style={{ paddingLeft: 36, paddingBottom: 12 }}
                  >
                    {c.body}
                  </T>
                ) : null}
              </View>
            ))}
          </View>
          {errors.consents ? (
            <T variant="sub" color={tokens.color.error}>
              {errors.consents}
            </T>
          ) : null}
          {/* 입금 안내(policy 2장, DEV-68)는 금액을 숨기는 충돌 화면에서도 보이게 여기 둔다 */}
          <T variant="caption" muted>
            농가 계좌로 직접 입금해요. 24시간 안에 입금하지 않으면 자동 취소돼요.
          </T>
          {/* 통신판매중개자 고지(전자상거래법 20조) 한 줄 */}
          <T variant="caption" muted>
            farmclub은 통신판매중개자이고, 상품·배송·환불 책임은 판매자{" "}
            {p?.farmName ?? "농가"}에 있어요.
          </T>
          <View style={{ flexDirection: "row", gap: 16 }}>
            {(
              [
                ["이용약관", "/terms"],
                ["개인정보 처리방침", "/privacy"],
              ] as const
            ).map(([label, path]) => (
              <Pressable
                key={path}
                accessibilityRole="link"
                onPress={() => router.push(path)}
                style={{ minHeight: 48, justifyContent: "center" }}
              >
                <T variant="sub" weight={path === "/privacy" ? "semibold" : "regular"}>
                  {label}
                </T>
              </Pressable>
            ))}
          </View>
        </Section>
        {errors._ ? (
          <T variant="sub" color={tokens.color.error} style={{ margin: tokens.space.gutter }}>
            {errors._}
          </T>
        ) : null}
      </Scroll>

      {/* CTA 위 설명 문단 없이 금액이 들어간 버튼 하나(DEV-293). 충돌 안내가 있을 때만 한 줄 */}
      <BottomBar
        summary={
          view?.summary ? (
            <T variant="sub" style={{ flex: 1 }}>
              {view.summary}
            </T>
          ) : undefined
        }
      >
        {placed ? (
          <Button
            label="입금 안내 보기"
            onPress={() =>
              router.push({
                pathname: "/checkout/[productId]/pay",
                params: {
                  productId: params.productId,
                  orderId: placed.orderId,
                  optionId: placed.optionId,
                  quantity: String(placed.quantity),
                },
              })
            }
          />
        ) : (
          <Button
            label={
              view && view.primary.label !== "예약하기"
                ? view.primary.label
                : view?.hideAmount || !p
                  ? "예약하기"
                  : `${won(total)} 예약하기`
            }
            disabled={!canPay}
            loading={busy}
            onPress={() => void submit()}
          />
        )}
      </BottomBar>

      <OptionSheet
        visible={sheet === "option"}
        product={p}
        optionId={opt?.optionId ?? ""}
        quantity={qty}
        onChange={(o, q) => {
          setOptionId(o);
          setQty(q);
          // 품절·물량·수량 안내는 옵션·수량을 바꾸면 사라지고 버튼이 다시 켜진다
          if (clearsOnSelection(conflict)) setConflict(null);
        }}
        onClose={() => setSheet(null)}
        onSubmit={() => setSheet(null)}
        submitLabel="바꾸기"
      />
      {toast.node}
      <Sheet
        visible={sheet === "address"}
        onClose={() => setSheet(null)}
        title="받는 곳"
        instant={sheetLeave.instant}
      >
        {addresses.data?.map((a) => (
          <Pressable
            key={a.addressId}
            accessibilityRole="radio"
            // DEV-147: 지금 받는 곳으로 고른 주소를 스크린리더에 알린다(웹은 aria-checked만 DOM에 옮김, DEV-141)
            aria-checked={
              !!recipient && "addressId" in recipient && recipient.addressId === a.addressId
            }
            onPress={() => {
              setRecipient(a);
              setSaveAddress(false);
              setSheet(null);
            }}
            style={{
              minHeight: 64,
              justifyContent: "center",
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: tokens.color.border,
              gap: 4,
            }}
          >
            <T variant="body" weight="semibold" masked>
              {a.recipientName} · {a.recipientPhone}
              {a.isDefault ? "  기본" : a.label ? `  ${a.label}` : ""}
            </T>
            <T variant="sub" muted masked>
              {a.address} {a.addressDetail}
            </T>
          </Pressable>
        ))}
        {(addresses.data?.length ?? 0) >= ADDRESS_LIMIT ? (
          <T variant="sub" muted style={{ paddingTop: 8 }}>
            배송지가 {ADDRESS_LIMIT}개라 새 주소는 이번 주문에만 쓰고 저장하지 않아요.
          </T>
        ) : null}
        <Button
          label="새 주소 입력"
          variant="outline"
          onPress={() =>
            sheetLeave.leave(
              () => setSheet(null),
              () => router.push(addressHref),
            )
          }
        />
      </Sheet>
      <Sheet
        visible={sheet === "memo"}
        onClose={() => setSheet(null)}
        title="배송 메모"
      >
        <View>
          {[...MEMO_PRESETS, "직접 입력", "선택 안 함"].map((m) => {
            const on =
              m === "직접 입력"
                ? memoTyping
                : m === "선택 안 함"
                  ? !memo && !memoTyping
                  : !memoTyping && memo === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                aria-checked={on}
                onPress={() => {
                  if (m === "직접 입력") {
                    setMemoTyping(true);
                    if ((MEMO_PRESETS as readonly string[]).includes(memo))
                      setMemo("");
                  } else {
                    setMemoTyping(false);
                    setMemo(m === "선택 안 함" ? "" : m);
                  }
                  setSheet(null);
                }}
                style={{
                  minHeight: tokens.height.row,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderTopWidth: 1,
                  borderTopColor: tokens.color.border,
                }}
              >
                <View style={{ width: 24, alignItems: "center" }}>
                  {on ? <Icon name="check" /> : null}
                </View>
                <T variant="body" weight={on ? "semibold" : "regular"}>
                  {m}
                </T>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </Screen>
  );
}

/** 금액 줄: 이름 왼쪽, 금액 오른쪽 정렬(tabular-nums) */
function Line({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <T variant="body" muted>
        {k}
      </T>
      <T variant="body" style={{ textAlign: "right" }}>
        {v}
      </T>
    </View>
  );
}

/** 강조색 글자 링크(‘변경’). 터치 48 */
function LinkButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{
        minHeight: tokens.touchTarget.min,
        minWidth: tokens.touchTarget.min,
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <T variant="sub" weight="semibold" color={tokens.color.accent}>
        {label}
      </T>
    </Pressable>
  );
}

/** 작은 면색 태그(‘기본’) */
function Tag({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 6,
        height: 20,
        borderRadius: 4,
        backgroundColor: tokens.color.surface,
        justifyContent: "center",
      }}
    >
      <T variant="caption" muted>
        {label}
      </T>
    </View>
  );
}
