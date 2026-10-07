// 서버 호출 fetch 래퍼. 기준 주소는 EXPO_PUBLIC_API_URL.
// 인증 헤더·토큰 갱신은 DEV-3·DEV-4에서 여기에 넣는다.
// Expo가 빌드 때 process.env.EXPO_PUBLIC_* 를 값으로 바꾼다. 앱 tsconfig에 Node 타입이 없어 이 파일 안에서만 선언한다.
declare const process: { env: { EXPO_PUBLIC_API_URL?: string } };

const DEFAULT_API_URL = "http://localhost:8000";

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Headers 객체·배열로 넘겨도 합쳐지도록 Headers로 만든다.
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as T;
}
