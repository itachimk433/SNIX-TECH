/**
 * AdminReportsView — visible only to the owner account.
 *
 * Shows all reports filed by users via the long-press "Report Post" menu.
 * Each report stores: postId, reportedBy, type, createdAt, status ("pending"|"resolved"|"dismissed").
 *
 * Actions available per report:
 *  - Mark Resolved  — update status → "resolved"
 *  - Dismiss        — update status → "dismissed" (harmless report, no action needed)
 *  - Delete Post    — delete the reported post from Firestore + mark report resolved
 */
import React, { useEffect, useState } from "react";
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, deleteDoc, getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { X, Flag, CheckCircle, Trash2, XCircle, RefreshCw, ChevronDown } from "lucide-react";

type ReportStatus = "pending" | "resolved" | "dismissed";
type FilterTab    = "pending" | "resolved" | "dismissed" | "all";

interface Report {
  id: string;
  postId: string;
  reportedBy: string;
  type: string;
  createdAt: number;
  status: ReportStatus;
}

interface PostSnap {
  title?: string;
  uid?: string;
  authorName?: string;
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATUS_STYLES: Record<ReportStatus, string> = {
  pending:   "font-bold text-xs px-2 py-0.5 rounded-full" as any,
  resolved:  "font-bold text-xs px-2 py-0.5 rounded-full" as any,
  dismissed: "font-bold text-xs px-2 py-0.5 rounded-full" as any,
};
const STATUS_INLINE: Record<ReportStatus, React.CSSProperties> = {
  pending:   { backgroundColor: "rgba(255,200,0,0.12)", color: "#FFD700", border: "1px solid rgba(255,200,0,0.3)" },
  resolved:  { backgroundColor: "rgba(0,255,136,0.12)", color: "#00FF88", border: "1px solid rgba(0,255,136,0.3)" },
  dismissed: { backgroundColor: "#111B2A", color: "#3A5A78", border: "1px solid #1E3A5F" },
};

export default function AdminReportsView({ onClose }: { onClose: () => void }) {
  const [reports, setReports]   = useState<Report[]>([]);
  const [postCache, setPostCache] = useState<Record<string, PostSnap>>({});
  const [filter, setFilter]     = useState<FilterTab>("pending");
  const [acting, setActing]     = useState<string | null>(null); // report id being actioned
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Live reports listener ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as Report));
      setReports(rows);

      // Fetch post titles we haven't cached yet
      const uncached = [...new Set(rows.map(r => r.postId))].filter(id => !postCache[id]);
      uncached.forEach(async postId => {
        try {
          const snap = await getDoc(doc(db, "posts", postId));
          if (snap.exists()) {
            setPostCache(prev => ({ ...prev, [postId]: snap.data() as PostSnap }));
          } else {
            setPostCache(prev => ({ ...prev, [postId]: { title: "[Post deleted]" } }));
          }
        } catch {
          setPostCache(prev => ({ ...prev, [postId]: { title: "[Could not load]" } }));
        }
      });
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filter === "all" ? reports : reports.filter(r => r.status === filter);

  const counts: Record<FilterTab, number> = {
    pending:   reports.filter(r => r.status === "pending").length,
    resolved:  reports.filter(r => r.status === "resolved").length,
    dismissed: reports.filter(r => r.status === "dismissed").length,
    all:       reports.length,
  };

  // ── Actions ──────────────────────────────────────────────────────────────────
  const markStatus = async (reportId: string, status: ReportStatus) => {
    setActing(reportId);
    try { await updateDoc(doc(db, "reports", reportId), { status }); }
    catch (e) { console.error(e); }
    finally { setActing(null); }
  };

  const deletePost = async (reportId: string, postId: string) => {
    if (!window.confirm("Permanently delete this post? This cannot be undone.")) return;
    setActing(reportId);
    try {
      await deleteDoc(doc(db, "posts", postId));
      await updateDoc(doc(db, "reports", reportId), { status: "resolved" });
      setPostCache(prev => ({ ...prev, [postId]: { title: "[Post deleted]" } }));
    } catch (e) { console.error(e); }
    finally { setActing(null); }
  };

  const TABS: { key: FilterTab; label: string }[] = [
    { key: "pending",   label: "Pending"   },
    { key: "resolved",  label: "Resolved"  },
    { key: "dismissed", label: "Dismissed" },
    { key: "all",       label: "All"       },
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-h-[90vh] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-500 flex items-center justify-center text-white shrink-0">
              <Flag size={16} />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
                Reported Posts
              </p>
              <p className="text-[10px] text-slate-400 font-medium">{counts.pending} pending · {counts.all} total</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-2 shrink-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-colors ${
                filter === t.key
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {t.label}
              {counts[t.key] > 0 && (
                <span className={`ml-1 ${filter === t.key ? "opacity-70" : "opacity-60"}`}>
                  ({counts[t.key]})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <CheckCircle size={32} className="text-slate-200" />
              <p className="text-sm font-bold text-slate-400">
                {filter === "pending" ? "No pending reports 🎉" : "Nothing here"}
              </p>
            </div>
          )}

          {filtered.map(report => {
            const post   = postCache[report.postId];
            const isOpen = expandedId === report.id;
            const busy   = acting === report.id;

            return (
              <div key={report.id} className="bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden">
                {/* Summary row */}
                <button
                  className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => setExpandedId(isOpen ? null : report.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${STATUS_STYLES[report.status]}`}>
                        {report.status}
                      </span>
                      <span className="text-[10px] text-slate-400">{timeAgo(report.createdAt)}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 mt-1 truncate">
                      {post ? (post.title || "Untitled post") : "Loading…"}
                    </p>
                    {post?.authorName && (
                      <p className="text-[10px] text-slate-400">by {post.authorName}</p>
                    )}
                  </div>
                  <ChevronDown size={14} className={`text-slate-400 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Expanded details + actions */}
                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                    {/* IDs */}
                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Post ID</p>
                      <p className="text-[10px] text-slate-600 font-mono break-all">{report.postId}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">Reported By (UID)</p>
                      <p className="text-[10px] text-slate-600 font-mono break-all">{report.reportedBy}</p>
                    </div>

                    {/* Action buttons */}
                    {busy ? (
                      <div className="flex items-center justify-center py-2">
                        <RefreshCw size={14} className="animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {report.status !== "resolved" && (
                          <button
                            onClick={() => markStatus(report.id, "resolved")}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-xl"
                          >
                            <CheckCircle size={13} /> Mark Resolved
                          </button>
                        )}
                        {report.status !== "dismissed" && (
                          <button
                            onClick={() => markStatus(report.id, "dismissed")}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                          >
                            <XCircle size={13} /> Dismiss (no action)
                          </button>
                        )}
                        {post?.title !== "[Post deleted]" && (
                          <button
                            onClick={() => deletePost(report.id, report.postId)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white text-xs font-bold rounded-xl"
                          >
                            <Trash2 size={13} /> Delete Post
                          </button>
                        )}
                        {report.status !== "pending" && (
                          <button
                            onClick={() => markStatus(report.id, "pending")}
                            className="w-full flex items-center justify-center gap-2 py-2 bg-slate-100 text-slate-500 text-[10px] font-semibold rounded-xl"
                          >
                            Reopen as Pending
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
