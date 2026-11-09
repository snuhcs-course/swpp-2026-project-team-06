import { messaging, type AiSettings } from "@farmclub/api";
import { Button, T } from "@farmclub/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

export function GlobalAiButton({ until, serverNow }: {
  until?: string | null;
  serverNow?: string | null;
}) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(Date.now());
  const lock = useRef(false), alive = useRef(true), offset = useRef(0);
  const accept = useCallback((value: AiSettings) => {
    if (alive.current)
      setSettings(previous => !previous || value.version >= previous.version ? value : previous);
  }, []);
  useEffect(() => {
    offset.current = serverNow ? Date.parse(serverNow) - Date.now() : 0;
  }, [serverNow]);
  useEffect(() => {
    alive.current = true;
    const load = () => messaging.aiSettings().then(accept).catch(() => {
      if (alive.current) setError("AI 설정을 불러오지 못했어요.");
    });
    void load();
    const poll = setInterval(load, 5000);
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      alive.current = false;
      clearInterval(poll);
      clearInterval(timer);
    };
  }, [accept]);
  const seconds = until
    ? Math.max(0, Math.ceil((Date.parse(until) - tick - offset.current) / 1000)) : 0;
  async function toggle() {
    if (!settings || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      accept(await messaging.saveAiSettings({ ...settings, enabled: !settings.enabled }));
      if (alive.current) setError("");
    } catch {
      if (alive.current) setError("변경하지 못했어요. 다시 눌러 주세요.");
      await messaging.aiSettings().then(accept).catch(() => {});
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return <View style={{ padding: 8, gap: 4 }}>
    <Button label={settings ? `전체 AI 응대 ${settings.enabled ? "ON" : "OFF"}` : "AI 설정 불러오는 중"}
      variant="outline" loading={busy} disabled={!settings || busy} onPress={toggle} />
    {seconds > 0 && settings?.enabled ? <T variant="caption">
      직접 응대 중 · AI 재개까지 {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
    </T> : null}
    {error ? <T variant="caption">{error}</T> : null}
  </View>;
}
