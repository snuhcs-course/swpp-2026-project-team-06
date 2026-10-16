// SCR-11 결제 (FEAT-09) — PortOne 카드 결제(DEV-36). PG가 꺼져 있으면 Mock 카드 입력 화면(DEV-37)
import { ApiError, newIdempotencyKey, orders, payments } from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Input,
  Notice,
  Radio,
  Screen,
  Scroll,
  T,
  TestBand,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { newPaymentId, requestCardPayment } from "../../../lib/portone";
import { useSession } from "../../../lib/session";
import { useToast } from "../../../lib/toast";
import { LoadError } from "../../../lib/views";

/** 한 번에 결제되는 테스트 카드. 입력 없이 바로 결제한다 */
export const TEST_CARD_LAST4 = "4242";
/** 끝 4자리가 이 값이면 Mock 결제가 실패한다(AC-09-2 확인용). 예: 4242 0000 0000 0000 */
export const FAIL_CARD_LAST4 = "0000";

type Method = "test" | "other";

export default function Pay() {
  // paymentId·code·message는 PortOne이 리다이렉트로 돌아올 때 붙인다
  const { productId, orderId, optionId, quantity, paymentId, code, message } =
    useLocalSearchParams<{
      productId: string;
      orderId: string;
      optionId?: string;
      quantity?: string;
      paymentId?: string;
      code?: string;
      message?: string;
    }>();
  const router = useRouter();
  const {
    data: o,
    error,
    reload,
  } = useAsync(() => orders.get(orderId), [orderId]);
  const config = useAsync(() => payments.config(), []);
  const pg = config.data?.enabled === true;
  // 결제 전 주문이 아니면 결제 창을 열지 않는다. 이미 결제됐으면 완료 화면, 취소·환불됐으면 안내만(뒤로가기로 옛 결제 화면에 온 경우)
  const closed = !!o && o.status !== "PENDING_PAYMENT";
  useEffect(() => {
    if (o && o.status !== "PENDING_PAYMENT" && o.paidAt && o.status !== "CANCELED" && o.status !== "REFUNDED") {
      router.replace({ pathname: "/orders/[orderId]/done", params: { orderId } });
    }
  }, [o, orderId, router]);
  const { user } = useSession();
  const [method, setMethod] = useState<Method>("test");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  // 응답을 못 받으면 같은 키로 다시 보낸다(AC-09-3)
  const [key, setKey] = useState(newIdempotencyKey);
  const toast = useToast();

  const errors = method === "other" ? validate(number, expiry, cvc) : {};
  const formInvalid = Object.keys(errors).length > 0;
  const last4 =
    method === "test" ? TEST_CARD_LAST4 : digits(number).slice(-4);

  /** 서버에 결제 확인(PG면 paymentId, Mock이면 결과)을 보내고 완료 화면으로 */
  async function confirm(input: { paymentId: string } | { mockResult: "success" | "fail" }) {
    setBusy(true);
    setFail(null);
    try {
      const r = await orders.pay(orderId, input, key);
      if (r.result === "success") {
        router.replace({
          pathname: "/orders/[orderId]/done",
          params: { orderId, last4: "paymentId" in input ? "" : last4 },
        });
      } else {
        setFail(r.failReason ?? "카드사에서 승인을 거절했어요.");
        setKey(newIdempotencyKey());
      }
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  // PortOne 리다이렉트 복귀: 성공이면 서버 확인, 실패면 사유 표시. 한 번만
  const returned = useRef(false);
  useEffect(() => {
    if (returned.current || !o || !config.data) return;
    if (!paymentId && !code) return;
    returned.current = true;
    if (code) {
      setFail(message || "결제가 취소됐어요. 돈은 나가지 않았어요.");
      return;
    }
    if (paymentId && pg) void confirm({ paymentId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o, config.data, paymentId, code]);

  /** PG 카드 결제(DEV-36): PortOne 창 → 승인 → 서버 확인 */
  async function payWithPg() {
    if (!o || !config.data || closed) return;
    setBusy(true);
    setFail(null);
    try {
      const res = await requestCardPayment(config.data, {
        paymentId: newPaymentId(orderId),
        orderId,
        orderName: `${o.productName} ${o.optionLabel} × ${o.quantity}`,
        totalAmount: o.totalAmount,
        customer: {
          fullName: o.recipientName,
          phoneNumber: o.recipientPhone,
          // 이니시스 V2는 구매자 이메일이 필수. 카카오 계정은 이름이 이메일이고, 아니면 자리 주소를 넣는다(수신용 아님)
          email: user?.name.includes("@")
            ? user.name
            : `consumer-${user?.userId ?? "guest"}@farmclub.test`,
        },
      });
      if (res.code) {
        setFail(res.message || "결제가 취소됐어요. 돈은 나가지 않았어요.");
        setBusy(false);
        return;
      }
      if (res.paymentId) {
        await confirm({ paymentId: res.paymentId });
        return;
      }
      // 리다이렉트 환경이면 여기로 돌아오지 않는다
      setBusy(false);
    } catch (e) {
      const detail = e instanceof Error && e.message ? ` (${e.message})` : "";
      setFail(`결제 창을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.${detail}`);
      setBusy(false);
    }
  }

  function handleError(e: unknown) {
    {
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        (e.details as { reason?: string } | undefined)?.reason === "INVALID_TRANSITION"
      ) {
        // 이미 결제됐거나 취소된 주문. 가격 변경이 아니므로 주문서로 보내지 않는다
        setFail("이미 처리된 주문이에요. 결제가 됐다면 주문 내역에서 확인할 수 있어요.");
        void reload();
      } else if (e instanceof ApiError && e.status === 409) {
        router.replace({
          pathname: "/checkout/[productId]",
          params: {
            productId,
            optionId: optionId ?? "",
            quantity: quantity ?? "1",
            changed: "1",
          },
        });
      } else if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
        // 응답을 못 받음 → 공통 오류 토스트, 다시 시도는 같은 멱등 키(AC-09-3)
        toast.fail(e, () => void pay());
      } else {
        setFail(e instanceof ApiError ? e.message : "결제하지 못했어요.");
        setKey(newIdempotencyKey());
      }
    }
  }

  /** Mock 카드(DEV-37): 끝 4자리 0000이면 실패, 그 밖의 유효한 카드는 성공 */
  async function pay() {
    if (closed) return;
    if (pg) return payWithPg();
    if (method === "other" && formInvalid) {
      setTouched(true);
      return;
    }
    await confirm({ mockResult: last4 === FAIL_CARD_LAST4 ? "fail" : "success" });
  }

  function choose(m: Method) {
    if (busy) return;
    setMethod(m);
    setFail(null);
  }

  return (
    <Screen>
      <HeaderBar
        title="결제"
        onBack={() => {
          // 결제 중에는 취소 불가. 그 밖에는 주문을 결제 전 상태로 둔 채 주문서로(취소)
          if (!busy) router.back();
        }}
      />
      <TestBand
        text={
          pg
            ? "테스트 결제예요. 카드사 테스트 승인이라 실제 돈은 나가지 않아요."
            : "테스트 서비스예요. 실제 돈은 나가지 않아요."
        }
      />
      {error && !o ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <Scroll bottom={170}>
          <View style={{ paddingHorizontal: 20, paddingTop: 32, gap: 4 }}>
            <T variant="sub" muted>
              결제할 금액
            </T>
            <T variant="title">{o ? won(o.totalAmount) : " "}</T>
            <T variant="sub" muted>
              {o
                ? `${o.productName} ${o.optionLabel} × ${o.quantity} · ${o.farmName}`
                : ""}
            </T>
          </View>
          {closed ? (
            <Notice
              title="결제할 수 없는 주문이에요"
              body="이 주문은 이미 취소되었거나 결제가 끝났어요. 다시 예약하려면 상품에서 새로 주문해 주세요."
              action={
                <Button
                  label="주문 내역 보기"
                  variant="outline"
                  onPress={() => router.replace("/orders")}
                  style={{ marginTop: 8 }}
                />
              }
              style={{ marginHorizontal: 20, marginTop: 20 }}
            />
          ) : fail ? (
            <Notice
              tone="error"
              title="결제하지 못했어요"
              body={fail}
              style={{ marginHorizontal: 20, marginTop: 20 }}
            />
          ) : null}

          <View style={{ paddingHorizontal: 20, paddingTop: 40 }}>
            <T variant="heading" style={{ marginBottom: 8 }}>
              결제 수단
            </T>
            {pg ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  minHeight: 72,
                  borderTopWidth: 1,
                  borderTopColor: tokens.color.border,
                  borderBottomWidth: 1,
                  borderBottomColor: tokens.color.border,
                }}
              >
                <Radio selected />
                <View
                  style={{
                    width: 48,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: tokens.color.text,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <T variant="body" weight="semibold">
                    신용·체크카드
                  </T>
                  <T variant="sub" muted>
                    결제하기를 누르면 카드사 결제 창이 열려요
                  </T>
                </View>
              </View>
            ) : null}
            {!pg ? (
              [
                {
                  k: "test",
                  title: "테스트 카드",
                  sub: `···· ${TEST_CARD_LAST4} · 일시불 · 입력 없이 바로 결제`,
                },
                {
                  k: "other",
                  title: "다른 카드",
                  sub: "카드 번호를 직접 입력해요",
                },
              ] as const
            ).map((c, i) => (
              <Pressable
                key={c.k}
                accessibilityRole="radio"
                accessibilityLabel={c.title}
                accessibilityState={{ selected: method === c.k }}
                onPress={() => choose(c.k)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  minHeight: 72,
                  borderTopWidth: 1,
                  borderTopColor: tokens.color.border,
                  borderBottomWidth: i === 1 ? 1 : 0,
                  borderBottomColor: tokens.color.border,
                }}
              >
                <Radio selected={method === c.k} />
                <View
                  style={{
                    width: 48,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor:
                      c.k === "test" ? tokens.color.text : tokens.color.surface,
                  }}
                />
                <View style={{ flex: 1 }}>
                  <T variant="body" weight="semibold">
                    {c.title}
                  </T>
                  <T variant="sub" muted>
                    {c.sub}
                  </T>
                </View>
              </Pressable>
            )) : null}

            {!pg && method === "other" ? (
              <View style={{ paddingTop: 24, gap: 16 }}>
                <Input
                  label="카드 번호"
                  value={number}
                  onChangeText={(v) => setNumber(formatCardNumber(v))}
                  placeholder="0000 0000 0000 0000"
                  keyboardType="number-pad"
                  maxLength={19}
                  editable={!busy}
                  error={touched ? errors.number : undefined}
                />
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Input
                    label="유효기간"
                    value={expiry}
                    onChangeText={(v) => setExpiry(formatExpiry(v))}
                    placeholder="MM/YY"
                    keyboardType="number-pad"
                    maxLength={5}
                    editable={!busy}
                    error={touched ? errors.expiry : undefined}
                    style={{ flex: 1 }}
                  />
                  <Input
                    label="CVC"
                    value={cvc}
                    onChangeText={(v) => setCvc(digits(v).slice(0, 3))}
                    placeholder="뒷면 3자리"
                    keyboardType="number-pad"
                    maxLength={3}
                    editable={!busy}
                    error={touched ? errors.cvc : undefined}
                    style={{ flex: 1 }}
                  />
                </View>
                <T variant="caption" muted>
                  카드 정보는 저장하지 않아요. 할부는 일시불만 돼요.
                </T>
              </View>
            ) : null}

            <T variant="sub" muted style={{ marginTop: 12 }}>
              예약할 때 전액을 한 번에 결제해요. 신용·체크카드와 카드로 내는
              간편결제만 돼요.
            </T>
          </View>
        </Scroll>
      )}
      <BottomBar>
        <Button
          label={
            fail
              ? "다시 결제하기"
              : o
                ? `${won(o.totalAmount)} 결제하기`
                : "결제하기"
          }
          disabled={!o || config.data === null || closed}
          loading={busy}
          onPress={() => void pay()}
        />
        {fail ? (
          <Button
            label="주문서로 돌아가기"
            variant="text"
            onPress={() => router.back()}
            style={{ alignSelf: "center" }}
          />
        ) : null}
      </BottomBar>
      {toast.node}
    </Screen>
  );
}

// ---- 카드 입력 도우미 (화면 전용. 서버로는 보내지 않는다) ----

export function digits(v: string) {
  return v.replace(/\D/g, "");
}

/** 4자리씩 띄어 쓴다. 최대 16자리 */
export function formatCardNumber(v: string) {
  return (digits(v).slice(0, 16).match(/.{1,4}/g) ?? []).join(" ");
}

/** MM/YY. 월 첫 자리가 2~9면 앞에 0을 붙인다 */
export function formatExpiry(v: string) {
  let d = digits(v).slice(0, 4);
  if (d.length === 1 && Number(d) > 1) d = `0${d}`;
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function luhn(n: string) {
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let x = Number(n[i]);
    if (dbl) {
      x *= 2;
      if (x > 9) x -= 9;
    }
    sum += x;
    dbl = !dbl;
  }
  return n.length > 0 && sum % 10 === 0;
}

/** 이번 달 이후인지. now는 테스트용 주입 */
export function expiryValid(mmYY: string, now = new Date()) {
  const m = /^(\d{2})\/(\d{2})$/.exec(mmYY);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const cur = now.getFullYear() * 12 + now.getMonth(); // 0-based month index
  return year * 12 + (month - 1) >= cur;
}

export function validate(
  number: string,
  expiry: string,
  cvc: string,
  now = new Date(),
) {
  const e: { number?: string; expiry?: string; cvc?: string } = {};
  const n = digits(number);
  if (n.length !== 16) e.number = "카드 번호 16자리를 입력해 주세요";
  else if (!luhn(n)) e.number = "카드 번호를 다시 확인해 주세요";
  if (!/^\d{2}\/\d{2}$/.test(expiry)) e.expiry = "MM/YY로 입력해 주세요";
  else if (!expiryValid(expiry, now)) e.expiry = "유효기간이 지났어요";
  if (!/^\d{3}$/.test(cvc)) e.cvc = "뒷면 3자리를 입력해 주세요";
  return e;
}
