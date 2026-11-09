import { createElement, useEffect, useState, type ReactNode } from "react";
import { Image, Modal, Platform, Pressable, View } from "react-native";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { safe } from "./web";
import { T } from "./Text";
import { pickPhoto, type PickedPhoto } from "./pickPhoto";
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
    <ViewablePhoto uri={uri}>
      <Image
        source={{ uri }}
        accessibilityLabel="비공개 문의 사진"
        style={{ width: 220, height: 160, borderRadius: 14 }}
        resizeMode="cover"
      />
    </ViewablePhoto>
  ) : (
    <T variant="caption" muted>
      {error ? "사진을 불러올 수 없어요" : "사진 불러오는 중…"}
    </T>
  );
}
/**
 * 사진을 누르면 전체 화면으로 본다(DEV-295). 누르는 칸은 사진 위에 겹친 형제라 사진의 img 역할·이름은 그대로 남는다
 * (버튼 안에 넣으면 보조기술에서 사진이 사라진다). 새 의존성 없이 RN Modal + Image.
 */
export function ViewablePhoto({ uri, children }: { uri: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      {children}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="사진 크게 보기"
        onPress={() => setOpen(true)}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <PhotoViewer uri={open ? uri : null} onClose={() => setOpen(false)} />
    </View>
  );
}

/** 전체 화면 사진 보기. 바깥·닫기·뒤로(Android)·Escape(웹)로 닫는다 */
export function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View
        accessibilityViewIsModal
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" }}
        {...(Platform.OS === "web"
          ? ({ onKeyDown: (e: { key: string }) => { if (e.key === "Escape") onClose(); } } as object)
          : {})}
      >
        <Pressable
          accessibilityLabel="사진 닫기"
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {uri ? (
          <Image
            source={{ uri }}
            accessibilityLabel="크게 본 사진"
            resizeMode="contain"
            style={{ width: "100%", height: "80%" }}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="닫기"
          onPress={onClose}
          style={{
            position: "absolute",
            top: safe("top", 8),
            right: 8,
            width: 48,
            height: 48,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="close" color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
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
  /** 웹은 File, 앱은 사진 보관함에서 고른 {uri, name, type}(DEV-33) */
  upload: (file: File | PickedPhoto) => Promise<{ attachmentId: string }>;
  load: (id: string) => Promise<string>;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function send(file: File | PickedPhoto) {
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
      setError(e instanceof Error ? e.message : "사진을 올리지 못했어요");
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
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
              onChange: (e: { target: HTMLInputElement }) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void send(file);
              },
            }),
          )
        : Platform.OS !== "web" && ids.length < 3
          ? (
              <Button
                label={busy ? "사진 업로드 중…" : `사진 첨부 (${ids.length}/3)`}
                variant="text"
                disabled={busy || disabled}
                onPress={() =>
                  void pickPhoto().then((f) => f && send(f))
                }
              />
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
