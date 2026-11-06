// 데모 시나리오 원본(DEV-134). 구간·단계·FEAT ID를 여기에만 적는다.
//   - demo/cmd/record.mjs: 녹화할 구간과 순서(order)
//   - demo/cmd/stitch.mjs: 구간을 이어 전체 영상, 역할(p/a/c)별 앱 영상
//   - demo/cmd/site.mjs:   사이트 단계 목록(전체 흐름 = 구간마다 한 줄, 앱 페이지 = 단계마다 한 줄)·길이·하단 문구
// captions는 녹화 자막(demo/record/story.mjs의 cap() 인자와 글자까지 같게)이다. {farm}·{product}는 녹화 때 채우는 이름.
// story.mjs는 아직 자막을 자기 안에 따로 적는다. 그 사이 두 곳이 어긋나면 `npm run demo:site`가 경고한다.

/** 역할: 구간 이름 첫 글자 → 앱 영상·사이트 페이지 */
export const ROLES = {
  c: { key: "consumer", label: "소비자 앱", who: "소비자", video: "consumer.mp4", page: "consumer/index.html" },
  p: { key: "producer", label: "생산자 앱", who: "생산자", video: "producer.mp4", page: "producer/index.html" },
  a: { key: "admin", label: "관리자 페이지", who: "관리자", video: "admin.mp4", page: "admin/index.html" },
};
export const STORY = { video: "story.mp4", page: "index.html" };

export const scenario = {
  iteration: "i2",
  // 구간 녹화·이어 붙이기 순서
  order: ["p1", "a1", "p2", "a2", "c1", "p3", "c2", "p4", "c3"],
  footer:
    "SNU SWPP 2026 · Team 6 · farmclub Iteration 2 데모. 실제 운영 서비스(farmclub.kr · farm.farmclub.kr · 관리자 페이지)에서 카카오 로그인으로 녹화했어요. 농가·인물·연락처·계좌는 데모용 가상 정보이고, 카카오 계정 화면은 가렸어요. 출하 처리는 지금 앱에 예약 → 출하 준비로 넘기는 화면이 없어(FEAT-17 AC-17-3) 이 영상에 넣지 않았어요.",
  segments: {
    p1: {
      story: { title: "카카오로 시작 · 농가 가입 신청", desc: "카카오 계정으로 생산자 앱에 들어와 농가 정보를 적고 신청해요.", feat: ["FEAT-01"] },
      steps: [
        {
          title: "카카오로 시작 · 가입 신청", desc: "카카오로 들어와 대표자·농가·지역·작물·연락처를 적고 신청해요.", feat: ["FEAT-01"],
          captions: [
            { title: "카카오로 시작하기", desc: "농가는 카카오 계정으로 시작해요.\n처음이면 농가 없는 생산자 계정이 생기고\n가입 신청 화면으로 가요.", ids: "FEAT-01 · SCR-19" },
            { title: "농가 가입 신청", desc: "대표자·농가 이름·지역·작물·연락처를 적고\n입점 정책에 동의해 신청해요.", ids: "FEAT-01 · SCR-20" },
          ],
        },
        {
          title: "승인 대기", desc: "운영자가 확인할 때까지 기다려요.", feat: ["FEAT-01"],
          captions: [{ title: "승인 대기", desc: "farmclub이 전화·방문으로 농가인지 확인할 때까지\n기다려요. 들어올 때마다 결과를 새로 불러와요.", ids: "FEAT-01 · SCR-21" }],
        },
      ],
    },
    a1: {
      story: { title: "가입 승인", desc: "운영자가 관리자 페이지에서 그 신청을 확인하고 승인해요.", feat: ["FEAT-01", "DEV-82", "DEV-83"] },
      steps: [
        {
          title: "관리자 로그인", desc: "공용 접속 비밀번호로 로그인해요. 결정은 운영자 계정 이름으로 기록돼요.", feat: ["DEV-82", "DEV-83"],
          // 운영 녹화에서만(로컬은 ADMIN_WEB_PASSWORD로 자막 없이 로그인)
          captions: [{ title: "관리자 로그인", desc: "운영자는 공용 접속 비밀번호로 로그인해요.\n승인·반려는 운영자 계정 이름으로 기록돼요.", ids: "DEV-82·83", when: "prod" }],
        },
        {
          title: "농가 가입 승인", desc: "방금 카카오로 신청한 농가를 확인하고 두 번 눌러 승인해요.", feat: ["FEAT-01"],
          captions: [{ title: "농가 가입 승인", desc: "방금 신청한 '{farm}'을 확인하고\n두 번 눌러 승인해요. 결정은 운영자 이름으로 남아요.", ids: "FEAT-01 · DEV-82·83" }],
        },
      ],
    },
    p2: {
      story: {
        title: "농가 준비 · 상품 등록",
        desc: "사진·소개·입금 계좌를 정하고 농가 링크를 복사한 뒤, 판매 문구로 AI 상품 초안을 만들고 기간·가격·공급 물량을 신청해요.",
        feat: ["FEAT-02", "FEAT-03", "FEAT-04", "FEAT-05", "FEAT-19"],
      },
      steps: [
        {
          title: "승인된 농가 · 현황", desc: "승인되면 바로 현황으로 들어와요.", feat: ["FEAT-14"],
          captions: [{ title: "승인된 농가 · 현황", desc: "승인되면 바로 현황으로 들어와요.\n먼저 소비자가 입금할 계좌를 등록하라고 알려 줘요.", ids: "FEAT-14 · SCR-22" }],
        },
        {
          title: "농가 프로필 · 입금 계좌", desc: "사진·소개와 소비자가 입금할 계좌를 정해요.", feat: ["FEAT-02", "FEAT-09"],
          captions: [{ title: "농가 프로필 · 입금 계좌", desc: "농가 소개와 입금 계좌를 정해요.\n계좌가 없으면 상품 승인을 요청할 수 없어요.", ids: "FEAT-02 · FEAT-09" }],
        },
        {
          title: "농가 링크 공유", desc: "농가 링크를 복사해 단골에게 보내요.", feat: ["FEAT-19"],
          captions: [{ title: "농가 링크 공유", desc: "농가 링크를 복사해 단골에게 문자·카톡으로 보내요.\n누르면 소비자 앱 농가 페이지로 바로 가요.", ids: "FEAT-19" }],
        },
        {
          title: "AI 상품 초안", desc: "판매 문구를 붙여넣으면 AI가 상품 정보를 채우고, 없는 건 '확인 필요'로 남겨요.", feat: ["FEAT-03"],
          captions: [
            { title: "AI 상품 초안", desc: "밴드·카톡에 쓰던 판매 문구를 붙여넣으면\nAI가 상품 정보를 채워요.\n문구에 없는 건 '확인 필요'로 남겨요.", ids: "FEAT-03 · SCR-24" },
            // AI 초안이 실패했을 때만
            { title: "직접 입력", desc: "AI가 실패하면 붙여넣은 글은 그대로 두고\n직접 입력으로 이어 가요.", ids: "FEAT-03 · AC-03-3", when: "ai-failed" },
          ],
        },
        {
          title: "빈 칸 · 기간 · 가격", desc: "품종·중량·등급·받는 시기·환불 기한, 기간별 가격과 물량을 정해요.", feat: ["FEAT-04", "FEAT-05"],
          captions: [
            { title: "빈 칸 채우기", desc: "AI가 못 채운 품종·중량·등급·받는 시기·\n환불 기한을 정하고 저장해요.", ids: "FEAT-04 · SCR-25" },
            { title: "예약 기간 · 가격", desc: "기간마다 중량별 가격과 판매 박스 수를 정해요.\n일찍 예약할수록 싸게 정해요.", ids: "FEAT-05 · R-04" },
          ],
        },
        {
          title: "공급 물량 신청", desc: "공급할 총중량을 신청하면 운영자가 승인해요.", feat: ["FEAT-04"],
          captions: [{ title: "공급 물량 신청", desc: "공급할 총중량을 신청해요.\n운영자가 승인하면 판매가 열려요.", ids: "FEAT-04 · AC-04-8" }],
        },
      ],
    },
    a2: {
      story: { title: "공급 물량 승인", desc: "운영자가 그 상품의 첫 판매를 승인하면 판매가 열려요.", feat: ["FEAT-04", "DEV-87"] },
      steps: [
        {
          title: "공급 물량 승인", desc: "그 농가가 올린 상품의 첫 판매 신청을 승인하면 소비자 앱에 판매 중으로 보여요.", feat: ["FEAT-04", "DEV-87"],
          captions: [{ title: "공급 물량 승인", desc: "'{product}'의 첫 판매 신청이에요.\n신청량 그대로 승인하면 상품이 판매 중이 되고\n소비자 앱에 보여요.", ids: "FEAT-04 · DEV-87" }],
        },
      ],
    },
    c1: {
      story: { title: "찾기 · 예약 · 입금", desc: "카카오로 로그인해 검색으로 농가를 찾아 팔로우하고, 상품을 예약한 뒤 농가 계좌로 입금해요.", feat: ["FEAT-01", "FEAT-06", "FEAT-07", "FEAT-08", "FEAT-09"] },
      steps: [
        {
          title: "카카오 로그인", desc: "예약·팔로우·채팅을 할 때 카카오로 로그인해요.", feat: ["FEAT-01"],
          captions: [{ title: "소비자 · 카카오 로그인", desc: "예약·팔로우·채팅을 할 때 카카오로 로그인해요.\n처음이면 닉네임·이름·연락처와 필수 동의를 받아요.", ids: "FEAT-01" }],
        },
        {
          title: "농가·상품 검색", desc: "농가 이름으로 찾으면 방금 판매를 시작한 농가가 나와요.", feat: ["FEAT-06"],
          captions: [{ title: "농가·상품 검색", desc: "농가 이름·품종·지역으로 찾아요.\n방금 판매를 시작한 농가가 바로 나와요.", ids: "FEAT-06" }],
        },
        {
          title: "농가 소식방 · 팔로우", desc: "농가 페이지는 소식방이에요. 판매 품목과 소식이 함께 보이고 팔로우할 수 있어요.", feat: ["FEAT-06", "FEAT-12"],
          captions: [{ title: "농가 소식방 · 팔로우", desc: "농가 페이지는 소식방이에요. 위에 판매 품목,\n아래에 농가 소식. 팔로우하면 홈에 소식이 떠요.", ids: "FEAT-06 · FEAT-12" }],
        },
        {
          title: "상품 상세", desc: "지금 예약 가격과 다음 기간 가격, 받는 시기, 당도·등급을 봐요.", feat: ["FEAT-07"],
          captions: [{ title: "상품 상세", desc: "지금 예약 가격과 다음 기간 가격, 받는 시기,\n당도·등급을 보여 줘요.", ids: "FEAT-07 · SCR-04" }],
        },
        {
          title: "주문서", desc: "받는 곳을 넣고 받는 시기·지연 환불·흉작·취소 조건에 동의해요.", feat: ["FEAT-08"],
          captions: [{ title: "주문서", desc: "받는 사람·주소를 넣고 받는 시기·지연 환불·\n흉작·취소 조건에 동의해요.\n가격은 예약한 때로 고정돼요.", ids: "FEAT-08 · SCR-10" }],
        },
        {
          title: "무통장 입금 안내", desc: "농가 계좌·입금액·입금자명(주문 번호)·기한을 보고 입금해요.", feat: ["FEAT-09"],
          captions: [{ title: "무통장 입금 안내", desc: "farmclub은 돈을 받지 않아요. 농가 계좌·입금액·\n입금자명(주문 번호)·기한을 보고 입금한 뒤\n'입금을 마쳤어요'를 눌러요.", ids: "FEAT-09 · SCR-11" }],
        },
      ],
    },
    p3: {
      story: { title: "입금 승인 · 소식", desc: "통장과 대조해 입금을 승인하고 팔로워에게 소식을 올려요.", feat: ["FEAT-09", "FEAT-12"] },
      steps: [
        {
          title: "입금 승인 · 소식 올리기", desc: "소비자 입금을 승인하고 팔로워에게 소식을 올려요.", feat: ["FEAT-09", "FEAT-12"],
          captions: [
            { title: "입금 승인", desc: "통장과 대조해 입금을 승인하면\n소비자의 예약이 완료돼요.", ids: "FEAT-09 · SCR-29" },
            { title: "소식 올리기", desc: "밭 소식을 팔로워 모두에게 올려요.", ids: "FEAT-12 · FEAT-15" },
          ],
        },
      ],
    },
    c2: {
      story: { title: "예약 완료 · 소통", desc: "예약 완료를 확인하고 소식에 좋아요, 채팅으로 물어요. AI가 답하거나 농가에 넘겨요.", feat: ["FEAT-10", "FEAT-13", "FEAT-15"] },
      steps: [
        {
          title: "예약 완료", desc: "농가가 입금을 승인하면 예약이 완료돼요.", feat: ["FEAT-10"],
          captions: [{ title: "예약 완료", desc: "농가가 입금을 확인해 예약이 완료됐어요.", ids: "FEAT-10 · SCR-14" }],
        },
        {
          title: "좋아요 · 1:1 채팅", desc: "소식에 좋아요를 누르고 질문해요. 등록된 정보는 AI가 답하고, 판단이 필요한 질문은 농가에 넘겨요.", feat: ["FEAT-13", "FEAT-15"],
          captions: [
            { title: "소식에 좋아요", desc: "팔로우한 농가가 올린 소식에 좋아요를 눌러요.", ids: "FEAT-15" },
            { title: "1:1 채팅 · AI 응답", desc: "받는 시기처럼 등록된 정보는 AI가 바로 답하고,\n농가 판단이 필요한 질문은 농가에 넘겨요.", ids: "FEAT-13" },
          ],
        },
      ],
    },
    p4: {
      story: { title: "넘어온 질문 답변", desc: "AI가 넘긴 질문에 농가가 직접 답해요.", feat: ["FEAT-13"] },
      steps: [
        {
          title: "넘어온 질문 답변", desc: "AI가 넘긴 질문에 직접 답해요.", feat: ["FEAT-13"],
          captions: [{ title: "넘어온 질문에 답하기", desc: "AI가 넘긴 질문만 '답변 필요'에 모여요.\n농가의 답은 그 소비자에게만 보여요.", ids: "FEAT-13 · SCR-28" }],
        },
      ],
    },
    c3: {
      story: { title: "농가의 답", desc: "농가의 답이 그 소비자 채팅에만 보여요.", feat: ["FEAT-13"] },
      steps: [
        {
          title: "농가의 답", desc: "농가가 직접 남긴 답이 내 채팅에 와 있어요.", feat: ["FEAT-13"],
          captions: [
            { title: "농가의 답", desc: "농가가 직접 남긴 답이 내 채팅에 와 있어요.\n다른 소비자에게는 보이지 않아요.", ids: "FEAT-13" },
            { title: "끝", desc: "카카오로 시작한 농가가 승인을 받아 상품을 올리고,\n운영자가 공급 물량을 승인하자 소비자가 찾아\n예약·입금하고, 농가와 소통하는 한 흐름이에요.", ids: "" },
          ],
        },
      ],
    },
  },
};

/** 구간 이름 → 역할 글자(p/a/c). 모르는 역할이면 오류 */
export function roleOf(seg) {
  const r = seg?.[0];
  if (!ROLES[r]) throw new Error(`unknown segment role: ${seg}`);
  return r;
}

/** 역할별 구간 목록(시나리오 순서 유지) */
export function segmentsByRole(order = scenario.order) {
  const out = Object.fromEntries(Object.keys(ROLES).map((r) => [r, []]));
  for (const seg of order) out[roleOf(seg)].push(seg);
  return out;
}

/** 시나리오 모양 점검. 문제 목록을 돌려준다(빈 배열이면 통과) */
export function validateScenario(s = scenario) {
  const problems = [];
  const seen = new Set();
  for (const seg of s.order) {
    if (seen.has(seg)) problems.push(`${seg}: order에 두 번 있음`);
    seen.add(seg);
    if (!ROLES[seg?.[0]]) problems.push(`${seg}: 구간 이름은 p·a·c로 시작해야 함`);
    const def = s.segments[seg];
    if (!def) {
      problems.push(`${seg}: segments에 정의 없음`);
      continue;
    }
    if (!def.story?.title || !def.story?.desc) problems.push(`${seg}: story 제목·설명 없음`);
    if (!def.steps?.length) problems.push(`${seg}: steps 없음`);
    for (const [i, step] of (def.steps ?? []).entries()) {
      if (!step.title || !step.desc) problems.push(`${seg}.steps[${i}]: 제목·설명 없음`);
      if (!step.captions?.length) problems.push(`${seg}.steps[${i}]: captions 없음`);
    }
    for (const id of [...(def.story?.feat ?? []), ...(def.steps ?? []).flatMap((x) => x.feat ?? [])]) {
      if (!/^(FEAT|DEV)-\d+$/.test(id)) problems.push(`${seg}: ID 형식이 아님 ${id}`);
    }
  }
  for (const seg of Object.keys(s.segments)) if (!seen.has(seg)) problems.push(`${seg}: segments에 있지만 order에 없음`);
  return problems;
}
