#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-deeplink.sh
#
# Registers the snix:// URL scheme in AndroidManifest.xml so that Android
# Intent URIs from the bridge site (snixapp.pages.dev) can open the SNIX app
# directly from Chrome.
#
# Run this ONCE from the artifacts/snix/ directory after running
# `npx cap add android` (which generates the android/ folder):
#
#   cd artifacts/snix
#   bash scripts/setup-deeplink.sh
#
# After running, rebuild the APK:
#   npx cap sync android
#   npx cap open android   # then Build → Build APK in Android Studio
# ─────────────────────────────────────────────────────────────────────────────

set -e

MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST" ]; then
  echo "❌  $MANIFEST not found."
  echo "    Run 'npx cap add android' first, then re-run this script."
  exit 1
fi

if grep -q 'android:scheme="snix"' "$MANIFEST"; then
  echo "✅  snix:// scheme already registered in $MANIFEST — nothing to do."
  exit 0
fi

# Insert the intent filter just before the closing </activity> tag.
INTENT_FILTER='        <intent-filter>\n            <action android:name="android.intent.action.VIEW" \/>\n            <category android:name="android.intent.category.DEFAULT" \/>\n            <category android:name="android.intent.category.BROWSABLE" \/>\n            <data android:scheme="snix" \/>\n        <\/intent-filter>'

# BSD sed (macOS) and GNU sed (Linux) differ on in-place editing.
if sed --version 2>/dev/null | grep -q GNU; then
  sed -i "s|</activity>|${INTENT_FILTER}\n    </activity>|" "$MANIFEST"
else
  sed -i '' "s|</activity>|${INTENT_FILTER}\\
    </activity>|" "$MANIFEST"
fi

echo "✅  snix:// deep link scheme registered in $MANIFEST."
echo "    Run 'npx cap sync android' then rebuild the APK."
