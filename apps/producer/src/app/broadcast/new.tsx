// SCR-27 소식 올리기 (FEAT-12, 15, M-01·14·16) — design: p-scr-27, s-27-attacherror
import { farms, messaging, newIdempotencyKey } from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Icon,
  Notice,
  Photo,
  RoomMedia,
  Screen,
  Scroll,
  Segmented,
  Sheet,
  T,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { pickMedia } from "../../lib/pick";
import { useSession } from "../../lib/session";
import { errMsg } from "../../lib/views";

type Item = { uri: string; video: boolean };

export default function NewBroadcast() {
  const router = useRouter();
  const { toast, failToast, user } = useSession();
  const farm = useAsync(() => farms.mine(), []);
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const [body, setBody] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [badCount, setBadCount] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"PUBLIC" | "FOLLOWERS">(
    "FOLLOWERS",
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [leave, setLeave] = useState(false);

  const photos = items.filter((x) => !x.video).length;
  const hasVideo = items.some((x) => x.video);

  async function attach() {
    const picked = await pickMedia({ multiple: true, video: true });
    const next = [...items];
    const bad: string[] = [];
    for (const x of picked) {
      if (!x.ok) {
        bad.push(x.reason);
        continue;
      }
      if (x.video && next.some((i) => i.video))
        bad.push(`${x.name} · 영상은 1개까지 올릴 수 있어요`);
      else if (!x.video && next.filter((i) => !i.video).length >= 5)
        bad.push(`${x.name} · 사진은 5장까지 올릴 수 있어요`);
      else next.push({ uri: x.uri, video: x.video });
    }
    setItems(next);
    setBadCount(bad.length);
    setReasons(bad);
  }

  async function post() {
    if (busy || done) return;
    setBusy(true);
    setFailed(null);
    try {
      const input = {
        body: body.trim(),
        photos: items.filter((x) => !x.video).map((x) => x.uri),
        videos: items.filter((x) => x.video).map((x) => x.uri),
        visibility,
      };
      const fingerprint = JSON.stringify(input);
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, key: newIdempotencyKey() };
      await messaging.postNews(input, pending.current.key);
      setDone(true); // 1회, 성공 후 잠금
      toast("소식을 올렸어요");
      router.dismissTo(`/news/${user!.farmId}`);
    } catch (e) {
      if (failToast(e, () => void post())) return; // 글은 그대로
      setFailed(errMsg(e, "올리지 못했어요. 글은 그대로 있어요."));
    } finally {
      setBusy(false);
    }
  }

  const dirty = body.trim().length > 0 || items.length > 0;
  const close = () =>
    dirty && !done
      ? setLeave(true)
      : router.canGoBack()
        ? router.back()
        : router.replace("/chats?view=news");
  const canPost = (body.trim().length > 0 || items.length > 0) && !done;

  return (
    <Screen>
      <HeaderBar title="소식 올리기" close onBack={close} />
      <Scroll bottom={170}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <TextInput
            accessibilityLabel="소식 내용"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={2000}
            placeholder="밭 소식이나 수확 이야기를 적어 주세요"
            placeholderTextColor={tokens.color.textMuted}
            style={{
              height: 160,
              borderWidth: 1,
              borderColor: tokens.color.border,
              borderRadius: tokens.radius.md,
              padding: 16,
              fontSize: tokens.fontSize.input,
              lineHeight: 26,
              fontFamily: tokens.fontFamily,
              color: tokens.color.text,
              textAlignVertical: "top",
            }}
          />
        </View>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 16,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          {items.map((x, i) => (
            <View key={i} style={{ position: "relative" }}>
              <RoomMedia uri={x.uri} />
              {x.video ? (
                <View
                  style={{
                    position: "absolute",
                    left: 8,
                    bottom: 8,
                    paddingHorizontal: 8,
                    borderRadius: 999,
                    backgroundColor: tokens.color.photoButton,
                  }}
                >
                  <T variant="caption" color="#FFFFFF" weight="semibold">
                    영상
                  </T>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={x.video ? "영상 빼기" : "사진 빼기"}
                onPress={() => setItems(items.filter((_, j) => j !== i))}
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  backgroundColor: tokens.color.photoButton,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          ))}
          {Array.from({ length: badCount }).map((_, i) => (
            <View
              key={`bad-${i}`}
              style={{
                width: 104,
                height: 104,
                borderRadius: tokens.radius.md,
                borderWidth: 1.5,
                borderColor: tokens.color.error,
                backgroundColor: tokens.color.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T variant="sub" color={tokens.color.error}>
                못 올림
              </T>
            </View>
          ))}
          {photos < 5 || !hasVideo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="사진·영상 추가"
              onPress={attach}
              style={{
                width: 104,
                height: 104,
                borderRadius: tokens.radius.md,
                borderWidth: 1.5,
                borderStyle: "dashed",
                borderColor: tokens.color.textMuted,
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <Icon name="photo" size={24} color={tokens.color.textMuted} />
              <T variant="caption" muted>
                사진·영상
              </T>
            </Pressable>
          ) : null}
        </View>
        {reasons.length ? (
          <View
            accessibilityRole="alert"
            style={{ marginHorizontal: 20, marginTop: 16, gap: 12 }}
          >
            <T variant="sub" weight="semibold">
              글은 그대로 있어요.{" "}
              {reasons.length === 1
                ? "이 파일만"
                : `${reasons.length}개 파일만`}{" "}
              다시 골라 주세요.
            </T>
            {reasons.map((r) => (
              <View key={r} style={{ flexDirection: "row", gap: 8 }}>
                <Icon name="alert" size={20} color={tokens.color.error} />
                <T variant="sub" color={tokens.color.error} style={{ flex: 1 }}>
                  {r}
                </T>
              </View>
            ))}
            <Button
              label="다시 고르기"
              variant="text"
              onPress={() => {
                setBadCount(0);
                setReasons([]);
                void attach();
              }}
              style={{ alignSelf: "flex-start", minHeight: 48 }}
            />
          </View>
        ) : null}
        <View style={{ paddingHorizontal: 20, paddingTop: 32, gap: 12 }}>
          <T variant="sub" weight="semibold">
            누가 보나요
          </T>
          <Segmented
            options={[
              { value: "PUBLIC", label: "모두 공개" },
              { value: "FOLLOWERS", label: "팔로워만" },
            ]}
            value={visibility}
            onChange={setVisibility}
          />
          <T variant="sub" muted>
            {visibility === "PUBLIC"
              ? "공개하면 팔로우하지 않은 사람도 농가 페이지에서 볼 수 있어요."
              : "팔로워만 채팅의 소식방에서 볼 수 있어요."}
          </T>
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 32, gap: 12 }}>
          <T variant="sub" muted weight="semibold">
            소비자 앱에서 이렇게 보여요
          </T>
          <View
            style={{
              gap: 8,
              padding: 16,
              borderWidth: 1,
              borderColor: tokens.color.border,
              borderRadius: tokens.radius.md,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}
            >
              <T variant="sub" weight="semibold">
                {farm.data?.name ?? ""}
              </T>
              <T variant="caption" muted>
                방금 · {visibility === "PUBLIC" ? "공개" : "팔로워만"}
              </T>
            </View>
            {items[0] ? <RoomMedia uri={items[0].uri} /> : null}
            {body.trim() ? (
              <T variant="sub">{body.trim()}</T>
            ) : (
              <T variant="sub" muted>
                글을 적으면 여기에 보여요
              </T>
            )}
            <T variant="caption" muted>
              좋아요 0
            </T>
          </View>
        </View>
        {failed ? (
          <Notice
            title={failed}
            tone="error"
            style={{ marginHorizontal: 20, marginTop: 16 }}
          />
        ) : null}
      </Scroll>
      <BottomBar
        summary={
          <T variant="sub" center style={{ flex: 1 }}>
            팔로워{" "}
            <T variant="sub" weight="bold">
              {farm.data?.followerCount ?? 0}명
            </T>
            에게 보내요
          </T>
        }
      >
        <Button
          label="올리기"
          size="producer"
          disabled={!canPost}
          loading={busy}
          onPress={post}
        />
      </BottomBar>
      <Sheet visible={leave} onClose={() => setLeave(false)}>
        <T variant="heading">{"쓰던 소식을 두고\n나갈까요?"}</T>
        <T variant="body">적은 글과 고른 사진이 사라져요.</T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Button
            label="나가기"
            variant="secondary"
            size="producer"
            style={{ flex: 1 }}
            onPress={() => {
              setLeave(false);
              router.canGoBack()
                ? router.back()
                : router.dismissTo(`/news/${user!.farmId}`);
            }}
          />
          <Button
            label="계속 쓰기"
            size="producer"
            style={{ flex: 2 }}
            onPress={() => setLeave(false)}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
