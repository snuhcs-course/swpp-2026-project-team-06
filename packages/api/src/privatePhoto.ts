// 생산자 비공개 사진(자료 미리보기·판매페이지 작업 사진)을 받는 공용 경로(DEV-341).
// - 같은 주소(같은 로그인)는 한 번만 받는다: 대표사진·편집기·첨부 칸이 같은 사진을 따로 받지 않는다.
// - 진행이 멈추면 끊는다(idle 시간 제한): 응답을 조각으로 읽으며 조각이 올 때마다 시계를 다시 맞춘다.
//   느리지만 계속 받는 큰 사진(예: DEV-328 이전에 올린 원본 크기 PNG)은 끝까지 받는다.
//   조각 읽기를 못 하는 환경(React Native fetch 등)은 전체 시간 제한(넉넉히 120초)만 둔다.
// - 실패한 요청은 기억하지 않아 다시 시도할 수 있다.
// - 받은 조각으로 Blob을 만들 수 없는 환경(앱: Expo 57의 fetch는 조각 읽기를 주지만 React Native의 Blob은
//   바이트로 만들 수 없다)은 조각 읽기를 쓰지 않고 res.blob()으로 받는다(DEV-477). 예전에는 앱에서 여기서 늘 실패해
//   첨부 칸 썸네일이 '준비 중'으로 남았다.
// 주소마다 Blob을 공유하고, 화면은 각자 blobUrl로 주소를 만들어 자기가 해제한다.
import { ApiError, getToken, onAuthChange } from "./client";

const IDLE_TIMEOUT_MS = 30_000;
const TOTAL_TIMEOUT_MS = 120_000;
const LIMIT = 60;
const shared = new Map<string, Promise<Blob>>();
// 로그인이 바뀌거나 로그아웃하면 받아 둔 비공개 사진을 메모리에서 지운다
onAuthChange(() => shared.clear());

let bytesToBlob: boolean | undefined;
/** 바이트 조각으로 Blob을 만들 수 있는지(웹·Node는 됨, React Native의 Blob은 예외를 던진다). 한 번만 잰다 */
function canBuildBlobFromBytes(): boolean {
  if (bytesToBlob === undefined) {
    try {
      new Blob([new Uint8Array(0)]);
      bytesToBlob = true;
    } catch {
      bytesToBlob = false;
    }
  }
  return bytesToBlob;
}

export class PhotoTimeoutError extends Error {
  constructor() {
    super("사진을 불러오는 데 시간이 너무 오래 걸려요. 다시 시도해 주세요.");
  }
}

async function download(
  url: string,
  idleMs: number,
  totalMs: number,
): Promise<Blob> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), ms);
  };
  // 시간이 다 되면 기다리던 읽기를 바로 끝낸다(스트림이 abort를 모르는 경우에도)
  const aborted = new Promise<never>((_, reject) =>
    controller.signal.addEventListener("abort", () => reject(new PhotoTimeoutError()), {
      once: true,
    }),
  );
  aborted.catch(() => {});
  arm(idleMs);
  try {
    const res = await Promise.race([
      fetch(url, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        signal: controller.signal,
      }),
      aborted,
    ]);
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    const type = res.headers.get("content-type") ?? "";
    const reader = canBuildBlobFromBytes() ? res.body?.getReader?.() : undefined;
    if (!reader) {
      arm(totalMs);
      return await Promise.race([res.blob(), aborted]);
    }
    controller.signal.addEventListener("abort", () => void reader.cancel().catch(() => {}), {
      once: true,
    });
    const chunks: Uint8Array[] = [];
    for (;;) {
      arm(idleMs); // 조각이 올 때마다 다시 맞춘다
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      chunks.push(value);
    }
    return new Blob(chunks as BlobPart[], { type });
  } catch (e) {
    if (controller.signal.aborted) throw new PhotoTimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** 로그인·주소가 같으면 진행 중이거나 받은 Blob을 함께 쓴다. 실패하면 기억에서 지운다. */
export function privatePhotoBlob(
  url: string,
  idleMs = IDLE_TIMEOUT_MS,
  totalMs = TOTAL_TIMEOUT_MS,
): Promise<Blob> {
  const key = `${getToken() ?? ""} ${url}`;
  const hit = shared.get(key);
  if (hit) {
    // 최근에 쓴 것을 뒤로(오래 안 쓴 것부터 지운다)
    shared.delete(key);
    shared.set(key, hit);
    return hit;
  }
  const pending = download(url, idleMs, totalMs);
  shared.set(key, pending);
  pending.catch(() => {
    if (shared.get(key) === pending) shared.delete(key);
  });
  while (shared.size > LIMIT) shared.delete(shared.keys().next().value!);
  return pending;
}

/** 테스트용: 기억한 사진을 모두 지운다(Blob 지원 여부도 다시 잰다). */
export function clearPrivatePhotos() {
  shared.clear();
  bytesToBlob = undefined;
}
