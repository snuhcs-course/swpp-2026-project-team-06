// SCR-06 첫 가입 온보딩 `/onboarding` (FEAT-01 I2, AC-01-12·14) — 닉네임·휴대폰·가입 동의 한 화면
// 이름·배송지는 가입 때 받지 않고 첫 주문서에서 받는다(당근식, DEV-142).
// 프로필을 이미 채운 회원이 약관·처리방침 버전이 바뀌어 오면(AC-01-17, DEV-113) 동의만 다시 받는다.
// 카카오 새 사용자는 계정이 없고 가입 토큰만 있다(DEV-132). 이때는 가입 동의만 보이고, 동의하면 계정이 생겨 같은 화면에서 프로필을 받는다.
// 카카오로 처음 로그인한 소비자만 온다. 카카오에서 온 값(이메일, 심사 뒤 전화번호)은 미리 채우고 빠진 것만 입력한다.
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
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<(typeof SIGNUP_CONSENTS)[number] | null>(null);
  const [reconsent, setReconsent] = useState(false);
  // 카카오 새 사용자(계정 없음, 가입 토큰만). 동의해 가입하면 false가 된다
  const [pending, setPending] = useState(() => auth.pendingSignup());
  const signup = !user && !!pending;
  const showConsents = signup || reconsent || !!user?.consentRequired;
  const showProfile = !!user && !reconsent;
  const toast = useToast(160);

  // 카카오에서 온 값과 이전에 입력하다 만 값을 한 번 채운다
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (!user || filled) return;
    setNickname(user.nickname ?? "");
    setPhone(user.phone ?? "");
    // 프로필이 다 있고 동의만 빠졌으면 재동의 모드(처음 채울 때 한 번 정한다)
    const nick = (user.nickname ?? "").trim().length;
    setReconsent(
      !!user.consentRequired && nick >= 2 && nick <= 12 && PHONE.test((user.phone ?? "").trim()),
    );
    setFilled(true);
  }, [user, filled]);

  // 로그인도 가입 대기도 아니면 로그인으로, 이미 끝났으면 다음 화면으로
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      if (!pending) router.replace({ pathname: "/login", params: { next } });
    }
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
      PHONE.test(phone.trim()),
    [nickname, phone],
  );

  function close() {
    // 닫기: 계정은 남고, 다음 로그인·관문에서 다시 이 화면으로 온다. 하려던 행동은 실행하지 않는다
    // 가입 전(계정 없음)이면 가입 대기를 지워 아무것도 남기지 않는다(DEV-132)
    if (signup) auth.clearPendingSignup();
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
    if (showProfile) {
      const n = nickname.trim().length;
      if (n < 2 || n > 12) e.nickname = "닉네임은 2~12자로 적어 주세요";
      if (!PHONE.test(phone.trim())) e.phone = "휴대폰 번호 형식으로 입력해 주세요";
    }
    setErrors(e);
    if (Object.keys(e).length || (showConsents && !requiredAgreed)) return;
    setBusy(true);
    const consents = SIGNUP_CONSENTS.map((c) => ({
      kind: c.kind,
      version: SIGNUP_CONSENT_VERSION,
      agreed: !!agreed[c.kind],
    }));
    try {
      if (signup) {
        // 가입 동의: 이때 계정이 생긴다. 같은 화면이 프로필 입력으로 바뀐다
        await auth.kakaoSignup(consents);
        setPending(null);
        await refresh();
        return;
      }
      if (showConsents) await auth.saveConsents(consents);
      if (reconsent) {
        // 재동의: 프로필은 그대로 두고 보던 화면·하려던 행동으로 돌아간다
        await refresh();
        if (hasResume && router.canGoBack()) router.back();
        else router.replace(next as never);
        return;
      }
      await auth.updateMe({ nickname: nickname.trim(), phone: phone.trim() });
      await refresh();
      // 끝나면 원래 화면으로 — 그 화면이 resume을 보고 행동을 잇는다. 관문에서 왔으면 원래 화면이 스택 아래에 있다
      if (hasResume && router.canGoBack()) router.back();
      else router.replace(next as never);
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
          <T variant="title" accessibilityRole="header">
            {signup
              ? "약관에 동의하고\n가입해요"
              : reconsent
                ? "약관이\n바뀌었어요"
                : "farmclub에서 쓸\n정보예요"}
          </T>
          <T variant="body" muted>
            {signup
              ? "이용약관과 개인정보 처리방침에 동의하면 계정이 만들어져요. 동의하지 않으면 아무것도 저장하지 않아요."
              : reconsent
                ? "바뀐 이용약관과 개인정보 처리방침에 동의해야 주문·팔로우·채팅을 계속할 수 있어요."
                : "농가와 이야기하고 주문할 때 필요한 것만 받아요."}
          </T>
          {!reconsent && (user?.email || pending?.email) ? (
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
                {user?.email ?? pending?.email}
                <T variant="sub" muted>
                  {" "}· 카카오계정
                </T>
              </T>
            </View>
          ) : null}
        </View>

        {!showProfile ? null : (
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
              label="휴대폰 번호"
              value={phone}
              onChangeText={(v) => setPhone(formatPhone(v))}
              keyboardType="phone-pad"
              placeholder="010-0000-0000"
              hint="배송 연락과 농가 문의에만 써요. 인증번호는 보내지 않아요."
              error={errors.phone}
            />
          </View>
        )}

        <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
          {!showConsents ? null : (
            <>
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
              {errors.consents || errors.signupToken ? (
                <T variant="sub" color={tokens.color.error} style={{ marginTop: 12 }}>
                  {errors.consents ?? errors.signupToken}
                </T>
              ) : null}
            </>
          )}
          {errors._ ? (
            <T variant="sub" color={tokens.color.error} style={{ marginTop: 12 }}>
              {errors._}
            </T>
          ) : null}
        </View>
      </Scroll>
      <BottomBar>
        <Button
          label={signup ? "동의하고 가입하기" : reconsent ? "동의하고 계속하기" : "시작하기"}
          disabled={(showProfile && !valid) || (showConsents && !requiredAgreed)}
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
