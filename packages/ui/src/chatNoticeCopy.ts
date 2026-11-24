// 채팅방 주의·제재 안내 문구(DEV-475, FEAT-12 AC-12-19·20, M-25). 원스토어 공지 29889:
// 윤리(욕설·비방·음란·광고 제재)·개인정보·결제정보 보호를 모두 담은 문구를 대화방에 고정해 보인다.
// 화면 부품은 ChatNotice.tsx(대소문자만 다른 이름은 macOS에서 부딪혀 Copy를 붙였다). 문구·조건은 여기 두고 테스트(scripts/test-chat-notice.mjs)가 직접 읽는다.

/** 띠를 보는 쪽. 소비자 앱 방은 consumer, 생산자 앱 방은 producer(시트 셋째 줄만 다르다) */
export type ChatNoticeSide = "consumer" | "producer";

/** 대화 머리 아래 두 줄 띠(보드 DEV-473 2번 A안, PM 승인 11/24) */
export const CHAT_NOTICE_BAND =
  "욕설·비방·음란·광고는 제재돼요. 결제·개인정보는 채팅으로 알리지 마세요.";

/** 작은 화면에서 키보드가 떠 있을 때 접은 한 줄. 세 가지(제재·결제·개인정보)는 빼지 않는다 */
export const CHAT_NOTICE_COMPACT = "욕설·음란·광고는 제재 · 결제·개인정보 공유 금지";

export const CHAT_NOTICE_TITLE = "채팅 이용 안내";
export const CHAT_NOTICE_SUPPORT_LABEL = "운영팀에 알리기";

/** 시트 본문 줄. 운영팀 방(support)에는 ‘운영팀에 알려 주세요’ 줄과 버튼이 없다(이미 운영팀 방) */
export function chatNoticeLines(side: ChatNoticeSide, support: boolean): string[] {
  return [
    "욕설·비방·음란·광고·스팸은 글을 지우고 이용을 제한할 수 있어요(이용약관 제13조).",
    "보낸 전화번호·계좌번호는 숫자가 ●로 가려져요.",
    side === "consumer"
      ? "입금은 주문의 ‘입금 안내’에 나온 농가 계좌로만 해 주세요."
      : "소비자에게 계좌·연락처를 따로 묻지 말아 주세요. 주문 정보는 주문 화면에 있어요.",
    ...(support ? [] : ["불편한 일을 겪었다면 운영팀에 알려 주세요."]),
  ];
}

/** 띠를 한 줄로 접을지. 키보드가 뜬 작은 화면(높이 720 미만, 예: 360×640)과 아주 낮은 창(500 미만)에서만 */
export function chatNoticeCompact(keyboardShown: boolean, windowHeight: number): boolean {
  return (keyboardShown && windowHeight < 720) || windowHeight < 500;
}
