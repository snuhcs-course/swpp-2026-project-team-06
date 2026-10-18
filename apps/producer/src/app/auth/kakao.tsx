// 생산자 앱 카카오 로그인 복귀 /auth/kakao (FEAT-01 I2, AC-01-16, DEV-74)
// 인가 코드를 서버에 넘겨 생산자 계정으로 로그인한다. 처음이면 농가 없는 계정이 생기고, 세션 관문이 농가 상태별 화면으로 보낸다.
import { ApiError, auth } from "@farmclub/api";
import { Button, EmptyState, Screen, Skeleton, T } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { takeKakaoNonce } from "../../lib/kakao";
import { useSession } from "../../lib/session";

export default function KakaoCallback() {
  const { code, state, error } = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
  }>();
  const router = useRouter();
  const { refresh } = useSession();
  const [failed, setFailed] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // 인가 코드는 한 번만 쓸 수 있다. StrictMode·재렌더에서 두 번 보내지 않는다
    if (ran.current) return;
    ran.current = true;
    const nonce = takeKakaoNonce();
    if (error || !code) {
      setFailed(
        error === "access_denied"
          ? "카카오 로그인을 취소했어요."
          : "카카오에서 인가 코드를 받지 못했어요.",
      );
      return;
    }
    if (!nonce || nonce !== state) {
      setFailed("로그인 요청이 만료됐어요. 다시 시도해 주세요.");
      return;
    }
    void (async () => {
      try {
        await auth.kakaoLogin(code, `${window.location.origin}/auth/kakao`);
        // 관문이 농가 상태(없음 → 가입 신청, 확인 중·반려 → 대기, 승인 → 현황, 정지 → 안내)로 보낸다.
        // 사용자 조회가 실패하면 이 화면에 머물지 않게 안내한다
        const u = await refresh();
        if (!u) setFailed("로그인 정보를 불러오지 못했어요. 다시 시도해 주세요.");
      } catch (e) {
        setFailed(
          e instanceof ApiError
            ? e.message
            : "카카오 로그인에 실패했어요. 다시 시도해 주세요.",
        );
      }
    })();
  }, [code, state, error, refresh]);

  return (
    <Screen>
      {failed ? (
        <EmptyState
          icon="alert"
          title={failed}
          action={
            <View style={{ gap: 8, alignItems: "center", marginTop: 12 }}>
              <Button
                label="다시 로그인"
                variant="outline"
                size="producer"
                onPress={() => router.replace("/login")}
                style={{ paddingHorizontal: 24 }}
              />
            </View>
          }
        />
      ) : (
        <View style={{ paddingHorizontal: 20, paddingTop: 64, gap: 16 }}>
          <T variant="title" accessibilityRole="header">
            카카오로 로그인하는 중
          </T>
          <T variant="body" muted>
            잠시만 기다려 주세요. 농가 상태에 맞는 화면으로 이어져요.
          </T>
          <Skeleton width="100%" height={64} />
        </View>
      )}
    </Screen>
  );
}
