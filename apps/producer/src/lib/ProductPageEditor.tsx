import { PageCanvas } from "./PageCanvas";
import { chooseSourceFiles, type PickedFile } from "./sourceFiles";
import { shrinkPhoto } from "./photoResize";
import {
  apiUrl,
  catalog,
  newIdempotencyKey,
  productWorkspace,
  sourceAnalysis,
  type PageSnapshot,
  type ProductWorkspace,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  DetailStory,
  HeaderBar,
  ModuleStory,
  Photo,
  Screen,
  Scroll,
  Sheet,
  StoryImage,
  T,
  tokens,
  useAsync,
} from "@farmclub/ui";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, TextInput, View } from "react-native";
import { useHideTabBar, useSession } from "./session";
import { DetailEditor } from "./DetailEditor";
import { isMock } from "@farmclub/api";
import { goBackOr } from "./nav";

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
export function ProductPageEditor({
  productId,
  warning,
}: {
  productId: string;
  /** DEV-346: composer에 저장한 작업이 있어 이 편집기로 왔을 때 보이는 경고 */
  warning?: string;
}) {
  const { user } = useSession();
  const router = useRouter();
  // 자료 분석이 꺼진 서버(운영 배포 보류)는 기존 상세 편집을 쓴다(DEV-84)
  const source = useAsync(
    () =>
      isMock ? Promise.resolve({ enabled: false }) : sourceAnalysis.config(),
    [],
  );
  if (isMock || source.data?.enabled === false)
    return <DetailEditor productId={productId} />;
  if (source.data)
    return (
      <Editor key={`${user?.userId}:${productId}`} productId={productId} warning={warning} />
    );
  return (
    <Screen>
      <HeaderBar
        title="판매페이지 수정"
        onBack={() =>
          goBackOr(router, "/products")
        }
      />
      <View style={{ padding: tokens.space.gutter, gap: tokens.space.md }}>
        {source.error ? (
          <>
            <T>판매페이지 편집을 열지 못했어요. 다시 시도해 주세요.</T>
            <Button
              label="다시 불러오기"
              onPress={() => void source.reload()}
            />
          </>
        ) : (
          <ActivityIndicator color={tokens.color.accent} />
        )}
      </View>
    </Screen>
  );
}
// 반영 뒤 토스트 '보기'가 여는 소비자 앱 상품 페이지(DEV-324). 설정의 '소비자 앱에서 내 농가 보기'와 같은 주소 규칙
const CONSUMER_URL = process.env.EXPO_PUBLIC_CONSUMER_URL ?? "https://farmclub.kr";

function Editor({ productId, warning }: { productId: string; warning?: string }) {
  useHideTabBar();
  const { toast, hideToast } = useSession();
  // 저장 토스트('지금 반영')가 떠 있는지. 다시 고치기 시작하면 닫는다(고치는 중엔 반영할 수 없음, DEV-324)
  const saveToastShown = useRef(false);
  const saveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissSaveToast = () => {
    if (saveToastTimer.current) clearTimeout(saveToastTimer.current);
    saveToastTimer.current = null;
    if (!saveToastShown.current) return;
    saveToastShown.current = false;
    hideToast();
  };
  // 화면이 가려지거나(다른 화면을 위에 쌓음) 나가면 '지금 반영' 토스트도 닫는다. 그 화면에서는 반영할 수 없다
  useFocusEffect(useCallback(() => () => dismissSaveToast(), [])); // dismissSaveToast는 ref만 쓴다
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
  // 이 화면이 만든 사진 주소(uri → blob URL). 나갈 때 한 번에 해제한다(DEV-341)
  const ownedUrls = useRef(new Map<string, string>());
  const loadingUris = useRef(new Set<string>());
  useEffect(
    () => () => {
      ownedUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  // 불러오지 못한 사진(uri). 다른 사진은 그대로 보이고 이 사진만 다시 불러온다(DEV-341)
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  // 사진 올리는 중 진행(올린 장수/전체)과 올리기를 시작한 버튼. 그 버튼에만 보인다(DEV-341)
  type UploadControl = "canvas" | "blocks";
  const [photoProgress, setPhotoProgress] = useState<{
    done: number;
    total: number;
    from: UploadControl;
  } | null>(null);
  const showPhoto = (uri: string, url: string) => {
    const old = ownedUrls.current.get(uri);
    ownedUrls.current.set(uri, url);
    setPhotoUrls((current) => ({ ...current, [uri]: url }));
    if (old && old !== url) URL.revokeObjectURL(old);
  };
  const [extraPhotos, setExtraPhotos] = useState<
    { uri: string; alt: string }[]
  >([]);
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
  // 토스트 동작은 저장 때 만든 함수라 최신 dirty를 ref로 읽는다(DEV-324)
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const busyRef = useRef(busy);
  busyRef.current = busy;
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
  // 보여 줄 작업 사진(저장본·반영본·지금 고치는 내용). 주소 목록이 바뀔 때만 없는 사진을 받는다(DEV-341)
  const photoUris = useMemo(
    () =>
      [
        ...new Set(
          [row?.snapshot, row?.publishedSnapshot, snapshot].flatMap((snap) =>
            snap
              ? [
                  ...(snap.representativeUri ? [snap.representativeUri] : []),
                  ...snap.modules.flatMap((m) => m.photos.map((p) => p.uri)),
                  ...snap.content.blocks.flatMap((b) =>
                    b.type === "image" ? [b.uri] : [],
                  ),
                ]
              : [],
          ),
        ),
      ].filter((uri) => uri.startsWith("/api/source-media/")),
    [row, snapshot],
  );
  const photoKey = photoUris.join("\n");
  const loadPhoto = useCallback(
    async (uri: string) => {
      if (loadingUris.current.has(uri)) return;
      loadingUris.current.add(uri);
      setFailedPhotos((old) => old.filter((u) => u !== uri));
      try {
        const url = await productWorkspace.photo(productId, uri.split("/").pop()!);
        if (!alive.current) URL.revokeObjectURL(url);
        else showPhoto(uri, url);
      } catch {
        if (alive.current)
          setFailedPhotos((old) => (old.includes(uri) ? old : [...old, uri]));
      } finally {
        loadingUris.current.delete(uri);
      }
    },
    [productId],
  );
  useEffect(() => {
    for (const uri of photoUris)
      if (!ownedUrls.current.has(uri)) void loadPhoto(uri);
    // photoKey가 같으면(글만 고침·저장 응답) 다시 받지 않는다
  }, [photoKey, loadPhoto]);
  /** 사진을 줄여 올린다(동시에 2장). 실패한 사진은 건너뛰고 나머지를 돌려준다(DEV-341) */
  const uploadPhotos = async (files: PickedFile[], from: UploadControl) => {
    const added: ({ uri: string; alt: string } | null)[] = files.map(() => null);
    let next = 0,
      done = 0;
    if (files.length) setPhotoProgress({ done, total: files.length, from });
    const worker = async () => {
      while (next < files.length) {
        const index = next++;
        try {
          const { file, preview } = await shrinkPhoto(files[index]);
          const photo = await productWorkspace.uploadPhoto(productId, file);
          added[index] = photo;
          // 방금 줄인 사진을 바로 보인다(같은 사진을 다시 받지 않음). 못 줄인 형식은 서버 사본을 받는다
          if (!alive.current) {
            // 화면을 떠났으면 아무것도 받거나 만들지 않는다
          } else if (preview) showPhoto(photo.uri, URL.createObjectURL(preview));
          else void loadPhoto(photo.uri);
        } catch {
          // 아래에서 장수로 알린다
        }
        done += 1;
        if (alive.current) setPhotoProgress({ done, total: files.length, from });
      }
    };
    try {
      await Promise.all([worker(), worker()]);
    } finally {
      if (alive.current) setPhotoProgress(null);
    }
    const ok = added.filter((p): p is { uri: string; alt: string } => !!p);
    if (ok.length < files.length && alive.current)
      setError(
        `사진 ${files.length - ok.length}장을 올리지 못했어요. 그 사진만 다시 추가해 주세요.`,
      );
    return ok;
  };
  // 지금 보여 줄 사진 중 실패한 것만 안내한다(지운 사진의 실패는 남기지 않음)
  const shownFailures = failedPhotos.filter((uri) => photoUris.includes(uri));
  const uploadLabel = (from: UploadControl) =>
    photoProgress?.from === from
      ? `사진 올리는 중 ${photoProgress.done}/${photoProgress.total}`
      : undefined;
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
    // 웹 전용: 탭을 닫을 때 경고. 앱에는 beforeunload가 없다(DEV-33)
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  const act = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    // 새 작업(저장·반영·사진 올리기 등)이 시작되면 앞선 저장 토스트의 '지금 반영'은 더는 맞지 않는다
    dismissSaveToast();
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
  /** 수정본 저장. 성공하면 하단 토스트로 알리고 바로 반영할 수 있게 한다(DEV-324) */
  const save = () =>
    void act(async () => {
      if (!row || !snapshot) return;
      const result = await productWorkspace.save(
        productId,
        row.version,
        snapshot,
        key(`save:${row.version}:${JSON.stringify(snapshot)}`),
      );
      if (alive.current) {
        accept(result);
        // 반영할 것이 있을 때만 '지금 반영'(반영된 내용과 같게 되돌려 저장하면 없음)
        if (result.hasUnpublishedChanges) {
          toast("수정본을 저장했어요", {
            action: {
              label: "지금 반영",
              onPress: () => {
                saveToastShown.current = false;
                // 누르는 순간 다시 고치는 중이거나 다른 작업(사진 올리기 포함) 중이면 열지 않는다
                if (
                  dirtyRef.current ||
                  lock.current ||
                  busyRef.current ||
                  !navigation.isFocused()
                )
                  return;
                setConfirm(true);
              },
            },
          });
          saveToastShown.current = true;
          // 토스트(동작 버튼 있음)는 4초 뒤 저절로 닫힌다(packages/ui content.tsx Toast의 long 4000과 맞춤). 그 뒤에는 다른 토스트를 닫지 않게 표시를 내린다
          saveToastTimer.current = setTimeout(() => {
            saveToastShown.current = false;
            saveToastTimer.current = null;
          }, 4000);
        } else toast("수정본을 저장했어요");
      }
    });
  const update = (fn: (next: PageSnapshot) => void) => {
    if (!snapshot || busy) return;
    dismissSaveToast();
    setSnapshot((current) => {
      if (!current) return current;
      const next = copy(current);
      fn(next);
      return next;
    });
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
          goBackOr(router, "/products")
        }
      />
      <Button
        label={preview ? "편집으로 돌아가기" : "구매자 화면 미리보기"}
        variant="outline"
        disabled={busy}
        onPress={() => setPreview(!preview)}
      />
      <Scroll bottom={190}>
        <View style={{ padding: tokens.space.gutter, gap: tokens.space.md }}>
          <T variant="heading">{name}</T>
          {warning ? (
            <View accessibilityRole="alert">
              <T variant="sub" color={tokens.color.error}>
                {warning}
              </T>
            </View>
          ) : null}
          {/* 상태 줄(DEV-324): 고치는 중 / 저장됨·반영 전 / 반영된 내용 */}
          {row ? (
            <View
              testID="page-save-state"
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: tokens.radius.sm,
                backgroundColor:
                  !dirty && row.hasUnpublishedChanges
                    ? "#FDECE2" // accent 옅은 배경(apps/producer/spec.md DEV-294 기준표 값)
                    : tokens.color.surface,
              }}
            >
              <T
                variant="sub"
                weight="semibold"
                color={
                  !dirty && row.hasUnpublishedChanges
                    ? tokens.color.accentPressed
                    : tokens.color.text
                }
              >
                {dirty
                  ? "저장 안 한 수정이 있어요"
                  : row.hasUnpublishedChanges
                    ? "저장됨 · 아직 소비자에게 안 보여요"
                    : "지금 상품에 반영된 내용이에요"}
              </T>
            </View>
          ) : null}
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
          {row?.hasUnpublishedChanges && !preview ? (
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
          {shownFailures.length ? (
            <View accessibilityRole="alert" style={card} testID="photo-load-failed">
              <T color={tokens.color.error}>
                사진 {shownFailures.length}장을 불러오지 못했어요. 다른 사진은 그대로예요.
              </T>
              {shownFailures.map((uri, i) => (
                <Button
                  key={uri}
                  compact
                  label={
                    shownFailures.length > 1
                      ? `사진 ${i + 1} 다시 불러오기`
                      : "사진 다시 불러오기"
                  }
                  variant="outline"
                  onPress={() => void loadPhoto(uri)}
                />
              ))}
            </View>
          ) : null}
          {!row || !snapshot ? (
            !error ? (
              <ActivityIndicator accessibilityLabel="판매페이지 불러오는 중" />
            ) : null
          ) : preview ? (
            <View testID="product-page-preview">
              {/* 대표 사진이 없으면 구매자 화면처럼 기본 사진(DEV-322) */}
              <Photo
                uri={
                  snapshot.representativeUri
                    ? media(snapshot.representativeUri)
                    : null
                }
                width="100%"
                height={244}
                alt="대표사진"
              />
              {snapshot.kind === "modules" ? (
                <ModuleStory
                  content={{
                    hiddenSectionIds: snapshot.hiddenSectionIds,
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
                <PageCanvas
                  representativeUri={snapshot.representativeUri}
                  onRepresentativeChange={(uri) =>
                    update((s) => {
                      s.representativeUri = uri;
                    })
                  }
                  hiddenSectionIds={snapshot.hiddenSectionIds}
                  onHiddenSectionsChange={(ids) =>
                    update((s) => {
                      s.hiddenSectionIds = ids;
                    })
                  }
                  modules={snapshot.modules}
                  media={media}
                  busy={busy}
                  onUploading={(uploading: boolean) => {
                    // 사진을 올리기 시작하면 앞선 저장 토스트의 '지금 반영'은 더는 맞지 않는다
                    if (uploading) dismissSaveToast();
                    setBusy(uploading);
                  }}
                  onChange={(modules) =>
                    update((s) => {
                      s.modules = modules;
                    })
                  }
                  photos={[
                    ...new Map(
                      [
                        ...extraPhotos,
                        ...row.snapshot.modules.flatMap((m) => m.photos),
                        ...row.publishedSnapshot.modules.flatMap(
                          (m) => m.photos,
                        ),
                        ...snapshot.modules.flatMap((m) => m.photos),
                      ].map((p) => [p.uri, p]),
                    ).values(),
                  ]}
                  uploadLabel={uploadLabel("canvas")}
                  onUpload={async () => {
                    const files = await chooseSourceFiles(true);
                    setError("");
                    const added = await uploadPhotos(files, "canvas");
                    if (!snapshot.representativeUri && added[0])
                      update((s) => {
                        s.representativeUri = added[0].uri;
                      });
                    setExtraPhotos((old) => [...old, ...added]);
                    return added;
                  }}
                />
              ) : (
                <>
                  {snapshot.content.blocks.map((block, index) => (
                    <View
                      key={block.id}
                      style={{ gap: 12, paddingVertical: 16 }}
                    >
                      {block.type === "text" ? (
                        <>
                          <TextInput
                            accessibilityLabel={`제목 ${index + 1}`}
                            editable={!busy}
                            value={block.title}
                            maxLength={100}
                            style={{
                              ...fieldStyle,
                              borderWidth: 0,
                              fontSize: 24,
                              minHeight: 48,
                            }}
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
                            style={{ ...fieldStyle, borderWidth: 0 }}
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
                    label={uploadLabel("blocks") ?? "사진 추가"}
                    variant="outline"
                    disabled={busy}
                    onPress={() =>
                      void act(async () => {
                        const files = await chooseSourceFiles(true);
                        const next = copy(snapshot);
                        for (const photo of await uploadPhotos(files, "blocks"))
                          next.content.blocks.push({
                            id: newIdempotencyKey(),
                            type: "image",
                            ...photo,
                          });
                        setSnapshot(next);
                      })
                    }
                  />
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
      {row && snapshot && !preview ? (
        <BottomBar>
          {/* DEV-324: 저장한 수정본이 반영 전이면 주 버튼이 '상품에 반영', 고치는 중이면 '수정본 저장' */}
          {!dirty && row.hasUnpublishedChanges ? (
            <>
              <Button
                label="상품에 반영"
                disabled={busy}
                loading={busy && !photoProgress}
                onPress={() => setConfirm(true)}
              />
              <Button label="수정본 저장" variant="text" disabled onPress={save} />
            </>
          ) : (
            <>
              <Button
                label="수정본 저장"
                disabled={!dirty || busy}
                loading={busy && !photoProgress}
                onPress={save}
              />
              <Button
                label="상품에 반영"
                variant="text"
                disabled={dirty || busy || !row.hasUnpublishedChanges}
                onPress={() => setConfirm(true)}
              />
            </>
          )}
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
          // 저장 안 한 수정이 있으면 반영하지 않는다(반영이 화면의 수정을 덮어씀, DEV-324 토스트 '지금 반영' 경로)
          disabled={busy || dirty}
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
                // 판매 중이면 소비자가 보는 페이지가 바뀌었으니 바로 볼 수 있게 한다(DEV-324)
                if (status === "PUBLISHED")
                  toast("소비자 화면에 반영했어요", {
                    action: {
                      label: "보기",
                      onPress: () =>
                        void Linking.openURL(
                          `${CONSUMER_URL}/products/${productId}`,
                        ),
                    },
                  });
                else toast("상품에 반영했어요");
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
