import React, { useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

async function copyToClip(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text); return;
    }
  } catch {}
  const Clipboard = (window as any).Capacitor?.Plugins?.Clipboard;
  if (Clipboard) { try { await Clipboard.write({ string: text }); return; } catch {} }
  const el = document.createElement("textarea");
  el.value = text; el.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
  document.body.appendChild(el); el.focus(); el.select();
  try { document.execCommand("copy"); } catch {}
  document.body.removeChild(el);
}

function doOpenLink(raw: string) {
  const url = raw.startsWith("http") ? raw : `https://${raw}`;
  const Browser = (window as any).Capacitor?.Plugins?.Browser;
  if (Browser) {
    Browser.open({ url }).catch(() => window.open(url, "_blank"));
  } else {
    window.open(url, "_blank");
  }
}

/** Compact confirmation sheet shown before opening a link in the browser. */
function LinkConfirmSheet({ url, onConfirm, onCancel }: { url: string; onConfirm: () => void; onCancel: () => void }) {
  const display = url.length > 50 ? url.slice(0, 47) + "…" : url;
  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full bg-white rounded-t-3xl p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-1 mb-4">
          <div className="w-10 h-1 bg-slate-200 rounded-full mb-2" />
          <div className="w-11 h-11 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center mb-1">
            <ExternalLink size={20} className="text-blue-600" />
          </div>
          <h3 className="text-sm font-black text-slate-900">Open in browser?</h3>
          <p className="text-[11px] text-slate-400 font-mono break-all text-center max-w-[280px] mt-0.5">{display}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 active:bg-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 bg-blue-600 rounded-xl text-sm font-bold text-white active:bg-blue-700 flex items-center justify-center gap-1.5"
          >
            <ExternalLink size={14} /> Open
          </button>
        </div>
      </div>
    </div>
  );
}

interface LinkChipProps {
  url: string;
  copied: boolean;
  onLongPress: () => void;
  onTap: () => void;
}

function LinkChip({ url, copied, onLongPress, onTap }: LinkChipProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const touchHandled = useRef(false);

  const startPress = () => {
    didLongPress.current = false;
    touchHandled.current = false;
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, 600);
  };

  const endPress = (e: React.TouchEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    e.preventDefault();
    if (!didLongPress.current) {
      touchHandled.current = true;
      onTap();
      setTimeout(() => { touchHandled.current = false; }, 500);
    }
  };

  const cancelPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    touchHandled.current = false;
  };

  return (
    <span
      className={`inline cursor-pointer underline underline-offset-1 transition-colors select-none ${copied ? "text-emerald-500 no-underline" : "text-blue-500"}`}
      onPointerUp={e => {
        if (e.pointerType === 'touch') return;
        e.stopPropagation();
        onTap();
      }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onLongPress(); }}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchCancel={cancelPress}
    >
      {copied ? "✓ Copied!" : url}
    </span>
  );
}

interface LinkTextProps {
  text: string;
  className?: string;
}

export default function LinkText({ text, className = "" }: LinkTextProps) {
  const [copiedKey, setCopiedKey] = useState<number | null>(null);
  const [confirmUrl, setConfirmUrl] = useState<string | null>(null);

  const handleCopy = (idx: number, url: string) => {
    const full = url.startsWith("http") ? url : `https://${url}`;
    copyToClip(full);
    setCopiedKey(idx);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleTap = (url: string) => {
    const full = url.startsWith("http") ? url : `https://${url}`;
    setConfirmUrl(full);
  };

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const re = new RegExp(URL_RE.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[0];
    const idx = match.index;
    parts.push(
      <LinkChip
        key={idx}
        url={url}
        copied={copiedKey === idx}
        onLongPress={() => handleCopy(idx, url)}
        onTap={() => handleTap(url)}
      />
    );
    lastIndex = idx + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <>
      {confirmUrl && (
        <LinkConfirmSheet
          url={confirmUrl}
          onConfirm={() => { doOpenLink(confirmUrl); setConfirmUrl(null); }}
          onCancel={() => setConfirmUrl(null)}
        />
      )}
      <span className={`whitespace-pre-wrap break-words ${className}`}>
        {parts.length > 0 ? parts : text}
      </span>
    </>
  );
}
