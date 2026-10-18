#!/usr/bin/env bash
# twa-manifest.json → Gradle 프로젝트 다시 생성 (DEV-33). 사용: ./generate.sh consumer
# bubblewrap CLI는 JDK 17·sdkmanager를 요구해서, 생성만 하는 @bubblewrap/core를 임시 폴더에 받아 쓴다.
set -euo pipefail

app="${1:-consumer}"
here="$(cd "$(dirname "$0")" && pwd)"
dir="$here/$app"
[ -f "$dir/twa-manifest.json" ] || { echo "없는 앱: $app" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
npm install --silent --no-save --prefix "$tmp" @bubblewrap/core@1.27.0

BW_CORE="$tmp/node_modules/@bubblewrap/core" node - "$dir" <<'JS'
const path = require('path');
const core = require(process.env.BW_CORE);
(async () => {
  const dir = path.resolve(process.argv[2]);
  const manifest = await core.TwaManifest.fromFile(path.join(dir, 'twa-manifest.json'));
  const error = manifest.validate();
  if (error) throw new Error(error);
  await new core.TwaGenerator().createTwaProject(dir, manifest, new core.ConsoleLog('generate'));
})().catch((e) => { console.error(e); process.exit(1); });
JS
echo "생성 완료: $dir"
