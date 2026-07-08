import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import { collection, query, onSnapshot, doc, updateDoc, setDoc, deleteDoc, where, increment, getDocs } from "firebase/firestore";
import { VPNPost, VPN_APPS_LIST, PostReaction, COUNTRIES } from "../types";
import { Search, Download, Layers, Sparkles, Eye, EyeOff, Cloud, FileCode, LogIn, Clock, CheckCircle, MessageCircle, Trash2 } from "lucide-react";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
import CommentsSheet from "./CommentsSheet";
import VKInput from "./VKInput";
import LinkText from "./LinkText";

const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

async function copyToClipboard(text: string) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return; } } catch {}
  const el = document.createElement("textarea"); el.value = text; el.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
  document.body.appendChild(el); el.focus(); el.select();
  try { document.execCommand("copy"); } catch {} document.body.removeChild(el);
}

async function saveFileNative(fileName: string, content: string, isBinary: boolean): Promise<{ path: string; location: string } | null> {
  // Access Filesystem via the Capacitor bridge directly.
  // We intentionally avoid a static `import from "@capacitor/filesystem"` because
  // Rollup externalises @capacitor/* packages, leaving a bare module specifier in
  // the bundle. Chrome's WebView rejects bare specifiers without an import-map,
  // causing the entire JS module to fail and preventing React from mounting.
  const FS = (window as any).Capacitor?.Plugins?.Filesystem;
  if (!FS) return null;

  // Best-effort permission request — never abort if denied
  try { await FS.requestPermissions(); } catch {}

  // Save order:
  // 1. EXTERNAL_STORAGE / Download/SNIX/configs — public Downloads, works on Android ≤10
  // 2. EXTERNAL / SNIX/configs                  — app external dir, visible in Files app
  // 3. DATA / SNIX/configs                      — app internal storage, always writable
  const attempts: Array<{ dir: string; folder: string; label: string }> = [
    { dir: "EXTERNAL_STORAGE", folder: "Download/SNIX/configs", label: "Downloads/SNIX/configs" },
    { dir: "EXTERNAL",         folder: "SNIX/configs",          label: "Files › Android › data › com.mkdev.snix › files › SNIX › configs" },
    { dir: "DATA",             folder: "SNIX/configs",          label: "App internal storage (SNIX/configs)" },
  ];

  for (const { dir, folder, label } of attempts) {
    try {
      await FS.mkdir({ path: folder, directory: dir, recursive: true }).catch(() => {});
      const fullPath = `${folder}/${fileName}`;
      let result: { uri: string };
      if (isBinary) {
        result = await FS.writeFile({ path: fullPath, data: content, directory: dir });
      } else {
        result = await FS.writeFile({ path: fullPath, data: content, directory: dir, encoding: "utf8" });
      }
      return { path: result.uri.replace("file://", ""), location: label };
    } catch (e) {
      console.warn(`[SNIX] writeFile to ${dir}/${folder} failed:`, e);
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
      <div className="relative w-full bg-white rounded-t-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
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
  if (!post.expiresAt) return null;
  const now = Date.now(), remaining = post.expiresAt - now;
  if (remaining < 0) {
    const graceLeft = (post.expiresAt + 24*3600000) - now;
    if (graceLeft < 0) return null;
    return <span className="text-[9px] font-bold bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={9} />EXPIRED</span>;
  }
  const days = Math.floor(remaining/86400000), hrs = Math.floor((remaining%86400000)/3600000);
  const label = days > 0 ? `${days}d ${hrs}h left` : `${hrs}h left`;
  return <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${remaining<3*3600000?"bg-orange-100 text-orange-600 border border-orange-200":"bg-emerald-100 text-emerald-700 border border-emerald-200"}`}><Clock size={9} />{label}</span>;
}

// Toast notification for download path
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

// Spinning progress ring — like WhatsApp/Telegram download indicator
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAppFilter, setSelectedAppFilter] = useState("All");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [userReactions, setUserReactions] = useState<Record<string, 'heart'|'ok'|'down'>>({});
  const [downloadedId, setDownloadedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [guestAction, setGuestAction] = useState<string | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [highlightCommentId, setHighlightCommentId] = useState<string | undefined>();
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [expandedCountries, setExpandedCountries] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubPosts = onSnapshot(query(collection(db, "posts")), snap => {
      const now = Date.now(), grace = 24*3600000;
      const data: VPNPost[] = [];
      snap.forEach(d => {
        const p = { id: d.id, ...d.data() } as VPNPost;
        if (p.expiresAt && now > p.expiresAt + grace) return;
        data.push(p);
      });
      data.sort((a,b) => ((b.createdAt as number)||0) - ((a.createdAt as number)||0));
      setPosts(data); setLoading(false);
    }, () => setLoading(false));

    const currentUser = auth.currentUser;
    let unsubReactions = () => {};
    if (currentUser) {
      unsubReactions = onSnapshot(query(collection(db,"reactions"),where("userId","==",currentUser.uid)), snap => {
        const map: Record<string, 'heart'|'ok'|'down'> = {};
        snap.forEach(d => { const r = d.data() as PostReaction; map[r.postId] = r.type; });
        setUserReactions(map);
      }, () => {});
    }
    return () => { unsubPosts(); unsubReactions(); };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(t);
  }, [loading]);

  // Handle deep-link from notification tap
  useEffect(() => {
    if (!deepLink?.postId) return;
    setCommentPostId(deepLink.postId);
    setHighlightCommentId(deepLink.commentId);
    onDeepLinkConsumed?.();
  }, [deepLink?.postId, deepLink?.commentId]);

  const handleCopy = (postId: string, content: string) => {
    if (isGuest) { setGuestAction("Copy Configs"); return; }
    copyToClipboard(content).finally(() => { setCopiedId(postId); setTimeout(() => setCopiedId(null), 2000); });
  };

  const handleCopyCloudLink = (postId: string) => {
    if (isGuest) { setGuestAction("Copy Cloud Links"); return; }
    const post = posts.find(p => p.id === postId);
    let url: string;
    if (post?.sharingMode === 'cloud_link') {
      const match = post.description.match(/https?:\/\/[^\s<>"']+/);
      url = match ? match[0] : '';
    } else {
      url = getCloudUrl(postId);
    }
    if (!url) return;
    copyToClipboard(url).finally(() => { setCopiedId(postId); setTimeout(() => setCopiedId(null), 2000); });
  };

  const handleDownload = async (post: VPNPost) => {
    if (isGuest) { setGuestAction("Download Configs"); return; }
    if (downloadingId === post.id) return; // prevent double-tap
    const currentUser = auth.currentUser;
    const fileName = post.configFileName || `${post.title.toLowerCase().replace(/\s+/g,"_")}.conf`;

    setDownloadingId(post.id);

    let savedOk = false;
    if (isNative) {
      const result = await saveFileNative(fileName, post.configContent, !!post.isBinary);
      if (result) {
        savedOk = true;
        setDownloadToast(result.location);
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
    }
    try { if (currentUser) await updateDoc(doc(db,"posts",post.id), { downloadCount: increment(1) }); } catch {}
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

  const currentUserId = auth.currentUser?.uid;
  const filteredPosts = posts.filter(p => {
    const vpnName = p.vpnApp==="Other"?(p.customVpnName||"Other"):p.vpnApp;
    const matchSearch = [p.title,p.description,vpnName,p.authorName].some(s=>s.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchApp = selectedAppFilter==="All" || p.vpnApp===selectedAppFilter;
    return matchSearch && matchApp;
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {guestAction && <GuestPrompt action={guestAction} onSignIn={() => { setGuestAction(null); onSignInRequired(); }} />}
      {commentPostId && <CommentsSheet postId={commentPostId} isGuest={isGuest} highlightCommentId={highlightCommentId}
        onSignInRequired={() => { setCommentPostId(null); onSignInRequired(); }} onClose={() => { setCommentPostId(null); setHighlightCommentId(undefined); }} />}
      {downloadToast && <DownloadToast location={downloadToast} onDismiss={() => setDownloadToast(null)} />}

      <div className="p-4 bg-white border-b border-slate-100 shadow-sm z-10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button onClick={onAboutPress} className="flex items-center gap-1.5 active:scale-95 transition-transform">
            <Layers className="text-emerald-500 animate-pulse stroke-[2.5]" size={20} />
            <span className="text-xl font-black text-slate-900 tracking-tight" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>SNIX</span>
          </button>
          <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full tracking-wider uppercase">{filteredPosts.length} Configs</span>
        </div>
        <div>
          <VKInput
            value={searchQuery}
            onChange={v => setSearchQuery(v.slice(0, 30))}
            placeholder="Search configs, VPN app, author..."
            icon={<Search size={16} />}
            maxLength={30}
            inputClassName="px-3 py-2 bg-slate-50 border-slate-200 focus-within:border-emerald-500 text-xs"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 no-scrollbar">
          <button onClick={() => setSelectedAppFilter("All")}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg whitespace-nowrap border transition-all uppercase tracking-wide ${selectedAppFilter==="All"?"bg-slate-950 text-white border-slate-950 shadow-sm":"bg-slate-50 text-slate-500 border-slate-200"}`}>All</button>
          {VPN_APPS_LIST.filter(a=>a!=="None").map(app => (
            <button key={app} onClick={() => setSelectedAppFilter(app)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg whitespace-nowrap border transition-all uppercase tracking-wide ${selectedAppFilter===app?"bg-gradient-to-tr from-blue-600 to-blue-500 text-white border-blue-600 shadow-sm":"bg-slate-50 text-slate-500 border-slate-200"}`}>{app}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4 bg-slate-50/50 pb-20">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent" />
            <span className="text-xs text-slate-400 font-medium">Loading configs...</span>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center flex flex-col items-center gap-3 shadow-sm">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400"><Sparkles size={20} /></div>
            <h4 className="text-sm font-bold text-slate-800">No configurations found</h4>
            <p className="text-xs text-slate-500 max-w-[200px] leading-relaxed">Be the first to post a config!</p>
          </div>
        ) : filteredPosts.map(post => {
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
            <div key={post.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all ${post.expiresAt && Date.now() > post.expiresAt ? "border-red-100 opacity-80" : "border-slate-100"} ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="p-4 flex items-center justify-between border-b border-slate-50">
                <div onClick={() => onAuthorClick(post.uid)} className="flex items-center gap-2.5 cursor-pointer group">
                  <img src={post.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${post.uid}`} alt={post.authorName}
                    className="w-8 h-8 rounded-full border border-slate-200 bg-slate-50 group-hover:scale-105 transition-transform" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors block">{post.authorName}</span>
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
                    <button onClick={() => setConfirmDeletePostId(post.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"><Trash2 size={13} /></button>
                  ))}
                </div>
              </div>

              <div className="px-4 pt-3 pb-2">
                <h3 className="text-sm font-black text-slate-900 leading-snug">{post.title}</h3>
                <LinkText text={post.description} className="text-xs text-slate-600 mt-1.5 leading-relaxed block" />
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
                  /* Cloud Link block — no Reveal needed, URL is in description */
                  <div className="bg-slate-900 rounded-xl p-3.5 border border-slate-800 flex items-center justify-between gap-3">
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
                      <Cloud size={11} />{copiedId===post.id?"Copied!":"Copy Link"}
                    </button>
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
                <div className="flex items-center gap-2">
                  <button onClick={() => setCommentPostId(post.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white text-slate-500 border border-slate-200 hover:bg-slate-100">
                    <MessageCircle size={13} /><span className="text-[10px]">{commentCount}</span>
                  </button>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium px-1.5">
                    <Download size={11} /><span>{downloads}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
