// 데모 영상은 git에 넣지 않고 GitHub Release 첨부 파일로 둔다(DEV-133). videos.json이 어느 Release의 어떤 파일인지와
// SHA-256을 적고, 배포 때 CI가 받아 demo/site/videos/에 넣는다. 사이트 주소(/videos/*.mp4)는 바뀌지 않는다.
//   node demo/videos.mjs fetch                 → videos.json대로 받아 SHA-256 확인(이미 같으면 건너뜀)
//   node demo/videos.mjs upload <폴더> [태그]   → 폴더의 mp4를 Release에 올리고(같은 이름은 교체) videos.json 갱신. gh 로그인 필요
// 영상을 다시 찍으면 upload → videos.json 커밋 → PR 머지 → deploy-vercel.yml deploy-demo가 새 영상으로 배포한다.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(here, "videos.json");
const outDir = path.join(here, "site", "videos");
const repo = process.env.GITHUB_REPOSITORY ?? "snuhcs-course/swpp-2026-project-team-06";

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const readManifest = () => JSON.parse(readFileSync(manifestPath, "utf8"));

async function fetchVideos() {
  const { release, files } = readManifest();
  mkdirSync(outDir, { recursive: true });
  for (const [name, { sha256: want }] of Object.entries(files)) {
    const file = path.join(outDir, name);
    if (existsSync(file) && sha256(file) === want) {
      console.log(`${name}: up to date`);
      continue;
    }
    const url = `https://github.com/${repo}/releases/download/${release}/${name}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    const got = sha256(file);
    if (got !== want) throw new Error(`${name}: SHA-256 ${got} does not match videos.json ${want}`);
    console.log(`${name}: downloaded from ${release}`);
  }
}

function uploadVideos(dir, tag) {
  if (!dir) throw new Error("usage: node demo/videos.mjs upload <folder with mp4 files> [release tag]");
  const current = existsSync(manifestPath) ? readManifest() : { release: tag, files: {} };
  const release = tag ?? current.release;
  const names = readdirSync(dir).filter((f) => f.endsWith(".mp4")).sort();
  if (!names.length) throw new Error(`${dir} has no .mp4 files`);
  const gh = (args) => execFileSync("gh", ["--repo", repo, ...args], { stdio: ["ignore", "pipe", "inherit"] }).toString();
  try {
    gh(["release", "view", release]);
  } catch {
    gh(["release", "create", release, "--prerelease", "--title", `farmclub demo videos (${release})`,
      "--notes", "Working demo videos for demo.farmclub.kr. Managed by demo/videos.mjs (DEV-133); do not edit by hand."]);
  }
  gh(["release", "upload", release, "--clobber", ...names.map((n) => path.join(dir, n))]);
  // 같은 Release에서 이번에 안 올린 파일은 manifest에 남긴다(일부만 다시 찍는 경우)
  const files = release === current.release ? { ...current.files } : {};
  for (const n of names) files[n] = { sha256: sha256(path.join(dir, n)), bytes: statSync(path.join(dir, n)).size };
  writeFileSync(manifestPath, `${JSON.stringify({ release, files }, null, 2)}\n`);
  console.log(`Uploaded ${names.join(", ")} to ${release}. Commit demo/videos.json to deploy them.`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "fetch") await fetchVideos();
else if (cmd === "upload") uploadVideos(rest[0], rest[1]);
else throw new Error("usage: node demo/videos.mjs fetch | upload <folder> [release tag]");
