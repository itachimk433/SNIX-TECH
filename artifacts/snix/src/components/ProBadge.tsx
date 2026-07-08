import React from "react";
import { Star } from "lucide-react";

/** Gold "PRO" stamp — two sizes.
 *  size="sm"  → used on profile cards (just a star icon, no text)
 *  size="xs"  → used inline next to author name in feed cards
 */
export function ProBadge({ size = "sm" }: { size?: "sm" | "xs" }) {
  if (size === "xs") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black tracking-widest uppercase"
        style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)", color: "#fff", letterSpacing: "0.08em" }}>
        PRO
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full shadow-sm shrink-0"
      style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}
      title="Pro User"
    >
      <Star size={11} className="text-white" fill="white" strokeWidth={0} />
    </span>
  );
}
