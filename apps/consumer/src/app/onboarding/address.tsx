// 예전 SCR-06 2/2 `/onboarding/address` — 가입 때 배송지를 받지 않게 되어(DEV-142) `/onboarding`으로 보낸다.
// 배송지는 첫 주문서(SCR-10)에서 받는 사람·주소로 받는다. 예전 링크·새로고침이 빈 화면이 되지 않게 남겨 둔다.
import { Redirect, useLocalSearchParams } from "expo-router";

import { safeNext } from "../../lib/onboarding";

export default function OnboardingAddress() {
  const params = useLocalSearchParams<{ next?: string }>();
  return <Redirect href={{ pathname: "/onboarding", params: { next: safeNext(params.next) } }} />;
}
