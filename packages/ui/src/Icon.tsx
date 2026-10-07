import Svg, { Circle, Path, Rect } from "react-native-svg";

import { tokens } from "./tokens";

export type IconName =
  | "back"
  | "close"
  | "share"
  | "heart"
  | "heartFill"
  | "chevron"
  | "chevronDown"
  | "check"
  | "plus"
  | "search"
  | "calendar"
  | "drop"
  | "photo"
  | "send"
  | "compass"
  | "news"
  | "chat"
  | "user"
  | "chart"
  | "box"
  | "question"
  | "home"
  | "copy"
  | "lock"
  | "offline"
  | "alert"
  | "external"
  | "citrus"
  | "truck"
  | "settings";

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  /** 칸 안의 작은 체크는 2.5 (README 아이콘 예외) */
  strokeWidth?: number;
};

/** 24px · 선 1.75 · 둥근 끝 */
export function Icon({
  name,
  size = 24,
  color = tokens.color.text,
  strokeWidth,
}: Props) {
  const sw = strokeWidth ?? (name === "check" && size <= 20 ? 2.5 : 1.75);
  const p = {
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "back" && <Path d="M15 5l-7 7 7 7" {...p} />}
      {name === "close" && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
      {name === "share" && (
        <>
          <Path d="M12 3v12M7 8l5-5 5 5" {...p} />
          <Path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" {...p} />
        </>
      )}
      {name === "heart" && (
        <Path
          d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"
          {...p}
        />
      )}
      {name === "heartFill" && (
        <Path
          d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"
          {...p}
          fill={color}
        />
      )}
      {name === "chevron" && <Path d="M9 6l6 6-6 6" {...p} />}
      {name === "chevronDown" && <Path d="M6 9l6 6 6-6" {...p} />}
      {name === "check" && <Path d="M5 12l4 4L19 6" {...p} />}
      {name === "plus" && <Path d="M12 5v14M5 12h14" {...p} />}
      {name === "search" && (
        <>
          <Circle cx={11} cy={11} r={7} {...p} />
          <Path d="M20 20l-4-4" {...p} />
        </>
      )}
      {name === "calendar" && (
        <>
          <Rect x={3} y={5} width={18} height={16} rx={3} {...p} />
          <Path d="M3 10h18M8 3v4M16 3v4" {...p} />
        </>
      )}
      {name === "drop" && (
        <Path d="M12 3c3 3 6 6 6 10a6 6 0 0 1-12 0c0-4 3-7 6-10z" {...p} />
      )}
      {name === "photo" && (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={2} {...p} />
          <Circle cx={9} cy={10} r={2} {...p} />
          <Path d="M21 16l-5-5-9 8" {...p} />
        </>
      )}
      {name === "send" && <Path d="M12 19V5M5 12l7-7 7 7" {...p} />}
      {name === "compass" && (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M15.5 8.5l-2 5-5 2 2-5z" {...p} />
        </>
      )}
      {name === "settings" && (
        <>
          <Circle cx="12" cy="12" r="7" {...p} />
          <Circle cx="12" cy="12" r="2.5" {...p} />
          <Path
            d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"
            {...p}
          />
        </>
      )}
      {name === "news" && (
        <>
          <Rect x={4} y={4} width={16} height={16} rx={3} {...p} />
          <Path d="M8 9h8M8 13h8M8 17h5" {...p} />
        </>
      )}
      {name === "chat" && (
        <Path
          d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z"
          {...p}
        />
      )}
      {name === "user" && (
        <>
          <Circle cx={12} cy={8} r={4} {...p} />
          <Path d="M4 21c0-4 4-6 8-6s8 2 8 6" {...p} />
        </>
      )}
      {name === "chart" && (
        <Path d="M4 20v-8M10 20V5M16 20v-5M2 20h20" {...p} />
      )}
      {name === "box" && (
        <>
          <Path d="M3 7l9-4 9 4v10l-9 4-9-4z" {...p} />
          <Path d="M3 7l9 4 9-4M12 11v10" {...p} />
        </>
      )}
      {name === "question" && (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path
            d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"
            {...p}
          />
        </>
      )}
      {name === "home" && (
        <Path
          d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
          {...p}
        />
      )}
      {name === "copy" && (
        <>
          <Rect x={9} y={9} width={11} height={11} rx={2} {...p} />
          <Path d="M5 15V5a1 1 0 0 1 1-1h9" {...p} />
        </>
      )}
      {name === "lock" && (
        <>
          <Rect x={5} y={11} width={14} height={10} rx={2} {...p} />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...p} />
        </>
      )}
      {name === "offline" && (
        <Path
          d="M2 9a16 16 0 0 1 20 0M5 12.5a11 11 0 0 1 14 0M8.5 16a6 6 0 0 1 7 0M12 20h.01M3 3l18 18"
          {...p}
        />
      )}
      {name === "alert" && (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M12 7v6M12 17h.01" {...p} />
        </>
      )}
      {name === "external" && <Path d="M7 17L17 7M9 7h8v8" {...p} />}
      {name === "citrus" && (
        <>
          <Circle cx="12" cy="13.5" r="7" {...p} />
          <Path
            d="M12 6.5c0-1.7 1.3-3 3-3M12 6.5c-1-1.6-2.8-2.1-4.2-1.4"
            {...p}
          />
        </>
      )}
      {name === "truck" && (
        <>
          <Path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" {...p} />
          <Circle cx="7" cy="18" r="1.8" {...p} />
          <Circle cx="17" cy="18" r="1.8" {...p} />
        </>
      )}
    </Svg>
  );
}
