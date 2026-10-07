// SCR-10 하위: 배송지 입력 `/checkout/:productId/address` (FEAT-08) — design: s-10-address
// ‘이 주소로 받기’ → 값을 주문서에 채우고 돌아간다. ‘기본 배송지로 저장’이면 주문 때 saveAddress. 닫기 → 입력 버리고 주문서.
import { useLocalSearchParams, useRouter } from "expo-router";

import { AddressForm } from "../../../lib/AddressForm";
import { useSession } from "../../../lib/session";

export default function CheckoutAddress() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();
  const { user, setPendingRecipient } = useSession();
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
      defaultName={user?.name}
      onClose={back}
      onDone={(v) => {
        setPendingRecipient(v);
        back();
      }}
    />
  );
}
