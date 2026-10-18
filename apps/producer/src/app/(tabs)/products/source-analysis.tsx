import { SourceWorkspace } from "../../../lib/SourceWorkspace";
import { useSession } from "../../../lib/session";
export default function SourceAnalysisPage() {
  const { user } = useSession();
  return <SourceWorkspace key={user?.userId ?? ""} />;
}
