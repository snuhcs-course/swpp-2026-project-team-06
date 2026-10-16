// PortOne V2 브라우저 SDK 로더·호출 (FEAT-09 I2, DEV-36). npm 의존성 없이 CDN 스크립트를 한 번만 넣는다.
import type { PaymentConfig } from "@farmclub/api";

const SDK_URL = "https://cdn.portone.io/v2/browser-sdk.js";

type RequestPaymentInput = {
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  currency: "CURRENCY_KRW";
  payMethod: "CARD";
  customData?: string;
  redirectUrl?: string;
  customer?: { fullName?: string; phoneNumber?: string };
};

/** 실패면 code·message, 성공이면 paymentId만 온다(리다이렉트 환경에서는 돌아오지 않는다) */
export type RequestPaymentResult = {
  code?: string;
  message?: string;
  paymentId?: string;
  transactionType?: string;
};

type PortOneSdk = {
  requestPayment: (input: RequestPaymentInput) => Promise<RequestPaymentResult>;
};

declare global {
  interface Window {
    PortOne?: PortOneSdk;
  }
}

let loading: Promise<PortOneSdk> | null = null;

export function loadPortOne(): Promise<PortOneSdk> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.PortOne) return Promise.resolve(window.PortOne);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onload = () =>
        window.PortOne ? resolve(window.PortOne) : reject(new Error("PortOne SDK not found"));
      script.onerror = () => {
        loading = null;
        reject(new Error("PortOne SDK load failed"));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

/** 주문마다 새 결제 ID. 같은 ID로는 다시 결제할 수 없어 시도마다 바꾼다 */
export function newPaymentId(orderId: string) {
  return `fc-${orderId}-${Date.now().toString(36)}`;
}

/** 리다이렉트로 돌아올 주소. PortOne이 paymentId·code·message 쿼리를 덧붙인다 */
export function redirectUrl() {
  const u = new URL(window.location.href);
  u.searchParams.delete("code");
  u.searchParams.delete("message");
  u.searchParams.delete("paymentId");
  u.searchParams.delete("transactionType");
  return u.toString();
}

export async function requestCardPayment(
  config: PaymentConfig,
  input: {
    paymentId: string;
    orderId: string;
    orderName: string;
    totalAmount: number;
    customer?: { fullName?: string; phoneNumber?: string };
  },
): Promise<RequestPaymentResult> {
  if (!config.enabled || !config.storeId || !config.channelKey) {
    return { code: "DISABLED", message: "지금은 카드 결제를 쓸 수 없어요." };
  }
  const sdk = await loadPortOne();
  return sdk.requestPayment({
    storeId: config.storeId,
    channelKey: config.channelKey,
    paymentId: input.paymentId,
    orderName: input.orderName,
    totalAmount: input.totalAmount,
    currency: "CURRENCY_KRW",
    payMethod: "CARD",
    // 서버가 결제 조회 때 주문을 대조한다
    customData: JSON.stringify({ orderId: input.orderId }),
    redirectUrl: redirectUrl(),
    customer: input.customer,
  });
}
