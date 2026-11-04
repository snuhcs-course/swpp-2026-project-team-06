#!/usr/bin/env python3
"""폴더별 tasks.md를 이슈별 파일 <폴더>/tasks/<이슈 키>.md로 나눈다(DEV-219, ADR 0014).

기본은 dry-run: 만들 파일과 폴더별 절 개수만 출력하고 아무것도 쓰지 않는다.
  python3 scripts/split-tasks.py                 # 레포의 모든 tasks.md 계획 출력
  python3 scripts/split-tasks.py server apps/consumer   # 일부 폴더만
  python3 scripts/split-tasks.py --apply         # 실제로 쓴다(승인 뒤에만)
  python3 /tmp/split-tasks.py --only DEV-216 --apply   # 분리 전에 연 PR: main 병합 전에 내 절만 꺼낸다
    (스크립트는 git show origin/main:scripts/split-tasks.py > /tmp/split-tasks.py 로 받는다)

규칙
- `## DEV-123 …`/`## SWPP-45 …` 절(코드 블록 안 제외)을 그 줄부터 다음 `## ` 직전까지 바이트 그대로 옮긴다.
- 같은 폴더에 같은 키 절이 여러 개면 원래 순서대로 한 파일에 이어 붙인다(사이에 아무것도 넣지 않는다).
- 키 없는 `## ` 절과 첫 `## ` 앞 머리말은 tasks.md(목록)에 그대로 남긴다.
- 키 있는 절이 하나도 없는 tasks.md(단일 이슈 형식)는 건드리지 않는다.
- tasks.md에는 원래 `## ` 제목 줄을 그대로 두고 아래에 새 파일 링크 한 줄을 단다 → 옛 `tasks.md#dev-xx` 앵커가 유지된다.
- 다시 돌려도 안전하다: 이미 링크만 남은 절은 건너뛰고, 그 뒤에 새로 붙은 절만 옮긴다(열린 PR이 main 병합 뒤 돌리는 경우).
  이때 목록(tasks.md)에는 줄을 더하지 않아, 결과적으로 그 PR의 tasks.md 변경이 사라진다.
  옮길 대상 파일이 이미 있으면 내용을 덮어쓰지 않고 끝에 이어 붙인다(같은 키 절을 두 번 옮기지 않도록 이미 들어 있으면 건너뜀).
"""
import argparse, re, subprocess, sys
from pathlib import Path

KEY = re.compile(r"## ((?:DEV|SWPP)-\d+)\b", re.I)
FENCE = re.compile(r"\s*(```|~~~)")
MARK = "<!-- split-tasks: DEV-219 -->"
OLD_RULE = "이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다.\n"  # 옛 템플릿 문장
NOTE = (MARK + "\n> 이슈별 작업 기록은 `tasks/<이슈 키>.md`에 있다(ADR 0014). 새 이슈는 여기 절을 추가하지 말고 "
        "`tasks/<이슈 키>.md`를 새로 만든다. 아래 목록은 분리 시점 기록이며 더 고치지 않는다.\n\n")


def link(key):
    return f"→ [tasks/{key}.md](tasks/{key}.md)"


def split(text):
    """(머리말, [절 텍스트…]). 이어 붙이면 원문과 바이트가 같다."""
    lines = text.splitlines(keepends=True)
    starts, fence = [], None
    for i, line in enumerate(lines):
        m = FENCE.match(line)
        if m:
            fence = None if fence == m[1] else (fence or m[1])
        elif fence is None and line.startswith("## "):
            starts.append(i)
    if not starts:
        return text, []
    bounds = starts + [len(lines)]
    head = "".join(lines[:starts[0]])
    return head, ["".join(lines[a:b]) for a, b in zip(bounds, bounds[1:])]


def is_stub(section, key):
    body = section.split("\n", 1)[1] if "\n" in section else ""
    return body.strip() == link(key)


def plan_only(path, keys, base):
    """--only: 이 키 절만 꺼내고 tasks.md의 나머지는 손대지 않는다(분리 전 브랜치에서 main 병합 전에 쓴다)."""
    text = path.read_text(encoding="utf-8")
    head, sections = split(text)
    files, rest = {}, [head]
    for s in sections:
        m = KEY.match(s)
        if m and m[1].upper() in keys and not is_stub(s, m[1].upper()):
            files.setdefault(m[1].upper(), []).append(s)
        else:
            rest.append(s)
    index = "".join(rest)
    if base is not None and index.rstrip() == base.rstrip():
        index = base  # 끝 빈 줄까지 merge-base와 같게 → main 병합 때 tasks.md 충돌이 없다
    st = {"lines": text.count("\n"), "sections": len(sections), "moved": sum(map(len, files.values())), "stubs": 0, "unkeyed": 0}
    return (text, files, index, st) if files else None


def plan(path):
    text = path.read_text(encoding="utf-8")
    head, sections = split(text)
    assert head + "".join(sections) == text, f"round-trip failed: {path}"
    keyed = [(KEY.match(s), s) for s in sections]
    if not any(m for m, _ in keyed):
        return None
    rerun = MARK in head  # 이미 분리된 목록: 새로 붙은 절은 옮기기만 하고 목록에 줄을 더하지 않는다(목록 충돌 방지)
    if not rerun:
        head = head.replace(OLD_RULE, "")
        head = head.rstrip("\n") + "\n\n" + NOTE if head.strip() else NOTE
    files, index, stats = {}, [head], \
        {"lines": text.count("\n"), "sections": len(sections), "moved": 0, "stubs": 0, "unkeyed": 0}
    for m, s in keyed:
        if not m:
            stats["unkeyed"] += 1
            index.append(s)
            continue
        key = m[1].upper()
        if is_stub(s, key):
            stats["stubs"] += 1
            index.append(s)
            continue
        stats["moved"] += 1
        files.setdefault(key, []).append(s)
        if not rerun:
            heading = s.split("\n", 1)[0]
            index.append(f"{heading}\n\n{link(key)}\n\n")
    return text, files, "".join(index).rstrip() + "\n", stats


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folders", nargs="*", help="대상 폴더(레포 루트 기준). 없으면 전체")
    ap.add_argument("--apply", action="store_true", help="실제로 쓴다. 없으면 dry-run")
    ap.add_argument("--only", action="append", default=[], metavar="KEY",
                    help="이 이슈 키 절만 tasks/<KEY>.md로 꺼낸다(여러 번 가능). 목록·머리말은 그대로 두고, "
                         "결과가 origin/main과의 merge-base 내용과 같으면 그 바이트로 맞춘다. 분리 전 열린 PR용")
    args = ap.parse_args()
    root = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
    tracked = subprocess.run(["git", "ls-files", "-z", "--", "tasks.md", "*/tasks.md"], cwd=root,
                             capture_output=True, text=True, check=True).stdout.split("\0")
    paths = sorted(root / p for p in tracked if p)
    if args.folders:
        want = {str(Path(f).as_posix()).strip("/") or "." for f in args.folders}
        paths = [p for p in paths if (p.parent.relative_to(root).as_posix() or ".") in want]
    total = {"folders": 0, "lines": 0, "moved": 0, "files": 0, "dups": 0, "unkeyed": 0, "skipped": 0}
    print(f"{'폴더':<36} {'줄':>5} {'절':>4} {'옮김':>4} {'파일':>4} {'중복키':>5} {'키없음':>5}  가장 큰 새 파일(줄)")
    for path in paths:
        rel = path.parent.relative_to(root).as_posix() or "."
        if args.only:
            mb = subprocess.run(["git", "merge-base", "HEAD", "origin/main"], cwd=root, capture_output=True, text=True).stdout.strip()
            shown = subprocess.run(["git", "show", f"{mb}:{path.relative_to(root).as_posix()}"], cwd=root,
                                   capture_output=True, text=True) if mb else None
            result = plan_only(path, {k.upper() for k in args.only}, shown.stdout if shown and shown.returncode == 0 else None)
            if result is None:
                continue
        else:
            result = plan(path)
        if result is None:
            total["skipped"] += 1
            print(f"{rel:<36} {'—':>5}  키 있는 `## ` 절 없음(단일 이슈 형식) → 그대로 둠")
            continue
        text, files, index, st = result
        dups = {k: len(v) for k, v in files.items() if len(v) > 1}
        biggest = max(files.items(), key=lambda kv: sum(s.count("\n") for s in kv[1]), default=None)
        big = f"{biggest[0]}({sum(s.count(chr(10)) for s in biggest[1])})" if biggest else "-"
        print(f"{rel:<36} {st['lines']:>5} {st['sections']:>4} {st['moved']:>4} {len(files):>4} {len(dups):>5} {st['unkeyed']:>5}  {big}"
              + (f"  [이미 분리된 절 {st['stubs']}]" if st["stubs"] else ""))
        if dups:
            print(f"{'':<36} 중복 키(한 파일로 합침): " + ", ".join(f"{k}×{n}" for k, n in sorted(dups.items())))
        total["folders"] += 1; total["lines"] += st["lines"]; total["moved"] += st["moved"]
        total["files"] += len(files); total["dups"] += len(dups); total["unkeyed"] += st["unkeyed"]
        if args.apply and files:
            out = path.parent / "tasks"
            out.mkdir(exist_ok=True)
            for key, parts in files.items():
                target = out / f"{key}.md"
                old = target.read_text(encoding="utf-8") if target.exists() else ""
                new = old + "".join(p for p in parts if p not in old)
                target.write_text(new, encoding="utf-8")
            path.write_text(index, encoding="utf-8")
    print(f"\n합계: 폴더 {total['folders']}개(그대로 {total['skipped']}개), {total['lines']}줄, 옮길 절 {total['moved']}개 → "
          f"새 파일 {total['files']}개, 중복 키 {total['dups']}개, 키 없는 절 {total['unkeyed']}개(목록에 남김)")
    print("적용함" if args.apply else "dry-run: 아무것도 쓰지 않음. 적용은 --apply")


if __name__ == "__main__":
    sys.exit(main())
