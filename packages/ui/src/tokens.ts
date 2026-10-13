// 디자인 토큰: Figma v6 / docs/spec/conversation-ui-1.6.md.
// N-02: 본문 17px, 메타 13px, 터치 48px 이상.
export const tokens = {
  fontFamily:
    '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  fontSize: {
    /** 생산자 현황 주문 숫자 */
    display: 40,
    /** 큰 제목 */
    title: 28,
    /** 섹션 제목·상품명·시트 제목 */
    heading: 22,
    /** 본문 */
    body: 17,
    /** 입력칸·긴 글 입력 (16 밑 금지: 아이폰 자동 확대) */
    input: 16,
    /** 보조 글자 */
    sub: 15,
    /** 채팅 말풍선 */
    chat: 17,
    /** 메타: 날짜·칩·탭·시각. 본문은 17, 입력은 16 이상. */
    caption: 13,
  },
  lineHeight: {
    display: 48,
    title: 36,
    heading: 30,
    body: 25,
    input: 26,
    sub: 22,
    chat: 25,
    caption: 18,
  },
  fontWeight: {
    regular: "400",
    semibold: "600",
    bold: "700",
  },
  color: {
    text: "#111111",
    textMuted: "#6B6B6B",
    background: "#FFFFFF",
    surface: "#F5F5F3",
    border: "#E8E8E6",
    accent: "#C94F0C",
    accentPressed: "#A8420A",
    onAccent: "#FFFFFF",
    error: "#B42318",
    overlay: "rgba(0,0,0,0.4)",
    glass: "rgba(255,255,255,0.82)",
    sheet: "rgba(255,255,255,0.94)",
    photoButton: "rgba(0,0,0,0.32)",
    // 이전 이름(뼈대 코드 호환)
    primary: "#C94F0C",
    onPrimary: "#FFFFFF",
  },
  radius: {
    sm: 8,
    md: 16,
    full: 999,
    bubbleTail: 4,
  },
  space: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    /** 섹션 사이 */
    section: 40,
    /** 좌우 여백 */
    gutter: 20,
  },
  height: {
    button: 52,
    buttonProducer: 56,
    input: 48,
    header: 64,
    tabBar: 72,
    listRowProducer: 56,
    /** 고정 탭 바가 내용을 가리지 않게 두는 아래 여백 */
    tabBarClearance: 96,
  },
  touchTarget: {
    min: 48,
  },
  /** 썸네일: 104 탐색 목록 · 64 거래 요약·생산자 목록 · 40 아바타 */
  thumb: {
    browse: 104,
    summary: 64,
    avatar: 40,
  },
  /** 모바일 웹을 데스크톱에서 열 때 가운데 놓는 최대 폭 */
  maxWidth: 480,
} as const;

export type Tokens = typeof tokens;
