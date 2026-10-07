// SCR-19 하위 · 생산자 정지 안내 `/suspended` (R-24) — design: s-19-suspended. 관문이 정지된 생산자를 어느 주소에서든 여기로 보낸다(lib/session)
import { auth, farms } from "@farmclub/api";
import { Button, Screen, Scroll, T, safe, useAsync } from "@farmclub/ui";
import { View } from "react-native";

import { useSession } from "../lib/session";

export default function Suspended() {
  const { user } = useSession();
  const farm = useAsync(() => farms.mine().catch(() => null), [user?.userId]);
  return (
    <Screen>
      <Scroll bottom={120}>
        <View style={{ paddingHorizontal: 20, paddingTop: 72, gap: 12 }}>
          <T variant="sub" muted>
            {farm.data?.name ?? ""}
          </T>
          <T variant="title" accessibilityRole="header">
            계정이 정지됐어요
          </T>
          {user?.suspendReason ? (
            <T variant="sub" weight="semibold">
              사유 · {user.suspendReason}
            </T>
          ) : null}
          <T variant="body" style={{ marginTop: 12 }}>
            판매 중이던 상품은 내려졌고 예약한 소비자에게는 전액 환불돼요.
          </T>
          <T variant="sub" muted>
            궁금한 점은 farmclub 운영팀 [운영팀 연락처]로 문의해 주세요.
          </T>
        </View>
      </Scroll>
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: safe("bottom", 16),
        }}
      >
        <Button
          label="로그아웃"
          variant="text"
          onPress={() => auth.logout()}
          style={{ alignSelf: "center" }}
        />
      </View>
    </Screen>
  );
}
