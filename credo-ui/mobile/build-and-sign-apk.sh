#!/usr/bin/env bash
# Build, sign and verify the Credentis release APK (same flow as the kiosk build-and-sign-apk.sh).
#
#   ./build-and-sign-apk.sh               # bump version, build, sign, verify
#   ./build-and-sign-apk.sh --no-bump     # keep the current versionCode/versionName
#   ./build-and-sign-apk.sh --install     # also adb install -r on the connected phone
#
# Signing uses android.keystore through the release signingConfig in android/app/build.gradle.
# The new APK must be signed with the same certificate as the last one in dist/, or phones
# cannot install it over the existing app.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "${YELLOW}\n==> $1${NC}\n"; }
die() { echo -e "${RED}$1${NC}" >&2; exit 1; }

INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    --no-bump) export SKIP_VERSION_BUMP=1 ;;
    *) die "Unknown option: $arg" ;;
  esac
done

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}"
BUILD_TOOLS="$(ls "$ANDROID_SDK_ROOT/build-tools" 2>/dev/null | sort -V | tail -1)"
APKSIGNER="$ANDROID_SDK_ROOT/build-tools/$BUILD_TOOLS/apksigner"
[[ -x "$APKSIGNER" ]] || die "apksigner not found under $ANDROID_SDK_ROOT/build-tools"
[[ -f android.keystore ]] || die "android.keystore is missing"

cert_of() { "$APKSIGNER" verify --print-certs "$1" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p'; }

step "Building release APK"
bash ./build-mobile.sh

APK="$(ls -t dist/credentis-*.apk | head -1)"
PREVIOUS_APK="$(ls -t dist/credentis-*.apk | grep -vxF "$APK" | head -1 || true)"

step "Verifying signature"
"$APKSIGNER" verify --verbose "$APK" | grep -E "Verifies|v1 scheme|v2 scheme" || die "APK signature verification failed"
NEW_CERT="$(cert_of "$APK")"
echo "  Certificate SHA-256: $NEW_CERT"

if [[ -n "$PREVIOUS_APK" ]]; then
  OLD_CERT="$(cert_of "$PREVIOUS_APK")"
  [[ "$OLD_CERT" == "$NEW_CERT" ]] || die "Signed with a different key than $PREVIOUS_APK; phones cannot upgrade."
  echo "  Same key as $(basename "$PREVIOUS_APK"): installs over the existing app"
fi

if [[ "$INSTALL" == "1" ]]; then
  step "Installing on connected device"
  command -v adb >/dev/null || die "adb not found"
  adb devices
  adb install -r "$APK"
fi

echo -e "${GREEN}\nSigned APK: $HERE/$APK${NC}"
