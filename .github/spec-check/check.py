#!/usr/bin/env python3
"""Read-only specification/code review. Standard library only."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import time
from urllib import error, request

MAX_INPUT = 1024 * 1024  # DEV-197: 256 KiB overflowed config-heavy PRs (#270, 76 files).
MAX_OUTPUT_TOKENS = 16000  # Includes adaptive thinking tokens (DEV-79).
REQUEST_TIMEOUT = 90
GITHUB_TIMEOUT = 20
LIMIT = f"{MAX_INPUT // 1024} KiB"
MAX_RESPONSE = 1024 * 1024
ENDPOINT = "https://api.anthropic.com/v1/messages"
SHA = re.compile(r"^[0-9a-f]{40}$")
SECRET = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-ant-[A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}")
THINKING = {"thinking", "redacted_thinking"}
# DEV-81: only spec excerpts and the diff are sent. IDs name the FEAT/rule items worth excerpting.
# DEV-219: one task file per issue, `<folder>/tasks/DEV-123.md`. Old per-folder `tasks.md#dev-123` sections still work.
TASK_FILE = re.compile(r"(?:^|/)tasks/((?:dev|swpp)-\d+)\.md$", re.I)
ID = re.compile(r"\b(?:AC-[A-Za-z0-9]+-\d+|[RM]-\d{2,3})\b")
KEY = re.compile(r"\b(?:DEV|SWPP)-\d+\b", re.I)
EXCLUDED_NAMES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock"}
EXCLUDED_SUFFIXES = (".lock", ".snap", ".min.js", ".min.css", ".map", ".png", ".jpg", ".jpeg", ".gif", ".webp",
                     ".svg", ".ico", ".pdf", ".woff", ".woff2", ".ttf", ".otf", ".zip")
EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"  # git's empty tree: demo fixtures diff as added files.
PROMPT_VERSION = "dev81-v2"

# DEV-253: constrain syntax at the provider; validate() still independently checks
# evidence, line numbers, complete file coverage and report semantics afterward.
REFERENCE_SCHEMA = {
    "type": "object",
    "properties": {"path": {"type": "string"}, "line": {"type": "integer"}, "quote": {"type": "string"}},
    "required": ["path", "line", "quote"],
    "additionalProperties": False,
}
REPORT_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["PASS", "MISMATCH", "INCOMPLETE"]},
        "summary": {"type": "string"},
        "reviewed_files": {"type": "array", "items": {"type": "string"}},
        "findings": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "requirement": REFERENCE_SCHEMA,
                "code": REFERENCE_SCHEMA,
                "explanation": {"type": "string"},
                "suggestion": {"type": "string"},
                "certainty": {"type": "string", "enum": ["supported", "needs clarification"]},
            },
            "required": ["id", "requirement", "code", "explanation", "suggestion", "certainty"],
            "additionalProperties": False,
        }},
        "missing_context": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["status", "summary", "reviewed_files", "findings", "missing_context"],
    "additionalProperties": False,
}


class Incomplete(Exception):
    """A grounded review could not finish."""


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def git(root, *args):
    p = subprocess.run(["git", "--literal-pathspecs", "-C", str(root), *args], capture_output=True, timeout=20,
                       env={"PATH": os.environ.get("PATH", ""), "GIT_TERMINAL_PROMPT": "0",
                            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull})
    if p.returncode:
        raise Incomplete("Required git revision or context is unavailable.")
    return p.stdout


def safe_path(value):
    if not isinstance(value, str) or not value or len(value) > 300:
        raise Incomplete("Invalid repository path.")
    parts = PurePosixPath(value).parts
    if (value.startswith("/") or "\\" in value or ":" in value or ".." in parts
            or any(ord(c) < 32 for c in value) or value != str(PurePosixPath(value))):
        raise Incomplete("Use normalized repository-relative paths.")
    if any(p.startswith(".env") or p in {".git", "node_modules", ".venv", "dist", ".artifacts"}
           or p.lower().endswith((".pem", ".key", ".p12")) for p in parts):
        raise Incomplete("Sensitive or generated context is excluded.")
    return value


def read_file(root, revision, path, optional=False):
    safe_path(path)
    if not SHA.fullmatch(revision):
        raise Incomplete("Expected a captured full commit SHA.")
    entry = git(root, "ls-tree", "-z", revision, "--", path).decode()
    if not entry and optional:
        return None
    if (not entry or entry.split(" ", 1)[0] not in {"100644", "100755"}
            or entry.partition("\t")[2].rstrip("\0") != path):
        raise Incomplete("Required context is missing or is not a regular repository file.")
    if int(git(root, "cat-file", "-s", f"{revision}:{path}")) > MAX_INPUT:
        raise Incomplete(f"A required file exceeds {LIMIT}; split the PR.")
    try:
        text = git(root, "show", f"{revision}:{path}").decode("utf-8")
    except UnicodeDecodeError as exc:
        raise Incomplete("Required context is not UTF-8.") from exc
    if "\x00" in text or SECRET.search(text):
        raise Incomplete("Selected context may contain binary or secret material; content withheld.")
    return text


def digest(body):
    return hashlib.sha256(body.encode()).hexdigest()


def eligible(event):
    pr = event.get("pull_request", {})
    return (pr.get("base", {}).get("ref") == "main"
            and pr.get("head", {}).get("repo", {}).get("full_name") == event.get("repository", {}).get("full_name")
            and pr.get("user", {}).get("type") == "User")


def metadata(event):
    pr = event.get("pull_request", {})
    repo = event.get("repository", {}).get("full_name", "")
    base, head = pr.get("base", {}).get("sha", ""), pr.get("head", {}).get("sha", "")
    if (not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo)
            or not SHA.fullmatch(base) or not SHA.fullmatch(head) or type(pr.get("number")) is not int):
        raise Incomplete("Invalid repository identity or captured PR revision.")
    return {"repository": repo, "pr": pr["number"], "base_sha": base, "head_sha": head,
            "body_digest": digest(pr.get("body") or "")}


def task_file_key(path):
    """Issue key when `path` is a per-issue task file (`…/tasks/DEV-123.md`), else None."""
    match = TASK_FILE.search(path)
    return match[1] if match else None


def references(cell):
    return [safe_path(p.split("#", 1)[0]) for p in re.findall(r"`([^`]+)`", cell)]


def mapping_section(body):
    section = re.search(r"## Spec ↔ Code 확인\s*\n(.*?)(?=\n## |\Z)", body, re.S)
    if not section:
        raise Incomplete("Fill in the existing Spec ↔ Code 확인 section.")
    return section[1]


def author_mapping(body):
    section = [None, mapping_section(body)]
    specs, implementation = set(), set()
    for line in section[1].splitlines():
        cells = line.strip().strip("|").split("|")
        if line.lstrip().startswith("|") and len(cells) == 3:
            left, right = references(cells[0]), references(cells[1])
            if left and right:
                specs.update(left)
                implementation.update(right)
    task = re.search(r"작업 기록:\s*`([^`]+)`", section[1])
    if not specs or not implementation or not task:
        raise Incomplete("Add backtick spec/code paths to the existing mapping table and a task record (tasks/DEV-40.md).")
    path, separator, anchor = task[1].partition("#")
    if task_file_key(path):
        return specs, implementation, safe_path(path), task_file_key(path)
    match = re.match(r"((?:dev|swpp)-\d+)", anchor, re.I)
    if not separator or not match or not (path == "tasks.md" or path.endswith("/tasks.md")):
        raise Incomplete("Task reference needs an issue file or anchor, e.g. server/tasks/DEV-40.md or server/tasks.md#dev-40.")
    return specs, implementation, safe_path(path), match[1]


def mapping_anchors(body):
    """Spec-column `path#anchor` references: {path: {anchor}}. Only the heading named by an anchor is sent."""
    anchors = {}
    for line in mapping_section(body).splitlines():
        cells = line.strip().strip("|").split("|")
        if line.lstrip().startswith("|") and len(cells) == 3 and references(cells[0]) and references(cells[1]):
            for value in re.findall(r"`([^`]+)`", cells[0]):
                path, _, anchor = value.partition("#")
                if anchor:
                    anchors.setdefault(safe_path(path), set()).add(anchor)
    return anchors


def excluded(path):
    """Generated, binary or mirrored files stay out of the diff; only their paths are reported (DEV-81)."""
    parts = PurePosixPath(path).parts
    name = parts[-1]
    return (name in EXCLUDED_NAMES or name.lower().endswith(EXCLUDED_SUFFIXES)
            or "__snapshots__" in parts or parts[:2] == ("docs", "wiki"))


def item_block(lines, index):
    """Line `index` plus the following lines indented deeper than it (continuation of a list item)."""
    indent = len(lines[index]) - len(lines[index].lstrip())
    picks = {index}
    for j in range(index + 1, len(lines)):
        if not lines[j].strip():
            break
        if len(lines[j]) - len(lines[j].lstrip()) <= indent:
            break
        picks.add(j)
    return picks


def segments(lines, picks):
    """Group zero-based picked line indices into [{start: one-based line, text}] runs."""
    out, run = [], []
    for index in sorted(picks):
        if run and index != run[-1] + 1:
            out.append(run)
            run = []
        run.append(index)
    if run:
        out.append(run)
    return [{"start": r[0] + 1, "text": "\n".join(lines[i] for i in r)} for r in out]


def excerpt(text, picks, selection):
    lines = text.splitlines()
    picks = {i for i in picks if 0 <= i < len(lines)} | ({0} if lines else set())
    if len(picks) == len(lines):
        return {"kind": "full", "selection": selection, "segments": [{"start": 1, "text": text}]}
    return {"kind": "excerpt", "selection": selection, "segments": segments(lines, picks)}


def section_range(lines, index):
    """Lines of the heading at `index` up to the next heading of the same or a higher level."""
    level = len(re.match(r"#+", lines[index].lstrip())[0])
    end = index + 1
    while end < len(lines) and not re.match(r"\s*#{1,%d}\s" % level, lines[end]):
        end += 1
    return set(range(index, end))


def tasks_excerpt(text, issue):
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if re.match(r"## " + re.escape(issue) + r"\b", line, re.I):
            return excerpt(text, section_range(lines, index), f"issue section {issue}")
    return None


def feat_excerpt(text, ids):
    lines = text.splitlines()
    picks = set()
    for index, line in enumerate(lines):
        if ids & set(ID.findall(line)):
            picks |= item_block(lines, index)
    if picks:
        return excerpt(text, picks, "lines carrying the PR's AC/rule IDs")
    for index, line in enumerate(lines):
        if re.match(r"\s*-\s*\[[ xX]\]\s*AC-", line):
            picks |= item_block(lines, index)
    if picks:
        return excerpt(text, picks, "acceptance criteria (no AC ID named in the PR)")
    return excerpt(text, range(len(lines)), "complete file (no acceptance criteria found)")


def rules_excerpt(text, ids):
    lines = text.splitlines()
    picks = {i for i, line in enumerate(lines) if (m := re.match(r"\|\s*([RM]-\d+)\s*\|", line)) and m[1] in ids}
    if picks:
        return excerpt(text, picks, "rule rows named in the PR")
    return excerpt(text, range(len(lines)), "complete file (no rule ID named in the PR)")


def decisions_excerpt(text, ids, issue):
    lines = text.splitlines()
    picks, rows = set(), []
    for index, line in enumerate(lines):
        if re.match(r"#+\s", line.lstrip()) and "결정" in line:
            table = [i for i in sorted(section_range(lines, index)) if lines[i].lstrip().startswith("|")]
            picks |= set(table[:2])  # header and separator keep the columns readable
            rows += table[2:]
    needles = {issue.lower()} | {i.lower() for i in ids}
    matched = {i for i in rows if needles & ({m.lower() for m in ID.findall(lines[i])} | {k.lower() for k in KEY.findall(lines[i])})}
    if matched:
        return excerpt(text, picks | matched, "decision rows naming the issue or its AC/rule IDs")
    if rows:
        return excerpt(text, picks | set(rows[-10:]), "latest 10 decision rows (none names the issue)")
    for index, line in enumerate(lines):
        if re.match(r"#+\s", line.lstrip()) and re.search(re.escape(issue), line, re.I):
            return excerpt(text, section_range(lines, index), f"section headed by {issue}")
    return excerpt(text, set(), "title only (no decision table or issue section)")


def slug(heading):
    text = re.sub(r"^#+\s*", "", heading.strip()).lower()
    return re.sub(r"\s+", "-", re.sub(r"[^\w\s-]", "", text).strip())


def anchor_excerpt(text, anchors):
    lines = text.splitlines()
    picks = set()
    for index, line in enumerate(lines):
        if re.match(r"#+\s", line.lstrip()) and any(slug(line) == a.lower() or a.lower() in line.lower() for a in anchors):
            picks |= section_range(lines, index)
    return excerpt(text, picks, "sections named by the table anchors") if picks else None


def diff_lines(diff):
    """New-side line numbers of added and context lines per path, as the model must cite them."""
    files, current, line = {}, None, 0
    for raw in diff.splitlines():
        if raw.startswith("diff --git "):
            current = None
        elif current is None and raw.startswith("+++ "):
            name = raw[4:]
            current = None if name == "/dev/null" else files.setdefault(name[2:] if name.startswith("b/") else name, {})
        elif raw.startswith("@@"):
            line = int(re.match(r"@@ -\d+(?:,\d+)? \+(\d+)", raw)[1])
        elif current is not None and raw.startswith(("+", " ")):
            current[line] = raw[1:]
            line += 1
    return files


def collect(root, event, demo=None):
    meta = metadata(event)
    base, head = meta["base_sha"], meta["head_sha"]
    merge_base = git(root, "merge-base", base, head).decode().strip()
    meta.update(merge_base_sha=merge_base, mode=f"demo-{demo}" if demo else "pr",
                runner_sha=os.environ.get("GITHUB_SHA", "local execution"), source_revisions={})
    documents, references_only, anchors, ids = {}, {}, {}, set()
    if demo:
        prefix = ".github/spec-check/fixtures/quantity/"
        specs, implementation = {prefix + "spec.md"}, {prefix + demo + ".py"}
        changed, task_path, issue, old_rev = sorted(implementation), None, "demo", EMPTY_TREE
        documents[prefix + "spec.md"] = excerpt(read_file(root, head, prefix + "spec.md"), range(10 ** 6), "complete fixture")
        meta["source_revisions"][prefix + "spec.md"] = head
    else:
        body = event["pull_request"].get("body") or ""
        specs, implementation, task_path, issue = author_mapping(body)
        anchors, old_rev = mapping_anchors(body), merge_base
        if not task_file_key(task_path):
            # DEV-219: after the split the old section is a link stub; read the issue file next to it instead.
            sibling = str(PurePosixPath(task_path).parent / "tasks" / f"{issue.upper()}.md")
            if git(root, "ls-tree", "-z", head, "--", sibling):
                specs.add(task_path)
                task_path = sibling
        task = read_file(root, head, task_path)
        if task_file_key(task_path):
            section = excerpt(task, range(10 ** 6), f"issue file {issue}")
        else:
            section = tasks_excerpt(task, issue)
        if section is None:
            raise Incomplete("The referenced tasks.md issue section is missing.")
        documents[task_path] = section
        meta["source_revisions"][task_path] = head
        specs.add(task_path)
        # IDs may be written only in the task record (issue file or tasks.md section); segments[0] is the title line.
        section_text = "\n".join(seg["text"] for seg in section["segments"])
        ids = set(ID.findall(mapping_section(body))) | set(ID.findall(section_text))
        changed = [safe_path(p) for p in git(root, "diff", "--name-only", "--no-renames", "-z", merge_base, head).decode().split("\0") if p]
        unmapped = set(changed) - specs - implementation
        if unmapped:
            raise Incomplete("Unmapped changed files: " + ", ".join(sorted(unmapped)))
        for path in implementation:
            for parent in PurePosixPath(path).parents:
                contract = str(parent / "spec.md")
                if git(root, "ls-tree", "-z", head, "--", contract):
                    specs.add(contract)
                    break
        for path in sorted(specs - set(documents)):
            current = read_file(root, head, path, optional=True)
            text = current if current is not None else read_file(root, merge_base, path, optional=True)
            if text is None:
                raise Incomplete("A referenced file is missing at both captured revisions.")
            name = PurePosixPath(path).name
            if path.startswith("docs/spec/functional/FEAT-"):
                document = feat_excerpt(text, ids)
            elif path == "docs/spec/functional/rules.md":
                document = rules_excerpt(text, ids)
            elif name == "spec.md":
                document = decisions_excerpt(text, ids, issue)
            elif task_file_key(path):
                document = excerpt(text, range(10 ** 6), f"issue file {task_file_key(path)}")
            elif name == "tasks.md":
                document = tasks_excerpt(text, issue) or excerpt(text, set(), f"title only (no {issue} section)")
            else:
                document = anchor_excerpt(text, anchors[path]) if anchors.get(path) else None
            if document is None:
                references_only[path] = {"size": len(text.encode())}
                continue
            documents[path] = document
            meta["source_revisions"][path] = head if current is not None else merge_base
        # DEV-197: unchanged implementation files named in the table go in full as context, so the model can
        # verify claims about code outside the diff instead of writing UNVERIFIED. Findings still cite the diff.
        for path in sorted(implementation - set(changed) - set(documents)):
            if excluded(path):
                continue
            # DEV-199: a folder or symlink in the table is a reference, not context; read_file would raise.
            entry = git(root, "ls-tree", "-z", head, "--", path).decode()
            mode = entry.split(" ", 1)[0] if entry else ""
            if entry and mode not in {"100644", "100755"}:
                references_only[path] = {"size": None, "kind": {"040000": "tree", "120000": "symlink"}.get(mode, "other")}
                continue
            text = read_file(root, head, path, optional=True)
            if text is None:
                references_only[path] = {"size": None}
                continue
            documents[path] = excerpt(text, range(10 ** 6), "context: unchanged implementation file listed in the PR table")
            meta["source_revisions"][path] = head
    excluded_paths = sorted(p for p in changed if excluded(p))
    diff_paths = [p for p in changed if p not in excluded_paths]
    diff = git(root, "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--unified=5", old_rev, head,
               "--", *diff_paths).decode() if diff_paths else ""
    if SECRET.search(diff):
        raise Incomplete("The diff may contain secret material; content withheld.")
    changed_files = {}
    entries = git(root, "diff", "--name-status", "--no-renames", "-z", old_rev, head).decode().split("\0")
    status = {path: flag for flag, path in zip(entries[::2], entries[1::2])}
    for path in changed:
        current = None if status.get(path) == "D" else int(git(root, "cat-file", "-s", f"{head}:{path}"))
        previous = None if status.get(path) == "A" else int(git(root, "cat-file", "-s", f"{old_rev}:{path}"))
        changed_files[path] = {"status": {"A": "added", "D": "deleted"}.get(status.get(path), "modified"),
                               "size": current, "previous_size": previous}
    context = {"metadata": meta, "issue": issue, "spec_paths": sorted(specs), "implementation_paths": sorted(implementation),
               "changed_paths": changed, "changed_files": changed_files, "excluded_paths": excluded_paths,
               "diff_paths": diff_paths, "documents": documents, "reference_paths": references_only, "diff": diff}
    if len(json.dumps(context, ensure_ascii=False).encode()) > MAX_INPUT:
        raise Incomplete(f"Complete context exceeds {LIMIT}. Split the PR; no partial review was sent.")
    return context


def check_current(event, token):
    meta = metadata(event)
    if not token:
        raise Incomplete("GitHub read token unavailable; current revision cannot be verified.")
    req = request.Request(f"https://api.github.com/repos/{meta['repository']}/pulls/{meta['pr']}",
                          headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
    try:
        with request.build_opener(NoRedirect()).open(req, timeout=GITHUB_TIMEOUT) as response:
            current = json.loads(response.read(MAX_RESPONSE + 1))
        if (current["head"]["sha"] != meta["head_sha"] or current["base"]["sha"] != meta["base_sha"]
                or digest(current.get("body") or "") != meta["body_digest"]):
            raise Incomplete("PR revision/body changed. Use the latest workflow run.")
    except (error.URLError, KeyError, ValueError) as exc:
        raise Incomplete("Current PR identity could not be verified.") from exc


def block_type(block):
    """Name an unexpected block for the report without echoing provider text."""
    value = block.get("type")
    return value if isinstance(value, str) and re.fullmatch(r"[a-z_]{1,40}", value) else "unknown"


def model_review(context, prompt, api_key, model, opener=None, sleep=time.sleep):
    if not api_key or not model:
        raise Incomplete("Configure SPEC_CHECK_API_KEY and SPEC_CHECK_MODEL in the protected spec-check environment.")
    payload = json.dumps({"model": model, "max_tokens": MAX_OUTPUT_TOKENS, "system": prompt,
                          "output_config": {"format": {"type": "json_schema", "schema": REPORT_OUTPUT_SCHEMA}},
                          "messages": [{"role": "user", "content": json.dumps(context, ensure_ascii=False)}]}).encode()
    if len(payload) > MAX_INPUT:
        raise Incomplete(f"Prompt plus complete context exceeds {LIMIT}; split the PR.")
    req = request.Request(ENDPOINT, data=payload, headers={"x-api-key": api_key,
                          "anthropic-version": "2023-06-01", "content-type": "application/json"})
    client = opener or request.build_opener(NoRedirect())
    for attempt in range(2):
        try:
            with client.open(req, timeout=REQUEST_TIMEOUT) as response:
                raw = response.read(MAX_RESPONSE + 1)
            if len(raw) > MAX_RESPONSE:
                raise Incomplete("Model response exceeded the response limit.")
            envelope = json.loads(raw)
            if not isinstance(envelope, dict):
                raise Incomplete("Unexpected provider response shape.")
            if envelope.get("stop_reason") != "end_turn":
                raise Incomplete("Model output was truncated or did not complete normally.")
            blocks = envelope.get("content", [])
            if not isinstance(blocks, list) or any(not isinstance(b, dict) for b in blocks):
                raise Incomplete("Unexpected model content type.")
            # DEV-79: adaptive thinking blocks are dropped unread; only text carries the review.
            blocks = [b for b in blocks if b.get("type") not in THINKING]
            unexpected = sorted({block_type(b) for b in blocks if b.get("type") != "text"})
            if unexpected:
                raise Incomplete("Unexpected model content type: " + ", ".join(unexpected) + ".")
            if not blocks:
                raise Incomplete("Unexpected model content type: no text block.")
            usage = envelope.get("usage", {})
            if not isinstance(usage, dict):
                raise Incomplete("Unexpected usage metadata.")
            counts = {k: usage[k] for k in ("input_tokens", "output_tokens") if k in usage}
            if any(type(v) is not int or v < 0 for v in counts.values()):
                raise Incomplete("Invalid usage counts.")
            return json.loads("".join(b["text"] for b in blocks)), counts
        except error.HTTPError as exc:
            if attempt == 0 and exc.code in {429, 500, 502, 503, 504, 529}:
                retry = exc.headers.get("Retry-After", "2")
                delay = int(retry) if retry.isdigit() else 2
                if delay > 20:
                    raise Incomplete("Provider requested a longer wait; rerun later.") from exc
                sleep(delay)
                continue
            raise Incomplete(f"Model API HTTP {exc.code}; response body withheld.") from exc
        except (error.URLError, TimeoutError, OSError) as exc:
            if attempt == 0:
                sleep(2)
                continue
            raise Incomplete("Model API connection failed or timed out.") from exc
        except (ValueError, KeyError, TypeError) as exc:
            raise Incomplete("Model response is not valid review JSON.") from exc


def validate(result, context):
    fields = {"status", "summary", "reviewed_files", "findings", "missing_context"}
    if not isinstance(result, dict) or set(result) != fields:
        raise Incomplete("Invalid report fields.")
    status = result["status"]
    if not isinstance(status, str) or status not in {"PASS", "MISMATCH", "INCOMPLETE"}:
        raise Incomplete("Invalid model result status.")
    if not isinstance(result["summary"], str) or not result["summary"].strip():
        raise Incomplete("Missing review explanation.")
    if any(not isinstance(result[k], list) for k in ("reviewed_files", "findings", "missing_context")):
        raise Incomplete("Invalid report collection.")
    if not all(isinstance(x, str) for x in result["reviewed_files"] + result["missing_context"]):
        raise Incomplete("Invalid reviewed-file or missing-context values.")
    supplied = set(context["documents"]) | set(context["diff_paths"])
    if not set(result["reviewed_files"]).issubset(supplied):
        raise Incomplete("Model cited files outside supplied context.")
    if status != "INCOMPLETE" and set(result["reviewed_files"]) != supplied:
        raise Incomplete("Model did not account for all supplied context.")
    code_lines = diff_lines(context["diff"])
    seen, kept, dropped = set(), [], []
    for finding in result["findings"]:
        if not isinstance(finding, dict) or set(finding) != {"id", "requirement", "code", "explanation", "suggestion", "certainty"}:
            raise Incomplete("Invalid finding fields.")
        if (not isinstance(finding["id"], str) or not re.fullmatch(r"SC-\d{3}", finding["id"]) or finding["id"] in seen):
            raise Incomplete("Invalid or duplicate finding ID.")
        seen.add(finding["id"])
        if any(not isinstance(finding[k], str) or not finding[k].strip() for k in ("explanation", "suggestion")):
            raise Incomplete("Finding needs an explanation and reviewer action.")
        if not isinstance(finding["certainty"], str) or finding["certainty"] not in {"supported", "needs clarification"}:
            raise Incomplete("Invalid finding certainty.")
        for key, allowed in (("requirement", context["spec_paths"]), ("code", context["implementation_paths"])):
            ref = finding[key]
            if not isinstance(ref, dict) or set(ref) != {"path", "line", "quote"}:
                raise Incomplete("Invalid finding reference.")
            path, line, quote = ref["path"], ref["line"], ref["quote"]
            if not isinstance(path, str) or path not in allowed or type(line) is not int:
                raise Incomplete("Finding reference is outside declared scope.")
            if key == "requirement":
                # Original-file line numbers inside the excerpt segments that were actually sent.
                source = {s["start"] + i: t for s in context["documents"].get(path, {}).get("segments", [])
                          for i, t in enumerate(s["text"].splitlines())}
            else:
                source = code_lines.get(path, {})  # New-side numbers of added/context diff lines only.
            if line not in source or not isinstance(quote, str) or not quote.strip() or quote not in source[line]:
                dropped.append(finding["id"])  # DEV-211: unverifiable evidence is not a finding; see below.
                break
        else:
            kept.append(finding)
    if dropped:
        # DEV-211: a finding whose quote/line is not in the sent excerpts or diff is dropped instead of failing the
        # whole review. Nothing verified remains for it, so the model status cannot stand as PASS or MISMATCH
        # unless verified findings remain; INCOMPLETE with no findings then becomes NO_FINDINGS in scoped().
        result["findings"] = kept
        result["summary"] = (result["summary"].rstrip() + f" ({len(dropped)} finding(s) dropped: quote/line not in"
                             f" supplied excerpts or diff: {', '.join(dropped)}. Reviewer: check the diff by hand.)")
        if status == "PASS" or (status == "MISMATCH" and not kept):
            status = result["status"] = "INCOMPLETE"
    if status == "PASS" and (result["findings"] or result["missing_context"]):
        raise Incomplete("PASS cannot contain unresolved findings or missing context.")
    if status == "MISMATCH" and (not result["findings"] or result["missing_context"]
            or any(f["certainty"] != "supported" for f in result["findings"])):
        raise Incomplete("MISMATCH requires supported findings and complete context.")
    return result


def clean_text(value):
    text = html.escape(str(value)).replace("\r", " ")
    for char in "\\`*_{}[]()#!|":
        text = text.replace(char, "\\" + char)
    return text


def publish(report, output, summary=None, secrets=()):
    # Redact strings recursively, preserving valid JSON even for unusual secret characters.
    def redact(value):
        if isinstance(value, str):
            for secret in secrets:
                if secret:
                    value = value.replace(secret, "[REDACTED]")
            return SECRET.sub("[REDACTED]", value)
        if isinstance(value, dict):
            return {k: redact(v) for k, v in value.items()}
        if isinstance(value, list):
            return [redact(v) for v in value]
        return value
    report = redact(report)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    lines = [f"# Spec-to-code review: {report['status']}", "", clean_text(report["summary"]), "",
             "Mode: " + clean_text(report["metadata"].get("mode", "pr")),
             "Head: " + clean_text(report["metadata"].get("head_sha", "unavailable")),
             "Body digest: " + clean_text(report["metadata"].get("body_digest", "unavailable")),
             "Model: " + clean_text(report.get("model", "unconfigured")), ""]
    if report["status"] == "PASS":
        lines += ["No mismatch detected within the reviewed scope. Human review and normal tests still apply.", ""]
    elif report["status"] == "NO_FINDINGS":
        lines += ["No mismatch detected in the visible scope, but the items under Missing context could not be verified "
                  "from the sent excerpts (DEV-197). Not a PASS; the human reviewer covers those items.", ""]
    for f in report.get("findings", []):
        requirement, code = f["requirement"], f["code"]
        lines += ["## " + clean_text(f["id"]),
                  "Requirement: " + clean_text(f"{requirement['path']}:{requirement['line']}"),
                  "> " + clean_text(requirement["quote"]), "",
                  "Code: " + clean_text(f"{code['path']}:{code['line']}"),
                  "> " + clean_text(code["quote"]), "", clean_text(f["explanation"]),
                  "Reviewer action: " + clean_text(f["suggestion"]), ""]
    lines += ["## Reviewed files"] + ["- " + clean_text(p) for p in report.get("reviewed_files", [])]
    lines += ["", "## Missing context"] + ["- " + clean_text(p) for p in report.get("missing_context", [])]
    lines += ["", "Record disposition, reviewed SHA, reviewer, evidence and follow-up run in the PR.",
              "This report is scoped evidence, not human approval.", ""]
    markdown = "\n".join(lines)
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "report.md").write_text(markdown, encoding="utf-8")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(markdown)


def report_usage(report, title, opener=None, ran_at=None):
    """DEV-144: send the run's token usage to the farmclub server for the admin cost page.

    Only runs that reached the model (usage present) are sent. Any failure prints one warning and
    never changes the review result, the published report or the exit code.
    """
    url, token = os.environ.get("SPEC_CHECK_USAGE_URL", ""), os.environ.get("SPEC_CHECK_USAGE_TOKEN", "")
    usage, meta = report.get("usage") or {}, report.get("metadata") or {}
    if not url or not token or not usage or "pr" not in meta:
        return False
    body = {
        "runKey": f"{os.environ.get('GITHUB_RUN_ID', '0')}-{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}-{meta.get('mode', 'pr')}",
        "prNumber": meta["pr"], "prTitle": str(title or "")[:300], "headSha": meta.get("head_sha", ""),
        "status": report["status"], "mode": meta.get("mode", "pr"), "model": report.get("model", ""),
        "inputTokens": usage.get("input_tokens", 0), "outputTokens": usage.get("output_tokens", 0),
        "runUrl": report.get("run_url", ""),
    }
    if ran_at:
        body["ranAt"] = ran_at
    req = request.Request(url, data=json.dumps(body).encode(), method="POST",
                          headers={"Content-Type": "application/json", "X-Spec-Check-Token": token})
    try:
        with (opener or request.build_opener(NoRedirect())).open(req, timeout=GITHUB_TIMEOUT) as response:
            response.read(MAX_RESPONSE)
        return True
    except (error.URLError, TimeoutError, OSError, ValueError):
        print("Warning: usage report to the admin cost page failed; the review result is unchanged.")
        return False


def scoped(result):
    """DEV-197: a model INCOMPLETE with no findings is NO_FINDINGS (exit 0): nothing contradicts the spec in the
    visible scope, only unverified context remains. Error-path INCOMPLETE (table, limit, access) stays exit 2."""
    if result["status"] == "INCOMPLETE" and not result["findings"]:
        return {**result, "status": "NO_FINDINGS"}
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", default=os.environ.get("GITHUB_EVENT_PATH"))
    parser.add_argument("--repo", default=".")
    parser.add_argument("--output", default=".artifacts/spec-check")
    parser.add_argument("--demo", choices=("mismatch", "matched"))
    args = parser.parse_args(argv)
    started = time.monotonic()
    key, model = os.environ.get("SPEC_CHECK_API_KEY", ""), os.environ.get("SPEC_CHECK_MODEL", "")
    token = os.environ.get("GH_READ_TOKEN", "")
    meta, usage, title = {"mode": f"demo-{args.demo}" if args.demo else "pr"}, {}, ""
    result = {"status": "INCOMPLETE", "summary": "Review did not complete.",
              "findings": [], "reviewed_files": [], "missing_context": []}
    try:
        event = json.loads(Path(args.event).read_text(encoding="utf-8"))
        meta.update(metadata(event))
        title = event.get("pull_request", {}).get("title", "")
        if not eligible(event):
            result.update(status="SKIPPED", summary="Ineligible PR (fork, bot or non-main target). Apply manual review.")
        else:
            if not key or not model:
                raise Incomplete("Configure SPEC_CHECK_API_KEY and SPEC_CHECK_MODEL in the protected spec-check environment.")
            check_current(event, token)
            context = collect(Path(args.repo), event, args.demo)
            meta = context["metadata"]
            prompt = Path(__file__).with_name("prompt.txt").read_text(encoding="utf-8")
            response, usage = model_review(context, prompt, key, model)
            validated = validate(response, context)
            check_current(event, token)
            result = scoped(validated)
    except (Incomplete, OSError, ValueError, TypeError, AttributeError, subprocess.TimeoutExpired) as exc:
        message = str(exc) if isinstance(exc, Incomplete) else "Review input or execution failed; inspect configuration and rerun."
        result.update(status="INCOMPLETE", summary=message, findings=[], missing_context=[message])
    report = {"schema_version": 1, **result, "metadata": meta, "model": model or "unconfigured",
              "prompt_version": PROMPT_VERSION, "usage": usage,
              "elapsed_seconds": round(time.monotonic() - started, 2),
              "run_url": os.environ.get("SPEC_CHECK_RUN_URL", "")}
    publish(report, args.output, os.environ.get("GITHUB_STEP_SUMMARY"), (key, token))
    report_usage(report, title)
    print(f"Spec-to-code: {report['status']}. See report artifacts.")
    return {"PASS": 0, "NO_FINDINGS": 0, "MISMATCH": 1, "INCOMPLETE": 2, "SKIPPED": 0}[report["status"]]


if __name__ == "__main__":
    sys.exit(main())
