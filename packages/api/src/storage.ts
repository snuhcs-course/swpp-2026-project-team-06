// 앱별 저장소(웹). localStorage에 둔다. 네이티브는 storage.native.ts(expo-secure-store)가 대신한다(DEV-33).
// Node 테스트(test:mock)도 이 파일을 쓴다: localStorage가 없으면 저장하지 않는다.
function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** 저장된 값. 없거나 읽지 못하면 null */
export function storageGet(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 값을 저장한다. null이면 지운다. 저장하지 못해도 화면은 동작한다 */
export function storageSet(key: string, value: string | null): void {
  try {
    const s = storage();
    if (!s) return;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* 저장 못 해도 화면은 동작 */
  }
}
