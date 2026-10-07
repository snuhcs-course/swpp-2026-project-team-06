// SCR-10 주문서 (FEAT-08, R-03 동의 4개는 policy.md 2장 문구) — design: scr-10, s-10-noconsent, s-10-remote, s-10-stagechanged, s-10-noaddr
import {
  ApiError,
  auth,
  catalog,
  newIdempotencyKey,
  orders,
  type Address,
  type Recipient,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  Checkbox,
  HeaderBar,
  Icon,
  Input,
  Notice,
  Photo,
  Screen,
  Scroll,
  Section,
  Sheet,
  T,
  TestBand,
  md,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { useSession } from "../../../lib/session";
import { isNetworkError, useToast } from "../../../lib/toast";
import { LoadError, OptionSheet } from "../../../lib/views";

const CONSENT_VERSION = "policy-2026-10-06";
const isRemote = (postal: string, address: string) =>
  /^(63|40[0-2]|23[01])/.test(postal) || /(울릉|옹진|도서)/.test(address);
/** policy.md 2장 날짜 표기: "11월 10일~11월 20일" */
const fullPeriod = (a: string, b: string) => `${md(a)}~${md(b)}`;

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
  const [consents, setConsents] = useState({
    deliveryWindow: false,
    delayRefund: false,
    shortage: false,
    cancelPolicy: false,
  });
  const [sheet, setSheet] = useState<null | "option" | "address">(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflictMsg, setConflictMsg] = useState<string | null>(
    params.changed ? "예약 기간 또는 가격이 바뀌었어요" : null,
  );
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  const [saveAddress, setSaveAddress] = useState(false);
  const toast = useToast();
  const addressHref = {
    pathname: "/checkout/[productId]/address" as const,
    params: { productId: params.productId },
  };

  // 로그인 안 했으면 로그인으로 (주문은 로그인 필요)
  useEffect(() => {
    if (ready && !user)
      router.replace({
        pathname: "/login",
        params: {
          next: `/checkout/${params.productId}?optionId=${encodeURIComponent(optionId)}&quantity=${qty}`,
        },
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, params.productId, router]);

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
  useEffect(() => {
    if (p && !optionId) setOptionId(p.options[0].optionId);
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
  const agreed = Object.values(consents).filter(Boolean).length;
  const allAgreed = agreed === 4;
  const canPay = !!recipient && allAgreed && !!p && !p.soldOut;

  const consentText = useMemo(() => {
    if (!p) return null;
    return [
      {
        key: "deliveryWindow" as const,
        title: "받는 시기",
        body: `이 상품은 수확 전 예약 상품이에요. ${fullPeriod(p.deliveryWindow.start, p.deliveryWindow.end)} 사이에 받아요. 농가 사정으로 바뀌면 새 기간으로 받거나 전액 환불받을 수 있어요.`,
      },
      {
        key: "delayRefund" as const,
        title: "지연 시 환불",
        body: `${md(p.maxDelayUntil)}까지 출하되지 않으면 자동으로 전액 환불해 드려요.`,
      },
      {
        key: "shortage" as const,
        title: "흉작·수량 부족",
        body: "날씨 등으로 수확량이 모자라면 받을 수 있는 만큼 나눠 보내고, 나머지는 바로 환불해 드려요.",
      },
      {
        key: "cancelPolicy" as const,
        title: "취소·반품 조건",
        body: "출하 전에는 언제든 취소하고 전액 환불받을 수 있어요. 신선식품이라 출하 후에는 단순 변심 취소·반품이 안 되고, 받은 상품에 문제가 있을 때만 환불·교환해 드려요.",
      },
    ];
  }, [p]);

  async function submit() {
    if (!p || !opt || !recipient) return;
    setBusy(true);
    setErrors({});
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
        },
        idemKey,
      );
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
        // 서버 최신 가격·물량으로 다시 그리고 입력값은 유지, 다시 확인받는다
        setConflictMsg(e.message);
        setIdemKey(newIdempotencyKey());
        await product.reload();
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

  if (product.error && !p)
    return (
      <Screen>
        <HeaderBar title="주문서" onBack={() => router.back()} />
        <LoadError error={product.error} onRetry={product.reload} />
      </Screen>
    );

  return (
    <Screen>
      <HeaderBar
        title="주문서"
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(`/products/${params.productId}`)
        }
      />
      <TestBand text="테스트 서비스예요. 실제 결제·배송은 일어나지 않아요." />
      <Scroll bottom={170}>
        {conflictMsg && p ? (
          <Notice
            style={{ margin: 20, marginBottom: 0 }}
            title={conflictMsg}
            body={
              p.soldOut
                ? "지금은 예약할 수 없어요. 다음 예약 기간가 열리면 다시 예약해 주세요."
                : `지금 가격은 ${won(unit)}이에요. 입력한 내용은 그대로 두었어요.`
            }
          />
        ) : null}

        {p && opt ? (
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 24,
              flexDirection: "row",
              gap: 16,
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
            <View style={{ flex: 1 }}>
              <T variant="body" weight="semibold">
                {p.name.split(" / ")[0].replace(/\s\d+kg$/, "")} {opt.label} ×{" "}
                {qty}
              </T>
              <T variant="sub" muted>
                {p.farmName} ·{" "}
                {stage
                  ? `${`${md(stage.startsAt)} ~ ${md(stage.endsAt)}`} ${won(unit)}`
                  : "품절"}
              </T>
            </View>
            <Button
              label="변경"
              variant="text"
              onPress={() => setSheet("option")}
            />
          </View>
        ) : null}

        <Section
          title="받는 곳"
          right={
            recipient ? (
              <Button
                label="다른 배송지"
                variant="text"
                onPress={() => setSheet("address")}
              />
            ) : undefined
          }
        >
          {recipient ? (
            <View style={{ gap: 4 }}>
              <T variant="body" weight="semibold">
                {recipient.recipientName} · {recipient.recipientPhone}
              </T>
              <T variant="body">
                {recipient.address}
                {recipient.addressDetail ? `, ${recipient.addressDetail}` : ""}
              </T>
              <T variant="sub" muted>
                {recipient.postalCode}
                {"isDefault" in recipient && (recipient as Address).isDefault
                  ? " · 기본 배송지"
                  : saveAddress
                    ? " · 기본 배송지로 저장"
                    : ""}
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
          <Input
            label="배송 메모"
            optional
            value={memo}
            onChangeText={setMemo}
            placeholder="예: 문 앞에 두고 벨 눌러 주세요"
            maxLength={100}
            error={errors.deliveryNote}
          />
        </Section>

        <Section title="금액">
          <View style={{ gap: 8 }}>
            <Line k={`상품 ${won(unit)} × ${qty}`} v={won(unit * qty)} />
            <Line k="배송비" v={shipping ? won(shipping) : "무료"} />
            {remoteFee ? (
              <Line k="도서산간 추가 운임" v={won(remoteFee)} />
            ) : null}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
                paddingTop: 12,
                marginTop: 4,
                borderTopWidth: 1,
                borderTopColor: tokens.color.border,
              }}
            >
              <T variant="body" weight="semibold">
                합계
              </T>
              <T variant="heading">{won(total)}</T>
            </View>
          </View>
          <T variant="sub" muted>
            예약한 때의 가격으로 확정돼요. 나중에 가격이 바뀌어도 그대로예요.
          </T>
        </Section>

        <Section title="결제 전 확인">
          <Checkbox
            checked={allAgreed}
            label="모두 동의해요"
            onPress={() => {
              const v = !allAgreed;
              setConsents({
                deliveryWindow: v,
                delayRefund: v,
                shortage: v,
                cancelPolicy: v,
              });
            }}
          >
            <T variant="body" weight="bold">
              모두 동의해요
            </T>
          </Checkbox>
          <View>
            {consentText?.map((c, i) => (
              <View
                key={c.key}
                style={{
                  paddingVertical: 16,
                  borderTopWidth: 1,
                  borderTopColor: tokens.color.border,
                  borderBottomWidth: i === 3 ? 1 : 0,
                  borderBottomColor: tokens.color.border,
                }}
              >
                <Checkbox
                  checked={consents[c.key]}
                  label={c.title}
                  onPress={() =>
                    setConsents((s) => ({ ...s, [c.key]: !s[c.key] }))
                  }
                >
                  <T variant="sub" weight="semibold">
                    {c.title}
                  </T>
                  <T variant="sub">{c.body}</T>
                </Checkbox>
              </View>
            ))}
          </View>
          {errors.consents ? (
            <T variant="sub" color={tokens.color.error}>
              {errors.consents}
            </T>
          ) : null}
          <T variant="caption" muted>
            이용약관 · 개인정보 처리방침
          </T>
        </Section>
        {errors._ ? (
          <T variant="sub" color={tokens.color.error} style={{ margin: 20 }}>
            {errors._}
          </T>
        ) : null}
      </Scroll>

      <BottomBar
        summary={
          !recipient ? (
            <T variant="sub" style={{ flex: 1 }}>
              받는 곳을 입력하면 결제할 수 있어요
            </T>
          ) : !allAgreed ? (
            <T variant="sub" style={{ flex: 1 }}>
              4개 중 {agreed}개 동의했어요. 모두 동의하면 결제할 수 있어요.
            </T>
          ) : (
            `${opt?.label ?? ""} × ${qty} · ${remoteFee ? `도서산간 ${won(remoteFee)}` : shipping ? `배송비 ${won(shipping)}` : "무료배송"}`
          )
        }
        summaryRight={recipient && allAgreed ? won(total) : undefined}
      >
        <Button
          label={
            conflictMsg && !p?.soldOut ? "바뀐 금액으로 결제하기" : "결제하기"
          }
          disabled={!canPay}
          loading={busy}
          onPress={submit}
        />
      </BottomBar>

      <OptionSheet
        visible={sheet === "option"}
        product={p}
        optionId={opt?.optionId ?? ""}
        quantity={qty}
        onChange={(o, q) => {
          setOptionId(o);
          setQty(q);
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
      >
        {addresses.data?.map((a) => (
          <Pressable
            key={a.addressId}
            accessibilityRole="radio"
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
            <T variant="body" weight="semibold">
              {a.recipientName} · {a.recipientPhone}
              {a.isDefault ? "  기본" : a.label ? `  ${a.label}` : ""}
            </T>
            <T variant="sub" muted>
              {a.address} {a.addressDetail}
            </T>
          </Pressable>
        ))}
        <Button
          label="새 주소 입력"
          variant="outline"
          onPress={() => {
            setSheet(null);
            router.push(addressHref);
          }}
        />
      </Sheet>
    </Screen>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <T variant="body" muted>
        {k}
      </T>
      <T variant="body">{v}</T>
    </View>
  );
}
