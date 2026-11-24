import { farms } from "@farmclub/api";
import {
  Button,
  Sheet,
  HeaderBar,
  ProfileAvatar,
  Screen,
  Scroll,
  T,
  tokens,
  FollowButton,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { useEffect, useState } from "react";
import { useSession } from "../../../../lib/session";
import { LoadError, copyText } from "../../../../lib/views";
import { useToast } from "../../../../lib/toast";
import { goBackOr } from "../../../../lib/nav";
import { useFocusedAsync } from "../../../../lib/useFocusedAsync";
import { useFollowWelcome } from "../../../../lib/FollowWelcome";
import { FarmReportForm, FarmTemperature } from "../../../../lib/FarmTemperature";
import { useEngagementSession } from "../../../../lib/engagementSession";
export default function FarmInfo() {
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const router = useRouter();
  const { user, requireLogin, resume, clearResume } = useSession();
  const farm = useFocusedAsync(() => farms.get(farmId), [farmId, user?.userId]);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState(false);
  const [followError, setFollowError] = useState("");
  const welcome = useFollowWelcome(farmId);
  const session = useEngagementSession();
  const here = `/farms/${farmId}/info`;
  const start = () => router.push(`/chats/${farmId}?start=1&from=info`);
  const chat = () => (farm.data?.isFollowing ? start() : setConfirm(true));
  useEffect(() => { setReport(false); setFollowError(""); setConfirm(false); }, [session.key, farmId]);
  useEffect(() => {
    if (
      user &&
      farm.data &&
      !farm.loading &&
      resume?.next === here &&
      resume.action === "chat"
    ) {
      clearResume();
      chat();
    }
  }, [user?.userId, farm.data, farm.loading, resume]);
  useEffect(() => {
    if (session.valid() && user && farm.data && !farm.loading && resume?.next === here && resume.action === "follow") {
      clearResume();
      if (!farm.data.isFollowing) void follow();
    }
  }, [user?.userId, farm.data, farm.loading, resume]);
  useEffect(() => {
    if (session.valid() && user && resume?.next === here && resume.action === "report") {
      clearResume();
      setReport(true);
    }
  }, [user?.userId, resume]);
  async function follow() {
    if (!farm.data) return;
    setFollowError("");
    try {
      const result = await welcome.change(farm.data, !farm.data.isFollowing);
      if (result) farm.setData((p) => p ? { ...p, isFollowing: result.following, followerCount: result.followerCount } : p);
    } catch (e) {
      setFollowError(e instanceof Error ? e.message : "팔로우를 변경하지 못했어요.");
    }
  }
  const toast = useToast();
  return (
    <Screen>
      <HeaderBar
        title="농가 정보"
        onBack={() =>
          goBackOr(router, `/farms/${farmId}`)
        }
      />
      <Scroll bottom={tokens.height.tabBarClearance}>
        {farm.error ? (
          <LoadError error={farm.error} onRetry={farm.reload} />
        ) : null}
        {farm.data ? (
          <View style={{ padding: tokens.space.gutter, gap: 24 }}>
            <FarmTemperature key={farmId} farmId={farmId} />
            <ProfileAvatar
              name={farm.data.name}
              uri={farm.data.photo}
              size={64}
            />
            <T variant="title">{farm.data.name}</T>
            <T muted>{farm.data.region}</T>
            <T>{farm.data.intro}</T>
            {followError ? <T color={tokens.color.error}>{followError}</T> : null}
            <FollowButton following={farm.data.isFollowing} loading={welcome.busy} onPress={() => requireLogin("follow", here, () => void follow())} />
            <Button
              label="소식방으로"
              onPress={() => router.replace(`/farms/${farmId}`)}
            />
            <Button
              label="1:1 채팅"
              variant="secondary"
              onPress={() => requireLogin("chat", here, chat)}
            />
            <Button
              label="농가 링크 공유"
              variant="text"
              onPress={async () =>
                toast.show(
                  (await copyText(farm.data!.shareUrl))
                    ? "링크를 복사했어요"
                    : farm.data!.shareUrl,
                )
              }
            />
            <Button label="농가 신고" variant="text" icon="flag" onPress={() => requireLogin("report", here, () => setReport(true))} />
          </View>
        ) : null}
      </Scroll>
      <Sheet visible={confirm} onClose={() => setConfirm(false)}>
        <T variant="heading">팔로우하고 대화를 시작해요</T>
        <T>농가를 팔로우하면 소식과 함께 1:1로 이야기할 수 있어요.</T>
        <Button
          label="시작하기"
          onPress={() => {
            setConfirm(false);
            start();
          }}
        />
        <Button
          label="닫기"
          variant="secondary"
          onPress={() => setConfirm(false)}
        />
      </Sheet>
      <FarmReportForm key={`${farmId}:${session.key}`} farmId={farmId} visible={report} onClose={() => setReport(false)} />
      {welcome.node}
      {toast.node}
    </Screen>
  );
}
