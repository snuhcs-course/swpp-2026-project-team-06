import {
  messaging,
  newIdempotencyKey,
  isMock,
  type AiSettings,
  type AiPreview,
} from "@farmclub/api";
import {
  Button,
  HeaderBar,
  Input,
  Screen,
  Scroll,
  Segmented,
  T,
  tokens,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useHideTabBar } from "../../../lib/session";
export default function Settings() {
  useHideTabBar();
  const { consumerId, name } = useLocalSearchParams<{
    consumerId?: string;
    name?: string;
  }>();
  const router = useRouter(),
    [form, setForm] = useState<AiSettings | null>(null),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [saving, setSaving] = useState(false),
    [question, setQuestion] = useState(""),
    [preview, setPreview] = useState<AiPreview | null>(null),
    [previewing, setPreviewing] = useState(false),
    pending = useRef<{ body: string; key: string } | null>(null);
  const load = () =>
    messaging
      .aiSettings()
      .then(setForm)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    void load();
  }, []);
  function set(p: Partial<AiSettings>) {
    setForm((f) => (f ? { ...f, ...p } : f));
    setNote("");
    setPreview(null);
  }
  async function save() {
    if (!form || saving) return;
    setSaving(true);
    setError("");
    const body = JSON.stringify(form);
    if (pending.current?.body !== body)
      pending.current = { body, key: newIdempotencyKey() };
    try {
      setForm(
        await messaging.saveAiSettings(
          {
            ...form,
            handoffTopics: form.handoffTopics.filter((t) => t.trim()),
          },
          pending.current.key,
        ),
      );
      pending.current = null;
      setNote("저장했어요. 이후 질문부터 적용돼요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Screen>
      <HeaderBar
        title="AI 응답 설정"
        onBack={() =>
          router.navigate(
            consumerId
              ? {
                  pathname: "/chats/[consumerId]",
                  params: { consumerId, ...(name ? { name } : {}) },
                }
              : "/settings",
          )
        }
      />
      <Scroll>
        <View style={{ padding: 20, gap: 24 }}>
          <View
            style={{
              padding: 20,
              backgroundColor: "#F3F0E8",
              borderRadius: 20,
              gap: 8,
            }}
          >
            <T variant="heading">반복되는 질문은 AI에게</T>
            <T muted>
              농가가 정한 원칙과 등록된 정보로 안내해요. 어려운 질문은 직접 답할
              수 있게 모아 드려요.
            </T>
            {isMock ? (
              <T variant="caption" muted>
                로컬 Mock 미리보기 · 실제 AI를 호출하지 않아요
              </T>
            ) : null}
          </View>
          {error ? <T color={tokens.color.error}>{error}</T> : null}
          {note ? <T>{note}</T> : null}
          {!form ? (
            <Button label="설정 다시 불러오기" onPress={load} />
          ) : (
            <>
              <Segmented
                options={[
                  { value: "on", label: "자동 응답 켜기" },
                  { value: "off", label: "자동 응답 끄기" },
                ]}
                value={form.enabled ? "on" : "off"}
                onChange={(v) => set({ enabled: v === "on" })}
              />
              <T variant="caption" muted>
                꺼도 채팅은 계속할 수 있어요. 직접 응대 중인 방은 별도로 AI를
                재개해야 해요.
              </T>
              <Input
                label="소량 주문 원칙"
                value={form.smallOrderPolicy}
                onChangeText={(smallOrderPolicy) => set({ smallOrderPolicy })}
                multiline
                maxLength={1000}
                counter
                placeholder="예: 한 박스부터 예약할 수 있어요"
              />
              <Input
                label="예약·배송 안내 원칙"
                value={form.reservationShippingPolicy}
                onChangeText={(reservationShippingPolicy) =>
                  set({ reservationShippingPolicy })
                }
                multiline
                maxLength={1000}
                counter
                placeholder="확정된 상품 배송 기간을 우선 안내해요"
              />
              <View style={{ gap: 12 }}>
                <T variant="heading">자주 묻는 질문</T>
                {form.faqs.map((f, i) => (
                  <View
                    key={i}
                    style={{
                      padding: 16,
                      borderRadius: 18,
                      backgroundColor: tokens.color.surface,
                      gap: 12,
                    }}
                  >
                    <Input
                      label="질문"
                      value={f.question}
                      maxLength={200}
                      onChangeText={(question) =>
                        set({
                          faqs: form.faqs.map((v, j) =>
                            j === i ? { ...v, question } : v,
                          ),
                        })
                      }
                    />
                    <Input
                      label="답변"
                      value={f.answer}
                      multiline
                      maxLength={1000}
                      onChangeText={(answer) =>
                        set({
                          faqs: form.faqs.map((v, j) =>
                            j === i ? { ...v, answer } : v,
                          ),
                        })
                      }
                    />
                    <Button
                      label="이 질문 삭제"
                      variant="text"
                      onPress={() =>
                        set({ faqs: form.faqs.filter((_, j) => j !== i) })
                      }
                    />
                  </View>
                ))}
                <Button
                  label="＋ 자주 묻는 질문 추가"
                  variant="outline"
                  disabled={form.faqs.length >= 20}
                  onPress={() =>
                    set({ faqs: [...form.faqs, { question: "", answer: "" }] })
                  }
                />
              </View>
              <Input
                label="추가로 직접 답할 주제"
                value={form.handoffTopics.join("\n")}
                onChangeText={(v) => set({ handoffTopics: v.split("\n") })}
                multiline
                hint="한 줄에 한 주제 · 최대 20개, 각 100자"
                placeholder="예: 단체 예약"
              />
              <T variant="caption" muted>
                환불·보상, 농약·재배 방식, 개인적인 맛 평가, 품질·파손 판단은
                설정과 관계없이 농가에 전달해요.
              </T>
              <Button label="설정 저장" onPress={save} loading={saving} />
              <View
                style={{
                  padding: 20,
                  borderWidth: 1,
                  borderColor: tokens.color.border,
                  borderRadius: 20,
                  gap: 12,
                }}
              >
                <T variant="heading">답변 미리보기</T>
                <T variant="caption" muted>
                  지금 입력한 설정으로 확인해요. 설정이나 채팅 기록은 저장되지
                  않아요.
                </T>
                <Input
                  label="시험할 질문"
                  value={question}
                  onChangeText={setQuestion}
                  maxLength={1000}
                />
                <Button
                  label="미리보기"
                  variant="outline"
                  loading={previewing}
                  disabled={!question.trim()}
                  onPress={async () => {
                    setPreviewing(true);
                    try {
                      setPreview(
                        await messaging.previewAi(question, {
                          ...form,
                          handoffTopics: form.handoffTopics.filter((t) =>
                            t.trim(),
                          ),
                        }),
                      );
                      setError("");
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setPreviewing(false);
                    }
                  }}
                />
                {preview ? (
                  <View style={{ gap: 8 }}>
                    <T weight="bold">
                      {preview.action === "ANSWER"
                        ? "AI 안내"
                        : preview.action === "HANDOFF"
                          ? "농가에 전달"
                          : "자동 응답 꺼짐"}
                    </T>
                    <T>{preview.answer ?? preview.reason}</T>
                    <T variant="caption" muted>
                      {preview.sourceRefs.join(" · ") || "확답하지 않아요"} ·
                      미저장 설정
                    </T>
                  </View>
                ) : null}
              </View>
            </>
          )}
        </View>
      </Scroll>
    </Screen>
  );
}
