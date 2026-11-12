// 공개 API. 전송 구현은 플랫폼별 파일: client.ts(웹, posthog-js) · client.native.ts(iOS·Android, posthog-react-native, DEV-33)
export { track, useAnalytics } from "./client";
export {
  PRIVATE_PATHS,
  PRODUCTION_HOSTS,
  isAllowedHost,
  isPrivatePath,
  parseHosts,
  privateArea,
  type AppEventName,
  type AppEvents,
  type AppName,
  type DepositDecision,
  type DraftResult,
  type DraftTrigger,
  type FormErrorCode,
  type ProducerScreen,
  type ProductFlow,
  type ReasonKind,
  type ReplyKind,
  type RequestKind,
} from "./privacy";
