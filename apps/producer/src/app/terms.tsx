// 이용약관 `/terms` (DEV-113, R-16) — 로그인 없이 열린다. 배포에서는 같은 문안의 정적 HTML이 먼저 응답한다(scripts/legal-pages.mjs)
import { HeaderBar, LegalDocument, Screen, Scroll, termsOfService } from "@farmclub/ui";
import { useRouter } from "expo-router";

export default function TermsScreen() {
  const router = useRouter();
  return (
    <Screen>
      <HeaderBar
        title={termsOfService.title}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        border
      />
      <Scroll>
        <LegalDocument doc={termsOfService} />
      </Scroll>
    </Screen>
  );
}
