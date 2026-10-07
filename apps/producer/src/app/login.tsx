// SCR-19 로그인(생산자 앱) — 생산자 테스트 계정 선택(ADR 0009·0010) — design: p-scr-19
import { auth, type TestAccount } from "@farmclub/api";
import {
  Button,
  EmptyState,
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
import { Pressable, View } from "react-native";

import { useSession } from "../lib/session";
import { Wordmark, isStatus } from "../lib/views";

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
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  return (
    <Screen>
      <Scroll bottom={170}>
        <View style={{ paddingHorizontal: 20, paddingTop: 64, gap: 24 }}>
          <Wordmark />
          <T variant="title" accessibilityRole="header">
            {"계정을 골라\n시작하세요"}
          </T>
        </View>
        {error ? (
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
        <T variant="caption" muted center>
          테스트 서비스 · 이용약관 · 개인정보 처리방침
        </T>
        <Button
          label={account ? `${ro(account.name)} 시작하기` : "시작하기"}
          size="producer"
          disabled={!account}
          loading={busy}
          onPress={() => void login()}
        />
      </View>
    </Screen>
  );
}
