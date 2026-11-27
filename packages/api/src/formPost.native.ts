// 파일 업로드(FormData POST) 전송 — iOS·Android(DEV-493). 웹은 formPost.ts(fetch).
// Expo SDK 57은 전역 fetch를 expo/fetch로 바꾼다(node_modules/expo/src/winter/runtime.native.ts).
// expo/fetch는 FormData 파트로 문자열·Blob·bytes()가 있는 객체만 받고, RN 방식의 {uri, name, type} 파트는
// 'Unsupported FormDataPart implementation'으로 거절한다(expo/src/winter/fetch/convertFormData.ts).
// 그래서 업로드만 React Native의 XMLHttpRequest로 보낸다. RN 네트워킹(앱에 원래 들어 있음)이 {uri} 파트를
// 파일에서 바로 읽어 multipart로 보낸다(react-native/Libraries/Network/FormData.js getParts, convertRequestBody.js).
// 파일을 JS 메모리에 올리지 않아 영상(100MB까지)도 같은 길로 간다.
import { ApiError } from "./client";
import type { FormResponse } from "./formPost";

export type { FormResponse } from "./formPost";

/** 연결 실패 등 응답을 못 받은 경우. 화면에는 한국어만, 원인은 cause와 경고 로그에 남긴다 */
function sendFailed(url: string, cause: unknown): ApiError {
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  console.warn(`[upload] ${path} 전송 실패`, cause);
  const error = new ApiError(0, {
    code: "INTERNAL_ERROR",
    message: "인터넷 연결을 확인하고 다시 시도해 주세요.",
    details: {},
  });
  (error as { cause?: unknown }).cause = cause;
  return error;
}

export function postForm(
  url: string,
  form: FormData,
  headers: Record<string, string>,
): Promise<FormResponse> {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.onload = () => {
        let body: unknown = {};
        try {
          body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch {
          body = {}; // JSON이 아닌 오류 응답(프록시 413·502 등)
        }
        resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, body });
      };
      xhr.onerror = () => reject(sendFailed(url, new TypeError("Network request failed")));
      xhr.ontimeout = () => reject(sendFailed(url, new TypeError("Network request timed out")));
      xhr.onabort = () => reject(sendFailed(url, new TypeError("Network request aborted")));
      xhr.send(form);
    } catch (e) {
      reject(sendFailed(url, e));
    }
  });
}
