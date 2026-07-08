import React, { useMemo } from "react";
import { Megaphone, ExternalLink } from "lucide-react";

interface AdSpec {
  badge: string;
  headline: string;
  body: string;
  cta: string;
  gradient: string;
  accent: string;
  url: string;
}

const TEST_ADS: AdSpec[] = [
  {
    badge: "VPN",
    headline: "Stay hidden. Stay fast.",
    body: "Military-grade encryption on all your devices — one tap to connect.",
    cta: "Try free for 30 days",
    gradient: "from-slate-900 to-indigo-900",
    accent: "bg-indigo-500",
    url: "https://example.com/ad-vpn",
  },
  {
    badge: "SECURITY",
    headline: "Your IP is exposed right now.",
    body: "Switch to a zero-log VPN trusted by 15 million users worldwide.",
    cta: "Get protected now",
    gradient: "from-red-900 to-slate-900",
    accent: "bg-red-500",
    url: "https://example.com/ad-security",
  },
  {
    badge: "PROMO",
    headline: "84% off — today only.",
    body: "Unlimited bandwidth. 90+ countries. Works on Android, iOS & PC.",
    cta: "Claim discount",
    gradient: "from-emerald-800 to-slate-900",
    accent: "bg-emerald-500",
    url: "https://example.com/ad-promo",
  },
  {
    badge: "NEW",
    headline: "WireGuard made simple.",
    body: "Paste a config. One tap. Connect. Share your own configs with friends.",
    cta: "Download the app",
    gradient: "from-violet-900 to-slate-900",
    accent: "bg-violet-500",
    url: "https://example.com/ad-wireguard",
  },
];

export default function InFeedAdCard() {
  const ad = useMemo(
    () => TEST_ADS[Math.floor(Math.random() * TEST_ADS.length)],
    []
  );

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
      <div className="px-4 pt-3 pb-0 flex items-center gap-1.5 bg-white">
        <Megaphone size={10} className="text-slate-400" />
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
          Sponsored
        </span>
      </div>
      <div
        className={`mx-0 bg-gradient-to-br ${ad.gradient} px-5 py-5 flex flex-col gap-3`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`${ad.accent} text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md`}
          >
            {ad.badge}
          </span>
        </div>
        <div>
          <h3 className="text-white font-extrabold text-base leading-tight tracking-tight">
            {ad.headline}
          </h3>
          <p className="text-slate-300 text-xs mt-1 leading-relaxed">{ad.body}</p>
        </div>
        <button
          type="button"
          onClick={() => window.open(ad.url, "_blank")}
          className="self-start flex items-center gap-1.5 bg-white text-slate-900 text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl shadow-md active:scale-95 transition-transform"
        >
          {ad.cta} <ExternalLink size={11} />
        </button>
      </div>
    </div>
  );
}
