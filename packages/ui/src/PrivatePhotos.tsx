import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
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
  onLongPress,
}: {
  id: string;
  load: (id: string) => Promise<string>;
  /** 사진을 길게 눌렀을 때(메시지 메뉴). 겹친 누르는 칸이 터치를 가져가므로 넘겨 받는다 */
  onLongPress?: () => void;
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
    <ViewablePhoto uri={uri} onLongPress={onLongPress}>
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
export function ViewablePhoto({
  uri,
  children,
  onLongPress,
}: {
  uri: string;
  children: ReactNode;
  /** 앱에서 사진을 길게 누르면 바깥 메시지 메뉴를 연다(안쪽 칸이 터치를 가져가므로) */
  onLongPress?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      {children}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="사진 크게 보기"
        onPress={() => setOpen(true)}
        onLongPress={onLongPress}
        delayLongPress={500}
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

/**
 * 소식방 답장의 작은 사진 첨부(DEV-467). 1:1의 PrivatePhotos 모양은 그대로 두고 소식방 입력칸만 쓴다.
 * 입력칸 왼쪽 ‘+’가 open()을 불러 숨긴 파일 칸(웹)·사진 보관함(앱)을 바로 연다. 보이는 기본 파일 칸은 없다.
 * 제한은 1:1과 같다(한 장 10MB, 3장).
 */
export function usePhotoAttach({
  count,
  max = 3,
  upload,
  onAdd,
  onBusy,
}: {
  count: number;
  max?: number;
  upload: (file: File | PickedPhoto) => Promise<{ attachmentId: string }>;
  onAdd: (id: string) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
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
      onAdd((await upload(file)).attachmentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 올리지 못했어요");
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  const open = () => {
    if (busy || count >= max) return;
    if (Platform.OS === "web") inputRef.current?.click();
    else void pickPhoto().then((f) => f && send(f));
  };
  const input =
    Platform.OS === "web"
      ? createElement("input", {
          ref: inputRef,
          type: "file",
          accept: "image/jpeg,image/png,image/webp",
          "aria-label": "비공개 사진 첨부",
          style: { display: "none" },
          onChange: (e: { target: HTMLInputElement }) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void send(file);
          },
        })
      : null;
  return { open, input, busy, error, full: count >= max };
}

/** 입력줄 위 한 줄 썸네일(72×72, 모서리 8, 간격 8). 오른쪽 위 어두운 원 ×(보이는 24, 누르는 48) */
export function AttachedPhotoRow({
  ids,
  load,
  onRemove,
  busy = false,
  error,
  max = 3,
  disabled = false,
}: {
  ids: string[];
  load: (id: string) => Promise<string>;
  onRemove: (id: string) => void;
  busy?: boolean;
  error?: string;
  max?: number;
  disabled?: boolean;
}) {
  if (!ids.length && !busy && !error) return null;
  return (
    <View style={{ gap: 4 }}>
      <View testID="attached-photo-row" style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {ids.map((id, i) => (
          <View key={id} style={{ width: 72, height: 72 }}>
            <Thumb id={id} load={load} label={`첨부 사진 ${i + 1}`} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`첨부 사진 ${i + 1} 삭제`}
              disabled={disabled}
              onPress={() => onRemove(id)}
              hitSlop={12}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: tokens.color.photoOverlay,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="close" size={14} color={tokens.color.onAccent} />
            </Pressable>
          </View>
        ))}
        {busy ? (
          <View
            accessibilityRole="text"
            accessibilityLabel="사진 올리는 중"
            style={{ width: 72, height: 72, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}
          >
            <T variant="caption" muted>올리는 중</T>
          </View>
        ) : null}
        {ids.length ? <T variant="caption" muted>{`${ids.length}/${max}`}</T> : null}
      </View>
      {error ? <T variant="caption" color={tokens.color.error}>{error}</T> : null}
    </View>
  );
}

function Thumb({ id, load, label }: { id: string; load: (id: string) => Promise<string>; label: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true,
      url: string | undefined;
    load(id)
      .then((u) => {
        url = u;
        if (alive) setUri(u);
        else if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [id, load]);
  return uri ? (
    <Image source={{ uri }} accessibilityLabel={label} style={{ width: 72, height: 72, borderRadius: tokens.radius.sm }} resizeMode="cover" />
  ) : (
    <View accessibilityLabel={label} style={{ width: 72, height: 72, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.surface }} />
  );
}
