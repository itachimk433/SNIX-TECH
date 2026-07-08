import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mkdev.snix",
  appName: "SNIX",
  webDir: "dist",
  android: {
    // Matches the web AuthBootstrap/OfflineBanner dark background
    // (Tailwind slate-950) so the native cold-start window blends straight
    // into the in-app loading screen with zero visible flash or branded
    // splash image.
    backgroundColor: "#020617",
    // adjustNothing: the keyboard overlays the WebView without resizing or
    // panning it. The web layer uses the Visual Viewport API to shrink the
    // app container to the actual visible height, so there is no black gap
    // and no layout jump.
    windowSoftInputMode: "adjustNothing",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      launchFadeOutDuration: 0,
      backgroundColor: "#020617",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#020617",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com"],
    },
    AdMob: {
      // Real SNIX AdMob App ID — commented out while ad units are set to
      // Google's test IDs. Swap back in before a build that should earn
      // real revenue. The Google Mobile Ads SDK also requires this exact
      // value registered natively (see AndroidManifest.xml meta-data and
      // Info.plist GADApplicationIdentifier — required, this config block
      // alone does NOT satisfy that native requirement).
      // appId: "ca-app-pub-4975030890366420~9034721211",

      // Google's official Android AdMob test App ID (safe to ship — always
      // serves test creatives). See:
      // https://developers.google.com/admob/android/test-ads
      appId: "ca-app-pub-3940256099942544~3347511713",
    },
  },
};

export default config;
