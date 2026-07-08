import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "./logger";

let app: App | null = null;
let initFailed = false;

function getAdminApp(): App | null {
  if (app) return app;
  if (initFailed) return null;

  const raw = process.env["FIREBASE_SERVICE_ACCOUNT_KEY"];
  if (!raw) {
    initFailed = true;
    logger.warn(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not set; push notifications are disabled.",
    );
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    const existing = getApps();
    app = existing.length > 0 ? existing[0]! : initializeApp({ credential: cert(serviceAccount) });
    return app;
  } catch (err) {
    initFailed = true;
    logger.error({ err }, "Failed to initialize Firebase Admin SDK");
    return null;
  }
}

export function isPushEnabled(): boolean {
  return getAdminApp() !== null;
}

/** Returns the Admin Firestore instance, or null if the SDK isn't configured. */
export function getAdminDb() {
  const adminApp = getAdminApp();
  if (!adminApp) return null;
  return getFirestore(adminApp);
}

export async function sendPushToUser(params: {
  targetUserId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ ok: boolean; error?: string }> {
  const adminApp = getAdminApp();
  if (!adminApp) return { ok: false, error: "push_not_configured" };

  try {
    const userSnap = await getFirestore(adminApp)
      .collection("users")
      .doc(params.targetUserId)
      .get();
    const token = userSnap.exists ? (userSnap.data()?.["fcmToken"] as string | undefined) : undefined;
    if (!token) return { ok: false, error: "no_token" };

    await getMessaging(adminApp).send({
      token,
      notification: { title: params.title, body: params.body },
      data: params.data,
      android: { priority: "high" },
    });
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "Failed to send push notification");
    return { ok: false, error: "send_failed" };
  }
}
