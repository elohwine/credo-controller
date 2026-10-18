#!/usr/bin/env bash
# Build a signed release APK for the Credentis mobile app.
#
# Steps:
#   1. Resolve the public API URL: explicit NEXT_PUBLIC_API_URL or the deployed Fly API.
#   2. Bump versionCode (+1) and versionName (patch) in android/app/build.gradle.
#   3. next build (static export to out/) with NEXT_PUBLIC_API_URL baked in.
#   4. npx cap sync android
#   5. ./gradlew assembleRelease (signing config already points at android.keystore).
#   6. Print the APK path.
#
# Usage:
#   npm run android:release
#   NEXT_PUBLIC_API_URL=https://api.example.com npm run android:release   # explicit override
#   SKIP_VERSION_BUMP=1 npm run android:release                           # keep current versionCode/versionName

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

GRADLE_FILE="android/app/build.gradle"

log() { printf '\n\033[1;36m[build-mobile]\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m[build-mobile] %s\033[0m\n' "$*" >&2; exit 1; }

# ── 1. Resolve API URL ───────────────────────────────────────────────────────
API_URL="${NEXT_PUBLIC_API_URL:-https://credentis.fly.dev}"
log "Using API: $API_URL"
[[ "$API_URL" == https://* ]] || die "API URL must be https:// for the native build (got: $API_URL)"
case "$API_URL" in
  *localhost*|*127.0.0.1*) die "API URL must not be a loopback address (got: $API_URL)";;
esac
API_URL="${API_URL%/}"
export NEXT_PUBLIC_API_URL="$API_URL"

# Make sure the webview may navigate to this host (OpenID4VC links, QR fallbacks).
API_HOST="$(python3 -c 'import sys;from urllib.parse import urlparse;print(urlparse(sys.argv[1]).hostname)' "$API_URL")"
if ! grep -q "$API_HOST" capacitor.config.json && ! grep -q "\*\.${API_HOST#*.}" capacitor.config.json; then
  log "WARNING: $API_HOST is not covered by capacitor.config.json server.allowNavigation"
fi

# ── 2. Version bump ──────────────────────────────────────────────────────────
if [[ "${SKIP_VERSION_BUMP:-0}" != "1" ]]; then
  CUR_CODE="$(grep -E '^\s*versionCode\s+[0-9]+' "$GRADLE_FILE" | head -1 | awk '{print $2}')"
  CUR_NAME="$(grep -E '^\s*versionName\s+"' "$GRADLE_FILE" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"
  NEW_CODE=$((CUR_CODE + 1))
  IFS='.' read -r MAJ MIN PAT _REST <<<"${CUR_NAME}.0.0"
  MAJ="${MAJ:-1}"; MIN="${MIN:-0}"; PAT="${PAT:-0}"
  [[ "$PAT" =~ ^[0-9]+$ ]] || PAT=0
  NEW_NAME="${MAJ}.${MIN}.$((PAT + 1))"
  sed -i -E "s/^(\s*versionCode\s+)[0-9]+/\1${NEW_CODE}/" "$GRADLE_FILE"
  sed -i -E "s/^(\s*versionName\s+)\"[^\"]+\"/\1\"${NEW_NAME}\"/" "$GRADLE_FILE"
  log "Version: ${CUR_NAME} (${CUR_CODE}) -> ${NEW_NAME} (${NEW_CODE})"
else
  NEW_CODE="$(grep -E '^\s*versionCode\s+[0-9]+' "$GRADLE_FILE" | head -1 | awk '{print $2}')"
  NEW_NAME="$(grep -E '^\s*versionName\s+"' "$GRADLE_FILE" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"
  log "Version unchanged: ${NEW_NAME} (${NEW_CODE})"
fi

# ── 3. Web build ─────────────────────────────────────────────────────────────
log "next build (NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL)"
rm -rf out .next
# A stray project copy under pages/ (node_modules, android, ...) would be compiled as pages and blow the heap.
for stray in pages/*/node_modules pages/*/android; do
  [[ -e "$stray" ]] && die "Unexpected '$stray' inside pages/. Move that folder out of pages/ before building."
done
NODE_ENV=production NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}" npx next build

# ── 4. Capacitor sync ────────────────────────────────────────────────────────
log "cap sync android"
npx cap sync android

# ── 5. Gradle release build ──────────────────────────────────────────────────
# The kiosk app already unpacked Gradle 8.11.1 under the user Gradle home.
# Point the wrapper there so a phone build does not download it again.
LOCAL_GRADLE_HOME="${GRADLE_HOME_LOCAL:-$HOME/.gradle}"
if [[ -x "$LOCAL_GRADLE_HOME/wrapper/dists/gradle-8.11.1-all/2qik7nd48slq1ooc2496ixf4i/gradle-8.11.1/bin/gradle" ]]; then
  export GRADLE_USER_HOME="$LOCAL_GRADLE_HOME"
  log "Using Gradle 8.11.1 already installed at $GRADLE_USER_HOME"
else
  log "Local Gradle 8.11.1 not found; the wrapper will download it"
fi
log "gradlew assembleRelease"
pushd android >/dev/null
chmod +x ./gradlew
# Same invocation as the kiosk build-and-sign-apk.sh. GRADLE_USER_HOME above
# is the home that already holds the unpacked 8.11.1 distribution.
./gradlew assembleRelease || { echo "Gradle build failed"; exit 1; }
popd >/dev/null

APK="$(ls -t android/app/build/outputs/apk/release/*.apk 2>/dev/null | head -1)"
[[ -n "$APK" ]] || die "Build finished but no APK found under android/app/build/outputs/apk/release"

OUT_DIR="dist"
mkdir -p "$OUT_DIR"
OUT_APK="$OUT_DIR/credentis-${NEW_NAME}-${NEW_CODE}.apk"
cp "$APK" "$OUT_APK"

log "APK ready"
echo "  API URL : $NEXT_PUBLIC_API_URL"
echo "  Version : $NEW_NAME ($NEW_CODE)"
echo "  APK     : $HERE/$OUT_APK"
