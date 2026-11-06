// demo:* 명령 공용(DEV-134): 경로, 인자 읽기, ffmpeg/ffprobe 호출. 새 의존성 없이 node와 시스템 ffmpeg만 쓴다.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const demoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = path.resolve(demoDir, "..");
export const siteDir = path.join(demoDir, "site");
export const manifestPath = path.join(demoDir, "manifest.json");
export const rawSegments = path.join(demoDir, ".raw", "story"); // story.mjs가 구간 영상을 두는 곳
export const rawOut = path.join(demoDir, ".raw", "out"); // stitch 결과(git 밖)

/** --key value / --flag / 나머지 위치 인자. 값이 없는 플래그는 true */
export function parseArgs(argv, { flags = [] } = {}) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      rest.push(a);
      continue;
    }
    const [k, inline] = a.slice(2).split("=", 2);
    if (inline !== undefined) opts[k] = inline;
    else if (flags.includes(k)) opts[k] = true;
    else if (i + 1 < argv.length) opts[k] = argv[++i];
    else throw new Error(`--${k} needs a value`);
  }
  return { opts, rest };
}

/** 초 → "m:ss"(반올림). 사이트 길이 표기와 같은 형식 */
export function formatDuration(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function readManifest(file = manifestPath) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}
export function writeManifest(manifest, file = manifestPath) {
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** ffmpeg·ffprobe가 PATH에 있는지. 없으면 설치 안내와 함께 오류 */
export function requireFfmpeg(bins = ["ffmpeg", "ffprobe"]) {
  for (const bin of bins) {
    const r = spawnSync(bin, ["-version"], { stdio: "ignore" });
    if (r.error?.code === "ENOENT") {
      throw new Error(`${bin}을 찾을 수 없어요. 시스템 ffmpeg를 설치해 주세요(macOS: brew install ffmpeg, Ubuntu: sudo apt-get install ffmpeg).`);
    }
  }
}

export function hasFfmpeg() {
  try {
    requireFfmpeg();
    return true;
  } catch {
    return false;
  }
}

/** 영상 길이(초)와 첫 영상 스트림 크기 */
export function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=width,height", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}: ${r.stderr.trim()}`);
  const j = JSON.parse(r.stdout);
  return { seconds: Number(j.format.duration), width: j.streams[0]?.width, height: j.streams[0]?.height };
}

export function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status}): ffmpeg ${args.join(" ")}`);
}

/** 직접 실행됐는지(import로 불렸을 때는 main을 돌리지 않는다) */
export function isMain(metaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

/** main 실행: 오류는 스택 없이 한 줄로 */
export async function runMain(fn) {
  try {
    await fn();
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exitCode = 1;
  }
}
