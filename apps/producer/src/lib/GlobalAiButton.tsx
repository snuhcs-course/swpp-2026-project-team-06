import { messaging, type AiSettings } from "@farmclub/api";
import { Icon, T, tokens } from "@farmclub/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

export function GlobalAiButton({ onEnabledChange }: { onEnabledChange?: (enabled: boolean) => void } = {}) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false), alive = useRef(true);
  const accept = useCallback((value: AiSettings) => {
    if (alive.current)
      setSettings(previous => !previous || value.version >= previous.version ? value : previous);
  }, []);
  useEffect(() => {
    alive.current = true;
    const load = () => messaging.aiSettings().then(accept).catch(() => {
      if (alive.current) setError("AI 설정을 불러오지 못했어요.");
    });
    void load();
    const poll = setInterval(load, 5000);
    return () => {
      alive.current = false;
      clearInterval(poll);
    };
  }, [accept]);
  useEffect(() => { if (settings) onEnabledChange?.(settings.enabled); }, [settings?.enabled, onEnabledChange]);
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
  return <View style={{ alignItems: "center", minWidth: 76 }}>
    <Pressable accessibilityRole="button"
      accessibilityLabel={settings ? `전체 AI 응대 ${settings.enabled ? "ON" : "OFF"}` : "AI 설정 불러오는 중"}
      accessibilityHint="농가의 전체 1:1 채팅 AI 응대를 켜거나 꺼요"
      accessibilityState={{ disabled: !settings || busy, selected: !!settings?.enabled }}
      disabled={!settings || busy} onPress={toggle}
      style={({ pressed }) => ({ width: 76, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 22,
        backgroundColor: pressed ? tokens.color.surface : "transparent" })}>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: settings?.enabled ? "#FFF2E9" : "transparent" }}>
      {busy || !settings ? <ActivityIndicator size="small" color={tokens.color.accent} /> : <>
        <Icon name="sparkles" size={24} color={settings.enabled ? tokens.color.accent : tokens.color.textMuted} />
        {!settings.enabled ? <View style={{ position: "absolute", width: 26, borderTopWidth: 2, borderColor: tokens.color.textMuted, transform: [{ rotate: "-45deg" }] }} /> : null}
        <View style={{ position: "absolute", right: 6, bottom: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: settings.enabled ? tokens.color.accent : tokens.color.textMuted }} />
      </>}
      </View>
      <T variant="caption" style={{ fontSize: 11, lineHeight: 14 }}>AI 답변 {settings ? (settings.enabled ? "ON" : "OFF") : "…"}</T>
    </Pressable>
    {error ? <T variant="caption">{error}</T> : null}
  </View>;
}

export function HumanReplyStatus({ until, serverNow, enabled }: { until?: string | null; serverNow?: string | null; enabled: boolean | null }) {
  const [tick, setTick] = useState(Date.now());
  const offset = useRef(0);
  useEffect(() => { offset.current = serverNow ? Date.parse(serverNow) - Date.now() : 0; }, [serverNow]);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = until ? Math.max(0, Math.ceil((Date.parse(until) - tick - offset.current) / 1000)) : 0;
  if (!enabled || !seconds) return null;
  return <View style={{ paddingHorizontal: 20, paddingVertical: 4 }}><T variant="caption" muted>
    직접 응대 중 · AI 재개까지 {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
  </T></View>;
}
