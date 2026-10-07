// SCR-21 승인 대기 · 반려 (FEAT-01, AC-01-3, 결정 29, D-06) — design: p-scr-21, s-21-application, s-21-rejected
import { auth, type ProducerApplication } from "@farmclub/api";
import {
  Button,
  Icon,
  Screen,
  Sheet,
  Skeleton,
  T,
  md,
  safe,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { useSession } from "../lib/session";
import { LoadError } from "../lib/views";

function Step({
  n,
  title,
  sub,
  state,
  first,
  last,
}: {
  n: number;
  title: string;
  sub: string;
  state: "done" | "now" | "later";
  first?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 16,
        alignItems: "center",
        minHeight: 72,
        borderTopWidth: first ? 0 : 1,
        borderBottomWidth: last ? 1 : 0,
        borderColor: tokens.color.border,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: state === "done" ? tokens.color.text : "transparent",
          borderWidth: state === "done" ? 0 : 2,
          borderColor:
            state === "now" ? tokens.color.text : tokens.color.border,
        }}
      >
        {state === "done" ? (
          <Icon name="check" size={16} color="#FFFFFF" />
        ) : (
          <T variant="caption" weight="bold" muted={state === "later"}>
            {n}
          </T>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <T
          variant="body"
          weight={state === "now" ? "bold" : "semibold"}
          muted={state === "later"}
        >
          {title}
          {state === "now" ? <T variant="sub"> 지금</T> : null}
        </T>
        <T variant="sub" muted>
          {sub}
        </T>
      </View>
    </View>
  );
}

function Row({ k, v, first }: { k: string; v: string; first?: boolean }) {
  return (
    <View
      style={{
        paddingVertical: 12,
        gap: 4,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: tokens.color.border,
      }}
    >
      <T variant="sub" muted>
        {k}
      </T>
      <T variant="body">{v}</T>
    </View>
  );
}

export default function Pending() {
  const router = useRouter();
  const { refresh, user } = useSession();
  const app = useAsync<ProducerApplication>(
    () => auth.application(),
    [user?.farmStatus],
  );
  const [pulling, setPulling] = useState(false);
  const [showApp, setShowApp] = useState(false);

  // 들어올 때마다 확인 결과를 새로 불러온다(결정 29). 승인됐으면 관문이 현황(/)으로 보낸다.
  const check = useCallback(async () => {
    await refresh();
    await app.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);
  useFocusEffect(
    useCallback(() => {
      void check();
    }, [check]),
  );

  async function pull() {
    setPulling(true);
    await check();
    setPulling(false);
  }

  const a = app.data;
  const rejected = a?.status === "REJECTED";

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 200 }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={pull}
            tintColor={tokens.color.textMuted}
          />
        }
      >
        {/* 불러오기 실패: 마지막 상태는 그대로 두고 다시 시도 */}
        {app.error && !a ? (
          <LoadError error={app.error} onRetry={app.reload} />
        ) : null}
        {!a && !app.error ? (
          <Skeleton
            width="80%"
            height={120}
            style={{ margin: 20, marginTop: 72 }}
          />
        ) : null}
        {a ? (
          <>
            <View style={{ paddingHorizontal: 20, paddingTop: 72, gap: 12 }}>
              <T variant="sub" muted>
                {a.farmName} · {md(a.submittedAt)} 신청
              </T>
              <T variant="title" accessibilityRole="header">
                {rejected ? "신청이 반려됐어요" : "확인 중이에요"}
              </T>
              <T variant="body">
                {rejected
                  ? "고쳐서 다시 신청할 수 있어요."
                  : "곧 전화를 드릴게요."}
              </T>
            </View>
            {rejected ? (
              <View
                style={{
                  marginHorizontal: 20,
                  marginTop: 40,
                  padding: 16,
                  paddingVertical: 20,
                  borderRadius: tokens.radius.md,
                  backgroundColor: tokens.color.surface,
                  gap: 8,
                }}
              >
                <T variant="sub" weight="semibold" color={tokens.color.error}>
                  반려 사유{a.decidedAt ? ` · ${md(a.decidedAt)}` : ""}
                </T>
                <T variant="body">{a.rejectReason ?? ""}</T>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 20, paddingTop: 40 }}>
                <Step
                  n={1}
                  title="신청 완료"
                  sub={md(a.submittedAt)}
                  state="done"
                  first
                />
                <Step
                  n={2}
                  title="전화·방문 확인"
                  sub={`${a.phone}로 연락드려요`}
                  state="now"
                />
                <Step
                  n={3}
                  title="승인"
                  sub="승인되면 상품을 올릴 수 있어요"
                  state="later"
                  last
                />
              </View>
            )}
            {app.error ? (
              <View
                style={{
                  marginHorizontal: 20,
                  marginTop: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <T variant="sub" color={tokens.color.error} style={{ flex: 1 }}>
                  확인 결과를 불러오지 못했어요.
                </T>
                <Button
                  label="다시 시도"
                  variant="text"
                  onPress={() => void check()}
                />
              </View>
            ) : null}
            {rejected ? null : (
              <T
                variant="sub"
                muted
                style={{ marginHorizontal: 20, marginTop: 24 }}
              >
                이 화면에 들어올 때마다 확인 결과를 새로 불러와요. 아래로 당겨도
                다시 확인해요.
              </T>
            )}

          </>
        ) : null}
      </ScrollView>
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: safe("bottom", 16),
          gap: 4,
          backgroundColor: tokens.color.background,
        }}
      >
        {rejected ? (
          <>
            <Button
              label="다시 신청하기"
              size="producer"
              onPress={() => router.push("/apply")}
            />
            <T variant="caption" muted center style={{ marginTop: 4 }}>
              전에 적은 내용이 채워져 있어요
            </T>
          </>
        ) : (
          <Button
            label="신청 내용 보기"
            variant="outline"
            size="producer"
            disabled={!a}
            onPress={() => setShowApp(true)}
          />
        )}
        <Button
          label="로그아웃"
          variant="text"
          onPress={() => auth.logout()}
          style={{ alignSelf: "center" }}
        />
      </View>

      {/* 신청 내용(읽기 전용) — design: s-21-application */}
      <Sheet
        visible={showApp}
        onClose={() => setShowApp(false)}
        title="신청 내용"
      >
        {a ? (
          <>
            <T variant="sub" muted>
              {md(a.submittedAt)} 신청 · 확인 중에는 고칠 수 없어요
            </T>
            <View>
              <Row k="대표자 이름" v={a.ownerName} first />
              <Row k="농가 이름" v={a.farmName} />
              <Row k="지역" v={a.region} />
              <Row k="주로 키우는 것" v={a.mainItems} />
              <Row k="연락처" v={a.phone} />
            </View>
            <T variant="sub" muted>
              바꿀 내용이 있으면 확인 전화를 받을 때 말씀해 주세요.
            </T>
          </>
        ) : null}
        <Button
          label="닫기"
          variant="secondary"
          size="producer"
          onPress={() => setShowApp(false)}
          style={{ marginTop: 8 }}
        />
      </Sheet>
    </Screen>
  );
}
