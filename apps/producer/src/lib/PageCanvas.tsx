import { FieldFeedback, FieldFeedbackContext } from "./FieldFeedback";
import { StoryTextHint } from "./SourceExclusions";
import {
  ModuleStory,
  Photo,
  SOURCE_MODULES,
  sourceModuleIcon,
  Button,
  Icon,
  T,
  tokens,
} from "@farmclub/ui";
import { Children, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AccessibilityInfo, Image, Platform, Pressable, TextInput, View, type ScrollView, type TextStyle, type TextInputProps } from "react-native";
import { pageTextHeight } from "./sourcePageHeight";
import { SectionSwitch } from "./SectionSwitch";
const PHOTO_MODULES = new Set(["sizePhoto", "crossSectionPhoto", "packagePhoto", "farmPhotos"]);

/** Web scrollHeight includes the current box: feeding it back into height can loop. */
export function PageTextInput(props: TextInputProps) {
  const node = useRef<TextInput | null>(null);
  const [height, setHeight] = useState(40);
  const measure = useCallback(() => {
    if (Platform.OS !== "web") return;
    const el = node.current as unknown as HTMLTextAreaElement | null;
    if (el?.style && typeof el.scrollHeight === "number") setHeight(pageTextHeight(el));
  }, []);
  useLayoutEffect(measure, [props.value, measure]);
  return <TextInput {...props} ref={node} style={[props.style, { height }]}
    onLayout={Platform.OS === "web" ? measure : undefined}
    onContentSizeChange={Platform.OS === "web" ? undefined : e => setHeight(Math.max(40, Math.ceil(e.nativeEvent.contentSize.height)))} />;
}

export type CanvasModule = {
  id: string;
  enabled: boolean;
  texts: { fieldKey: string; value: string }[];
  photos: { uri: string; alt: string }[];
  illustrationId?: string | null;
};
export function PageCanvas({
  modules,
  design,
  representativeUri,
  onRepresentativeChange,
  hiddenSectionIds,
  onHiddenSectionsChange,
  onChange,
  media = (uri) => uri,
  photos = [],
  onUpload,
  busy = false,
  details,
  notes,
  sectionAccessory,
  sectionFooter,
  onlyIds,
  initialSelected,
  initialIllustration,
  preview = false,
  emptyHint = false,
  showStoryTextHints = false,
  onUploading,
  uploadLabel,
  blocked = [],
  scrollRef,
}: {
  representativeUri?: string | null;
  onRepresentativeChange?: (uri: string) => void;
  modules: CanvasModule[];
  design?: unknown;
  hiddenSectionIds: string[];
  onHiddenSectionsChange: (ids: string[]) => void;
  onChange: (modules: CanvasModule[]) => void;
  media?: (uri: string) => string;
  photos?: { uri: string; alt: string }[];
  onUpload?: () => Promise<{ uri: string; alt: string }[]>;
  busy?: boolean;
  details?: (id: string) => ReactNode;
  /** DEV-452: always-visible notes under a section (combined edit view). */
  notes?: (id: string) => ReactNode;
  /** DEV-452: read-only page: small control at each section heading (see ModuleStory). */
  sectionAccessory?: (sectionId: string, moduleIds: string[], title: string) => ReactNode;
  /** Owner-only control at the end of a section in the read-only page (DEV-452). */
  sectionFooter?: (sectionId: string) => ReactNode;
  /** DEV-452 section sheet: only these modules can be added here. */
  onlyIds?: string[];
  /** DEV-452 "섹션 추가": open with this (empty) module ready to type into. */
  initialSelected?: string;
  /** Size picture to start with when the 크기 참고 section opens from a size choice (DEV-452). */
  initialIllustration?: string;
  preview?: boolean;
  /** 새 상품 채우기 화면(DEV-184): 빈 글 칸을 점선 네모 + '여기를 채워 주세요'로 보인다. */
  emptyHint?: boolean;
  /** 새 상품 composer의 판매·가격 단계 안내만 명시적으로 켠다. */
  showStoryTextHints?: boolean;
  onUploading?: (v: boolean) => void;
  /** 올리는 중 '새 사진 추가' 버튼에 보일 진행 문구(예: '사진 올리는 중 1/2', DEV-341) */
  uploadLabel?: string;
  blocked?: string[];
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const validation = useContext(FieldFeedbackContext);
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [moving, setMoving] = useState<{ id: string; index: number } | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [sizeOff, setSizeOff] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const addedNode = useRef<View>(null);
  const photoTarget = recentlyAdded && PHOTO_MODULES.has(recentlyAdded) ? recentlyAdded : null;
  const textTarget = photoTarget ? null : recentlyAdded;
  useEffect(() => {
    if (!recentlyAdded) return;
    if (preview) {
      setRecentlyAdded(null);
      return;
    }
    let cancelled = false;
    const node = addedNode.current;
    const scroll = scrollRef?.current;
    const reduceMotion = Platform.OS === "web"
      ? Promise.resolve(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
      : AccessibilityInfo.isReduceMotionEnabled();
    void reduceMotion.catch(() => true).then((reduced) => {
      if (cancelled || !node) return;
      if (Platform.OS === "web") {
        (node as unknown as HTMLElement).scrollIntoView({
          block: "center",
          behavior: reduced ? "instant" : "smooth",
        });
      } else if (scroll) {
        const content = (scroll as ScrollView & { getInnerViewRef(): View | null }).getInnerViewRef();
        if (content) node.measureLayout(content, (_x, y) => {
          if (!cancelled) scroll.scrollTo({ y: Math.max(0, y - tokens.space.md), animated: !reduced });
        });
      }
    });
    const timer = setTimeout(() => setRecentlyAdded(null), 2800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [preview, recentlyAdded, scrollRef]);
  const title = (id: string) =>
    SOURCE_MODULES.find(([key]) => key === id)?.[1] ?? id;
  const displayModules: CanvasModule[] = SOURCE_MODULES.map(([id]) => {
    const module = modules.find((m) => m.id === id) ?? {
      id,
      enabled: false,
      texts: [],
      photos: [],
      illustrationId: null,
    };
    return {
      ...module,
      texts: (id === "hero" ? ["name", "hero"] : [id]).map(
        (fieldKey) =>
          module.texts.find((t) => t.fieldKey === fieldKey) ?? {
            fieldKey,
            value: "",
          },
      ),
    };
  });
  const update = (id: string, fn: (m: CanvasModule) => void) => {
    setMoving(null);
    const next = structuredClone(displayModules);
    fn(next.find((m) => m.id === id)!);
    validation.clear(id);
    onChange(next);
  };
  const filled = (m: CanvasModule) =>
    m.texts.some((t) => t.value.trim()) ||
    m.photos.length > 0 ||
    !!m.illustrationId;
  const illustrationApplied = useRef(false);
  useEffect(() => {
    if (!initialIllustration || illustrationApplied.current) return;
    illustrationApplied.current = true;
    update("sizePhoto", (n) => {
      n.illustrationId = initialIllustration;
      n.enabled = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIllustration]);
  // DEV-452 (user review 11/28): 크기 참고 is on the new page by default, so the size picture is easy
  // to find. Buyers see nothing until a size is chosen; the owner can take the card out.
  const sizeModule = displayModules.find((m) => m.id === "sizePhoto");
  const sizeCard = emptyHint && !preview && !sizeOff && !onlyIds && !!sizeModule && !sizeModule.enabled && !filled(sizeModule);
  const active = (id: string) => {
    const m = displayModules.find((m) => m.id === id)!;
    return m.enabled && filled(m);
  };
  const activate = (id: string) => {
    setSelected(id);
    const m = displayModules.find((m) => m.id === id)!;
    if (!m.enabled && filled(m) && !blocked.includes(id))
      update(id, (n) => {
        n.enabled = true;
      });
  };
  const availablePhotos = [...new Map(photos.map((p) => [p.uri, p])).values()];
  const removeButton = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy || uploading}
      onPress={onPress}
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        width: 44,
        height: 44,
        zIndex: 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          backgroundColor: "rgba(255,255,255,0.9)",
          borderRadius: 12,
          padding: 3,
        }}
      >
        <Icon name="close" size={16} color={tokens.color.textMuted} />
      </View>
    </Pressable>
  );
  const editing = {
    hiddenSectionIds,
    revealedModuleId: emptyHint ? selected : null,
    active,
    // 미리보기 모양에서는 숨긴 섹션만 다시 켤 수 있게 눈 스위치를 보인다.
    sectionControl: (id: string, label: string) =>
      emptyHint && !hiddenSectionIds.includes(id) ? null : (
        <SectionSwitch
          accessibilityLabel={`${label} 표시`}
          value={!hiddenSectionIds.includes(id)}
          disabled={busy || uploading}
          onValueChange={(value) => {
            onHiddenSectionsChange(
              value
                ? hiddenSectionIds.filter((x) => x !== id)
                : [...hiddenSectionIds, id],
            );
            setSelected(null);
            setPicker(null);
            setMoving(null);
          }}
        />
      ),
    text: (
      m: Omit<CanvasModule, "enabled">,
      index: number,
      style: TextStyle,
    ) => emptyHint && m.texts[index].fieldKey === "name" && !m.texts[index].value.trim() ? null : (
      <View
        ref={textTarget === m.id && m.texts[index].fieldKey !== "name" ? addedNode : undefined}
        collapsable={textTarget !== m.id}
        style={{ gap: 5 }}
      >
        <PageTextInput
          accessibilityLabel={`${m.texts[index].fieldKey === "name" ? "상품 이름" : title(m.id)} 내용`}
          multiline
          value={m.texts[index].value}
          // 새 상품 채우기 화면에서는 상세 맨 위 제목을 위 상품명 칸 하나로만 고친다(저장 때 같은 값으로 맞춤).
          editable={
            !busy &&
            !uploading &&
            !(emptyHint && m.texts[index].fieldKey === "name")
          }
          maxLength={3000}
          placeholder={
            emptyHint
              ? m.texts[index].fieldKey === "name"
                ? "위 상품명이 여기에 들어가요"
                : "여기를 채워 주세요"
              : "내용을 입력해주세요"
          }
          placeholderTextColor="#B5B5B5"
          style={{
            fontFamily: tokens.fontFamily,
            ...style,
            padding: 4,
            paddingRight: m.texts[index].fieldKey === "name" ? 4 : 44,
            paddingLeft:
              style.textAlign === "center" && m.texts[index].fieldKey !== "name"
                ? 44
                : 4,
            minHeight: 40,
            borderWidth: 1,
            ...(emptyHint &&
            m.texts[index].fieldKey !== "name" &&
            !m.texts[index].value.trim() &&
            selected !== m.id
              ? {
                  borderStyle: "dashed" as const,
                  borderColor: tokens.color.textMuted,
                  borderRadius: 8,
                }
              : {
                  borderColor:
                    selected === m.id ? tokens.color.border : "transparent",
                  borderRadius: 4,
                }),
            ...(emptyHint && m.texts[index].fieldKey !== "name"
              ? {
                  backgroundColor: busy || uploading
                    ? tokens.color.surface
                    : focusedField === `${m.id}:${index}` ? "#FFF0DC" : "#FFF7EB",
                  borderColor: focusedField === `${m.id}:${index}` ? tokens.color.accent : "#E9B980",
                  borderStyle: "solid" as const,
                  borderRadius: 8,
                  paddingVertical: 10,
                }
              : {}),
            ...(textTarget === m.id && m.texts[index].fieldKey !== "name" && {
              borderWidth: 2,
              borderColor: tokens.color.accent,
            }),
          }}
          onFocus={() => {
            setFocusedField(`${m.id}:${index}`);
            activate(m.id);
          }}
          onBlur={() => setFocusedField(null)}
          onChangeText={(value) =>
            update(m.id, (n) => {
              n.texts[index].value = value;
              n.enabled = true;
            })
          }
        />
        {showStoryTextHints && selected === m.id ? <StoryTextHint value={m.texts[index].value} /> : null}
      </View>
    ),
    photos: (m: Omit<CanvasModule, "enabled">, content: ReactNode) => emptyHint && selected !== m.id && !m.photos.length ? null : emptyHint && selected !== m.id && m.photos.length ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`${title(m.id)} 사진 편집`} style={{ borderWidth: 2, borderColor: "#E9B980", backgroundColor: "#FFF7EB" }} disabled={busy || uploading} onPress={() => activate(m.id)}>{content}</Pressable>
    ) : (
      <View style={{ gap: 8 }}>
        {Children.toArray(content).map((photo, i) => (
          <View key={i}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${title(m.id)} 사진 ${i + 1} 편집`}
              style={emptyHint ? { borderWidth: 2, borderColor: "#E9B980", backgroundColor: "#FFF7EB" } : undefined}
              disabled={busy || uploading}
              onPress={() => activate(m.id)}
            >
              {photo}
            </Pressable>
            {onRepresentativeChange && (!emptyHint || selected === m.id) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  representativeUri === m.photos[i]?.uri
                    ? "대표사진"
                    : "대표로 지정"
                }
                aria-pressed={representativeUri === m.photos[i]?.uri}
                disabled={busy || uploading}
                onPress={() => onRepresentativeChange(m.photos[i].uri)}
                style={{
                  position: "absolute",
                  top: 2,
                  right: 46,
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.9)",
                  borderRadius: 22,
                }}
              >
                <Icon
                  name={
                    representativeUri === m.photos[i]?.uri ? "starFill" : "star"
                  }
                  size={18}
                  strokeWidth={1.5}
                />
              </Pressable>
            )}
            {/* 미리보기 모양(emptyHint)에서는 카드를 눌러 고를 때만 편집 조작을 보인다. */}
            {(!emptyHint || selected === m.id) &&
              removeButton(`${title(m.id)} 사진 ${i + 1} 제외`, () =>
                update(m.id, (n) => {
                  n.photos.splice(i, 1);
                }),
              )}
            {/* Move controls sit on the photo they move (user review 11/28). */}
            {selected === m.id ? (
              <View style={{ position: "absolute", left: 8, bottom: 8, flexDirection: "row", gap: 6 }}>
                {[
                  { label: "위로", hint: `사진 ${i + 1} 앞으로`, off: i === 0, run: () => update(m.id, (n) => { [n.photos[i - 1], n.photos[i]] = [n.photos[i], n.photos[i - 1]]; }) },
                  { label: "아래로", hint: `사진 ${i + 1} 뒤로`, off: i === m.photos.length - 1, run: () => update(m.id, (n) => { [n.photos[i + 1], n.photos[i]] = [n.photos[i], n.photos[i + 1]]; }) },
                  { label: "다른 섹션으로", hint: `사진 ${i + 1} 위치 이동`, off: false, run: () => setMoving({ id: m.id, index: i }) },
                ].filter((b) => !b.off).map((b) => (
                  <Pressable
                    key={b.label}
                    accessibilityRole="button"
                    accessibilityLabel={b.hint}
                    disabled={busy || uploading}
                    onPress={b.run}
                    style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.92)" }}
                  >
                    <T variant="caption" weight="semibold">{b.label}</T>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ))}
        {!emptyHint || selected === m.id ? (
          <Pressable
            ref={photoTarget === m.id ? addedNode : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${title(m.id)} 사진 추가`}
            disabled={busy || uploading}
            onPress={() => setPicker(picker === m.id ? null : m.id)}
            style={{
              minHeight: 104,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: tokens.color.border,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginVertical: 8,
              ...(photoTarget === m.id && {
                borderWidth: 2, borderColor: tokens.color.accent, borderStyle: "solid",
              }),
            }}
          >
            <Icon
              name="plus"
              size={22}
              color={tokens.color.textMuted}
              strokeWidth={1.5}
            />
            <T variant="caption" muted>
              사진 추가
            </T>
          </Pressable>
        ) : null}
        {selected === m.id ? (
          <View style={{ gap: 8 }}>
            {moving?.id === m.id ? (
              <View style={{ gap: 4 }}>
                <T variant="caption">{`사진 ${moving.index + 1}을 옮길 섹션`}</T>
                {displayModules
                  .filter((n) => n.id !== m.id)
                  .map((n) => (
                    <Button
                      compact
                      key={n.id}
                      label={title(n.id)}
                      disabled={busy || uploading || blocked.includes(n.id)}
                      variant="text"
                      onPress={() => {
                        const next = structuredClone(displayModules);
                        const from = next.find((x) => x.id === m.id)!;
                        const to = next.find((x) => x.id === n.id)!;
                        const [photo] = from.photos.splice(moving.index, 1);
                        if (!to.photos.some((p) => p.uri === photo.uri))
                          to.photos.push(photo);
                        to.enabled = true;
                        onChange(next);
                        setMoving(null);
                      }}
                    />
                  ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {picker === m.id ? (
          <View style={{ gap: 8 }}>
            {availablePhotos.some((p) => !m.photos.some((x) => x.uri === p.uri)) ? (
              <T variant="caption" muted>이미 올린 사진에서 고르거나 새 사진을 올려 주세요.</T>
            ) : null}
            {/* Whole photos as tiles, so the owner can tell them apart (user review 11/28). */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {availablePhotos
                .filter((p) => !m.photos.some((x) => x.uri === p.uri))
                .map((p) => (
                  <Pressable
                    key={p.uri}
                    accessibilityRole="button"
                    accessibilityLabel={`상품사진 ${availablePhotos.indexOf(p) + 1} 추가`}
                    disabled={busy || uploading}
                    onPress={() =>
                      update(m.id, (n) => {
                        n.photos.push(p);
                        n.enabled = true;
                        setPicker(null);
                      })
                    }
                    style={{ width: 104, gap: 4, alignItems: "center" }}
                  >
                    <View style={{ width: 104, height: 104, borderRadius: 10, overflow: "hidden", backgroundColor: "#F2EEE6", borderWidth: 1, borderColor: tokens.color.border }}>
                      <Image source={{ uri: media(p.uri) }} accessibilityLabel={p.alt || "상품 사진"} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
                    </View>
                    <T variant="caption" weight="semibold">＋ 넣기</T>
                  </Pressable>
                ))}
            </View>
            {onUpload ? (
              <Button
                compact
                label={(uploading && uploadLabel) || "새 사진 추가"}
                variant="outline"
                disabled={busy || uploading}
                // 진행 문구가 있으면 스피너 대신 글자로 보인다(스피너는 글자를 가림)
                loading={uploading && !uploadLabel}
                onPress={async () => {
                  setUploading(true);
                  onUploading?.(true);
                  setError("");
                  try {
                    const added = await onUpload();
                    update(m.id, (n) => {
                      n.photos.push(...added);
                      if (added.length) n.enabled = true;
                    });
                    if (added.length) setPicker(null);
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setUploading(false);
                    onUploading?.(false);
                  }
                }}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    ),
    wrap: (m: Omit<CanvasModule, "enabled">, content: ReactNode) => {
      const isActive = active(m.id) || (selected === m.id && !blocked.includes(m.id));
      return (
        <FieldFeedback field={m.id}><View
          testID={`canvas-section-${m.id}`}
          style={{ gap: selected === m.id ? 8 : 0 }}
        >
          {displayModules.find(module => module.id === m.id)?.enabled &&
            (!emptyHint || selected === m.id) &&
            removeButton(`${title(m.id)} 제외`, () => {
              update(m.id, (n) => {
                n.enabled = false;
                // Taking 크기 참고 out also takes its size picture away (user review 11/28).
                if (n.id === "sizePhoto") n.illustrationId = null;
              });
              setSelected(null);
              setPicker(null);
            })}
          <View
            testID={`canvas-content-${m.id}`}
            style={{ opacity: isActive ? 1 : 0.45 }}
          >
            {content}
          </View>
          {blocked.includes(m.id) || selected === m.id || (m.id === "sizePhoto" && sizeCard) ? (
            <View style={{ gap: 8 }}>
              {m.id === "sizePhoto" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <T variant="caption" muted>크기 그림</T>
                  {[
                    ["small", "소과"],
                    ["medium", "중과"],
                    ["large", "대과"],
                    ...(m.illustrationId ? [["", "그림 빼기"]] : []),
                  ].map(([id, label]) => (
                    <Button
                      compact
                      key={id}
                      label={label}
                      variant={(m.illustrationId ?? "") === (id ? `hand-citrus-${id}` : "") ? "primary" : "outline"}
                      disabled={busy || uploading}
                      onPress={() =>
                        update(m.id, (n) => {
                          n.illustrationId = id ? `hand-citrus-${id}` : null;
                          n.enabled = true;
                        })
                      }
                    />
                  ))}
                  {sizeCard && !m.illustrationId ? (
                    <Button compact variant="text" label="이 섹션 빼기" disabled={busy || uploading} onPress={() => { setSizeOff(true); if (selected === m.id) setSelected(null); }} />
                  ) : null}
                </View>
              ) : null}
              {details?.(m.id)}
            </View>
          ) : null}
          {notes?.(m.id)}
        </View></FieldFeedback>
      );
    },
  };
  // Sections that can still be added here (only this section's parts in a section sheet, DEV-452).
  const addable = displayModules.filter(m => !(m.id === "sizePhoto" && sizeCard) && (!onlyIds || onlyIds.includes(m.id)) && m.id !== "summary" && selected !== m.id && (m.id !== "hero" || !displayModules.some(x => x.id === "summary" && x.enabled && filled(x))) && !m.enabled);
  if (preview) return (
    <View testID="buyer-preview">
      {/* 대표 사진이 없으면 구매자 화면처럼 기본 사진(DEV-322) */}
      {!emptyHint ? <Photo uri={representativeUri ? media(representativeUri) : null} width="100%" height={244} alt="대표사진" /> : null}
      <ModuleStory content={{ hiddenSectionIds, modules: displayModules.filter((m) => m.enabled && !blocked.includes(m.id)) }} mediaUrl={media} sectionAccessory={sectionAccessory} sectionFooter={sectionFooter} />
    </View>
  );
  return (
    <View style={{ gap: 12 }}>
      {emptyHint ? null : (
        <T muted variant="sub">
          문구를 눌러 수정하고, + 칸에서 사진을 추가하세요. 눈 아이콘으로 공개
          여부를 바꿀 수 있어요. 내용을 비워놓은 부분은 구매자에게 표시되지
          않아요.
        </T>
      )}
      {error ? <T color={tokens.color.error}>{error}</T> : null}
      {/* 미리보기 모양에서는 대표사진을 페이지 맨 위(ProductPageBody)가 그린다. */}
      {representativeUri && !emptyHint ? (
        <Photo
          uri={media(representativeUri)}
          width="100%"
          height={244}
          alt="대표사진"
        />
      ) : null}
      <ModuleStory design={design}
        content={{ modules: emptyHint ? displayModules.filter(m => (m.enabled && !blocked.includes(m.id)) || selected === m.id || (m.id === "summary" && selected === "hero") || blocked.includes(m.id) || (m.id === "sizePhoto" && sizeCard)) : displayModules }}
        mediaUrl={media}
        editing={editing}
      />
      {emptyHint && addable.length ? <View style={{ padding: 20, gap: 8 }}>
        <T variant="caption" muted>내용 추가</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {addable.map(m => {
            const artwork = sourceModuleIcon(m.id);
            return <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`${title(m.id)} 추가`}
              disabled={busy || uploading}
              onPress={() => {
                setSelected(m.id);
                setRecentlyAdded(m.id);
                if (!blocked.includes(m.id)) update(m.id, n => { n.enabled = true; });
              }}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 8,
                minHeight: 48, paddingHorizontal: 10,
                borderWidth: 1, borderColor: tokens.color.border,
                borderRadius: tokens.radius.md,
                backgroundColor: tokens.color.background,
                opacity: busy || uploading ? 0.45 : pressed ? 0.7 : 1,
              })}
            >
              {artwork ? <Image source={artwork} accessible={false} aria-hidden resizeMode="contain" style={{ width: 24, height: 24 }} /> : <Icon name="page" size={24} />}
              <T variant="caption">{title(m.id)}</T>
              <Icon name="plus" size={18} />
            </Pressable>;
          })}
        </View>
      </View> : null}
    </View>
  );
}
