import { usePathname, useRouter, type Href } from "expo-router";
import { useCallback } from "react";

import { parentOf } from "./backTargets";

type Router = ReturnType<typeof useRouter>;

/** 헤더 뒤로(DEV-224): 앱 안 이전 화면이 있으면 그리로, 없으면 fallback을 바꿔 연다. 맨 `router.back()`은 쓰지 않는다. */
export const goBackOr = (router: Router, fallback: string) =>
  router.canGoBack() ? router.back() : router.replace(fallback as Href);

/** 이 화면의 뒤로. fallback을 안 주면 ia.md 4장 부모 표(parentOf). */
export function useGoBack(fallback?: string) {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    () => goBackOr(router, fallback ?? parentOf(pathname)),
    [router, fallback, pathname],
  );
}
