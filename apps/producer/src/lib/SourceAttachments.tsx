import {
  sourceAnalysis as api,
  sourcePageImage,
  uploadSource,
  type SourceAsset,
  type SourceBatch,
} from "@farmclub/api";
import { Button, Icon, T, StoryImage, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Image, Pressable, TextInput, View } from "react-native";
import { chooseSourceFiles } from "./sourceFiles";
function Tile({
  batch,
  source,
  onEdit,
  onRemove,
  disabled,
  localUri,
  description,
  onDescription,
  onDescriptionBlur,
  descriptionError,
}: {
  descriptionError?: string;
  description: string;
  onDescription: (value: string) => void;
  onDescriptionBlur: () => void;
  localUri?: string;
  batch: string;
  source: SourceAsset;
  onEdit: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [uri, setUri] = useState(""),
    [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [uri, localUri]);
  const preview = text.trim().replace(/\s+/g, " ");
  useEffect(() => {
    let active = true,
      url = "";
    if (source.mime === "text/plain")
      api
        .text(batch, source.id)
        .then((r) => {
          if (active) setText(r.text);
        })
        .catch(() => {});
    else if (source.pageCount)
      sourcePageImage(batch, source.id, 1)
        .then((u) => {
          url = u;
          if (active) setUri(u);
          else URL.revokeObjectURL(u);
        })
        .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [batch, source.id, source.revision, source.pageCount]);
  return (
    <View
      testID="attachment-tile"
      style={{
        width: "47%",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: tokens.color.border,
        borderRadius: 12,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          zIndex: 1,
          flexDirection: "row",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            source.originalPhoto ? "상품사진 삭제" : "자료 삭제"
          }
          disabled={disabled}
          onPress={onRemove}
          style={{
            width: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              padding: 6,
              borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.9)",
            }}
          >
            <Icon name="close" size={18} strokeWidth={1.5} />
          </View>
        </Pressable>
      </View>
      <Pressable
        testID="attachment-preview"
        disabled={disabled || source.mime !== "text/plain"}
        accessibilityRole="button"
        accessibilityLabel={
          source.mime === "text/plain" ? "텍스트 내용 수정" : "첨부 미리보기"
        }
        onPress={onEdit}
        style={{
          aspectRatio: 1,
          overflow: "hidden",
          backgroundColor: tokens.color.surface,
        }}
      >
        {(uri || localUri) && !imageFailed ? (
          <Image
            source={{ uri: uri || localUri! }}
            accessibilityLabel={
              source.originalPhoto ? "상품사진" : "자료 미리보기"
            }
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <T
            numberOfLines={5}
            variant="caption"
            style={{
              paddingLeft: 10,
              paddingRight: 46,
              paddingTop: 14,
              paddingBottom: 10,
            }}
          >
            {imageFailed
              ? "미리보기를 불러오지 못했어요"
              : (preview
                  ? `[${preview.length > 48 ? preview.slice(0, 30) + "…" + preview.slice(-12) : preview}]`
                  : "") ||
                (source.mime === "application/pdf"
                  ? "PDF · 미리보기 준비 중"
                  : source.mime === "text/plain"
                    ? "텍스트"
                    : "사진 · 준비 중")}
          </T>
        )}
      </Pressable>
      {source.originalPhoto ? (
        <TextInput
          accessibilityLabel="사진 한 줄 설명"
          placeholder="어떤 사진인가요?"
          value={description}
          maxLength={300}
          editable={!disabled}
          onChangeText={onDescription}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onDescriptionBlur();
          }}
          style={{
            fontFamily: tokens.fontFamily,
            fontSize: 13,
            fontWeight: "400",
            color: tokens.color.text,
            padding: 8,
            minHeight: 44,
            borderBottomWidth: 1,
            borderColor: focused ? tokens.color.textMuted : tokens.color.border,
          }}
        />
      ) : null}
      {descriptionError ? (
        <View>
          <T variant="caption" color={tokens.color.error}>
            {descriptionError}
          </T>
          <Button
            compact
            label="설명 저장 다시 시도"
            variant="text"
            disabled={disabled}
            onPress={onDescriptionBlur}
          />
        </View>
      ) : null}
    </View>
  );
}
export function SourceAttachments({
  batch,
  busy,
  refresh,
  onBusy,
  onDirty,
  flushRef,
}: {
  flushRef: MutableRefObject<(() => Promise<void>) | null>;
  batch: SourceBatch;
  busy: boolean;
  refresh: () => Promise<void>;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
}) {
  const drafts = useRef<Record<string, { source: SourceAsset; value: string }>>(
    {},
  );
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const saving = useRef<Promise<void> | null>(null);
  const [descriptionError, setDescriptionError] = useState("");
  const [failedDescription, setFailedDescription] = useState("");
  const flushDescriptions = (): Promise<void> => {
    if (saving.current) return saving.current;
    const save = async () => {
      setDescriptionError("");
      try {
        while (Object.keys(drafts.current).length) {
          const [id, draft] = Object.entries(drafts.current)[0];
          setFailedDescription(id);
          const updated = await api.editSource(batch.id, draft.source, {
            description: draft.value,
          });
          if (drafts.current[id]) drafts.current[id].source = updated;
          await refresh();
          if (drafts.current[id]?.value === draft.value) {
            delete drafts.current[id];
            setDescriptions((old) => {
              const next = { ...old };
              delete next[id];
              return next;
            });
          }
        }
      } catch (e) {
        setDescriptionError(
          "설명을 저장하지 못했어요. 입력은 그대로 남아 있어요.",
        );
        throw e;
      }
    };
    saving.current = save().finally(() => {
      saving.current = null;
    });
    return saving.current;
  };
  useEffect(() => {
    flushRef.current = flushDescriptions;
    return () => {
      flushRef.current = null;
    };
  });
  const [editing, setEditing] = useState<SourceAsset | "new" | null>(null),
    [value, setValue] = useState(""),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [failed, setFailed] = useState<{ file: File; photo: boolean }[]>([]);
  const [pending, setPending] = useState<
    { file: File; photo: boolean; uri: string }[]
  >([]);
  const [localUris, setLocalUris] = useState<Record<string, string>>({});
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      urls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  const act = async (fn: () => Promise<void>) => {
    setWorking(true);
    onBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
      onBusy(false);
    }
  };
  useEffect(() => {
    onDirty(editing !== null || Object.keys(descriptions).length > 0);
    return () => onDirty(false);
  }, [editing, descriptions, onDirty]);
  const upload = async (file: File, photo: boolean) => {
    await flushDescriptions();
    const latest = await api.get(batch.id);
    const uri = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
    if (uri) urls.current.push(uri);
    setPending((old) => [...old, { file, photo, uri }]);
    try {
      const uploaded = await uploadSource(
        batch.id,
        latest.version,
        [],
        true,
        photo,
        file,
      );
      if (uri) setLocalUris((old) => ({ ...old, [uploaded.id]: uri }));
      await refresh();
    } finally {
      setPending((old) => old.filter((p) => p.file !== file));
    }
  };
  const add = (photo: boolean) =>
    void act(async () => {
      const files = await chooseSourceFiles(photo);
      for (const file of files) {
        try {
          await upload(file, photo);
        } catch (e) {
          setFailed((old) => [...old, { file, photo }]);
          setError(String(e));
        }
      }
    });
  const edit = (source: SourceAsset) =>
    void act(async () => {
      setValue((await api.text(batch.id, source.id)).text);
      setEditing(source);
    });
  return (
    <View style={{ gap: 16 }}>
      <T variant="sub" muted>
        이름·전화번호·주소 등 개인정보는 직접 가린 뒤 올려 주세요. 자료와 사진
        설명은 내용 분석을 위해 AI에 전송돼요.
      </T>
      {error ? <T color={tokens.color.error}>{error}</T> : null}
      {[false, true].map((photo) => (
        <View
          key={String(photo)}
          testID={photo ? "product-photo-box" : "source-material-box"}
          style={{
            borderWidth: 1,
            borderColor: tokens.color.border,
            borderRadius: 16,
            padding: 14,
            gap: 12,
          }}
        >
          <T variant="sub" weight="regular">
            {photo ? "상품사진" : "분석 자료"}
          </T>
          <T variant="caption" muted>
            {photo
              ? "판매페이지에 넣을 사진과 한 줄 설명을 추가해 주세요."
              : "텍스트·이미지·PDF·TXT를 넣어 주세요. 자료 이미지는 판매페이지에 들어가지 않아요."}
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {pending
              .filter((p) => p.photo === photo)
              .map((p, i) => (
                <View
                  key={`pending-${i}`}
                  style={{ width: "47%", gap: 8, padding: 8 }}
                >
                  {p.uri ? (
                    <View style={{ height: 110, overflow: "hidden" }}>
                      <StoryImage uri={p.uri} alt="업로드 중인 사진" />
                    </View>
                  ) : null}
                  <T variant="caption">업로드 중…</T>
                </View>
              ))}
            {batch.sources
              .filter((s) => s.originalPhoto === photo)
              .map((s) => (
                <Tile
                  key={s.id}
                  batch={batch.id}
                  descriptionError={
                    failedDescription === s.id ? descriptionError : undefined
                  }
                  description={descriptions[s.id] ?? s.description ?? ""}
                  onDescription={(value) => {
                    drafts.current[s.id] = {
                      source: drafts.current[s.id]?.source ?? s,
                      value,
                    };
                    setDescriptions((old) => ({ ...old, [s.id]: value }));
                  }}
                  onDescriptionBlur={() => {
                    if (drafts.current[s.id])
                      void flushDescriptions().catch(() => {});
                  }}
                  localUri={localUris[s.id]}
                  source={s}
                  disabled={busy || working}
                  onEdit={() => edit(s)}
                  onRemove={() =>
                    void act(async () => {
                      await saving.current?.catch(() => {});
                      await api.removeSource(batch.id, s);
                      delete drafts.current[s.id];
                      setDescriptions((old) => {
                        const next = { ...old };
                        delete next[s.id];
                        return next;
                      });
                      if (failedDescription === s.id) setDescriptionError("");
                    })
                  }
                />
              ))}
          </View>
          {failed
            .filter((f) => f.photo === photo)
            .map((f, i) => (
              <View
                key={i}
                style={{
                  borderWidth: 1,
                  borderColor: tokens.color.border,
                  borderRadius: 12,
                  padding: 8,
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="실패한 파일 삭제"
                  disabled={busy || working}
                  onPress={() => setFailed((old) => old.filter((x) => x !== f))}
                  style={{
                    alignSelf: "flex-end",
                    width: 44,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="close" size={18} />
                </Pressable>
                <T variant="caption">업로드 실패</T>
                <Button
                  compact
                  label="다시 업로드"
                  disabled={busy || working}
                  onPress={() =>
                    void act(async () => {
                      await upload(f.file, f.photo);
                      setFailed((old) => old.filter((x) => x !== f));
                    })
                  }
                />
              </View>
            ))}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              compact
              label={photo ? "상품사진 추가" : "자료 파일 추가"}
              variant="outline"
              disabled={busy || working}
              onPress={() => add(photo)}
            />
            {!photo ? (
              <Button
                compact
                label="텍스트 추가"
                variant="outline"
                disabled={busy || working}
                onPress={() => {
                  setValue("");
                  setEditing("new");
                }}
              />
            ) : null}
          </View>
        </View>
      ))}
      {editing ? (
        <View
          style={{
            padding: 16,
            gap: 12,
            borderWidth: 1,
            borderColor: tokens.color.border,
            borderRadius: 12,
          }}
        >
          <T weight="semibold">텍스트 내용</T>
          <TextInput
            accessibilityLabel="첨부 내용"
            multiline
            value={value}
            onChangeText={setValue}
            maxLength={30000}
            style={{
              padding: 12,
              minHeight: 80,
              borderWidth: 1,
              borderColor: tokens.color.border,
              borderRadius: 8,
            }}
          />
          <Button
            compact
            label="내용 저장"
            disabled={working || !value.trim()}
            onPress={() =>
              void act(async () => {
                if (editing === "new") {
                  const latest = await api.get(batch.id);
                  await uploadSource(
                    batch.id,
                    latest.version,
                    [],
                    true,
                    false,
                    value,
                  );
                } else await api.editSource(batch.id, editing, { text: value });
                setEditing(null);
              })
            }
          />
          <Button
            compact
            label="취소"
            variant="text"
            disabled={working}
            onPress={() => setEditing(null)}
          />
        </View>
      ) : null}
    </View>
  );
}
