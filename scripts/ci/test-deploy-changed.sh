#!/usr/bin/env bash
# scripts/ci/deploy-changed.sh·deploy-mark.sh 시나리오 테스트(DEV-139). 임시 bare 원격 + 작업 저장소로 돈다. 네트워크 없음.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
git init -q --bare "$tmp/origin.git"
git init -q "$tmp/work" && cd "$tmp/work"
git config user.name t; git config user.email t@example.invalid
git remote add origin "$tmp/origin.git"
commit() { mkdir -p "$(dirname "$1")"; echo "$2" > "$1"; git add -A; git commit -qm "$2"; git rev-parse HEAD; }
run() { # expect tag pattern
  out=$(GITHUB_EVENT_NAME=workflow_run "$here/deploy-changed.sh" "$2" "$3" 2>&1); got=$(printf '%s\n' "$out" | tail -1)
  if [ "$got" != "deploy=$1" ]; then echo "FAIL: expected deploy=$1 for '$4'"; echo "$out"; exit 1; fi
  echo "ok: $4"
}
TAG=deploy/test-app; PAT='^(apps/|packages/)'

commit apps/a.txt "app v1" >/dev/null; git push -q origin HEAD:main
run true "$TAG" "$PAT" "no tag yet → deploy"
"$here/deploy-mark.sh" "$TAG" >/dev/null
run false "$TAG" "$PAT" "head == deployed → skip"

commit docs/x.md "docs only" >/dev/null
run false "$TAG" "$PAT" "docs-only since deployed → skip"

c3=$(commit apps/b.txt "app v2")                 # 앱 커밋 X (CI 취소됐다고 치고 배포 안 함)
c4=$(commit docs/y.md "docs after app")          # 문서 커밋 Y의 CI 성공 → 예전 방식은 건너뛰었다
run true "$TAG" "$PAT" "app change two commits back, docs commit on top → deploy (the DEV-139 case)"
"$here/deploy-mark.sh" "$TAG" >/dev/null

git checkout -q "$c3"                              # 늦게 끝난 X의 실행이 돌아도
run false "$TAG" "$PAT" "head older than deployed → skip (no rollback)"
git checkout -q main 2>/dev/null || git checkout -q -

out=$(GITHUB_EVENT_NAME=workflow_dispatch "$here/deploy-changed.sh" "$TAG" "$PAT" | tail -1)
if [ "$out" = "deploy=true" ]; then echo "ok: manual run → deploy"; else echo "FAIL: manual"; exit 1; fi

o=$(mktemp); GITHUB_OUTPUT="$o" GITHUB_EVENT_NAME=workflow_run "$here/deploy-changed.sh" "$TAG" "$PAT" >/dev/null
if grep -q '^deploy=false$' "$o" && grep -q "^base=$c4$" "$o"; then echo "ok: GITHUB_OUTPUT has deploy and base"; else echo "FAIL: outputs"; cat "$o"; exit 1; fi
echo "all deploy-changed scenarios passed"
