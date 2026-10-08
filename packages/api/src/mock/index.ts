// Mock 전송. 도메인별 파일이 라우트를 등록한다. 하나만 실제 서버로 바꾸려면 그 파일의 import를 빼면 된다.
import type { Transport } from "../client";
import { reset } from "./db";
import { dispatch, register, fail } from "./router";
import { nowIso } from "./db";

import "./auth";
import "./farms";
import "./catalog";
import "./capacity";
import "./orders";
import "./conversations";
import "./attachments";
import "./messaging";
import "./rooms";
import "./detailDrafts";

// 운영자 API는 I1에 화면이 없다. ADMIN 테스트 fixture/관리 API에서만 호출한다.
register({
  "POST /admin/producers/:farmId/approve": (ctx) => {
    if (ctx.me().role !== "ADMIN")
      fail(403, "FORBIDDEN", "운영자 권한이 필요해요.");
    const f = ctx.db.farms[ctx.params.farmId];
    if (!f) return { farmId: ctx.params.farmId, status: "NONE" };
    f.status = "APPROVED";
    f.rejectReason = null;
    f.decidedAt = nowIso();
    return { farmId: f.farmId, status: f.status };
  },
});

export const mockTransport: Transport = (req) => dispatch(req);
export const resetMockState = reset;
