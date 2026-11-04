// SCR-19 하위 · 생산자 정지 안내 `/suspended` (R-24, DEV-209) — design: s-19-suspended, docs/design/proposals/dev-209-suspended-rejected-contact.html
// 관문이 정지된 생산자를 어느 주소에서든 여기로 보낸다(lib/gate). 정지 중에도 farmclub 운영팀 대화방(/support)은 열린다(AC-34-9).
import { auth, farms } from "@farmclub/api";
import {
  Button,
  Screen,
  Scroll,
  T,
  business,
  safe,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { useSession } from "../lib/session";

export default function Suspended() {
  const router = useRouter();
  const { user } = useSession();
  const farm = useAsync(() => farms.mine().catch(() => null), [user?.userId]);
  return (
    <Screen>
      <Scroll bottom={160}>
        <View style={{ paddingHorizontal: 20, paddingTop: 72, gap: 12 }}>
          <T variant="sub" muted>
            {farm.data?.name ?? ""}
          </T>
          <T variant="title" accessibilityRole="header">
            계정이 정지됐어요
          </T>
          <T variant="body">
            판매 중이던 상품은 내려졌고, 출하 전 주문은 소비자에게 전액 환불돼요.
          </T>
        </View>
        {user?.suspendReason ? (
          <View
            testID="suspend-reason"
            style={{
              marginHorizontal: 20,
              marginTop: 32,
              padding: 16,
              paddingVertical: 20,
              borderRadius: tokens.radius.md,
              backgroundColor: tokens.color.surface,
              gap: 8,
            }}
          >
            <T variant="sub" weight="semibold" color={tokens.color.error}>
              정지 사유
            </T>
            <T variant="body">{user.suspendReason}</T>
          </View>
        ) : null}
        <View style={{ marginHorizontal: 20, marginTop: 24, gap: 8 }}>
          <T variant="sub" muted>
            사유가 사실과 다르거나 궁금한 점이 있으면 운영팀에 문의해 주세요.
            정지된 동안에도 farmclub 대화방은 열려 있어요.
          </T>
          {/* 메일은 빌드 변수 EXPO_PUBLIC_BUSINESS_EMAIL이 있을 때만(값은 레포에 두지 않는다) */}
          {business.email ? (
            <View testID="support-email">
              <T variant="sub" muted>
                메일 · <T variant="sub">{business.email}</T>
              </T>
            </View>
          ) : null}
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
          gap: 4,
          backgroundColor: tokens.color.background,
        }}
      >
        <Button
          label="운영팀에 문의하기"
          icon="chat"
          size="producer"
          onPress={() => router.push("/support")}
        />
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
