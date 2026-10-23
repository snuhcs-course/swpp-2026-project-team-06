// SCR-17 하위: 내 정보 고치기 `/me/profile` (FEAT-01 I2) — 닉네임·이름(선택, DEV-142)·휴대폰. 이메일은 카카오계정이라 바꿀 수 없다
import { ApiError, auth } from "@farmclub/api";
import { BottomBar, Button, HeaderBar, Input, Screen, Scroll, T, tokens } from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { setFlash } from "../../../lib/flash";
import { PHONE, formatPhone } from "../../../lib/onboarding";
import { useHideTabBar, useSession } from "../../../lib/session";
import { isNetworkError, useToast } from "../../../lib/toast";

export default function Profile() {
  useHideTabBar();
  const router = useRouter();
  const { user, refresh } = useSession();
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast(120);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/me"));

  useEffect(() => {
    if (!user) return;
    setNickname(user.nickname ?? "");
    setName(user.name ?? "");
    setPhone(user.phone ?? "");
  }, [user]);

  async function save() {
    const e: Record<string, string> = {};
    const n = nickname.trim().length;
    if (n < 2 || n > 12) e.nickname = "닉네임은 2~12자로 적어 주세요";
    // 이름은 가입 때 받지 않아 비어 있을 수 있다(DEV-142). 적었을 때만 확인하고 보낸다
    const m = name.trim().length;
    if (m && (m < 2 || m > 20)) e.name = "이름은 2~20자로 적어 주세요";
    if (!PHONE.test(phone.trim())) e.phone = "휴대폰 번호 형식으로 입력해 주세요";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await auth.updateMe({
        nickname: nickname.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        phone: phone.trim(),
      });
      await refresh();
      setFlash("저장했어요");
      back();
    } catch (err) {
      if (err instanceof ApiError && err.details.fields) setErrors(err.details.fields);
      else if (isNetworkError(err)) toast.fail(err, () => void save());
      else setErrors({ _: err instanceof ApiError ? err.message : "저장하지 못했어요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeaderBar title="내 정보 고치기" onBack={back} />
      <Scroll bottom={140}>
        <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 20 }}>
          <Input
            label="닉네임"
            value={nickname}
            onChangeText={setNickname}
            maxLength={12}
            hint="농가 채팅과 소식방에 이 이름으로 보여요."
            error={errors.nickname}
          />
          <Input
            label="이름 (선택)"
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
            error={errors.phone}
          />
          {user?.email ? (
            <Input label="카카오계정 이메일" value={user.email} editable={false} hint="카카오에서 바꿀 수 있어요." />
          ) : null}
          {errors._ ? (
            <T variant="sub" color={tokens.color.error}>
              {errors._}
            </T>
          ) : null}
        </View>
      </Scroll>
      <BottomBar>
        <Button label="저장" loading={busy} onPress={() => void save()} />
      </BottomBar>
      {toast.node}
    </Screen>
  );
}
