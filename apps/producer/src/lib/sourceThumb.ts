// 자료 칸 썸네일 상태(DEV-477). React·API 모듈 없이 Node 테스트에서 바로 부를 수 있게 따로 둔다.
// 받는 중은 면색 칸, 받으면 썸네일, 404는 '그림 없음'(종류·쪽수만), 그 밖(500·시간 초과 등)은 '불러오지 못했어요'.

export type ThumbState = "loading" | "ready" | "none" | "failed";

/** 처음 상태: 글이 아니고 쪽이 있으면 받는 중, 아니면 없음. 'none'으로 시작하면 첫 화면이 한 번 깜빡인다 */
export function initialThumb(source: { mime: string; pageCount: number }): "loading" | "none" {
  return source.mime !== "text/plain" && source.pageCount ? "loading" : "none";
}

/** 받기 실패를 칸 상태로. ApiError·감싼 오류 모두 `status`를 본다 */
export function thumbFailure(e: unknown): "none" | "failed" {
  return typeof e === "object" && e !== null && (e as { status?: unknown }).status === 404
    ? "none"
    : "failed";
}

/** 썸네일 주소를 받아 칸 상태와 함께 돌려준다. 실패는 삼키지 않고 상태로 바꾼다 */
export async function loadThumb(get: () => Promise<string>): Promise<{ thumb: ThumbState; uri: string }> {
  try {
    return { thumb: "ready", uri: await get() };
  } catch (e) {
    return { thumb: thumbFailure(e), uri: "" };
  }
}
