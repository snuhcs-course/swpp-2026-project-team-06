// SCR-02 농가 목록 (FEAT-06) — design: scr-02, s-02-noresult
import { farms, type FarmCard } from "@farmclub/api";
import {
  Button,
  Chip,
  EmptyState,
  HeaderBar,
  Icon,
  Photo,
  Screen,
  Scroll,
  Skeleton,
  T,
  dday,
  tokens,
  won,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { LoadError } from "../../../lib/views";

export default function FarmList() {
  const router = useRouter();
  // 홈 헤더 검색 아이콘으로 오면 검색칸에 포커스(SCR-02, D-16)
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const input = useRef<TextInput>(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<FarmCard[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    try {
      const r = await farms.list({ q: query, cursor: reset ? null : cursor });
      setItems((prev) => (reset || !prev ? r.items : [...prev, ...r.items]));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // 입력이 멈추면 검색 (앞뒤 공백 제거)
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (focus !== "search") return;
    const t = setTimeout(() => input.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [focus]);

  return (
    <Screen>
      <HeaderBar
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
      />
      <Scroll bottom={tokens.height.tabBarClearance}>
        <View style={{ paddingHorizontal: tokens.space.gutter, gap: 16 }}>
          <T variant="title" accessibilityRole="header">
            농가
          </T>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              height: 48,
              paddingHorizontal: 16,
              borderRadius: 8,
              backgroundColor: tokens.color.surface,
            }}
          >
            <Icon name="search" size={22} color={tokens.color.textMuted} />
            <TextInput
              ref={input}
              autoFocus={focus === "search"}
              accessibilityLabel="농가 검색"
              value={q}
              onChangeText={setQ}
              placeholder="농가 이름, 품종, 지역"
              placeholderTextColor={tokens.color.textMuted}
              style={{
                flex: 1,
                fontSize: tokens.fontSize.input,
                fontFamily: tokens.fontFamily,
                color: tokens.color.text,
                height: 48,
              }}
            />
          </View>
          {items && items.length > 0 ? (
            <T variant="sub" muted>
              마감 임박순 · 농가 {items.length}곳
            </T>
          ) : null}
        </View>

        {error && !items ? (
          <LoadError error={error} onRetry={() => load(true)} />
        ) : null}

        {!items && loading ? (
          <View style={{ padding: tokens.space.gutter, gap: 16 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flexDirection: "row", gap: 16 }}>
                <Skeleton width={104} height={104} radius={16} />
                <View style={{ gap: 8, flex: 1 }}>
                  <Skeleton width="60%" height={17} />
                  <Skeleton width="80%" height={15} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {items && items.length === 0 ? (
          <EmptyState
            icon="search"
            title="찾는 농가가 없어요"
            body={`‘${query}’와 맞는 농가·품종·지역이 없어요.`}
            action={
              <Button
                label="전체 농가 보기"
                variant="text"
                onPress={() => setQ("")}
                style={{ alignSelf: "center" }}
              />
            }
          />
        ) : null}

        <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 4 }}>
          {items?.map((f, i) => (
            <Pressable
              key={f.farmId}
              accessibilityRole="link"
              onPress={() => router.push(`/farms/${f.farmId}`)}
              style={{
                flexDirection: "row",
                gap: 16,
                paddingVertical: 16,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: tokens.color.border,
              }}
            >
              <Photo
                uri={f.photo}
                width={tokens.thumb.browse}
                height={tokens.thumb.browse}
                alt={f.name}
                kind="farm"
              />
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="body" weight="semibold">
                  {f.name}
                </T>
                <T variant="sub" muted numberOfLines={1}>
                  {f.region} ·{" "}
                  {f.featured
                    ? f.featured.name.split(" / ")[0]
                    : "지금 판매 중인 상품 없음"}
                </T>
                {f.featured ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <T variant="body" weight="bold">
                      {won(f.featured.currentPrice)}
                    </T>
                    <Chip label={dday(f.featured.dDay)} />
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
          {cursor ? (
            <Button
              label="더 보기"
              variant="text"
              loading={loading}
              onPress={() => load(false)}
              style={{ alignSelf: "center" }}
            />
          ) : null}
          {error && items ? (
            <Button
              label="다시 시도"
              variant="text"
              onPress={() => load(false)}
              style={{ alignSelf: "center" }}
            />
          ) : null}
        </View>
      </Scroll>
    </Screen>
  );
}
