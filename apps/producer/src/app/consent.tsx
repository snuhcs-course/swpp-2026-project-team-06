// 약관·처리방침 동의 `/consent` (DEV-113, AC-01-18) — 생산자는 지금 버전의 이용약관·개인정보 처리방침에 동의해야
// 가입 신청·농가 화면을 쓴다. 관문(session.tsx)이 로그인 다음에 이 화면만 연다. 처음 가입이면 동의 → 가입 신청 순서
import { ApiError, auth } from "@farmclub/api";
import {
  BottomBar,
  Button,
  Checkbox,
  HeaderBar,
  LEGAL_VERSION,
  Notice,
  Screen,
  Scroll,
  T,
  tokens,
  type LegalPath,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useSession } from "../lib/session";

const ITEMS: { kind: "TERMS" | "PRIVACY"; label: string; path: LegalPath }[] = [
  { kind: "TERMS", label: "이용약관", path: "/terms" },
  { kind: "PRIVACY", label: "개인정보 수집·이용", path: "/privacy" },
];

export default function Consent() {
  const router = useRouter();
  const { user, refresh } = useSession();
  // 카카오 새 사용자는 계정이 없고 가입 토큰만 있다. 동의하면 이때 계정이 생긴다(DEV-132)
  const signup = !user;
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const all = ITEMS.every((i) => agreed[i.kind]);

  async function submit() {
    if (!all || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const consents = ITEMS.map((i) => ({
        kind: i.kind,
        version: LEGAL_VERSION,
        agreed: true,
      }));
      if (signup) await auth.kakaoSignup(consents);
      else await auth.saveConsents(consents);
      // 다시 읽으면 관문이 상태에 맞는 화면(가입 신청·대기·현황)으로 보낸다
      await refresh();
    } catch (e) {
      // 가입 토큰이 만료됐으면 서버가 "카카오 로그인부터 다시 해 주세요."를 준다
      setFailed(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeaderBar
        title="약관 동의"
        onBack={() => {
          // 가입 전이면 가입 대기를 지워 아무것도 남기지 않는다
          if (signup) {
            auth.clearPendingSignup();
            router.replace("/login");
          } else auth.logout();
        }}
      />
      <Scroll bottom={140}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 8 }}>
          <T variant="title" accessibilityRole="header">
            {"약관에 동의하고\n시작해요"}
          </T>
          <T variant="body" muted>
            {signup
              ? "farmclub 이용약관과 개인정보 처리방침에 동의하면 생산자 계정이 만들어져요. 동의하지 않으면 아무것도 저장하지 않아요."
              : "farmclub 이용약관과 개인정보 처리방침에 동의해야 생산자 앱을 쓸 수 있어요. 약관이 바뀌면 다시 동의를 받아요."}
          </T>
        </View>
        {failed ? (
          <Notice
            title={failed}
            tone="error"
            style={{ marginHorizontal: 20, marginTop: 20 }}
          />
        ) : null}
        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <Checkbox
            checked={all}
            label="모두 동의해요"
            onPress={() =>
              setAgreed(Object.fromEntries(ITEMS.map((i) => [i.kind, !all])))
            }
          >
            <T variant="body" weight="semibold">
              모두 동의해요
            </T>
          </Checkbox>
          {ITEMS.map((item, i) => (
            <View
              key={item.kind}
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderTopWidth: 1,
                borderTopColor: tokens.color.border,
                borderBottomWidth: i === ITEMS.length - 1 ? 1 : 0,
                borderBottomColor: tokens.color.border,
              }}
            >
              <View style={{ flex: 1, paddingTop: 4 }}>
                <Checkbox
                  checked={!!agreed[item.kind]}
                  label={`${item.label} (필수)`}
                  onPress={() =>
                    setAgreed((a) => ({ ...a, [item.kind]: !a[item.kind] }))
                  }
                >
                  <T variant="body">
                    {item.label}{" "}
                    <T variant="sub" muted>
                      필수
                    </T>
                  </T>
                </Checkbox>
              </View>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${item.label} 전문 보기`}
                onPress={() => router.push(item.path)}
                style={{
                  minHeight: 48,
                  minWidth: 48,
                  alignItems: "flex-end",
                  justifyContent: "center",
                }}
              >
                <T variant="sub" muted>
                  보기
                </T>
              </Pressable>
            </View>
          ))}
          <T variant="caption" muted style={{ marginTop: 12 }}>
            {`버전 ${LEGAL_VERSION}`}
          </T>
        </View>
      </Scroll>
      <BottomBar>
        <Button
          label="동의하고 계속하기"
          size="producer"
          disabled={!all}
          loading={busy}
          onPress={() => void submit()}
        />
      </BottomBar>
    </Screen>
  );
}
