import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { X, Trophy, Users, Heart, FileStack, Award, Globe2, MapPin, LogIn } from "lucide-react";
import { COUNTRIES } from "../types";
import { ProBadge } from "./ProBadge";

type Scope = "global" | "local";
type Category = "overall" | "reactions" | "followers" | "posts";

interface LeaderboardEntry {
  uid: string;
  name: string;
  avatar?: string;
  isPro?: boolean;
  country?: string;
  followerCount: number;
  postCount: number;
  reactionCount: number;
}

interface LeaderboardModalProps {
  onClose: () => void;
  onAuthorClick?: (uid: string) => void;
  currentUserCountry?: string;
  currentUserUid?: string;
  isGuest?: boolean;
  onSignInRequired?: () => void;
}

// Weighted composite used for the "Overall" tab. Followers matter most since
// they represent sustained trust from the community, posts and reactions are
// weighted evenly behind that.
function overallScore(e: LeaderboardEntry): number {
  return e.followerCount * 2 + e.postCount * 3 + e.reactionCount * 1;
}

const CATEGORIES: { key: Category; label: string; icon: React.ReactNode }[] = [
  { key: "overall",   label: "Overall",         icon: <Award size={13} /> },
  { key: "reactions", label: "Most Reactions",  icon: <Heart size={13} /> },
  { key: "followers", label: "Most Followers",  icon: <Users size={13} /> },
  { key: "posts",     label: "Most Configs",    icon: <FileStack size={13} /> },
];

function valueFor(e: LeaderboardEntry, category: Category): string {
  switch (category) {
    case "reactions": return `${e.reactionCount} reactions`;
    case "followers": return `${e.followerCount} followers`;
    case "posts":     return `${e.postCount} configs`;
    default:          return `${overallScore(e)} pts`;
  }
}

export default function LeaderboardModal({ onClose, onAuthorClick, currentUserCountry, currentUserUid, isGuest, onSignInRequired }: LeaderboardModalProps) {
  const [scope, setScope] = useState<Scope>("global");
  const [category, setCategory] = useState<Category>("overall");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Hooks are always called unconditionally (Rules of Hooks).
  // The guest-prompt branch is rendered after all hooks run.
  useEffect(() => {
    // Don't fetch leaderboard data for guests — they'll see the sign-in prompt.
    if (isGuest) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [usersSnap, postsSnap] = await Promise.all([
          getDocs(query(collection(db, "users"), orderBy("followerCount", "desc"), limit(200))),
          getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(500))),
        ]);
        if (cancelled) return;

        const map = new Map<string, LeaderboardEntry>();

        usersSnap.forEach(d => {
          const u = d.data() as any;
          map.set(d.id, {
            uid: d.id,
            name: u.displayName || "Agent",
            avatar: u.avatarUrl,
            isPro: !!u.isPro,
            country: u.country,
            followerCount: u.followerCount || 0,
            postCount: 0,
            reactionCount: 0,
          });
        });

        postsSnap.forEach(d => {
          const p = d.data() as any;
          const uid = p.uid;
          if (!uid) return;
          const reactions = (p.heartCount || 0) + (p.okCount || 0);
          const existing = map.get(uid);
          if (existing) {
            existing.postCount += 1;
            existing.reactionCount += reactions;
            if (!existing.avatar && p.authorAvatar) existing.avatar = p.authorAvatar;
            if (p.authorIsPro) existing.isPro = true;
          } else {
            map.set(uid, {
              uid,
              name: p.authorName || "Agent",
              avatar: p.authorAvatar,
              isPro: !!p.authorIsPro,
              country: undefined,
              followerCount: 0,
              postCount: 1,
              reactionCount: reactions,
            });
          }
        });

        setEntries(Array.from(map.values()));
      } catch (e) {
        if (!cancelled) setError("Couldn't load the leaderboard — check your connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pool = scope === "local"
    ? entries.filter(e => currentUserCountry && e.country === currentUserCountry)
    : entries;

  const sortedFull = [...pool].sort((a, b) => {
    switch (category) {
      case "reactions": return b.reactionCount - a.reactionCount;
      case "followers": return b.followerCount - a.followerCount;
      case "posts":     return b.postCount - a.postCount;
      default:          return overallScore(b) - overallScore(a);
    }
  }).filter(e => {
    if (category === "reactions") return e.reactionCount > 0;
    if (category === "followers") return e.followerCount > 0;
    if (category === "posts") return e.postCount > 0;
    return overallScore(e) > 0;
  });

  // Top 10 displayed to everyone
  const top10 = sortedFull.slice(0, 10);

  // Find the current user's rank in the full pool (1-based, only visible to them)
  const myRankIdx = currentUserUid
    ? sortedFull.findIndex(e => e.uid === currentUserUid)
    : -1;
  const myRank = myRankIdx >= 0 ? myRankIdx + 1 : -1;
  const myEntry = myRankIdx >= 0 ? sortedFull[myRankIdx] : null;
  // Only show "your rank" card if the user isn't already in top 10
  const showMyRank = myEntry && myRank > 10;

  const countryMeta = COUNTRIES.find(c => c.code === currentUserCountry);

  const handleScopeChange = (newScope: Scope) => {
    if (newScope === "local" && !currentUserCountry) return; // handled by empty state
    setScope(newScope);
  };

  // Guest prompt — rendered after all hooks to avoid Rules-of-Hooks violations.
  if (isGuest) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div
          className="relative w-full bg-white rounded-t-3xl p-6 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-10 h-1 bg-slate-200 rounded-full" />
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
              <Trophy size={26} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Sign In to See Rankings</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-[240px] mx-auto">
                Create a free SNIX account to view the leaderboard and see where you rank.
              </p>
            </div>
            <button
              onClick={() => { onClose(); onSignInRequired?.(); }}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-emerald-500 text-white font-bold rounded-xl text-xs tracking-wider uppercase shadow-md flex items-center justify-center gap-2"
            >
              <LogIn size={14} /> Sign In / Create Account
            </button>
            <button onClick={onClose} className="text-xs text-slate-400 font-medium">Maybe later</button>
          </div>
        </div>
      </div>
    );
  }

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
          <h3 className="font-black text-slate-900 text-base flex items-center gap-1.5" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>
            <Trophy size={17} className="text-amber-500" /> Leaderboard
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400"><X size={18} /></button>
        </div>

        {/* Scope tabs */}
        <div className="flex px-5 gap-2 shrink-0 pb-3">
          <button
            onClick={() => handleScopeChange("global")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${scope === "global" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"}`}
          ><Globe2 size={13} /> Global</button>
          <button
            onClick={() => handleScopeChange("local")}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 ${scope === "local" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"}`}
          ><MapPin size={13} /> National{countryMeta ? ` ${countryMeta.flag}` : ""}</button>
        </div>

        {/* Category chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 px-5 no-scrollbar shrink-0">
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg whitespace-nowrap border transition-all uppercase tracking-wide flex items-center gap-1 ${category===c.key?"bg-gradient-to-tr from-blue-600 to-emerald-500 text-white border-blue-600 shadow-sm":"bg-slate-50 text-slate-500 border-slate-200"}`}>
              {c.icon}{c.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="animate-spin rounded-full h-7 w-7 border-2 border-slate-900 border-t-transparent" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-500 text-center py-8">{error}</p>
          ) : scope === "local" && !currentUserCountry ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <MapPin size={24} className="text-slate-300" />
              <p className="text-sm font-black text-slate-900">Set your country</p>
              <p className="text-[11px] text-slate-400 max-w-[220px]">Pick your country in Settings to see the local leaderboard for creators near you.</p>
            </div>
          ) : top10.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center text-slate-400">
              <Trophy size={24} className="text-slate-300" />
              <p className="text-xs font-medium">No ranked creators yet in this category</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {top10.map((e, i) => (
                <button
                  key={e.uid}
                  onClick={() => onAuthorClick?.(e.uid)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black ${
                    i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-slate-300 text-white" : i === 2 ? "bg-amber-700 text-white" : "bg-slate-200 text-slate-500"
                  }`}>{i + 1}</div>
                  {e.avatar ? (
                    <img src={e.avatar} alt={e.name} className="w-9 h-9 rounded-xl object-cover bg-slate-200 shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-slate-200 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1">
                      {e.name} {e.isPro && <ProBadge size="xs" />}
                      {e.uid === currentUserUid && (
                        <span className="text-[8px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full ml-1">You</span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400">{valueFor(e, category)}</p>
                  </div>
                </button>
              ))}

              {/* User's own rank — only visible to them, shown below top 10 if not already there */}
              {showMyRank && myEntry && (
                <>
                  <div className="flex items-center gap-2 px-1 py-1">
                    <div className="flex-1 border-t border-dashed border-slate-200" />
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider shrink-0">Your Rank</span>
                    <div className="flex-1 border-t border-dashed border-slate-200" />
                  </div>
                  <div className="w-full flex items-center gap-3 p-2.5 rounded-2xl border border-blue-100 bg-blue-50 text-left">
                    <div className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black bg-blue-500 text-white">
                      {myRank}
                    </div>
                    {myEntry.avatar ? (
                      <img src={myEntry.avatar} alt={myEntry.name} className="w-9 h-9 rounded-xl object-cover bg-slate-200 shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-slate-200 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-blue-900 truncate flex items-center gap-1">
                        {myEntry.name} {myEntry.isPro && <ProBadge size="xs" />}
                        <span className="text-[8px] font-black bg-blue-200 text-blue-700 px-1.5 py-0.5 rounded-full ml-1">You</span>
                      </p>
                      <p className="text-[10px] text-blue-500">{valueFor(myEntry, category)}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="w-full py-3 bg-slate-950 text-white font-bold rounded-xl text-xs tracking-wider uppercase">Close</button>
        </div>
      </div>
    </div>
  );
}
