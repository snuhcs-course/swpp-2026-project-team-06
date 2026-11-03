#!/usr/bin/env bash
# 배포 워크플로의 변경 감지(DEV-139). "마지막으로 배포한 커밋"(이동 태그 deploy/<대상>)과 HEAD 사이에
# 배포 대상 경로가 바뀌었는지 본다. HEAD~1만 보던 예전 방식은 앱 커밋 X의 CI가 취소·실패하고
# 뒤 커밋 Y(문서만)의 CI가 성공하면 X를 영영 건너뛰었다(DEV-94, DEV-33 #270).
#
# 사용: scripts/ci/deploy-changed.sh <태그> <경로 정규식>
#   예: scripts/ci/deploy-changed.sh deploy/vercel-consumer '^(apps/|packages/)'
# 출력: 표준 출력에 사람용 로그, $GITHUB_OUTPUT(있으면)에 deploy=true|false, base=<sha|->.
# 규칙:
#   - workflow_dispatch(수동)면 항상 배포.
#   - 태그가 없으면 기준을 모르는 것이므로 배포한다(안전한 쪽).
#   - HEAD가 이미 배포한 커밋이거나 그보다 오래된 커밋이면 건너뛴다(늦게 끝난 옛 CI가 되돌리지 않게).
#   - 그 밖에는 git diff <base> HEAD 에 정규식이 걸리면 배포.
# 배포에 성공한 뒤에는 scripts/ci/deploy-mark.sh <태그> 로 태그를 HEAD로 옮긴다.
set -euo pipefail

tag="${1:?usage: deploy-changed.sh <tag> <path-regex>}"
pattern="${2:?usage: deploy-changed.sh <tag> <path-regex>}"
remote="${DEPLOY_REMOTE:-origin}"

head=$(git rev-parse HEAD)
short=$(git rev-parse --short HEAD)

emit() { # deploy base reason
  echo "$3"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf 'deploy=%s\nbase=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"
  fi
  echo "deploy=$1"
}

# 태그를 항상 원격에서 새로 받는다(체크아웃은 태그를 안 가져올 수 있고, 다른 실행이 방금 옮겼을 수 있다).
git fetch --quiet --force "$remote" "refs/tags/$tag:refs/tags/$tag" 2>/dev/null || true
base=$(git rev-parse -q --verify "refs/tags/$tag^{commit}" 2>/dev/null || true)
baseshort=${base:+$(git rev-parse --short "$base")}
# 첫 줄은 항상 비교 범위: 배포 확인 때 이 줄과 마지막 줄(Deploying/Skipping)만 읽으면 된다(pr-review 스킬 4장).
echo "Comparing ${baseshort:-none}..$short ($tag, event ${GITHUB_EVENT_NAME:-local})"

if [ "${GITHUB_EVENT_NAME:-}" = "workflow_dispatch" ]; then
  emit true "${base:--}" "Manual run: deploying $short (tag $tag ignored)."
  exit 0
fi
if [ -z "$base" ]; then
  emit true - "No $tag tag yet: deploying $short without a base."
  exit 0
fi
if [ "$base" = "$head" ]; then
  emit false "$base" "$short is already deployed ($tag). Skipping."
  exit 0
fi
if git merge-base --is-ancestor "$head" "$base" 2>/dev/null; then
  emit false "$base" "$short is older than the deployed $baseshort ($tag). Skipping so a late run does not roll back."
  exit 0
fi
if ! git merge-base --is-ancestor "$base" "$head" 2>/dev/null; then
  emit true "$base" "Deployed $baseshort ($tag) is not an ancestor of $short (history rewritten?). Deploying to be safe."
  exit 0
fi

changed=$(git diff --name-only "$base" "$head")
printf '%s\n' "$changed" | sed 's/^/  /'
if printf '%s\n' "$changed" | grep -qE "$pattern"; then
  emit true "$base" "Deploying $short: matching changes since $baseshort."
else
  emit false "$base" "No matching changes in $baseshort..$short. Skipping the deploy."
fi
