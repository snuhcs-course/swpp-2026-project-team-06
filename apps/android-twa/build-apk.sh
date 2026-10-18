#!/usr/bin/env bash
# TWA release APK 빌드·서명 (DEV-33). 사용: ./build-apk.sh consumer
# 키스토어 비밀번호는 apksigner가 직접 묻는다(명령줄·환경 변수에 넣지 않는다).
set -euo pipefail

app="${1:-consumer}"
here="$(cd "$(dirname "$0")" && pwd)"
dir="$here/$app"
[ -f "$dir/twa-manifest.json" ] || { echo "없는 앱: $app" >&2; exit 1; }

sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
bt="$(ls -d "$sdk"/build-tools/* | sort -V | tail -1)"
keystore="${FARMCLUB_KEYSTORE:-$HOME/.farmclub/android/farmclub-release.keystore}"
alias_="$(node -p "require('$dir/twa-manifest.json').signingKey.alias")"
version="$(node -p "require('$dir/twa-manifest.json').appVersion")"
[ -f "$keystore" ] || { echo "키스토어가 없다: $keystore (README 참고)" >&2; exit 1; }

# Gradle 8.11 + AGP 8.9는 JDK 17~21에서 돈다
if [ -z "${JAVA_HOME:-}" ]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home -v 17)"
  export JAVA_HOME
fi
echo "sdk.dir=$sdk" > "$dir/local.properties"

(cd "$dir" && ./gradlew assembleRelease --no-daemon -q)

out="$dir/app/build/outputs/apk/release"
apk="$here/dist/farmclub-$app-$version.apk"
mkdir -p "$here/dist"
"$bt/zipalign" -f -p 4 "$out/app-release-unsigned.apk" "$out/app-release-aligned.apk"
"$bt/apksigner" sign --ks "$keystore" --ks-key-alias "$alias_" --out "$apk" "$out/app-release-aligned.apk"
"$bt/apksigner" verify --print-certs "$apk" | grep -E "SHA-256"
echo "완료: $apk"
echo "assetlinks.json의 sha256_cert_fingerprints에는 위 SHA-256을 두 자리마다 ':'로 끊어 대문자로 넣는다."
