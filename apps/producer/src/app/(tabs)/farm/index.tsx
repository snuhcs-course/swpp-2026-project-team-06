// SCR-30 농가 프로필·링크 (FEAT-02, 19) — design: p-scr-30
import { farms } from "@farmclub/api";
import {
  Button,
  HeaderBar,
  Icon,
  Photo,
  Screen,
  Scroll,
  Skeleton,
  T,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { pickMedia } from "../../../lib/pick";
import { useSession } from "../../../lib/session";
import { LoadError, PhotoShade, copyText, errMsg } from "../../../lib/views";

const CONSUMER_URL =
  process.env.EXPO_PUBLIC_CONSUMER_URL ??
  "https://farmclub-consumer.vercel.app";

function Row({
  label,
  value,
  onPress,
  last,
}: {
  label: string;
  value: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} 고치기: ${value}`}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: tokens.height.listRowProducer,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderBottomWidth: last ? 1 : 0,
        borderColor: tokens.color.border,
      }}
    >
      <T variant="sub" muted style={{ width: 72 }}>
        {label}
      </T>
      <T variant="body" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        {value}
      </T>
      <Icon name="chevron" size={20} color={tokens.color.textMuted} />
    </Pressable>
  );
}

export default function Farm() {
  const router = useRouter();
  const { toast, failToast } = useSession();
  const { data, error, reload, setData } = useAsync(() => farms.mine(), []);
  const [photoError, setPhotoError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const link = data?.shareUrl ?? null;

  async function copy() {
    if (!link) return;
    const ok = await copyText(link);
    toast(ok ? "링크를 복사했어요" : "복사하지 못했어요", {
      tone: ok ? "success" : "error",
    });
  }
  async function share() {
    if (!link) return;
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> })
        : null;
    if (nav?.share) {
      try {
        await nav.share({ title: data?.name, url: link });
      } catch {
        /* 사용자가 닫음 */
      }
    } else void copy();
  }
  async function changePhoto() {
    setPhotoError(null);
    const [x] = await pickMedia({ multiple: false });
    if (!x) return;
    if (!x.ok) return setPhotoError(x.reason);
    try {
      const r = await farms.updateMine({ photo: x.uri });
      setData(() => r);
      toast("사진을 바꿨어요");
    } catch (e) {
      if (
        !failToast(
          e,
          () =>
            void farms
              .updateMine({ photo: x.uri })
              .then((r) => setData(() => r))
              .catch(() => undefined),
        )
      )
        setPhotoError(errMsg(e));
    }
  }

  return (
    <Screen>
      <HeaderBar
        title="농가 프로필·공유 링크"
        onBack={() => router.navigate("/settings")}
      />
      <Scroll bottom={tokens.height.tabBarClearance}>
        {error && !data ? <LoadError error={error} onRetry={reload} /> : null}
        {!data && !error ? (
          <Skeleton
            width="90%"
            height={240}
            radius={16}
            style={{ margin: 20 }}
          />
        ) : null}
        {data ? (
          <>
            {link ? (
              <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 8 }}>
                <T variant="heading">농가 링크</T>
                <T variant="body">{link.replace(/^https?:\/\//, "")}</T>
                <T variant="sub" muted>
                  단골에게 보내면 농가 페이지로 바로 와요
                </T>
                <View style={{ flexDirection: "row", gap: 20 }}>
                  <Button label="복사" variant="text" onPress={copy} />
                  <Button label="보내기" variant="text" onPress={share} />
                </View>
              </View>
            ) : null}
            <View style={{ paddingHorizontal: 20, paddingTop: 32, gap: 12 }}>
              <T variant="heading">프로필</T>
              <View
                style={{
                  height: 240,
                  borderRadius: tokens.radius.md,
                  overflow: "hidden",
                  backgroundColor: tokens.color.surface,
                }}
              >
                <Photo
                  uri={data.photo}
                  width="100%"
                  height={240}
                  radius={0}
                  alt="대표 사진"
                />
                <PhotoShade height={140} />
                <View
                  style={{ position: "absolute", left: 16, bottom: 16, gap: 4 }}
                >
                  <T variant="heading" color="#FFFFFF">
                    {data.name}
                  </T>
                  <T variant="sub" color="#FFFFFF" style={{ opacity: 0.88 }}>
                    {data.region} · 팔로워 {data.followerCount}명
                  </T>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={changePhoto}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    height: 40,
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    backgroundColor: tokens.color.photoButton,
                    justifyContent: "center",
                  }}
                >
                  <T variant="sub" weight="semibold" color="#FFFFFF">
                    사진 바꾸기
                  </T>
                </Pressable>
              </View>
              {photoError ? (
                <T variant="sub" color={tokens.color.error}>
                  {photoError}
                </T>
              ) : null}
              <T variant="caption" muted>
                소비자 앱 농가 페이지 위쪽에 이렇게 보여요
              </T>
              <View>
                <Row
                  label="농가 이름"
                  value={data.name}
                  onPress={() => router.push("/farm/edit/name")}
                />
                <Row
                  label="지역"
                  value={data.region}
                  onPress={() => router.push("/farm/edit/region")}
                />
                <Row
                  label="소개"
                  value={data.intro || "소개를 적어 주세요"}
                  onPress={() => router.push("/farm/edit/intro")}
                  last
                />
              </View>
              <Button
                label="농가 상세 페이지 편집"
                variant="outline"
                onPress={() => router.push("/farm/detail")}
              />
              <Button
                label="소비자 앱에서 내 농가 보기 ›"
                variant="text"
                onPress={() =>
                  void Linking.openURL(`${CONSUMER_URL}/farms/${data.farmId}`)
                }
                style={{ alignSelf: "flex-start" }}
              />
            </View>
          </>
        ) : null}
      </Scroll>
    </Screen>
  );
}
