import {
  sourceAnalysis as api,
  sourcePageImage,
  uploadSource,
  type SourceAsset,
  type SourceBatch,
} from "@farmclub/api";
import { Button, T, StoryImage, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { chooseSourceFiles } from "./sourceFiles";
function Tile({
  batch,
  source,
  onEdit,
  onRemove,
  disabled,
  localUri,
}: {
  localUri?: string;
  batch: string;
  source: SourceAsset;
  onEdit: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [uri, setUri] = useState(""),
    [text, setText] = useState("");
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
      style={{
        width: "47%",
        gap: 6,
        padding: 8,
        borderWidth: 1,
        borderColor: tokens.color.border,
        borderRadius: 12,
      }}
    >
      <Pressable
        disabled={
          disabled || (!source.originalPhoto && source.mime !== "text/plain")
        }
        accessibilityRole="button"
        accessibilityLabel={`${source.filename} ${source.originalPhoto ? "설명 수정" : "내용 수정"}`}
        onPress={onEdit}
        style={{
          height: 110,
          overflow: "hidden",
          backgroundColor: tokens.color.surface,
          borderRadius: 8,
        }}
      >
        {uri || localUri ? (
          <StoryImage uri={uri || localUri!} alt={source.filename} />
        ) : (
          <T numberOfLines={5} variant="caption" style={{ padding: 8 }}>
            {text ||
              (source.mime === "application/pdf"
                ? "PDF · 미리보기 준비 중"
                : source.mime === "text/plain"
                  ? "텍스트"
                  : "사진 · 준비 중")}
          </T>
        )}
      </Pressable>
      <T variant="caption" numberOfLines={1}>
        {source.filename}
      </T>
      {source.originalPhoto ? (
        <Button
          label={source.description || "어떤 사진인가요? 설명 추가"}
          variant="text"
          disabled={disabled}
          onPress={onEdit}
        />
      ) : null}
      <Button
        label="제외"
        variant="text"
        disabled={disabled}
        onPress={onRemove}
      />
    </View>
  );
}
export function SourceAttachments({
  batch,
  busy,
  refresh,
  onBusy,
  onDirty,
}: {
  batch: SourceBatch;
  busy: boolean;
  refresh: () => Promise<void>;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
}) {
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
    onDirty(editing !== null);
    return () => onDirty(false);
  }, [editing, onDirty]);
  const upload = async (file: File, photo: boolean) => {
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
      setValue(
        source.originalPhoto
          ? source.description || ""
          : (await api.text(batch.id, source.id)).text,
      );
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
          <T variant="heading">{photo ? "상품사진" : "분석 자료"}</T>
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
                      <StoryImage uri={p.uri} alt={p.file.name} />
                    </View>
                  ) : null}
                  <T variant="caption">{p.file.name} · 업로드 중…</T>
                </View>
              ))}
            {batch.sources
              .filter((s) => s.originalPhoto === photo)
              .map((s) => (
                <Tile
                  key={s.id}
                  batch={batch.id}
                  localUri={localUris[s.id]}
                  source={s}
                  disabled={busy || working}
                  onEdit={() => edit(s)}
                  onRemove={() =>
                    void act(async () => {
                      await api.removeSource(batch.id, s);
                    })
                  }
                />
              ))}
          </View>
          {failed
            .filter((f) => f.photo === photo)
            .map((f, i) => (
              <View key={i}>
                <T>{f.file.name} · 업로드 실패</T>
                <Button
                  label="다시 업로드"
                  disabled={busy || working}
                  onPress={() =>
                    void act(async () => {
                      await upload(f.file, f.photo);
                      setFailed((old) => old.filter((x) => x !== f));
                    })
                  }
                />
                <Button
                  label="실패한 파일 제외"
                  variant="text"
                  onPress={() => setFailed((old) => old.filter((x) => x !== f))}
                />
              </View>
            ))}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label={photo ? "상품사진 추가" : "자료 파일 추가"}
              variant="outline"
              disabled={busy || working}
              onPress={() => add(photo)}
            />
            {!photo ? (
              <Button
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
          <T weight="semibold">
            {editing !== "new" && editing.originalPhoto
              ? "사진 한 줄 설명"
              : "텍스트 내용"}
          </T>
          <TextInput
            accessibilityLabel="첨부 내용"
            multiline={editing === "new" || !editing.originalPhoto}
            value={value}
            onChangeText={setValue}
            maxLength={editing !== "new" && editing.originalPhoto ? 300 : 30000}
            style={{
              padding: 12,
              minHeight: 80,
              borderWidth: 1,
              borderColor: tokens.color.border,
              borderRadius: 8,
            }}
          />
          <Button
            label="내용 저장"
            disabled={
              working ||
              (!value.trim() && (editing === "new" || !editing.originalPhoto))
            }
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
                } else
                  await api.editSource(
                    batch.id,
                    editing,
                    editing.originalPhoto
                      ? { description: value }
                      : { text: value },
                  );
                setEditing(null);
              })
            }
          />
          <Button
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
