import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { T } from "./Text";
import { tokens } from "./tokens";

export type StoryBlock =
  | { id: string; type: "text"; title: string; body: string }
  | { id: string; type: "image"; uri: string; alt: string };
export function StoryImage({ uri, alt }: { uri: string; alt: string }) {
  const [ratio, setRatio] = useState(1);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    Image.getSize(
      uri,
      (w, h) => {
        if (alive && w && h) setRatio(w / h);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return failed ? (
    <View style={{ padding: 32, backgroundColor: tokens.color.surface }}>
      <T muted center>
        {alt || "상세 사진"} · 사진을 불러오지 못했어요
      </T>
    </View>
  ) : (
    <Image
      source={{ uri }}
      accessibilityLabel={alt}
      onError={() => setFailed(true)}
      style={{ width: "100%", aspectRatio: ratio }}
      resizeMode="contain"
    />
  );
}
export function DetailStory({
  content,
  fallback,
  title = "상세 이야기",
}: {
  content?: { blocks: StoryBlock[] };
  fallback?: string;
  title?: string;
}) {
  const blocks = content?.blocks.length
    ? content.blocks
    : fallback?.trim()
      ? [{ id: "intro", type: "text" as const, title, body: fallback }]
      : [];
  if (!blocks.length) return null;
  return (
    <View style={{ paddingTop: 32, paddingBottom: 24, gap: 28 }}>
      <View
        style={{
          marginHorizontal: 20,
          borderTopWidth: 1,
          borderColor: tokens.color.border,
          paddingTop: 28,
        }}
      >
        <T variant="caption" muted weight="semibold">
          FARMCLUB · 산지에서 전하는 이야기
        </T>
      </View>
      {blocks.map((b) =>
        b.type === "image" ? (
          <StoryImage key={b.id} uri={b.uri} alt={b.alt} />
        ) : (
          <View
            key={b.id}
            style={{ paddingHorizontal: 24, gap: 14, paddingVertical: 10 }}
          >
            {b.title ? (
              <T
                variant="title"
                accessibilityRole="header"
                style={{ lineHeight: 34 }}
              >
                {b.title}
              </T>
            ) : null}
            {b.body ? (
              <T variant="body" style={{ lineHeight: 28 }}>
                {b.body}
              </T>
            ) : null}
          </View>
        ),
      )}
    </View>
  );
}
