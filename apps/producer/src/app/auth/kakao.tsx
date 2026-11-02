// 생산자 앱 카카오 로그인 복귀 /auth/kakao (FEAT-01 I2, AC-01-16, DEV-74·DEV-108)
// 인가 코드를 서버에 넘겨 생산자 계정으로 로그인하고, 농가 상태별 첫 화면(gate.ts homeFor)으로 바로 보낸다.
// 처음이면 농가 없는 계정이 생겨 가입 신청으로 간다. 이미 로그인된 채 다시 열면(새로고침) 오류 없이 첫 화면으로 간다.
import { ApiError, auth, getToken, type User } from "@farmclub/api";
import { Button, EmptyState, Screen, T, tokens } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { homeFor } from "../../lib/gate";
import { takeKakaoNonce } from "../../lib/kakao";
import { useSession } from "../../lib/session";

/** 서버가 이만큼 답하지 않으면 멈춘 채 두지 않고 다시 로그인을 안내한다 */
const KAKAO_LOGIN_TIMEOUT_MS = 15_000;

class Timeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Timeout()), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

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
  // 관문이 먼저 다른 화면으로 보냈으면 여기서 다시 이동하지 않는다
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // 인가 코드는 한 번만 쓸 수 있다. StrictMode·재렌더에서 두 번 보내지 않는다
    if (ran.current) return;
    ran.current = true;
    const nonce = takeKakaoNonce();
    const goHome = (u: User) => {
      if (mounted.current) router.replace(homeFor(u).home as never);
    };

    // state가 없거나 다른데 토큰이 있으면 이미 로그인한 뒤 다시 연 것(새로고침·뒤로 가기)
    if (!error && (!nonce || nonce !== state) && getToken()) {
      void (async () => {
        let timedOut = false;
        try {
          const u = await withTimeout(refresh(), KAKAO_LOGIN_TIMEOUT_MS);
          if (u) return goHome(u);
        } catch (e) {
          timedOut = e instanceof Timeout;
        }
        if (mounted.current)
          setFailed(
            timedOut
              ? "로그인이 오래 걸리고 있어요. 다시 시도해 주세요."
              : "로그인 요청이 만료됐어요. 다시 시도해 주세요.",
          );
      })();
      return;
    }
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
        // 시간 제한 뒤 늦게 성공하면 토큰이 생겨 관문이 첫 화면으로 보낸다
        // 새 사용자는 계정 없이 가입 토큰만 온다. 약관 동의(/consent)에서 계정을 만든다(DEV-132)
        const u = await withTimeout(
          (async () => {
            const r = await auth.kakaoLogin(code, `${window.location.origin}/auth/kakao`);
            return r.signup ? ("signup" as const) : refresh();
          })(),
          KAKAO_LOGIN_TIMEOUT_MS,
        );
        if (u === "signup") {
          if (mounted.current) router.replace("/consent");
        } else if (u) goHome(u);
        else if (mounted.current)
          setFailed("로그인 정보를 불러오지 못했어요. 다시 시도해 주세요.");
      } catch (e) {
        if (!mounted.current) return;
        setFailed(
          e instanceof Timeout
            ? "로그인이 오래 걸리고 있어요. 다시 시도해 주세요."
            : e instanceof ApiError
              ? e.message
              : "카카오 로그인에 실패했어요. 다시 시도해 주세요.",
        );
      }
    })();
  }, [code, state, error, refresh, router]);

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
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="카카오 로그인 중이에요"
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            paddingHorizontal: 20,
          }}
        >
          <ActivityIndicator size="large" color={tokens.color.textMuted} />
          <T variant="body" muted>
            카카오 로그인 중이에요
          </T>
        </View>
      )}
    </Screen>
  );
}
