// DEV-109: 탭 화면 오른쪽 위 도움말(?) 버튼과 직접 눌러 보는 사용 안내(스포트라이트 투어).
// 화면을 어둡게 덮고 눌러야 할 곳만 뚫어 밝게 보여 준다. 생산자가 실제로 눌러 화면이 바뀌면 다음 단계로 간다.
// 대상은 testID(웹에서 data-testid)로 찾는다. 현황(SCR-22)에서 승인된 생산자에게 처음 한 번 자동으로 시작한다.
import { readStore, writeStore } from "@farmclub/api";
import { Button, IconButton, T, tokens } from "@farmclub/ui";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  Platform,
  Pressable,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSession } from "./session";

const HELP_GUIDE_SEEN = "help-guide-seen";
/** 대상을 이만큼 못 찾으면 가운데 카드에 다음 버튼을 띄워 갇히지 않게 한다 */
const MISSING_MS = 3000;
const PAD = 6;

type Route = { path: string; params: Record<string, unknown> };
type Step = {
  title: string;
  /** 고정 본문. bodyFor가 있으면 그쪽을 쓴다 */
  body?: string;
  /** 강조할 testID 후보. 먼저 보이는 것을 쓴다. 없으면 가운데 카드 */
  target?: string[];
  /** 화면에 따라 본문을 바꾼다. 자료 분석이 켜진 서버는 자료·사진 칸, 꺼진 서버·Mock은 문구 붙여넣기 화면이다 */
  bodyFor?: (c: { path: string; found?: string }) => string;
  /** 누르기 단계: 이 조건이 되면(화면이 바뀌면) 다음 단계로 */
  until?: (r: Route) => boolean;
  /** 이 testID가 보이면(예: 1:1 대화가 없는 빈 목록) skipTo로 건너뛴다 */
  emptyIf?: string;
  skipTo?: number;
  /** 단계에 들어올 때 화면을 맞춘다. 탭은 이전 하위 화면·파라미터를 복원하기 때문이다 */
  enter?: (r: Route, router: ReturnType<typeof useRouter>) => void;
};

const STEPS: Step[] = [
  {
    title: "farmclub에 오신 걸 환영해요!",
    body: "처음이라 어디부터 봐야 할지 막막하시죠? 자주 쓰는 기능을 저와 함께 하나씩 눌러 볼게요. 밝게 빛나는 곳만 따라오시면 금방 끝나요.",
  },
  {
    title: "먼저 상품 탭으로 가 볼까요?",
    body: "아래 '상품'을 눌러 보세요. 올린 상품과 예약이 얼마나 들어왔는지 한눈에 볼 수 있어요.",
    target: ["tab-products"],
    until: (r) => r.path.startsWith("/products"),
  },
  {
    title: "새 상품은 여기서 올려요",
    enter: (r, router) => {
      if (r.path !== "/products") router.navigate("/products");
    },
    body: "새 상품을 올릴 땐 이 '새 상품' 버튼을 누르면 돼요. 지금 한번 눌러 보세요!",
    target: ["new-product"],
    until: (r) => /^\/products\/(new|manual|source-analysis)/.test(r.path),
  },
  {
    title: "AI가 상품 정보를 채워 드려요",
    bodyFor: ({ found }) =>
      found === "source-material-box"
        ? "카톡·밴드에 올리던 홍보 글, 가격표나 전단지 사진, PDF를 여기 '분석 자료'에 넣어 보세요. AI가 내용을 읽고 품종, 원산지, 보관 방법 같은 상품 정보를 채우고 판매페이지 초안까지 만들어 드려요. 판매페이지에 보여 줄 상품 사진은 바로 아래 '상품사진'에 따로 넣어 주시면 돼요."
        : "카톡·밴드에 올리던 홍보 글을 여기에 붙여넣어 보세요. AI가 글을 읽고 품종, 원산지, 보관 방법 같은 상품 정보를 채워 초안을 만들어 드려요. 다 만들어지면 틀린 부분만 고쳐서 게시를 요청하시면 돼요.",
    target: ["ai-draft", "source-material-box"],
  },
  {
    title: "오늘은 구경만 해도 괜찮아요",
    bodyFor: ({ path }) =>
      path.startsWith("/products/source-analysis")
        ? "뒤로 가기를 눌러 보세요. 만들던 상품은 상품 목록 '작성 중'에 남아 있어서, 나중에 언제든 이어서 완성할 수 있어요."
        : "뒤로 가기를 눌러 보세요. 나중에 '새 상품'을 누르면 언제든 다시 시작할 수 있어요.",
    target: ["header-back"],
    until: (r) => r.path === "/products",
  },
  {
    title: "이번엔 손님과 이야기하는 곳이에요",
    body: "아래 '채팅'을 눌러 보세요.",
    target: ["tab-chats"],
    until: (r) => r.path.startsWith("/chats"),
  },
  {
    title: "소식방: 단골에게 한 번에 알리기",
    enter: (r, router) => {
      if (r.path !== "/chats")
        router.navigate({ pathname: "/chats", params: { view: "news" } });
      else if (r.params.view === "private") router.setParams({ view: "news" });
    },
    body: "단골손님들에게 한 번에 소식을 전하는 곳이에요. '귤 따기 시작했어요!' 같은 수확 사진이나 출하 일정을 올려 보세요. 따로따로 연락하지 않아도 모두에게 전해져요.",
    target: ["chat-choice-news"],
  },
  {
    title: "1:1 채팅: 손님 질문 모아 보기",
    body: "손님이 따로 물어본 질문과 주문 문의는 여기로 모여요. '1:1 채팅'을 눌러 보세요.",
    target: ["chat-choice-private"],
    until: (r) => r.path === "/chats" && r.params.view === "private",
  },
  {
    title: "대화를 열어 볼까요?",
    body: "손님 대화를 하나 눌러서 열어 보세요.",
    target: ["chat-row-first"],
    until: (r) => /^\/chats\/[^/]+/.test(r.path),
    emptyIf: "chat-empty",
    skipTo: 11,
  },
  {
    title: "반복되는 질문은 AI가 대신 답해 드려요",
    body: "'배송은 언제 와요?'처럼 자주 받는 질문은 AI가 상품 정보를 보고 바로 답해 드려요. '농약은 얼마나 치세요?'처럼 판단이 필요한 질문은 AI가 답하지 않고 직접 답하실 수 있게 넘겨 드려요. 지금 누가 답하는지는 이 줄에 보이고, 이 줄의 버튼으로 직접 답하기와 AI에게 맡기기를 바꿀 수 있어요.",
    target: ["ai-mode"],
  },
  {
    title: "채팅 목록으로 돌아가요",
    body: "확인하셨으면 뒤로 가기를 눌러 보세요.",
    target: ["header-back"],
    until: (r) => r.path === "/chats",
  },
  {
    title: "거의 다 왔어요!",
    body: "아래 '환경설정'을 눌러 보세요.",
    target: ["tab-settings"],
    until: (r) => r.path === "/settings",
  },
  {
    title: "AI 응답 설정",
    body: "AI가 손님에게 어떻게 답할지 정하는 곳이에요. 'AI 응답 설정'을 눌러 보세요.",
    target: ["ai-settings-row"],
    until: (r) => r.path === "/farm/ai-settings",
  },
  {
    title: "AI에게 우리 농가를 알려 주세요",
    body: "여기서 AI 자동 응답을 켜고 끌 수 있어요. 아래로 내리면 배송 안내 원칙이나 자주 묻는 질문과 답을 적어 둘 수 있는데, 많이 적어 둘수록 AI가 더 정확하게 답해 드려요. 바꾼 뒤에는 꼭 '설정 저장'을 눌러 주세요.",
    target: ["ai-enabled"],
  },
  {
    title: "다시 보고 싶으면 이 버튼을 누르세요!",
    body: "안내는 여기까지예요. 수고 많으셨어요! 나중에 헷갈리면 화면 오른쪽 위 이 ? 버튼을 눌러 보세요. 언제든 이 안내를 처음부터 다시 볼 수 있어요. 그래도 모르는 게 있으면 운영자에게 편하게 문의해 주세요.",
    target: ["help-button"],
    enter: (r, router) => {
      if (r.path !== "/") router.navigate("/");
    },
  },
];

type Rect = { x: number; y: number; w: number; h: number };

/** 보이는 대상 중 DOM에서 가장 뒤(가장 최근 화면)의 것을 고른다 */
function findTarget(
  ids: string[],
): { id: string; el: Element; rect: Rect } | null {
  if (typeof document === "undefined") return null;
  for (const id of ids) {
    const els = Array.from(document.querySelectorAll(`[data-testid="${id}"]`));
    for (const el of els.reverse()) {
      if (el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        return {
          id,
          el,
          rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        };
    }
  }
  return null;
}

const same = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.round(a.x) === Math.round(b.x) &&
    Math.round(a.y) === Math.round(b.y) &&
    Math.round(a.w) === Math.round(b.w) &&
    Math.round(a.h) === Math.round(b.h));

const Ctx = createContext<{ start: () => void; active: boolean } | null>(null);

function useTour() {
  const t = useContext(Ctx);
  if (!t) throw new Error("TourProvider 밖");
  return t;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [index, setIndex] = useState<number | null>(null);
  const start = useCallback(() => {
    router.navigate("/");
    setIndex(0);
  }, [router]);
  const stop = useCallback(() => {
    writeStore(HELP_GUIDE_SEEN, "1");
    setIndex(null);
  }, []);
  const next = useCallback(
    (to?: number) =>
      setIndex((i) => {
        if (i === null) return null;
        const n = to ?? i + 1;
        if (n < STEPS.length) return n;
        writeStore(HELP_GUIDE_SEEN, "1");
        return null;
      }),
    [],
  );
  const active = index !== null;
  const value = useMemo(() => ({ start, active }), [start, active]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {index !== null ? (
        <TourOverlay key={index} index={index} onNext={next} onStop={stop} />
      ) : null}
    </Ctx.Provider>
  );
}

function TourOverlay({
  index,
  onNext,
  onStop,
}: {
  index: number;
  onNext: (to?: number) => void;
  onStop: () => void;
}) {
  const step = STEPS[index];
  const router = useRouter();
  const path = usePathname();
  const params = useGlobalSearchParams();
  const [rect, setRect] = useState<Rect | null>(null);
  const [found, setFound] = useState<string>();
  const [missing, setMissing] = useState(false);
  const scrolled = useRef(false);

  // 단계에 들어올 때 한 번만 화면을 맞춘다
  const entered = useRef(false);
  useEffect(() => {
    if (entered.current) return;
    entered.current = true;
    step.enter?.({ path, params }, router);
  }, [step, path, params, router]);

  // 누르기 단계: 생산자가 눌러 화면이 바뀌면 다음으로. 들어올 때 이미 맞는 상태였다면
  // 한 번 벗어났다가 다시 맞을 때만 넘긴다(누르지 않았는데 넘어가지 않게)
  const armed = useRef<boolean | null>(null);
  useEffect(() => {
    if (!step.until) return;
    const ok = step.until({ path, params });
    if (armed.current === null) armed.current = !ok;
    else if (!ok) armed.current = true;
    if (ok && armed.current) onNext();
  }, [step, path, params, onNext]);

  // 대상 위치를 계속 따라간다(화면 전환·스크롤·크기 변경)
  useEffect(() => {
    // 웹 출력 전용(README): 대상 위치는 DOM으로 잰다
    if (!step.target || Platform.OS !== "web") return;
    const since = Date.now();
    const tick = () => {
      if (step.emptyIf && findTarget([step.emptyIf])) {
        onNext(step.skipTo);
        return;
      }
      const hit = findTarget(step.target!);
      if (hit && !scrolled.current) {
        scrolled.current = true;
        const r = hit.rect;
        if (r.y < 0 || r.y + r.h > window.innerHeight)
          hit.el.scrollIntoView({ block: "center" });
      }
      if (hit) setFound(hit.id);
      setRect((prev) =>
        same(prev, hit?.rect ?? null) ? prev : (hit?.rect ?? null),
      );
      if (hit) setMissing(false);
      else if (Date.now() - since > MISSING_MS) setMissing(true);
    };
    tick();
    const timer = setInterval(tick, 100);
    window.addEventListener("resize", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", tick);
    };
  }, [step, onNext]);

  // 한글이 단어 중간에서 끊기지 않게 한다. react-native-web은 wordBreak 스타일을 넘기지 않아 CSS로 둔다
  useEffect(() => {
    if (Platform.OS !== "web" || document.getElementById("tour-keep-all"))
      return;
    const css = document.createElement("style");
    css.id = "tour-keep-all";
    css.textContent =
      '[data-testid="tour-card"] * { word-break: keep-all; overflow-wrap: break-word; }';
    document.head.appendChild(css);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onStop();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStop]);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const [cardH, setCardH] = useState(240);
  const { width: vw, height: vh } = useWindowDimensions();
  const hole =
    step.target && rect && !missing
      ? {
          x: rect.x - PAD,
          y: rect.y - PAD,
          w: rect.w + PAD * 2,
          h: rect.h + PAD * 2,
        }
      : null;
  const tap = !!step.until && !!hole;
  // 대상을 찾는 중(화면 전환 중)에는 버튼 없이 기다린다
  const waiting = !!step.target && !hole && !missing;
  const last = index === STEPS.length - 1;

  // 카드는 앱 좌우 여백(gutter)에 맞춰 가운데 둔다. 넓은 화면에서는 너비를 제한한다
  const cardW = Math.min(400, vw - tokens.space.gutter * 2);
  const below = hole ? vh - (hole.y + hole.h) > hole.y : false;
  const cardLeft = (vw - cardW) / 2;
  const GAP = 56;
  // 카드는 항상 화면 안에 둔다. 강조 영역이 커서 자리가 모자라면 영역 위에 겹친다
  const wanted = hole
    ? below
      ? hole.y + hole.h + GAP
      : hole.y - GAP - cardH
    : vh / 2 - cardH / 2;
  const cardPos: ViewStyle = {
    top: Math.max(16, Math.min(wanted, vh - cardH - 16)),
  };

  const dim = "rgba(0,0,0,0.62)";
  const fixed = { position: "fixed" } as unknown as ViewStyle;
  return (
    <View
      pointerEvents="box-none"
      style={[fixed, { top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }]}
    >
      {hole ? (
        <>
          <Pressable
            accessible={false}
            style={[
              fixed,
              {
                top: 0,
                left: 0,
                right: 0,
                height: Math.max(0, hole.y),
                backgroundColor: dim,
              },
            ]}
          />
          <Pressable
            accessible={false}
            style={[
              fixed,
              {
                top: hole.y + hole.h,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: dim,
              },
            ]}
          />
          <Pressable
            accessible={false}
            style={[
              fixed,
              {
                top: hole.y,
                height: hole.h,
                left: 0,
                width: Math.max(0, hole.x),
                backgroundColor: dim,
              },
            ]}
          />
          <Pressable
            accessible={false}
            style={[
              fixed,
              {
                top: hole.y,
                height: hole.h,
                left: hole.x + hole.w,
                right: 0,
                backgroundColor: dim,
              },
            ]}
          />
          {/* 설명 단계에서는 강조한 곳도 눌리지 않게 막는다 */}
          {!tap ? (
            <Pressable
              accessible={false}
              style={[
                fixed,
                { top: hole.y, left: hole.x, width: hole.w, height: hole.h },
              ]}
            />
          ) : null}
          <Animated.View
            pointerEvents="none"
            style={[
              fixed,
              {
                top: hole.y,
                left: hole.x,
                width: hole.w,
                height: hole.h,
                borderRadius: 8,
                borderWidth: 3,
                borderColor: tokens.color.accent,
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.45],
                }),
              },
            ]}
          />
          <Arrow hole={hole} below={below} pulse={pulse} />
        </>
      ) : (
        <Pressable
          accessible={false}
          style={[
            fixed,
            { top: 0, left: 0, right: 0, bottom: 0, backgroundColor: dim },
          ]}
        />
      )}
      <View
        role="dialog"
        aria-label={step.title}
        testID="tour-card"
        onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
        style={[
          fixed,
          cardPos,
          {
            left: cardLeft,
            width: cardW,
            backgroundColor: tokens.color.background,
            borderRadius: tokens.radius.md,
            padding: tokens.space.lg,
          },
        ]}
      >
        <View
          style={{
            height: 24,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <T variant="caption" weight="semibold" color={tokens.color.accent}>
            {index + 1} / {STEPS.length}
          </T>
          <View style={{ marginRight: -12 }}>
            <IconButton
              icon="close"
              label="안내 건너뛰기"
              onPress={onStop}
              size={20}
            />
          </View>
        </View>
        <View
          style={{
            marginTop: tokens.space.sm,
            height: 4,
            borderRadius: 2,
            backgroundColor: tokens.color.surface,
          }}
        >
          <View
            style={{
              width: `${((index + 1) / STEPS.length) * 100}%`,
              height: 4,
              borderRadius: 2,
              backgroundColor: tokens.color.accent,
            }}
          />
        </View>
        <T
          variant="heading"
          accessibilityRole="header"
          style={{ marginTop: tokens.space.md }}
        >
          {step.title}
        </T>
        <T style={{ marginTop: tokens.space.sm }}>
          {missing
            ? "이 화면에서는 안내할 곳을 찾지 못했어요. 다음으로 넘어갈게요."
            : waiting && step.bodyFor
              ? "화면을 여는 중이에요. 잠시만 기다려 주세요."
              : (step.bodyFor?.({ path, found }) ?? step.body)}
        </T>
        {waiting ? null : tap ? (
          <View
            style={{
              marginTop: tokens.space.lg,
              height: tokens.height.buttonProducer,
              borderRadius: tokens.radius.md,
              backgroundColor: tokens.color.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T weight="semibold" color={tokens.color.accent}>
              밝게 표시된 곳을 눌러 보세요
            </T>
          </View>
        ) : (
          <Button
            label={last ? "알겠어요" : index === 0 ? "시작하기" : "다음"}
            size="producer"
            style={{ marginTop: tokens.space.lg }}
            onPress={() => onNext(missing ? step.skipTo : undefined)}
          />
        )}
      </View>
    </View>
  );
}

/** 카드 쪽에서 강조한 곳을 가리키는 화살표. 위아래로 살짝 움직인다 */
function Arrow({
  hole,
  below,
  pulse,
}: {
  hole: Rect;
  below: boolean;
  pulse: Animated.Value;
}) {
  const cx = hole.x + hole.w / 2;
  const len = 44;
  const top = below ? hole.y + hole.h + 4 : hole.y - len - 4;
  // below: 카드가 아래 → 화살표는 위(대상)를 향한다
  const d = below
    ? "M12 42 L12 6 M3 15 L12 4 L21 15"
    : "M12 2 L12 38 M3 29 L12 40 L21 29";
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "fixed" } as unknown as ViewStyle,
        {
          top,
          left: cx - 12,
          width: 24,
          height: len,
          transform: [
            {
              translateY: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: below ? [0, 6] : [0, -6],
              }),
            },
          ],
        },
      ]}
    >
      <Svg width={24} height={len} viewBox={`0 0 24 ${len}`}>
        <Path
          d={d}
          stroke="#FFFFFF"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/** 탭 화면 헤더 오른쪽에 둔다. autoOpen이면 승인된 생산자가 아직 안내를 본 적 없을 때 바로 시작한다 */
export function HelpButton({ autoOpen = false }: { autoOpen?: boolean }) {
  const { start, active } = useTour();
  const { user } = useSession();
  const approved = user?.farmStatus === "APPROVED";
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !autoOpen || !approved || active) return;
    asked.current = true;
    if (readStore(HELP_GUIDE_SEEN) === null) start();
  }, [autoOpen, approved, active, start]);
  return (
    <IconButton
      icon="question"
      label="도움말"
      testID="help-button"
      onPress={start}
    />
  );
}
