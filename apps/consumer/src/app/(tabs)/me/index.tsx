// SCR-17 내 정보 (FEAT-06, 08, 10) — design: scr-17
import { auth, farms, isMock, resetDemoData } from "@farmclub/api";
import {
  Button,
  EmptyState,
  LargeTitle,
  ListRow,
  Screen,
  Scroll,
  Section,
  Sheet,
  T,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { useSession } from "../../../lib/session";
import { Avatar, openExternal } from "../../../lib/views";

declare const process: { env: { EXPO_PUBLIC_PRODUCER_URL?: string } };
const PRODUCER_URL =
  process.env.EXPO_PUBLIC_PRODUCER_URL ||
  "https://farmclub-producer.vercel.app";

export default function Me() {
  const router = useRouter();
  const { user, logout } = useSession();
  const following = useAsync(
    () =>
      user
        ? farms.following()
        : Promise.resolve({ items: [], nextCursor: null }),
    [user?.userId],
  );
  const addresses = useAsync(
    () => (user ? auth.addresses() : Promise.resolve([])),
    [user?.userId],
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [producerSheet, setProducerSheet] = useState(false);
  const def = addresses.data?.find((a) => a.isDefault);
  // 다른 화면에서 팔로우·배송지·주문이 바뀌었을 수 있어 돌아올 때마다 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void following.reload();
      void addresses.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.userId]),
  );

  if (!user)
    return (
      <Screen>
        <LargeTitle title="내 정보" />
        <EmptyState
          icon="user"
          title="로그인이 필요해요"
          action={
            <Button
              label="로그인"
              onPress={() =>
                router.push({ pathname: "/login", params: { next: "/me" } })
              }
              style={{ marginTop: 12, alignSelf: "center" }}
            />
          }
        />
      </Screen>
    );

  return (
    <Screen>
      <Scroll bottom={tokens.height.tabBarClearance}>
        <LargeTitle title="내 정보" />
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 8,
            flexDirection: "row",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <T variant="heading">{user.name}</T>
          <T variant="sub" muted>
            테스트 계정 · {user.role === "CONSUMER" ? "소비자" : "생산자"}
          </T>
        </View>

        <Section title="팔로우한 농가">
          {following.data && following.data.items.length === 0 ? (
            <EmptyState
              title="팔로우한 농가가 없어요"
              action={
                <Button
                  label="농가 둘러보기"
                  variant="text"
                  onPress={() => router.push("/farms")}
                  style={{ alignSelf: "center" }}
                />
              }
            />
          ) : (
            <View>
              {following.data?.items.map((f, i, arr) => (
                <Pressable
                  key={f.farmId}
                  accessibilityRole="link"
                  onPress={() => router.push(`/farms/${f.farmId}`)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    minHeight: 60,
                    borderTopWidth: 1,
                    borderTopColor: tokens.color.border,
                    borderBottomWidth: i === arr.length - 1 ? 1 : 0,
                    borderBottomColor: tokens.color.border,
                  }}
                >
                  <Avatar uri={f.photo} name={f.name} />
                  <View>
                    <T variant="body" weight="semibold">
                      {f.name}
                    </T>
                    <T variant="sub" muted>
                      {f.region}
                    </T>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </Section>

        <Section title="설정">
          <View>
            <ListRow
              label="배송지 관리"
              sub={def ? `기본 · ${def.address}` : "저장한 배송지가 없어요"}
              onPress={() => router.push("/me/addresses")}
            />
            <ListRow
              label="농가로 시작하기"
              sub="생산자 앱에서 따로 가입해요"
              onPress={() => setProducerSheet(true)}
            />
            <ListRow
              label="로그아웃"
              chevron={false}
              onPress={() => logout()}
              last
            />
          </View>
        </Section>

        {isMock ? (
          <View style={{ alignItems: "center", paddingTop: 32 }}>
            <Button
              label="데모 데이터 초기화"
              variant="text"
              onPress={() => setConfirmReset(true)}
              style={{ alignSelf: "center" }}
            />
          </View>
        ) : null}
      </Scroll>
      <Sheet visible={confirmReset} onClose={() => setConfirmReset(false)}>
        <T variant="heading">데모 데이터를 처음으로 돌릴까요?</T>
        <T variant="body">
          공유 Mock에서는 양쪽 앱의 주문·팔로우·소식·채팅이 모두 초기화되고
          로그아웃돼요.
        </T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Button
            label="아니요"
            variant="secondary"
            onPress={() => setConfirmReset(false)}
            style={{ flex: 1 }}
          />
          <Button
            label="초기화"
            onPress={() => {
              setConfirmReset(false);
              void resetDemoData()
                .then(() => logout())
                .catch(() => setConfirmReset(true));
            }}
            style={{ flex: 2 }}
          />
        </View>
      </Sheet>
      {/* 농가로 시작하기 → 생산자 앱 안내(AC-01-7, ADR 0010) — design: s-17-producer */}
      <Sheet visible={producerSheet} onClose={() => setProducerSheet(false)}>
        <T variant="heading">생산자 앱은 따로 가입해요</T>
        <T variant="body">
          소비자 계정으로는 농가를 열 수 없어요. 생산자 앱에서 농가로 가입
          신청을 하면 생산자 계정이 따로 만들어져요.
        </T>
        <T variant="sub" muted>
          지금 계정의 주문·팔로우·채팅은 그대로 소비자 앱에 남아요.
        </T>
        <Button
          label="생산자 앱에서 가입하기"
          onPress={() => {
            setProducerSheet(false);
            openExternal(`${PRODUCER_URL.replace(/\/+$/, "")}/login`);
          }}
          style={{ marginTop: 8 }}
        />
        <Button
          label="닫기"
          variant="text"
          onPress={() => setProducerSheet(false)}
          style={{ alignSelf: "center" }}
        />
      </Sheet>
    </Screen>
  );
}
