// 앱 설정은 app.json 그대로 쓴다. 이 파일은 스토어용 EAS 빌드에서 사업자 정보가 비면 빌드를 멈추는 검사만 더한다
// (DEV-476, policy.md 6장). 값은 읽기만 하고 오류에는 변수 이름만 적는다.
//
// 멈추는 때: EAS 빌드 서버(EAS_BUILD=true)에서 development가 아닌 모든 프로필로 빌드할 때. 허용 목록이 아니라
// 제외 목록이라 새 스토어용 프로필(onestore 등)이나 대소문자가 다른 이름도 빠지지 않는다.
// 그대로 두는 때: development 프로필, 그리고 EAS_BUILD·EAS_BUILD_PROFILE이 없는 곳 — 로컬 expo start·export
// (웹 Mock 포함), CI, eas update, eas build가 내 컴퓨터에서 설정을 미리 읽을 때. 이 두 변수는 빌드 서버만 넣는다.
//
// 두 앱(apps/consumer, apps/producer)의 이 파일은 글자까지 같아야 한다(scripts/test-store-business-check.mjs).
// 다른 파일을 require하지 않는다: 불러온 파일은 런타임 버전 fingerprint에 들어가 설치된 빌드가 eas update를 못 받게 된다.
"use strict";

/** 값이 없으면 스토어 빌드를 멈추는 변수. 하단 사업자 정보와 처리방침 제12조가 이 값으로 채워진다 */
const REQUIRED = [
  "EXPO_PUBLIC_BUSINESS_NAME",
  "EXPO_PUBLIC_BUSINESS_OWNER",
  "EXPO_PUBLIC_BUSINESS_REGISTRATION_NO",
  "EXPO_PUBLIC_BUSINESS_ADDRESS",
  "EXPO_PUBLIC_BUSINESS_PHONE",
  "EXPO_PUBLIC_BUSINESS_EMAIL",
  "EXPO_PUBLIC_PRIVACY_OFFICER",
];

/** 아직 발급 전이라 비어도 멈추지 않고 경고만 하는 변수(통신판매업 신고번호, README EAS 절) */
const WARN_ONLY = ["EXPO_PUBLIC_BUSINESS_MAIL_ORDER_NO"];

/** 검사하지 않는 프로필(eas.json). development는 로컬 서버(localhost)에 붙는 개발 클라이언트라 사업자 정보가 없어도 된다 */
const EXEMPT_PROFILES = ["development"];

const blank = (v) => !v || !String(v).trim();

/** 검사 대상인지와 빠진 변수 이름을 돌려준다. 값은 돌려주지 않는다 */
function checkStoreBusinessInfo(env) {
  const profile = env.EAS_BUILD_PROFILE || "";
  if (env.EAS_BUILD !== "true" || EXEMPT_PROFILES.includes(profile.trim().toLowerCase()))
    return { applies: false, profile, missing: [], warnings: [] };
  return {
    applies: true,
    profile,
    missing: REQUIRED.filter((name) => blank(env[name])),
    warnings: WARN_ONLY.filter((name) => blank(env[name])),
  };
}

/** 검사 대상인데 필수 값이 비면 던진다. app config에서 던지면 EAS 빌드가 그 자리에서 멈춘다 */
function assertStoreBusinessInfo(env, warn = (m) => console.warn(m)) {
  const result = checkStoreBusinessInfo(env);
  if (!result.applies) return result;
  if (result.warnings.length)
    warn(`[DEV-476] ${result.profile} 빌드: ${result.warnings.join(", ")} 값이 없어 하단에서 그 줄이 빠집니다.`);
  if (result.missing.length)
    throw new Error(
      `[DEV-476] ${result.profile} 빌드를 멈춥니다. 사업자 정보 EAS 환경 변수가 비어 있습니다: ${result.missing.join(", ")}. ` +
        "값이 없으면 앱 하단에 'farmclub · 테스트 서비스'가 보입니다. " +
        "이 프로필이 쓰는 EAS 환경(빌드 로그의 'Resolved … environment' 줄)에서 npx eas-cli@latest env:list --environment <그 환경> 으로 " +
        "확인하고 넣어 주세요(README 'Native apps with EAS').",
    );
  return result;
}

module.exports = ({ config }) => {
  assertStoreBusinessInfo(process.env);
  return config;
};
module.exports.checkStoreBusinessInfo = checkStoreBusinessInfo;
module.exports.assertStoreBusinessInfo = assertStoreBusinessInfo;
module.exports.REQUIRED = REQUIRED;
module.exports.EXEMPT_PROFILES = EXEMPT_PROFILES;
