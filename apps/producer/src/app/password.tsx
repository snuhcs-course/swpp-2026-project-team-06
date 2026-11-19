// 비밀번호 변경 `/password` (DEV-363, FEAT-01 AC-01-30·31) — 환경설정 ‘비밀번호 변경’(아이디 계정만)과
// 운영자 임시 비밀번호로 들어온 뒤 강제 변경을 같이 쓴다. 강제면 뒤로가 없고 관문이 다른 화면을 열지 않는다.
// 바꾸면 서버가 그 계정의 다른 로그인을 모두 끊고 새 토큰을 준다. 다시 읽으면 관문이 상태별 화면으로 보낸다.
import { auth } from "@farmclub/api";
import { Button, HeaderBar, PasswordChangeForm, Screen, Scroll, T, tokens } from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { homeFor } from "../lib/gate";
import { useSession } from "../lib/session";

export default function Password() {
  const router = useRouter();
  const { user, refresh, toast } = useSession();
  const [forced, setForced] = useState<boolean | null>(null);
  useEffect(() => {
    if (user && forced === null) setForced(!!user.mustChangePassword);
  }, [user, forced]);

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  }

  return (
    <Screen>
      {forced ? <HeaderBar title="비밀번호 바꾸기" /> : <HeaderBar title="비밀번호 바꾸기" onBack={leave} />}
      <Scroll bottom={40}>
        <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 8, gap: 8 }}>
          <T variant="title" accessibilityRole="header">
            {forced ? "새 비밀번호를\n정해 주세요" : "비밀번호를\n바꿔요"}
          </T>
          {forced ? (
            <T variant="body" muted>
              임시 비밀번호로 들어왔어요. 새 비밀번호로 바꾸면 농가 화면을 계속 쓸 수 있어요.
            </T>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 24, gap: 12 }}>
          <PasswordChangeForm
            size="producer"
            forced={!!forced}
            username={user?.username}
            onChange={async (current, next) => {
              await auth.changePassword(current, next);
            }}
            onDone={async () => {
              toast("비밀번호를 바꿨어요");
              if (!forced) return leave();
              // 강제 변경이 끝나면 상태별 첫 화면으로(이 화면은 아이디 계정이면 열려 있어 관문이 옮기지 않는다)
              const next = await refresh();
              router.replace(homeFor(next).home as never);
            }}
          />
          {forced ? (
            <Button label="로그아웃" variant="text" size="producer" onPress={() => auth.logout()} />
          ) : null}
        </View>
      </Scroll>
    </Screen>
  );
}
