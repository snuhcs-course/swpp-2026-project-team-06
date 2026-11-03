// SCR-10 하위: 배송지 입력 `/checkout/:productId/address` (FEAT-08) — design: s-10-address
// ‘이 주소로 받기’ → 값을 주문서에 채우고 돌아간다. ‘기본 배송지로 저장’이면 주문 때 saveAddress. 닫기 → 입력 버리고 주문서.
import { auth } from "@farmclub/api";
import { useAsync } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AddressForm } from "../../../lib/AddressForm";
import { realName } from "../../../lib/onboarding";
import { useSession } from "../../../lib/session";

export default function CheckoutAddress() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();
  const { user, setPendingRecipient } = useSession();
  // 저장 배송지가 50개면 이번 주문에만 쓰고 저장하지 않는다(서버도 저장을 건너뛴다)
  const saved = useAsync(() => auth.addresses(), [user?.userId]);
  const full = (saved.data?.length ?? 0) >= 50;
  const back = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({
          pathname: "/checkout/[productId]",
          params: { productId },
        });

  return (
    <AddressForm
      mode="checkout"
      defaultName={realName(user?.name)}
      defaultPhone={user?.phone}
      saveBlocked={
        full ? "배송지가 50개라 이 주소는 이번 주문에만 써요. 배송지 관리에서 지우면 다시 저장할 수 있어요." : undefined
      }
      onClose={back}
      onDone={(v) => {
        setPendingRecipient(v);
        back();
      }}
    />
  );
}
