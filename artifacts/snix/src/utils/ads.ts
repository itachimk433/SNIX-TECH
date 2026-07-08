// AdMob integration (native only — no-ops harmlessly on web).
//
// IMPORTANT — required native setup before this can be enabled on-device:
// The Google Mobile Ads SDK requires the AdMob App ID to be registered
// natively, in addition to this JS-side config. Without it, the app
// crashes immediately on launch (this happened once already — see git
// history "Fix crash-on-launch"). This repo does not contain generated
// android/ios native project folders, so whoever builds the native app
// (e.g. `npx cap add android && npx cap sync`) MUST also do this:
//
//   Android — add to android/app/src/main/AndroidManifest.xml inside <application>:
//     <meta-data
//       android:name="com.google.android.gms.ads.APPLICATION_ID"
//       android:value="ca-app-pub-4975030890366420~9034721211"/>
//
//   iOS — add to ios/App/App/Info.plist:
//     <key>GADApplicationIdentifier</key>
//     <string>ca-app-pub-4975030890366420~9034721211</string>
//
// Do this BEFORE the first native build/rebuild after adding this plugin,
// or the app will crash on open again.
const ADS_ENABLED = true;

// SNIX production AdMob IDs (from the AdMob console — real revenue-earning
// units, not test IDs). App ID above must match the "SNIX" app in AdMob.
// Commented out while we use Google's official test ad units below — swap
// this back in (and flip AD_IDS to PROD_IDS) before shipping a build that
// should earn real revenue.
// const PROD_IDS = {
//   android: {
//     appId: "ca-app-pub-4975030890366420~9034721211",
//     interstitial: "ca-app-pub-4975030890366420/9008846657",
//     rewarded: "REPLACE_WITH_REAL_ANDROID_REWARDED_UNIT_ID",
//   },
//   // No separate iOS ad units created yet — reuse Android's until iOS units
//   // exist in the AdMob console (ads simply won't be requested with a wrong
//   // platform's unit ID, so this is a safe placeholder, not a real fallback).
//   ios: {
//     appId: "ca-app-pub-4975030890366420~9034721211",
//     interstitial: "ca-app-pub-4975030890366420/9008846657",
//     rewarded: "REPLACE_WITH_REAL_IOS_REWARDED_UNIT_ID",
//   },
// };

// Google's official AdMob test ad units (safe to ship — they always serve
// test creatives and never earn/cost real money, so they can't get the
// AdMob account flagged for invalid traffic during development/testing).
// See: https://developers.google.com/admob/android/test-ads
const TEST_IDS = {
  android: {
    appId: "ca-app-pub-3940256099942544~3347511713",
    interstitial: "ca-app-pub-3940256099942544/1033173712",
    rewarded: "ca-app-pub-3940256099942544/5224354917",
    banner: "ca-app-pub-3940256099942544/6300978111",
  },
  ios: {
    appId: "ca-app-pub-3940256099942544~1458002511",
    interstitial: "ca-app-pub-3940256099942544/4411468910",
    rewarded: "ca-app-pub-3940256099942544/1712485313",
    banner: "ca-app-pub-3940256099942544/2934735716",
  },
};

const AD_IDS = TEST_IDS;

let admobModule: any = null;
let initialized = false;
let initFailed = false;

// ─── Banner height tracking ──────────────────────────────────────────────────
// Subscribers receive the exact pixel height of the rendered native banner so
// the web layout can reserve that precise amount of space (instead of a
// hardcoded estimate), making the banner appear inline below content rather
// than floating over it.
type BannerHeightCb = (px: number) => void;
const bannerHeightCallbacks: BannerHeightCb[] = [];
let currentBannerHeightPx = 0;

/** Subscribe to banner height changes. Returns an unsubscribe function.
 *  If the banner is already visible the callback fires immediately. */
export function onBannerHeight(cb: BannerHeightCb): () => void {
  bannerHeightCallbacks.push(cb);
  if (currentBannerHeightPx > 0) cb(currentBannerHeightPx);
  return () => {
    const i = bannerHeightCallbacks.indexOf(cb);
    if (i !== -1) bannerHeightCallbacks.splice(i, 1);
  };
}

function emitBannerHeight(px: number) {
  currentBannerHeightPx = px;
  bannerHeightCallbacks.forEach(cb => cb(px));
}

// ─── Debug state ────────────────────────────────────────────────────────────
// Lightweight in-memory snapshot of AdMob health, surfaced via the hidden
// debug panel in Settings (tap the SNIX logo 5x) so ad issues can be
// diagnosed on-device without pulling a logcat.
export interface AdDebugState {
  enabled: boolean;
  native: boolean;
  initFailed: boolean;
  initialized: boolean;
  interstitialLoaded: boolean;
  rewardedLoaded: boolean;
  lastEvent: string;
  lastError: string | null;
  updatedAt: number;
  capacitorPresent: boolean;
  platformName: string;
  unhandledCount: number;
}

const debugState: AdDebugState = {
  enabled: ADS_ENABLED,
  native: false,
  initFailed: false,
  initialized: false,
  interstitialLoaded: false,
  rewardedLoaded: false,
  lastEvent: "idle",
  lastError: null,
  updatedAt: Date.now(),
  capacitorPresent: false,
  platformName: "unknown",
  unhandledCount: 0,
};

// Global safety net: if ANY promise anywhere in the app rejects without a
// .catch() (e.g. an uncaught throw inside an async call site that isn't
// itself wrapped in try/catch), surface it here instead of it vanishing
// silently — this is how a stuck "last event" with no further progress can
// be diagnosed even when the throw happens outside our own try/catch blocks.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (ev) => {
    debugState.unhandledCount += 1;
    debugState.lastError = `[unhandled] ${String((ev.reason as any)?.message ?? ev.reason)}`;
    debugState.lastEvent = "global:unhandled-rejection";
    debugState.updatedAt = Date.now();
  });
}

function recordEvent(event: string, error?: unknown) {
  debugState.native = isNative();
  debugState.initFailed = initFailed;
  debugState.initialized = initialized;
  debugState.interstitialLoaded = interstitialLoaded;
  debugState.rewardedLoaded = rewardedLoaded;
  debugState.lastEvent = event;
  debugState.lastError = error ? String((error as any)?.message ?? error) : debugState.lastError;
  debugState.updatedAt = Date.now();
  debugState.capacitorPresent = typeof (window as any).Capacitor !== "undefined";
  debugState.platformName = (window as any).Capacitor?.getPlatform?.() ?? "n/a";
}

export function getAdDebugState(): AdDebugState {
  recordEvent(debugState.lastEvent);
  return { ...debugState };
}

function isNative(): boolean {
  return ADS_ENABLED && !!(window as any).Capacitor?.isNativePlatform?.();
}

function platform(): "android" | "ios" {
  return (window as any).Capacitor?.getPlatform?.() === "ios" ? "ios" : "android";
}

// Capacitor injects `window.Capacitor` asynchronously on cold start. If we
// check isNative() the instant React mounts, the bridge can still be
// attaching and we'd wrongly conclude "not native" and give up forever
// (initAds() was only ever called once, from a `useEffect(..., [])`).
// This waits (bounded) for the bridge, so init isn't lost to that race.
function waitForNativeBridge(timeoutMs = 8000, intervalMs = 150): Promise<boolean> {
  return new Promise((resolve) => {
    if (isNative()) return resolve(true);
    const start = Date.now();
    const tick = () => {
      if (isNative()) return resolve(true);
      if (Date.now() - start >= timeoutMs) return resolve(false);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

// Wraps a promise so it can never hang the init flow forever — if it
// doesn't settle within `ms`, we reject with a diagnosable error instead of
// leaving the caller (and the debug panel) stuck showing a stale event.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// IMPORTANT: never `return` the raw Capacitor plugin object from an async
// function, and never pass it through `await`/`Promise.resolve()` directly.
// Capacitor's plugin proxy answers `true` for ANY property access — including
// `.then` — so JS's own promise-resolution machinery mistakes it for a
// thenable and tries to call `plugin.then(resolve, reject)` to "adopt" it.
// Since no plugin actually implements a native "then" method, that blows up
// with `"<Plugin>.then() is not implemented on <platform>"` — a real bug we
// hit here. Fix: always wrap the plugin object in a plain `{ mod }` holder
// before it crosses any await boundary, and unwrap it with a plain property
// read (never an await) afterward.
interface AdMobHolder {
  mod: any;
}

async function getAdMobHolder(): Promise<AdMobHolder | null> {
  if (!isNative() || initFailed) return null;
  if (admobModule) return { mod: admobModule };
  try {
    recordEvent("sdk:import-start");
    const mod = await withTimeout(import("@capacitor-community/admob"), 10000, "AdMob module import");
    admobModule = mod.AdMob;
    recordEvent("sdk:import-done");
    return { mod: admobModule };
  } catch (e) {
    initFailed = true;
    recordEvent("sdk:import-failed", e);
    return null;
  }
}

// True once we've requested/checked consent this session, so we don't
// re-prompt every time initAds() is retried.
let consentChecked = false;

async function handleConsentAndTracking(AdMob: any): Promise<void> {
  if (consentChecked) return;
  consentChecked = true;
  try {
    const [trackingInfo, consentInfo] = await Promise.all([
      AdMob.trackingAuthorizationStatus?.() ?? Promise.resolve(null),
      AdMob.requestConsentInfo?.() ?? Promise.resolve(null),
    ]);
    if (trackingInfo?.status === "notDetermined" && AdMob.requestTrackingAuthorization) {
      await AdMob.requestTrackingAuthorization();
    }
    if (consentInfo?.isConsentFormAvailable && consentInfo?.status === "required" && AdMob.showConsentForm) {
      await AdMob.showConsentForm();
    }
    recordEvent("consent:checked");
  } catch (e) {
    // Non-fatal — some SDK versions/regions don't expose all of these calls.
    // Ads (especially test ads) can still serve without this succeeding.
    recordEvent("consent:check-failed", e);
  }
}

// initAds() is called from several independent sites (mount effect, bottom
// banner, settings interstitial). Without coordination those calls race each
// other and interleave their debug events, making the panel look "stuck"
// even when one of them is actually progressing fine. Share a single
// in-flight promise so every caller awaits the SAME actual execution.
let inFlight: Promise<void> | null = null;

export function initAds(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runInitAds().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runInitAds(): Promise<void> {
  // Outer try/catch is deliberately paranoid: `await getAdMob()` below sits
  // outside getAdMob()'s own try/catch from this function's point of view,
  // so ANY synchronous throw or unexpected rejection anywhere in this chain
  // must still be caught here — otherwise it becomes an unhandled rejection
  // and the debug panel's "last event" freezes with no further clue.
  try {
    recordEvent("init:called");
    if (initialized) return;
    const bridgeReady = await waitForNativeBridge();
    if (!bridgeReady) {
      recordEvent("init:bridge-not-ready");
      return;
    }
    recordEvent("init:bridge-ready");
    const holder = await getAdMobHolder();
    const AdMob = holder ? holder.mod : null;
    if (!AdMob) {
      recordEvent("init:no-admob-module");
      return;
    }
    recordEvent("init:calling-native");
    await withTimeout(
      AdMob.initialize({ testingDevices: [], initializeForTesting: true }),
      10000,
      "AdMob.initialize()",
    );
    initialized = true;
    recordEvent("init:success");
    await handleConsentAndTracking(AdMob);
  } catch (e) {
    console.warn("[SNIX] AdMob init failed:", e);
    initFailed = true;
    recordEvent("init:failed", e);
  }
}

let interstitialLoaded = false;

async function preloadInterstitial(): Promise<void> {
  const holder = await getAdMobHolder();
  const AdMob = holder ? holder.mod : null;
  if (!AdMob) return;
  try {
    await AdMob.prepareInterstitial({ adId: AD_IDS[platform()].interstitial, isTesting: true });
    interstitialLoaded = true;
    recordEvent("interstitial:preloaded");
  } catch (e) {
    interstitialLoaded = false;
    recordEvent("interstitial:preload-failed", e);
  }
}

// Occasional (not every time) full-screen interstitial for Settings opens.
// Roughly 1-in-3 opens, and never on two consecutive opens, so it never feels spammy.
const SETTINGS_AD_KEY = "snix_settings_ad_shown_last";
export async function maybeShowSettingsInterstitial(): Promise<void> {
  if (!isNative()) return;
  const chance = Math.random();
  const shownLast = sessionStorage.getItem(SETTINGS_AD_KEY) === "1";
  if (shownLast || chance > 1 / 3) {
    sessionStorage.setItem(SETTINGS_AD_KEY, "0");
    return;
  }
  await initAds();
  if (!interstitialLoaded) await preloadInterstitial();
  const holder = await getAdMobHolder();
  const AdMob = holder ? holder.mod : null;
  if (!AdMob || !interstitialLoaded) return;
  try {
    await AdMob.showInterstitial();
    sessionStorage.setItem(SETTINGS_AD_KEY, "1");
  } catch (e) {
    console.warn("[SNIX] Interstitial show failed:", e);
  } finally {
    interstitialLoaded = false;
    preloadInterstitial();
  }
}

// ─── Rewarded video ads ─────────────────────────────────────────────────────
// Used to gate two opt-in "pay with attention instead of money" features:
//   - changing the profile background GIF
//   - unlocking one Pro avatar style ("sticker") at a time
// Pro users bypass both gates entirely and never see these ads.
let rewardedLoaded = false;

async function preloadRewarded(): Promise<void> {
  const holder = await getAdMobHolder();
  const AdMob = holder ? holder.mod : null;
  if (!AdMob) return;
  try {
    await AdMob.prepareRewardVideoAd({ adId: AD_IDS[platform()].rewarded, isTesting: true });
    rewardedLoaded = true;
    recordEvent("rewarded:preloaded");
  } catch (e) {
    rewardedLoaded = false;
    recordEvent("rewarded:preload-failed", e);
  }
}

// Shows a rewarded video ad and resolves `true` only once the user actually
// watched it and earned the reward (a `RewardAdPluginEvents.Rewarded` event
// fired natively before the ad closed). Resolves `false` if the ad failed to
// load/show or the user closed it early — callers should NOT unlock the
// gated feature in that case.
//
// On web / non-native platforms there's no ad SDK to show at all; we resolve
// `true` immediately so the gated features stay testable in the browser
// preview instead of being permanently blocked outside a native build.
export async function showRewardedAd(): Promise<boolean> {
  if (!isNative()) {
    recordEvent("rewarded:skipped-non-native");
    return true;
  }
  await initAds();
  if (!rewardedLoaded) await preloadRewarded();
  const holder = await getAdMobHolder();
  const AdMob = holder ? holder.mod : null;
  if (!AdMob || !rewardedLoaded) {
    recordEvent("rewarded:not-ready");
    return false;
  }
  try {
    const { RewardAdPluginEvents } = await import("@capacitor-community/admob");
    let earnedReward = false;
    const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
      earnedReward = true;
      recordEvent("rewarded:earned");
    });
    try {
      await AdMob.showRewardVideoAd();
    } finally {
      rewardListener?.remove?.();
    }
    recordEvent(earnedReward ? "rewarded:completed" : "rewarded:dismissed-without-reward");
    return earnedReward;
  } catch (e) {
    console.warn("[SNIX] Rewarded ad failed:", e);
    recordEvent("rewarded:failed", e);
    return false;
  } finally {
    rewardedLoaded = false;
    preloadRewarded();
  }
}

// Always-fire interstitial — use sparingly (e.g. before opening a picker for
// non-pro users). On web/non-native it no-ops so the UX is never blocked.
export async function showInterstitialAd(): Promise<void> {
  if (!isNative()) {
    recordEvent("interstitial:skipped-non-native");
    return;
  }
  await initAds();
  if (!interstitialLoaded) await preloadInterstitial();
  const holder = await getAdMobHolder();
  const AdMob = holder ? holder.mod : null;
  if (!AdMob || !interstitialLoaded) {
    recordEvent("interstitial:not-ready");
    return;
  }
  try {
    await AdMob.showInterstitial();
    recordEvent("interstitial:shown");
  } catch (e) {
    console.warn("[SNIX] Interstitial show failed:", e);
    recordEvent("interstitial:failed", e);
  } finally {
    interstitialLoaded = false;
    preloadInterstitial();
  }
}

// ─── Feed banner ad ──────────────────────────────────────────────────────────
// A sticky bottom-of-screen banner shown only while the Feed tab is active.
// Shown/hidden by FeedView's mount/unmount effect so it never bleeds onto
// other tabs. No-ops silently on web (non-native) so the web preview isn't broken.
let bannerShown = false;

/**
 * Show the feed banner at TOP_CENTER with `topMarginPx` offset from the top
 * of the WebView (i.e. below the web header). Pass the measured offsetHeight
 * of the header element so the banner sits flush beneath the search bar
 * rather than floating over content at the bottom.
 */
export async function showFeedBanner(topMarginPx = 0): Promise<void> {
  if (!isNative()) return;
  if (bannerShown) return;
  await initAds();
  const holder = await getAdMobHolder();
  const AdMob = holder ? holder.mod : null;
  if (!AdMob) return;
  try {
    const { BannerAdSize, BannerAdPosition, BannerAdPluginEvents } = await import("@capacitor-community/admob");
    // Emit exact banner height so the scroll container can add matching paddingTop
    AdMob.addListener(BannerAdPluginEvents.SizeChanged, (info: any) => {
      const px = info?.height ?? info?.size?.height ?? 60;
      emitBannerHeight(px);
      recordEvent("banner:size-changed");
    });
    await AdMob.showBanner({
      adId: AD_IDS[platform()].banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.TOP_CENTER,
      margin: topMarginPx,
      isTesting: true,
      npa: false,
    });
    bannerShown = true;
    recordEvent("banner:shown");
  } catch (e) {
    recordEvent("banner:show-failed", e);
  }
}

export async function hideFeedBanner(): Promise<void> {
  if (!isNative() || !bannerShown) return;
  const holder = await getAdMobHolder();
  const AdMob = holder ? holder.mod : null;
  if (!AdMob) return;
  try {
    await AdMob.hideBanner();
    bannerShown = false;
    recordEvent("banner:hidden");
  } catch (e) {
    recordEvent("banner:hide-failed", e);
  }
}

export { isNative as adsAvailableOnThisPlatform };
