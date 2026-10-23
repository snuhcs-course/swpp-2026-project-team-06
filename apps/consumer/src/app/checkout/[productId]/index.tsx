// SCR-10 주문서 (FEAT-08, R-03 동의 4개는 policy.md 2장 문구) — design: scr-10, s-10-noconsent, s-10-remote, s-10-stagechanged, s-10-noaddr
import { track } from "@farmclub/analytics";
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

// 예약 전 확인 문구 버전(R-03). DEV-120에서 개인정보 제3자 제공 동의를 더해 올렸다
const CONSENT_VERSION = "policy-2026-10-23";
/** 저장 배송지 한도(서버 ADDRESS_LIMIT) */
const ADDRESS_LIMIT = 50;
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
    thirdParty: false,
  });
  const [sheet, setSheet] = useState<null | "option" | "address">(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflictMsg, setConflictMsg] = useState<string | null>(
    params.changed ? "예약 기간 또는 가격이 바뀌었어요" : null,
  );
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);
  // 입금 안내(물량 선점)도 멱등 키로 한 번만(AC-09-3)
  const [depositKey, setDepositKey] = useState(newIdempotencyKey);
  const [saveAddress, setSaveAddress] = useState(false);
  const toast = useToast();
  const addressHref = {
    pathname: "/checkout/[productId]/address" as const,
    params: { productId: params.productId },
  };

  // 로그인 안 했으면 로그인으로, 가입 온보딩이 남았으면 온보딩으로 (주문은 둘 다 필요, AC-01-12)
  useEffect(() => {
    const here = `/checkout/${params.productId}?optionId=${encodeURIComponent(optionId)}&quantity=${qty}`;
    if (ready && !user)
      router.replace({ pathname: "/login", params: { next: here } });
    else if (ready && user?.needsOnboarding)
      router.replace({ pathname: "/onboarding", params: { next: here } });
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
  // 구매 퍼널 2단계: 로그인한 사용자에게 주문서가 열림(트래킹 플랜 checkout_started, DEV-71)
  const startedId = user && p ? p.productId : null;
  useEffect(() => {
    if (startedId) track("checkout_started", { productId: startedId });
  }, [startedId]);
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
  const allAgreed = agreed === 5;
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
      {
        // 개인정보 제3자 제공 동의(DEV-120, 개인정보보호법 제17조 ②의 고지 5가지)
        key: "thirdParty" as const,
        title: "개인정보 제3자 제공 (판매자)",
        body: `받는 분: 판매자 ${p.farmName}. 목적: 상품 배송, 주문 이행, 주문 문의 응대. 항목: 받는 사람 이름·연락처·주소·배송 메모, 주문 내용, 닉네임. 기간: 주문 이행이 끝날 때까지(판매자는 법령이 정한 기간 동안 보관할 수 있어요). 동의하지 않을 수 있지만, 그러면 판매자가 보낼 곳을 몰라 예약할 수 없어요.`,
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
      // DEV-68: 주문을 만든 뒤 바로 입금 안내를 받는다(물량 선점, 입금 대기)
      await orders.deposit(o.orderId, depositKey);
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
        // 서버 최신 가격·물량으로 다시 그리고 입력값은 유지, 다시 확인받는다
        setConflictMsg(e.message);
        setIdemKey(newIdempotencyKey());
        setDepositKey(newIdempotencyKey());
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
      <TestBand text="테스트 서비스예요. 실제 입금·배송은 일어나지 않아요." />
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
              <T variant="body" weight="semibold" masked>
                {recipient.recipientName} · {recipient.recipientPhone}
              </T>
              <T variant="body" masked>
                {recipient.address}
                {recipient.addressDetail ? `, ${recipient.addressDetail}` : ""}
              </T>
              <T variant="sub" muted masked>
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

        <Section title="예약 전 확인">
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
                thirdParty: v,
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
                  borderBottomWidth: i === consentText.length - 1 ? 1 : 0,
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
          {/* 통신판매중개자 고지·입금 안내(policy 2장, DEV-68) */}
          <T variant="sub" muted>
            예약하면 농가 계좌로 직접 입금해요. 24시간 안에 입금하지 않으면
            예약이 자동으로 취소돼요. farmclub은 통신판매중개자이고,
            상품·배송·환불의 책임은 판매자인 {p?.farmName ?? "농가"}에 있어요.
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
          <T variant="sub" color={tokens.color.error} style={{ margin: 20 }}>
            {errors._}
          </T>
        ) : null}
      </Scroll>

      <BottomBar
        summary={
          !recipient ? (
            <T variant="sub" style={{ flex: 1 }}>
              받는 곳을 입력하면 예약할 수 있어요
            </T>
          ) : !allAgreed ? (
            <T variant="sub" style={{ flex: 1 }}>
              4개 중 {agreed}개 동의했어요. 모두 동의하면 예약할 수 있어요.
            </T>
          ) : (
            `${opt?.label ?? ""} × ${qty} · ${remoteFee ? `도서산간 ${won(remoteFee)}` : shipping ? `배송비 ${won(shipping)}` : "무료배송"}`
          )
        }
        summaryRight={recipient && allAgreed ? won(total) : undefined}
      >
        <Button
          label={
            conflictMsg && !p?.soldOut ? "바뀐 금액으로 예약하기" : "예약하기"
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
