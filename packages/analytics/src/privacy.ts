// 개인정보 보호 규칙(N-05, ADR 0005). posthog-js에 의존하지 않는 순수 함수만 둔다(scripts/test-analytics.mjs가 직접 읽음).
// - 녹화: 입력칸은 전부 가리고, 개인정보가 보이는 경로는 글자 전부, 그 밖의 경로는 data-ph-private 영역만 가린다.
// - 이벤트: 트래킹 플랜에 있는 속성만 보내고, URL 쿼리는 지운다.

export type AppName = "consumer" | "producer";

/**
 * 주문서·입금 안내·배송지·주문·채팅·입금 계좌·내 정보·가입 온보딩·카카오 로그인 복귀처럼 이름·연락처·주소·메시지 본문이 보이는 경로.
 * 모달(Sheet)은 화면 밖 portal에 그려져 영역 표시가 닿지 않으므로 경로 단위로 가린다.
 */
export const PRIVATE_PATHS: Record<AppName, readonly string[]> = {
  consumer: ["/checkout", "/orders", "/chats", "/me", "/onboarding", "/auth"],
  producer: ["/chats", "/ship", "/pending", "/apply", "/farm/account", "/auth"],
};

/** 화면 일부만 가릴 때 붙이는 속성. react-native-web은 className을 받지 않아 dataSet(data-*)을 쓴다 */
export const PRIVATE_ATTR = "data-ph-private";
/** View에 펼쳐 넣는다: <View {...privateArea}>. RN 타입에는 dataSet이 없어 넓은 타입으로 둔다 */
export const privateArea = { dataSet: { phPrivate: "1" } } as Record<
  string,
  unknown
>;

export function isPrivatePath(app: AppName, pathname: string): boolean {
  return PRIVATE_PATHS[app].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

type MaskTarget =
  { closest?: (selector: string) => unknown } | null | undefined;

/** rrweb maskTextFn. 가릴 글자는 길이만 남기고 *로 바꾼다 */
export function maskText(
  app: AppName,
  pathname: string,
  text: string,
  element: MaskTarget,
): string {
  const inPrivateArea = !!element?.closest?.(`[${PRIVATE_ATTR}]`);
  if (!inPrivateArea && !isPrivatePath(app, pathname)) return text;
  return text.replace(/\S/g, "*");
}

/** URL에서 쿼리·해시를 지운다(검색어·로그인 복귀 경로 등이 섞이지 않게) */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

/** 앱이 직접 보내는 화면 이벤트(트래킹 플랜). 값은 내부 ID·수량·결과만 */
export type AppEvents = {
  product_viewed: { productId: string; farmId: string };
  checkout_started: { productId: string };
  checkout_submitted: { productId: string; orderId: string; quantity: number };
  deposit_reported: { orderId: string };
};
export type AppEventName = keyof AppEvents;

const ALLOWED_PROPS: { [E in AppEventName]: readonly (keyof AppEvents[E])[] } =
  {
    product_viewed: ["productId", "farmId"],
    checkout_started: ["productId"],
    checkout_submitted: ["productId", "orderId", "quantity"],
    deposit_reported: ["orderId"],
  };

/** 타입을 우회해 들어온 속성(이름·주소 등)도 런타임에 한 번 더 걸러 낸다 */
export function cleanProps<E extends AppEventName>(
  event: E,
  props: AppEvents[E],
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const key of ALLOWED_PROPS[event] as readonly string[]) {
    const v = (props as Record<string, unknown>)[key];
    if (
      typeof v === "number" ||
      typeof v === "boolean" ||
      (typeof v === "string" && v.length <= 64)
    )
      out[key] = v;
  }
  return out;
}

type Props = Record<string, unknown> | undefined;

/** before_send: 이벤트·사람 속성 가운데 URL 값의 쿼리를 지운다 */
export function scrubUrls(props: Props): void {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string" && /url|referrer/i.test(k))
      props[k] = stripQuery(v);
  }
  // 히트맵은 페이지 URL을 키로 모은다({ [url]: 클릭[] }). 쿼리를 지우고 같은 경로끼리 합친다
  const heat = props.$heatmap_data;
  if (heat && typeof heat === "object") {
    const merged: Record<string, unknown[]> = {};
    for (const [url, items] of Object.entries(heat as Record<string, unknown>))
      merged[stripQuery(url)] = [
        ...(merged[stripQuery(url)] ?? []),
        ...(Array.isArray(items) ? items : []),
      ];
    props.$heatmap_data = merged;
  }
}
