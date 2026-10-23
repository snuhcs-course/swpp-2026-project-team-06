// 승인 상태별로 열 수 있는 화면(세션 관문, AC-01-3, screens.md SCR-05 버튼 동작). React 없이 테스트할 수 있게 session.tsx에서 뺐다(DEV-108).
import type { User } from "@farmclub/api";

/** 로그인 입구. 로그인된 사용자는 농가 상태와 상관없이 여기 머물지 않고 상태별 첫 화면으로 간다 */
const LOGIN_ENTRY = ["/login", "/auth/kakao"];

/** 나머지 주소로 오면 home으로 보낸다 */
export function homeFor(user: User | null): {
  allowed: (p: string) => boolean;
  home: string;
} {
  // 비로그인: 로그인과 카카오 복귀(/auth/kakao)만 열린다
  if (!user) return { allowed: (p) => LOGIN_ENTRY.includes(p), home: "/login" };
  switch (user.farmStatus) {
    case "NONE":
      return { allowed: (p) => p === "/apply", home: "/apply" };
    case "PENDING":
      return { allowed: (p) => p === "/pending", home: "/pending" };
    case "REJECTED":
      return {
        allowed: (p) => p === "/pending" || p === "/apply",
        home: "/pending",
      };
    case "SUSPENDED":
      return { allowed: (p) => p === "/suspended", home: "/suspended" };
    default:
      return {
        allowed: (p) =>
          ![...LOGIN_ENTRY, "/apply", "/pending", "/suspended"].includes(p),
        home: "/",
      };
  }
}
