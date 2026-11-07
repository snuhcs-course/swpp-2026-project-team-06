// 원산지 표시제도 안내 `/origin-notice` (DEV-121) — 통신판매중개자 farmclub이 농가에게 원산지 표시제도를 알린다
// (원산지표시법 제6조 ⑥, 시행령 제5조의2, 시행규칙 제4조의2 1호). 현황 할 일 줄·상시 줄·입점 정책·원산지 칸에서 연다.
// 지금 버전을 안 읽은 생산자에게만 '확인했어요'를 두고, 누르면 서버에 읽은 시각을 남긴다(고지 증빙). 로그인 없이도 본문은 열린다
import { ApiError, auth } from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Notice,
  ORIGIN_NOTICE_VERSION,
  Screen,
  Scroll,
  T,
  originNotice,
  tokens,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { goBackOr } from "../lib/nav";
import { useSession } from "../lib/session";

function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <T variant="sub">•</T>
      <T variant="sub" style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

function Box({ label, text }: { label: string; text: string }) {
  return (
    <View
      style={{
        backgroundColor: tokens.color.surface,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 4,
      }}
    >
      <T variant="sub" weight="semibold">
        {label}
      </T>
      <T variant="sub">{text}</T>
    </View>
  );
}

export default function OriginNoticeScreen() {
  const router = useRouter();
  const { user, refresh, toast } = useSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // 처음 연 화면에서만 버튼을 둔다. 읽은 뒤에는 본문만(상시 게시)
  const unread =
    !!user && user.role === "PRODUCER" && !user.consentRequired && !user.originNoticeReadAt;

  async function confirm() {
    setBusy(true);
    setFailed(null);
    try {
      await auth.readNotice("ORIGIN", ORIGIN_NOTICE_VERSION);
      await refresh();
      toast("원산지 표시제도 안내를 확인했어요");
      goBackOr(router, "/");
    } catch (e) {
      setFailed(e instanceof ApiError ? e.message : "기록하지 못했어요. 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeaderBar title={originNotice.title} onBack={() => goBackOr(router, "/")} />
      <Scroll bottom={unread ? 140 : 40}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 8 }}>
          <T variant="title" accessibilityRole="header">
            {originNotice.heading}
          </T>
          <T variant="sub" muted>
            {originNotice.lead}
          </T>
        </View>
        {originNotice.sections.map((s) => (
          <View key={s.title} style={{ paddingHorizontal: 20, paddingTop: 24, gap: 10 }}>
            <T variant="body" weight="bold">
              {s.title}
            </T>
            {s.items.map((item, i) => (
              <View key={item} style={{ gap: 10 }}>
                {s.example && i === s.example.after ? (
                  <Box label={s.example.label} text={s.example.text} />
                ) : null}
                <Bullet text={item} />
              </View>
            ))}
          </View>
        ))}
        <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          <Box label={originNotice.help.label} text={originNotice.help.text} />
        </View>
        <T variant="caption" muted style={{ paddingHorizontal: 20, paddingTop: 24 }}>
          {originNotice.source}
        </T>
        {user?.originNoticeReadAt ? (
          <T variant="caption" muted style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            {`${new Date(user.originNoticeReadAt).toLocaleDateString("ko-KR", {
              month: "long",
              day: "numeric",
            })} 확인함`}
          </T>
        ) : null}
        {failed ? (
          <Notice title={failed} tone="error" style={{ marginHorizontal: 20, marginTop: 16 }} />
        ) : null}
      </Scroll>
      {unread ? (
        <BottomBar>
          <Button
            label="확인했어요"
            size="producer"
            loading={busy}
            onPress={() => void confirm()}
          />
        </BottomBar>
      ) : null}
    </Screen>
  );
}
