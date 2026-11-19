// SCR-05 로그인 — 카카오(ADR 0003)·아이디·비밀번호(DEV-363, 운영자가 만든 계정)·테스트 계정 선택(ADR 0009) — design: scr-05
import { auth, evaluatorBuild, isMock, type TestAccount } from "@farmclub/api";
import {
  BrandLogo,
  Button,
  EmptyState,
  LegalFooter,
  HeaderBar,
  Notice,
  PasswordLoginForm,
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
import { Pressable, View, useWindowDimensions } from "react-native";

import { beginKakaoLogin, kakaoRedirectUri } from "../lib/kakao";
import { openKakaoAuth } from "../lib/kakaoAuth";
import { accountGatePath, useSession } from "../lib/session";
import { isStatus } from "../lib/views";

// 소비자 앱은 소비자 계정만(ADR 0010). 서버가 ?app=consumer로 거르지만 화면에서도 한 번 더 거른다.
const consumerOnly = (list: TestAccount[] | null) =>
  list?.filter((a) => a.role === "CONSUMER") ?? null;

// 평가용 주소(?evaluator=1, DEV-198)로 한 번 들어오면 이 브라우저(기기)에서 기억한다.
// 로그아웃하거나 관문을 거쳐 맨 /login으로 와도, 홈 화면에 추가한 PWA가 start_url(/)로 새 창을 열어도
// 테스트 계정 목록이 남는다(11/03 PWA 점검: sessionStorage만으로는 홈 아이콘에서 카카오 버튼만 보였다).
// 표시는 테스트 계정 목록을 실제로 받은 뒤에만 남기고, 테스트 로그인이 꺼졌으면 지운다(DEV-283).
const EVALUATOR_KEY = "farmclub:evaluator";
function evaluatorMode(param?: string) {
  // 앱 평가용 빌드(DEV-200)는 주소 없이도 목록을 보인다
  if (evaluatorBuild) return true;
  if (param === "1") return true;
  try {
    return (
      globalThis.localStorage?.getItem(EVALUATOR_KEY) === "1" ||
      globalThis.sessionStorage?.getItem(EVALUATOR_KEY) === "1"
    );
  } catch {
    return false;
  }
}
function rememberEvaluator(on: boolean) {
  try {
    if (on) {
      globalThis.localStorage?.setItem(EVALUATOR_KEY, "1");
    } else {
      globalThis.localStorage?.removeItem(EVALUATOR_KEY);
      globalThis.sessionStorage?.removeItem(EVALUATOR_KEY);
    }
  } catch {
    // 저장소를 못 쓰는 브라우저는 주소(?evaluator=1)로만 평가 모드가 된다
  }
}

export default function Login() {
  const { next, reason, evaluator, from } = useLocalSearchParams<{
    next?: string;
    reason?: string;
    evaluator?: string;
    from?: string;
  }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  // 조합형 로고는 생산자 SCR-19(DEV-85)와 같은 자리, 폭 150(DEV-311 결정 ⑤). 좁은 폭에서는 제목 칸 196px(‘예약을 이어 가요’ 177px + 여유)을 남기고 줄인다
  const logoWidth = Math.min(150, Math.max(96, width - 236));
  // 관문 시트에서 예약으로 왔으면 제목이 예약을 이어 간다고 말한다(DEV-268 UX ⑤, DEV-356). 그 밖의 진입은 지금 제목 그대로
  const title =
    from === "reserve" ? "로그인하고\n예약을 이어 가요" : "로그인하고\n계속해요";
  const { refresh, resume: pending, clearResume } = useSession();
  // 이어서 할 행동은 관문 시트에서 온 로그인(from)만 쓴다. 관문 로그인을 브라우저 뒤로로 나가면 행동이 남는데,
  // 나중에 직접 연 로그인(내 정보 버튼·로그인 풀림 등)이 그 행동을 이어 붙이지 않게 지운다(DEV-222, 결정 25)
  const resume = from ? pending : null;
  useEffect(() => {
    if (!from) clearResume();
  }, [from, clearResume]);
  const { data: all, error, reload } = useAsync(() => auth.testAccounts(), []);
  // 카카오 로그인 사용 여부(ADR 0003). 꺼져 있으면 버튼을 숨긴다
  const kakao = useAsync(() => auth.kakaoConfig(), []);
  const data = consumerOnly(all);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 고정 하단 바는 테스트 계정 목록이 있을 때만 둔다. 그 높이만큼 스크롤 아래를 비운다(DEV-283)
  const [barHeight, setBarHeight] = useState(170);
  const [failed, setFailed] = useState<string | null>(null);
  // 카카오가 켜져 있으면 카카오 로그인만 둔다(사용자 결정 10/17). 꺼져 있으면(CI·Mock 플래그만) 테스트 계정 목록을 보여 준다.
  // Mock 모드는 시드 데이터 시연에 계정이 필요해 카카오 버튼과 목록을 함께 둔다(생산자 SCR-19와 같음, DEV-136)
  // 평가용 주소(?evaluator=1, DEV-198)는 카카오가 켜진 운영에서도 테스트 계정 목록을 함께 둔다
  const kakaoOn = !!kakao.data?.enabled;
  const wantsEvaluator = evaluatorMode(evaluator);
  const evaluatorOnly = kakaoOn && !isMock && wantsEvaluator;
  // 평가 표시만으로 목록을 여는데 서버 테스트 로그인이 꺼졌거나(404) 소비자 계정이 없으면 낡은 표시다.
  // 표시를 지우고 운영 화면(카카오만)을 보인다(DEV-283)
  const staleEvaluator =
    evaluatorOnly && (isStatus(error, 404) || data?.length === 0);
  useEffect(() => {
    if (!evaluatorOnly || evaluatorBuild) return;
    if (staleEvaluator) rememberEvaluator(false);
    else if (evaluator === "1" && data?.length) rememberEvaluator(true);
  }, [evaluatorOnly, staleEvaluator, evaluator, data]);
  const showTest = kakao.error
    ? true
    : kakao.data
      ? !kakaoOn || isMock || (wantsEvaluator && !staleEvaluator)
      : false;

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

  // 아이디·비밀번호 로그인(DEV-363). 임시 비밀번호면 비밀번호 변경, 약관 동의 전이면 온보딩(SCR-06)으로.
  // 실패는 폼이 보인다(틀리면 한 문구, 잠기면 남은 분)
  async function passwordLogin(username: string, password: string) {
    setFailed(null);
    const res = await auth.passwordLogin(username, password);
    await refresh();
    // 관문(임시 비밀번호·동의 전)은 세션이 옮긴다(여기서도 옮기면 같은 화면이 두 번 쌓인다)
    if (accountGatePath(res.user)) return;
    if (resume && router.canGoBack()) router.back();
    else router.replace(target as never);
  }

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
    // 웹: 페이지째 카카오로 이동(돌아오지 않음). 앱: 인증 세션이 닫히면 받은 코드로 복귀 화면을 연다(DEV-33)
    setBusy(true);
    try {
      const result = await openKakaoAuth(url);
      if (result) router.replace({ pathname: "/auth/kakao", params: result });
    } finally {
      setBusy(false);
    }
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
      <Scroll
        bottom={showTest ? barHeight : safe("bottom", 16)}
        footer={<LegalFooter onOpen={(path) => router.push(path)} />}
      >
        <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 8, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <T
              variant="title"
              accessibilityRole="header"
              style={{ flex: 1, minWidth: 0 }}
            >
              {title}
            </T>
            <BrandLogo variant="full" width={logoWidth} />
          </View>
          {reason === "signedout" ? (
            <Notice
              title="로그인이 풀렸어요"
              body="소비자 계정으로 다시 로그인해 주세요."
              style={{ marginTop: 8 }}
            />
          ) : null}
        </View>
        {kakaoOn ? (
          <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.lg, gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="카카오로 시작하기"
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
            {/* 개발 용어(Mock)는 isMock일 때만. 운영 문구는 약관 동의 안내 한 줄(DEV-283) */}
            <T variant="caption" muted>
              {isMock
                ? "Mock: 카카오로 시작하면 처음 가입하는 새 소비자로 들어가요"
                : "약관 동의와 연락처는 처음 가입할 때 한 번만 받아요"}
            </T>
            {failed && !showTest ? (
              <T variant="sub" color={tokens.color.error}>
                {failed}
              </T>
            ) : null}
          </View>
        ) : null}
        {/* 아이디·비밀번호 로그인(DEV-363). 계정은 운영자가 만들어 공개 가입 버튼은 없다(PM 11/18). 평가용 테스트 계정 목록은 그대로 아래에 */}
        <View
          testID="password-login-section"
          style={{ paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.lg, gap: 16 }}
        >
          {kakaoOn ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: tokens.color.border }} />
              <T variant="caption" muted>
                또는 아이디로 로그인
              </T>
              <View style={{ flex: 1, height: 1, backgroundColor: tokens.color.border }} />
            </View>
          ) : null}
          <PasswordLoginForm onLogin={passwordLogin} disabled={busy} />
        </View>
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
          <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: tokens.space.lg }}>
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
                    aria-checked={picked === a.userId}
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
      {/* 운영(카카오만)에는 고정 바가 없고 동의 안내는 카카오 버튼 아래 글에 합쳤다(DEV-283) */}
      {showTest ? (
        <View
          testID="login-bottom-bar"
          onLayout={(e) =>
            setBarHeight(Math.ceil(e.nativeEvent.layout.height))
          }
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: tokens.space.gutter,
            paddingTop: 12,
            paddingBottom: safe("bottom", 28),
            gap: 12,
            backgroundColor: "#FFFFFF",
          }}
        >
          {failed ? (
            <T variant="sub" color={tokens.color.error}>
              {failed}
            </T>
          ) : null}
          <T variant="caption" muted>
            {kakaoOn
              ? "이용약관·개인정보 처리방침 동의는 처음 가입할 때 받아요 · 테스트 서비스"
              : "로그인하면 이용약관과 개인정보 처리방침에 동의하게 돼요 · 테스트 서비스"}
          </T>
          <Button
            label={account ? `${ro(account.name)} 로그인` : "로그인"}
            disabled={!account}
            loading={busy}
            onPress={login}
          />
        </View>
      ) : null}
    </Screen>
  );
}
