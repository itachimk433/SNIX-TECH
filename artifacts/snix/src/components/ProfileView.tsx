import React, { useState, useEffect, useRef, useCallback } from "react";
import { db, auth } from "../firebase";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc, getDoc, getDocs, writeBatch, addDoc, arrayUnion, documentId } from "firebase/firestore";

import { deleteUser } from "firebase/auth";
import { VPNPost, UserProfile, Notification, PostReaction } from "../types";
import { UserPlus, UserCheck, LogOut, FolderLock, Calendar, ArrowLeft, Cloud, X, Users, Trash2, Camera, Bell, ThumbsUp, Reply, MessageCircle, UserCheck2, Pencil, Clock, AlertTriangle, RefreshCw, Zap, Sparkles, FlaskConical } from "lucide-react";
import { useKeyboard } from "../context/KeyboardContext";
import LinkText from "./LinkText";
import { triggerPushNotification } from "../utils/notify";
import { notifyRefreshed } from "../utils/feedback";
import AskSnixModal from "./AskSnixModal";
import AiTestPanel from "./AiTestPanel";

// Dev-only AI testing panel (bring-your-own-key) is only ever shown to this
// account — never surfaced to regular users. Not a security boundary (it's
// a client-side check), just keeps it out of the normal product surface.
const AI_TEST_PANEL_OWNER_EMAIL = "itachisasuke2339@gmail.com";

// Live countdown badge — ticks every second when < 24 h remain
function ProfileExpiryBadge({ expiresAt }: { expiresAt?: number | null }) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!expiresAt) return;
    if (expiresAt - Date.now() > 24 * 3600000) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const remaining = expiresAt - Date.now();
  if (remaining < 0) {
    const grace = (expiresAt + 24 * 3600000) - Date.now();
    if (grace < 0) return null;
    return <span className="text-[8px] font-bold bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Clock size={8}/>EXPIRED</span>;
  }
  if (remaining < 24 * 3600000) {
    const s = Math.max(0, Math.floor(remaining / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const label = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-mono ${remaining<3*3600000?"bg-red-100 text-red-600 border border-red-200 animate-pulse":"bg-orange-100 text-orange-600 border border-orange-200"}`}><Clock size={8}/>{label}</span>;
  }
  const days = Math.floor(remaining/86400000), hrs = Math.floor((remaining%86400000)/3600000);
  return <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200"><Clock size={8}/>{days>0?`${days}d ${hrs}h`:`${hrs}h left`}</span>;
}

interface ProfileViewProps {
  userUid: string;
  onBackToFeed?: () => void;
  isGuest?: boolean;
  onNotificationTap?: (postId: string, commentId?: string) => void;

}

async function copyToClipboard(text: string) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return; } } catch {}
  const el = document.createElement("textarea"); el.value = text; el.style.cssText = "position:fixed;opacity:0;";
  document.body.appendChild(el); el.focus(); el.select(); try { document.execCommand("copy"); } catch {} document.body.removeChild(el);
}

// ── Avatar picker constants ───────────────────────────────────────────────
const FREE_AVATAR_STYLES = ["bottts","bottts-neutral","adventurer-neutral","adventurer"];
const PRO_AVATAR_STYLES  = ["lorelei","fun-emoji","micah","shapes"];
const AVATAR_STYLES      = [...FREE_AVATAR_STYLES, ...PRO_AVATAR_STYLES];
const AVATAR_SEEDS       = ["snix","agent","cipher","node","proxy","tunnel","signal","ghost","zero","nexus"];

// Premium anime-style avatar set (DiceBear adventurer / adventurer-neutral)
const ANIME_AVATARS = [
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Aria&backgroundColor=b6e3f4",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Miku&backgroundColor=ffd5dc",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Zara&backgroundColor=c0aede",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Sora&backgroundColor=d1d4f9",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Luna&backgroundColor=b6e3f4",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Nova&backgroundColor=ffdfbf",
  "https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Ryu&backgroundColor=b6e3f4",
  "https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Kai&backgroundColor=c0aede",
  "https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Akira&backgroundColor=ffd5dc",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Yuki&backgroundColor=d1f4d1",
  "https://api.dicebear.com/7.x/adventurer/svg?seed=Hana&backgroundColor=fcd5ce",
  "https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Neon&backgroundColor=d1d4f9",
];

// GIF avatars — only shown to the owner account

function AvatarPickerModal({ onSelect, onClose, userUid }: {
  onSelect: (url: string) => void;
  onClose: () => void;
  userUid?: string;
}) {
  const [tab, setTab] = useState<"styles" | "extra">("styles");
  const [style, setStyle] = useState("bottts");

  const avatars = AVATAR_SEEDS.map(seed => `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl p-5 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-slate-200 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
        <div className="flex items-center justify-between mt-2">
          <h3 className="font-black text-slate-900 text-base" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>Choose Avatar</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400"><X size={18} /></button>
        </div>

        {/* Tabs: Styles | Extra */}
        <div className="flex gap-2">
          <button onClick={() => setTab("styles")}
            className={`flex-1 py-2 text-[11px] font-bold rounded-xl border transition-all ${tab === "styles" ? "bg-slate-950 text-white border-slate-950" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
            🎨 Styles
          </button>
          <button onClick={() => setTab("extra")}
            className={`flex-1 py-2 text-[11px] font-bold rounded-xl border transition-all ${tab === "extra" ? "bg-slate-950 text-white border-slate-950" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
            ✨ Extra
          </button>
        </div>

        {tab === "extra" ? (
          <>
            <div className="grid grid-cols-4 gap-2.5">
              {ANIME_AVATARS.map((url, i) => (
                <button key={i} onClick={() => { onSelect(url); onClose(); }}
                  className="group relative rounded-2xl overflow-hidden border-2 border-slate-100 hover:border-violet-400 active:scale-95 transition-all bg-slate-50"
                  style={{ aspectRatio: "1" }}>
                  <img src={url} alt={`extra-${i}`} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-violet-500/0 group-hover:bg-violet-500/10 transition-colors" />
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 text-center">Tap any avatar to set it</p>
          </>
        ) : (
          <>
            {/* Style tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
              {AVATAR_STYLES.map(s => (
                <button key={s} onClick={() => setStyle(s)}
                  className={`relative px-3 py-1.5 text-[10px] font-bold rounded-lg whitespace-nowrap border transition-all ${
                    style === s ? "bg-slate-950 text-white border-slate-950"
                    : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                  {s}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-3">
              {avatars.map((url, i) => (
                <button key={i} onClick={() => { onSelect(url); onClose(); }} className="flex flex-col items-center gap-1 group">
                  <img src={url} alt={`avatar-${i}`} className="w-14 h-14 rounded-2xl border-2 border-slate-100 group-hover:border-blue-500 group-hover:scale-105 transition-all bg-slate-50" />
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 text-center">Tap any avatar to set it as your profile picture</p>
          </>
        )}
      </div>
    </div>
  );
}


// GIF searches are proxied server-side via /api/gifs — no client-side API key needed here
// ── GIF source definitions ─────────────────────────────────────────────────
const GIF_SOURCES = [
  { id: "giphy", label: "Giphy", emoji: "🎭", accent: "#ff6666" },
] as const;
type GifSourceId = (typeof GIF_SOURCES)[number]["id"];

interface GifResult { url: string; thumb: string; }

// GIF searches are proxied through our own API server to avoid CORS / origin
// blocking that Capacitor's WebView origin can trigger with demo API keys.
async function fetchGifsViaProxy(source: GifSourceId, q: string): Promise<GifResult[]> {
  const base = ((import.meta as any).env?.VITE_API_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("VITE_API_BASE_URL not set");
  const url = `${base}/api/gifs?source=${source}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`proxy ${res.status}`);
  const j = await res.json() as { ok: boolean; results?: GifResult[] };
  if (!j.ok) throw new Error("proxy returned ok:false");
  return j.results || [];
}

const GIF_FETCHERS: Record<GifSourceId, (q: string) => Promise<GifResult[]>> = {
  giphy: (q) => fetchGifsViaProxy("giphy", q),
};
const SOURCE_CREDIT: Record<GifSourceId, string> = {
  giphy: "Powered by GIPHY",
};

const BANNER_PRESETS = [
  { label: "Aurora",  css: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)" },
  { label: "Ocean",   css: "linear-gradient(135deg,#2193b0 0%,#6dd5ed 100%)" },
  { label: "Sunset",  css: "linear-gradient(135deg,#f7971e 0%,#ffd200 50%,#ff512f 100%)" },
  { label: "Forest",  css: "linear-gradient(135deg,#11998e 0%,#38ef7d 100%)" },
  { label: "Night",   css: "linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)" },
  { label: "Rose",    css: "linear-gradient(135deg,#f953c6 0%,#b91d73 100%)" },
  { label: "Slate",   css: "linear-gradient(135deg,#1e293b 0%,#475569 100%)" },
  { label: "Cyber",   css: "linear-gradient(135deg,#00d2ff 0%,#3a7bd5 100%)" },
  { label: "Ember",   css: "linear-gradient(135deg,#eb3349 0%,#f45c43 100%)" },
  { label: "Mint",    css: "linear-gradient(135deg,#00b09b 0%,#96c93d 100%)" },
  { label: "Cosmos",  css: "linear-gradient(135deg,#0d0d0d 0%,#1a1a2e 50%,#16213e 100%)" },
  { label: "Candy",   css: "linear-gradient(135deg,#fc5c7d 0%,#6a82fb 100%)" },
];

function BannerPickerModal({ currentUrl, onSelect, onClose }: {
  currentUrl?: string;
  onSelect: (url: string) => void;
  onClose: () => void;
  userUid?: string;
}) {
  const { openKeyboard, settings: kbSettings } = useKeyboard();
  const [tab, setTab]             = useState<"search" | "url" | "presets">("search");
  const [sourceIdx, setSourceIdx] = useState(0);
  const [query, setQuery]         = useState("anime landscape");
  const [inputUrl, setInputUrl]   = useState(currentUrl || "");
  const [previewUrl, setPreviewUrl] = useState(currentUrl || "");
  const [previewError, setPreviewError] = useState(false);
  const [results, setResults]     = useState<GifResult[]>([]);
  const [loading, setLoading]     = useState(false);
  const [searched, setSearched]   = useState(false);
  const [searchError, setSearchError] = useState("");

  const queryRef    = useRef(query);    queryRef.current    = query;
  const inputUrlRef = useRef(inputUrl); inputUrlRef.current = inputUrl;
  const swipeStartX = useRef<number | null>(null);
  const currentSource = GIF_SOURCES[sourceIdx];

  const doSearch = async (q: string, srcIdx = sourceIdx, attempt = 0) => {
    if (!q.trim()) return;
    setLoading(true); setSearched(true); setSearchError("");
    try {
      const mapped = await GIF_FETCHERS[GIF_SOURCES[srcIdx].id](q);
      setResults(mapped);
      if (mapped.length === 0) setSearchError("No results found — try a different term");
    } catch {
      if (attempt < 1) { await new Promise(r => setTimeout(r, 1500)); return doSearch(q, srcIdx, attempt + 1); }
      setSearchError("Could not load GIFs — check your connection and try again");
    }
    setLoading(false);
  };

  const changeSource = (newIdx: number) => {
    if (newIdx === sourceIdx) return;
    setSourceIdx(newIdx); setResults([]); setSearched(false); setSearchError("");
    doSearch(queryRef.current, newIdx);
  };

  const openSearchKeyboard = () => {
    openKeyboard(query, {
      onChange: (v) => setQuery(v),
      onSubmit: () => doSearch(queryRef.current),
      placeholder: "anime landscape, city night, ocean...", maxLength: 80,
    });
  };
  const openUrlKeyboard = () => {
    openKeyboard(inputUrlRef.current, {
      onChange: (v) => { setInputUrl(v); inputUrlRef.current = v; },
      onSubmit: () => { setPreviewUrl(inputUrlRef.current.trim()); setPreviewError(false); },
      placeholder: "https://media.giphy.com/media/.../giphy.gif", maxLength: 500,
    });
  };

  useEffect(() => { doSearch("anime landscape", 0); }, []);

  const apply  = () => { onSelect(inputUrl.trim()); onClose(); };
  const remove = () => { onSelect(""); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full bg-white rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />

        {/* Header */}
        <div className="flex items-center justify-between pt-5 px-5 pb-3 shrink-0">
          <h3 className="font-black text-slate-900 text-base" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>Profile Banner</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 gap-2 shrink-0 pb-3">
          <button onClick={() => setTab("search")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${tab === "search" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"}`}
          >🔍 GIFs</button>
          <button onClick={() => setTab("presets")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${tab === "presets" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"}`}
          >🎨 Gradients</button>
          <button onClick={() => setTab("url")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${tab === "url" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"}`}
          >🔗 URL</button>
        </div>

        {tab === "presets" ? (
          <div className="flex flex-col gap-4 px-5 pb-5 shrink-0">
            <div className="grid grid-cols-3 gap-2">
              {BANNER_PRESETS.map((p) => {
                const isActive = currentUrl === `css:${p.css}`;
                return (
                  <button
                    key={p.label}
                    onClick={() => { onSelect(`css:${p.css}`); onClose(); }}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all active:scale-95 ${isActive ? "border-blue-500" : "border-transparent"}`}
                    style={{ aspectRatio: "3/1" }}
                  >
                    <div className="w-full h-full" style={{ background: p.css }} />
                    <span className="absolute inset-x-0 bottom-0 text-[9px] font-bold text-white text-center pb-0.5 bg-black/30">{p.label}</span>
                    {isActive && <div className="absolute top-1 right-1 w-3 h-3 bg-blue-500 rounded-full border border-white" />}
                  </button>
                );
              })}
            </div>
            {currentUrl && (
              <button onClick={() => { onSelect(""); onClose(); }} className="w-full py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-xs">Remove Banner</button>
            )}
          </div>
        ) : tab === "search" ? (
          <div className="flex flex-col flex-1 overflow-hidden min-h-0">
            {/* Source selector — tap a pill or swipe left/right on this row */}
            <div
              className="flex items-center gap-2 px-5 pb-3 shrink-0 overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
              onPointerDown={e => { swipeStartX.current = e.clientX; }}
              onPointerCancel={() => { swipeStartX.current = null; }}
              onPointerLeave={() => { swipeStartX.current = null; }}
              onPointerUp={e => {
                if (swipeStartX.current === null) return;
                const dx = e.clientX - swipeStartX.current;
                swipeStartX.current = null;
                // Only count as a swipe if significantly more horizontal than a scroll tap
                if (Math.abs(dx) < 60) return;
                changeSource(dx < 0 ? Math.min(sourceIdx + 1, GIF_SOURCES.length - 1) : Math.max(sourceIdx - 1, 0));
              }}
            >
              {GIF_SOURCES.map((src, i) => (
                <button key={src.id}
                  onPointerUp={e => { e.stopPropagation(); changeSource(i); }}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 transition-all ${
                    i === sourceIdx ? "text-white shadow-sm" : "bg-slate-100 text-slate-500"
                  }`}
                  style={i === sourceIdx ? { backgroundColor: src.accent } : undefined}
                >
                  <span>{src.emoji}</span><span>{src.label}</span>
                </button>
              ))}
            </div>

            {/* Search bar */}
            <div className="flex gap-2 px-5 pb-2 shrink-0">
              {kbSettings.enabled ? (
                <div onPointerUp={openSearchKeyboard}
                  className="flex-1 px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none min-w-0"
                >
                  {query ? <span className="text-slate-800">{query}</span> : <span className="text-slate-400">anime landscape, city night, ocean...</span>}
                </div>
              ) : (
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); doSearch(query); } }}
                  placeholder="anime landscape, city night, ocean..."
                  className="flex-1 px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none min-w-0"
                />
              )}
              <button onPointerUp={() => doSearch(query)} disabled={loading}
                className="px-4 py-2.5 bg-slate-950 text-white text-xs font-bold rounded-xl disabled:opacity-50"
              >Search</button>
            </div>

            <p className="text-[10px] text-slate-400 px-5 shrink-0 pb-2">
              {"💡 Landscape / wide GIFs look best as a banner"}
            </p>

            {/* Results */}
            <div className="overflow-y-auto flex-1 min-h-0 px-5 pb-1">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <span className="animate-spin rounded-full h-7 w-7 border-2 border-slate-900 border-t-transparent" />
                </div>
              ) : searchError ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                  <span className="text-2xl">😶</span>
                  <span className="text-xs font-medium text-center">{searchError}</span>
                </div>
              ) : results.length === 0 && searched ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                  <span className="text-2xl">🖼️</span>
                  <span className="text-xs">Try "anime scenery", "city lights", "ocean wave"</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {results.map((g, i) => (
                    <button key={i} onPointerUp={() => { onSelect(g.url); onClose(); }}
                      className="relative w-full pt-[56.25%] rounded-xl overflow-hidden bg-slate-100 border-2 border-transparent hover:border-blue-400 transition-all"
                    >
                      <img src={g.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[9px] text-slate-300 text-center shrink-0 py-2">{SOURCE_CREDIT[currentSource.id]}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 pb-5 shrink-0">
            <p className="text-[11px] text-slate-500">Paste any GIF or image URL. Works great with any Giphy link.</p>

            <div className="w-full h-24 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 relative flex items-center justify-center">
              {previewUrl && !previewError ? (
                <img src={previewUrl} alt="Banner preview" className="w-full h-full object-cover"
                  onError={() => setPreviewError(true)} onLoad={() => setPreviewError(false)} />
              ) : (
                <div className="flex flex-col items-center gap-1 text-slate-300">
                  <Camera size={22} />
                  <span className="text-[10px] font-medium">Preview</span>
                </div>
              )}
            </div>

            {kbSettings.enabled ? (
              <div onPointerUp={openUrlKeyboard}
                className="px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none min-h-[38px] leading-relaxed"
              >
                {inputUrl
                  ? <span className="text-slate-800 break-all">{inputUrl}</span>
                  : <span className="text-slate-400">https://media.giphy.com/media/.../giphy.gif</span>
                }
              </div>
            ) : (
              <input
                type="url"
                value={inputUrl}
                onChange={e => { setInputUrl(e.target.value); inputUrlRef.current = e.target.value; }}
                onBlur={() => { setPreviewUrl(inputUrl.trim()); setPreviewError(false); }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setPreviewUrl(inputUrl.trim()); setPreviewError(false); } }}
                placeholder="https://media.giphy.com/media/.../giphy.gif"
                className="px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none min-h-[38px] w-full break-all"
              />
            )}

            <div className="flex gap-2">
              {currentUrl && (
                <button onClick={remove} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl text-xs">Remove Banner</button>
              )}
              <button onClick={apply} disabled={!inputUrl.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-950 text-white font-bold rounded-xl text-xs disabled:opacity-40">
                Set Banner
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UserListModal({ title, uids, onClose, onUserClick }: { title: string; uids: string[]; onClose: () => void; onUserClick: (uid: string) => void }) {
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  useEffect(() => {
    if (!uids.length) return;
    Promise.all(uids.map(uid => getDoc(doc(db,"users",uid)))).then(snaps => {
      const map: Record<string,UserProfile> = {};
      snaps.forEach(s => { if (s.exists()) map[s.id] = s.data() as UserProfile; });
      setProfiles(map);
    }).catch(console.error);
  }, [uids.join(",")]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="w-10 h-1 bg-slate-200 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
          <h3 className="font-black text-slate-900 text-base" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {!uids.length ? <div className="py-8 text-center text-xs text-slate-400">No users yet</div>
            : uids.map((uid, i) => {
            const p = profiles[uid];
            return (
              <button key={uid} onClick={() => { onClose(); onUserClick(uid); }}
                className="w-full flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all text-left">
                <img src={p?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`} alt="avatar"
                  className="w-9 h-9 rounded-full border border-slate-200 bg-slate-100" />
                <div>
                  <p className="text-sm font-bold text-slate-900">{p?.displayName || "Agent"}</p>
                  <p className="text-[10px] text-slate-400">{p?.bio?.substring(0,40) || "SNIX Agent"}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NotifIcon({ type }: { type: Notification["type"] }) {
  if (type === "like")    return <ThumbsUp size={13} className="text-blue-500" />;
  if (type === "reply")   return <Reply size={13} className="text-emerald-500" />;
  if (type === "comment") return <MessageCircle size={13} className="text-violet-500" />;
  if (type === "follow")  return <UserCheck2 size={13} className="text-orange-500" />;
  return <Bell size={13} className="text-slate-400" />;
}

function NotifText(n: Notification) {
  if (n.type === "like")    return <><strong>{n.fromName}</strong> liked your comment</>;
  if (n.type === "reply")   return <><strong>{n.fromName}</strong> replied to your comment</>;
  if (n.type === "comment") return <><strong>{n.fromName}</strong> commented on your post</>;
  if (n.type === "follow")  return <><strong>{n.fromName}</strong> started following you</>;
  return <>New notification from <strong>{n.fromName}</strong></>;
}

function NotificationsPanel({
  notifications, onClose, onMarkAllRead, onNotificationTap,
}: {
  notifications: Notification[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onNotificationTap?: (postId: string, commentId?: string) => void;
}) {
  const unread = notifications.filter(n => !n.read).length;
  const fmt = (ts: number) => {
    const d = Date.now()-ts, m = Math.floor(d/60000), h = Math.floor(m/60), dy = Math.floor(h/24);
    if (m < 1) return "Just now"; if (m < 60) return `${m}m`; if (h < 24) return `${h}h`; return `${dy}d`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="w-8 h-1 bg-slate-200 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-slate-500" />
            <h3 className="font-black text-slate-900 text-sm" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>
              Notifications
              {unread > 0 && <span className="ml-1.5 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{unread}</span>}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && <button onClick={onMarkAllRead} className="text-[10px] font-bold text-blue-600 hover:underline">Mark all read</button>}
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                <Bell size={28} className="text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700">All caught up</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">Likes, replies, and follows<br />will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {notifications.map((n, i) => (
                <button
                  key={n.id}
                  className={`w-full flex items-start gap-3 px-4 py-3 transition-colors text-left ${n.read ? "bg-white" : "bg-blue-50/50"} ${n.postId ? "active:bg-blue-100/60" : ""}`}
                  onClick={() => {
                    if (n.postId && onNotificationTap) {
                      onNotificationTap(n.postId, n.commentId);
                      onClose();
                    }
                  }}
                  disabled={!n.postId}
                >
                  <div className="relative shrink-0">
                    <img
                      src={n.fromAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(n.fromName)}`}
                      alt={n.fromName}
                      className="w-9 h-9 rounded-full border border-slate-200 bg-slate-50"
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-white rounded-full flex items-center justify-center border border-slate-100">
                      <NotifIcon type={n.type} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-700 leading-snug text-left">{NotifText(n)}</p>
                    {n.commentPreview && (
                      <p className="text-[10px] text-slate-400 mt-0.5 italic truncate">"{n.commentPreview}"</p>
                    )}
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className="text-[9px] text-slate-400 font-semibold">{fmt(n.createdAt)} ago</p>
                      {n.postId && <span className="text-[9px] text-blue-500 font-semibold">· Tap to view post</span>}
                    </div>
                  </div>
                  {!n.read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfileView({ userUid, onBackToFeed, isGuest = false, onNotificationTap }: ProfileViewProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userPosts, setUserPosts] = useState<VPNPost[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerUids, setFollowerUids] = useState<string[]>([]);
  const [followingUids, setFollowingUids] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [editingBio, setEditingBio] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [bioText, setBioText] = useState("");
  const [nameText, setNameText] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const [viewUid, setViewUid] = useState<string | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showBannerPicker, setShowBannerPicker] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [gifSaving, setGifSaving] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const [gifDone, setGifDone] = useState(false);
  const [profileTab, setProfileTab] = useState<"posts"|"reacted">("posts");
  const [reactedPosts, setReactedPosts] = useState<Array<{ post: VPNPost; type: 'heart'|'ok'|'down'; reactedAt: number }>>([]);
  const [reactedLoading, setReactedLoading] = useState(false);
  const [showAskSnix, setShowAskSnix] = useState(false);
  const [showAiTest, setShowAiTest] = useState(false);

  // Pull-to-refresh — mirrors the FeedView implementation so profile data
  // (own or someone else's) can be manually refreshed the same way.
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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
    setTimeout(() => { setRefreshing(false); notifyRefreshed("Profile refreshed!"); }, 900);
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

  const currentUser = auth.currentUser;
  const isMe = currentUser?.uid === userUid;
  const unreadCount = notifications.filter(n => !n.read).length;
  const bioTextRef = useRef(bioText);
  bioTextRef.current = bioText;
  const nameTextRef = useRef(nameText);
  nameTextRef.current = nameText;
  const { openKeyboard, closeKeyboard } = useKeyboard();

  useEffect(() => {
    if (!isMe || !currentUser) return;
    const q = query(collection(db,"notifications"), where("userId","==",currentUser.uid));
    const unsub = onSnapshot(q, snap => {
      const notifs: Notification[] = snap.docs.map(d => ({ id:d.id, ...d.data() } as Notification));
      notifs.sort((a,b) => b.createdAt - a.createdAt);
      setNotifications(notifs.slice(0,50));
    }, err => console.error("Notifications:",err));
    return () => unsub();
  }, [isMe, currentUser?.uid]);

  const markAllRead = async () => {
    if (!currentUser) return;
    const unread = notifications.filter(n => !n.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db,"notifications",n.id), { read: true }));
    try { await batch.commit(); } catch {}
  };

  const handleOpenNotifications = () => { setShowNotifications(true); setTimeout(markAllRead, 1000); };

  useEffect(() => {
    if (!userUid) return;
    setLoading(true); setPostsLoading(true);
    const unsubP = onSnapshot(doc(db,"users",userUid), async snap => {
      if (snap.exists()) { setProfile(snap.data() as UserProfile); setBioText(snap.data().bio||""); setNameText(snap.data().displayName||""); }
      else {
        const name = isMe ? currentUser?.displayName||"Agent" : "Agent "+userUid.substring(0,5);
        const fb: UserProfile = { uid:userUid, displayName:name, email:isMe?currentUser?.email||"":"",
          bio:"VPN Configuration Curator.", avatarUrl:`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`,
          createdAt:Date.now(), followerCount:0, followingCount:0 };
        try { await setDoc(doc(db,"users",userUid),fb); } catch {}
        setProfile(fb); setBioText(fb.bio||"");
      }
      setLoading(false);
    }, () => setLoading(false));
    const unsubPosts = onSnapshot(query(collection(db,"posts"),where("uid","==",userUid)), snap => {
      const p: VPNPost[] = [];
      snap.forEach(d => p.push({ id:d.id, ...d.data() } as VPNPost));
      p.sort((a,b) => ((b.createdAt as number)||0)-((a.createdAt as number)||0));
      setUserPosts(p); setPostsLoading(false);
    }, () => setPostsLoading(false));
    const unsubFr = onSnapshot(query(collection(db,"follows"),where("followingId","==",userUid)), snap => {
      setFollowerUids(snap.docs.map(d => d.data().followerId));
    }, console.error);
    const unsubFg = onSnapshot(query(collection(db,"follows"),where("followerId","==",userUid)), snap => {
      setFollowingUids(snap.docs.map(d => d.data().followingId));
    }, console.error);
    let unsubIsF = () => {};
    if (currentUser && !isMe) {
      unsubIsF = onSnapshot(doc(db,"follows",`${currentUser.uid}_${userUid}`), snap => setIsFollowing(snap.exists()), console.error);
    }
    return () => { unsubP(); unsubPosts(); unsubFr(); unsubFg(); unsubIsF(); };
  }, [userUid, isMe, refreshKey]);

  // Load posts the current user has reacted to — shown in the Reacted tab
  useEffect(() => {
    if (!isMe || profileTab !== "reacted" || !currentUser) { setReactedPosts([]); return; }
    setReactedLoading(true);
    getDocs(query(collection(db, "reactions"), where("userId", "==", currentUser.uid)))
      .then(async (rSnap) => {
        const reactions = rSnap.docs.map(d => d.data() as PostReaction);
        if (reactions.length === 0) { setReactedPosts([]); return; }
        const ids = reactions.slice(0, 50).map(r => r.postId);
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
        const postResults = await Promise.all(
          chunks.map(chunk =>
            getDocs(query(collection(db, "posts"), where(documentId(), "in", chunk)))
              .then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as VPNPost)))
          )
        );
        const postMap = new Map(postResults.flat().map(p => [p.id, p]));
        const merged = reactions
          .filter(r => postMap.has(r.postId))
          .map(r => ({ post: postMap.get(r.postId)!, type: r.type, reactedAt: r.createdAt }))
          .sort((a, b) => b.reactedAt - a.reactedAt);
        setReactedPosts(merged);
      })
      .catch(() => {})
      .finally(() => setReactedLoading(false));
  }, [isMe, profileTab, currentUser?.uid]);

  const handleFollowToggle = async () => {
    if (!currentUser || isMe || isGuest) return;
    const fid = `${currentUser.uid}_${userUid}`;
    try {
      if (isFollowing) { await deleteDoc(doc(db,"follows",fid)); }
      else {
        await setDoc(doc(db,"follows",fid), { id:fid, followerId:currentUser.uid, followingId:userUid, createdAt:Date.now() });
        const meSnap = await getDoc(doc(db,"users",currentUser.uid));
        const meName = meSnap.exists() ? meSnap.data().displayName : (currentUser.displayName||"Agent");
        addDoc(collection(db,"notifications"), {
          userId:userUid, type:"follow", fromName:meName,
          fromAvatar:`https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(meName)}`,
          read:false, createdAt:Date.now(),
        }).catch(()=>{});
        triggerPushNotification({
          targetUserId: userUid,
          title: "New follower",
          body: `${meName} started following you`,
        });
      }
    } catch {}
  };

  const saveBio = async () => {
    if (!isMe||!currentUser||saveFeedback==='saving') return;
    const currentBio = bioTextRef.current;
    setSaveFeedback('saving');
    try {
      await Promise.race([
        updateDoc(doc(db,"users",currentUser.uid),{ bio:currentBio.trim() }),
        new Promise<never>((_,rej)=>setTimeout(()=>rej(new Error("Timeout")),5000))
      ]);
      setProfile(p => p?{ ...p, bio:currentBio.trim() }:p);
      setSaveFeedback('saved');
      setTimeout(()=>{ setSaveFeedback(null); setEditingBio(false); closeKeyboard(); },900);
    } catch { setSaveFeedback('error'); setTimeout(()=>setSaveFeedback(null),2500); }
  };

  const startBioEdit = () => {
    setEditingBio(true);
    openKeyboard(bioTextRef.current, {
      onChange: (v) => { setBioText(v); bioTextRef.current = v; },
      onSubmit: saveBio,
      onDismiss: () => setEditingBio(false),
      placeholder: "Write a short bio...",
      maxLength: 80,
      isMultiline: true,
    });
  };

  const saveName = async () => {
    if (!isMe || !currentUser || saveFeedback === 'saving') return;
    const current = nameTextRef.current.trim();
    if (!current) return;
    setSaveFeedback('saving');
    try {
      await Promise.race([
        updateDoc(doc(db,"users",currentUser.uid), { displayName: current }),
        new Promise<never>((_,rej) => setTimeout(()=>rej(new Error("Timeout")),5000))
      ]);
      setProfile(p => p ? { ...p, displayName: current } : p);
      setSaveFeedback('saved');
      setTimeout(() => { setSaveFeedback(null); setEditingName(false); closeKeyboard(); }, 900);
    } catch { setSaveFeedback('error'); setTimeout(()=>setSaveFeedback(null), 2500); }
  };

  const startNameEdit = () => {
    setEditingName(true);
    openKeyboard(nameTextRef.current, {
      onChange: (v) => { setNameText(v); nameTextRef.current = v; },
      onSubmit: saveName,
      onDismiss: () => { setEditingName(false); setNameText(profile?.displayName||""); },
      placeholder: "Your display name...",
      maxLength: 30,
    });
  };

  const handleAvatarSelect = async (url: string) => {
    if (!isMe||!currentUser) return;
    try {
      await updateDoc(doc(db,"users",currentUser.uid),{ avatarUrl:url });
      setProfile(p=>p?{...p,avatarUrl:url}:p);
      // Backfill authorAvatar on all existing posts so the Feed shows the new avatar
      const postSnap = await getDocs(query(collection(db,"posts"),where("uid","==",currentUser.uid)));
      if (!postSnap.empty) {
        const batch = writeBatch(db);
        postSnap.docs.forEach(d => batch.update(d.ref,{ authorAvatar: url }));
        await batch.commit();
      }
    } catch {}
  };

  // Persists a pro avatar style ("sticker") that a non-pro user just unlocked
  // by watching a rewarded ad, so it stays unlocked for future visits.
  const handleUnlockAvatarStyle = async (style: string) => {
    if (!isMe || !currentUser) return;
    try {
      await updateDoc(doc(db,"users",currentUser.uid),{ unlockedAvatarStyles: arrayUnion(style) });
      setProfile(p => p ? { ...p, unlockedAvatarStyles: [...(p.unlockedAvatarStyles||[]), style] } : p);
    } catch {}
  };

  const handleDeletePost = async (postId: string) => {
    if (!currentUser) return;
    setDeletingPostId(postId);
    try {
      const rSnap = await getDocs(query(collection(db,"reactions"),where("postId","==",postId)));
      for (const d of rSnap.docs) await deleteDoc(d.ref);
      const cSnap = await getDocs(query(collection(db,"comments"),where("postId","==",postId)));
      for (const d of cSnap.docs) await deleteDoc(d.ref);
      await deleteDoc(doc(db,"posts",postId));
    } catch {}
    finally { setDeletingPostId(null); setConfirmDeletePostId(null); }
  };

  // ── Delete account: wipes Firestore data first (while auth is still valid),
  //    then deletes the Firebase Auth record so security rules allow all deletes.
  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    setDeleteAccountLoading(true);
    setDeleteAccountError("");
    const uid = currentUser.uid;
    try {
      // 1. Throw early if re-auth is needed — before touching any data.
      //    deleteUser will throw auth/requires-recent-login if the session is stale.
      //    We do a token refresh to surface that error before data deletion starts.
      await currentUser.getIdToken(true);

      // 2. Wipe all Firestore data WHILE the user is still authenticated so
      //    security rules permit the writes. Only then remove the Auth record.
      //
      //    IMPORTANT: Only delete documents owned by this user. Security rules
      //    do NOT allow deleting documents written by other users (e.g. other
      //    users' reactions/comments on our posts). Attempting to do so causes
      //    a "Missing or insufficient permissions" error that aborts the whole
      //    flow. Orphaned reactions/comments on deleted posts are harmless.
      const postsSnap = await getDocs(query(collection(db,"posts"), where("uid","==",uid)));
      for (const pd of postsSnap.docs) await deleteDoc(pd.ref);

      // Delete only this user's own reactions and comments (not others').
      const myReactions = await getDocs(query(collection(db,"reactions"),where("userId","==",uid)));
      for (const r of myReactions.docs) await deleteDoc(r.ref);
      const myComments = await getDocs(query(collection(db,"comments"),where("userId","==",uid)));
      for (const c of myComments.docs) await deleteDoc(c.ref);

      const fSnap = await getDocs(query(collection(db,"follows"),where("followerId","==",uid)));
      for (const f of fSnap.docs) await deleteDoc(f.ref);
      const f2Snap = await getDocs(query(collection(db,"follows"),where("followingId","==",uid)));
      for (const f of f2Snap.docs) await deleteDoc(f.ref);
      const nSnap = await getDocs(query(collection(db,"notifications"),where("userId","==",uid)));
      for (const n of nSnap.docs) await deleteDoc(n.ref);
      await deleteDoc(doc(db,"users",uid));

      // 3. All data wiped — now delete the Firebase Auth account.
      await deleteUser(currentUser);
      // onAuthStateChanged in App.tsx will detect null user and navigate to sign-in
    } catch (err: any) {
      if (err?.code === "auth/requires-recent-login") {
        setDeleteAccountError("Please sign out and sign back in, then try again to delete your account.");
      } else {
        setDeleteAccountError(err?.message || "Failed to delete account.");
      }
      setDeleteAccountLoading(false);
    }
  };

  const handleBannerSelect = async (url: string) => {
    if (!isMe || !currentUser) return;
    // Show animated progress overlay while saving
    setGifSaving(true);
    setGifProgress(0);
    setGifDone(false);
    // Progress ramp: 0 → 80% while Firestore writes, then 80 → 95% while image loads
    let prog = 0;
    const ramp = setInterval(() => {
      prog = Math.min(prog + (3 + Math.random() * 5), 80);
      setGifProgress(Math.round(prog));
    }, 80);
    try {
      await updateDoc(doc(db,"users",currentUser.uid),{ bannerUrl: url || null });
      setProfile(p => p ? { ...p, bannerUrl: url || undefined } : p);
    } catch {}
    clearInterval(ramp);

    // Wait for the image to actually render in the browser before declaring success.
    // Without this the toast fires before the banner visually changes.
    if (url) {
      setGifProgress(85);
      await new Promise<void>((resolve) => {
        const img = new Image();
        // 6-second hard timeout — if Giphy/CDN is slow we still dismiss eventually
        const timeout = setTimeout(resolve, 6000);
        img.onload  = () => { clearTimeout(timeout); resolve(); };
        img.onerror = () => { clearTimeout(timeout); resolve(); };
        img.src = url;
      });
    }

    setGifProgress(100);
    setGifDone(true);
    // Hold success state for 1.6 s then dismiss
    setTimeout(() => { setGifSaving(false); setGifProgress(0); setGifDone(false); }, 1600);
  };


  const fmt = (ts: number) => !ts ? "Agent Network"
    : `Joined ${new Date(ts).toLocaleDateString(undefined,{month:'short',year:'numeric'})}`;

  if (viewUid) return <ProfileView userUid={viewUid} onBackToFeed={()=>setViewUid(null)} isGuest={isGuest} />;

  return (
    <div className="flex-1 flex flex-col overflow-hidden select-none">
      {/* ── Fireworks overlay (pro star tap) ──────────────────────────────── */}
      {/* ── GIF save progress overlay ──────────────────────────────────────── */}
      {gifSaving && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3 border border-slate-100">
            {gifDone ? (
              <>
                <div className="snix-gif-success-pop w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-sm font-black text-slate-900" style={{ fontFamily:"'Space Grotesk',sans-serif" }}>Background updated!</p>
              </>
            ) : (
              <>
                <div className="relative w-14 h-14">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="24" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                    <circle
                      cx="28" cy="28" r="24" fill="none"
                      stroke="url(#gif-progress-grad)" strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 24}`}
                      strokeDashoffset={`${2 * Math.PI * 24 * (1 - gifProgress / 100)}`}
                      style={{ transition: "stroke-dashoffset 0.15s ease" }}
                    />
                    <defs>
                      <linearGradient id="gif-progress-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#2563eb" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-700">{gifProgress}%</span>
                </div>
                <p className="text-xs font-bold text-slate-500">Saving GIF…</p>
              </>
            )}
          </div>
        </div>
      )}

      {showAvatarPicker && (
        <AvatarPickerModal
          onSelect={handleAvatarSelect}
          onClose={() => setShowAvatarPicker(false)}
          userUid={profile?.uid}
        />
      )}
      {showBannerPicker && (
        <BannerPickerModal
          currentUrl={profile?.bannerUrl}
          onSelect={handleBannerSelect}
          onClose={() => setShowBannerPicker(false)}
          userUid={profile?.uid}
        />
      )}
      {showFollowers && <UserListModal title="Followers" uids={followerUids} onClose={()=>setShowFollowers(false)} onUserClick={uid=>{ setShowFollowers(false); setViewUid(uid); }} />}
      {showFollowing && <UserListModal title="Following" uids={followingUids} onClose={()=>setShowFollowing(false)} onUserClick={uid=>{ setShowFollowing(false); setViewUid(uid); }} />}
      {showAskSnix && <AskSnixModal onClose={() => setShowAskSnix(false)} isGuest={isGuest} uid={auth.currentUser?.uid ?? null} />}
      {showAiTest && currentUser?.email === AI_TEST_PANEL_OWNER_EMAIL && <AiTestPanel onClose={() => setShowAiTest(false)} />}

      {showNotifications && (
        <NotificationsPanel
          notifications={notifications}
          onClose={()=>setShowNotifications(false)}
          onMarkAllRead={markAllRead}
          onNotificationTap={onNotificationTap}
        />
      )}

      {showSignOutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-8" onClick={()=>setShowSignOutConfirm(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4" onClick={e=>e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center"><LogOut size={22} className="text-red-500" /></div>
            <div className="text-center">
              <h3 className="text-base font-black text-slate-900">Sign Out?</h3>
              <p className="text-xs text-slate-500 mt-1">You'll need to sign in again to post or react.</p>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={()=>setShowSignOutConfirm(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider">Cancel</button>
              <button onClick={()=>{ auth.signOut(); setShowSignOutConfirm(false); }} className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider">Sign Out</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAccountConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-8" onClick={()=>{ if (!deleteAccountLoading) { setShowDeleteAccountConfirm(false); setDeleteAccountError(""); } }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4" onClick={e=>e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center"><AlertTriangle size={22} className="text-red-600" /></div>
            <div className="text-center">
              <h3 className="text-base font-black text-slate-900">Delete Account?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                This permanently deletes your profile, all your posts, reactions, and comments. <span className="font-bold text-red-500">This cannot be undone.</span>
              </p>
            </div>
            {deleteAccountError && (
              <div className="w-full p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-medium">{deleteAccountError}</div>
            )}
            <div className="flex gap-3 w-full">
              <button
                disabled={deleteAccountLoading}
                onClick={()=>{ setShowDeleteAccountConfirm(false); setDeleteAccountError(""); }}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs uppercase tracking-wider"
              >Cancel</button>
              <button
                disabled={deleteAccountLoading}
                onClick={handleDeleteAccount}
                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {deleteAccountLoading
                  ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                  : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-3">
          {onBackToFeed && <button onClick={onBackToFeed} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"><ArrowLeft size={18} /></button>}
          <span className="text-lg font-black text-slate-900 tracking-tight" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>
            {isMe ? "My Profile" : "Agent Space"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isMe && (
            <button onClick={() => setShowAskSnix(true)}
              className="p-2 hover:bg-slate-100 text-slate-500 rounded-xl transition-all"
              title="Ask SNIX">
              <Sparkles size={18} />
            </button>
          )}
          {isMe && currentUser?.email === AI_TEST_PANEL_OWNER_EMAIL && (
            <button onClick={() => setShowAiTest(true)}
              className="p-2 hover:bg-slate-100 text-slate-500 rounded-xl transition-all"
              title="AI Test Panel">
              <FlaskConical size={18} />
            </button>
          )}
          {isMe && (
            <button onClick={handleOpenNotifications} className="p-2 hover:bg-slate-100 text-slate-500 rounded-xl transition-all relative">
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-blue-600 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          )}
          {isMe && (
            <button onClick={()=>setShowSignOutConfirm(true)}
              className="p-2 hover:bg-red-50 text-red-500 rounded-xl flex items-center gap-1.5 text-xs font-semibold">
              <LogOut size={16} /><span>Sign Out</span>
            </button>
          )}
          {isMe && (
            <button
              onClick={()=>{ setDeleteAccountError(""); setShowDeleteAccountConfirm(true); }}
              className="p-2 hover:bg-red-50 text-red-400 rounded-xl"
              title="Delete Account"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Pull-to-refresh indicator */}
      {(pullProgress > 0.1 || refreshing) && (
        <div
          className="flex items-center justify-center gap-2 bg-slate-50/50 overflow-hidden transition-[height]"
          style={{ height: refreshing ? 36 : Math.round(pullProgress * 36) }}
        >
          <RefreshCw
            size={14}
            className={`text-blue-500 transition-transform ${refreshing ? "animate-spin" : ""}`}
            style={{ transform: refreshing ? undefined : `rotate(${pullProgress * 360}deg)` }}
          />
          <span className="text-[10px] font-semibold text-slate-400">
            {refreshing ? "Refreshing…" : pullProgress >= 1 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        onTouchStart={handleScrollTouchStart}
        onTouchMove={handleScrollTouchMove}
        onTouchEnd={handleScrollTouchEnd}
        onTouchCancel={handleScrollTouchEnd}
        className="flex-1 overflow-y-auto px-4 py-5 space-y-5 bg-slate-50/50 pb-20"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
            <span className="text-xs text-slate-400 font-medium">Loading profile...</span>
          </div>
        ) : profile && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center relative overflow-hidden pb-5">
            {/* Banner area */}
            <div className="relative w-full h-24 overflow-hidden">
              {profile.bannerUrl?.startsWith("css:") ? (
                <div className="w-full h-full" style={{ background: profile.bannerUrl.slice(4) }} />
              ) : profile.bannerUrl ? (
                <img
                  src={profile.bannerUrl}
                  alt="Profile banner"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-emerald-500/20" />
              )}
              {isMe && (
                <button
                  onClick={() => setShowBannerPicker(true)}
                  className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-lg text-white text-[10px] font-bold transition-colors"
                >
                  <Camera size={11} />{profile.bannerUrl ? "Edit" : "Add Banner"}
                </button>
              )}
            </div>
            {/* Avatar overlapping the banner — pops in on load and carries a
                subtle pulsing glow ring, shown for both own and other profiles. */}
            <div className="relative -mt-10 snix-avatar-pop" style={{ pointerEvents: "none" }}>
              {/* pointer-events:none on the avatar image so tapping a GIF avatar
                  doesn't pause/freeze the animation (browser default behaviour).
                  The camera edit button re-enables pointer-events on itself. */}
              <img src={profile.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.displayName}`}
                alt={profile.displayName} className="w-20 h-20 rounded-full border-4 border-white bg-slate-100 shadow-md snix-avatar-ring" />
              {isMe && (
                <button onClick={()=>setShowAvatarPicker(true)}
                  className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 rounded-full border-2 border-white flex items-center justify-center shadow-sm"
                  style={{ pointerEvents: "auto" }}>
                  <Camera size={12} className="text-white" />
                </button>
              )}
            </div>
            {/* All content below the avatar needs the horizontal padding the card used to provide via p-5 */}
            <div className="px-5 w-full flex flex-col items-center">
            {editingName ? (
              <div className="w-full px-4 mt-3 space-y-2">
                <div
                  className="w-full px-3 py-2 bg-slate-50 border border-blue-300 rounded-xl text-sm font-bold text-center min-h-[36px] leading-relaxed cursor-pointer select-none"
                  style={{ fontFamily:"'Space Grotesk', sans-serif" }}
                  onPointerDown={e => { e.preventDefault(); startNameEdit(); }}
                >
                  {nameText
                    ? <>{nameText}<span className="border-r-2 border-blue-500 ml-px animate-pulse">&nbsp;</span></>
                    : <span className="text-slate-400 font-normal italic text-xs">Tap to type your name...</span>
                  }
                </div>
                <div className="flex justify-center gap-1.5">
                  <button
                    onPointerDown={e => { e.preventDefault(); setEditingName(false); setNameText(profile.displayName||""); closeKeyboard(); }}
                    className="px-2.5 py-1 text-[10px] font-bold text-slate-500 bg-slate-100 rounded-lg"
                  >Cancel</button>
                  <button
                    onPointerDown={e => { e.preventDefault(); saveName(); }}
                    disabled={saveFeedback==='saving'||saveFeedback==='saved'}
                    className={`px-2.5 py-1 text-[10px] font-bold text-white rounded-lg flex items-center gap-1 ${saveFeedback==='saved'?'bg-emerald-500':saveFeedback==='error'?'bg-red-500':'bg-blue-600'}`}
                  >
                    {saveFeedback==='saving'?<><span className="animate-spin rounded-full h-2.5 w-2.5 border border-white border-t-transparent"/>Saving...</>:saveFeedback==='saved'?'✓ Saved!':saveFeedback==='error'?'Error!':'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative w-full flex items-center justify-center mt-3">
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <h3 className="text-xl font-black text-slate-900 tracking-tight" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>{profile.displayName}</h3>

                </div>
                {isMe && (
                  <button
                    onPointerDown={e => { e.preventDefault(); startNameEdit(); }}
                    className="absolute right-2 p-1 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-slate-100 transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            )}
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-wide">AGENT ID: {profile.uid.substring(0,10).toUpperCase()}</p>
            <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-full mt-2.5 flex items-center gap-1">
              <Calendar size={10} />{fmt(profile.createdAt)}
            </span>
            <div className="w-full mt-4 border-t border-b border-slate-100/80 py-3.5 px-1">
              {editingBio ? (
                <div className="space-y-2">
                  {/* Tappable display — opens in-app keyboard, never native keyboard */}
                  <div
                    className="w-full px-3 py-2 bg-slate-50 border border-blue-300 rounded-xl text-xs min-h-[48px] leading-relaxed break-words whitespace-pre-wrap cursor-pointer select-none"
                    onPointerDown={e => { e.preventDefault(); startBioEdit(); }}
                  >
                    {bioText
                      ? <>{bioText}<span className="border-r-2 border-blue-500 ml-px animate-pulse">&nbsp;</span></>
                      : <span className="text-slate-400 italic">Tap to type your bio...</span>
                    }
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      onPointerDown={e => { e.preventDefault(); setEditingBio(false); setBioText(profile.bio||""); closeKeyboard(); }}
                      className="px-2.5 py-1 text-[10px] font-bold text-slate-500 bg-slate-100 rounded-lg"
                    >Cancel</button>
                    <button
                      onPointerDown={e => { e.preventDefault(); saveBio(); }}
                      disabled={saveFeedback==='saving'||saveFeedback==='saved'}
                      className={`px-2.5 py-1 text-[10px] font-bold text-white rounded-lg flex items-center gap-1 ${saveFeedback==='saved'?'bg-emerald-500':saveFeedback==='error'?'bg-red-500':'bg-blue-600'}`}
                    >
                      {saveFeedback==='saving'?<><span className="animate-spin rounded-full h-2.5 w-2.5 border border-white border-t-transparent"/>Saving...</>:saveFeedback==='saved'?'✓ Saved!':saveFeedback==='error'?'Error!':'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <LinkText text={`"${profile.bio||"No bio set."}"`} className="text-xs text-slate-600 leading-relaxed font-medium italic" />
                  {isMe && (
                    <button
                      onPointerDown={e => { e.preventDefault(); startBioEdit(); }}
                      className="text-[10px] text-blue-600 font-bold hover:underline mt-2.5"
                    >Edit Bio</button>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-around items-center w-full mt-4">
              <button onClick={()=>setShowFollowers(true)} className="flex flex-col items-center">
                <span className="text-lg font-black text-slate-900">{followerUids.length}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-0.5"><Users size={9} />Followers</span>
              </button>
              <div className="w-px h-8 bg-slate-100" />
              <button onClick={()=>setShowFollowing(true)} className="flex flex-col items-center">
                <span className="text-lg font-black text-slate-900">{followingUids.length}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-0.5"><Users size={9} />Following</span>
              </button>
              <div className="w-px h-8 bg-slate-100" />
              <div className="flex flex-col items-center">
                <span className="text-lg font-black text-slate-900">{userPosts.length}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Configs</span>
              </div>
            </div>
            {!isMe && currentUser && !isGuest && (
              <button onClick={handleFollowToggle}
                className={`w-full py-3 mt-5 font-bold rounded-xl text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-sm ${isFollowing?"bg-slate-100 text-slate-700":"bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow-md"}`}>
                {isFollowing?<><UserCheck size={14}/>Following</>:<><UserPlus size={14}/>Follow Agent</>}
              </button>
            )}
            </div>{/* end px-5 content wrapper */}
          </div>
        )}

        {/* Posts / Reacted tabs */}
        <div className="space-y-3">
          {isMe && (
            <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
              <button
                onClick={() => setProfileTab("posts")}
                className={`flex-1 py-2 text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${profileTab === "posts" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}
              >
                <FolderLock size={11} />Shared Configs
              </button>
              <button
                onClick={() => setProfileTab("reacted")}
                className={`flex-1 py-2 text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${profileTab === "reacted" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}
              >
                <Zap size={11} />Reacted
              </button>
            </div>
          )}
          {!isMe && (
            <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1"><FolderLock size={12} />Shared Configurations</h4>
          )}

          {profileTab === "reacted" && isMe ? (
            reactedLoading ? (
              <div className="flex justify-center py-6"><span className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-600" /></div>
            ) : reactedPosts.length === 0 ? (
              <div className="bg-white p-6 rounded-2xl border border-slate-100 text-center flex flex-col items-center gap-2 shadow-sm">
                <Zap size={20} className="text-slate-300" />
                <p className="text-slate-400 text-xs font-medium">No reactions yet.</p>
                <p className="text-slate-300 text-[10px]">Posts you ❤️ 👌 👎 in the feed will appear here.</p>
              </div>
            ) : reactedPosts.map(item => (
              <button
                key={`${item.type}_${item.post.id}`}
                onClick={() => { onNotificationTap?.(item.post.id, undefined); onBackToFeed?.(); }}
                className="w-full flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-left active:bg-slate-50 transition-colors"
              >
                {/* Reaction badge */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0 ${
                  item.type === 'heart' ? 'bg-red-50' : item.type === 'ok' ? 'bg-emerald-50' : 'bg-slate-100'
                }`}>
                  {item.type === 'heart' ? '❤️' : item.type === 'ok' ? '👌' : '👎'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-900 line-clamp-1">{item.post.title}</p>
                  <p className="text-[10px] text-slate-400 font-medium truncate">{item.post.authorName}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] text-slate-400">{fmt(item.reactedAt)} ago</span>
                    <span className="text-[9px] text-blue-500 font-semibold">· Tap to view</span>
                  </div>
                </div>
                <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold px-2 py-0.5 rounded uppercase shrink-0 max-w-[60px] truncate">
                  {item.post.vpnApp === "Other" ? (item.post.customVpnName || "Other") : item.post.vpnApp}
                </span>
              </button>
            ))
          ) : (
            <>
              {postsLoading ? <div className="flex justify-center py-6"><span className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-600" /></div>
                : userPosts.length === 0 ? <div className="bg-white p-6 rounded-2xl border border-slate-100 text-center text-slate-400 text-xs shadow-sm">No configurations posted yet.</div>
                : userPosts.map(post => {
                const isBusy = deletingPostId===post.id;
                const isCfm  = confirmDeletePostId===post.id;
                return (
                  <div key={post.id} className={`bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2 ${isBusy?"opacity-40 pointer-events-none":""}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="text-xs font-black text-slate-900 line-clamp-1">{post.title}</span>
                        {post.sharingMode==="cloud_only" && <span className="text-[8px] text-emerald-600 font-semibold flex items-center gap-0.5"><Cloud size={8}/>Cloud</span>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold px-2 py-0.5 rounded uppercase">{post.vpnApp==="Other"?(post.customVpnName||"Other"):post.vpnApp}</span>
                        <ProfileExpiryBadge expiresAt={post.expiresAt} />
                        {isMe && (isCfm ? (
                          <div className="flex items-center gap-1">
                            <button onClick={()=>handleDeletePost(post.id)} className="px-2 py-0.5 text-[9px] font-bold text-white bg-red-500 rounded-lg">
                              {isBusy?<span className="animate-spin rounded-full h-2.5 w-2.5 border border-white border-t-transparent inline-block"/>:"Delete"}
                            </button>
                            <button onClick={()=>setConfirmDeletePostId(null)} className="px-2 py-0.5 text-[9px] font-bold text-slate-500 bg-slate-100 rounded-lg">No</button>
                          </div>
                        ) : (
                          <button onClick={()=>setConfirmDeletePostId(post.id)} className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400"><Trash2 size={13}/></button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 whitespace-pre-wrap">{post.description}</p>
                    <div className="flex justify-between items-center mt-1 pt-2 border-t border-slate-50">
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-semibold">
                        <span>❤️ {Math.max(0,post.heartCount??post.upvotes??0)}</span>
                        <span>👌 {Math.max(0,post.okCount??0)}</span>
                        <span>👎 {Math.max(0,post.downCount??post.downvotes??0)}</span>
                        {(post.commentCount??0)>0 && <span>💬 {post.commentCount}</span>}
                      </div>
                      <button onClick={()=>{ copyToClipboard(post.configContent); setCopiedId(post.id); setTimeout(()=>setCopiedId(null),2000); }}
                        className={`px-2 py-1 rounded text-[9px] font-bold flex items-center gap-1 ${copiedId===post.id?"bg-emerald-500 text-white":"bg-slate-100 hover:bg-slate-200 text-slate-600"}`}>
                        {copiedId===post.id?"Copied":"Copy Config"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
