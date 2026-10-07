// SCR-20 가입 신청 (FEAT-01, R-22) — design: p-scr-20
import { auth, type ProducerApplicationInput } from "@farmclub/api";
import {
  BottomBar,
  Button,
  Checkbox,
  HeaderBar,
  Input,
  Notice,
  Screen,
  Scroll,
  Sheet,
  T,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useSession } from "../lib/session";
import { errMsg, fieldErrors } from "../lib/views";

// docs/spec/policy.md 3장 생산자(입점) 정책
const POLICY: [string, string][] = [
  [
    "가입·확인",
    "로그인해 신청하고, farmclub이 전화·방문으로 농가인지 확인한 뒤 승인해요. 반려하면 사유를 알리고 다시 신청할 수 있어요.",
  ],
  [
    "상품·가격",
    "단계 일정·가격·물량은 농가가 기본값을 바탕으로 정하고 farmclub이 승인해요. 이른 단계가 더 싸야 해요. 판매 중 가격·옵션·단계를 바꾸면 다시 승인받아요.",
  ],
  [
    "배송비",
    "무료배송과 별도 부과 중에 고르고, 도서산간 지역과 추가 운임을 정해요.",
  ],
  [
    "받는 시기 약속",
    "상품마다 배송 예정 기간을 약속해요. 바뀌면 주문자가 새 기간 동의와 전액 환불 중에 골라요.",
  ],
  [
    "출하",
    "수확을 시작하면 ‘수확 시작’을 누르고, 보낸 뒤 출하 처리해요(송장번호 포함). 원물 그대로 보내요.",
  ],
  [
    "정산",
    "구매 확정되거나 배송 완료 8일 뒤 자동 확정되면 매입이 확정돼요. 한 주 동안 확정된 금액을 모아 주 1회 정산하고 거래명세서를 보내요.",
  ],
  [
    "고객 정보",
    "배송에 필요한 정보만 보고 배송 목적으로만 써요. 배송 완료 후에는 가려져요.",
  ],
  [
    "직거래 유도 금지",
    "소식·채팅에 연락처·계좌를 적거나 farmclub에서 만난 소비자에게 직접 파는 것을 금지해요. 연락처는 자동으로 가려져요.",
  ],
  [
    "정지",
    "허위 정보와 직거래 유도가 확인되면 바로 정지해요. 정지되면 출하 전 주문은 모두 전액 환불돼요.",
  ],
];

const PHONE = /^01[016789]-?\d{3,4}-?\d{4}$/;

export default function Apply() {
  const router = useRouter();
  const { user, refresh, failToast } = useSession();
  const [form, setForm] = useState<ProducerApplicationInput>({
    ownerName: "",
    farmName: "",
    region: "",
    mainItems: "",
    phone: "",
  });
  const [agree, setAgree] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 반려 후 다시 신청: 전에 적은 내용을 채운다
  useEffect(() => {
    if (user?.farmStatus !== "REJECTED") return;
    auth
      .application()
      .then((a) =>
        setForm({
          ownerName: a.ownerName ?? "",
          farmName: a.farmName,
          region: a.region,
          mainItems: a.mainItems,
          phone: a.phone,
        }),
      )
      .catch(() => undefined);
  }, [user?.farmStatus]);

  const set = (k: keyof ProducerApplicationInput) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  async function submit() {
    const e: Record<string, string> = {};
    if (!form.ownerName.trim()) e.ownerName = "대표자 이름을 적어 주세요";
    if (!form.farmName.trim()) e.farmName = "농가 이름을 적어 주세요";
    if (!form.region.trim()) e.region = "지역을 적어 주세요";
    if (!form.mainItems.trim()) e.mainItems = "주로 키우는 것을 적어 주세요";
    if (!PHONE.test(form.phone.trim()))
      e.phone = "휴대폰 번호 형식으로 입력해 주세요";
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    setFailed(null);
    try {
      await auth.apply(form);
      await refresh(); // 승인 대기 → 관문이 /pending으로
      router.replace("/pending");
    } catch (err) {
      if (failToast(err, () => void submit())) return; // 연결 문제는 공통 토스트(D-19), 입력은 그대로
      const f = fieldErrors(err);
      if (Object.keys(f).length) setErrors(f);
      else setFailed(errMsg(err, "신청하지 못했어요. 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeaderBar
        title="농가 등록 신청"
        onBack={
          user?.farmStatus === "REJECTED"
            ? () => router.replace("/pending")
            : () => auth.logout()
        }
      />
      <Scroll bottom={140}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <T variant="sub" muted>
            신청하면 생산자 계정이 함께 만들어져요. 소비자 계정과는 따로예요.
            다섯 가지를 적어 주세요.
          </T>
        </View>
        {failed ? (
          <Notice
            title={failed}
            tone="error"
            style={{ marginHorizontal: 20, marginTop: 20 }}
          />
        ) : null}
        <View style={{ paddingHorizontal: 20, paddingTop: 32, gap: 24 }}>
          <Input
            label="대표자 이름"
            value={form.ownerName}
            onChangeText={set("ownerName")}
            placeholder="예: 오미숙"
            error={errors.ownerName}
            maxLength={20}
          />
          <Input
            label="농가 이름"
            value={form.farmName}
            onChangeText={set("farmName")}
            placeholder="예: 위미 감귤농장"
            error={errors.farmName}
            maxLength={40}
          />
          <Input
            label="지역"
            value={form.region}
            onChangeText={set("region")}
            placeholder="예: 제주 서귀포시 남원읍"
            error={errors.region}
            maxLength={60}
          />
          <Input
            label="주로 키우는 것"
            value={form.mainItems}
            onChangeText={set("mainItems")}
            placeholder="예: 노지 감귤, 레드향"
            error={errors.mainItems}
            maxLength={60}
          />
          <Input
            label="연락처"
            value={form.phone}
            onChangeText={set("phone")}
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
            error={errors.phone}
            hint="확인 전화를 드릴 휴대폰 번호예요."
            maxLength={13}
          />
        </View>
        <View style={{ marginHorizontal: 20, marginTop: 40, gap: 8 }}>
          <T variant="body" weight="semibold">
            신청하면 이렇게 돼요
          </T>
          <T variant="sub">
            생산자 계정이 만들어지고 승인 대기로 들어가요. farmclub이 전화를
            드리거나 밭에 찾아가 농가인지 확인하면 상품을 올릴 수 있어요.
          </T>
        </View>
        <View style={{ marginHorizontal: 20, marginTop: 24 }}>
          <Checkbox
            checked={agree}
            onPress={() => setAgree((v) => !v)}
            label="입점 정책에 동의해요"
          >
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "baseline",
              }}
            >
              <T variant="sub">입점 정책에 동의해요</T>
              <Pressable
                accessibilityRole="link"
                onPress={() => setPolicy(true)}
              >
                <T
                  variant="sub"
                  muted
                  style={{ textDecorationLine: "underline" }}
                >
                  내용 보기
                </T>
              </Pressable>
            </View>
          </Checkbox>
        </View>
      </Scroll>
      <BottomBar>
        <Button
          label="신청하기"
          size="producer"
          disabled={!agree}
          loading={busy}
          onPress={submit}
        />
      </BottomBar>
      <Sheet
        visible={policy}
        onClose={() => setPolicy(false)}
        title="입점 정책"
      >
        {POLICY.map(([k, v]) => (
          <View key={k} style={{ gap: 4 }}>
            <T variant="sub" weight="semibold">
              {k}
            </T>
            <T variant="sub">{v}</T>
          </View>
        ))}
        <Button
          label="닫기"
          variant="secondary"
          size="producer"
          onPress={() => setPolicy(false)}
          style={{ marginTop: 8 }}
        />
      </Sheet>
    </Screen>
  );
}
