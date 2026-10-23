import { auth, farms, isMock, resetDemoData } from "@farmclub/api";
import {
  Button,
  LargeTitle,
  LegalFooter,
  ListRow,
  ProfileAvatar,
  Screen,
  Scroll,
  Section,
  Sheet,
  WithdrawSheet,
  Skeleton,
  T,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { HelpButton } from "../../lib/Tour";
import { useSession } from "../../lib/session";
import { LoadError } from "../../lib/views";
export default function Settings() {
  const router = useRouter(),
    { refresh, user } = useSession();
  const farm = useAsync(() => farms.mine(), []);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reset, setReset] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      void farm.reload();
    }, [farm.reload]),
  );
  return (
    <Screen>
      <Scroll bottom={tokens.height.tabBarClearance} footer={<LegalFooter onOpen={(path) => router.push(path)} />}>
        <LargeTitle
          title="환경설정"
          subtitle="농가 정보와 응대 방식을 관리해요"
          right={<HelpButton />}
        />
        {farm.error ? (
          <LoadError error={farm.error} onRetry={farm.reload} />
        ) : null}
        {farm.data ? (
          <View
            style={{
              margin: 20,
              padding: tokens.space.md,
              backgroundColor: tokens.color.surface,
              borderRadius: tokens.radius.md,
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
            }}
          >
            <ProfileAvatar
              name={farm.data.name}
              uri={farm.data.photo}
              size={64}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <T variant="heading" numberOfLines={1}>
                {farm.data.name}
              </T>
              <T variant="sub" muted>
                {farm.data.region} · 팔로워 {farm.data.followerCount}명
              </T>
            </View>
          </View>
        ) : !farm.error ? (
          <Skeleton height={104} width="90%" style={{ margin: 20 }} />
        ) : null}
        <Section title="농가 관리">
          <ListRow
            label="농가 프로필·공유 링크"
            sub="사진과 소개를 고치고 단골에게 알려요"
            onPress={() => router.push("/farm")}
          />
          <View testID="ai-settings-row">
            <ListRow
              label="AI 응답 설정"
              sub="자동 안내와 농가의 응대 원칙"
              onPress={() => router.push("/farm/ai-settings")}
              last
            />
          </View>
        </Section>
        <Section title="계정">
          <ListRow label="로그아웃" onPress={() => auth.logout()} last={!!user?.isTestAccount} />
          {/* 회원 탈퇴(DEV-94). 테스트 계정은 서버가 막으므로 보이지 않는다 */}
          {user?.isTestAccount ? null : (
            <ListRow label="회원 탈퇴" onPress={() => setWithdrawing(true)} last />
          )}
        </Section>
        {isMock ? (
          <View style={{ padding: 20 }}>
            <Button
              label="데모 데이터 초기화"
              variant="text"
              onPress={() => setReset(true)}
            />
          </View>
        ) : null}
      </Scroll>
      <Sheet
        visible={reset}
        onClose={() => {
          if (!busy) setReset(false);
        }}
      >
        <T variant="heading">데모 데이터를 처음으로 되돌릴까요?</T>
        <T>양쪽 앱의 상품·주문·소식·채팅이 초기화되고 로그아웃돼요.</T>
        {error ? <T color={tokens.color.error}>{error}</T> : null}
        <Button
          label="취소"
          variant="secondary"
          disabled={busy}
          onPress={() => setReset(false)}
        />
        <Button
          label="초기화"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await resetDemoData();
              await refresh();
              setReset(false);
            } catch {
              setError("초기화하지 못했어요. 다시 시도해 주세요.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>
      <WithdrawSheet
        visible={withdrawing}
        role="PRODUCER"
        onClose={() => setWithdrawing(false)}
        onWithdraw={async () => {
          await auth.withdraw();
          setWithdrawing(false);
          // 토큰을 지우면 관문이 로그인 화면으로 보낸다
          auth.logout();
        }}
      />
    </Screen>
  );
}
