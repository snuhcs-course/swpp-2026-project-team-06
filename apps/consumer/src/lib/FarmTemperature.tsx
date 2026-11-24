import { engagement, farms } from "@farmclub/api";
import { Button, Icon, Input, Notice, Sheet, Skeleton, T, focusRing, tokens } from "@farmclub/ui";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useFocusedAsync } from "./useFocusedAsync";
import { useEngagementSession } from "./engagementSession";

export function FarmTemperature({ farmId }: { farmId: string }) {
  const temperature = useFocusedAsync(() => farms.temperature(farmId), [farmId]);
  const [explaining, setExplaining] = useState(false);
  const data = temperature.data;
  return (
    <>
      {data ? (
        <Pressable
          testID="farm-temperature"
          accessibilityRole="button"
          accessibilityLabel={`농가 온도 ${(data.temperatureTenths / 10).toFixed(1)}도, 산정 기준 보기`}
          onPress={() => setExplaining(true)}
          style={({ pressed, ...state }) => [{
            minHeight: 104, borderRadius: tokens.radius.md, padding: 20, gap: 12,
            backgroundColor: tokens.color.surface, opacity: pressed ? 0.75 : 1,
          }, (state as { focused?: boolean }).focused && focusRing]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="semibold">농가 온도</T>
              <T variant="sub" muted>함께 쌓아 가는 따뜻한 관계</T>
            </View>
            <T variant="title" color={tokens.color.accent}>{(data.temperatureTenths / 10).toFixed(1)}°C</T>
            <Icon name="chevron" size={18} color={tokens.color.textMuted} />
          </View>
          <View style={{ height: 5, borderRadius: tokens.radius.full, backgroundColor: tokens.color.border, overflow: "hidden" }}>
            <View style={{ height: 5, width: `${Math.max(0, Math.min(100, data.temperatureTenths / 990 * 100))}%`, borderRadius: tokens.radius.full, backgroundColor: tokens.color.accent }} />
          </View>
        </Pressable>
      ) : temperature.loading ? (
        <View accessibilityLabel="농가 온도 불러오는 중" style={{ gap: 8 }}><Skeleton width="100%" height={104} /></View>
      ) : null}
      {temperature.error ? (
        <Notice title="농가 온도를 불러오지 못했어요" tone="error" action={<Button label="온도 다시 불러오기" variant="text" onPress={() => void temperature.reload()} />} />
      ) : null}
      <Sheet visible={explaining} title="농가 온도는 어떻게 오르나요?" onClose={() => setExplaining(false)}>
        <View testID="temperature-policy" style={{ gap: 12 }}>
        <T>36.5°C에서 시작해요. 실제로 저장된 활동을 0.1°C 단위로 더하거나 빼고, 0.0~99.0°C 사이로 표시해요.</T>
        <T>팔로우 +0.1°C · 소식 공감 +0.1°C · 농가의 직접 답변 +0.1°C</T>
        <T>소식은 하루 한 번, 한 주에 세 번까지 +0.1°C씩 반영해요. 소식·공감·직접 답변은 최근 28일을 봐요.</T>
        <T>팔로우는 현재 손님 100명, 공감과 직접 답변은 각각 손님 30명까지 반영해요. 같은 손님의 공감이나 답변은 한 번만 세요.</T>
        <T>구매가 확정된 별점 4~5점은 +0.1°C, 3점은 그대로, 1~2점은 −0.1°C예요. 수정한 별점이 기존 별점을 대신해요.</T>
        <T>신고는 운영팀이 확인한 사안만 −0.1°C예요. 중복 신고는 한 번만 반영하고, 판정이 취소되면 차감도 사라져요.</T>
        <T>팔로우·공감을 취소하거나 소식이 삭제되면 해당 활동이 빠져요. 환불된 주문의 별점도 반영하지 않아요.</T>
        {data ? <View style={{ padding: 16, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, gap: 8 }}>
          <T weight="semibold">지금 반영된 활동</T>
          <T>팔로우 {data.contributions.F} · 소식 {data.contributions.P} · 공감 {data.contributions.L} · 직접 답변 {data.contributions.H}</T>
          <T>별점 {data.contributions.R >= 0 ? "+" : ""}{data.contributions.R} · 확인된 신고 −{data.contributions.M}</T>
        </View> : null}
        <T variant="sub" muted>농가 온도는 참여를 보여 주는 참고 지표예요. 상품 품질을 보증하지 않아요. Farmclub의 자체 산정 기준을 사용해요.</T>
        </View>
        <Button label="알겠어요" onPress={() => setExplaining(false)} />
      </Sheet>
    </>
  );
}

export function FarmReportForm({ farmId, visible, onClose }: { farmId: string; visible: boolean; onClose: () => void }) {
  const session = useEngagementSession();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const submit = async () => {
    if (lock.current || !session.valid()) return;
    if (reason.trim().length < 10) { setError("신고 내용을 10자 이상 적어 주세요."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      await engagement.report(farmId, reason.trim());
      if (session.valid()) setSaved(true);
    } catch (e) {
      if (session.valid()) setError(e instanceof Error ? e.message : "신고를 보내지 못했어요. 다시 시도해 주세요.");
    } finally {
      lock.current = false;
      if (session.valid()) setBusy(false);
    }
  };
  return (
    <Sheet visible={visible && session.valid()} title="농가 신고" onClose={busy ? () => undefined : onClose}>
      {saved ? <>
        <Notice title="신고를 접수했어요" body="이미 접수한 신고가 있다면 기존 내용으로 확인해요. 운영팀의 검토 전에는 온도에 반영하지 않아요." />
        <Button label="확인" onPress={onClose} />
      </> : <>
        <T>직접 경험한 내용을 알려 주세요. 운영팀이 확인한 사안만 농가 온도에 반영해요.</T>
        <Input label="신고 내용" value={reason} onChangeText={(value) => { setReason(value); setError(""); }} multiline maxLength={1000} counter hint="10~1,000자 · 개인정보는 적지 말아 주세요" error={error} editable={!busy} />
        <Button label="신고 보내기" onPress={() => void submit()} loading={busy} disabled={!reason.trim()} />
        <Button label="닫기" variant="text" onPress={onClose} disabled={busy} />
      </>}
    </Sheet>
  );
}
