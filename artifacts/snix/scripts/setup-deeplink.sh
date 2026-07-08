#!/usr/bin/env bash
# setup-deeplink.sh
# Registers the snix:// custom URI scheme in the Capacitor Android manifest
# so the OS can route snix:// links back into the app.
#
# Run after `npx cap add android` or `npx cap sync android`, from the
# artifacts/snix directory:
#   bash scripts/setup-deeplink.sh
#
# Safe to re-run: the intent-filter is only inserted once (idempotent).

set -euo pipefail

MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST" ]; then
  echo "setup-deeplink.sh: AndroidManifest.xml not found at $MANIFEST — skipping."
  echo "  Run 'npx cap add android' first."
  exit 0
fi

# Check if the intent-filter is already present to stay idempotent.
if grep -q 'android:scheme="snix"' "$MANIFEST"; then
  echo "setup-deeplink.sh: snix:// scheme already registered — nothing to do."
  exit 0
fi

# Insert the deep-link intent-filter just before </activity>.
# The sed pattern targets the last </activity> tag in the file.
python3 - "$MANIFEST" <<'PYEOF'
import sys, re

path = sys.argv[1]
with open(path, "r") as f:
    content = f.read()

intent_filter = '''
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="snix" />
        </intent-filter>'''

# Insert before the last </activity> closing tag.
content_new = content.replace("</activity>", intent_filter + "\n    </activity>", 1)

if content_new == content:
    print("setup-deeplink.sh: could not locate </activity> tag — manifest unchanged.")
    sys.exit(1)

with open(path, "w") as f:
    f.write(content_new)

print("setup-deeplink.sh: snix:// deep link scheme registered successfully.")
PYEOF
