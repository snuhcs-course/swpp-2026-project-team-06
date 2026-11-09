// 디자인 토큰: Figma 검토본 '기준표'(DEV-292, 당근 SEED 수치) / docs/spec/conversation-ui-1.6.md.
// N-02: 본문 16 이상, 터치 48 이상. 메타 12.
export const tokens = {
  fontFamily:
    '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  fontSize: {
    /** 숫자 강조(생산자 현황 주문 숫자 등) */
    display: 22,
    /** 탭 첫 화면 제목·상품명·원산지·주문 상태 제목 */
    title: 22,
    /** 섹션 제목·하위 화면 머리 제목·시트 제목 */
    heading: 18,
    /** 본문 (N-02 최소 16) */
    body: 16,
    /** 입력칸·긴 글 입력 (16 밑 금지: 아이폰 자동 확대) */
    input: 16,
    /** 보조 글자 */
    sub: 14,
    /** 채팅 말풍선 */
    chat: 16,
    /** 메타: 날짜·칩·탭·시각 */
    caption: 12,
  },
  lineHeight: {
    display: 30,
    title: 30,
    heading: 26,
    body: 24,
    input: 24,
    sub: 20,
    chat: 23,
    caption: 16,
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
    /** 좌우 여백(왼쪽 시작선) */
    gutter: 16,
  },
  height: {
    /** 주요 버튼(두 앱 공통) */
    button: 52,
    /** 예전 생산자 버튼 이름. 기준표에서 52 하나로 통일 */
    buttonProducer: 52,
    /** 보조 버튼 */
    buttonSecondary: 48,
    /** 칩·작은 버튼(터치 48은 hitSlop으로) */
    chip: 32,
    input: 48,
    /** 머리(탭 첫 화면·하위 화면 모두) */
    header: 56,
    /** 목록 행: 한 줄 56 · 두 줄 72 */
    row: 56,
    rowTwoLine: 72,
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
