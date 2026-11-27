// 파일 업로드(FormData POST) 전송 — 웹(DEV-493). 앱은 formPost.native.ts(XMLHttpRequest).
// 웹은 예전과 같이 브라우저 fetch로 보낸다. 연결 실패(TypeError)도 예전처럼 그대로 던진다.
export type FormResponse = { status: number; ok: boolean; body: unknown };

/** form을 POST하고 상태와 JSON 본문을 돌려준다. JSON이 아닌 응답(프록시 413·502 등)은 본문 {} */
export async function postForm(
  url: string,
  form: FormData,
  headers: Record<string, string>,
): Promise<FormResponse> {
  const res = await fetch(url, { method: "POST", headers, body: form });
  const body: unknown = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}
