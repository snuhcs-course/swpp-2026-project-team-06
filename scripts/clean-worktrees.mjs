// 머지된 브랜치의 .claude/worktrees/* 를 정리한다(DEV-117, `make clean-worktrees`).
// 기본은 시험 실행(목록만). --confirm 이면 `git worktree remove`로 지운다(브랜치는 남긴다).
// 변경(추적 안 되는 파일 포함)이 있거나 잠긴 worktree, 지금 쓰는 worktree는 건너뛴다.
// 머지 판단: gh로 본 머지된 PR의 head 브랜치이고, worktree HEAD가 그 PR head에 포함될 때(squash merge 대응).
// main에서 막 만든 빈 브랜치를 머지로 오인하지 않도록 origin/main 조상 여부로는 판단하지 않는다.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

const confirm = process.argv.includes("--confirm");
const git = (args, cwd) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const tryRun = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};

const root = path.dirname(
  git(["rev-parse", "--path-format=absolute", "--git-common-dir"]),
);
const prefix = path.join(root, ".claude", "worktrees") + path.sep;
const here = realpathSync(git(["rev-parse", "--show-toplevel"]));

const mergedPrs = tryRun(() =>
  JSON.parse(
    execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        "1000",
        "--json",
        "headRefName,headRefOid",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ),
  ),
);
if (!mergedPrs) {
  console.error(
    "gh로 머지된 PR 목록을 읽지 못했습니다(gh auth status 확인). 아무것도 지우지 않습니다.",
  );
  process.exit(1);
}
const mergedHeads = new Map();
for (const pr of mergedPrs)
  mergedHeads.set(pr.headRefName, [
    ...(mergedHeads.get(pr.headRefName) ?? []),
    pr.headRefOid,
  ]);

const worktrees = git(["worktree", "list", "--porcelain"])
  .split("\n\n")
  .map((block) => {
    const wt = {};
    for (const line of block.split("\n")) {
      const [key, ...rest] = line.split(" ");
      wt[key] = rest.join(" ") || true;
    }
    return wt;
  })
  .filter(
    (wt) => typeof wt.worktree === "string" && wt.worktree.startsWith(prefix),
  );

const result = { remove: [], dirty: [], keep: [] };
for (const wt of worktrees) {
  const name = path.relative(root, wt.worktree);
  const branch =
    typeof wt.branch === "string" ? wt.branch.replace("refs/heads/", "") : null;
  if (realpathSync(wt.worktree) === here) {
    result.keep.push(`${name} (지금 쓰는 worktree)`);
    continue;
  }
  if (wt.locked || wt.prunable) {
    result.keep.push(
      `${name} (${wt.locked ? "잠김" : "폴더 없음: git worktree prune"})`,
    );
    continue;
  }
  // 머지된 PR head에 HEAD가 들어 있어야 한다(머지 뒤 새 커밋이 있으면 남긴다).
  const merged = (mergedHeads.get(branch) ?? []).some(
    (oid) =>
      tryRun(() => git(["merge-base", "--is-ancestor", wt.HEAD, oid])) !== null,
  );
  if (!merged) {
    result.keep.push(`${name} [${branch ?? "detached"}] (머지 안 됨)`);
    continue;
  }
  if (git(["status", "--porcelain"], wt.worktree)) {
    result.dirty.push(`${name} [${branch}]`);
    continue;
  }
  result.remove.push({ name, branch, dir: wt.worktree });
}

const list = (title, items) => {
  console.log(`\n${title} ${items.length}개`);
  for (const item of items) console.log(`  ${item}`);
};
list(
  confirm ? "삭제" : "삭제 대상(시험 실행)",
  result.remove.map((wt) => `${wt.name} [${wt.branch}]`),
);
list("건너뜀: 머지됐지만 변경 있음", result.dirty);
list("남김", result.keep);

if (!confirm) {
  if (result.remove.length)
    console.log("\n지우려면: make clean-worktrees CONFIRM=1");
} else {
  for (const wt of result.remove) {
    try {
      git(["worktree", "remove", wt.dir]);
    } catch (error) {
      process.exitCode = 1;
      console.error(
        `실패: ${wt.name}: ${error.stderr?.toString().trim() || error.message}`,
      );
    }
  }
}
