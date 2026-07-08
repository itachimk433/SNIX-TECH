import { db, auth } from "../firebase";
import { doc, setDoc } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

// Real push notifications for the native Android app.
// Requires google-services.json to be bundled into the Android project
// (done automatically by the CI build) and a granted notification
// permission from the user.

let listenersRegistered = false;

async function saveTokenForCurrentUser(token: string) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await setDoc(doc(db, "users", user.uid), { fcmToken: token }, { merge: true });
  } catch {}
}

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return; // Push tokens only exist on native builds

  try {
    if (!listenersRegistered) {
      listenersRegistered = true;

      PushNotifications.addListener("registration", (token) => {
        saveTokenForCurrentUser(token.value);
      });

      PushNotifications.addListener("registrationError", () => {
        // Silently ignore — in-app Firestore notifications still work as a fallback.
      });

      // Foreground notifications are already covered by the in-app Bell/notifications
      // panel (Firestore listeners), so we don't need to show a duplicate local toast.
      PushNotifications.addListener("pushNotificationReceived", () => {});
      PushNotifications.addListener("pushNotificationActionPerformed", () => {});
    }

    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === "prompt") {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== "granted") return;

    await PushNotifications.register();
  } catch {
    // Never block app startup on push notification setup failures.
  }
}

export async function clearPushToken(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await setDoc(doc(db, "users", user.uid), { fcmToken: null }, { merge: true });
  } catch {}
  if (Capacitor.isNativePlatform()) {
    try { await PushNotifications.removeAllListeners(); listenersRegistered = false; } catch {}
  }
}
