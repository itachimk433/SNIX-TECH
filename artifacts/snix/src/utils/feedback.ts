// Shared haptic + toast feedback helpers used across views (pull-to-refresh, etc.)
import { toast } from "sonner";

export function vibrateSuccess(): void {
  try {
    (import("@capacitor/haptics") as any).then(({ Haptics, NotificationType }: any) => {
      Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    }).catch(() => { try { navigator.vibrate?.([20, 30, 20]); } catch {} });
  } catch {
    try { navigator.vibrate?.([20, 30, 20]); } catch {}
  }
}

export function notifyRefreshed(message = "Up to date!"): void {
  vibrateSuccess();
  toast.success(message, { duration: 1600 });
}
