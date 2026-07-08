import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { db, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, onSnapshot, doc, updateDoc, setDoc, deleteDoc, where, increment, getDocs, addDoc } from "firebase/firestore";
import { VPNPost, VPN_APPS_LIST, PostReaction, COUNTRIES } from "../types";

import { Search, Download, Copy, Layers, Sparkles, Eye, EyeOff, Cloud, FileCode, LogIn, Clock, CheckCircle, MessageCircle, Trash2, Globe, RefreshCw, UserCheck, Trophy, Flag, X } from "lucide-react";
import { notifyRefreshed } from "../utils/feedback";
import LeaderboardModal from "./LeaderboardModal";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
import CommentsSheet from "./CommentsSheet";
import VKInput from "./VKInput";
import LinkText from "./LinkText";

const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

// ── Per-device action tracking (stable across app restarts, resets on reinstall) ─
const DEVICE_VIEWED_KEY     = "snix_dv";   // viewed post IDs
const DEVICE_DOWNLOADED_KEY = "snix_dd";   // downloaded post IDs
const DEVICE_COPIED_KEY     = "snix_dc";   // copied post IDs

function getDeviceSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); }
}
function deviceHasSeen(key: string, postId: string): boolean {
  return getDeviceSet(key).has(postId);
}
function markDeviceSeen(key: string, postId: string) {
  try {
    const s = getDeviceSet(key);
    s.add(postId);
    // Keep last 500 entries to avoid unbounded growth
    localStorage.setItem(key, JSON.stringify([...s].slice(-500)));
  } catch {}
}

/**
 * Increment a post stat via the API server (Admin SDK) instead of directly
 * from the client. This avoids the optimistic-update flicker that happens when
 * Firestore security rules reject an unauthenticated write.
 */
async function trackStatViaApi(postId: string, action: "view" | "download" | "copy") {
  try {
    const base = ((import.meta as any).env?.VITE_API_BASE_URL || "").replace(/\/$/, "");
    if (!base) return;
    await fetch(`${base}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, action }),
    });
  } catch { /* silent — best-effort */ }
}

// Track which post IDs we've already incremented viewCount for this session.
// Module-scope so it persists across FeedView remounts but resets on page reload.
const viewedThisSession = new Set<string>();

function ViewTracker({ postId }: { postId: string }) {
  useEffect(() => {
    if (viewedThisSession.has(postId)) return;
    // Optimistically lock so rapid re-renders don't fire concurrent calls.
    viewedThisSession.add(postId);
    // Per-device dedup — prevents guest re-counting across sessions on same phone
    if (deviceHasSeen(DEVICE_VIEWED_KEY, postId)) return;
    // Mark localStorage only after a successful write so a transient failure
    // lets the view be counted on the next visit.
    if (auth.currentUser) {
      // Signed-in: write directly (allowed by security rules, no flicker)
      updateDoc(doc(db, "posts", postId), { viewCount: increment(1), authedViewCount: increment(1) })
        .then(() => markDeviceSeen(DEVICE_VIEWED_KEY, postId))
        .catch(() => { viewedThisSession.delete(postId); });
    } else {
      // Guest: route through Admin SDK to avoid optimistic-update flicker
      trackStatViaApi(postId, "view")
        .then(() => markDeviceSeen(DEVICE_VIEWED_KEY, postId));
    }
  }, [postId]);
  return null;
}

const COUNTRY_PREF_KEY = "snix_country_filter";

async function copyToClipboard(text: string) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return; } } catch {}
  const el = document.createElement("textarea"); el.value = text; el.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
  document.body.appendChild(el); el.focus(); el.select();
  try { document.execCommand("copy"); } catch {} document.body.removeChild(el);
}

/** Returns an available file name in the given folder/dir, appending (1),(2)… if needed. */
async function findAvailableFileName(FS: any, folder: string, dir: string, fileName: string): Promise<string> {
  try {
    await FS.stat({ path: `${folder}/${fileName}`, directory: dir });
    // File already exists — find a free (N) suffix
    const lastDot = fileName.lastIndexOf(".");
    const base = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
    const ext  = lastDot > 0 ? fileName.slice(lastDot)  : "";
    for (let i = 1; i <= 999; i++) {
      const candidate = `${base}(${i})${ext}`;
      try {
        await FS.stat({ path: `${folder}/${candidate}`, directory: dir });
        // Still exists, keep trying
      } catch {
        return candidate; // free slot found
      }
    }
    return `${base}(${Date.now()})${ext}`; // fallback
  } catch {
    return fileName; // original name is free
  }
}

async function saveFileNative(fileName: string, content: string, isBinary: boolean): Promise<{ path: string; location: string; needsAllFilesAccess?: boolean } | null> {
  const FS = (window as any).Capacitor?.Plugins?.Filesystem;
  if (!FS) return null;
  // requestPermissions() on Android 11+ will open the "All Files Access" settings
  // page for MANAGE_EXTERNAL_STORAGE if it is declared in the manifest. We await
  // it so that if the user grants it before returning, the next write succeeds.
  try { await FS.requestPermissions(); } catch {}
  const attempts: Array<{ dir: string; folder: string; label: string }> = [
    { dir: "EXTERNAL_STORAGE", folder: "Download/SNIX/configs", label: "Downloads/SNIX/configs" },
    { dir: "EXTERNAL",         folder: "SNIX/configs",          label: "Files › SNIX › configs" },
    { dir: "DATA",             folder: "SNIX/configs",          label: "App internal storage (SNIX/configs)" },
  ];
  let externalStorageFailed = false;
  for (const { dir, folder, label } of attempts) {
    try {
      await FS.mkdir({ path: folder, directory: dir, recursive: true }).catch(() => {});
      // Avoid overwriting: find a free name like file(1).ext, file(2).ext …
      const safeName = await findAvailableFileName(FS, folder, dir, fileName);
      const fullPath = `${folder}/${safeName}`;
      let result: { uri: string };
      if (isBinary) {
        result = await FS.writeFile({ path: fullPath, data: content, directory: dir });
      } else {
        result = await FS.writeFile({ path: fullPath, data: content, directory: dir, encoding: "utf8" });
      }
      return { path: result.uri.replace("file://", ""), location: label, needsAllFilesAccess: externalStorageFailed };
    } catch (e) {
      console.warn(`[SNIX] writeFile to ${dir}/${folder} failed:`, e);
      if (dir === "EXTERNAL_STORAGE") externalStorageFailed = true;
    }
  }
  return null;
}

function saveBlobFallback(post: VPNPost) {
  let blob: Blob;
  if (post.isBinary) {
    try {
      const bin = atob(post.configContent); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: "application/octet-stream" });
    } catch { blob = new Blob([post.configContent], { type: "text/plain" }); }
  } else { blob = new Blob([post.configContent], { type: "text/plain" }); }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = post.configFileName || "config.conf";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getCloudUrl(postId: string) {
  const base = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "")
    || (window.location.origin.startsWith("capacitor://") || window.location.origin.startsWith("file:") || window.location.origin === "http://localhost"
        ? "https://snixapp.com" : window.location.origin);
  return `${base}/api/configs/${postId}/raw`;
}

function GuestPrompt({ action, onSignIn }: { action: string; onSignIn: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onSignIn}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full bg-white rounded-t-3xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400"><LogIn size={26} /></div>
          <div>
            <h3 className="text-lg font-black text-slate-900">Sign In to {action}</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-[240px] mx-auto">Create a free SNIX account to unlock all features.</p>
          </div>
          <button onClick={onSignIn} className="w-full py-3 bg-gradient-to-r from-blue-600 to-emerald-500 text-white font-bold rounded-xl text-xs tracking-wider uppercase shadow-md">Sign In / Create Account</button>
        </div>
      </div>
    </div>
  );
}

function ExpiryBadge({ post }: { post: VPNPost }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!post.expiresAt) return;
    if (post.expiresAt - Date.now() > 24 * 3600000) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [post.expiresAt, tick > 0 ? 0 : 0]);

  // Manual expiry always shows EXPIRED badge — no 24 h grace, no timer
  if (post.expiredManually) {
    return <span className="text-[9px] font-bold bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={9} />EXPIRED</span>;
  }

  if (!post.expiresAt) return null;
  const now = Date.now();
  const remaining = post.expiresAt - now;

  if (remaining < 0) {
    const graceLeft = (post.expiresAt + 24 * 3600000) - now;
    if (graceLeft < 0) return null;
    return <span className="text-[9px] font-bold bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={9} />EXPIRED</span>;
  }

  if (remaining < 24 * 3600000) {
    const totalSecs = Math.max(0, Math.floor(remaining / 1000));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const label = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    const isUrgent = remaining < 3 * 3600000;
    return <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 font-mono ${isUrgent?"bg-red-100 text-red-600 border border-red-200 animate-pulse":"bg-orange-100 text-orange-600 border border-orange-200"}`}><Clock size={9} />{label}</span>;
  }

  const days = Math.floor(remaining / 86400000);
  const hrs = Math.floor((remaining % 86400000) / 3600000);
  const label = days > 0 ? `${days}d ${hrs}h` : `${hrs}h left`;
  return <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-emerald-100 text-emerald-700 border border-emerald-200"><Clock size={9} />{label}</span>;
}

function DownloadToast({ location, onDismiss }: { location: string; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 5000); return () => clearTimeout(t); }, []);
  return (
    <div className="fixed bottom-24 left-3 right-3 z-50 bg-slate-900 rounded-2xl px-4 py-3 shadow-2xl flex items-start gap-3">
      <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
        <CheckCircle size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white mb-0.5">Config Saved!</p>
        <p className="text-[10px] text-emerald-400 font-medium leading-relaxed">{location}</p>
      </div>
      <button onClick={onDismiss} className="text-slate-500 hover:text-white transition-colors shrink-0 mt-0.5 text-base leading-none">✕</button>
    </div>
  );
}

function DownloadRing({ size = 12 }: { size?: number }) {
  const r = (size / 2) - 1.5;
  const circ = 2 * Math.PI * r;
  return (
    <svg className="animate-spin" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={2.5}
        strokeDasharray={`${circ * 0.7} ${circ * 0.3}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}

interface FeedViewProps { onAuthorClick: (uid: string) => void; isGuest: boolean; onAboutPress: () => void; onSignInRequired: () => void; deepLink?: { postId: string; commentId?: string } | null; onDeepLinkConsumed?: () => void; }

export default function FeedView({ onAuthorClick, isGuest, onAboutPress, onSignInRequired, deepLink, onDeepLinkConsumed }: FeedViewProps) {
  const [posts, setPosts] = useState<VPNPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAppFilter, setSelectedAppFilter] = useState("All");
  const [selectedCountryFilter, setSelectedCountryFilter] = useState("All");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [userReactions, setUserReactions] = useState<Record<string, 'heart'|'ok'|'down'>>({});
  const [downloadedId, setDownloadedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [guestAction, setGuestAction] = useState<string | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [copiedCountedIds, setCopiedCountedIds] = useState<Set<string>>(new Set());
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [myCountry, setMyCountry] = useState<string | undefined>(undefined);
  // Live copy of the signed-in user's own avatar, always sourced fresh from
  // Firestore rather than each post's denormalized `authorAvatar` field —
  // that field is only backfilled onto existing posts when the avatar is
  // changed, so a stale local cache (Firestore's offline persistence) or a
  // missed backfill could otherwise show your old avatar in the Feed even
  // after you've updated it. Overriding with this live value for your own
  // posts guarantees the Feed always reflects your current avatar.
  const [myAvatar, setMyAvatar] = useState<string | undefined>(undefined);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, "users", uid), snap => {
      setMyCountry(snap.data()?.country || undefined);
      setMyAvatar(snap.data()?.avatarUrl || undefined);
    });
    return () => unsub();
  }, []);
  const [highlightCommentId, setHighlightCommentId] = useState<string | undefined>();
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [markingExpiredId, setMarkingExpiredId] = useState<string | null>(null);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [showStorageHint, setShowStorageHint] = useState(false);
  const [expandedCountries, setExpandedCountries] = useState<Record<string, boolean>>({});
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [retryCountdown, setRetryCountdown] = useState(10);
  const [followingUids, setFollowingUids] = useState<string[]>([]);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [viewStatsPostId, setViewStatsPostId] = useState<string|null>(null);
  const [downloadStatsPostId, setDownloadStatsPostId] = useState<string|null>(null);
  const [longPressPostId, setLongPressPostId] = useState<string|null>(null);
  const [reportedPostId, setReportedPostId] = useState<string|null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  // Post-navigation deep link (e.g. tapping a post from the "Reacted" tab) —
  // scrolls the target post into view and highlights it with a moving
  // blue/green border for a few seconds, instead of opening its comments.
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Pull-to-refresh state
  const scrollRef = useRef<HTMLDivElement>(null);
  const pullStartY = useRef<number | null>(null);
  const pullDeltaY = useRef(0);
  const [pullProgress, setPullProgress] = useState(0); // 0–1

  const PULL_THRESHOLD = 64; // px needed to trigger refresh

  const triggerRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshKey(k => k + 1);
    // Firestore onSnapshot re-subscribes; show spinner for at least 800ms
    setTimeout(() => { setRefreshing(false); notifyRefreshed("Feed refreshed!"); }, 900);
  }, [refreshing]);

  const handleScrollTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) return; // only activate at top
    pullStartY.current = e.touches[0].clientY;
    pullDeltaY.current = 0;
  };

  const handleScrollTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pullStartY.current === null) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) { pullStartY.current = null; setPullProgress(0); return; }
    const delta = e.touches[0].clientY - pullStartY.current;
    pullDeltaY.current = Math.max(0, delta);
    setPullProgress(Math.min(pullDeltaY.current / PULL_THRESHOLD, 1));
  };

  const handleScrollTouchEnd = () => {
    if (pullStartY.current !== null && pullDeltaY.current >= PULL_THRESHOLD) {
      triggerRefresh();
    }
    pullStartY.current = null;
    pullDeltaY.current = 0;
    setPullProgress(0);
  };

  // Always auto-detect country from IP every cold launch.
  // Falls back to last-known if the fetch fails or times out.
  // Also writes the detected country to Firestore (for the user's profile /
  // local leaderboard) when the user hasn't already set one manually.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    fetch("https://ipapi.co/json/", { signal: controller.signal })
      .then(r => r.json())
      .then((data: { country_code?: string }) => {
        clearTimeout(timeoutId);
        if (cancelled) return;
        const code = data.country_code;
        if (code && COUNTRIES.some(c => c.code === code)) {
          setSelectedCountryFilter(code);
          localStorage.setItem(COUNTRY_PREF_KEY, code); // cache as fallback
          // Write to Firestore so the Leaderboard Local tab works automatically.
          // Use merge:true and only set if not already present — we never want
          // the auto-detect to clobber a country the user picked manually.
          const uid = auth.currentUser?.uid;
          if (uid) {
            import("firebase/firestore").then(({ doc: fsDoc, getDoc, updateDoc: fsUpdateDoc }) => {
              getDoc(fsDoc(db, "users", uid)).then(snap => {
                if (snap.exists() && !snap.data()?.country) {
                  fsUpdateDoc(fsDoc(db, "users", uid), { country: code }).catch(() => {});
                }
              }).catch(() => {});
            }).catch(() => {});
          }
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        if (cancelled) return;
        // Fetch failed (offline / timeout) — use last known country
        const stored = localStorage.getItem(COUNTRY_PREF_KEY);
        if (stored) setSelectedCountryFilter(stored);
      });
    return () => { cancelled = true; controller.abort(); clearTimeout(timeoutId); };
  }, []);

  // Save country preference whenever user changes it — also writes to Firestore
  // so the Leaderboard Local tab reflects the manual pick immediately.
  const setCountryFilter = (code: string) => {
    setSelectedCountryFilter(code);
    localStorage.setItem(COUNTRY_PREF_KEY, code);
    const uid = auth.currentUser?.uid;
    if (uid && code && code !== "All") {
      setDoc(doc(db, "users", uid), { country: code }, { merge: true }).catch(() => {});
    }
  };

  // Track online/offline state from browser events
  useEffect(() => {
    const goOnline  = () => { setIsOffline(false); triggerRefresh(); };
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [triggerRefresh]);

  // 10-second retry countdown when offline and no posts loaded
  useEffect(() => {
    if (!isOffline || posts.length > 0) return;
    setRetryCountdown(10);
    const tick = setInterval(() => {
      setRetryCountdown(n => {
        if (n <= 1) { triggerRefresh(); return 10; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [isOffline, posts.length, triggerRefresh]);

  useEffect(() => {
    setLoading(true);
    setIsOffline(!navigator.onLine);

    const unsubPosts = onSnapshot(query(collection(db, "posts")), snap => {
      const now = Date.now(), grace = 24*3600000;
      const data: VPNPost[] = [];
      snap.forEach(d => {
        const p = { id: d.id, ...d.data() } as VPNPost;
        if (p.expiresAt && now > p.expiresAt + grace) return;
        data.push(p);
      });
      data.sort((a,b) => ((b.createdAt as number)||0) - ((a.createdAt as number)||0));
      setPosts(data);
      setIsOffline(false);
      setLoading(false);
    }, () => {
      // onSnapshot error fires after ~10 s when fully offline
      setIsOffline(true);
      setLoading(false);
    });

    const currentUser = auth.currentUser;
    let unsubReactions = () => {};
    let unsubFollowing = () => {};
    if (currentUser) {
      unsubReactions = onSnapshot(query(collection(db,"reactions"),where("userId","==",currentUser.uid)), snap => {
        const map: Record<string, 'heart'|'ok'|'down'> = {};
        snap.forEach(d => { const r = d.data() as PostReaction; map[r.postId] = r.type; });
        setUserReactions(map);
      }, () => {});
      unsubFollowing = onSnapshot(query(collection(db,"follows"),where("followerId","==",currentUser.uid)), snap => {
        setFollowingUids(snap.docs.map(d => d.data().followingId));
      }, () => {});
    } else {
      setFollowingUids([]);
    }
    return () => { unsubPosts(); unsubReactions(); unsubFollowing(); };
  }, [refreshKey]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (!deepLink?.postId) return;
    if (deepLink.commentId) {
      // Deep-linked from a comment notification — open that post's comments,
      // scrolled/highlighted to the specific comment.
      setCommentPostId(deepLink.postId);
      setHighlightCommentId(deepLink.commentId);
    } else {
      // Deep-linked from elsewhere (e.g. the "Reacted" tab) — jump straight
      // to the post in the feed instead of opening comments. Clear any
      // active filters first so the target post is guaranteed to be visible.
      setSearchQuery("");
      setSelectedAppFilter("All");
      setSelectedCountryFilter("All");
      setFollowingOnly(false);
      setHighlightPostId(deepLink.postId);
    }
    onDeepLinkConsumed?.();
  }, [deepLink?.postId, deepLink?.commentId]);

  // Once the highlighted post is in the (possibly just-reset) filtered list,
  // scroll it into view and keep it highlighted for a few seconds. The post
  // may not be mounted yet right after the deep link fires (Firestore
  // snapshot / filter-reset re-render can land a beat later), so this keeps
  // retrying — driven by both animation frames and by re-running whenever
  // the visible post list changes — for a bounded window rather than a
  // fixed frame count.
  const [scrolledToHighlight, setScrolledToHighlight] = useState(false);
  useEffect(() => { setScrolledToHighlight(false); }, [highlightPostId]);

  useEffect(() => {
    if (!highlightPostId || scrolledToHighlight) return;
    const el = postRefs.current[highlightPostId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setScrolledToHighlight(true);
    }
  }, [highlightPostId, scrolledToHighlight, filteredPosts]);

  useEffect(() => {
    if (!highlightPostId) return;
    let raf = 0;
    const deadline = Date.now() + 4000;
    const tryScroll = () => {
      const el = postRefs.current[highlightPostId];
      if (el) {
        if (!scrolledToHighlight) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setScrolledToHighlight(true);
        }
        return;
      }
      if (Date.now() < deadline) raf = requestAnimationFrame(tryScroll);
    };
    tryScroll();
    const clearTimer = setTimeout(() => setHighlightPostId(null), 6000);
    return () => { cancelAnimationFrame(raf); clearTimeout(clearTimer); };
  }, [highlightPostId]);



  const handleCopy = (postId: string, content: string) => {
    // Guests are allowed to copy configs — count once per device
    copyToClipboard(content).finally(() => {
      setCopiedId(postId);
      setTimeout(() => setCopiedId(null), 2000);
      if (!copiedCountedIds.has(postId) && !deviceHasSeen(DEVICE_COPIED_KEY, postId)) {
        setCopiedCountedIds(prev => { const s = new Set(prev); s.add(postId); return s; });
        markDeviceSeen(DEVICE_COPIED_KEY, postId);
        if (auth.currentUser) {
          updateDoc(doc(db, "posts", postId), { downloadCount: increment(1), authedDownloadCount: increment(1) }).catch(() => {});
        } else {
          trackStatViaApi(postId, "copy");
        }
      }
    });
  };

  const handleCopyCloudLink = (postId: string) => {
    // Guests are allowed to copy cloud links
    const post = posts.find(p => p.id === postId);
    let content: string;
    if (post?.sharingMode === 'cloud_link') {
      content = post.configContent?.trim() || '';
    } else {
      content = getCloudUrl(postId);
    }
    if (!content) return;
    copyToClipboard(content).finally(() => {
      setCopiedId(postId);
      setTimeout(() => setCopiedId(null), 2000);
      // Increment copy counter once per device per post (counts guests too).
      // Uses downloadCount field — cloud posts are never downloaded so it's free.
      if (!copiedCountedIds.has(postId) && !deviceHasSeen(DEVICE_COPIED_KEY, postId)) {
        setCopiedCountedIds(prev => { const s = new Set(prev); s.add(postId); return s; });
        markDeviceSeen(DEVICE_COPIED_KEY, postId);
        if (auth.currentUser) {
          updateDoc(doc(db, "posts", postId), { downloadCount: increment(1), authedDownloadCount: increment(1) }).catch(() => {});
        } else {
          trackStatViaApi(postId, "copy");
        }
      }
    });
  };

  const handleDownload = async (post: VPNPost) => {
    // Guests are allowed to download configs
    if (downloadingId === post.id) return;
    const currentUser = auth.currentUser;
    const fileName = post.configFileName || `${post.title.toLowerCase().replace(/\s+/g,"_")}.conf`;
    setDownloadingId(post.id);
    let savedOk = false;
    if (isNative) {
      const result = await saveFileNative(fileName, post.configContent, !!post.isBinary);
      if (result) {
        savedOk = true;
        setDownloadToast(result.location);
        // If ExternalStorage (Downloads folder) failed and we fell back to the
        // app-specific external directory, show a one-time guide so the user
        // knows how to unlock the proper Downloads location.
        if (result.needsAllFilesAccess && !sessionStorage.getItem("snix_storage_hint_shown")) {
          sessionStorage.setItem("snix_storage_hint_shown", "1");
          setTimeout(() => setShowStorageHint(true), 1800); // show after toast appears
        }
      } else {
        setDownloadToast("Storage unavailable — check app permissions in Settings");
      }
    } else {
      saveBlobFallback(post);
      savedOk = true;
    }
    setDownloadingId(null);
    if (savedOk) {
      setDownloadedId(post.id);
      setTimeout(() => setDownloadedId(null), 2500);
      // Increment download count once per device — only on a successful save.
      // Per-device localStorage dedup prevents counting the same phone multiple times.
      if (!deviceHasSeen(DEVICE_DOWNLOADED_KEY, post.id)) {
        markDeviceSeen(DEVICE_DOWNLOADED_KEY, post.id);
        if (auth.currentUser) {
          try { await updateDoc(doc(db,"posts",post.id), { downloadCount: increment(1), authedDownloadCount: increment(1) }); } catch {}
        } else {
          trackStatViaApi(post.id, "download");
        }
      }
    }
  };

  const handleReaction = async (postId: string, type: 'heart'|'ok'|'down') => {
    if (isGuest) { setGuestAction("React to Configs"); return; }
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const reactionId = `${currentUser.uid}_${postId}`;
    const reactionRef = doc(db,"reactions",reactionId), postRef = doc(db,"posts",postId);
    const existing = userReactions[postId];
    const cf = (t: string) => t==='heart'?'heartCount':t==='ok'?'okCount':'downCount';
    try {
      if (existing === type) { await deleteDoc(reactionRef); await updateDoc(postRef, { [cf(type)]: increment(-1) }); }
      else {
        if (existing) await updateDoc(postRef, { [cf(existing)]: increment(-1) });
        await setDoc(reactionRef, { id:reactionId, userId:currentUser.uid, postId, type, createdAt:Date.now() });
        await updateDoc(postRef, { [cf(type)]: increment(1) });
      }
    } catch (err) { console.error("Reaction error:", err); }
  };

  const handleMarkExpired = async (post: VPNPost) => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== post.uid) return;
    setMarkingExpiredId(post.id);
    try {
      if (post.expiredManually) {
        // Reactivate: clear manual expiry flag and remove the timestamp
        await updateDoc(doc(db, "posts", post.id), { expiredManually: false, expiresAt: null });
      } else {
        // Mark as expired right now — sets a past timestamp so time-based
        // checks also agree, and sets the flag for permanent badge display
        await updateDoc(doc(db, "posts", post.id), { expiredManually: true, expiresAt: Date.now() - 1 });
      }
    } catch (err) { console.error("Mark expired error:", err); }
    finally { setMarkingExpiredId(null); }
  };

  const handleDeletePost = async (postId: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setDeletingPostId(postId);
    try {
      const rSnap = await getDocs(query(collection(db,"reactions"),where("postId","==",postId)));
      for (const d of rSnap.docs) await deleteDoc(d.ref);
      const cSnap = await getDocs(query(collection(db,"comments"),where("postId","==",postId)));
      for (const d of cSnap.docs) await deleteDoc(d.ref);
      await deleteDoc(doc(db,"posts",postId));
    } catch (err) { console.error("Delete error:", err); }
    finally { setDeletingPostId(null); setConfirmDeletePostId(null); }
  };

  const handleReportPost = async (postId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLongPressPostId(null); setGuestAction("Report Configs"); return; }
    setLongPressPostId(null);
    try {
      await addDoc(collection(db, "reports"), {
        postId, reportedBy: uid, type: "post", createdAt: Date.now(), status: "pending",
      });
    } catch {}
    setReportedPostId(postId);
    setTimeout(() => setReportedPostId(null), 3500);
  };

  const handleLongPressStart = useCallback((postId: string) => {
    longPressTimerRef.current = setTimeout(() => setLongPressPostId(postId), 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  }, []);

  const formatTimeAgo = (ts: number) => {
    const d = Date.now()-ts, m = Math.floor(d/60000), h = Math.floor(m/60), dy = Math.floor(h/24);
    if (m<1) return "Just now"; if (m<60) return `${m}m ago`; if (h<24) return `${h}h ago`; return `${dy}d ago`;
  };

  const getAppTagStyles = (app: string) => {
    switch(app.toLowerCase()) {
      case "openvpn": return "bg-blue-100 text-blue-800 border-blue-200";
      case "wireguard": return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "shadowsocks": return "bg-slate-100 text-slate-800 border-slate-200";
      case "http injector": return "bg-purple-100 text-purple-800 border-purple-200";
      case "v2ray / vmess": return "bg-orange-100 text-orange-800 border-orange-200";
      default: return "bg-cyan-100 text-cyan-800 border-cyan-200";
    }
  };

  // ── Share ─────────────────────────────────────────────────────────────────
  // Builds a human-readable share message tailored to the post's content type,
  // then uses the Web Share API (Android native share sheet) or falls back to
  // copying the message to the clipboard.
  const currentUserId = auth.currentUser?.uid;
  const filteredPosts = posts.filter(p => {
    const vpnName = p.vpnApp==="Other"?(p.customVpnName||"Other"):p.vpnApp;
    const matchSearch = [p.title,p.description,vpnName,p.authorName].some(s=>s.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchApp = selectedAppFilter==="All" || p.vpnApp===selectedAppFilter;
    const matchCountry = selectedCountryFilter==="All"
      || (p.countries && (p.countries.includes(selectedCountryFilter) || p.countries.includes('GLOBAL')));
    const matchFollowing = !followingOnly || followingUids.includes(p.uid);
    return matchSearch && matchApp && matchCountry && matchFollowing;
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {guestAction && <GuestPrompt action={guestAction} onSignIn={() => { setGuestAction(null); onSignInRequired(); }} />}

      {/* ── View stats popup ────────────────────────────────────────────── */}
      {viewStatsPostId && (() => {
        const vp = posts.find(p => p.id === viewStatsPostId);
        if (!vp) return null;
        return (
          <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => setViewStatsPostId(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative w-full bg-white rounded-t-3xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center"><Eye size={16} className="text-blue-600" /></div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">View Stats</h3>
                  <p className="text-[10px] text-slate-400 font-medium line-clamp-1">{vp.title}</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl divide-y divide-slate-100 mb-3">
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-xs text-slate-600 font-semibold">Total Views</span>
                  <span className="text-sm font-black text-slate-900">{vp.viewCount ?? 0}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-xs text-blue-600 font-semibold flex items-center gap-1.5"><LogIn size={12} />Signed-in Views</span>
                  <span className="text-sm font-bold text-blue-600">{vp.authedViewCount ?? "—"}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5"><Eye size={12} />Guest Views</span>
                  <span className="text-sm font-bold text-slate-500">{vp.guestViewCount ?? "—"}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 text-center mb-4">Signed-in / guest breakdown tracked for new views only.</p>
              <button onClick={() => setViewStatsPostId(null)} className="w-full py-3 bg-slate-950 text-white font-bold rounded-xl text-xs tracking-wider uppercase">Close</button>
            </div>
          </div>
        );
      })()}

      {/* ── Download / copy stats popup ─────────────────────────────────── */}
      {downloadStatsPostId && (() => {
        const dp = posts.find(p => p.id === downloadStatsPostId);
        if (!dp) return null;
        const isCloud = dp.sharingMode === "cloud_link" || dp.sharingMode === "cloud_only";
        const label = isCloud ? "Copy" : "Download";
        return (
          <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => setDownloadStatsPostId(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative w-full bg-white rounded-t-3xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                  {isCloud ? <Copy size={16} className="text-emerald-600" /> : <Download size={16} className="text-emerald-600" />}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">{label} Stats</h3>
                  <p className="text-[10px] text-slate-400 font-medium line-clamp-1">{dp.title}</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-2xl divide-y divide-slate-100 mb-3">
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-xs text-slate-600 font-semibold">Total {label}s</span>
                  <span className="text-sm font-black text-slate-900">{dp.downloadCount ?? 0}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-xs text-blue-600 font-semibold flex items-center gap-1.5"><LogIn size={12} />Signed-in {label}s</span>
                  <span className="text-sm font-bold text-blue-600">{dp.authedDownloadCount ?? "—"}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5"><Eye size={12} />Guest {label}s</span>
                  <span className="text-sm font-bold text-slate-500">{dp.guestDownloadCount ?? "—"}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 text-center mb-4">Signed-in / guest breakdown tracked for new {label.toLowerCase()}s only.</p>
              <button onClick={() => setDownloadStatsPostId(null)} className="w-full py-3 bg-slate-950 text-white font-bold rounded-xl text-xs tracking-wider uppercase">Close</button>
            </div>
          </div>
        );
      })()}

      {/* ── Long-press action sheet ──────────────────────────────────────── */}
      {longPressPostId && (() => {
        const lp = posts.find(p => p.id === longPressPostId);
        if (!lp) return null;
        const isOwn = currentUserId === lp.uid;
        return (
          <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={() => setLongPressPostId(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div className="relative w-full bg-white rounded-t-3xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3" />
              <p className="text-[10px] text-slate-400 font-semibold text-center mb-3 line-clamp-1 px-4">{lp.title}</p>
              <div className="space-y-2">
                {!isOwn && (
                  <button
                    onClick={() => handleReportPost(longPressPostId)}
                    className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-red-50 active:bg-red-100 rounded-2xl transition-colors"
                  >
                    <Flag size={18} className="text-red-500 shrink-0" />
                    <div className="text-left">
                      <p className="text-sm font-bold text-red-600">Report Post</p>
                      <p className="text-[10px] text-slate-400">Report inappropriate or harmful content</p>
                    </div>
                  </button>
                )}
              </div>
              <button onClick={() => setLongPressPostId(null)} className="w-full mt-3 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-xs tracking-wider uppercase">Cancel</button>
            </div>
          </div>
        );
      })()}

      {/* ── Report confirmation toast ────────────────────────────────────── */}
      {reportedPostId && (
        <div className="fixed bottom-24 left-3 right-3 z-[60] bg-slate-900 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3">
          <CheckCircle size={18} className="text-emerald-400 shrink-0" />
          <p className="text-xs font-bold text-white flex-1">Report submitted — our team will review within 24 hours.</p>
          <button onClick={() => setReportedPostId(null)} className="text-slate-400 hover:text-white transition-colors text-sm leading-none"><X size={14} /></button>
        </div>
      )}

      {showLeaderboard && (
        <LeaderboardModal
          onClose={() => setShowLeaderboard(false)}
          currentUserCountry={myCountry}
          currentUserUid={auth.currentUser?.uid}
          isGuest={isGuest}
          onAuthorClick={uid => { setShowLeaderboard(false); onAuthorClick(uid); }}
          onSignInRequired={() => { setShowLeaderboard(false); onSignInRequired(); }}
        />
      )}

      {commentPostId && (
        <CommentsSheet
          postId={commentPostId}
          isGuest={isGuest}
          onSignInRequired={onSignInRequired}
          onClose={() => { setCommentPostId(null); setHighlightCommentId(undefined); }}
          highlightCommentId={highlightCommentId}
          currentUserAvatar={myAvatar}
          onAuthorClick={uid => { setCommentPostId(null); onAuthorClick(uid); }}
        />
      )}

      {downloadToast && <DownloadToast location={downloadToast} onDismiss={() => setDownloadToast(null)} />}

      {/* One-time "grant All Files Access" hint when Downloads folder write failed */}
      {showStorageHint && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowStorageHint(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-t-3xl p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center shrink-0">
                <span className="text-xl">📁</span>
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Enable Downloads Folder Access</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Config saved to <span className="font-bold text-slate-700">Files › SNIX › configs</span> (app folder). To save directly to your <span className="font-bold text-slate-700">Downloads</span> folder instead:
                </p>
              </div>
            </div>
            <ol className="space-y-1.5 mb-5 pl-1">
              {["Open your phone's Settings", "Go to Apps → SNIX → Permissions", "Tap Files and Media", "Select 'Allow management of all files'"].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600">
                  <span className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-black text-slate-500 shrink-0 mt-0.5">{i+1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <button
              onClick={() => {
                setShowStorageHint(false);
                // Try to open app settings using a package URI (Android)
                const App = (window as any).Capacitor?.Plugins?.App;
                if (App) App.openUrl({ url: 'package:com.mkdev.snix' }).catch(() => {});
              }}
              className="w-full py-3 bg-slate-950 text-white font-bold rounded-xl text-xs tracking-wider uppercase mb-2"
            >Open App Settings</button>
            <button onClick={() => setShowStorageHint(false)} className="w-full py-2 text-xs text-slate-400 font-medium">Got it, maybe later</button>
          </div>
        </div>
      )}

      {/* Country Picker Modal */}
      {showCountryPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowCountryPicker(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[70vh]"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
            <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-slate-100">
              <span className="text-sm font-black text-slate-900">Filter by Country</span>
              <button onClick={() => setShowCountryPicker(false)} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">✕</button>
            </div>
            <div className="px-4 py-2 border-b border-slate-100">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <VKInput
                  value={countrySearch}
                  onChange={setCountrySearch}
                  placeholder="Search country..."
                  className="w-full"
                  inputClassName="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  maxLength={50}
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-3">
              <div className="grid grid-cols-4 gap-1.5">
                {(!countrySearch) && (
                  <button
                    onClick={() => { setCountryFilter("All"); setShowCountryPicker(false); setCountrySearch(""); }}
                    className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-all col-span-4 flex-row gap-2 justify-center ${selectedCountryFilter==="All"?"border-emerald-500 bg-emerald-50 text-emerald-700":"border-slate-100 bg-slate-50 text-slate-500"}`}>
                    <span className="text-[11px] font-bold">🌍 Global / All Countries</span>
                  </button>
                )}
                {COUNTRIES.filter(c =>
                  !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase())
                ).map(c => {
                  const isActive = selectedCountryFilter === c.code;
                  return (
                    <button key={c.code}
                      onClick={() => { setCountryFilter(isActive ? "All" : c.code); setShowCountryPicker(false); setCountrySearch(""); }}
                      className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-all ${isActive?"border-emerald-500 bg-emerald-50 text-emerald-700":"border-slate-100 bg-slate-50 text-slate-500"}`}>
                      <span className="text-xl leading-none">{c.flag}</span>
                      <span className="text-[9px] font-bold mt-1">{c.code}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-2 border-b border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-black text-slate-900" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>SNIX Feed</h1>
            <p className="text-[10px] text-slate-400 font-medium">{filteredPosts.length} configs</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowLeaderboard(true)} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-orange-500 flex items-center justify-center text-white">
                <Trophy size={20} />
              </div>
              <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Ranks</span>
            </button>
            <button onClick={onAboutPress} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center text-white">
                <Layers size={20} className="snix-icon-glow" />
              </div>
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-wider">Settings</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <VKInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search configs, apps, authors..."
            className="w-full"
            inputClassName="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            maxLength={100}
          />
        </div>

        {/* App filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 no-scrollbar">
          <button onClick={() => setSelectedAppFilter("All")}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg whitespace-nowrap border transition-all uppercase tracking-wide ${selectedAppFilter==="All"?"bg-slate-950 text-white border-slate-950 shadow-sm":"bg-slate-50 text-slate-500 border-slate-200"}`}>All</button>
          {VPN_APPS_LIST.filter(a=>a!=="None").map(app => (
            <button key={app} onClick={() => setSelectedAppFilter(app)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg whitespace-nowrap border transition-all uppercase tracking-wide ${selectedAppFilter===app?"bg-gradient-to-tr from-blue-600 to-blue-500 text-white border-blue-600 shadow-sm":"bg-slate-50 text-slate-500 border-slate-200"}`}>{app}</button>
          ))}
        </div>

        {/* Country filter — globe button + active chip */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <button
            onClick={() => { if (isGuest) { setGuestAction("Set Country Filter"); return; } setShowCountryPicker(true); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${selectedCountryFilter!=="All"?"bg-emerald-600 text-white border-emerald-600 shadow-sm":"bg-slate-50 text-slate-500 border-slate-200"}`}>
            <Globe size={10} />
            {selectedCountryFilter === "All" ? "Country" : (() => { const c = COUNTRIES.find(x=>x.code===selectedCountryFilter); return c ? `${c.flag} ${c.code}` : selectedCountryFilter; })()}
          </button>
          {selectedCountryFilter !== "All" && (
            <button onClick={() => setCountryFilter("All")}
              className="px-2 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:text-red-500 transition-all">✕</button>
          )}
          {!isGuest && (
            <button
              onClick={() => setFollowingOnly(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${followingOnly?"bg-blue-600 text-white border-blue-600 shadow-sm":"bg-slate-50 text-slate-500 border-slate-200"}`}>
              <UserCheck size={10} />
              Following
            </button>
          )}
        </div>
      </div>

      {/* Pull-to-refresh indicator */}
      {(pullProgress > 0.1 || refreshing) && (
        <div
          className="flex items-center justify-center gap-2 bg-white border-b border-slate-100 transition-all overflow-hidden"
          style={{ height: refreshing ? 36 : Math.round(pullProgress * 36) }}
        >
          <RefreshCw
            size={14}
            className={`text-emerald-500 transition-transform ${refreshing ? "animate-spin" : ""}`}
            style={{ transform: refreshing ? undefined : `rotate(${pullProgress * 360}deg)` }}
          />
          <span className="text-[10px] font-bold text-slate-500">
            {refreshing ? "Refreshing…" : pullProgress >= 1 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-4 bg-slate-50/50"
        style={{ paddingTop: '12px' }}
        onTouchStart={handleScrollTouchStart}
        onTouchMove={handleScrollTouchMove}
        onTouchEnd={handleScrollTouchEnd}
        onTouchCancel={handleScrollTouchEnd}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent" />
            <span className="text-xs text-slate-400 font-medium">Loading configs...</span>
          </div>
        ) : isOffline && posts.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center flex flex-col items-center gap-3 shadow-sm">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
              </svg>
            </div>
            <h4 className="text-sm font-bold text-slate-800">Please check your internet connection</h4>
            <p className="text-xs text-slate-500 max-w-[220px] leading-relaxed">
              Unable to load configurations. Connect to Wi-Fi or mobile data.
            </p>
            <button
              onClick={triggerRefresh}
              className="mt-1 flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl active:bg-emerald-600 transition-colors"
            >
              <RefreshCw size={12} /> Retry now
            </button>
            <p className="text-[10px] text-slate-400">Auto-retrying in {retryCountdown}s…</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center flex flex-col items-center gap-3 shadow-sm">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400"><Sparkles size={20} /></div>
            <h4 className="text-sm font-bold text-slate-800">No configurations found</h4>
            <p className="text-xs text-slate-500 max-w-[200px] leading-relaxed">
              {selectedCountryFilter !== "All"
                ? `No configs for ${COUNTRIES.find(x=>x.code===selectedCountryFilter)?.flag ?? ""} ${selectedCountryFilter}. Try another country or tap All.`
                : "Be the first to post a config!"}
            </p>
          </div>
        ) : filteredPosts.map((post, idx) => {
          const myReaction = userReactions[post.id];
          const vpnName = post.vpnApp==="Other"?(post.customVpnName||"Other"):post.vpnApp;
          const hearts = Math.max(0, post.heartCount ?? post.upvotes ?? 0);
          const oks = Math.max(0, post.okCount ?? 0);
          const downs = Math.max(0, post.downCount ?? post.downvotes ?? 0);
          const downloads = post.downloadCount ?? 0;
          const commentCount = post.commentCount ?? 0;
          const isMyPost = currentUserId === post.uid;
          const isDeleting = deletingPostId === post.id;
          const isConfirmingDelete = confirmDeletePostId === post.id;

          return (
            <React.Fragment key={post.id}>
            <ViewTracker postId={post.id} />
            <div
              ref={el => { postRefs.current[post.id] = el; }}
              className={`relative rounded-2xl ${highlightPostId === post.id ? "snix-post-highlight" : ""}`}
            >
            <div
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all ${(post.expiredManually || (post.expiresAt && Date.now() > post.expiresAt)) ? "border-red-100 opacity-80" : "border-slate-100"} ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}
              onTouchStart={() => handleLongPressStart(post.id)}
              onTouchEnd={handleLongPressEnd}
              onTouchMove={handleLongPressEnd}
            >
              <div className="p-4 flex items-center justify-between border-b border-slate-50">
                <div onClick={() => onAuthorClick(post.uid)} className="flex items-center gap-2.5 cursor-pointer group">
                  <img src={(isMyPost ? myAvatar : undefined) || post.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${post.uid}`} alt={post.authorName}
                    className="w-8 h-8 rounded-full border border-slate-200 bg-slate-50 group-hover:scale-105 transition-transform"
                    style={{ animationDelay: `${(idx % 4) * 0.3}s` }} />
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{post.authorName}</span>
                      {!isMyPost && followingUids.includes(post.uid) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wide bg-blue-50 text-blue-600 border border-blue-100">
                          <UserCheck size={8} /> Following
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium">{formatTimeAgo(post.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <ExpiryBadge post={post} />
                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md border ${getAppTagStyles(vpnName)}`}>{vpnName}</span>
                  {isMyPost && (isConfirmingDelete ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDeletePost(post.id)} className="px-2 py-0.5 text-[9px] font-bold text-white bg-red-500 rounded-lg">
                        {isDeleting ? <span className="animate-spin rounded-full h-2.5 w-2.5 border border-white border-t-transparent inline-block" /> : "Delete"}
                      </button>
                      <button onClick={() => setConfirmDeletePostId(null)} className="px-2 py-0.5 text-[9px] font-bold text-slate-500 bg-slate-100 rounded-lg">No</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5">
                      {/* Mark as expired / reactivate toggle */}
                      <button
                        onClick={() => handleMarkExpired(post)}
                        disabled={markingExpiredId === post.id}
                        title={post.expiredManually ? "Reactivate post" : "Mark as EXPIRED"}
                        className={`p-1.5 rounded-lg transition-all disabled:opacity-40 ${post.expiredManually ? "text-orange-400 hover:bg-orange-50 hover:text-orange-600" : "text-slate-300 hover:bg-orange-50 hover:text-orange-500"}`}
                      >
                        {markingExpiredId === post.id
                          ? <span className="animate-spin rounded-full h-3 w-3 border border-slate-400 border-t-transparent inline-block" />
                          : post.expiredManually
                            ? <RefreshCw size={13} />
                            : <Clock size={13} />}
                      </button>
                      <button onClick={() => setConfirmDeletePostId(post.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-slate-900 leading-snug">{post.title}</h3>
                  <LinkText text={post.description} className="text-xs text-slate-600 mt-1.5 leading-relaxed block" />
                </div>
                <button
                  onClick={() => setViewStatsPostId(post.id)}
                  className="flex items-center gap-0.5 text-[10px] text-slate-400 font-medium shrink-0 px-1.5 py-1 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
                >
                  <Eye size={11} />
                  <span>{post.viewCount ?? 0}</span>
                </button>
              </div>

              {/* Country flags */}
              {post.countries && post.countries.length > 0 && (
                <div className="px-4 pb-1.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">For</span>
                  {post.countries[0] === 'GLOBAL' ? (
                    <span className="text-[10px] text-slate-700 font-bold bg-slate-100 px-1.5 py-0.5 rounded">🌍 Global</span>
                  ) : (
                    <>
                      {(expandedCountries[post.id] ? post.countries : post.countries.slice(0, 3)).map(code => {
                        const c = COUNTRIES.find(x => x.code === code);
                        return c ? (
                          <span key={code} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold">{c.flag} {code}</span>
                        ) : null;
                      })}
                      {!expandedCountries[post.id] && post.countries.length > 3 && (
                        <button type="button"
                          onClick={() => setExpandedCountries(p => ({...p,[post.id]:true}))}
                          className="text-[9px] text-blue-500 font-bold px-1.5 py-0.5 bg-blue-50 rounded border border-blue-100">
                          +{post.countries.length - 3} more
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="px-4 py-2">
                {post.sharingMode === 'cloud_link' ? (
                  <div className="bg-slate-900 rounded-xl p-3.5 border border-slate-800 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 border border-slate-700">
                          <Cloud size={18} />
                        </div>
                        <div>
                          <div className="text-[11px] font-mono font-bold text-slate-200 truncate max-w-[140px]">{post.configFileName || post.title}</div>
                          <div className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <span>{vpnName}</span><span className="text-slate-600">•</span>
                            <span className="text-emerald-400 font-semibold">Cloud Link</span>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => handleCopyCloudLink(post.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 ${copiedId===post.id?"bg-emerald-500 text-white":"bg-emerald-600/30 text-emerald-400 border border-emerald-500/20"}`}>
                        <Cloud size={11} />{copiedId===post.id?"Copied!":/^https?:\/\//i.test(post.configContent||"")?"Copy Link":"Copy Code"}
                      </button>
                    </div>
                    {post.cloudDescription && (
                      <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-800 pt-2">{post.cloudDescription}</p>
                    )}
                  </div>
                ) : !expandedPosts[post.id] ? (
                  <div className="bg-slate-900 rounded-xl p-3.5 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 border border-slate-700">
                        {post.sharingMode==="cloud_only" ? <Cloud size={18} /> : <FileCode size={18} />}
                      </div>
                      <div>
                        <div className="text-[11px] font-mono font-bold text-slate-200 truncate max-w-[160px]">{post.configFileName||"config.conf"}</div>
                        <div className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <span>{vpnName}</span><span className="text-slate-600">•</span>
                          <span className={post.sharingMode==="cloud_only"?"text-emerald-400 font-semibold":"text-blue-400 font-semibold"}>
                            {post.sharingMode==="cloud_only"?"Cloud":"Download"}
                          </span>
                          {downloads>0&&<><span className="text-slate-600">•</span><span>{downloads}↓</span></>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {post.sharingMode==="cloud_only" && (
                        <button onClick={() => handleCopyCloudLink(post.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 ${copiedId===post.id?"bg-emerald-500 text-white":"bg-emerald-600/30 text-emerald-400 border border-emerald-500/20"}`}>
                          <Cloud size={11} />{copiedId===post.id?"Copied!":"Copy Link"}
                        </button>
                      )}
                      <button onClick={() => setExpandedPosts(p => ({...p,[post.id]:true}))}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg text-[10px] font-bold flex items-center gap-1">
                        <Eye size={11} />Reveal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900 rounded-xl p-3.5 border border-slate-800 flex flex-col">
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800 text-[10px] text-slate-400 font-mono">
                      <span className="break-all leading-snug">{post.configFileName||"config.conf"}</span>
                      <button onClick={() => setExpandedPosts(p => ({...p,[post.id]:false}))} className="text-slate-400 hover:text-white flex items-center gap-1"><EyeOff size={11} />Hide</button>
                    </div>
                    {post.isBinary ? (
                      <div className="text-[10px] text-emerald-400 font-mono bg-slate-950/40 p-2.5 rounded border border-slate-800 flex items-center gap-2">
                        <FileCode size={14} className="text-emerald-500 shrink-0" />
                        <span>{formatFileSize(Math.round(post.configContent.length * 0.75))}</span>
                      </div>
                    ) : (
                      <pre className="text-[10px] text-emerald-400 font-mono overflow-x-auto max-h-36 leading-normal select-text whitespace-pre-wrap break-all pr-1">{post.configContent}</pre>
                    )}
                    <div className="mt-2.5 flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      {post.sharingMode==="cloud_only" && (
                        <button onClick={() => handleCopyCloudLink(post.id)}
                          className={`px-2.5 py-1.5 rounded-md text-[9px] font-bold flex items-center gap-1 ${copiedId===post.id?"bg-emerald-500 text-white":"bg-slate-800 hover:bg-slate-700 text-emerald-300"}`}>
                          <Cloud size={11} />{copiedId===post.id?"Copied!":"Copy Cloud Link"}
                        </button>
                      )}
                      {post.sharingMode!=="cloud_only" && (
                        <button onClick={() => handleDownload(post)} disabled={downloadingId === post.id}
                          className={`px-2.5 py-1.5 rounded-md text-[9px] font-bold flex items-center gap-1.5 transition-all min-w-[72px] justify-center
                            ${downloadedId===post.id?"bg-emerald-500 text-white"
                            :downloadingId===post.id?"bg-slate-700 text-slate-300"
                            :"bg-slate-800 hover:bg-slate-700 text-slate-200"}`}>
                          {downloadingId===post.id
                            ? <><DownloadRing size={11} />Saving…</>
                            : downloadedId===post.id
                              ? <><CheckCircle size={11} />Saved!</>
                              : <><Download size={11} />Download</>}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 flex items-center justify-between border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  {([['heart','❤️',hearts],['ok','👌',oks],['down','👎',downs]] as const).map(([type,emoji,count]) => (
                    <button key={type} onClick={() => handleReaction(post.id, type as 'heart'|'ok'|'down')}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${myReaction===type?"bg-blue-100 text-blue-700 border border-blue-200 scale-105":"bg-white text-slate-500 border border-slate-200 hover:bg-slate-100"}`}>
                      <span>{emoji}</span><span className="text-[10px]">{count}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setCommentPostId(post.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white text-slate-500 border border-slate-200 hover:bg-slate-100">
                    <MessageCircle size={13} /><span className="text-[10px]">{commentCount}</span>
                  </button>
                  <button
                    onClick={() => setDownloadStatsPostId(post.id)}
                    className="flex items-center gap-1 text-[10px] text-slate-400 font-medium px-1.5 py-1 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
                  >
                    {(post.sharingMode === 'cloud_link' || post.sharingMode === 'cloud_only')
                      ? <Copy size={11} />
                      : <Download size={11} />}
                    <span>{downloads}</span>
                  </button>
                </div>
              </div>
            </div>
            </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
