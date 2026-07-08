import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Delete, CornerDownLeft, ChevronUp, ChevronsUp, Hash, Clipboard, Copy, Check,
  ChevronLeft, ChevronRight, ArrowUp, ArrowDown, X, History as HistoryIcon,
} from "lucide-react";
import { Clipboard as CapClipboard } from "@capacitor/clipboard";
import type { KBTheme, KBHeight } from "../context/KeyboardContext";

// ── Capacitor clipboard helpers ───────────────────────────────────────────────
async function capWrite(text: string): Promise<void> {
  try { await CapClipboard.write({ string: text }); return; } catch {}
  await navigator.clipboard.writeText(text);
}
async function capRead(): Promise<string> {
  try { const r = await CapClipboard.read(); return r.value ?? ""; } catch {}
  return await navigator.clipboard.readText();
}

// ── Clipboard history (localStorage, 2-hour TTL) ──────────────────────────────
interface ClipEntry { text: string; copiedAt: number; }
const HIST_KEY  = "snix_clip_history";
const TWO_HOURS = 2 * 60 * 60 * 1000;

function loadHistory(): ClipEntry[] {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    if (!raw) return [];
    const now = Date.now();
    return (JSON.parse(raw) as ClipEntry[]).filter(e => now - e.copiedAt < TWO_HOURS);
  } catch { return []; }
}
function saveHistory(entries: ClipEntry[]): void {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(entries)); } catch {}
}
function addToHistory(text: string): void {
  const entries = loadHistory();
  saveHistory([{ text, copiedAt: Date.now() }, ...entries.filter(e => e.text !== text)].slice(0, 20));
}

// ── Personal word frequency (learns from what the user types) ─────────────────
const WORD_FREQ_KEY = "snix_word_freq";
const MAX_PERSONAL_WORDS = 200;

function loadWordFreq(): Record<string, number> {
  try { const raw = localStorage.getItem(WORD_FREQ_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function saveWordFreq(freq: Record<string, number>): void {
  try { localStorage.setItem(WORD_FREQ_KEY, JSON.stringify(freq)); } catch {}
}
function learnWords(text: string): void {
  if (!text || text.length < 3) return;
  const freq = loadWordFreq();
  const words = text.toLowerCase().match(/[a-z]{3,}/g) || [];
  for (const w of words) { freq[w] = (freq[w] || 0) + 1; }
  // Keep only top MAX_PERSONAL_WORDS by frequency
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, MAX_PERSONAL_WORDS);
  saveWordFreq(Object.fromEntries(sorted));
}

// ── Common English words for suggestions ─────────────────────────────────────
const COMMON_WORDS = [
  "the","be","to","of","and","a","in","that","have","it","for","not","on","with","he","as",
  "you","do","at","this","but","his","by","from","they","we","say","her","she","or","an","will",
  "my","one","all","would","there","their","what","so","up","out","if","about","who","get","which",
  "go","me","when","make","can","like","time","no","just","him","know","take","people","into","year",
  "your","good","some","could","them","see","other","than","then","now","look","only","come","its",
  "over","think","also","back","after","use","two","how","our","work","first","well","way","even",
  "new","want","because","any","these","give","day","most","us","between","need","large","often",
  "hand","high","place","hold","turn","here","why","ask","went","men","read","need","land","home",
  "point","play","small","number","off","always","move","live","late","able","used","please","please",
  "hello","thanks","okay","sure","yes","actually","really","send","share","download","config","vpn",
  "server","connect","connection","network","app","android","settings","password","username","file",
  "copy","paste","save","open","close","next","back","done","help","free","name","link","update",
  "version","test","status","active","expire","country","available","please","using","sorry",
  "working","works","found","check","try","error","issue","fix","add","remove","delete","set",
  "get","post","key","code","text","data","info","type","mode","auto","manual","speed","fast",
  "slow","port","host","address","protocol","secure","public","private","proxy","tunnel",
];

function getSuggestions(value: string, cursorPos: number, personalFreq: Record<string, number>): string[] {
  // Get the current word (from start of word to cursor)
  const beforeCursor = value.slice(0, cursorPos);
  const match = beforeCursor.match(/[a-zA-Z]+$/);
  if (!match || match[0].length < 1) return [];
  const prefix = match[0].toLowerCase();
  if (prefix.length < 1) return [];

  // Score: personal freq words first, then common words
  const seen = new Set<string>();
  const results: Array<[string, number]> = [];

  // Personal words with frequency score
  for (const [word, freq] of Object.entries(personalFreq)) {
    if (word.startsWith(prefix) && word !== prefix) {
      results.push([word, freq + 1000]); // boost personal words
      seen.add(word);
    }
  }

  // Common words
  for (const word of COMMON_WORDS) {
    if (word.startsWith(prefix) && !seen.has(word) && word !== prefix) {
      results.push([word, 0]);
      seen.add(word);
    }
  }

  return results
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => {
      // Preserve capitalisation of original prefix
      if (match[0][0] === match[0][0].toUpperCase()) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
      return w;
    });
}

// ── Haptic feedback ───────────────────────────────────────────────────────────
function vibrate(_ms = 30): void {
  try {
    (import("@capacitor/haptics") as any).then(({ Haptics, ImpactStyle }: any) => {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }).catch(() => { try { navigator.vibrate?.(_ms); } catch {} });
  } catch {
    try { navigator.vibrate?.(_ms); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────

interface VirtualKeyboardProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  maxLength?: number;
  submitting?: boolean;
  replyBanner?: React.ReactNode;
  isPassword?: boolean;
  isMultiline?: boolean;
  theme?: KBTheme;
  height?: KBHeight;
  sessionKey?: number;
}

const QWERTY_ROWS = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["SHIFT","z","x","c","v","b","n","m","BACK"],
];

const NUM_ROWS = [
  ["1","2","3","4","5","6","7","8","9","0"],
  ["-","/",":",";","(",")","%","@","\"","'"],
  ["ABC",".",",","?","!","_","~","BACK"],
];

type ThemeConf = {
  bg: string; keyBg: string; specialBg: string; capsBg: string;
  sendBg: string; text: string; spText: string; displayBg: string; displayText: string;
  placeholder: string; border: string; hintText: string; toolbarBg: string; toolbarBtn: string;
  histCardBg: string; histCardText: string;
  suggBg: string; suggBorder: string; suggText: string; suggActiveBg: string;
};

const THEMES: Record<KBTheme, ThemeConf> = {
  light: {
    bg: "bg-slate-100 border-t border-slate-200",
    keyBg: "bg-white border border-slate-200",
    specialBg: "bg-slate-300 border border-slate-300",
    capsBg: "bg-blue-600 border border-blue-600",
    sendBg: "bg-gradient-to-tr from-blue-600 to-emerald-500",
    text: "text-slate-800", spText: "text-slate-600",
    displayBg: "bg-white border-2 border-blue-400",
    displayText: "text-slate-800",
    placeholder: "text-slate-400", border: "border-slate-200",
    hintText: "text-slate-400",
    toolbarBg: "bg-slate-200/70",
    toolbarBtn: "bg-white border border-slate-200 text-slate-600 active:bg-slate-100",
    histCardBg: "bg-white border border-slate-200",
    histCardText: "text-slate-700",
    suggBg: "bg-white", suggBorder: "border-slate-200", suggText: "text-slate-700",
    suggActiveBg: "bg-blue-50 border-blue-300 text-blue-700",
  },
  dark: {
    bg: "bg-slate-800 border-t border-slate-700",
    keyBg: "bg-slate-700 border border-slate-600",
    specialBg: "bg-slate-600 border border-slate-500",
    capsBg: "bg-blue-500 border border-blue-500",
    sendBg: "bg-gradient-to-tr from-blue-500 to-emerald-400",
    text: "text-slate-100", spText: "text-slate-300",
    displayBg: "bg-slate-700 border-2 border-blue-400",
    displayText: "text-slate-100",
    placeholder: "text-slate-500", border: "border-slate-600",
    hintText: "text-slate-500",
    toolbarBg: "bg-slate-700/60",
    toolbarBtn: "bg-slate-600 border border-slate-500 text-slate-300 active:bg-slate-500",
    histCardBg: "bg-slate-700 border border-slate-600",
    histCardText: "text-slate-200",
    suggBg: "bg-slate-700", suggBorder: "border-slate-600", suggText: "text-slate-200",
    suggActiveBg: "bg-blue-900 border-blue-600 text-blue-200",
  },
  blue: {
    bg: "bg-blue-950 border-t border-blue-900",
    keyBg: "bg-blue-800 border border-blue-700",
    specialBg: "bg-blue-700 border border-blue-600",
    capsBg: "bg-sky-500 border border-sky-500",
    sendBg: "bg-gradient-to-tr from-sky-500 to-emerald-400",
    text: "text-blue-50", spText: "text-blue-200",
    displayBg: "bg-blue-900 border-2 border-sky-400",
    displayText: "text-blue-50",
    placeholder: "text-blue-400", border: "border-blue-700",
    hintText: "text-blue-400",
    toolbarBg: "bg-blue-900/60",
    toolbarBtn: "bg-blue-800 border border-blue-700 text-blue-200 active:bg-blue-700",
    histCardBg: "bg-blue-900 border border-blue-700",
    histCardText: "text-blue-100",
    suggBg: "bg-blue-900", suggBorder: "border-blue-700", suggText: "text-blue-100",
    suggActiveBg: "bg-sky-900 border-sky-600 text-sky-200",
  },
  neon: {
    bg: "bg-purple-950 border-t border-purple-800",
    keyBg: "bg-purple-900 border border-purple-700",
    specialBg: "bg-purple-800 border border-purple-700",
    capsBg: "bg-violet-500 border border-violet-400",
    sendBg: "bg-gradient-to-tr from-violet-600 to-fuchsia-500",
    text: "text-purple-50", spText: "text-purple-200",
    displayBg: "bg-purple-900 border-2 border-violet-400",
    displayText: "text-purple-50",
    placeholder: "text-purple-400", border: "border-purple-700",
    hintText: "text-purple-400",
    toolbarBg: "bg-purple-900/60",
    toolbarBtn: "bg-purple-800 border border-purple-700 text-purple-200 active:bg-purple-700",
    histCardBg: "bg-purple-900 border border-purple-700",
    histCardText: "text-purple-100",
    suggBg: "bg-purple-900", suggBorder: "border-purple-700", suggText: "text-purple-100",
    suggActiveBg: "bg-violet-900 border-violet-600 text-violet-200",
  },
};

const HEIGHT_KEY: Record<KBHeight, string>  = { compact: "h-8",  normal: "h-10", tall: "h-12" };
const HEIGHT_TXT: Record<KBHeight, string>  = { compact: "text-[11px]", normal: "text-[13px]", tall: "text-[15px]" };
const HEIGHT_ICON: Record<KBHeight, number> = { compact: 11, normal: 14, tall: 17 };

export default function VirtualKeyboard({
  value, onChange, onSubmit,
  placeholder = "Write a comment...",
  maxLength = 500, submitting = false,
  replyBanner, isPassword = false, isMultiline = false,
  theme = "light", height = "normal",
  sessionKey = 0,
}: VirtualKeyboardProps) {
  const [caps, setCaps] = useState(false);
  // capsLock = sticky shift (stays uppercase until toggled off)
  const [capsLock, setCapsLock] = useState(false);
  const [numMode, setNumMode] = useState(false);
  const [cursorPos, setCursorPos] = useState(value.length);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [pasteState, setPasteState] = useState<"idle" | "pasted" | "failed">("idle");
  const [selected, setSelected] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<ClipEntry[]>([]);

  const [showPasteMenu, setShowPasteMenu] = useState(false);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTargetRef = useRef<HTMLElement | null>(null);

  // Caps Lock: hold SHIFT 400 ms, or double-tap SHIFT within 300 ms
  const shiftHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShiftTapRef   = useRef<number>(0);

  // Word suggestions
  const [personalFreq, setPersonalFreq] = useState<Record<string, number>>(() => loadWordFreq());

  const valueRef = useRef(value);
  valueRef.current = value;
  const cursorPosRef = useRef(cursorPos);
  cursorPosRef.current = cursorPos;

  const backDelayRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const backRepeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const t  = THEMES[theme];
  const kh = HEIGHT_KEY[height];
  const kt = HEIGHT_TXT[height];
  const ki = HEIGHT_ICON[height];

  // Compute suggestions (skip in password mode or number mode)
  const suggestions = useMemo(() => {
    if (isPassword || numMode || showHistory) return [];
    return getSuggestions(value, cursorPos, personalFreq);
  }, [value, cursorPos, isPassword, numMode, showHistory, personalFreq]);

  useEffect(() => {
    setCursorPos(value.length);
    setCaps(false);
    setCapsLock(false);
    setNumMode(false);
    setShowHistory(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  useEffect(() => () => {
    if (backDelayRef.current)    clearTimeout(backDelayRef.current);
    if (backRepeatRef.current)   clearInterval(backRepeatRef.current);
    if (longPressRef.current)    clearTimeout(longPressRef.current);
    if (shiftHoldTimerRef.current) clearTimeout(shiftHoldTimerRef.current);
  }, []);

  // ── Backspace ──────────────────────────────────────────────────────────────
  const doBackspace = () => {
    const v   = valueRef.current;
    const pos = isPassword ? v.length : cursorPosRef.current;
    if (pos === 0) return;
    const next = v.slice(0, pos - 1) + v.slice(pos);
    onChange(next);
    setCursorPos(isPassword ? next.length : Math.max(0, pos - 1));
  };

  const startBackHold = () => {
    doBackspace();
    backDelayRef.current = setTimeout(() => {
      backRepeatRef.current = setInterval(doBackspace, 80);
    }, 400);
  };

  const stopBackHold = () => {
    if (backDelayRef.current)  { clearTimeout(backDelayRef.current);   backDelayRef.current  = null; }
    if (backRepeatRef.current) { clearInterval(backRepeatRef.current); backRepeatRef.current = null; }
  };

  // ── Insert newline (multiline mode) ───────────────────────────────────────
  const insertNewline = () => {
    const v   = valueRef.current;
    const pos = cursorPosRef.current;
    if (v.length >= maxLength) return;
    const next = v.slice(0, pos) + "\n" + v.slice(pos);
    onChange(next);
    setCursorPos(pos + 1);
  };

  // ── Apply a word suggestion ────────────────────────────────────────────────
  const applySuggestion = (word: string) => {
    vibrate(30);
    const v   = valueRef.current;
    const pos = cursorPosRef.current;
    // Find start of current word (letters before cursor)
    const before = v.slice(0, pos);
    const wordMatch = before.match(/[a-zA-Z]+$/);
    if (!wordMatch) return;
    const wordStart = pos - wordMatch[0].length;
    // Find end of current word (letters after cursor, if any)
    const after = v.slice(pos);
    const suffixMatch = after.match(/^[a-zA-Z]*/);
    const wordEnd = pos + (suffixMatch ? suffixMatch[0].length : 0);
    // Replace the full current word (prefix + suffix) with the suggestion + space
    const next = v.slice(0, wordStart) + word + " " + v.slice(wordEnd);
    const newCursor = wordStart + word.length + 1;
    onChange(next);
    setCursorPos(newCursor);
    // Learn this word
    learnWords(word);
    setPersonalFreq(loadWordFreq());
  };

  // ── Key press ──────────────────────────────────────────────────────────────
  const press = (key: string) => {
    setShowPasteMenu(false);
    const v   = valueRef.current;
    const pos = cursorPosRef.current;

    // SHIFT is handled directly in the Key component (hold/double-tap)
    if (key === "SHIFT") { return; }
    if (key === "ABC")   { setNumMode(false); return; }
    if (key === "123")   { setNumMode(true);  return; }
    if (key === "BACK")  { doBackspace(); return; }
    if (key === "ENTER") {
      if (isMultiline) { insertNewline(); }
      else             { onSubmit(); }
      return;
    }

    // capsLock stays on regardless; normal caps auto-off after one letter
    const upperCase = (caps || capsLock) && !numMode;
    const ch = key === "SPACE" ? " " : (upperCase ? key.toUpperCase() : key);
    if (v.length >= maxLength) return;
    const insertAt = isPassword ? v.length : pos;
    const next = v.slice(0, insertAt) + ch + v.slice(insertAt);
    onChange(next);
    setCursorPos(isPassword ? next.length : pos + 1);
    // Auto-off only for normal (non-lock) caps
    if (caps && !capsLock && !numMode && key !== "SPACE") setCaps(false);

    // Learn on space after a word
    if (key === "SPACE") {
      const wordBefore = v.slice(0, pos).match(/[a-zA-Z]{3,}$/)?.[0];
      if (wordBefore) {
        learnWords(wordBefore);
        setPersonalFreq(loadWordFreq());
      }
    }
  };

  // ── Select All ─────────────────────────────────────────────────────────────
  const handleSelectAll = () => {
    if (!valueRef.current) return;
    setSelected(true);
  };

  const handleKeyWithSelect = (key: string) => {
    vibrate(30);
    setShowPasteMenu(false);
    if (selected) {
      setSelected(false);
      if (key === "BACK" || key === "SHIFT" || key === "ABC" || key === "123") {
        if (key === "BACK") { onChange(""); setCursorPos(0); return; }
        press(key);
        return;
      }
      if (key === "ENTER") {
        if (isMultiline) { onChange("\n"); setCursorPos(1); }
        else             { onSubmit(); }
        return;
      }
      const upperCase = (caps || capsLock) && !numMode;
      const ch = key === "SPACE" ? " " : (upperCase ? key.toUpperCase() : key);
      onChange(ch);
      setCursorPos(ch.length);
      if (caps && !capsLock && !numMode && key !== "SPACE") setCaps(false);
      return;
    }
    press(key);
  };

  // ── Clipboard ──────────────────────────────────────────────────────────────
  const doPaste = async (text: string) => {
    setShowPasteMenu(false);
    if (!text) return;
    if (selected) {
      setSelected(false);
      const ins = text.slice(0, maxLength);
      onChange(ins);
      setCursorPos(ins.length);
      setPasteState("pasted");
      setTimeout(() => setPasteState("idle"), 1200);
      return;
    }
    const v   = valueRef.current;
    const pos = cursorPosRef.current;
    const ins = text.slice(0, maxLength - v.length);
    if (!ins) return;
    onChange(v.slice(0, pos) + ins + v.slice(pos));
    setCursorPos(pos + ins.length);
    setPasteState("pasted");
    setTimeout(() => setPasteState("idle"), 1200);
  };

  const handlePaste = async () => {
    try { await doPaste(await capRead()); }
    catch { setPasteState("failed"); setTimeout(() => setPasteState("idle"), 1200); }
  };

  const handleCopy = async () => {
    const text = valueRef.current;
    if (!text) return;
    try {
      await capWrite(text);
      addToHistory(text);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("failed");
      setTimeout(() => setCopyState("idle"), 1200);
    }
  };

  // ── Cursor movement ────────────────────────────────────────────────────────
  const moveCursor = (dir: -1 | 1) => {
    setSelected(false);
    setCursorPos(p => Math.max(0, Math.min(valueRef.current.length, p + dir)));
  };

  const moveCursorVertical = (dir: -1 | 1) => {
    setSelected(false);
    const v   = valueRef.current;
    const pos = cursorPosRef.current;

    const lineStart = v.lastIndexOf("\n", pos - 1) + 1;
    const col = pos - lineStart;

    if (dir === -1) {
      if (lineStart === 0) return;
      const prevLineEnd   = lineStart - 1;
      const prevLineStart = v.lastIndexOf("\n", prevLineEnd - 1) + 1;
      const prevLineLen   = prevLineEnd - prevLineStart;
      setCursorPos(prevLineStart + Math.min(col, prevLineLen));
    } else {
      const nextNewline = v.indexOf("\n", pos);
      if (nextNewline === -1) return;
      const nextLineStart = nextNewline + 1;
      const nextNewline2  = v.indexOf("\n", nextLineStart);
      const nextLineLen   = (nextNewline2 === -1 ? v.length : nextNewline2) - nextLineStart;
      setCursorPos(nextLineStart + Math.min(col, nextLineLen));
    }
  };

  // ── Display area: quick tap → cursor, 500ms hold → paste popup ────────────
  const handleDisplayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setShowPasteMenu(false);
    tapTargetRef.current = e.target as HTMLElement;
    longPressRef.current = setTimeout(async () => {
      longPressRef.current = null;
      try { const text = await capRead(); if (text) setShowPasteMenu(true); } catch {}
    }, 500);
  };

  const handleDisplayPointerUp = () => {
    if (!longPressRef.current) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = null;
    setSelected(false);
    if (isPassword) return;
    const target = tapTargetRef.current;
    if (!target) return;
    const ci = target.getAttribute("data-ci");
    setCursorPos(ci !== null ? parseInt(ci, 10) : valueRef.current.length);
  };

  const handleDisplayPointerCancel = () => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    setShowPasteMenu(false);
  };

  // ── History helpers ────────────────────────────────────────────────────────
  const openHistory = () => { setHistoryEntries(loadHistory()); setShowHistory(true); };
  const deleteHistoryEntry = (idx: number) => {
    const next = historyEntries.filter((_, i) => i !== idx);
    setHistoryEntries(next);
    saveHistory(next);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const rows = numMode ? NUM_ROWS : QWERTY_ROWS;
  const beforeCursor = isPassword ? "•".repeat(cursorPos) : value.slice(0, cursorPos);
  const afterCursor  = isPassword ? "•".repeat(value.length - cursorPos) : value.slice(cursorPos);

  const TBtn = ({
    onTap, children, className = "", title = "",
  }: { onTap: () => void; children: React.ReactNode; className?: string; title?: string }) => (
    <button
      type="button"
      title={title}
      onPointerDown={e => { e.preventDefault(); onTap(); }}
      className={`flex items-center justify-center px-2 py-1 rounded-lg select-none active:scale-95 transition-transform ${t.toolbarBtn} ${className}`}
    >
      {children}
    </button>
  );

  const Key = ({ k }: { k: string }) => {
    const isBack    = k === "BACK";
    const isSpecial = ["SHIFT","BACK","ABC"].includes(k);
    const isSend    = k === "ENTER";
    const isSpace   = k === "SPACE";
    const isShift   = k === "SHIFT";

    const baseCls  = `flex items-center justify-center rounded-xl select-none transition-transform duration-75 ${kh}`;
    const widthCls = isSpecial ? "w-10" : isSpace ? "flex-1 mx-1" : isSend ? "w-10" : "flex-1";

    let bgCls = "";
    if (isShift && capsLock) bgCls = "bg-amber-500 border border-amber-400 text-white";
    else if (isShift && caps) bgCls = t.capsBg + " text-white";
    else if (isSpecial) bgCls = t.specialBg + " " + t.spText;
    else if (isSend)    bgCls = t.sendBg + " text-white";
    else if (isSpace)   bgCls = t.keyBg + " " + t.spText;
    else                bgCls = t.keyBg + " " + t.text;

    const isUppercase = (caps || capsLock) && !numMode;

    const label = () => {
      if (isShift) {
        if (capsLock) return (
          <span className="flex flex-col items-center gap-0">
            <ChevronsUp size={ki} className="text-white" />
          </span>
        );
        return <ChevronUp size={ki} className={caps ? "text-white" : ""} />;
      }
      if (k === "BACK")  return <Delete size={ki} />;
      if (k === "SPACE") return <span className={`${kt} font-medium`}>space</span>;
      if (k === "ENTER") return <CornerDownLeft size={ki} />;
      if (k === "ABC")   return <span className={`${kt} font-bold`}>ABC</span>;
      if (k === "123")   return <Hash size={Math.max(ki - 3, 9)} />;
      return <span className={`${kt} font-semibold leading-none ${isUppercase ? "uppercase" : "lowercase"}`}>{k}</span>;
    };

    // ── BACK key: hold to repeat ───────────────────────────────────────────
    if (isBack) {
      return (
        <button
          type="button"
          onPointerDown={e => {
            e.preventDefault();
            vibrate(30);
            if (selected) { setSelected(false); onChange(""); setCursorPos(0); return; }
            startBackHold();
          }}
          onPointerUp={stopBackHold}
          onPointerLeave={stopBackHold}
          onPointerCancel={stopBackHold}
          className={`${baseCls} ${widthCls} ${bgCls} active:scale-90`}
        >
          {label()}
        </button>
      );
    }

    // ── SHIFT key: hold → caps lock, double-tap → caps lock ───────────────
    if (isShift) {
      return (
        <button
          type="button"
          className={`${baseCls} w-10 ${bgCls} active:scale-90`}
          onPointerDown={e => {
            e.preventDefault();
            vibrate(30);
            // Start hold timer — fires if finger stays down ≥ 400 ms
            shiftHoldTimerRef.current = setTimeout(() => {
              shiftHoldTimerRef.current = null;
              setCapsLock(true);
              setCaps(false);
              vibrate(60);
            }, 400);
          }}
          onPointerUp={() => {
            if (!shiftHoldTimerRef.current) return; // hold already fired
            clearTimeout(shiftHoldTimerRef.current);
            shiftHoldTimerRef.current = null;

            const now = Date.now();
            const timeSinceLast = now - lastShiftTapRef.current;
            lastShiftTapRef.current = now;

            if (capsLock) {
              // Turn caps lock off
              setCapsLock(false);
              setCaps(false);
            } else if (timeSinceLast < 300) {
              // Double-tap → caps lock
              setCapsLock(true);
              setCaps(false);
              vibrate(60);
            } else {
              // Single tap → toggle normal caps
              setCaps(c => !c);
            }
          }}
          onPointerLeave={() => {
            if (shiftHoldTimerRef.current) { clearTimeout(shiftHoldTimerRef.current); shiftHoldTimerRef.current = null; }
          }}
          onPointerCancel={() => {
            if (shiftHoldTimerRef.current) { clearTimeout(shiftHoldTimerRef.current); shiftHoldTimerRef.current = null; }
          }}
        >
          {label()}
        </button>
      );
    }

    return (
      <button
        type="button"
        onPointerDown={e => { e.preventDefault(); handleKeyWithSelect(k); }}
        className={`${baseCls} ${widthCls} ${bgCls} active:scale-90`}
        style={isSpace ? { minWidth: 0 } : {}}
        disabled={isSend && (submitting || !value.trim())}
      >
        {isSend && submitting
          ? <span className="animate-spin rounded-full border-2 border-white border-t-transparent" style={{ width: ki, height: ki }} />
          : label()
        }
      </button>
    );
  };

  return (
    <div className={`w-full select-none ${t.bg}`}>
      {replyBanner && <div className="px-3 pt-2">{replyBanner}</div>}

      {/* ── Text display ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <div className="flex-1 relative">
          {showPasteMenu && (
            <div className="absolute left-1/2 -translate-x-1/2 -top-9 z-20 flex items-center bg-slate-800 rounded-xl shadow-xl overflow-hidden border border-slate-700">
              <button
                type="button"
                onPointerDown={e => { e.preventDefault(); handlePaste(); }}
                className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold text-white active:bg-slate-700"
              >
                <Clipboard size={11} /> Paste
              </button>
            </div>
          )}
          <div
            className={`min-h-[36px] px-3 py-2 ${t.displayBg} rounded-xl text-xs ${t.displayText} leading-relaxed break-all cursor-text whitespace-pre-wrap`}
            onPointerDown={handleDisplayPointerDown}
            onPointerUp={handleDisplayPointerUp}
            onPointerCancel={handleDisplayPointerCancel}
          >
            {value.length > 0 ? (
              isPassword ? (
                <span>
                  {"•".repeat(value.length)}
                  <span className="border-r-2 border-blue-400 ml-px animate-pulse inline-block w-0 align-middle">&nbsp;</span>
                </span>
              ) : selected ? (
                <span className="bg-blue-400/30 rounded px-0.5">{value}</span>
              ) : (
                <span>
                  {Array.from(beforeCursor).map((ch, i) => (
                    <span key={i} data-ci={i} className="whitespace-pre-wrap">{ch}</span>
                  ))}
                  <span className="border-r-2 border-blue-400 mx-px animate-pulse inline-block w-0 align-middle" aria-hidden>&nbsp;</span>
                  {Array.from(afterCursor).map((ch, i) => (
                    <span key={cursorPos + i} data-ci={cursorPos + i} className="whitespace-pre-wrap">{ch}</span>
                  ))}
                </span>
              )
            ) : (
              <span className={t.placeholder}>{placeholder}</span>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={submitting || !value.trim()}
          onClick={() => { if (!submitting && value.trim()) onSubmit(); }}
          className={`w-9 h-9 rounded-xl ${t.sendBg} flex items-center justify-center text-white disabled:opacity-40 shadow-sm shrink-0 active:scale-90 transition-transform`}
        >
          {submitting
            ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
            : <CornerDownLeft size={ki} />}
        </button>
      </div>

      {maxLength && (
        <p className={`text-right text-[9px] pr-3 -mt-0.5 ${value.length > maxLength * 0.8 ? (value.length >= maxLength ? "text-red-400" : "text-amber-400") : t.hintText}`}>
          {value.length}/{maxLength}
        </p>
      )}

      {/* ── Word suggestions bar ───────────────────────────────────────────── */}
      {suggestions.length > 0 && !showHistory && (
        <div className="mx-2 mb-1 flex gap-1.5 overflow-x-auto no-scrollbar">
          {suggestions.map(word => (
            <button
              key={word}
              type="button"
              onPointerDown={e => { e.preventDefault(); applySuggestion(word); }}
              className={`flex-shrink-0 px-3 py-1 rounded-lg border text-[11px] font-semibold transition-all active:scale-95 ${t.suggBg} ${t.suggBorder} ${t.suggText}`}
            >
              {word}
            </button>
          ))}
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className={`mx-2 mb-1 px-1.5 py-1 rounded-xl ${t.toolbarBg} flex items-center gap-1`}>
        {!isPassword && (
          <>
            <TBtn onTap={() => moveCursor(-1)} title="Left"><ChevronLeft size={11} /></TBtn>
            <TBtn onTap={() => moveCursor(1)}  title="Right"><ChevronRight size={11} /></TBtn>
            <TBtn onTap={() => moveCursorVertical(-1)} title="Up"><ArrowUp size={11} /></TBtn>
            <TBtn onTap={() => moveCursorVertical(1)}  title="Down"><ArrowDown size={11} /></TBtn>
          </>
        )}

        <div className="flex-1" />

        {!isPassword && (
          <TBtn onTap={handleSelectAll} className={`text-[10px] font-semibold px-2 ${selected ? "ring-1 ring-blue-400" : ""}`}>
            <span className={kt}>{selected ? "✓" : "All"}</span>
          </TBtn>
        )}

        <TBtn onTap={handlePaste} title="Paste" className={pasteState === "pasted" ? "ring-1 ring-emerald-400" : pasteState === "failed" ? "ring-1 ring-red-400" : ""}>
          {pasteState === "pasted" ? <Check size={11} /> : <Clipboard size={11} />}
        </TBtn>

        <TBtn onTap={handleCopy} title="Copy" className={copyState === "copied" ? "ring-1 ring-emerald-400" : copyState === "failed" ? "ring-1 ring-red-400" : ""}>
          {copyState === "copied" ? <Check size={11} /> : <Copy size={11} />}
        </TBtn>

        <TBtn onTap={showHistory ? () => setShowHistory(false) : openHistory} title="Clipboard history" className={showHistory ? "ring-1 ring-blue-400" : ""}>
          <HistoryIcon size={11} />
        </TBtn>
      </div>

      {/* ── Clipboard history panel ────────────────────────────────────────── */}
      {showHistory ? (
        <div className="px-3 pt-1 pb-2 flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onPointerDown={e => { e.preventDefault(); setShowHistory(false); }}
              className={`flex items-center justify-center w-6 h-6 rounded-lg ${t.toolbarBtn}`}
            >
              <ChevronLeft size={12} />
            </button>
            <span className={`text-[11px] font-bold ${t.text} flex-1`}>Clipboard</span>
            {historyEntries.length > 0 && (
              <button
                type="button"
                onPointerDown={e => { e.preventDefault(); setHistoryEntries([]); saveHistory([]); }}
                className={`text-[9px] ${t.hintText} active:opacity-50`}
              >
                Clear all
              </button>
            )}
          </div>

          {historyEntries.length === 0 ? (
            <div className={`py-6 text-center text-xs ${t.hintText}`}>
              Nothing copied yet — items appear here after you tap Copy.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 overflow-y-auto" style={{ maxHeight: 148 }}>
              {historyEntries.map((entry, i) => (
                <div key={i} className={`${t.histCardBg} rounded-xl p-2.5 flex gap-1 items-start`}>
                  <button
                    type="button"
                    onPointerDown={e => { e.preventDefault(); doPaste(entry.text); setShowHistory(false); }}
                    className={`flex-1 text-left text-[11px] ${t.histCardText} leading-tight break-all line-clamp-3`}
                  >
                    {entry.text}
                  </button>
                  <button
                    type="button"
                    onPointerDown={e => { e.preventDefault(); deleteHistoryEntry(i); }}
                    className={`shrink-0 ${t.hintText} active:text-red-400 p-0.5 rounded`}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Key rows ─────────────────────────────────────────────────────── */
        <div className="px-2 pt-0.5 pb-1 flex flex-col gap-1.5">
          {rows.map((row, ri) => (
            <div key={ri} className={`flex gap-1 ${ri === 1 && !numMode ? "px-4" : ""}`}>
              {row.map(k => <Key key={k} k={k} />)}
            </div>
          ))}

          <div className="flex gap-1">
            {numMode
              ? <Key k="ABC" />
              : (
                <button
                  type="button"
                  onPointerDown={e => { e.preventDefault(); vibrate(30); setNumMode(true); }}
                  className={`w-10 ${kh} flex items-center justify-center rounded-xl ${t.specialBg} ${t.spText} active:scale-90 transition-transform`}
                >
                  <Hash size={Math.max(ki - 3, 9)} />
                </button>
              )
            }
            <Key k="@" />
            <button
              type="button"
              onPointerDown={e => { e.preventDefault(); handleKeyWithSelect("SPACE"); }}
              className={`flex-1 ${kh} flex items-center justify-center rounded-xl ${t.keyBg} ${t.spText} ${kt} font-medium active:scale-95 transition-transform`}
            >
              space
            </button>
            <Key k="." />
            <button
              type="button"
              onClick={() => {
                vibrate(30);
                if (isMultiline) {
                  handleKeyWithSelect("ENTER");
                } else {
                  if (!submitting && value.trim()) onSubmit();
                }
              }}
              disabled={!isMultiline && (submitting || !value.trim())}
              className={`w-10 ${kh} flex items-center justify-center rounded-xl active:scale-90 transition-transform
                ${isMultiline ? t.specialBg + " " + t.spText : t.sendBg + " text-white disabled:opacity-40"}`}
            >
              <CornerDownLeft size={ki} />
            </button>
          </div>
        </div>
      )}
      <div className="pb-1" />
    </div>
  );
}
