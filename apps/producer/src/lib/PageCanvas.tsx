import {
  ModuleStory,
  SOURCE_MODULES,
  Button,
  T,
  StoryImage,
  tokens,
} from "@farmclub/ui";
import { useState, type ReactNode } from "react";
import { TextInput, View, type TextStyle } from "react-native";
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
        {content}
        {selected === m.id ? (
          <View style={{ gap: 8 }}>
            {m.photos.map((p, i) => (
              <View
                key={`${p.uri}-${i}`}
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}
              >
                <T variant="caption">사진 {i + 1}</T>
                <Button
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
                  label="위치 이동"
                  variant="text"
                  disabled={busy || uploading}
                  onPress={() => setMoving({ id: m.id, index: i })}
                />
                <Button
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
            {availablePhotos
              .filter((p) => !m.photos.some((x) => x.uri === p.uri))
              .map((p) => (
                <View key={p.uri} style={{ gap: 4 }}>
                  <View style={{ height: 80, overflow: "hidden" }}>
                    <StoryImage uri={media(p.uri)} alt={p.alt} />
                  </View>
                  <Button
                    label={`추가: ${p.alt || "상품 사진"}`}
                    variant="outline"
                    disabled={busy || uploading}
                    onPress={() =>
                      update(m.id, (n) => {
                        n.photos.push(p);
                      })
                    }
                  />
                </View>
              ))}
            {onUpload ? (
              <Button
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
      return (
        <View style={{ gap: 8 }}>
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
            <View style={{ flex: 1 }}>
              <Button
                label={`${title(m.id)} 편집`}
                variant="text"
                disabled={busy || uploading}
                onPress={() => setSelected(selected === m.id ? null : m.id)}
              />
            </View>
            <SectionSwitch
              accessibilityLabel={`${title(m.id)} 표시`}
              value={current.enabled}
              disabled={
                busy ||
                uploading ||
                (!current.enabled && blocked.includes(m.id))
              }
              onValueChange={(value) =>
                update(m.id, (n) => {
                  n.enabled = value;
                })
              }
            />
          </View>
          {current.enabled ? (
            content
          ) : (
            <T muted variant="caption">
              숨긴 항목 · 켜면 내용이 복원돼요
            </T>
          )}
          {selected === m.id ? (
            <View style={{ gap: 8 }}>
              {!current.enabled ? (
                <Button
                  label="내용 추가·수정"
                  variant="text"
                  onPress={() =>
                    update(m.id, (n) => {
                      n.enabled = true;
                    })
                  }
                />
              ) : null}
              {m.id === "sizePhoto" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {[
                    ["", "그림 없음"],
                    ["small", "소과"],
                    ["medium", "중과"],
                    ["large", "대과"],
                  ].map(([id, label]) => (
                    <Button
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
        문구를 눌러 바로 수정하세요. 사진은 항목의 편집 버튼에서 추가·제외할 수
        있어요.
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
