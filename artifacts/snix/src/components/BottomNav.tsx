import React, { useState } from "react";
import { Home, PlusCircle, User, LogIn } from "lucide-react";

export type TabType = "feed" | "create" | "profile" | "user-detail";

interface BottomNavProps {
  activeTab: TabType;
  navigateToTab: (tab: TabType) => void;
  onProfileClick: () => void;
  isGuest: boolean;
  onSignInRequired: () => void;
  unreadCount?: number;
}

function GuestWall({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full bg-white rounded-t-3xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
            <LogIn size={26} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">Sign In Required</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-[240px] mx-auto">
              Create a free account to post configs, build your profile, and join the community.
            </p>
          </div>
          <button onClick={onSignIn}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-emerald-500 text-white font-bold rounded-xl text-xs tracking-wider uppercase shadow-md">
            Sign In / Create Profile
          </button>
          <button onClick={onClose} className="text-xs text-slate-400 font-medium py-1">Maybe later</button>
        </div>
      </div>
    </div>
  );
}

export default function BottomNav({ activeTab, navigateToTab, onProfileClick, isGuest, onSignInRequired, unreadCount = 0 }: BottomNavProps) {
  const [showGuestWall, setShowGuestWall] = useState(false);

  const handleProtectedTab = (tab: TabType) => {
    if (isGuest) { setShowGuestWall(true); return; }
    if (tab === "profile") { onProfileClick(); } else { navigateToTab(tab); }
  };

  const badge = unreadCount > 0 && !isGuest;

  return (
    <>
      {showGuestWall && <GuestWall onClose={() => setShowGuestWall(false)} onSignIn={() => { setShowGuestWall(false); onSignInRequired(); }} />}
      <div className="h-16 bg-white border-t border-slate-200 px-6 flex justify-around items-center z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] select-none">
        <button onClick={() => navigateToTab("feed")}
          className={`flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all duration-200 ${activeTab === "feed" ? "text-blue-600 scale-110" : "text-slate-400 hover:text-slate-600"}`}>
          <Home size={22} className="stroke-[2.2]" />
          <span className="text-[10px] font-semibold mt-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Feed</span>
        </button>
        <button onClick={() => handleProtectedTab("create")}
          className="flex flex-col items-center justify-center w-14 h-14 -translate-y-2 bg-gradient-to-tr from-blue-600 to-emerald-500 text-white rounded-full shadow-lg transition-all duration-300 hover:shadow-xl active:scale-95">
          <PlusCircle size={24} className="stroke-[2.5]" />
          <span className="text-[8px] font-bold mt-0.5 tracking-wider uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Post</span>
        </button>
        <button onClick={() => handleProtectedTab("profile")}
          className={`relative flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all duration-200 ${activeTab === "profile" ? "text-blue-600 scale-110" : "text-slate-400 hover:text-slate-600"}`}>
          <div className="relative">
            <User size={22} className="stroke-[2.2]" />
            {badge && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-60" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-600 items-center justify-center text-white text-[7px] font-black">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold mt-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Profile</span>
        </button>
      </div>
    </>
  );
}
