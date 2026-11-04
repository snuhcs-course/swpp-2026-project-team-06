"""PR 본문의 Spec ↔ Code 확인 표를 spec-check가 읽을 수 있는지 점검한다(DEV-80).

작업 기록은 이슈 파일 `<폴더>/tasks/DEV-123.md`(DEV-219) 또는 옛 형식 `<폴더>/tasks.md#dev-123`.

모델·키·네트워크 없이 `.github/spec-check/check.py`의 파서를 그대로 쓴다.
사용: python3 .agents/skills/pr-context/check_table.py <본문 파일> [head ref, 기본 HEAD]
레포 루트에서 실행한다. 문제가 있으면 목록을 출력하고 exit 1.
"""
import re, subprocess, sys
from pathlib import PurePosixPath
sys.path.insert(0, ".github/spec-check")
import check

body = open(sys.argv[1], encoding="utf-8").read()
head = sys.argv[2] if len(sys.argv) > 2 else "HEAD"
git = lambda *a: subprocess.run(["git", *a], capture_output=True, text=True).stdout
try:
    specs, impl, task, key = check.author_mapping(body)
    base = git("merge-base", "origin/main", head).strip()
    changed = [p for p in git("diff", "--name-only", "--no-renames", base, head).splitlines() if p]
    problems = []
    text = git("show", f"{head}:{task}")
    if check.task_file_key(task):  # DEV-219: 이슈 파일 하나가 작업 기록
        first = next((l for l in text.splitlines() if l.startswith("#")), "")
        if not text:
            problems.append(f"작업 기록 파일 {task}이 {head}에 없음(커밋했는지 확인)")
        elif not re.match(r"#+ " + re.escape(key) + r"\b", first, re.I):
            problems.append(f"{task}의 첫 제목 줄에 이슈 키 {key}가 없음: {first or '(제목 없음)'}")
    elif not re.search(r"^## " + re.escape(key) + r"\b", text, re.M | re.I):
        problems.append(f"{task}에 '## {key}' 섹션이 없음")
    else:
        sibling = str(PurePosixPath(task).parent / "tasks" / f"{key.upper()}.md")
        if git("ls-tree", head, "--", sibling):
            problems.append(f"{task}은 분리된 색인이다. 작업 기록 줄을 `{sibling}`로 고친다(DEV-219)")
    problems += [f"표 1·2열에 없는 변경 파일: {p}" for p in sorted(set(changed) - specs - impl - {task})]
    for p in sorted(specs | impl):
        entry = git("ls-tree", head, "--", p) or git("ls-tree", base, "--", p)
        if not entry:
            problems.append(f"backtick 값이 파일이 아님(함수 이름 등): {p}")
        elif not entry.startswith(("100644", "100755")):
            problems.append(f"폴더·심링크 경로(파일 경로만 적는다, DEV-199): {p}")
    for p in changed:
        try:
            check.safe_path(p)
        except check.Incomplete:
            problems.append(f"checker가 읽지 않는 경로(.env* 등): {p} → 자동 검사 INCOMPLETE, 사람 리뷰로 대체")
except check.Incomplete as exc:
    problems = [str(exc)]
print("\n".join("- " + p for p in problems) or "OK: spec-check가 읽을 수 있는 표")
sys.exit(1 if problems else 0)
