// 배송지 입력 화면 본문(SCR-10 하위 /checkout/:productId/address, SCR-17 하위 배송지 추가·수정) — design: s-10-address
// I1은 우편번호·주소·상세 주소를 직접 입력한다. ‘우편번호 찾기’는 없다(screens.md 결정 27).
import { ApiError, auth, type Address, type Recipient } from "@farmclub/api";
import {
  BottomBar,
  Button,
  Checkbox,
  HeaderBar,
  Input,
  Screen,
  Scroll,
  T,
  tokens,
} from "@farmclub/ui";
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";

import { isNetworkError, useToast } from "./toast";

export type AddressValue = Recipient & { saveAddress: boolean };

type Props = {
  /** checkout: 값만 주문서로 넘긴다(저장은 주문 때 saveAddress). manage: 서버에 저장 */
  mode: "checkout" | "manage";
  /** 수정할 배송지(manage) */
  initial?: Address | null;
  defaultName?: string;
  /** 받는 사람 연락처 기본값(가입 때 입력한 휴대폰) */
  defaultPhone?: string;
  onClose: () => void;
  /** checkout: 고른 값. manage: 저장 끝 */
  onDone: (value: AddressValue) => void;
  /** 머리 막대 제목. 기본 ‘받는 곳’ */
  title?: string;
  /** 입력칸 위 안내(온보딩 단계 표시 등) */
  intro?: ReactNode;
  /** 주 버튼 문구. 기본 checkout ‘이 주소로 받기’, manage ‘저장’ */
  submitLabel?: string;
  /** checkout에서 저장 배송지가 50개라 더 저장할 수 없을 때 안내하고 저장 체크를 끈다 */
  saveBlocked?: string;
  /** 닫기 대신 뒤로 화살표 */
  back?: boolean;
};

const PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;

export function AddressForm({
  mode,
  initial,
  defaultName,
  defaultPhone,
  onClose,
  onDone,
  title = "받는 곳",
  intro,
  submitLabel,
  saveBlocked,
  back,
}: Props) {
  const [name, setName] = useState(defaultName ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [postal, setPostal] = useState("");
  const [address, setAddress] = useState("");
  const [detail, setDetail] = useState("");
  const [isDefault, setIsDefault] = useState(!saveBlocked);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast(120);

  useEffect(() => {
    if (!initial) return;
    setName(initial.recipientName);
    setPhone(initial.recipientPhone);
    setPostal(initial.postalCode);
    setAddress(initial.address);
    setDetail(initial.addressDetail ?? "");
    setIsDefault(initial.isDefault);
  }, [initial]);

  // 새로고침하면 회원 정보가 화면보다 늦게 온다. 첫 주문의 받는 사람·연락처 미리 채움이 빠지지 않게 빈 칸만 채운다(DEV-142)
  useEffect(() => {
    if (initial) return;
    setName((v) => v || defaultName || "");
    setPhone((v) => v || defaultPhone || "");
  }, [initial, defaultName, defaultPhone]);

  async function submit() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.recipientName = "받는 사람을 적어 주세요";
    if (!PHONE.test(phone.trim()))
      e.recipientPhone = "휴대폰 번호 형식으로 입력해 주세요";
    if (!/^\d{5}$/.test(postal.trim()))
      e.postalCode = "우편번호 5자리를 입력해 주세요";
    if (!address.trim()) e.address = "주소를 입력해 주세요";
    setErrors(e);
    if (Object.keys(e).length) return;
    const value: AddressValue = {
      recipientName: name.trim(),
      recipientPhone: phone.trim(),
      postalCode: postal.trim(),
      address: address.trim(),
      addressDetail: detail.trim() || undefined,
      saveAddress: !saveBlocked && isDefault,
    };
    if (mode === "checkout") {
      onDone(value);
      return;
    }
    setBusy(true);
    try {
      const body = {
        recipientName: value.recipientName,
        recipientPhone: value.recipientPhone,
        postalCode: value.postalCode,
        address: value.address,
        addressDetail: value.addressDetail ?? "",
        isDefault,
      };
      if (initial) await auth.updateAddress(initial.addressId, body);
      else await auth.addAddress(body);
      onDone(value);
    } catch (err) {
      // 저장 실패 → 입력 유지
      if (err instanceof ApiError && err.details.fields)
        setErrors(err.details.fields);
      else if (isNetworkError(err)) toast.fail(err, () => void submit());
      else
        setErrors({
          _:
            err instanceof ApiError
              ? err.message
              : "저장하지 못했어요. 입력한 내용은 그대로 있어요.",
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeaderBar title={title} close={!back} onBack={onClose} />
      <Scroll bottom={140}>
        <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 20 }}>
          {intro}
          <Input
            label="받는 사람"
            value={name}
            onChangeText={setName}
            error={errors.recipientName}
          />
          <Input
            label="연락처"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="010-0000-0000"
            error={errors.recipientPhone}
          />
          <View style={{ gap: 8 }}>
            <Input
              label="우편번호"
              value={postal}
              onChangeText={setPostal}
              keyboardType="number-pad"
              maxLength={5}
              placeholder="5자리"
              error={errors.postalCode}
            />
            <Input
              label="주소"
              value={address}
              onChangeText={setAddress}
              placeholder="도로명 주소"
              error={errors.address}
              style={{ marginTop: 8 }}
            />
            <Input
              value={detail}
              onChangeText={setDetail}
              placeholder="상세 주소"
              accessibilityLabel="상세 주소"
              error={errors.addressDetail}
            />
          </View>
          {saveBlocked ? (
            <T variant="sub" muted>
              {saveBlocked}
            </T>
          ) : (
            <Checkbox
              checked={isDefault}
              label="기본 배송지로 저장"
              onPress={() => setIsDefault((v) => !v)}
            />
          )}
          {errors._ ? (
            <T variant="sub" color={tokens.color.error}>
              {errors._}
            </T>
          ) : null}
        </View>
      </Scroll>
      <BottomBar>
        <Button
          label={submitLabel ?? (mode === "checkout" ? "이 주소로 받기" : "저장")}
          loading={busy}
          onPress={submit}
        />
      </BottomBar>
      {toast.node}
    </Screen>
  );
}
