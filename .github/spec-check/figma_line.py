"""DEV-88 PR 본문 Figma 줄 검사. 화면 경로가 바뀐 PR은 `Figma:` 줄 하나를 정해진 형식으로 적어야 한다.

결정적 검사다. 모델·네트워크를 쓰지 않고 표준 라이브러리만 쓴다.
"""
import fnmatch
import json
import os
from pathlib import Path
import re
import subprocess
import sys

# 화면 모양·문구에 닿는 경로. 테스트·문서·설정 파일(점 파일, *.md, package.json, vercel.json)은 뺀다.
SCREEN_GLOBS = ("apps/*/src/*", "packages/ui/src/*", "scripts/admin-web/*")
SKIP_RE = re.compile(r"(^|/)(__tests__/|[^/]+\.(test|spec)\.[^/]+$|\.[^/]+$|[^/]+\.md$|package\.json$|vercel\.json$)")

# 대소문자·굵게(`**Figma:**`, `**Figma**:`)는 가리지 않는다.
LINE_RE = re.compile(r"^\s*(?:[-*]\s+)?(?:\*\*|__)?figma(?:\*\*|__)?\s*:(?:\*\*|__)?(.*)$",
                     re.MULTILINE | re.IGNORECASE)
VALUE_RE = re.compile(r"^\s*(반영함|해당 없음|후속)(?:\s*[—–:-]\s*|\s+)(.*)$")
COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
FIGMA_URL_RE = re.compile(r"https://(?:www\.)?figma\.com/\S+")
NODE_ID_RE = re.compile(r"\b\d+:\d+\b")
ISSUE_RE = re.compile(r"\bDEV-\d+\b")

USAGE = ("PR 본문에 다음 중 하나를 한 줄로 적는다: "
         "`Figma: 반영함 — <Figma 링크 또는 node-id>` / "
         "`Figma: 해당 없음 — <이유>` / `Figma: 후속 — DEV-xx`")


def screen_files(paths):
    """바뀐 파일 중 Figma 확인 대상만 고른다."""
    return [p for p in paths
            if any(fnmatch.fnmatchcase(p, g) for g in SCREEN_GLOBS) and not SKIP_RE.search(p)]


def check_body(body):
    """본문의 Figma 줄을 검사한다. 맞으면 (값, 내용), 틀리면 ValueError."""
    lines = LINE_RE.findall(COMMENT_RE.sub("", body or ""))
    if not lines:
        raise ValueError("Figma 줄이 없다.")
    if len(lines) > 1:
        raise ValueError(f"Figma 줄이 {len(lines)}개다. 하나만 남긴다.")
    if not lines[0].strip():
        raise ValueError("Figma 줄이 비어 있다. 반영함/해당 없음/후속 중 하나를 적는다.")
    match = VALUE_RE.match(lines[0].strip() + " ")
    if not match:
        raise ValueError(f"Figma 값이 반영함/해당 없음/후속 중 하나가 아니다: `{lines[0].strip()}`")
    value, rest = match.group(1), match.group(2).strip()
    if not rest or re.fullmatch(r"<[^>]*>", rest):
        raise ValueError(f"`Figma: {value}` 뒤가 비어 있다.")
    if value == "반영함" and not (FIGMA_URL_RE.search(rest) or NODE_ID_RE.search(rest)):
        raise ValueError("`반영함` 뒤에 Figma 링크(https://www.figma.com/…)나 node-id(예: 343:5945)가 없다.")
    if value == "후속" and not ISSUE_RE.search(rest):
        raise ValueError("`후속` 뒤에 Linear 이슈 키(DEV-숫자)가 없다.")
    return value, rest


def evaluate(body, changed):
    """(성공 여부, 요약 문장)."""
    targets = screen_files(changed)
    if not targets:
        return True, "화면 경로 변경 없음. Figma 줄 검사를 건너뛴다."
    shown = ", ".join(f"`{p}`" for p in targets[:5]) + (f" 외 {len(targets) - 5}개" if len(targets) > 5 else "")
    try:
        value, rest = check_body(body)
    except ValueError as exc:
        return False, f"FAIL: 화면 경로가 바뀌었다({shown}). {exc} {USAGE}"
    return True, f"PASS: Figma: {value} — {rest} (화면 경로 {len(targets)}개)"


def changed_files(root="."):
    # checker-tests처럼 GitHub test-merge 커밋을 checkout한다. 첫 부모(base)와의 차이가 PR 변경이다.
    out = subprocess.run(["git", "-C", root, "diff", "--name-only", "--no-renames", "HEAD^1", "HEAD"],
                         check=True, capture_output=True, text=True).stdout
    return [line for line in out.splitlines() if line]


def main():
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    body = event["pull_request"].get("body") or ""
    ok, summary = evaluate(body, changed_files())
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as fh:
            fh.write(f"### Figma 줄 검사 (DEV-88)\n\n{summary}\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
