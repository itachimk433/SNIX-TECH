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

const BX = {
  bg:      "#0D1520",
  border:  "#1E3A5F",
  cyan:    "#00D4FF",
  text:    "#E8F4F8",
  muted:   "#3A5A78",
  surface: "#111B2A",
};

function GuestWall({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: "rgba(4,7,9,0.7)" }} />
      <div
        className="relative w-full p-6"
        style={{
          backgroundColor: BX.bg,
          borderTop: `2px solid ${BX.cyan}`,
          borderRadius: "24px 24px 0 0",
          boxShadow: `0 -8px 40px rgba(0,212,255,0.12), 0 -4px 20px rgba(0,0,0,0.5)`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: BX.border }} />
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: BX.surface, border: `1px solid ${BX.border}` }}
          >
            <LogIn size={26} style={{ color: BX.cyan }} />
          </div>
          <div>
            <h3
              className="text-lg font-black"
              style={{ color: BX.text, fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Sign In Required
            </h3>
            <p className="text-xs mt-1 leading-relaxed max-w-[240px] mx-auto" style={{ color: BX.muted }}>
              Create a free account to post configs, build your profile, and join the community.
            </p>
          </div>
          <button
            onClick={onSignIn}
            className="w-full py-3 font-bold rounded-xl text-xs tracking-wider uppercase"
            style={{
              background: `linear-gradient(90deg, #00A8CC, #00D4FF)`,
              color: "#040709",
              boxShadow: "0 0 20px rgba(0,212,255,0.25)",
            }}
          >
            Sign In / Create Profile
          </button>
          <button onClick={onClose} className="text-xs font-medium py-1" style={{ color: BX.muted }}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BottomNav({
  activeTab, navigateToTab, onProfileClick, isGuest, onSignInRequired, unreadCount = 0,
}: BottomNavProps) {
  const [showGuestWall, setShowGuestWall] = useState(false);

  const handleProtectedTab = (tab: TabType) => {
    if (isGuest) { setShowGuestWall(true); return; }
    if (tab === "profile") { onProfileClick(); } else { navigateToTab(tab); }
  };

  const badge = unreadCount > 0 && !isGuest;

  return (
    <>
      {showGuestWall && (
        <GuestWall
          onClose={() => setShowGuestWall(false)}
          onSignIn={() => { setShowGuestWall(false); onSignInRequired(); }}
        />
      )}
      <div
        className="h-16 px-6 flex justify-around items-center z-40 select-none"
        style={{
          backgroundColor: BX.bg,
          borderTop: `1px solid ${BX.border}`,
          boxShadow: `0 -4px 20px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Feed */}
        <button
          onClick={() => navigateToTab("feed")}
          className="flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all duration-200"
          style={{ color: activeTab === "feed" ? BX.cyan : BX.muted, filter: activeTab === "feed" ? "drop-shadow(0 0 6px rgba(0,212,255,0.7))" : "none" }}
        >
          <Home size={22} className="stroke-[2.2]" />
          <span className="text-[10px] font-semibold mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Feed</span>
        </button>

        {/* Create */}
        <button
          onClick={() => handleProtectedTab("create")}
          className="flex flex-col items-center justify-center w-14 h-14 -translate-y-2 rounded-full transition-all duration-300 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #00A8CC, #00D4FF)",
            color: "#040709",
            boxShadow: "0 0 24px rgba(0,212,255,0.35), 0 8px 20px rgba(0,0,0,0.4)",
          }}
        >
          <PlusCircle size={24} className="stroke-[2.5]" />
          <span className="text-[8px] font-bold mt-0.5 tracking-wider uppercase" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Post</span>
        </button>

        {/* Profile */}
        <button
          onClick={() => handleProtectedTab("profile")}
          className="relative flex flex-col items-center justify-center w-12 h-12 rounded-full transition-all duration-200"
          style={{ color: activeTab === "profile" ? BX.cyan : BX.muted, filter: activeTab === "profile" ? "drop-shadow(0 0 6px rgba(0,212,255,0.7))" : "none" }}
        >
          <div className="relative">
            <User size={22} className="stroke-[2.2]" />
            {badge && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: BX.cyan }} />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 items-center justify-center text-white text-[7px] font-black" style={{ backgroundColor: BX.cyan, color: "#040709" }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Profile</span>
        </button>
      </div>
    </>
  );
}
