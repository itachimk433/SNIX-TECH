import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import VirtualKeyboard from "../components/VirtualKeyboard";

// ─── Settings ────────────────────────────────────────────────────────────────
export type KBTheme  = "light" | "dark" | "blue" | "neon";
export type KBHeight = "compact" | "normal" | "tall";

export interface KeyboardSettings {
  theme: KBTheme;
  height: KBHeight;
  /** When false (the default), openKeyboard() is a no-op and native browser
   *  inputs are used instead. Disable this for web/Cloudflare deployments
   *  where the native keyboard works fine. Enable only on Android APK builds. */
  enabled: boolean;
}

const DEFAULT_SETTINGS: KeyboardSettings = { theme: "light", height: "tall", enabled: false };
const STORAGE_KEY = "snix_kb_settings";

function loadSettings(): KeyboardSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

// ─── Active session ───────────────────────────────────────────────────────────
export interface KeyboardSession {
  onChange: (v: string) => void;
  onSubmit?: () => void;
  /** Called when the keyboard is dismissed WITHOUT submitting (Done button / backdrop tap). */
  onDismiss?: () => void;
  placeholder?: string;
  maxLength?: number;
  isPassword?: boolean;
  isMultiline?: boolean;
  replyBanner?: React.ReactNode;
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface KeyboardContextType {
  settings: KeyboardSettings;
  updateSettings: (patch: Partial<KeyboardSettings>) => void;
  /** Open the global keyboard for a given input. */
  openKeyboard: (initialValue: string, session: KeyboardSession) => void;
  /** Silent close — does NOT fire onDismiss. Use from code (e.g. after save). */
  closeKeyboard: () => void;
  /** Dismiss with callback — fires onDismiss. Use for hardware back button. */
  dismissKeyboard: () => void;
  isOpen: boolean;
  displayValue: string;
}

const KeyboardContext = createContext<KeyboardContextType>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
  openKeyboard: () => {},
  closeKeyboard: () => {},
  dismissKeyboard: () => {},
  isOpen: false,
  displayValue: "",
});

export function useKeyboard() { return useContext(KeyboardContext); }

// ─── Provider ─────────────────────────────────────────────────────────────────
export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<KeyboardSettings>(loadSettings);
  const [isOpen, setIsOpen] = useState(false);
  const [displayValue, setDisplayValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const sessionRef = useRef<KeyboardSession | null>(null);
  const openedAtRef = useRef<number>(0);
  // Keep a ref so openKeyboard always reads the latest enabled flag without
  // needing it in the dependency array (avoids closing over a stale value).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Apply app-wide theme via data attribute whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute("data-app-theme", settings.theme);
  }, [settings.theme]);

  const updateSettings = useCallback((patch: Partial<KeyboardSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const openKeyboard = useCallback((initialValue: string, session: KeyboardSession) => {
    // No-op when in-app keyboard is disabled — native browser input takes over.
    if (!settingsRef.current.enabled) return;
    sessionRef.current = session;
    setDisplayValue(initialValue);
    setSubmitting(false);
    setIsOpen(true);
    openedAtRef.current = Date.now();
  }, []);

  /** Silent close — does NOT fire onDismiss. Use from code (e.g. after save). */
  const closeKeyboard = useCallback(() => {
    setIsOpen(false);
    sessionRef.current = null;
  }, []);

  /** Dismiss with callback — fires onDismiss. Use for Done button and backdrop. */
  const dismissKeyboard = useCallback(() => {
    sessionRef.current?.onDismiss?.();
    setIsOpen(false);
    sessionRef.current = null;
  }, []);

  const handleChange = (v: string) => {
    setDisplayValue(v);
    sessionRef.current?.onChange(v);
  };

  const handleSubmit = async () => {
    if (sessionRef.current?.onSubmit) {
      setSubmitting(true);
      try { await sessionRef.current.onSubmit(); } catch {}
      finally { setSubmitting(false); }
    }
    closeKeyboard();
  };

  const backdropClass = settings.theme === "dark" || settings.theme === "blue" || settings.theme === "neon"
    ? "bg-black/60"
    : "bg-black/30";

  return (
    <KeyboardContext.Provider value={{ settings, updateSettings, openKeyboard, closeKeyboard, dismissKeyboard, isOpen, displayValue }}>
      {children}

      {isOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end pointer-events-none">
          <div
            className={`absolute inset-0 ${backdropClass} pointer-events-auto`}
            onPointerDown={e => {
              e.preventDefault();
              if (Date.now() - openedAtRef.current > 300) dismissKeyboard();
            }}
          />
          <div className="relative pointer-events-auto">
            <VirtualKeyboard
              value={displayValue}
              onChange={handleChange}
              onSubmit={handleSubmit}
              placeholder={sessionRef.current?.placeholder}
              maxLength={sessionRef.current?.maxLength}
              submitting={submitting}
              replyBanner={sessionRef.current?.replyBanner}
              isPassword={sessionRef.current?.isPassword}
              isMultiline={sessionRef.current?.isMultiline}
              theme={settings.theme}
              height={settings.height}
              sessionKey={openedAtRef.current}
            />
            <div className="flex justify-end bg-inherit px-3 pb-1" style={{ background: themeBackground(settings.theme) }}>
              <button
                onClick={() => dismissKeyboard()}
                className={`text-[10px] font-semibold px-3 py-1 rounded-lg ${settings.theme === "dark" || settings.theme === "blue" || settings.theme === "neon" ? "text-slate-300 hover:bg-white/10" : "text-slate-400 hover:bg-slate-100"}`}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </KeyboardContext.Provider>
  );
}

function themeBackground(theme: KBTheme): string {
  if (theme === "dark") return "#1e293b";
  if (theme === "blue") return "#1e3a5f";
  if (theme === "neon") return "#2e1065";
  return "#f1f5f9";
}
