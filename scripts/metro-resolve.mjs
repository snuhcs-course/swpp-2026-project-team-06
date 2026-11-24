// Metro가 플랫폼별로 어느 파일을 잡는지 흉내 낸다(DEV-471·DEV-474 검사가 함께 쓴다).
// metro-resolver resolveSourceFile·resolveSourceFileForAllExts: sourceExts 순서마다
// `.<플랫폼>` → `.native`(웹은 preferNativePlatform이 false라 보지 않음) → 접미사 없음.
// 그래서 웹 `x.ts` + 앱 `x.native.tsx`이면 앱도 `ts` 단계에서 `x.ts`를 잡는다(DEV-474 우편번호 찾기).

/** Expo 57 기본 sourceExts. scripts/test-native-pairs.mjs가 두 앱의 metro 설정과 같은지 확인한다 */
export const SOURCE_EXTS = ["ts", "tsx", "mjs", "js", "jsx", "json", "cjs", "scss", "sass", "css"];
export const PLATFORMS = ["android", "ios", "web"];
/** `경로.<플랫폼 태그>?.<확장자>` → [, 이름, 태그, 확장자] */
export const PLATFORM_FILE = /^(.*?)(?:\.(native|android|ios|web))?\.([a-z]+)$/;

/** `base`(확장자 없는 경로)를 platform에서 해석한 파일. 없으면 null */
export function resolveLikeMetro(base, platform, exists, exts = SOURCE_EXTS) {
  for (const ext of exts)
    for (const suffix of [`.${platform}`, ...(platform === "web" ? [] : [".native"]), ""]) {
      const file = `${base}${suffix}.${ext}`;
      if (exists(file)) return file;
    }
  return null;
}

/** 이 파일이 앱(android·ios) 번들에 들어가는가: "native"(앱 전용 파일) | "shared"(웹·앱 공용) | "none" */
export function appRole(rel, exists) {
  const [, base, tag] = rel.match(PLATFORM_FILE) ?? [];
  if (base === undefined || tag === "web") return "none";
  if (tag) return "native";
  return ["android", "ios"].some((p) => resolveLikeMetro(base, p, exists) === rel) ? "shared" : "none";
}
