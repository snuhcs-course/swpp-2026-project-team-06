// npm run demo:publish (DEV-134): stitch 결과 영상을 GitHub Release에 올린다. 실제 업로드는 demo/videos.mjs upload가 한다
// (같은 이름 교체, videos.json SHA-256 갱신, DEV-133). 올리기 전에 영상이 다 있는지, 길이가 manifest와 같은지 본다.
//   npm run demo:publish -- --dry-run             → 확인만 하고 실행할 명령을 보인다(Release는 그대로)
//   npm run demo:publish [-- --dir demo/.raw/out --tag demo-i3]
// 태그 기본값은 demo-<시나리오 iteration>(예: demo-i2). 지금 videos.json과 태그가 다르면 영상 4개가 다 있어야 한다(videos.mjs 규칙).
// 올린 뒤: demo/videos.json·demo/manifest.json·demo/site 커밋 → PR 머지 → deploy-vercel.yml deploy-demo가 배포한다.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { scenario as defaultScenario } from "../scenario.mjs";
import { demoDir, isMain, parseArgs, probe, rawOut, readManifest, repoRoot, requireFfmpeg, runMain } from "./lib.mjs";

/** 올릴 파일·태그와 문제 목록. probeFn(file) → { seconds } (테스트에서 바꿔 끼움) */
export function planPublish({ dir, tag, manifest, scenario = defaultScenario, current, exists = existsSync, probeFn = probe, listMp4 = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".mp4")) : []) }) {
  const problems = [];
  const release = tag ?? `demo-${scenario.iteration}`;
  if (!manifest) problems.push("demo/manifest.json이 없어요(npm run demo:stitch가 만든다)");
  else if (manifest.iteration !== scenario.iteration) problems.push(`manifest iteration ${manifest.iteration} ≠ 시나리오 ${scenario.iteration}`);
  const names = Object.keys(manifest?.videos ?? {});
  for (const name of names) {
    const file = path.join(dir, name);
    if (!exists(file)) {
      problems.push(`${path.relative(repoRoot, file)}이 없어요`);
      continue;
    }
    const got = probeFn(file).seconds;
    const want = manifest.videos[name].seconds;
    if (Math.abs(got - want) > 0.5) problems.push(`${name}: 길이 ${got.toFixed(2)}s가 manifest ${want}s와 달라요(stitch 뒤 파일이 바뀜?)`);
  }
  // videos.mjs upload는 폴더의 mp4를 모두 올리므로, manifest에 없는 mp4가 섞여 있으면 멈춘다
  const extra = listMp4(dir).filter((f) => !names.includes(f));
  if (extra.length) problems.push(`${path.relative(repoRoot, dir) || dir}에 manifest에 없는 mp4가 있어요(같이 올라가요): ${extra.join(", ")}`);
  if (current && release !== current.release) {
    const missing = Object.keys(current.files ?? {}).filter((n) => !names.includes(n));
    if (missing.length) problems.push(`새 Release ${release}에는 영상이 모두 있어야 해요. 빠짐: ${missing.join(", ")}`);
  }
  return { release, names, problems, command: ["node", "demo/videos.mjs", "upload", path.relative(repoRoot, dir) || ".", release] };
}

if (isMain(import.meta.url)) {
  await runMain(async () => {
    const { opts } = parseArgs(process.argv.slice(2), { flags: ["dry-run"] });
    requireFfmpeg(["ffprobe"]);
    const dir = opts.dir ? path.resolve(opts.dir) : rawOut;
    const current = JSON.parse(readFileSync(path.join(demoDir, "videos.json"), "utf8"));
    const plan = planPublish({ dir, tag: opts.tag, manifest: readManifest(), current });
    if (plan.problems.length) throw new Error(plan.problems.join("\n  "));
    console.log(`${plan.names.join(", ")} → Release ${plan.release}${plan.release === current.release ? " (같은 이름 교체)" : " (새 Release)"}`);
    if (opts["dry-run"]) {
      console.log(`dry run: ${plan.command.join(" ")}`);
      return;
    }
    const r = spawnSync(plan.command[0] === "node" ? process.execPath : plan.command[0], plan.command.slice(1), { cwd: repoRoot, stdio: "inherit" });
    if (r.status !== 0) throw new Error("videos.mjs upload failed");
    console.log("Next: commit demo/videos.json, demo/manifest.json and demo/site, open a PR, merge → deploy-demo deploys it.");
  });
}
