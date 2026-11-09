import { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { Sheet } from "./bars";
import { T } from "./Text";
import { Button } from "./Button";
import { tokens } from "./tokens";

export function MessageEditSheet({ body, limit, makeKey, onSave, onClose }: {
  body: string; limit: number; makeKey: () => string;
  onSave: (text: string, key: string) => Promise<void>; onClose: () => void;
}) {
  const [text, setText] = useState(body), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef<{text: string; key: string} | null>(null), lock = useRef(false);
  return <Sheet visible onClose={() => { if (!lock.current) onClose(); }}>
    <T variant="heading" accessibilityRole="header">메시지 수정</T>
    <TextInput accessibilityLabel="수정할 메시지" value={text} onChangeText={setText} multiline maxLength={limit}
      editable={!busy} style={{ minHeight: 100, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 12, padding: 12 }} />
    {error ? <View accessibilityRole="alert"><T color={tokens.color.error}>{error}</T></View> : null}
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Button label="취소" variant="secondary" disabled={busy} onPress={onClose} style={{ flex: 1 }} />
      <Button label="수정 저장" loading={busy} disabled={busy} style={{ flex: 1 }} onPress={async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError("");
        if (pending.current?.text !== text) pending.current = {text, key: makeKey()};
        try { await onSave(text, pending.current.key); }
        catch (e) { setError(e instanceof Error ? e.message : "수정하지 못했어요. 다시 시도해 주세요."); }
        finally { lock.current = false; setBusy(false); }
      }} />
    </View>
  </Sheet>;
}
