import {
  ModuleStory,
  SOURCE_MODULES,
  Button,
  Icon,
  T,
  StoryImage,
  tokens,
} from "@farmclub/ui";
import { Children, useState, type ReactNode } from "react";
import { Pressable, TextInput, View, type TextStyle } from "react-native";
import { SectionSwitch } from "./SectionSwitch";
export type CanvasModule = {
  id: string;
  enabled: boolean;
  texts: { fieldKey: string; value: string }[];
  photos: { uri: string; alt: string }[];
  illustrationId?: string | null;
};
export function PageCanvas({
  modules,
  onChange,
  media = (uri) => uri,
  photos = [],
  onUpload,
  busy = false,
  details,
  onUploading,
  blocked = [],
}: {
  modules: CanvasModule[];
  onChange: (modules: CanvasModule[]) => void;
  media?: (uri: string) => string;
  photos?: { uri: string; alt: string }[];
  onUpload?: () => Promise<{ uri: string; alt: string }[]>;
  busy?: boolean;
  details?: (id: string) => ReactNode;
  onUploading?: (v: boolean) => void;
  blocked?: string[];
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [moving, setMoving] = useState<{ id: string; index: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState<string | null>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});
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
      texts: module.texts.length
        ? module.texts
        : (id === "hero" ? ["name", "hero"] : [id]).map((fieldKey) => ({
            fieldKey,
            value: "",
          })),
    };
  });
  const update = (id: string, fn: (m: CanvasModule) => void) => {
    setMoving(null);
    const next = structuredClone(displayModules);
    fn(next.find((m) => m.id === id)!);
    onChange(next);
  };
  const availablePhotos = [...new Map(photos.map((p) => [p.uri, p])).values()];
  const editing = {
    text: (
      m: Omit<CanvasModule, "enabled">,
      index: number,
      style: TextStyle,
    ) => (
      <TextInput
        accessibilityLabel={`${m.texts[index].fieldKey === "name" ? "상품 이름" : title(m.id)} 내용`}
        multiline
        onContentSizeChange={(e) => {
          const key = `${m.id}:${index}`;
          const height = Math.max(40, e.nativeEvent.contentSize.height);
          setHeights((old) =>
            old[key] === height ? old : { ...old, [key]: height },
          );
        }}
        value={m.texts[index].value}
        editable={!busy && !uploading}
        maxLength={3000}
        placeholder="내용을 입력해 주세요"
        style={{
          ...style,
          padding: 4,
          minHeight: 40,
          height: heights[`${m.id}:${index}`],
          borderWidth: 1,
          borderColor: selected === m.id ? tokens.color.border : "transparent",
          borderRadius: 4,
        }}
        onFocus={() => setSelected(m.id)}
        onChangeText={(value) =>
          update(m.id, (n) => {
            n.texts[index].value = value;
          })
        }
      />
    ),
    photos: (m: Omit<CanvasModule, "enabled">, content: ReactNode) => (
      <View style={{ gap: 8 }}>
        {Children.toArray(content).map((photo, i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`${title(m.id)} 사진 ${i + 1} 편집`}
            disabled={busy || uploading}
            onPress={() => setSelected(selected === m.id ? null : m.id)}
          >
            {photo}
          </Pressable>
        ))}
        <Pressable
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
        {selected === m.id ? (
          <View style={{ gap: 8 }}>
            {m.photos.map((p, i) => (
              <View
                key={`${p.uri}-${i}`}
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}
              >
                <T variant="caption">사진 {i + 1}</T>
                <Button
                  compact
                  label="앞으로"
                  variant="text"
                  disabled={busy || uploading || i === 0}
                  onPress={() =>
                    update(m.id, (n) => {
                      [n.photos[i - 1], n.photos[i]] = [
                        n.photos[i],
                        n.photos[i - 1],
                      ];
                    })
                  }
                />
                <Button
                  compact
                  label="뒤로"
                  variant="text"
                  disabled={busy || uploading || i === m.photos.length - 1}
                  onPress={() =>
                    update(m.id, (n) => {
                      [n.photos[i + 1], n.photos[i]] = [
                        n.photos[i],
                        n.photos[i + 1],
                      ];
                    })
                  }
                />
                <Button
                  compact
                  label="위치 이동"
                  variant="text"
                  disabled={busy || uploading}
                  onPress={() => setMoving({ id: m.id, index: i })}
                />
                <Button
                  compact
                  label={`사진 ${i + 1} 제외`}
                  variant="text"
                  disabled={busy || uploading}
                  onPress={() =>
                    update(m.id, (n) => {
                      n.photos.splice(i, 1);
                    })
                  }
                />
              </View>
            ))}
            {moving?.id === m.id ? (
              <View style={{ gap: 4 }}>
                <T variant="caption">이동할 위치</T>
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
                        setCollapsed((old) => ({ ...old, [to.id]: false }));
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
            {availablePhotos
              .filter((p) => !m.photos.some((x) => x.uri === p.uri))
              .map((p) => (
                <View key={p.uri} style={{ gap: 4 }}>
                  <View style={{ height: 80, overflow: "hidden" }}>
                    <StoryImage uri={media(p.uri)} alt={p.alt} />
                  </View>
                  <Button
                    compact
                    label={`상품사진 ${availablePhotos.indexOf(p) + 1} 추가`}
                    variant="outline"
                    disabled={busy || uploading}
                    onPress={() =>
                      update(m.id, (n) => {
                        n.photos.push(p);
                        setPicker(null);
                      })
                    }
                  />
                </View>
              ))}
            {onUpload ? (
              <Button
                compact
                label="새 사진 추가"
                variant="outline"
                disabled={busy || uploading}
                loading={uploading}
                onPress={async () => {
                  setUploading(true);
                  onUploading?.(true);
                  setError("");
                  try {
                    const added = await onUpload();
                    update(m.id, (n) => {
                      n.photos.push(...added);
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
      const current = displayModules.find((n) => n.id === m.id)!;
      const folded = !current.enabled || !!collapsed[m.id];
      return (
        <View testID={`canvas-section-${m.id}`} style={{ gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 8,
              backgroundColor: "#FAFAF9",
              borderRadius: 8,
            }}
          >
            <T
              variant="caption"
              style={{
                flex: 1,
                fontWeight: "400",
                opacity: current.enabled ? 1 : 0.4,
              }}
            >
              {title(m.id)}
            </T>
            {blocked.includes(m.id) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${title(m.id)} 내용 확인`}
                disabled={busy || uploading}
                onPress={() => setSelected(selected === m.id ? null : m.id)}
                style={{
                  width: 44,
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="pencil" size={18} />
              </Pressable>
            )}
            <SectionSwitch
              accessibilityLabel={`${title(m.id)} 표시`}
              value={current.enabled}
              disabled={
                busy ||
                uploading ||
                (!current.enabled && blocked.includes(m.id))
              }
              onValueChange={(value) => {
                update(m.id, (n) => {
                  n.enabled = value;
                });
                setCollapsed((old) => ({ ...old, [m.id]: !value }));
                setSelected(null);
                setPicker(null);
                setMoving(null);
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${title(m.id)} ${folded ? "펼치기" : "접기"}`}
              aria-expanded={!folded}
              disabled={!current.enabled || busy || uploading}
              onPress={() => {
                setCollapsed((old) => ({ ...old, [m.id]: !folded }));
                setSelected(null);
                setPicker(null);
                setMoving(null);
              }}
              style={{
                width: 44,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{ transform: [{ rotate: folded ? "0deg" : "180deg" }] }}
              >
                <Icon
                  name="chevronDown"
                  size={18}
                  color={tokens.color.textMuted}
                  strokeWidth={1.5}
                />
              </View>
            </Pressable>
          </View>
          {!folded ? content : null}
          {folded && blocked.includes(m.id) && selected === m.id
            ? details?.(m.id)
            : null}
          {!folded && selected === m.id ? (
            <View style={{ gap: 8 }}>
              {m.id === "sizePhoto" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {[
                    ["", "그림 없음"],
                    ["small", "소과"],
                    ["medium", "중과"],
                    ["large", "대과"],
                  ].map(([id, label]) => (
                    <Button
                      compact
                      key={id}
                      label={label}
                      variant="text"
                      disabled={busy || uploading}
                      onPress={() =>
                        update(m.id, (n) => {
                          n.illustrationId = id ? `hand-citrus-${id}` : null;
                        })
                      }
                    />
                  ))}
                </View>
              ) : null}
              {details?.(m.id)}
            </View>
          ) : null}
        </View>
      );
    },
  };
  return (
    <View style={{ gap: 12 }}>
      <T muted variant="sub">
        문구를 눌러 수정하고, + 칸에서 사진을 추가하세요. 눈 아이콘으로 공개
        여부를 바꿀 수 있어요.
      </T>
      {error ? <T color={tokens.color.error}>{error}</T> : null}
      <ModuleStory
        content={{ modules: displayModules }}
        mediaUrl={media}
        editing={editing}
      />
    </View>
  );
}
