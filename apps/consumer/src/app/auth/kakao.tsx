// 카카오 로그인 복귀 /auth/kakao (FEAT-01 I2, ADR 0003) — 인가 코드를 서버에 넘기고 원래 화면·행동으로 돌아간다
// 이미 로그인된 채 다시 열면(새로고침) 오류 없이 홈(온보딩이 남았으면 SCR-06)으로 간다. 생산자 앱과 같은 모양·시간 제한(DEV-108, DEV-112)
import { ApiError, auth, getToken } from "@farmclub/api";
import { Button, EmptyState, HeaderBar, Screen, T, tokens } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { takeKakaoReturn } from "../../lib/kakao";
import { useSession } from "../../lib/session";

/** 서버가 이만큼 답하지 않으면 멈춘 채 두지 않고 다시 로그인을 안내한다 */
const KAKAO_LOGIN_TIMEOUT_MS = 15_000;
const TIMEOUT_MESSAGE = "로그인이 오래 걸리고 있어요. 다시 시도해 주세요.";

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
  const { refresh, restoreResume } = useSession();
  const [failed, setFailed] = useState<string | null>(null);
  const [next, setNext] = useState("/");
  const ran = useRef(false);
  // 화면을 떠난 뒤 늦게 온 결과로 다시 이동하거나 오류를 띄우지 않는다
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
    const saved = takeKakaoReturn();
    const target = saved?.next ?? "/";
    setNext(target);
    // state가 없거나 다른데 토큰이 있으면 이미 로그인한 뒤 다시 연 것(새로고침·뒤로 가기). 돌아갈 화면은 이미 쓰였으니 홈으로
    if (!error && (!saved || saved.nonce !== state) && getToken()) {
      void (async () => {
        let timedOut = false;
        try {
          const me = await withTimeout(auth.me(), KAKAO_LOGIN_TIMEOUT_MS);
          if (!mounted.current) return;
          if (me.needsOnboarding)
            router.replace({ pathname: "/onboarding", params: { next: "/" } });
          else router.replace("/");
          return;
        } catch (e) {
          timedOut = e instanceof Timeout;
        }
        if (mounted.current)
          setFailed(
            timedOut ? TIMEOUT_MESSAGE : "로그인 요청이 만료됐어요. 다시 시도해 주세요.",
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
    if (!saved || saved.nonce !== state) {
      setFailed("로그인 요청이 만료됐어요. 다시 시도해 주세요.");
      return;
    }
    void (async () => {
      try {
        // 시간 제한 뒤 늦게 성공하면 토큰은 남는다. 다시 로그인하거나 홈으로 가면 로그인된 채로 이어진다
        const res = await withTimeout(
          auth
            .kakaoLogin(code, `${window.location.origin}/auth/kakao`)
            .then(async (r) => {
              await refresh();
              return r;
            }),
          KAKAO_LOGIN_TIMEOUT_MS,
        );
        if (!mounted.current) return;
        if (saved.resume) restoreResume(saved.resume);
        // 처음이면 가입 동의(계정 생성, DEV-132)·온보딩(SCR-06) → 원래 화면. 다시 온 회원은 바로 원래 화면(AC-01-13)
        if (!res.user || res.user.needsOnboarding)
          router.replace({ pathname: "/onboarding", params: { next: target } });
        else router.replace(target as never);
      } catch (e) {
        if (!mounted.current) return;
        setFailed(
          e instanceof Timeout
            ? TIMEOUT_MESSAGE
            : e instanceof ApiError
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
