import React, { useRef, useState } from "react";

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

function openLink(raw: string) {
  const url = raw.startsWith("http") ? raw : `https://${raw}`;
  const Browser = (window as any).Capacitor?.Plugins?.Browser;
  if (Browser) {
    Browser.open({ url }).catch(() => window.open(url, "_blank"));
  } else {
    window.open(url, "_blank");
  }
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

  const startPress = () => {
    didLongPress.current = false;
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, 600);
  };

  const endPress = (e: React.TouchEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!didLongPress.current) {
      e.preventDefault();
      onTap();
    }
  };

  const cancelPress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <span
      className={`inline cursor-pointer underline underline-offset-1 transition-colors ${copied ? "text-emerald-500 no-underline" : "text-blue-500"}`}
      onClick={e => { e.stopPropagation(); onTap(); }}
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

  const handleCopy = (idx: number, url: string) => {
    const full = url.startsWith("http") ? url : `https://${url}`;
    copyToClip(full);
    setCopiedKey(idx);
    setTimeout(() => setCopiedKey(null), 1500);
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
        onTap={() => openLink(url)}
      />
    );
    lastIndex = idx + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.length > 0 ? parts : text}
    </span>
  );
}
