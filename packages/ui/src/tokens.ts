// 디자인 토큰. N-02 하한: 본문 16px 이상, 누르는 영역 48px 이상.
// 나머지 수치는 화면 명세(P21)가 정하면 이 파일만 고친다.
export const tokens = {
  fontSize: {
    body: 16,
    title: 22,
  },
  touchTarget: {
    min: 48,
  },
  space: {
    sm: 8,
    md: 16,
    lg: 24,
  },
  radius: {
    md: 8,
  },
  color: {
    text: "#1A1A1A",
    textMuted: "#5C5C5C",
    background: "#FFFFFF",
    primary: "#E8730C",
    onPrimary: "#FFFFFF",
  },
} as const;
