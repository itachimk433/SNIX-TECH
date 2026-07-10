import React, { useState, useEffect, useRef, useCallback } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "./firebase";
import { doc, getDoc, setDoc, onSnapshot, collection, query, where } from "firebase/firestore";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { initPushNotifications } from "./utils/pushNotifications";
import PhoneContainer from "./components/PhoneContainer";
import BottomNav, { TabType } from "./components/BottomNav";
import AuthView from "./components/AuthView";
import FeedView, { GuestPrompt } from "./components/FeedView";
import CreatePostView from "./components/CreatePostView";
import ProfileView from "./components/ProfileView";
import { Mail, WifiOff, RefreshCw, X, Keyboard, Maximize2, Palette, MapPin, MailCheck, ArrowRight } from "lucide-react";
import { sendEmailVerification } from "firebase/auth";
import snixIcon from "./assets/snix-icon.jpg";
import { COUNTRIES } from "./types";
import { KeyboardProvider, useKeyboard, KBTheme, KBHeight } from "./context/KeyboardContext";
import { Toaster } from "sonner";
import { initAds } from "./utils/ads";

// ─── Connectivity probe ───────────────────────────────────────────────────────
// Uses a no-cors HEAD to a Google connectivity endpoint so CORS errors don't
// give false-negatives, while still confirming actual network reachability.
async function checkServerReachable(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    await fetch("https://www.gstatic.com/generate_204", {
      method: "HEAD",
      cache: "no-store",
      mode: "no-cors",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

// ─── Static components ────────────────────────────────────────────────────────
function FirebaseNotConfigured() {
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:"32px 24px",backgroundColor:"#f8fafc",fontFamily:"ui-sans-serif,system-ui,sans-serif",textAlign:"center" }}>
      <div style={{ width:64,height:64,borderRadius:20,background:"linear-gradient(135deg,#2563eb,#10b981)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,fontSize:28,color:"white",fontWeight:900 }}>S</div>
      <h2 style={{ color:"#0f172a",fontWeight:800,fontSize:18,margin:"0 0 10px" }}>Firebase Setup Required</h2>
      <p style={{ color:"#475569",fontSize:13,lineHeight:1.7,maxWidth:300,margin:"0 0 20px" }}>Add Firebase credentials as GitHub Secrets and rebuild the APK.</p>
    </div>
  );
}

function OfflineBanner() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 px-8 text-center">
      <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
        <WifiOff size={36} className="text-red-400" />
      </div>
      <h2 className="text-xl font-black text-white mb-2" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>No Connection</h2>
      <p className="text-sm text-slate-400 leading-relaxed mb-8 max-w-[260px]">
        SNIX needs internet to load. Please enable your mobile data or Wi-Fi, then reload.
      </p>
      <button onClick={() => window.location.reload()}
        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-emerald-500 text-white font-bold rounded-xl text-sm tracking-wider uppercase shadow-lg active:scale-95 transition-transform">
        <RefreshCw size={16} /> Reload App
      </button>
    </div>
  );
}

// Branded splash — shown while Firebase resolves the persisted session.
// Mirrors the original launch experience so the transition from the
// native Android splash (which always shows the app icon) is seamless.
function AuthBootstrap() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-950">
      <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-2xl shadow-blue-500/40 mb-6">
        <img src={snixIcon} alt="SNIX" className="w-full h-full object-cover" />
      </div>
      <h1 className="text-3xl font-black text-white tracking-tight mb-1" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>SNIX</h1>
      <p className="text-xs text-slate-500 mb-8">The Decentralized VPN Hub</p>
      <span className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-500 border-t-transparent" />
    </div>
  );
}

// Left-side vertical progress bar (browser / Facebook style, but vertical).
// Two-phase: fills quickly to ~88%, then jumps to 100% and fades when done.
function SyncProgressBar({ syncing }: { syncing: boolean }) {
  const [phase, setPhase] = useState<"filling" | "complete" | "gone">("filling");
  const prevSyncing = useRef(true);

  useEffect(() => {
    if (prevSyncing.current && !syncing) {
      // Sync just finished — complete the bar then hide it
      setPhase("complete");
      const t = setTimeout(() => setPhase("gone"), 320);
      return () => clearTimeout(t);
    }
    prevSyncing.current = syncing;
    return undefined;
  }, [syncing]);

  if (phase === "gone") return null;

  return (
    <div className="fixed left-0 top-0 bottom-0 w-[3px] z-[200] pointer-events-none overflow-hidden">
      <div
        className={phase === "filling" ? "snix-sync-filling" : "snix-sync-complete"}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "linear-gradient(to top, #2563eb, #34d399)",
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
}

// Error toast when server is unreachable
function SyncErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="fixed bottom-24 left-3 right-3 z-[210] bg-red-900 border border-red-700 rounded-2xl px-4 py-3 shadow-2xl flex items-start gap-3">
      <div className="w-9 h-9 bg-red-700 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
        <WifiOff size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white mb-0.5">Sync Failed</p>
        <p className="text-[10px] text-red-300 font-medium leading-relaxed">{message}</p>
      </div>
      <button onClick={onDismiss} className="text-red-400 hover:text-white transition-colors shrink-0 mt-0.5 text-base leading-none">✕</button>
    </div>
  );
}

const THEMES: { value: KBTheme; label: string; preview: string; desc: string }[] = [
  { value: "light",   label: "Light",   preview: "bg-slate-100 border border-slate-200",              desc: "Clean & bright" },
  { value: "dark",    label: "Dark",    preview: "bg-slate-800 border border-slate-700",               desc: "Easy on eyes"  },
  { value: "blue",    label: "Ocean",   preview: "bg-blue-900 border border-blue-800",                 desc: "Deep blue"     },
  { value: "neon",    label: "Neon",    preview: "bg-purple-950 border border-purple-700",             desc: "Neon vibes"    },
];

const HEIGHTS: { value: KBHeight; label: string; sub: string }[] = [
  { value: "compact", label: "Compact", sub: "Small keys" },
  { value: "normal",  label: "Normal",  sub: "Standard"   },
  { value: "tall",    label: "Tall",    sub: "Large keys"  },
];

function SettingsModal({ onClose, isGuest, onSignInRequired }: { onClose: () => void; isGuest: boolean; onSignInRequired: () => void }) {
  const { settings, updateSettings } = useKeyboard();
  const [country, setCountry] = useState<string>("");
  const [countrySaving, setCountrySaving] = useState(false);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);

  const handleCountryChange = async (code: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setCountry(code);
    setCountrySaving(true);
    try { await setDoc(doc(db, "users", uid), { country: code }, { merge: true }); }
    finally { setCountrySaving(false); }
  };

  // Load / live-sync the user's saved country — powers the Local leaderboard tab.
  // If the user has never set one, auto-detect it from their IP (same source
  // Feed uses for its country filter) and save it automatically, so Local
  // leaderboard works out of the box without requiring a manual pick.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let autoDetectAttempted = false;
    const unsub = onSnapshot(doc(db, "users", uid), snap => {
      const saved = snap.data()?.country || "";
      setCountry(saved);
      if (!saved && !autoDetectAttempted) {
        autoDetectAttempted = true;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        fetch("https://ipapi.co/json/", { signal: controller.signal })
          .then(r => r.json())
          .then((data: { country_code?: string }) => {
            clearTimeout(timeoutId);
            const code = data.country_code;
            if (code && COUNTRIES.some(c => c.code === code)) handleCountryChange(code);
          })
          .catch(() => clearTimeout(timeoutId));
      }
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-slate-200 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-900" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>Settings</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">

          {/* ── App Theme ──────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center"><Palette size={16} className="text-violet-600" /></div>
              <div>
                <h3 className="text-sm font-black text-slate-900">App Theme</h3>
                <p className="text-[10px] text-slate-400">Styles the whole app & keyboard</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map(th => (
                <button key={th.value} onClick={() => updateSettings({ theme: th.value })}
                  className={`relative flex items-center gap-3 p-3 rounded-xl border-2 transition-all overflow-hidden ${
                    settings.theme === th.value ? "border-violet-500 bg-violet-50/60"
                    : "border-slate-100 bg-slate-50 hover:border-slate-200"}`}>
                  <div className={`w-9 h-7 rounded-lg flex flex-col gap-0.5 items-center justify-center ${th.preview} shrink-0`}>
                    <div className="flex gap-0.5">{[...Array(4)].map((_,i) => <div key={i} className="w-1.5 h-1.5 rounded-sm bg-current opacity-40"/>)}</div>
                    <div className="flex gap-0.5">{[...Array(3)].map((_,i) => <div key={i} className="w-1.5 h-1.5 rounded-sm bg-current opacity-30"/>)}</div>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-800">{th.label}</p>
                    <p className="text-[9px] text-slate-400">{th.desc}</p>
                    {settings.theme === th.value && <p className="text-[9px] text-violet-600 font-semibold">Active</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="h-px bg-slate-100" />

          {/* ── Keyboard ───────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center"><Keyboard size={16} className="text-blue-600" /></div>
              <div>
                <h3 className="text-sm font-black text-slate-900">In-App Keyboard</h3>
                <p className="text-[10px] text-slate-400">Custom keyboard overlay (for APK only)</p>
              </div>
            </div>
            {/* Enable / disable toggle */}
            <button
              onClick={() => updateSettings({ enabled: !settings.enabled })}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all mb-4 ${
                settings.enabled ? "border-blue-500 bg-blue-50/60" : "border-slate-100 bg-slate-50"
              }`}
            >
              <div className="text-left">
                <p className="text-xs font-bold text-slate-800">Use in-app keyboard</p>
                <p className="text-[9px] text-slate-400">Disable for web/browser — use your device keyboard instead</p>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${settings.enabled ? "bg-blue-500" : "bg-slate-200"}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.enabled ? "translate-x-4" : "translate-x-0"}`} />
              </div>
            </button>
            {settings.enabled && (
              <>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Maximize2 size={10} /> Key Size</p>
                <div className="flex gap-2">
                  {HEIGHTS.map(h => (
                    <button key={h.value} onClick={() => updateSettings({ height: h.value })}
                      className={`relative flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all overflow-hidden ${
                        settings.height === h.value ? "border-blue-500 bg-blue-50/60"
                        : "border-slate-100 bg-slate-50 hover:border-slate-200"}`}>
                      <div className={`w-8 rounded-lg bg-slate-200 ${h.value === "compact" ? "h-5" : h.value === "normal" ? "h-7" : "h-9"}`} />
                      <p className="text-[10px] font-bold text-slate-700">{h.label}</p>
                      <p className="text-[9px] text-slate-400">{h.sub}</p>
                      {settings.height === h.value && <p className="text-[9px] text-blue-600 font-semibold">Active</p>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="h-px bg-slate-100" />

          {/* ── About ──────────────────────────────────────────────────── */}
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>SNIX</h2>
              <p className="text-xs text-slate-500 mt-1">The Decentralized VPN Configuration Hub</p>
            </div>
            <div className="w-full bg-slate-50 rounded-2xl p-4 flex flex-col gap-3 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center"><Mail size={16} className="text-blue-600" /></div>
                <div className="text-left">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contact</p>
                  <a href="mailto:mkdev4360@gmail.com" className="text-xs font-bold text-blue-600">mkdev4360@gmail.com</a>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center"><MapPin size={16} className="text-emerald-600" /></div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Country {countrySaving && "· saving…"}</p>
                  {isGuest ? (
                    <button
                      onClick={() => setShowGuestPrompt(true)}
                      className="w-full mt-0.5 text-left bg-transparent text-xs font-bold text-slate-400 outline-none"
                    >
                      Sign in to set your country
                    </button>
                  ) : (
                    <select
                      value={country}
                      onChange={e => handleCountryChange(e.target.value)}
                      className="w-full mt-0.5 bg-transparent text-xs font-bold text-slate-800 outline-none"
                    >
                      <option value="">Not set — used for local leaderboard</option>
                      {COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-100" />

          {/* ── Legal ──────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center">
                <span style={{ fontSize: 15 }}>⚖️</span>
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Legal</h3>
                <p className="text-[10px] text-slate-400">Your rights and our policies</p>
              </div>
            </div>

            {/* Privacy summary */}
            <div className="bg-slate-50 rounded-2xl p-3.5 mb-2 border border-slate-100">
              <p className="text-[11px] font-black text-slate-700 mb-1">🔒 Privacy Policy</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                SNIX collects only what it needs: your Google/Apple account info, configs you upload, and anonymous usage analytics.
                We never sell your data. You can delete your account and data at any time.
              </p>
              <a
                href="https://snix-legal.pages.dev/privacy"
                target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-bold text-blue-500 mt-1.5 block"
              >Read full Privacy Policy →</a>
            </div>

            {/* Terms summary */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
              <p className="text-[11px] font-black text-slate-700 mb-1">📜 Terms of Use</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Use SNIX responsibly. Don't upload harmful configs, spam, or infringe copyright.
                Configs you share remain yours; you grant SNIX a licence to display them. We can suspend accounts that violate these rules.
              </p>
              <a
                href="https://snix-legal.pages.dev/terms"
                target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-bold text-blue-500 mt-1.5 block"
              >Read full Terms of Service →</a>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-medium text-center pt-2">©2026 MKDEV. All rights reserved.</p>
        </div>
        <div className="px-5 pb-5 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="w-full py-3 bg-slate-950 text-white font-bold rounded-xl text-xs tracking-wider uppercase">Close</button>
        </div>
      </div>
      {showGuestPrompt && (
        <GuestPrompt action="Set Your Country" onSignIn={() => { setShowGuestPrompt(false); onClose(); onSignInRequired(); }} />
      )}
    </div>
  );
}

interface DeepLink { postId: string; commentId?: string; }

function AppInner() {
  const [user, setUser]           = useState<User | null>(null);
  const [isGuest, setIsGuest]     = useState(false);
  // authReady gates the initial render to prevent logged-in users briefly
  // flashing the AuthView. Resolves quickly from IndexedDB persistence.
  // No branded splash — just a bare spinner for ≤1 s.
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("feed");
  const [selectedUserUid, setSelectedUserUid] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [isOnline, setIsOnline]   = useState(navigator.onLine);
  const [deepLink, setDeepLink]   = useState<DeepLink | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [syncingToTab, setSyncingToTab] = useState<TabType | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Email verification screen — shown right after a new account is created.
  // Lives in App.tsx (not AuthView) so it survives the onAuthStateChanged
  // that fires immediately on account creation and would otherwise unmount AuthView.
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  // Real-time unread notification count for the bottom nav badge
  useEffect(() => {
    if (!user?.uid) { setUnreadCount(0); return; }
    const q = query(collection(db, "notifications"), where("userId", "==", user.uid), where("read", "==", false));
    const unsub = onSnapshot(q, snap => setUnreadCount(snap.size));
    return unsub;
  }, [user?.uid]);

  // Warm up AdMob once on cold start (no-op on web / non-native)
  useEffect(() => { initAds(); }, []);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  // Ref-based lock prevents race conditions from rapid taps during sync
  const syncInProgressRef = useRef(false);

  const { isOpen: isKeyboardOpen, dismissKeyboard } = useKeyboard();
  const isKeyboardOpenRef    = useRef(isKeyboardOpen);
  const activeTabRef         = useRef(activeTab);
  const dismissKeyboardRef   = useRef(dismissKeyboard);
  isKeyboardOpenRef.current  = isKeyboardOpen;
  activeTabRef.current       = activeTab;
  dismissKeyboardRef.current = dismissKeyboard;

  // ── Online/offline events ────────────────────────────────────────────────
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Firebase auth listener — resolves authReady without splash screen ────
  //
  // Why this is more than a single timer: the webview-based Firebase JS SDK
  // restores a persisted session from IndexedDB asynchronously, and on some
  // devices / cold starts that restore can take noticeably longer than a
  // fixed timeout. If we gave up too early we'd flash the sign-in screen for
  // an already-authenticated user — the exact bug being fixed here. On native
  // builds we additionally ask the native Capacitor Firebase plugin (which
  // reads its own, much faster, natively-persisted session) whether a user
  // exists; if it says yes we extend the grace period so the JS SDK has real
  // room to catch up instead of racing a short, arbitrary cap.
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) { setAuthReady(true); return; }

    let resolved = false;
    let cap: ReturnType<typeof setTimeout>;
    let nullTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(cap);
      if (nullTimer) { clearTimeout(nullTimer); nullTimer = null; }
      setAuthReady(true);
    };

    // Fast default cap for the common "actually signed out" case.
    cap = setTimeout(finish, 2000);

    if (Capacitor.isNativePlatform()) {
      FirebaseAuthentication.getCurrentUser()
        .then(result => {
          if (resolved || !result?.user) return;
          // Native plugin confirms a persisted session exists — give the
          // slower webview JS SDK real time to resolve instead of bailing out.
          clearTimeout(cap);
          cap = setTimeout(finish, 7000);
        })
        .catch(() => {});
    }

    const unsub = onAuthStateChanged(auth, async firebaseUser => {
      if (nullTimer) { clearTimeout(nullTimer); nullTimer = null; }

      if (firebaseUser) {
        // Re-check email verification on every cold start / session resume.
        // This closes the bypass where removing the app from recents resets
        // React state so the verification screen never reappears.
        const isEmailPassword = firebaseUser.providerData.some(p => p.providerId === 'password');
        if (isEmailPassword && !firebaseUser.emailVerified) {
          setUser(firebaseUser);
          setPendingVerificationEmail(firebaseUser.email ?? "");
          finish();
          return;
        }

        setUser(firebaseUser);
        setIsGuest(false);
        finish();
        // Firestore profile bootstrap — non-blocking
        try {
          const ref = doc(db, "users", firebaseUser.uid);
          if (!(await getDoc(ref)).exists()) {
            await setDoc(ref, {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Agent",
              email: firebaseUser.email || "",
              bio: "VPN Configuration Curator & Secure Net enthusiast.",
              avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(firebaseUser.displayName || "anon")}`,
              createdAt: Date.now(), followerCount: 0, followingCount: 0,
            });
          }
        } catch {}
        initPushNotifications().catch(() => {});
      } else {
        // Wait 900 ms before treating null as "not logged in" — Firebase may
        // fire a second callback with the persisted session from IndexedDB.
        nullTimer = setTimeout(finish, 900);
      }
    });

    return () => {
      resolved = true;
      clearTimeout(cap);
      if (nullTimer) clearTimeout(nullTimer);
      unsub();
    };
  }, []);

  // ── Deep link handler (appUrlOpen) ──────────────────────────────────────
  // Handles share links opened while the app is running OR on cold-start.
  // Supported URL patterns:
  //   snix://post/{id}                            ← intent:// redirect from share page
  //   https://snixapp.com/api/share/post/{id}    ← direct API share link
  //   https://snixapp.pages.dev/post/{id}        ← legacy web share link
  useEffect(() => {
    const parseDeepLink = (url: string): DeepLink | null => {
      try {
        // Matches /post/{id} anywhere in the URL path, covering all variants above.
        const m = url.match(/\/post\/([^/?#]+)/);
        if (!m) return null;
        return { postId: m[1] };
      } catch { return null; }
    };

    // Handle links when app is already in foreground
    const sub = CapApp.addListener("appUrlOpen", (event: { url: string }) => {
      const link = parseDeepLink(event.url);
      if (link) { setDeepLink(link); setActiveTab("feed"); }
    });

    // Also check launch URL for cold-starts via a deep link
    CapApp.getLaunchUrl().then((result) => {
      if (result?.url) {
        const link = parseDeepLink(result.url);
        if (link) { setDeepLink(link); setActiveTab("feed"); }
      }
    }).catch(() => {});

    return () => { sub.then(s => s.remove()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Android back button ──────────────────────────────────────────────────
  useEffect(() => {
    const sub = CapApp.addListener("backButton", () => {
      if (isKeyboardOpenRef.current) { dismissKeyboardRef.current(); return; }
      if (activeTabRef.current === "user-detail") { setActiveTab("feed"); return; }
      setShowExitConfirm(true);
    });
    return () => { sub.then(s => s.remove()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isFirebaseConfigured) return <FirebaseNotConfigured />;

  // ── Sync-before-navigate ─────────────────────────────────────────────────
  // Uses a ref lock so rapid taps don't trigger concurrent syncs.
  const navigateToTab = useCallback(async (tab: TabType) => {
    if (syncInProgressRef.current) return;

    if (!navigator.onLine) {
      setSyncError("No internet connection. Enable Wi-Fi or mobile data to continue.");
      return;
    }

    syncInProgressRef.current = true;
    setSyncingToTab(tab);
    setSyncError(null);

    try {
      const reachable = await checkServerReachable();
      if (!reachable) {
        setSyncError("Unable to reach SNIX servers. Check your internet connection and try again.");
        setIsOnline(false);
        return;
      }
      setIsOnline(true);
      setActiveTab(tab);
    } finally {
      setSyncingToTab(null);
      syncInProgressRef.current = false;
    }
  }, []); // stable — uses ref lock, no state deps

  const handleAuthorClick    = (uid: string)                      => { setSelectedUserUid(uid); navigateToTab("user-detail"); };
  const handleMyProfileClick = ()                                  => { if (user) { setSelectedUserUid(user.uid); navigateToTab("profile"); } };
  const handleGuestContinue  = ()                                  => { setIsGuest(true); };
  const handleNotificationTap = (postId: string, commentId?: string) => { setDeepLink({ postId, commentId }); setActiveTab("feed"); };
  const handleSignInRequired = () => { setUser(null); setIsGuest(false); setActiveTab("feed"); };

  // googleSigningIn: true while native credential exchange runs in background
  // (after Google picker closes). Hides AuthView so the user isn't staring at
  // a loading button for the extra 1-2 s Firebase JS SDK token exchange takes.
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const showingAuth = authReady && !user && !isGuest && !googleSigningIn;

  return (
    <PhoneContainer>
      <Toaster position="top-center" richColors closeButton={false} />

      {/* Full-screen offline overlay */}
      {isOnline === false && !syncingToTab && <OfflineBanner />}

      {/* Left-side vertical progress bar — shown during tab navigation */}
      {syncingToTab !== null && <SyncProgressBar syncing={syncingToTab !== null} />}

      {/* Sync error toast */}
      {syncError && (
        <SyncErrorToast message={syncError} onDismiss={() => setSyncError(null)} />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} isGuest={isGuest} onSignInRequired={handleSignInRequired} />
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onPointerDown={() => setShowExitConfirm(false)} />
          <div className="relative bg-white rounded-2xl mx-8 p-6 shadow-2xl w-full max-w-xs">
            <div className="flex flex-col items-center gap-1 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mb-1">
                <X size={22} className="text-red-500" />
              </div>
              <h2 className="font-black text-slate-900 text-base">Leave SNIX?</h2>
              <p className="text-sm text-slate-500 text-center leading-snug">Are you sure you want to exit the app?</p>
            </div>
            <div className="flex gap-3">
              <button onPointerDown={() => setShowExitConfirm(false)}
                className="flex-1 py-3 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 active:bg-slate-200">Stay</button>
              <button onPointerDown={() => { setShowExitConfirm(false); CapApp.exitApp(); }}
                className="flex-1 py-3 bg-red-500 rounded-xl text-sm font-bold text-white active:bg-red-600">Exit</button>
            </div>
          </div>
        </div>
      )}

      {/* Email verification screen — survives the auth state change that unmounts AuthView */}
      {pendingVerificationEmail && (
        <div className="fixed inset-0 z-[400] flex flex-col bg-slate-50">
          <div className="flex-1 flex flex-col justify-center items-center px-6 py-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-5">
              <MailCheck size={28} className="text-blue-600" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Confirm your email</h1>
            <p className="text-sm text-slate-500 mt-3 max-w-[300px]">
              We've sent a confirmation link to{" "}
              <span className="font-bold text-slate-800 break-all">{pendingVerificationEmail}</span>.
              Open it to verify your account.
            </p>
            <p className="text-xs text-slate-400 mt-2 max-w-[300px]">Didn't get it? Check your spam folder, or resend below.</p>
            {verificationError && (
              <div className="mt-4 w-full max-w-[300px] p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium flex items-start gap-2 border border-red-100 text-left">
                <span className="font-bold shrink-0">Error:</span>
                <span className="break-all">{verificationError}</span>
              </div>
            )}
            <button
              type="button"
              onClick={async () => {
                if (!auth.currentUser || resendState === "sending") return;
                setResendState("sending");
                try {
                  await sendEmailVerification(auth.currentUser);
                  setResendState("sent");
                  setVerificationError("");
                } catch (err: any) {
                  setResendState("idle");
                  setVerificationError(err?.message || "Couldn't send the confirmation email. Please try again.");
                }
              }}
              disabled={resendState === "sending"}
              className="mt-6 w-full max-w-[280px] py-3 bg-white text-slate-700 font-bold rounded-xl text-xs tracking-wider uppercase border border-slate-200 shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {resendState === "sending"
                ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-transparent" />
                : resendState === "sent" ? "Email resent ✓" : "Resend confirmation email"}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!auth.currentUser) return;
                setVerificationError("");
                try {
                  // Reload the Firebase user to fetch the latest emailVerified flag.
                  await auth.currentUser.reload();
                  if (auth.currentUser.emailVerified) {
                    setPendingVerificationEmail("");
                    setVerificationError("");
                    setResendState("idle");
                    setActiveTab("feed");
                  } else {
                    setVerificationError("Email not verified yet. Please open the link we sent you, then tap this button again.");
                  }
                } catch (err: any) {
                  setVerificationError(err?.message || "Could not check verification status. Please try again.");
                }
              }}
              className="mt-3 w-full max-w-[280px] py-3 bg-slate-950 text-white font-bold rounded-xl text-xs tracking-wider uppercase shadow-md hover:bg-slate-900 flex items-center justify-center gap-2"
            >
              I've verified my email <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Auth not yet resolved → blank screen (no icon, no spinner) */}
      {!authReady ? (
        <AuthBootstrap />
      ) : showingAuth ? (
        <AuthView
          onAuthSuccess={() => { setGoogleSigningIn(false); setActiveTab("feed"); }}
          onNewAccountCreated={(email) => { setPendingVerificationEmail(email); setVerificationError(""); setResendState("idle"); }}
          onGuestContinue={handleGuestContinue}
          onGoogleOptimisticAuth={() => setGoogleSigningIn(true)}
          onGoogleAuthFailed={() => setGoogleSigningIn(false)}
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {activeTab === "feed" && (
              <FeedView
                onAuthorClick={handleAuthorClick}
                isGuest={isGuest}
                onAboutPress={handleOpenSettings}
                onSignInRequired={handleSignInRequired}
                deepLink={deepLink}
                onDeepLinkConsumed={() => setDeepLink(null)}
              />
            )}
            {activeTab === "create" && (
              <CreatePostView onSuccess={() => setActiveTab("feed")} isGuest={isGuest}
                onSignInRequired={handleSignInRequired} />
            )}
            {activeTab === "profile" && user && (
              <ProfileView userUid={user.uid} isGuest={false} onNotificationTap={handleNotificationTap} />
            )}
            {activeTab === "user-detail" && (
              <ProfileView userUid={selectedUserUid} isGuest={isGuest} onBackToFeed={() => setActiveTab("feed")} />
            )}
          </div>
          <BottomNav
            activeTab={activeTab}
            navigateToTab={navigateToTab}
            onProfileClick={handleMyProfileClick}
            isGuest={isGuest}
            onSignInRequired={handleSignInRequired}
            unreadCount={unreadCount}
          />
        </div>
      )}
    </PhoneContainer>
  );
}

export default function App() {
  return (
    <KeyboardProvider>
      <AppInner />
    </KeyboardProvider>
  );
}
