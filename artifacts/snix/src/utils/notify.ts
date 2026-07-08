export function getApiBase(): string {
  const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  if (base) return base;
  const isNativeOrFile =
    window.location.origin.startsWith("capacitor://") ||
    window.location.origin.startsWith("file:") ||
    window.location.origin === "http://localhost";
  return isNativeOrFile ? "https://snixapp.com" : window.location.origin;
}

// Fire-and-forget request to the API server to deliver a real push
// notification (FCM) to the target user, in addition to the in-app
// Firestore notification that's already written by the caller.
export function triggerPushNotification(params: {
  targetUserId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): void {
  try {
    fetch(`${getApiBase()}/api/push/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }).catch(() => {});
  } catch {}
}
