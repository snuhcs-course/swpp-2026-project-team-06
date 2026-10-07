// 디자인 토큰. 원본: docs/design/README.md "디자인 토큰".
// N-02 하한(본문 16px 이상, 누르는 영역 48px 이상)을 지킨다. 디자인 평가 반영(SWPP-81): 메타 15, 4 단위 간격, 썸네일 3종.
export const tokens = {
  fontFamily:
    '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  fontSize: {
    /** 생산자 현황 할 일 숫자 */
    display: 48,
    /** 큰 제목 */
    title: 34,
    /** 섹션 제목·상품명·시트 제목 */
    heading: 22,
    /** 본문 */
    body: 17,
    /** 입력칸·긴 글 입력 (16 밑 금지: 아이폰 자동 확대) */
    input: 16,
    /** 보조 글자 */
    sub: 15,
    /** 채팅 말풍선 */
    chat: 15,
    /** 메타: 날짜·칩·탭·‘n명 예약’·시각 (13은 쓰지 않는다) */
    caption: 15,
  },
  lineHeight: {
    display: 48,
    title: 39,
    heading: 28,
    body: 25,
    input: 26,
    sub: 22,
    chat: 22,
    caption: 22,
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
    header: 48,
    tabBar: 64,
    listRowProducer: 56,
    /** 떠 있는 탭 바가 내용을 가리지 않게 두는 아래 여백 */
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
