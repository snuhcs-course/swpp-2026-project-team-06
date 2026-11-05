// SCR-02 농가 목록 (FEAT-06, E4·AC-06-7 DEV-214) — design: scr-02, s-02-noresult
import { ApiError, catalog, farms, referencePrice } from "@farmclub/api";
import {
  Button,
  Chip,
  EmptyState,
  HeaderBar,
  Icon,
  Notice,
  Photo,
  Price,
  useAsync,
  Screen,
  Scroll,
  Skeleton,
  T,
  dday,
  tokens,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useReducer, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import {
  MORE_FAILED,
  canLoadMore,
  failureCopy,
  farmListReducer,
  initialFarmListState,
  listHeader,
  type FarmLoadMode,
} from "../../../lib/farmSearch";
import { LoadError } from "../../../lib/views";
import { goBackOr } from "../../../lib/nav";

export default function FarmList() {
  const router = useRouter();
  // 홈 헤더 검색 아이콘으로 오면 검색칸에 포커스(SCR-02, D-16)
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const input = useRef<TextInput>(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [state, dispatch] = useReducer(farmListReducer, initialFarmListState);
  const { items, cursor, pending, failed } = state;
  // 요청 번호. 리듀서가 마지막 요청이 아닌 응답을 버린다(늦게 온 지난 검색)
  const seq = useRef(0);

  // reset: cursor 없이 처음부터 받아 목록을 바꾼다(새 검색·그 재시도). more: 같은 cursor로 이어 붙인다(‘더 보기’·그 재시도)
  async function load(mode: FarmLoadMode, q: string = query) {
    // ‘더 보기’는 다른 요청이 없고 남은 목록이 이전 것이 아닐 때만, 보이는 결과의 검색어로. 새 검색은 앞 요청을 덮는다
    if (mode === "more") {
      if (!canLoadMore(state)) return;
      q = state.shownQuery;
    }
    const n = ++seq.current;
    dispatch({ type: "start", seq: n, query: q, mode });
    try {
      const page = await farms.list({
        q,
        cursor: mode === "reset" ? null : cursor,
      });
      dispatch({ type: "success", seq: n, page });
    } catch (e) {
      dispatch({
        type: "fail",
        seq: n,
        offline: e instanceof ApiError && e.status === 0,
        error: e,
      });
    }
  }

  useEffect(() => {
    void load("reset", query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const header = listHeader(state);
  const resetFailed = failed?.mode === "reset" && items ? failed : null;

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
          goBackOr(router, "/")
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
          {resetFailed ? (
            <Notice
              tone="error"
              {...failureCopy(resetFailed, items!.length > 0)}
              action={
                <Button
                  label="다시 시도"
                  variant="outline"
                  loading={pending?.mode === "reset"}
                  onPress={() => void load("reset", resetFailed.query)}
                  style={{ marginTop: 8, alignSelf: "flex-start" }}
                />
              }
            />
          ) : null}
          {header ? (
            <T variant="sub" muted>
              {header}
            </T>
          ) : null}
        </View>

        {failed && !items && !pending ? (
          <LoadError error={failed.error} onRetry={() => void load("reset")} />
        ) : null}

        {!items && pending ? (
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

        {items && items.length === 0 && !resetFailed ? (
          <EmptyState
            icon="search"
            title="찾는 농가가 없어요"
            body={`‘${state.shownQuery}’와 맞는 농가·품종·지역이 없어요.`}
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
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <FeaturedPrice
                      productId={f.featured.productId}
                      current={f.featured.currentPrice}
                    />
                    <Chip label={dday(f.featured.dDay)} />
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
          {failed?.mode === "more" ? (
            <View
              accessibilityRole="alert"
              style={{ alignItems: "center", paddingTop: 8 }}
            >
              <T variant="sub" color={tokens.color.error}>
                {MORE_FAILED}
              </T>
              <Button
                label="다시 시도"
                variant="text"
                loading={pending?.mode === "more"}
                onPress={() => void load("more")}
                style={{ alignSelf: "center" }}
              />
            </View>
          ) : cursor ? (
            <Button
              label="더 보기"
              variant="text"
              loading={pending?.mode === "more"}
              disabled={pending?.mode !== "more" && !canLoadMore(state)}
              onPress={() => void load("more")}
              style={{ alignSelf: "center" }}
            />
          ) : null}
        </View>
      </Scroll>
    </Screen>
  );
}

function FeaturedPrice({
  productId,
  current,
}: {
  productId: string;
  current: number;
}) {
  const product = useAsync(() => catalog.product(productId), [productId]);
  return (
    <Price
      compact
      current={product.data ? product.data.currentPrice : current}
      reference={product.data ? referencePrice(product.data) : null}
      soldOut={product.data?.soldOut}
      availability={product.data?.availability}
    />
  );
}
