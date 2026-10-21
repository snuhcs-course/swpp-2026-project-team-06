// SCR-06 첫 가입 온보딩 2/2 `/onboarding/address` (FEAT-01 I2, AC-01-15) — 첫 기본 배송지
// 받는 사람·연락처는 1/2에서 입력한 이름·휴대폰으로 채운다. 저장하거나 ‘주문할 때 입력할게요’로 건너뛰면 하려던 화면·행동으로 돌아간다.
import { T } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";

import { AddressForm } from "../../lib/AddressForm";
import { safeNext } from "../../lib/onboarding";
import { useSession } from "../../lib/session";

export default function OnboardingAddress() {
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNext(params.next);
  const router = useRouter();
  const { user, hasResume } = useSession();
  // 1/2로 돌아가지 않는다(가입 정보는 저장됨). 끝나면 원래 화면으로 — 그 화면이 resume을 보고 행동을 잇는다.
  // 관문에서 왔으면 원래 화면이 스택 아래에 있으니 뒤로 간다(로그인 화면과 같은 방식)
  const done = () => {
    if (hasResume && router.canGoBack()) router.back();
    else router.replace(next as never);
  };

  if (!user) return null;
  return (
    <AddressForm
      mode="manage"
      title=""
      back
      defaultName={user.name}
      defaultPhone={user.phone}
      alwaysDefault
      submitLabel="저장하고 시작하기"
      secondary={{ label: "주문할 때 입력할게요", onPress: done }}
      intro={
        <View style={{ gap: 8 }}>
          <T variant="sub" muted>
            2 / 2
          </T>
          <T variant="title" accessibilityRole="header">
            {"귤을 받을\n곳이에요"}
          </T>
          <T variant="body" muted>
            기본 배송지로 저장해요. 주문할 때 이 주소가 먼저 나와요.
          </T>
        </View>
      }
      onClose={done}
      onDone={done}
    />
  );
}
