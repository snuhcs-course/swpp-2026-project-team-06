// SCR-17 하위: 배송지 추가·수정 `/me/addresses/edit?addressId=` (배송지 입력과 같은 화면, 결정 28) — design: s-10-address
import { auth } from "@farmclub/api";
import { useAsync } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AddressForm } from "../../../../lib/AddressForm";
import { setFlash } from "../../../../lib/flash";
import { useHideTabBar, useSession } from "../../../../lib/session";

export default function AddressEdit() {
  useHideTabBar();
  const { addressId } = useLocalSearchParams<{ addressId?: string }>();
  const router = useRouter();
  const { user } = useSession();
  const list = useAsync(
    () => (addressId ? auth.addresses() : Promise.resolve([])),
    [addressId],
  );
  const initial = list.data?.find((a) => a.addressId === addressId) ?? null;
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/me/addresses");

  return (
    <AddressForm
      mode="manage"
      initial={initial}
      defaultName={user?.name}
      onClose={back}
      onDone={() => {
        setFlash("저장했어요");
        back();
      }}
    />
  );
}
