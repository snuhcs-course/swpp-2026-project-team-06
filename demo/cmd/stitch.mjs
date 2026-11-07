// npm run demo:stitch (DEV-134): 녹화한 구간 영상을 이어 전체 영상(story.mp4)을 만들고, 역할(p/a/c)별 구간만 이어
// 앱 영상(producer·admin·consumer.mp4)을 만든 뒤, 실제 길이를 demo/manifest.json에 적는다. 사이트 길이 표기는 이 값을 쓴다.
//   npm run demo:stitch [-- --in demo/.raw/story --out demo/.raw/out --crf 18 --preset medium]
//   npm run demo:stitch -- --measure demo/site/videos   → 이미 있는 완성 영상 4개의 길이만 manifest에 적는다(손으로 편집한 영상)
// 구간 파일은 <구간>.mp4(DEMO_HQ) 또는 <구간>.webm. 크기가 다르면 첫 구간 크기로 맞춘다. 소리는 없다.
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { ROLES, STORY, scenario as defaultScenario, segmentsByRole } from "../scenario.mjs";
import { ffmpeg, isMain, manifestPath, parseArgs, probe, rawOut, rawSegments, readManifest, repoRoot, requireFfmpeg, runMain, writeManifest } from "./lib.mjs";

/** 구간마다 쓸 파일(mp4 우선). 빠진 구간은 missing */
export function findSegments(dir, order) {
  const files = {};
  const missing = [];
  for (const seg of order) {
    const hit = [".mp4", ".webm"].map((ext) => path.join(dir, `${seg}${ext}`)).find((f) => existsSync(f));
    if (hit) files[seg] = hit;
    else missing.push(seg);
  }
  return { files, missing };
}

/** 만들 영상 목록: 전체 + 역할별(구간이 있는 역할만). 역할 영상은 전체 영상을 자른 것과 같은 구간을 원본에서 바로 잇는다 */
export function planOutputs(order) {
  const byRole = segmentsByRole(order);
  const outputs = [{ name: STORY.video, segments: [...order] }];
  for (const [r, role] of Object.entries(ROLES)) if (byRole[r].length) outputs.push({ name: role.video, segments: byRole[r] });
  return outputs;
}

/** ffmpeg concat 필터 인자(다시 인코딩: webm·mp4가 섞이거나 크기가 달라도 이어진다) */
export function concatArgs(inputs, out, { width, height, crf = 18, preset = "medium" }) {
  const norm = inputs.map((_, i) => `[${i}:v]scale=${width}:${height}:flags=lanczos,fps=30,format=yuv420p,setsar=1[v${i}]`);
  const filter = `${norm.join(";")};${inputs.map((_, i) => `[v${i}]`).join("")}concat=n=${inputs.length}:v=1:a=0[out]`;
  return [...inputs.flatMap((f) => ["-i", f]), "-filter_complex", filter, "-map", "[out]", "-an", "-c:v", "libx264", "-preset", String(preset), "-crf", String(crf), "-movflags", "+faststart", out];
}

const round = (x) => Math.round(x * 100) / 100;

/** 구간을 이어 영상을 만들고 manifest 객체를 돌려준다 */
export function stitch({ inDir = rawSegments, outDir = rawOut, scenario = defaultScenario, crf, preset, log = console.log } = {}) {
  requireFfmpeg();
  const { files, missing } = findSegments(inDir, scenario.order);
  if (missing.length) throw new Error(`${path.relative(repoRoot, inDir) || inDir}에 구간 영상이 없어요: ${missing.join(", ")} (npm run demo:record -- --target local ${missing.join(" ")})`);
  mkdirSync(outDir, { recursive: true });
  const probes = Object.fromEntries(scenario.order.map((seg) => [seg, probe(files[seg])]));
  const { width, height } = probes[scenario.order[0]];
  const segments = {};
  let start = 0;
  for (const seg of scenario.order) {
    segments[seg] = { file: path.basename(files[seg]), start: round(start), seconds: round(probes[seg].seconds) };
    start += probes[seg].seconds;
  }
  const videos = {};
  for (const { name, segments: segs } of planOutputs(scenario.order)) {
    const out = path.join(outDir, name);
    log(`${name} ← ${segs.join(" ")}`);
    ffmpeg(concatArgs(segs.map((s) => files[s]), out, { width, height, crf, preset }));
    videos[name] = { seconds: round(probe(out).seconds), segments: segs };
  }
  return { iteration: scenario.iteration, size: `${width}x${height}`, videos, segments };
}

/** 이미 있는 완성 영상의 길이만 잰다(구간 정보 없음) */
export function measure(dir, { scenario = defaultScenario } = {}) {
  requireFfmpeg();
  const videos = {};
  for (const { name, segments } of planOutputs(scenario.order)) {
    const f = path.join(dir, name);
    if (!existsSync(f)) throw new Error(`${f}이 없어요`);
    videos[name] = { seconds: round(probe(f).seconds), segments };
  }
  const { width, height } = probe(path.join(dir, STORY.video));
  return { iteration: scenario.iteration, size: `${width}x${height}`, videos };
}

if (isMain(import.meta.url)) {
  await runMain(async () => {
    const { opts } = parseArgs(process.argv.slice(2));
    const manifestFile = opts.manifest ? path.resolve(opts.manifest) : manifestPath;
    const manifest = opts.measure
      ? measure(path.resolve(opts.measure))
      : stitch({ inDir: opts.in ? path.resolve(opts.in) : rawSegments, outDir: opts.out ? path.resolve(opts.out) : rawOut, crf: opts.crf, preset: opts.preset });
    const before = readManifest(manifestFile);
    writeManifest(manifest, manifestFile);
    for (const [name, v] of Object.entries(manifest.videos)) console.log(`${name}: ${v.seconds}s${before?.videos?.[name] ? ` (was ${before.videos[name].seconds}s)` : ""}`);
    console.log(`Wrote ${manifestFile.startsWith(repoRoot) ? path.relative(repoRoot, manifestFile) : manifestFile}. Next: npm run demo:site, then npm run demo:publish -- --dry-run`);
  });
}
