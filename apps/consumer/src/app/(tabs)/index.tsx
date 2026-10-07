// SCR-01 홈·발견 (FEAT-06, 15) — design: scr-01, s-01-loading, s-01-error
import { farms } from "@farmclub/api";
import {
  Button,
  Chip,
  IconButton,
  Notice,
  Photo,
  Screen,
  Scroll,
  Section,
  Skeleton,
  T,
  dday,
  period,
  tokens,
  useAsync,
  won,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

import { PhotoShade, Wordmark } from "../../lib/views";

export default function Home() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsync(() => farms.home(), []);

  return (
    <Screen>
      <View
        style={{
          height: 48,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: tokens.space.gutter,
        }}
      >
        <Wordmark />
        {/* 검색 아이콘 → SCR-02 검색칸 포커스(결정 23, D-16) */}
        <View style={{ marginLeft: "auto", marginRight: -12 }}>
          <IconButton
            icon="search"
            label="농가·상품 검색"
            onPress={() =>
              router.push({ pathname: "/farms", params: { focus: "search" } })
            }
          />
        </View>
      </View>
      {loading && !data ? (
        <HomeSkeleton />
      ) : (
        <Scroll bottom={tokens.height.tabBarClearance}>
          {data ? (
            <Pressable
              accessibilityRole="link"
              disabled={!data.hero.productId}
              onPress={() =>
                data.hero.productId &&
                router.push(`/products/${data.hero.productId}`)
              }
              style={{ height: 480 }}
            >
              <Photo
                uri={data.hero.photo}
                width="100%"
                height={480}
                radius={0}
                alt="수확 상자가 놓인 서귀포 감귤 과수원"
              />
              <PhotoShade height={260} />
              <View
                style={{
                  position: "absolute",
                  left: 20,
                  right: 20,
                  bottom: 24,
                  gap: 8,
                }}
              >
                <T
                  variant="caption"
                  weight="semibold"
                  color="rgba(255,255,255,0.85)"
                >
                  {data.hero.label}
                </T>
                <T variant="heading" color="#FFFFFF">
                  {data.hero.title}
                </T>
                <T
                  variant="sub"
                  weight="semibold"
                  color="rgba(255,255,255,0.92)"
                  style={{ marginTop: 4 }}
                >
                  {data.hero.caption} →
                </T>
              </View>
            </Pressable>
          ) : null}

          {error ? (
            <View
              style={{
                paddingHorizontal: tokens.space.gutter,
                paddingTop: tokens.space.section,
              }}
            >
              <Notice
                title="상품을 불러오지 못했어요"
                body="인터넷 연결을 확인하고 다시 시도해 주세요."
                action={
                  <Button
                    label="다시 시도"
                    variant="outline"
                    onPress={reload}
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                  />
                }
              />
            </View>
          ) : null}

          {data ? (
            <>
              <Section
                title="지금 예약하면 이득"
                right={
                  <T variant="sub" muted>
                    마감 임박순
                  </T>
                }
                bleed
              >
                {data.recommended.length === 0 ? (
                  <T
                    variant="body"
                    muted
                    style={{ paddingHorizontal: tokens.space.gutter }}
                  >
                    현재 예약 가능한 상품이 없어요
                  </T>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                      gap: 12,
                      paddingHorizontal: tokens.space.gutter,
                    }}
                  >
                    {data.recommended.map((p) => (
                      <Pressable
                        key={p.productId}
                        accessibilityRole="link"
                        onPress={() => router.push(`/products/${p.productId}`)}
                        style={{ width: 232, gap: 8 }}
                      >
                        <Photo
                          uri={p.photo}
                          width={232}
                          height={160}
                          alt={p.name}
                          kind="product"
                        />
                        <View style={{ gap: 4 }}>
                          <T variant="body" weight="semibold" numberOfLines={1}>
                            {p.name.split(" / ")[0]}
                          </T>
                          <T variant="sub" muted numberOfLines={1}>
                            {p.farmName} ·{" "}
                            {period(
                              p.deliveryWindow.start,
                              p.deliveryWindow.end,
                            )}{" "}
                            도착
                          </T>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <T variant="body" weight="bold">
                              {won(p.currentPrice)}
                            </T>
                            <Chip label={dday(p.dDay)} />
                            <T
                              variant="caption"
                              muted
                              style={{ marginLeft: "auto" }}
                            >
                              {p.reservedCount}명 예약
                            </T>
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </Section>

              <Section
                title="농가 둘러보기"
                right={
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push("/farms")}
                    style={{
                      minHeight: 48,
                      minWidth: 48,
                      justifyContent: "center",
                    }}
                  >
                    <T variant="sub" weight="semibold" muted>
                      모두 보기
                    </T>
                  </Pressable>
                }
                bleed
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    gap: 12,
                    paddingHorizontal: tokens.space.gutter,
                  }}
                >
                  {data.farms.map((f) => (
                    <Pressable
                      key={f.farmId}
                      accessibilityRole="link"
                      onPress={() => router.push(`/farms/${f.farmId}`)}
                      style={{ width: 160, gap: 8 }}
                    >
                      <Photo
                        uri={f.photo}
                        width={160}
                        height={200}
                        alt={f.name}
                        kind="farm"
                      />
                      <View>
                        <T variant="body" weight="bold" numberOfLines={1}>
                          {f.name}
                        </T>
                        <T variant="sub" muted numberOfLines={1}>
                          {f.region} · 팔로워 {f.followerCount}명
                        </T>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </Section>
            </>
          ) : null}
        </Scroll>
      )}
    </Screen>
  );
}

function HomeSkeleton() {
  return (
    <View accessibilityLabel="불러오는 중">
      <Skeleton width="100%" height={480} radius={0} />
      <View
        style={{
          padding: tokens.space.gutter,
          paddingTop: tokens.space.section,
          gap: 16,
        }}
      >
        <Skeleton width={180} height={22} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ gap: 8 }}>
            <Skeleton width={232} height={160} radius={16} />
            <Skeleton width={140} height={17} />
            <Skeleton width={200} height={15} />
          </View>
          <Skeleton width={120} height={160} radius={16} />
        </View>
      </View>
    </View>
  );
}
