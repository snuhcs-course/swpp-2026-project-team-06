// SCR-19 로그인(생산자 앱) — 카카오로 시작하기(I2, DEV-74), 아이디·비밀번호(DEV-363, 운영자가 만든 계정, 카카오가 켜지면 접어 둠 DEV-378) 또는 개발/Mock 생산자 테스트 계정 선택(ADR 0009·0010) — design: p-scr-19
import { auth, isMock, type TestAccount } from "@farmclub/api";
import {
  BrandLogo,
  Button,
  EmptyState,
  IdLoginSection,
  LegalFooter,
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
import { useSession } from "../lib/session";
import { isStatus } from "../lib/views";

const SUB: Record<string, string> = {
  APPROVED: "승인됨",
  PENDING: "확인 중",
  REJECTED: "반려됨",
  SUSPENDED: "정지됨",
};
// 디자인 순서: 승인 · 확인 중 · 반려 · 정지 · 신규(농가 없음)
const ORDER: Record<string, number> = {
  APPROVED: 0,
  PENDING: 1,
  REJECTED: 2,
  SUSPENDED: 3,
  NONE: 4,
};
const sub = (a: TestAccount) =>
  a.farmName && SUB[a.farmStatus]
    ? `${a.farmName} · ${SUB[a.farmStatus]}`
    : "아직 농가 등록 안 함 · 가입 신청 시험용";
const NEW_PRODUCER = "u-new";

// 시드 계정은 개발 빌드·명시적 Mock에서만 쓴다(AC-01-34). release 실서버 앱은 목록도 요청하지 않는다.
const testLoginAvailable = __DEV__ || isMock;

export default function Login() {
  const { width } = useWindowDimensions();
  // Reserve 140px for the two title lines, 40px gutters, and the 8px gap.
  const logoWidth = Math.min(172, Math.max(96, width - 188));
  const router = useRouter();
  // 1이면 아이디 로그인을 처음부터 펼친다(웹 심사·평가 안내용 보조 주소, DEV-378)
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { refresh } = useSession();
  const { data, error, reload } = useAsync(
    () => testLoginAvailable
      ? auth.testAccounts().then((l) =>
          l.filter((a) => a.role === "PRODUCER").sort(
            (a, b) => (ORDER[a.farmStatus] ?? 9) - (ORDER[b.farmStatus] ?? 9),
          ),
        )
      : Promise.resolve([]),
    [],
  );
  const kakao = useAsync(() => auth.kakaoConfig(), []);
  const kakaoOn = !!kakao.data?.enabled;
  const showTest = testLoginAvailable &&
    (isMock || !!kakao.error || (!!kakao.data && !kakaoOn));
  // 아이디 로그인(DEV-378): 소비자 SCR-05와 같은 규칙. 카카오 설정을 받은 뒤에만 그리고, 운영 모양이면 사업자 정보 칸 바로 위
  const kakaoReady = !!kakao.data || !!kakao.error;
  const idAtFooter = kakaoOn && !showTest;
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 고정 하단 바('○○으로 시작하기')는 테스트 계정 목록이 있을 때만 둔다. 그 높이만큼 스크롤 아래를 비운다
  const [barHeight, setBarHeight] = useState(170);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (data && !picked) setPicked(data[0]?.userId ?? null);
  }, [data, picked]);

  const account = data?.find((a) => a.userId === picked);

  async function login(userId = picked) {
    if (!userId) return;
    setBusy(true);
    setFailed(null);
    try {
      await auth.testLogin(userId);
      await refresh(); // 관문이 승인 상태에 맞는 화면으로 보낸다
    } catch {
      setFailed("로그인하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  // 카카오로 시작하기: 처음이면 농가 없는 생산자 계정이 생기고 관문이 가입 신청(SCR-20)으로 보낸다
  async function kakaoLogin() {
    const cfg = kakao.data;
    if (!cfg?.enabled || busy) return;
    setFailed(null);
    if (isMock) {
      setBusy(true);
      try {
        // 처음이면 계정 없이 가입 토큰만 온다. 약관 동의에서 계정을 만든다(DEV-132)
        const res = await auth.kakaoLogin("mock", kakaoRedirectUri(cfg));
        if (res.signup) router.replace("/consent");
        else await refresh();
      } catch {
        setFailed("카카오 로그인에 실패했어요. 다시 시도해 주세요.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const url = beginKakaoLogin(cfg);
    if (!url) {
      setFailed("이 브라우저에서는 카카오 로그인을 쓸 수 없어요.");
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

  // 아이디·비밀번호 로그인(DEV-363). 다시 읽으면 관문이 상태별 화면(임시 비밀번호면 변경 → 약관 동의 → 가입 신청)으로 보낸다
  async function passwordLogin(username: string, password: string) {
    setFailed(null);
    await auth.passwordLogin(username, password);
    await refresh();
  }

  const idSection = (placement: "footer" | "flow") => (
    <IdLoginSection
      collapsible={kakaoOn}
      defaultOpen={id === "1"}
      placement={placement}
      size="producer"
      onLogin={passwordLogin}
      disabled={busy}
      style={{
        paddingHorizontal: tokens.space.gutter,
        paddingTop: placement === "flow" ? 32 : 0,
      }}
    />
  );

  const kakaoButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="카카오로 시작하기"
      disabled={busy}
      onPress={() => void kakaoLogin()}
      style={({ pressed }) => ({
        minHeight: tokens.height.buttonProducer,
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
  );

  return (
    <Screen>
      <Scroll
        bottom={showTest ? barHeight : safe("bottom", 16)}
        footerGap={idAtFooter ? tokens.space.md : undefined}
        footer={
          idAtFooter ? (
            <View>
              {idSection("footer")}
              <LegalFooter onOpen={(path) => router.push(path)} />
            </View>
          ) : (
            <LegalFooter onOpen={(path) => router.push(path)} />
          )
        }
      >
        <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 64, gap: 24 }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <T
              variant="title"
              weight="semibold"
              accessibilityRole="header"
              style={{ flex: 1, minWidth: 0 }}
            >
              {showTest ? "계정을 골라\n시작하세요" : "농가로\n시작하세요"}
            </T>
            <BrandLogo variant="full" width={logoWidth} />
          </View>
          {kakaoOn && !isMock ? (
            <T variant="body" muted>
              처음이면 카카오로 시작한 뒤 농가 가입 신청을 해요.
            </T>
          ) : null}
        </View>
        {/* 카카오 버튼은 두 앱 모두 설명 바로 아래 본문에 둔다(소비자 SCR-05와 같음, DEV-283) */}
        {kakaoOn ? (
          <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 32, gap: 12 }}>
            {kakaoButton}
            {isMock ? (
              <T variant="caption" muted>
                Mock: 카카오로 시작하면 농가 없는 새 생산자로 들어가요
              </T>
            ) : null}
            {failed && !showTest ? (
              <T variant="sub" color={tokens.color.error} center>
                {failed}
              </T>
            ) : null}
          </View>
        ) : null}
        {/* 아이디·비밀번호 로그인(DEV-363). 계정은 운영자가 만들어 공개 가입 버튼은 없다(PM 11/18). 개발/Mock 전용 시드 목록은 아래에 */}
        {kakaoReady && !idAtFooter ? idSection("flow") : null}
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
                  size="producer"
                  onPress={reload}
                  style={{
                    alignSelf: "center",
                    marginTop: 12,
                    paddingHorizontal: 24,
                  }}
                />
              }
            />
          )
        ) : (
          <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 32 }}>
            <T variant="sub" muted style={{ paddingBottom: 8 }}>
              생산자 테스트 계정을 골라 주세요
            </T>
            {!data
              ? [0, 1, 2].map((i) => (
                  <Skeleton
                    key={i}
                    width="100%"
                    height={64}
                    style={{ marginBottom: 8 }}
                  />
                ))
              : data.map((a, i) => (
                  <Pressable
                    key={a.userId}
                    accessibilityRole="radio"
                    aria-checked={picked === a.userId}
                    accessibilityLabel={`${a.name}, ${sub(a)}`}
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
                        {sub(a)}
                      </T>
                    </View>
                  </Pressable>
                ))}
            {/* I1은 시드의 신규 생산자(농가 없음) 계정으로 로그인해 가입 신청(SCR-19 버튼 동작). 관문이 /apply로 보낸다 */}
            <Pressable
              accessibilityRole="link"
              disabled={busy}
              onPress={() =>
                void login(
                  data?.find((a) => a.farmStatus === "NONE")?.userId ??
                    NEW_PRODUCER,
                )
              }
              style={{
                minHeight: 48,
                justifyContent: "center",
                alignSelf: "flex-start",
                marginTop: 16,
              }}
            >
              <T variant="body" weight="semibold">
                처음이세요? 농가로 가입 신청 ›
              </T>
            </Pressable>
          </View>
        )}
      </Scroll>
      {/* 운영(카카오만)에는 고정 바가 없고 푸터가 화면 맨 아래에 온다(DEV-283) */}
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
            paddingBottom: safe("bottom", 16),
            gap: 12,
            backgroundColor: "#FFFFFF",
          }}
        >
          {failed ? (
            <T variant="sub" color={tokens.color.error} center>
              {failed}
            </T>
          ) : null}
          <Button
            label={account ? `${ro(account.name)} 시작하기` : "시작하기"}
            size="producer"
            disabled={!account}
            loading={busy}
            onPress={() => void login()}
          />
        </View>
      ) : null}
    </Screen>
  );
}
