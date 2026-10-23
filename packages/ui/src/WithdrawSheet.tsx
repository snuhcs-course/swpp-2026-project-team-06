// 회원 탈퇴 확인 시트(DEV-94, AC-01-20). 1단계: 지워지는 것·남는 것 안내 → 2단계: 되돌릴 수 없음 확인.
// 요청은 앱이 넘긴 onWithdraw가 보낸다. 끝나지 않은 주문(409 WITHDRAW_BLOCKED)이면 주문 번호를 보여 주고 멈춘다.
import { useState } from "react";
import { View } from "react-native";

import { Sheet } from "./bars";
import { Button } from "./Button";
import { T } from "./Text";
import { tokens } from "./tokens";

type Role = "CONSUMER" | "PRODUCER";

const REMOVED: Record<Role, string[]> = {
  CONSUMER: [
    "이름·닉네임·휴대폰 번호·이메일과 카카오 연결",
    "저장한 배송지, 팔로우·좋아요",
    "내가 쓴 채팅·소식 답장의 글과 사진(주문 문의는 제외)",
  ],
  PRODUCER: [
    "대표자 이름·휴대폰 번호·이메일과 카카오 연결",
    "농가의 입금 계좌·연락처",
    "농가는 소비자 화면에서 사라져요",
  ],
};

const KEPT =
  "법으로 보관해야 하는 주문·입금·환불 기록과 주문 문의, 약관 동의 기록은 정해진 기간 동안 따로 보관해요. 농가·소비자에게는 ‘탈퇴한 회원’으로 보여요.";

/** 409 WITHDRAW_BLOCKED의 주문 번호. ApiError(details.orderNos)를 그대로 받는다 */
function blockedOrders(e: unknown): string[] | null {
  const d = (e as { details?: { reason?: string; orderNos?: unknown } } | null)?.details;
  return d?.reason === "WITHDRAW_BLOCKED" && Array.isArray(d.orderNos) ? (d.orderNos as string[]) : null;
}

export function WithdrawSheet({
  visible,
  role,
  onClose,
  onWithdraw,
}: {
  visible: boolean;
  role: Role;
  onClose: () => void;
  /** 탈퇴 요청. 성공하면 앱이 로그아웃·이동을 처리한다 */
  onWithdraw: () => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setStep(1);
    setError(null);
    onClose();
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onWithdraw();
      setStep(1);
    } catch (e) {
      const orders = blockedOrders(e);
      setError(
        orders
          ? `끝나지 않은 주문이 있어요(${orders.join(", ")}). 주문이 끝난 뒤 탈퇴할 수 있어요.`
          : e instanceof Error
            ? e.message
            : "탈퇴하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={close} title="회원 탈퇴">
      {step === 1 ? (
        <>
          <T variant="body" weight="semibold">
            탈퇴하면 바로 지워져요
          </T>
          <View style={{ gap: tokens.space.xs }}>
            {REMOVED[role].map((line) => (
              <T key={line} variant="sub">{`· ${line}`}</T>
            ))}
          </View>
          <T variant="sub" muted>
            {KEPT}
          </T>
          <T variant="sub" muted>
            입금 대기·예약·출하 준비·배송 중인 주문이 있으면 탈퇴할 수 없어요.
          </T>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Button label="취소" variant="secondary" onPress={close} style={{ flex: 1 }} />
            <Button label="다음" onPress={() => setStep(2)} style={{ flex: 2 }} />
          </View>
        </>
      ) : (
        <>
          <T variant="body" weight="semibold">
            정말 탈퇴할까요?
          </T>
          <T variant="sub">
            되돌릴 수 없어요. 같은 카카오로 다시 가입하면 지난 기록과 이어지지 않는 새 계정이에요.
          </T>
          {error ? (
            <T variant="sub" color={tokens.color.error}>
              {error}
            </T>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Button label="취소" variant="secondary" onPress={close} style={{ flex: 1 }} />
            <Button label="탈퇴할게요" loading={busy} onPress={() => void confirm()} style={{ flex: 2 }} />
          </View>
        </>
      )}
    </Sheet>
  );
}
