// SCR-19 로그인(생산자 앱) — 카카오로 시작하기(I2, DEV-74) 또는 생산자 테스트 계정 선택(ADR 0009·0010) — design: p-scr-19
import { auth, isMock, type TestAccount } from "@farmclub/api";
import {
  BrandLogo,
  Button,
  EmptyState,
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
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";

import { beginKakaoLogin, kakaoRedirectUri } from "../lib/kakao";
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

export default function Login() {
  const { width } = useWindowDimensions();
  // Reserve 140px for the two title lines, 40px gutters, and the 8px gap.
  const logoWidth = Math.min(172, Math.max(96, width - 188));
  const router = useRouter();
  const { refresh } = useSession();
  const { data, error, reload } = useAsync(
    () =>
      auth
        .testAccounts()
        .then((l) =>
          l
            .filter((a) => a.role === "PRODUCER")
            .sort(
              (a, b) => (ORDER[a.farmStatus] ?? 9) - (ORDER[b.farmStatus] ?? 9),
            ),
        ),
    [],
  );
  // 카카오 로그인 사용 여부(ADR 0003). 실서버에서 켜져 있으면 카카오만 둔다(DEV-74 결정).
  // Mock은 상태별 시연 계정(승인·확인 중·반려·정지)이 필요해 테스트 목록을 함께 둔다
  const kakao = useAsync(() => auth.kakaoConfig(), []);
  const kakaoOn = !!kakao.data?.enabled;
  const showTest = kakao.error ? true : kakao.data ? !kakaoOn || isMock : false;
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 고정 하단 바 높이만큼 스크롤 아래를 비워 푸터가 바 바로 위에 온다(상태마다 바 높이가 다르다)
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
        await auth.kakaoLogin("mock", kakaoRedirectUri(cfg));
        await refresh();
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
    window.location.assign(url);
  }

  const kakaoButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="카카오로 시작하기"
      accessibilityState={{ disabled: busy }}
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
      <Scroll bottom={barHeight} footer={<LegalFooter onOpen={(path) => router.push(path)} />}>
        <View style={{ paddingHorizontal: 20, paddingTop: 64, gap: 24 }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <T
              variant="title"
              weight="semibold"
              accessibilityRole="header"
              style={{ flex: 1, minWidth: 0, fontSize: 30, lineHeight: 32 }}
            >
              {showTest ? "계정을 골라\n시작하세요" : "농가로\n시작하세요"}
            </T>
            <BrandLogo
              variant="full"
              width={logoWidth}
              // Align the FARM/CLUB lettering, which sits below the PNG center.
              style={{ transform: [{ translateX: -16 }, { translateY: -10 }] }}
            />
          </View>
          {kakaoOn && !showTest ? (
            <T variant="body" muted>
              처음이면 카카오로 시작한 뒤 농가 가입 신청을 해요. 카카오에서는
              이메일만 받고, 대표자 이름·연락처는 가입 신청에서 입력해요.
            </T>
          ) : null}
        </View>
        {kakaoOn && showTest ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 8 }}>
            {kakaoButton}
            <T variant="caption" muted center>
              Mock: 카카오로 시작하면 농가 없는 새 생산자로 들어가요
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
          <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
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
                    accessibilityState={{ selected: picked === a.userId }}
                    accessibilityLabel={`${a.name}, ${sub(a)}`}
                    onPress={() => setPicked(a.userId)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 16,
                      minHeight: 72,
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
            <T variant="sub" muted style={{ marginTop: 16 }}>
              생산자 테스트 계정만 보여요. 소비자 계정과는 따로예요.
            </T>
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
                marginTop: 8,
              }}
            >
              <T variant="body" weight="semibold">
                처음이세요? 농가로 가입 신청 ›
              </T>
            </Pressable>
          </View>
        )}
      </Scroll>
      <View
        onLayout={(e) => setBarHeight(Math.ceil(e.nativeEvent.layout.height))}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
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
        {showTest ? (
          <Button
            label={account ? `${ro(account.name)} 시작하기` : "시작하기"}
            size="producer"
            disabled={!account}
            loading={busy}
            onPress={() => void login()}
          />
        ) : kakaoOn ? (
          kakaoButton
        ) : null}
      </View>
    </Screen>
  );
}
