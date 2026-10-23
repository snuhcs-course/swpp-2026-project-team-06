#!/usr/bin/env python3
"""DEV-144: send usage from still-retained spec-check report artifacts (7 days) to the cost page once.

Run by a person with the production token; it is never run in CI. Needs the `gh` CLI logged in with
read access to the repository. Re-sending is safe: the server keeps the first record per run key.

    SPEC_CHECK_USAGE_URL=https://api.farmclub.kr/internal/spec-check-runs \\
    SPEC_CHECK_USAGE_TOKEN=... python3 .github/spec-check/backfill_usage.py [--dry-run]
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import zipfile

import check

REPO = "snuhcs-course/swpp-2026-project-team-06"
NAME = re.compile(r"^spec-code-(?:review|demo-(?:mismatch|matched))-(\d+)-(\d+)$")


def gh(*args, binary=False):
    out = subprocess.run(["gh", "api", *args], check=True, capture_output=True)
    return out.stdout if binary else json.loads(out.stdout)


def artifacts():
    page = 1
    while True:
        data = gh(f"repos/{REPO}/actions/artifacts?per_page=100&page={page}")
        for item in data["artifacts"]:
            match = NAME.match(item["name"])
            if match and not item["expired"]:
                yield item, match.group(1), match.group(2)
        if len(data["artifacts"]) < 100:
            return
        page += 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="print what would be sent")
    args = parser.parse_args(argv)
    if not args.dry_run and not (os.environ.get("SPEC_CHECK_USAGE_URL") and os.environ.get("SPEC_CHECK_USAGE_TOKEN")):
        sys.exit("Set SPEC_CHECK_USAGE_URL and SPEC_CHECK_USAGE_TOKEN, or use --dry-run.")
    titles, sent = {}, 0
    for item, run_id, attempt in artifacts():
        archive = zipfile.ZipFile(io.BytesIO(gh(item["archive_download_url"], binary=True)))
        names = [n for n in archive.namelist() if n.endswith("report.json")]
        if not names:
            continue
        report = json.loads(archive.read(names[0]))
        pr = (report.get("metadata") or {}).get("pr")
        if not report.get("usage") or not pr:
            continue
        if pr not in titles:
            titles[pr] = gh(f"repos/{REPO}/pulls/{pr}").get("title", "")
        os.environ["GITHUB_RUN_ID"], os.environ["GITHUB_RUN_ATTEMPT"] = run_id, attempt
        line = f"PR #{pr} run {run_id}-{attempt} {report['status']} {report.get('usage')}"
        if args.dry_run:
            print("would send", line)
        elif check.report_usage(report, titles[pr], ran_at=item["created_at"]):
            sent += 1
            print("sent", line)
    print(f"done: {sent} sent")


if __name__ == "__main__":
    main()
