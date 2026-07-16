import React, { useState } from "react";
import { db, auth } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { X, Star, Lock, Palette, Keyboard, User, Zap, Shield } from "lucide-react";

interface PurchaseProModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const BENEFITS = [
  { icon: <User size={15} className="text-amber-500" />,    title: "Pro User Badge",         desc: "Gold ⭐ PRO stamp on your profile and every post you share" },
  { icon: <Palette size={15} className="text-violet-500" />, title: "Dark & Glass Themes",    desc: "Unlock 2 exclusive app themes — Dark mode and Glass" },
  { icon: <Keyboard size={15} className="text-blue-500" />,  title: "Compact Keyboard",       desc: "Smaller key height — more screen for your content" },
  { icon: <User size={15} className="text-emerald-500" />,   title: "4 Extra Avatar Styles",  desc: "Lorelei, Fun Emoji, Micah & Shapes unlocked for your avatar" },
  { icon: <Zap size={15} className="text-yellow-500" />,     title: "Pro Post Highlight",     desc: "Your posts get a golden border in the feed — stand out" },
  { icon: <Shield size={15} className="text-blue-600" />,    title: "Lifetime Access",        desc: "One-time purchase — no subscription, no renewals" },
];

/**
 * ⚠️  PAYMENT NOTE FOR DEVELOPERS
 * The "Purchase" button below directly writes isPro=true to Firestore.
 * For production, replace handlePurchase() with a real payment flow:
 *   • Google Play Billing (in-app purchases via Capacitor plugin)
 *   • RevenueCat (cross-platform subscriptions)
 *   • Stripe (web checkout, then webhook sets isPro in Firestore)
 * Do NOT ship with the Firestore-only flow in production.
 */
export default function PurchaseProModal({ onClose, onSuccess }: PurchaseProModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePurchase = async () => {
    const user = auth.currentUser;
    if (!user) { setError("You must be signed in to purchase."); return; }
    setLoading(true);
    setError("");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        isPro: true,
        proSince: Date.now(),
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError("Purchase failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full rounded-t-3xl flex flex-col overflow-hidden" style={{ backgroundColor: "#0D1520", borderTop: "2px solid #00D4FF", boxShadow: "0 -8px 40px rgba(0,212,255,0.12)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-slate-200 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>
              <Star size={18} className="text-white" fill="white" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>
                Upgrade to Pro
              </h2>
              <p className="text-[10px] text-slate-400">One-time purchase · Lifetime access</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">
            <X size={18} />
          </button>
        </div>

        {/* Benefits list */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {BENEFITS.map((b, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-8 h-8 bg-white rounded-xl border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
                {b.icon}
              </div>
              <div>
                <p className="text-xs font-black text-slate-900">{b.title}</p>
                <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="px-5 pt-3 pb-6 border-t border-slate-100 space-y-3">
          {error && (
            <p className="text-[10px] text-red-500 font-medium text-center">{error}</p>
          )}
          <button
            onClick={handlePurchase}
            disabled={loading}
            className="w-full py-4 rounded-2xl text-white font-black text-sm tracking-wider uppercase shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}
          >
            {loading
              ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              : <><Star size={16} fill="white" /> Purchase Pro</>}
          </button>
          <p className="text-[9px] text-slate-400 text-center leading-relaxed">
            By purchasing you agree to the SNIX terms. Contact mkdev4360@gmail.com for support.
          </p>
        </div>
      </div>
    </div>
  );
}
