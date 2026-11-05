// 생산자 앱 뒤로 규칙(ia.md 4장, DEV-224). import 없는 순수 모듈(Mock 테스트가 node로 읽음).
// 앱 안 이전 화면이 있으면 그리로(goBackOr), 없으면 아래 부모 화면. 생산자 하위 화면은 대부분 고정 목록으로 간다.

/** 탭 첫 화면: 현황 `/`, 상품 `/products`, 채팅 `/chats`, 환경설정 `/settings`. */
export const TAB_ROOTS = ["/", "/products", "/chats", "/settings"] as const;

const RULES: [RegExp, string][] = [
  [/^\/products\/.+$/, "/products"], // 새 상품·판매페이지 만들기·편집·판매·가격·기간·물량·상세
  [/^\/chats\/[^/]+$/, "/chats?view=private"],
  [/^\/broadcast\/new$/, "/chats?view=news"],
  [/^\/farm\/ai-settings$/, "/settings"],
  [/^\/farm\/.+$/, "/farm"],
  [/^\/farm$/, "/settings"],
  [/^\/ship$/, "/"],
  [/^\/(privacy|terms)$/, "/"],
];

/** 앱 안 이전 화면이 없을 때 헤더 뒤로가 여는 화면. 표에 없으면 그 탭의 첫 화면, 아니면 현황. */
export function parentOf(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const [re, to] of RULES) if (re.test(path)) return to;
  const root = `/${path.split("/")[1] ?? ""}`;
  return (TAB_ROOTS as readonly string[]).includes(root) ? root : "/";
}
