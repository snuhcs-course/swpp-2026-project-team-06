#!/usr/bin/env python3
"""DEV-234: GitHub Actions 실행 시간 측정(job p50/p90, 큐 대기). `gh` CLI 로그인만 있으면 된다(네트워크 필요).

예:
  python3 scripts/ci/ci_timings.py                              # ci·spec-check·deploy-* 최근 성공 10개
  python3 scripts/ci/ci_timings.py -w ci.yml -L 20 --branch nemodleo/dev-234-ci-fast-lanes
  python3 scripts/ci/ci_timings.py --run 123 --run 456          # 특정 실행만

- 벽시계(wall) = 실행 생성 → 마지막 갱신. 다시 실행(re-run)한 실행은 길게 잡힌다.
- 큐 대기(queue) = 실행 생성 → 첫 job 시작. 호스티드 러너가 모자라면 커진다.
- job 시간 = job 시작 → 끝. 건너뛴(skipped) job은 뺀다. `--min-seconds`로 거의 안 한 job(단계만 건너뛴 옛 방식)을 뺄 수 있다.
"""
import argparse
import json
import subprocess
from datetime import datetime

DEFAULT_WORKFLOWS = ["ci.yml", "spec-check.yml", "deploy-railway.yml", "deploy-vercel.yml"]


def ts(value):
    if not value or value.startswith("0001"):
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def pct(xs, p):
    xs = sorted(xs)
    if not xs:
        return float("nan")
    k = (len(xs) - 1) * p
    f = int(k)
    c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)


def gh(*args):
    return json.loads(subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout)


def runs_for(workflow, limit, branch, event, repo):
    args = ["run", "list", "-w", workflow, "-s", "success", "-L", str(limit), "--json", "databaseId"]
    if branch:
        args += ["-b", branch]
    if event:
        args += ["-e", event]
    if repo:
        args += ["-R", repo]
    return [r["databaseId"] for r in gh(*args)]


def view(run_id, repo):
    args = ["run", "view", str(run_id), "--json", "databaseId,workflowName,event,createdAt,updatedAt,jobs"]
    if repo:
        args += ["-R", repo]
    return gh(*args)


def report(title, runs, min_seconds):
    walls, queues, jobs = [], [], {}
    for r in runs:
        created = ts(r["createdAt"])
        walls.append((ts(r["updatedAt"]) - created).total_seconds() / 60)
        starts = [ts(j["startedAt"]) for j in r["jobs"] if ts(j["startedAt"])]
        if starts:
            queues.append((min(starts) - created).total_seconds() / 60)
        for j in r["jobs"]:
            start, end = ts(j["startedAt"]), ts(j["completedAt"])
            if j["conclusion"] == "skipped" or not start or not end:
                continue
            seconds = (end - start).total_seconds()
            if seconds < min_seconds:
                continue
            name = j["name"].split(",")[0]  # matrix 이름에서 긴 식별자 빼기
            jobs.setdefault(name, []).append(seconds / 60)
    print(f"\n### {title} (runs={len(runs)})\n")
    print("| 항목 | n | p50(분) | p90(분) |")
    print("| --- | --- | --- | --- |")
    print(f"| 벽시계 | {len(walls)} | {pct(walls, .5):.1f} | {pct(walls, .9):.1f} |")
    print(f"| 큐 대기 | {len(queues)} | {pct(queues, .5):.1f} | {pct(queues, .9):.1f} |")
    for name, xs in sorted(jobs.items()):
        print(f"| job `{name}` | {len(xs)} | {pct(xs, .5):.1f} | {pct(xs, .9):.1f} |")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-w", "--workflow", action="append", help="워크플로 파일 이름(여러 번 가능)")
    parser.add_argument("-L", "--limit", type=int, default=10)
    parser.add_argument("-b", "--branch")
    parser.add_argument("-e", "--event")
    parser.add_argument("-R", "--repo")
    parser.add_argument("--run", action="append", type=int, help="실행 ID를 직접 고른다(워크플로 목록 대신)")
    parser.add_argument("--min-seconds", type=float, default=0)
    args = parser.parse_args()
    if args.run:
        runs = [view(i, args.repo) for i in args.run]
        report("선택한 실행", runs, args.min_seconds)
        return
    for wf in args.workflow or DEFAULT_WORKFLOWS:
        runs = [view(i, args.repo) for i in runs_for(wf, args.limit, args.branch, args.event, args.repo)]
        report(wf, runs, args.min_seconds)


if __name__ == "__main__":
    main()
