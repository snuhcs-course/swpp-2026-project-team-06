#!/usr/bin/env bash
# 배포 성공 뒤 이동 태그 deploy/<대상>을 HEAD로 옮긴다(DEV-139). scripts/ci/deploy-changed.sh 가 다음 실행의 기준으로 읽는다.
# 사용: scripts/ci/deploy-mark.sh <태그>   (워크플로의 GITHUB_TOKEN은 contents: write 가 필요)
set -euo pipefail
tag="${1:?usage: deploy-mark.sh <tag>}"
remote="${DEPLOY_REMOTE:-origin}"
git push --quiet --force "$remote" "HEAD:refs/tags/$tag"
echo "Marked $(git rev-parse --short HEAD) as deployed ($tag)."
