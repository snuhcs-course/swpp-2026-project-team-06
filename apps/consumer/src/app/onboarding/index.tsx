// SCR-06 첫 가입 온보딩 1/2 `/onboarding` (FEAT-01 I2, AC-01-12·14) — 닉네임·이름·휴대폰·가입 동의
// 카카오로 처음 로그인한 소비자만 온다. 카카오에서 온 값(이메일, 심사 뒤 이름·전화번호)은 미리 채우고 빠진 것만 입력한다.
import { ApiError, auth } from "@farmclub/api";
import {
  BottomBar,
  Button,
  Checkbox,
  HeaderBar,
  Input,
  Screen,
  Scroll,
  Sheet,
  T,
  tokens,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import {
  PHONE,
  SIGNUP_CONSENTS,
  SIGNUP_CONSENT_VERSION,
  formatPhone,
  safeNext,
} from "../../lib/onboarding";
import { useSession } from "../../lib/session";
import { isNetworkError, useToast } from "../../lib/toast";

export default function OnboardingProfile() {
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNext(params.next);
  const router = useRouter();
  const { user, ready, refresh, clearResume, hasResume } = useSession();
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<(typeof SIGNUP_CONSENTS)[number] | null>(null);
  const toast = useToast(160);

  // 카카오에서 온 값과 이전에 입력하다 만 값을 한 번 채운다
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (!user || filled) return;
    setNickname(user.nickname ?? "");
    // 10/17에 만든 카카오 계정은 이름 자리에 이메일이나 ‘카카오 사용자’가 들어 있다. 그 값은 채우지 않는다
    const legacy = !user.name || user.name.includes("@") || user.name === "카카오 사용자";
    setName(legacy ? "" : user.name);
    setPhone(user.phone ?? "");
    setFilled(true);
  }, [user, filled]);

  // 로그인 안 했으면 로그인으로, 이미 끝났으면 다음 화면으로
  useEffect(() => {
    if (!ready) return;
    if (!user)
      router.replace({ pathname: "/login", params: { next } });
    else if (!user.needsOnboarding && !busy) router.replace(next as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.userId]);

  const allAgreed = SIGNUP_CONSENTS.every((c) => agreed[c.kind]);
  const requiredAgreed = SIGNUP_CONSENTS.filter((c) => c.required).every(
    (c) => agreed[c.kind],
  );
  const valid = useMemo(
    () =>
      nickname.trim().length >= 2 &&
      nickname.trim().length <= 12 &&
      name.trim().length >= 2 &&
      name.trim().length <= 20 &&
      PHONE.test(phone.trim()),
    [nickname, name, phone],
  );

  function close() {
    // 닫기: 계정은 남고, 다음 로그인·관문에서 다시 이 화면으로 온다. 하려던 행동은 실행하지 않는다
    const back = hasResume && router.canGoBack();
    clearResume();
    if (back) router.back();
    // 주문서는 온보딩 없이 열 수 없으니 그 상품 화면으로 돌아간다(닫기가 다시 온보딩으로 돌아오지 않게)
    else if (next.startsWith("/checkout/"))
      router.replace(`/products/${next.split("/")[2]?.split("?")[0] ?? ""}` as never);
    else router.replace(next as never);
  }

  async function submit() {
    const e: Record<string, string> = {};
    const n = nickname.trim().length;
    if (n < 2 || n > 12) e.nickname = "닉네임은 2~12자로 적어 주세요";
    const m = name.trim().length;
    if (m < 2 || m > 20) e.name = "이름은 2~20자로 적어 주세요";
    if (!PHONE.test(phone.trim())) e.phone = "휴대폰 번호 형식으로 입력해 주세요";
    setErrors(e);
    if (Object.keys(e).length || !requiredAgreed) return;
    setBusy(true);
    try {
      await auth.saveConsents(
        SIGNUP_CONSENTS.map((c) => ({
          kind: c.kind,
          version: SIGNUP_CONSENT_VERSION,
          agreed: !!agreed[c.kind],
        })),
      );
      await auth.updateMe({
        nickname: nickname.trim(),
        name: name.trim(),
        phone: phone.trim(),
      });
      await refresh();
      router.replace({ pathname: "/onboarding/address", params: { next } });
    } catch (err) {
      if (err instanceof ApiError && err.details.fields) setErrors(err.details.fields);
      else if (isNetworkError(err)) toast.fail(err, () => void submit());
      else
        setErrors({
          _: err instanceof ApiError ? err.message : "저장하지 못했어요. 입력한 내용은 그대로 있어요.",
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeaderBar close onBack={close} />
      <Scroll bottom={150}>
        <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 8 }}>
          <T variant="sub" muted>
            1 / 2
          </T>
          <T variant="title" accessibilityRole="header">
            {"farmclub에서 쓸\n정보예요"}
          </T>
          <T variant="body" muted>
            농가와 이야기하고 주문할 때 필요한 것만 받아요.
          </T>
          {user?.email ? (
            <View
              style={{
                alignSelf: "flex-start",
                marginTop: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: tokens.radius.sm,
                backgroundColor: tokens.color.surface,
              }}
            >
              <T variant="sub">
                {user.email}
                <T variant="sub" muted>
                  {" "}· 카카오계정
                </T>
              </T>
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 20 }}>
          <Input
            label="닉네임"
            value={nickname}
            onChangeText={setNickname}
            maxLength={12}
            placeholder="2~12자"
            hint="농가 채팅과 소식방에 이 이름으로 보여요."
            error={errors.nickname}
          />
          <Input
            label="이름"
            value={name}
            onChangeText={setName}
            maxLength={20}
            hint="주문서의 받는 사람에 미리 채워요."
            error={errors.name}
          />
          <Input
            label="휴대폰 번호"
            value={phone}
            onChangeText={(v) => setPhone(formatPhone(v))}
            keyboardType="phone-pad"
            placeholder="010-0000-0000"
            hint="배송 연락과 농가 문의에만 써요. 인증번호는 보내지 않아요."
            error={errors.phone}
          />
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          <Checkbox
            checked={allAgreed}
            label="모두 동의해요"
            onPress={() =>
              setAgreed(
                Object.fromEntries(SIGNUP_CONSENTS.map((c) => [c.kind, !allAgreed])),
              )
            }
          >
            <T variant="body" weight="semibold">
              모두 동의해요
            </T>
          </Checkbox>
          {SIGNUP_CONSENTS.map((c, i) => (
            <View
              key={c.kind}
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderTopWidth: 1,
                borderTopColor: tokens.color.border,
                borderBottomWidth: i === SIGNUP_CONSENTS.length - 1 ? 1 : 0,
                borderBottomColor: tokens.color.border,
              }}
            >
              <View style={{ flex: 1, paddingTop: 4 }}>
                <Checkbox
                  checked={!!agreed[c.kind]}
                  label={`${c.label} (${c.required ? "필수" : "선택"})`}
                  onPress={() => setAgreed((a) => ({ ...a, [c.kind]: !a[c.kind] }))}
                >
                  <T variant="body">
                    {c.label}{" "}
                    <T variant="sub" muted>
                      {c.required ? "필수" : "선택"}
                    </T>
                  </T>
                </Checkbox>
              </View>
              {c.summary ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${c.label} 보기`}
                  onPress={() => setReading(c)}
                  style={{ minHeight: 48, minWidth: 48, alignItems: "flex-end", justifyContent: "center" }}
                >
                  <T variant="sub" muted>
                    보기
                  </T>
                </Pressable>
              ) : null}
            </View>
          ))}
          {errors._ ? (
            <T variant="sub" color={tokens.color.error} style={{ marginTop: 12 }}>
              {errors._}
            </T>
          ) : null}
        </View>
      </Scroll>
      <BottomBar>
        <Button
          label="다음"
          disabled={!valid || !requiredAgreed}
          loading={busy}
          onPress={() => void submit()}
        />
      </BottomBar>
      <Sheet visible={!!reading} onClose={() => setReading(null)} title={reading?.label}>
        <T variant="body">{reading?.summary}</T>
        {reading?.fullText ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              const path = reading.fullText;
              setReading(null);
              if (path) router.push(path);
            }}
            style={{ minHeight: 48, justifyContent: "center", alignSelf: "flex-start" }}
          >
            <T variant="body" weight="semibold">
              {`${reading.label} 전문 보기 ›`}
            </T>
          </Pressable>
        ) : null}
        <T variant="sub" muted>
          {`버전 ${SIGNUP_CONSENT_VERSION} · 테스트 서비스`}
        </T>
        <Button
          label="확인"
          onPress={() => {
            if (reading) setAgreed((a) => ({ ...a, [reading.kind]: true }));
            setReading(null);
          }}
          style={{ marginTop: 8 }}
        />
      </Sheet>
      {toast.node}
    </Screen>
  );
}
