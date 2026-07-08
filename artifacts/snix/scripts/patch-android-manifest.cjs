#!/usr/bin/env node
// Idempotently injects the AdMob App ID meta-data into
// android/app/src/main/AndroidManifest.xml.
//
// Why this exists: the Google Mobile Ads SDK requires this meta-data tag
// registered natively, in addition to the JS-side config in
// capacitor.config.ts. It cannot be set purely from JS/config, and
// `npx cap add android` / `npx cap sync` do NOT add it automatically.
// Skipping this step makes the app crash immediately on launch.
//
// Because the android/ folder is regenerated (not committed to this repo),
// run this script every time after `npx cap add android` or after deleting
// and re-adding the android platform — e.g. via `npm run sync:android`.
const fs = require("fs");
const path = require("path");

// Commented out — real SNIX AdMob App ID, not currently in use while ad
// units are set to Google's test IDs. Swap back in before a build that
// should earn real revenue.
// const APP_ID = "ca-app-pub-4975030890366420~9034721211";

// Google's official Android AdMob test App ID (safe to ship — always serves
// test creatives). See: https://developers.google.com/admob/android/test-ads
const APP_ID = "ca-app-pub-3940256099942544~3347511713";
const manifestPath = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "AndroidManifest.xml",
);

if (!fs.existsSync(manifestPath)) {
  console.log(
    "[patch-android-manifest] No android/ folder found yet — run `npx cap add android` first, then re-run this script.",
  );
  process.exit(0);
}

let xml = fs.readFileSync(manifestPath, "utf8");

if (xml.includes("com.google.android.gms.ads.APPLICATION_ID")) {
  console.log("[patch-android-manifest] AdMob App ID meta-data already present — nothing to do.");
  process.exit(0);
}

const metaDataTag = `        <meta-data\n            android:name="com.google.android.gms.ads.APPLICATION_ID"\n            android:value="${APP_ID}"/>\n`;

const appTagMatch = xml.match(/<application[^>]*>/);
if (!appTagMatch) {
  console.error(
    "[patch-android-manifest] Could not find <application> tag in AndroidManifest.xml — add the meta-data manually:\n" +
      metaDataTag,
  );
  process.exit(1);
}

const insertAt = appTagMatch.index + appTagMatch[0].length;
xml = xml.slice(0, insertAt) + "\n" + metaDataTag + xml.slice(insertAt);

fs.writeFileSync(manifestPath, xml, "utf8");
console.log("[patch-android-manifest] Inserted AdMob App ID meta-data into AndroidManifest.xml.");
