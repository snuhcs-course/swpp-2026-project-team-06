import { createElement, useEffect, useState } from "react";
import { Image, Platform, View } from "react-native";
import { Button } from "./Button";
import { T } from "./Text";
import { tokens } from "./tokens";
export function PrivatePhoto({
  id,
  load,
}: {
  id: string;
  load: (id: string) => Promise<string>;
}) {
  const [uri, setUri] = useState<string | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let alive = true,
      url: string | undefined;
    load(id)
      .then((u) => {
        url = u;
        if (alive) setUri(u);
        else if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [id, load]);
  return uri ? (
    <Image
      source={{ uri }}
      accessibilityLabel="비공개 문의 사진"
      style={{ width: 220, height: 160, borderRadius: 14 }}
      resizeMode="cover"
    />
  ) : (
    <T variant="caption" muted>
      {error ? "사진을 불러올 수 없어요" : "사진 불러오는 중…"}
    </T>
  );
}
export function PrivatePhotos({
  ids,
  onChange,
  upload,
  load,
  disabled = false,
  onBusy,
}: {
  ids: string[];
  onChange: (ids: string[]) => void;
  upload: (file: File) => Promise<{ attachmentId: string }>;
  load: (id: string) => Promise<string>;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ids.map((id) => (
          <View key={id} style={{ gap: 4 }}>
            <PrivatePhoto id={id} load={load} />
            <Button
              label="사진 삭제"
              variant="text"
              disabled={busy || disabled}
              onPress={() => onChange(ids.filter((v) => v !== id))}
            />
          </View>
        ))}
      </View>
      {Platform.OS === "web" && ids.length < 3
        ? createElement(
            "label",
            {
              style: {
                padding: "8px 0",
                fontSize: 14,
                color: tokens.color.textMuted,
              },
            },
            busy ? "사진 업로드 중…" : `사진 첨부 (${ids.length}/3)`,
            createElement("input", {
              type: "file",
              accept: "image/jpeg,image/png,image/webp",
              disabled: busy || disabled,
              "aria-label": "비공개 사진 첨부",
              style: { display: "block", width: "100%", marginTop: 6 },
              onChange: async (e: { target: HTMLInputElement }) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) {
                  setError("사진 한 장은 10MB까지예요");
                  return;
                }
                setBusy(true);
                onBusy?.(true);
                setError("");
                try {
                  const a = await upload(file);
                  onChange([...ids, a.attachmentId]);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "사진을 올리지 못했어요",
                  );
                } finally {
                  setBusy(false);
                  onBusy?.(false);
                }
              },
            }),
          )
        : null}
      {error ? (
        <T variant="caption" color={tokens.color.error}>
          {error}
        </T>
      ) : null}
    </View>
  );
}
