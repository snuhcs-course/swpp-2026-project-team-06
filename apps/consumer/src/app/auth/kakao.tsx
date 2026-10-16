// 카카오 로그인 복귀 /auth/kakao (FEAT-01 I2, ADR 0003) — 인가 코드를 서버에 넘기고 원래 화면·행동으로 돌아간다
import { ApiError, auth } from "@farmclub/api";
import { Button, EmptyState, HeaderBar, Screen, Skeleton, T } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { takeKakaoReturn } from "../../lib/kakao";
import { useSession } from "../../lib/session";

export default function KakaoCallback() {
  const { code, state, error } = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
  }>();
  const router = useRouter();
  const { refresh, restoreResume } = useSession();
  const [failed, setFailed] = useState<string | null>(null);
  const [next, setNext] = useState("/");
  const ran = useRef(false);

  useEffect(() => {
    // 인가 코드는 한 번만 쓸 수 있다. StrictMode·재렌더에서 두 번 보내지 않는다
    if (ran.current) return;
    ran.current = true;
    const saved = takeKakaoReturn();
    const target = saved?.next ?? "/";
    setNext(target);
    if (error || !code) {
      setFailed(
        error === "access_denied"
          ? "카카오 로그인을 취소했어요."
          : "카카오에서 인가 코드를 받지 못했어요.",
      );
      return;
    }
    if (!saved || saved.nonce !== state) {
      setFailed("로그인 요청이 만료됐어요. 다시 시도해 주세요.");
      return;
    }
    void (async () => {
      try {
        await auth.kakaoLogin(code, `${window.location.origin}/auth/kakao`);
        await refresh();
        if (saved.resume) restoreResume(saved.resume);
        router.replace(target as never);
      } catch (e) {
        setFailed(
          e instanceof ApiError
            ? e.message
            : "카카오 로그인에 실패했어요. 다시 시도해 주세요.",
        );
      }
    })();
  }, [code, state, error, refresh, restoreResume, router]);

  return (
    <Screen>
      <HeaderBar close onBack={() => router.replace(next as never)} />
      {failed ? (
        <EmptyState
          icon="alert"
          title={failed}
          body="테스트 계정 로그인으로도 계속할 수 있어요."
          action={
            <View style={{ gap: 8, alignItems: "center", marginTop: 12 }}>
              <Button
                label="다시 로그인"
                variant="outline"
                onPress={() =>
                  router.replace({ pathname: "/login", params: { next } })
                }
              />
              <Button
                label="홈으로"
                variant="text"
                onPress={() => router.replace("/")}
              />
            </View>
          }
        />
      ) : (
        <View style={{ paddingHorizontal: 20, paddingTop: 32, gap: 16 }}>
          <T variant="title" accessibilityRole="header">
            카카오로 로그인하는 중
          </T>
          <T variant="body" muted>
            잠시만 기다려 주세요. 끝나면 보던 화면으로 돌아가요.
          </T>
          <Skeleton width="100%" height={56} />
        </View>
      )}
    </Screen>
  );
}
