// SCR-05 로그인 — 테스트 계정 선택(ADR 0009) — design: scr-05
import { auth, isMock, type TestAccount } from "@farmclub/api";
import {
  Button,
  EmptyState,
  LegalFooter,
  HeaderBar,
  Notice,
  Radio,
  Screen,
  Scroll,
  Skeleton,
  T,
  ro,
  safe,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { beginKakaoLogin, kakaoRedirectUri } from "../lib/kakao";
import { useSession } from "../lib/session";
import { isStatus } from "../lib/views";

// 소비자 앱은 소비자 계정만(ADR 0010). 서버가 ?app=consumer로 거르지만 화면에서도 한 번 더 거른다.
const consumerOnly = (list: TestAccount[] | null) =>
  list?.filter((a) => a.role === "CONSUMER") ?? null;

export default function Login() {
  const { next, reason } = useLocalSearchParams<{
    next?: string;
    reason?: string;
  }>();
  const router = useRouter();
  const { refresh, resume, clearResume } = useSession();
  const { data: all, error, reload } = useAsync(() => auth.testAccounts(), []);
  // 카카오 로그인 사용 여부(ADR 0003). 꺼져 있으면 버튼을 숨긴다
  const kakao = useAsync(() => auth.kakaoConfig(), []);
  const data = consumerOnly(all);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 고정 하단 바 높이만큼 스크롤 아래를 비워 푸터가 바 바로 위에 온다(상태마다 바 높이가 다르다)
  const [barHeight, setBarHeight] = useState(170);
  const [failed, setFailed] = useState<string | null>(null);
  // 카카오가 켜져 있으면 카카오 로그인만 둔다(사용자 결정 10/17). 꺼져 있으면(CI·Mock 플래그만) 테스트 계정 목록을 보여 준다
  const showTest = kakao.error ? true : kakao.data ? !kakao.data.enabled : false;

  useEffect(() => {
    if (data && !picked) setPicked(data[0]?.userId ?? null);
  }, [data, picked]);

  const account = data?.find((a) => a.userId === picked);

  async function login() {
    if (!picked) return;
    setBusy(true);
    setFailed(null);
    try {
      await auth.testLogin(picked);
      await refresh();
      // 관문에서 왔으면 누른 화면으로 돌아가 그 화면이 행동을 잇는다(resume). 아니면 next로
      if (resume && router.canGoBack()) router.back();
      else router.replace((next && next.startsWith("/") ? next : "/") as never);
    } catch {
      setFailed("로그인하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const target = next && next.startsWith("/") ? next : "/";

  // 카카오로 시작하기(FEAT-01 I2). 돌아갈 화면·행동을 저장하고 카카오 인가 화면으로 나간다. 복귀는 /auth/kakao
  async function kakaoLogin() {
    const cfg = kakao.data;
    if (!cfg?.enabled || busy) return;
    setFailed(null);
    if (isMock) {
      // Mock: 리다이렉트 없이 바로 로그인(카카오 계정 u-kakao). 처음이면 가입 동의(DEV-132) → 온보딩
      setBusy(true);
      try {
        const res = await auth.kakaoLogin("mock", kakaoRedirectUri(cfg));
        await refresh();
        if (!res.user || res.user.needsOnboarding)
          router.replace({ pathname: "/onboarding", params: { next: target } });
        else if (resume && router.canGoBack()) router.back();
        else router.replace(target as never);
      } catch {
        setFailed("카카오 로그인에 실패했어요. 다시 시도해 주세요.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const url = beginKakaoLogin(cfg, target, resume);
    if (!url) {
      setFailed("이 브라우저에서는 카카오 로그인을 쓸 수 없어요. 테스트 계정으로 로그인해 주세요.");
      return;
    }
    window.location.assign(url);
  }

  return (
    <Screen>
      <HeaderBar
        close
        onBack={() => {
          // 닫기: 원래 화면으로, 행동은 실행하지 않는다
          clearResume();
          if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
      />
      <Scroll bottom={barHeight} footer={<LegalFooter onOpen={(path) => router.push(path)} />}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 8 }}>
          <T variant="title" accessibilityRole="header">
            {"로그인하고\n계속해요"}
          </T>
          <T variant="body" muted>
            예약·팔로우·채팅은 로그인이 필요해요. 끝나면 보던{" "}
            {next?.startsWith("/products") || next?.startsWith("/checkout")
              ? "상품"
              : "화면"}
            으로 돌아가요.
          </T>
          {reason === "signedout" ? (
            <Notice
              title="로그인이 풀렸어요"
              body="소비자 계정으로 다시 로그인해 주세요."
              style={{ marginTop: 8 }}
            />
          ) : null}
        </View>
        {kakao.data?.enabled ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 32, gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="카카오로 시작하기"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => void kakaoLogin()}
              style={({ pressed }) => ({
                minHeight: tokens.height.button,
                borderRadius: 12,
                backgroundColor: pressed ? "#F2D900" : "#FEE500",
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.6 : 1,
              })}
            >
              <T variant="body" weight="semibold" color="#191919">
                카카오로 시작하기
              </T>
            </Pressable>
            <T variant="caption" muted center>
              카카오에서는 이메일만 받아요. 닉네임·연락처·배송지는 처음 한 번만
              입력해요.
            </T>
          </View>
        ) : null}
        {!showTest ? null : error ? (
          isStatus(error, 404) ? (
            <EmptyState
              icon="lock"
              title="지금은 로그인할 수 없어요"
              body="테스트 로그인이 꺼져 있어요."
            />
          ) : (
            <EmptyState
              icon="alert"
              title="계정 목록을 불러오지 못했어요"
              action={
                <Button
                  label="다시 시도"
                  variant="outline"
                  onPress={reload}
                  style={{ alignSelf: "center", marginTop: 12 }}
                />
              }
            />
          )
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
            <T variant="sub" muted style={{ paddingBottom: 8 }}>
              소비자 테스트 계정을 골라 주세요
            </T>
            {!data
              ? [0, 1].map((i) => (
                  <Skeleton
                    key={i}
                    width="100%"
                    height={56}
                    style={{ marginBottom: 8 }}
                  />
                ))
              : data.map((a, i) => (
                  <Pressable
                    key={a.userId}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: picked === a.userId }}
                    onPress={() => setPicked(a.userId)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 16,
                      minHeight: 64,
                      borderTopWidth: 1,
                      borderTopColor: tokens.color.border,
                      borderBottomWidth: i === data.length - 1 ? 1 : 0,
                      borderBottomColor: tokens.color.border,
                    }}
                  >
                    <Radio selected={picked === a.userId} />
                    <View style={{ flex: 1 }}>
                      <T variant="body" weight="semibold">
                        {a.name}
                      </T>
                      <T variant="sub" muted>
                        소비자
                      </T>
                    </View>
                  </Pressable>
                ))}
            <T variant="sub" muted style={{ paddingTop: 16 }}>
              농가는 생산자 앱에서 따로 로그인해요.
            </T>
          </View>
        )}
      </Scroll>
      <View
        testID="login-bottom-bar"
        onLayout={(e) => setBarHeight(Math.ceil(e.nativeEvent.layout.height))}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: safe("bottom", 28),
          gap: 12,
          backgroundColor: "#FFFFFF",
        }}
      >
        {failed ? (
          <T variant="sub" color={tokens.color.error} center>
            {failed}
          </T>
        ) : null}
        <T variant="caption" muted center>
          {kakao.data?.enabled
            ? "이용약관·개인정보 처리방침 동의는 처음 가입할 때 받아요 · 테스트 서비스"
            : "로그인하면 이용약관과 개인정보 처리방침에 동의하게 돼요 · 테스트 서비스"}
        </T>
        {showTest ? (
          <Button
            label={account ? `${ro(account.name)} 로그인` : "로그인"}
            disabled={!account}
            loading={busy}
            onPress={login}
          />
        ) : null}
      </View>
    </Screen>
  );
}
