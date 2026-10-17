import {
  apiUrl,
  catalog,
  newIdempotencyKey,
  productWorkspace,
  type PageSnapshot,
  type ProductWorkspace,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  DetailStory,
  HeaderBar,
  ModuleStory,
  Screen,
  Scroll,
  Sheet,
  SOURCE_MODULES,
  StoryImage,
  T,
  tokens,
} from "@farmclub/ui";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Platform,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useHideTabBar, useSession } from "./session";
import { DetailEditor } from "./DetailEditor";
import { isMock } from "@farmclub/api";

const fieldStyle = {
  borderWidth: 1,
  borderColor: tokens.color.border,
  borderRadius: tokens.radius.sm,
  padding: 12,
  fontSize: tokens.fontSize.input,
  lineHeight: tokens.lineHeight.input,
  color: tokens.color.text,
  minHeight: 96,
  backgroundColor: tokens.color.background,
};
const card = {
  padding: tokens.space.md,
  borderWidth: 1,
  borderColor: tokens.color.border,
  borderRadius: tokens.radius.md,
  gap: 12,
};

const copy = (value: PageSnapshot): PageSnapshot =>
  JSON.parse(JSON.stringify(value));
export function ProductPageEditor({ productId }: { productId: string }) {
  const { user } = useSession();
  if (isMock) return <DetailEditor productId={productId} />;
  return <Editor key={`${user?.userId}:${productId}`} productId={productId} />;
}
function Editor({ productId }: { productId: string }) {
  useHideTabBar();
  const router = useRouter(),
    navigation = useNavigation();
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const media = (uri: string) =>
    uri.startsWith("/api/source-media/")
      ? (photoUrls[uri] ?? "")
      : uri.startsWith("/api/")
        ? apiUrl + uri
        : uri;
  const [row, setRow] = useState<ProductWorkspace | null>(null);
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false),
    [confirm, setConfirm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const lock = useRef(false),
    alive = useRef(true),
    allowLeave = useRef(false);
  const request = useRef<Promise<ProductWorkspace> | null>(null);
  const pending = useRef(new Map<string, string>());
  const key = (action: string) => {
    if (!pending.current.has(action))
      pending.current.set(action, newIdempotencyKey());
    return pending.current.get(action)!;
  };
  const dirty =
    !!row && JSON.stringify(snapshot) !== JSON.stringify(row.snapshot);
  const accept = (value: ProductWorkspace) => {
    setRow(value);
    setSnapshot(copy(value.snapshot));
  };
  useEffect(() => {
    alive.current = true;
    if (!request.current)
      request.current = productWorkspace.open(productId, key("open"));
    void request.current
      .then((value) => {
        if (alive.current) accept(value);
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      });
    void catalog
      .myProduct(productId)
      .then((p) => {
        if (alive.current) {
          setName(p.name || "새 상품");
          setStatus(p.status);
        }
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      });
    return () => {
      alive.current = false;
    };
  }, [productId]);
  useEffect(() => {
    if (!row) return;
    let cancelled = false;
    const urls: string[] = [];
    const sources = [
      ...new Set(
        row.snapshot.modules.flatMap((m) => m.photos.map((p) => p.uri)),
      ),
    ].filter((uri) => uri.startsWith("/api/source-media/"));
    void Promise.all(
      sources.map(async (uri) => {
        const url = await productWorkspace.photo(
          productId,
          uri.split("/").pop()!,
        );
        urls.push(url);
        if (cancelled) URL.revokeObjectURL(url);
        return [uri, url] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) setPhotoUrls(Object.fromEntries(entries));
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [row, productId]);
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (allowLeave.current || (!dirty && !busy)) return;
        event.preventDefault();
        if (!busy)
          setLeave(() => () => {
            allowLeave.current = true;
            navigation.dispatch(event.data.action);
          });
      }),
    [navigation, dirty, busy],
  );
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    if (typeof window === "undefined") return;
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  const act = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const update = (fn: (next: PageSnapshot) => void) => {
    if (!snapshot || busy) return;
    const next = copy(snapshot);
    fn(next);
    setSnapshot(next);
    setNotice("");
  };
  const reset = () =>
    void act(async () => {
      const next = await productWorkspace.open(
        productId,
        newIdempotencyKey(),
        true,
        row?.version,
      );
      if (alive.current) {
        accept(next);
        setNotice("현재 상품 내용으로 다시 불러왔어요.");
      }
    });
  const reload = () =>
    void act(async () => {
      const next = await productWorkspace.open(productId, newIdempotencyKey());
      if (alive.current) {
        accept(next);
        setNotice("저장된 수정본을 불러왔어요.");
      }
    });
  return (
    <Screen>
      <HeaderBar
        title="판매페이지 수정"
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/products")
        }
      />
      <Scroll bottom={190}>
        <View style={{ padding: tokens.space.gutter, gap: tokens.space.md }}>
          <T variant="heading">{name}</T>
          <T variant="sub" muted>
            {row?.hasUnpublishedChanges
              ? "저장한 수정본이 있어요. 아직 구매자에게 보이지 않아요."
              : "현재 상품에 반영된 내용을 수정해요."}
          </T>
          {error ? (
            <View accessibilityRole="alert" style={card}>
              <T color={tokens.color.error}>{error}</T>
              <Button
                label="저장된 내용 다시 불러오기"
                variant="outline"
                disabled={busy}
                onPress={() => (dirty ? setLeave(() => reload) : reload())}
              />
            </View>
          ) : null}
          {row?.hasUnpublishedChanges ? (
            <Button
              label="수정본 버리고 현재 상품 불러오기"
              variant="text"
              disabled={busy}
              onPress={() => setLeave(() => reset)}
            />
          ) : null}
          {notice ? (
            <View accessibilityLiveRegion="polite">
              <T>{notice}</T>
            </View>
          ) : null}
          {!row || !snapshot ? (
            !error ? (
              <ActivityIndicator accessibilityLabel="판매페이지 불러오는 중" />
            ) : null
          ) : preview ? (
            <View testID="product-page-preview">
              {snapshot.kind === "modules" ? (
                <ModuleStory
                  content={{
                    modules: snapshot.modules.filter((m) => m.enabled),
                  }}
                  mediaUrl={media}
                />
              ) : (
                <DetailStory
                  content={{
                    blocks: snapshot.content.blocks.map((b) =>
                      b.type === "image" ? { ...b, uri: media(b.uri) } : b,
                    ),
                  }}
                />
              )}
            </View>
          ) : (
            <>
              {snapshot.kind === "modules" ? (
                snapshot.modules.map((m, index) => (
                  <View key={m.id} style={card}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${SOURCE_MODULES.find(([id]) => id === m.id)?.[1] ?? m.id} 수정`}
                        accessibilityState={{ expanded: expanded === m.id }}
                        onPress={() =>
                          setExpanded(expanded === m.id ? null : m.id)
                        }
                        style={{
                          flex: 1,
                          minHeight: 48,
                          justifyContent: "center",
                        }}
                      >
                        <T weight="semibold">
                          {SOURCE_MODULES.find(([id]) => id === m.id)?.[1] ??
                            m.id}
                        </T>
                        <T variant="caption" muted numberOfLines={2}>
                          {m.enabled
                            ? m.texts.map((t) => t.value).join(" · ") ||
                              `사진 ${m.photos.length}장`
                            : "페이지에서 숨김"}
                        </T>
                      </Pressable>
                      <Switch
                        thumbColor="#FFFFFF"
                        {...(Platform.OS === "web"
                          ? { activeThumbColor: "#FFFFFF" }
                          : {})}
                        accessibilityLabel={`${SOURCE_MODULES.find(([id]) => id === m.id)?.[1] ?? m.id} 표시`}
                        value={m.enabled}
                        disabled={busy}
                        trackColor={{
                          false: tokens.color.border,
                          true: tokens.color.accent,
                        }}
                        onValueChange={(value) =>
                          update((s) => {
                            s.modules[index].enabled = value;
                          })
                        }
                      />
                    </View>
                    {expanded === m.id ? (
                      <>
                        {!m.texts.length ? (
                          <Button
                            label="문구 추가"
                            variant="outline"
                            disabled={busy}
                            onPress={() =>
                              update((s) => {
                                s.modules[index].texts.push({
                                  fieldKey: m.id,
                                  value: "",
                                });
                              })
                            }
                          />
                        ) : null}
                        {m.texts.map((t, ti) => (
                          <TextInput
                            key={`${t.fieldKey}-${ti}`}
                            accessibilityLabel={`${SOURCE_MODULES.find(([id]) => id === m.id)?.[1] ?? m.id} 내용 ${ti + 1}`}
                            multiline
                            editable={!busy}
                            value={t.value}
                            maxLength={3000}
                            style={fieldStyle}
                            onChangeText={(value) =>
                              update((s) => {
                                s.modules[index].texts[ti].value = value;
                              })
                            }
                          />
                        ))}
                        {m.photos.map((p, pi) => (
                          <View key={`${p.uri}-${pi}`} style={{ gap: 8 }}>
                            <StoryImage uri={media(p.uri)} alt={p.alt} />
                            <Button
                              label={`사진 ${pi + 1} 제외`}
                              variant="text"
                              disabled={busy}
                              onPress={() =>
                                update((s) => {
                                  s.modules[index].photos.splice(pi, 1);
                                })
                              }
                            />
                          </View>
                        ))}
                        {m.illustrationId ? (
                          <View style={{ gap: 8 }}>
                            {["small", "medium", "large"].map((size, i) => (
                              <Button
                                key={size}
                                label={["소과", "중과", "대과"][i]}
                                variant={
                                  m.illustrationId === `hand-citrus-${size}`
                                    ? "secondary"
                                    : "outline"
                                }
                                disabled={busy}
                                onPress={() =>
                                  update((s) => {
                                    s.modules[index].illustrationId =
                                      `hand-citrus-${size}`;
                                  })
                                }
                              />
                            ))}
                          </View>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                ))
              ) : (
                <>
                  {snapshot.content.blocks.map((block, index) => (
                    <View key={block.id} style={card}>
                      {block.type === "text" ? (
                        <>
                          <TextInput
                            accessibilityLabel={`제목 ${index + 1}`}
                            editable={!busy}
                            value={block.title}
                            maxLength={100}
                            style={{ ...fieldStyle, minHeight: 48 }}
                            onChangeText={(value) =>
                              update((s) => {
                                const b = s.content.blocks[index];
                                if (b.type === "text") b.title = value;
                              })
                            }
                          />
                          <TextInput
                            accessibilityLabel={`내용 ${index + 1}`}
                            multiline
                            editable={!busy}
                            value={block.body}
                            maxLength={3000}
                            style={fieldStyle}
                            onChangeText={(value) =>
                              update((s) => {
                                const b = s.content.blocks[index];
                                if (b.type === "text") b.body = value;
                              })
                            }
                          />
                        </>
                      ) : (
                        <StoryImage uri={media(block.uri)} alt={block.alt} />
                      )}
                      <Button
                        label={`항목 ${index + 1} 삭제`}
                        variant="text"
                        disabled={busy}
                        onPress={() =>
                          update((s) => {
                            s.content.blocks.splice(index, 1);
                          })
                        }
                      />
                    </View>
                  ))}
                  <Button
                    label="설명 추가"
                    variant="outline"
                    disabled={busy}
                    onPress={() =>
                      update((s) => {
                        s.content.blocks.push({
                          id: newIdempotencyKey(),
                          type: "text",
                          title: "",
                          body: "",
                        });
                      })
                    }
                  />
                </>
              )}
              {snapshot.kind === "modules" ? (
                <View style={card}>
                  <T weight="semibold">상세 항목 추가</T>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {SOURCE_MODULES.filter(
                      ([id]) => !snapshot.modules.some((m) => m.id === id),
                    ).map(([id, label]) => (
                      <Button
                        key={id}
                        label={label}
                        variant="outline"
                        disabled={busy}
                        onPress={() => {
                          update((s) => {
                            s.modules.push({
                              id,
                              enabled: true,
                              texts: [{ fieldKey: id, value: "" }],
                              photos: [],
                              illustrationId: null,
                            });
                          });
                          setExpanded(id);
                        }}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
              <Button
                label="상품 정보·판매 설정"
                variant="text"
                disabled={busy || dirty}
                onPress={() => router.push(`/products/${productId}/edit`)}
              />
            </>
          )}
        </View>
      </Scroll>
      {row && snapshot ? (
        <BottomBar>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label={preview ? "편집으로" : "미리보기"}
              variant="outline"
              style={{ flex: 1 }}
              disabled={busy}
              onPress={() => setPreview(!preview)}
            />
            <Button
              label="수정본 저장"
              style={{ flex: 1 }}
              disabled={!dirty || busy}
              loading={busy}
              onPress={() =>
                void act(async () => {
                  const result = await productWorkspace.save(
                    productId,
                    row.version,
                    snapshot,
                    key(`save:${row.version}:${JSON.stringify(snapshot)}`),
                  );
                  if (alive.current) {
                    accept(result);
                    setNotice(
                      "수정본을 저장했어요. 아직 상품에는 반영되지 않았어요.",
                    );
                  }
                })
              }
            />
          </View>
          <Button
            label="상품에 반영"
            variant="text"
            disabled={dirty || busy || !row.hasUnpublishedChanges}
            onPress={() => setConfirm(true)}
          />
        </BottomBar>
      ) : null}
      <Sheet visible={confirm} onClose={() => !busy && setConfirm(false)}>
        <T variant="heading">상품에 반영할까요?</T>
        <T>
          {status === "PUBLISHED"
            ? "반영하면 구매자가 보는 판매페이지가 바로 바뀌어요."
            : "상품 상세를 반영해요. 판매 공개에는 기존 승인 절차가 필요해요."}
        </T>
        <Button
          label="확인 · 상품에 반영"
          disabled={busy}
          onPress={() =>
            void act(async () => {
              const result = await productWorkspace.apply(
                productId,
                row!.version,
                key(`apply:${row!.version}`),
              );
              if (alive.current) {
                accept(result);
                setConfirm(false);
                setNotice("상품에 반영했어요.");
              }
            })
          }
        />
        <Button
          label="취소"
          variant="outline"
          disabled={busy}
          onPress={() => setConfirm(false)}
        />
      </Sheet>
      <Sheet visible={!!leave} onClose={() => setLeave(null)}>
        <T variant="heading">수정 내용을 버리고 계속할까요?</T>
        <Button label="계속 편집" onPress={() => setLeave(null)} />
        <Button
          label="수정 내용 버리고 이동"
          variant="outline"
          onPress={() => {
            const go = leave;
            setLeave(null);
            go?.();
          }}
        />
      </Sheet>
    </Screen>
  );
}
