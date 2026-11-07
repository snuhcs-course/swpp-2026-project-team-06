import { ChatViewStateStore } from "@farmclub/ui";

// Metadata only; session.tsx owns auth boundaries. No module-level auth/network effects.
export const chatViewState = new ChatViewStateStore();
