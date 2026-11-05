// 뒤로 규칙(ia.md 4장, DEV-224). 다른 파일을 import하지 않는 순수 모듈이라 Mock 테스트가 node로 바로 읽는다.
// - 앱 안 이전 화면이 있으면 그리로(goBackOr). 없으면(주소로 바로 열기·새로고침) 아래 표의 부모 화면.
// - 상품·농가 정보·주문 상세에서 연 1:1 방은 연 화면으로 간다(roomBackTarget, PM 결정 a1).

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const enc = encodeURIComponent;

/** 탭 첫 화면(ia.md 2장): 발견 `/`, 내 주문 `/orders`, 채팅 `/chats`, 내 정보 `/me`. */
export const TAB_ROOTS = ["/", "/orders", "/chats", "/me"] as const;

const RULES: [RegExp, (m: RegExpMatchArray, p: Params) => string][] = [
  [/^\/farms\/([^/]+)\/info$/, (m) => `/farms/${m[1]}`],
  [/^\/farms\/[^/]+$/, () => "/"], // 소식방 직접 링크는 홈(storefront 1.5)
  [/^\/farms$/, () => "/"],
  [/^\/news\/[^/]+$/, () => "/"], // 소식방 직접 진입은 홈(conversation-ui 1.6)
  [/^\/products\/[^/]+$/, () => "/"], // 상품 화면은 농가를 알면 그 농가를 넘긴다
  [/^\/checkout\/([^/]+)\/pay$/, (m, p) => {
    const orderId = one(p.orderId);
    return orderId ? `/orders/${enc(orderId)}` : `/products/${m[1]}`;
  }],
  [/^\/checkout\/([^/]+)\/address$/, (m) => `/checkout/${m[1]}`],
  [/^\/checkout\/([^/]+)$/, (m) => `/products/${m[1]}`],
  [/^\/orders\/([^/]+)\/inquiry$/, (m) => `/orders/${m[1]}`],
  [/^\/orders\/[^/]+\/done$/, () => "/orders"],
  [/^\/orders\/[^/]+$/, () => "/orders"],
  [/^\/chats\/[^/]+$/, () => "/chats?view=private"], // 1:1·farmclub 방
  [/^\/me\/addresses\/edit$/, () => "/me/addresses"],
  [/^\/me\/[^/]+$/, () => "/me"],
  [/^\/(privacy|terms)$/, () => "/"],
];

/** 앱 안 이전 화면이 없을 때 헤더 뒤로가 여는 화면. 표에 없으면 그 탭의 첫 화면. */
export function parentOf(pathname: string, params: Params = {}): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const [re, to] of RULES) {
    const m = path.match(re);
    if (m) return to(m, params);
  }
  const root = `/${path.split("/")[1] ?? ""}`;
  return (TAB_ROOTS as readonly string[]).includes(root) ? root : "/";
}

/** 1:1 방을 연 화면(a1). null이면 보통 규칙(채팅 목록에서 열었거나 주소로 열었음). */
export function roomBackTarget(p: Params): string | null {
  const farmId = one(p.farmId);
  const productId = one(p.productId);
  const from = one(p.from);
  const fromOrder = one(p.fromOrder);
  if (productId) return `/products/${enc(productId)}`;
  if (from === "info" && farmId) return `/farms/${enc(farmId)}/info`;
  if (from === "order" && fromOrder) return `/orders/${enc(fromOrder)}`;
  return null;
}
