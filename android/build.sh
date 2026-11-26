#!/bin/bash
# Builds the Lumen APK with the current web app bundled inside.
#   ./build.sh            → app/build/outputs/apk/release/app-release.apk
# Needs: Android SDK (ANDROID_HOME), JDK 17+, and keystore.properties + the keystore for signing.
set -euo pipefail
cd "$(dirname "$0")"
WEB=app/src/main/assets/web
rm -rf "$WEB" && mkdir -p "$WEB"
cp -r ../public/. "$WEB/"
rm -f "$WEB/sw.js"                     # the app updates itself natively; no service worker needed
test -f "$WEB/version.json" || { echo "Run tools/release.js first"; exit 1; }
gradle --no-daemon -q --max-workers=1 assembleRelease
ls -la app/build/outputs/apk/release/*.apk
