// 화면 오류 안내(DEV-473, screens.md 3장 ‘화면 오류’)의 문구와 개발 빌드 한 줄. React 없이 테스트한다.

export const SCREEN_ERROR_TEXT = {
  title: "이 화면을 열지 못했어요",
  body: "저장한 내용은 그대로 있어요.\n다시 시도해도 안 되면 운영팀에 알려 주세요.",
  support: "운영팀에 알리기",
  retry: "다시 시도",
  home: "홈으로",
} as const;

/** 개발 빌드(__DEV__)에서만 제목 아래 보일 오류 메시지 한 줄. 스토어 빌드는 null.
 * 오류 이름(TypeError 등)과 스택은 넣지 않고 message의 첫 줄만, 120자까지 */
export function devErrorLine(error: unknown, dev: boolean): string | null {
  if (!dev) return null;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const line = (message.split("\n")[0] ?? "").trim();
  if (!line) return null;
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}
