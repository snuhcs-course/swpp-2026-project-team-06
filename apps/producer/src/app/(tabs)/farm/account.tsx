// SCR-30 하위 · 입금 계좌 `/farm/account` (DEV-68, R-01 개정) — design: DEV-68 보드 SCR-30 After
// 소비자가 예약할 때 이 계좌로 직접 입금한다. 세 칸(은행·계좌번호·예금주)을 한 화면에서 함께 저장한다.
import { farms } from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Input,
  Notice,
  Screen,
  Scroll,
  T,
  useAsync,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { useHideTabBar, useSession } from "../../../lib/session";
import { errMsg, fieldErrors } from "../../../lib/views";

const ACCOUNT_NUMBER = /^[0-9][0-9-]{4,30}[0-9]$/;

export default function FarmAccount() {
  useHideTabBar();
  const router = useRouter();
  const { toast, failToast, user } = useSession();
  const farm = useAsync(() => farms.mine(), []);
  const [bank, setBank] = useState("");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (farm.data) {
      setBank(farm.data.bankName ?? "");
      setNumber(farm.data.accountNumber ?? "");
      setHolder(farm.data.accountHolder ?? "");
    }
  }, [farm.data]);

  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/farm");

  async function save() {
    const next: Record<string, string> = {};
    if (!bank.trim()) next.bankName = "은행을 적어 주세요";
    if (!ACCOUNT_NUMBER.test(number.trim()))
      next.accountNumber = "계좌번호는 숫자와 하이픈으로 6~32자예요";
    if (!holder.trim()) next.accountHolder = "예금주를 적어 주세요";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFailed(null);
    try {
      await farms.updateMine({
        bankName: bank.trim(),
        accountNumber: number.trim(),
        accountHolder: holder.trim(),
      });
      toast("입금 계좌를 저장했어요");
      back();
    } catch (e) {
      if (failToast(e, () => void save())) return; // 입력 유지
      const f = fieldErrors(e);
      if (Object.keys(f).length) setErrors(f);
      else setFailed(errMsg(e, "저장하지 못했어요. 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  }

  // 예금주가 대표자(로그인한 생산자) 이름과 다르면 안내만 하고 저장은 막지 않는다
  const ownerName = user?.name ?? "";
  const ownerDiffers =
    !!ownerName && !!holder.trim() && ownerName !== holder.trim();

  return (
    <Screen>
      <HeaderBar title="입금 계좌" onBack={back} />
      <Scroll bottom={140}>
        {failed ? (
          <Notice
            title={failed}
            tone="error"
            style={{ marginHorizontal: 20, marginTop: 16 }}
          />
        ) : null}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 16 }}>
          <Input
            label="은행"
            value={bank}
            onChangeText={(v) => {
              setBank(v);
              setErrors((x) => ({ ...x, bankName: "" }));
            }}
            placeholder="예: 농협"
            maxLength={50}
            error={errors.bankName || undefined}
          />
          <Input
            label="계좌번호"
            value={number}
            onChangeText={(v) => {
              setNumber(v);
              setErrors((x) => ({ ...x, accountNumber: "" }));
            }}
            keyboardType="numbers-and-punctuation"
            placeholder="예: 302-0123-4567-89"
            maxLength={32}
            error={errors.accountNumber || undefined}
            hint="숫자와 하이픈만 적어 주세요."
          />
          <Input
            label="예금주"
            value={holder}
            onChangeText={(v) => {
              setHolder(v);
              setErrors((x) => ({ ...x, accountHolder: "" }));
            }}
            placeholder="통장에 적힌 이름"
            maxLength={50}
            error={errors.accountHolder || undefined}
            hint={
              ownerDiffers
                ? undefined
                : "통장에 적힌 이름 그대로 적어야 소비자가 확인할 수 있어요."
            }
          />
          {ownerDiffers ? (
            <T variant="sub" muted>
              예금주가 대표자 이름({ownerName})과 달라요. 통장에 적힌 이름이
              맞는지 한 번 더 확인해 주세요.
            </T>
          ) : null}
          <View style={{ gap: 4 }}>
            <T variant="caption" muted>
              소비자 입금 안내에 이렇게 보여요
            </T>
            <T variant="body">
              {bank.trim() || "은행"} {number.trim() || "계좌번호"}
            </T>
            <T variant="sub" muted>
              예금주 {holder.trim() || "이름"}
              {farm.data ? ` (${farm.data.name})` : ""}
            </T>
          </View>
          <T variant="caption" muted>
            입금 확인은 농가가 직접 해요. farmclub은 이 계좌로 돈을 받거나
            보내지 않아요.
          </T>
          {!farm.data ? (
            <T variant="sub" muted>
              불러오는 중
            </T>
          ) : null}
        </View>
      </Scroll>
      <BottomBar>
        <Button
          label="저장"
          size="producer"
          loading={busy}
          disabled={!farm.data}
          onPress={save}
        />
      </BottomBar>
    </Screen>
  );
}
