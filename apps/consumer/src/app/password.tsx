// 비밀번호 변경 `/password` (DEV-363, FEAT-01 AC-01-30·31) — 내 정보 ‘비밀번호 변경’(아이디 계정만)과
// 운영자 임시 비밀번호로 들어온 뒤 강제 변경을 같이 쓴다. 강제면 닫기가 없고 바꾸기 전에는 다른 화면이 열리지 않는다(세션 관문).
// 바꾸면 서버가 그 계정의 다른 로그인을 모두 끊고 새 토큰을 준다.
import { auth } from "@farmclub/api";
import { Button, HeaderBar, PasswordChangeForm, Screen, Scroll, T, tokens } from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { useSession } from "../lib/session";
import { useToast } from "../lib/toast";

export default function Password() {
  const router = useRouter();
  const { user, ready, refresh, logout } = useSession();
  // 처음 열 때의 강제 여부를 지킨다(바꾼 직후 user가 바뀌어도 화면 문구가 흔들리지 않게)
  const [forced, setForced] = useState<boolean | null>(null);
  const toast = useToast();
  useEffect(() => {
    if (user && forced === null) setForced(!!user.mustChangePassword);
  }, [user, forced]);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (!user.username) router.replace("/me");
  }, [ready, user, router]);

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/me");
  }

  return (
    <Screen>
      {/* 강제 변경에는 뒤로가 없다 */}
      {forced ? <HeaderBar /> : <HeaderBar onBack={leave} />}
      <Scroll bottom={40}>
        <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 8, gap: 8 }}>
          <T variant="title" accessibilityRole="header">
            {forced ? "새 비밀번호를\n정해 주세요" : "비밀번호를\n바꿔요"}
          </T>
          <T variant="body" muted>
            {forced
              ? "임시 비밀번호로 들어왔어요. 새 비밀번호로 바꾸면 farmclub을 계속 쓸 수 있어요."
              : `아이디 ${user?.username ?? ""}의 비밀번호를 바꿔요.`}
          </T>
        </View>
        <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 24, gap: 12 }}>
          <PasswordChangeForm
            forced={!!forced}
            username={user?.username}
            onChange={async (current, next) => {
              await auth.changePassword(current, next);
              await refresh();
            }}
            onDone={() => {
              if (forced) router.replace("/");
              else {
                toast.show("비밀번호를 바꿨어요");
                setTimeout(leave, 600);
              }
            }}
          />
          {forced ? <Button label="로그아웃" variant="text" onPress={() => logout()} /> : null}
        </View>
      </Scroll>
      {toast.node}
    </Screen>
  );
}
