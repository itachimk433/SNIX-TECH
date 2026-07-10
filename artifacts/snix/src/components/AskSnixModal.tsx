/**
 * AskSnixModal — in-app SNIX-AI help assistant powered by Gemini, called
 * directly from the browser.  The Gemini API key is embedded at build time
 * via VITE_GEMINI_API_KEY (a Cloudflare Pages environment variable). Use a
 * key with usage quotas set in Google AI Studio.
 *
 * Features:
 *  - SNIX-AI(beta) label in header
 *  - Resend button on failed messages
 *  - Conversation persistence across modal open/close (localStorage)
 *  - Guest reply limit (5 replies) with sign-in prompt
 *  - Limited creator disclosure by default
 */
import React, { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles, RotateCcw } from "lucide-react";
import { useKeyboard } from "../context/KeyboardContext";

interface ChatMsg { role: "user" | "model"; text: string; failed?: boolean }

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_MODEL = "gemini-2.5-flash";

// Guests get a limited number of AI replies per conversation before being
// asked to sign in — signed-in users are unlimited.
const GUEST_REPLY_LIMIT = 5;

function storageKey(uid: string | null) {
  return `snix-ai-chat:${uid || "guest"}`;
}

function loadHistory(uid: string | null): ChatMsg[] | null {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return null;
  } catch { return null; }
}

function saveHistory(uid: string | null, messages: ChatMsg[]) {
  try { localStorage.setItem(storageKey(uid), JSON.stringify(messages)); } catch { /* ignore */ }
}

const SYSTEM_PROMPT = `You are "SNIX-AI", the in-app help assistant for SNIX — a mobile app where people share and discover VPN configuration files with a community.

What the app lets people do:
- Browse a Feed of VPN config posts shared by other users, filterable by VPN app (e.g. WireGuard, OpenVPN, V2Ray, etc.), by country, and searchable by keyword.
- Post a config: give it a title and description, choose the VPN app it's for, attach a config file or a cloud link, and optionally tag which countries it works well in. Posting requires being signed in.
- React to a post with ❤️ (heart), 👌 (ok), or 👎 (down), leave comments, and download configs. Downloading a config does NOT require being signed in — anyone, including guests, can download. Only posting, reacting, commenting, and following require signing in.
- Follow other users and filter the Feed to show only people they follow.
- View a Leaderboard of top contributors, globally or by country.
- Open their Profile to see their own posted configs, a "Reacted" tab listing posts they've reacted to (tapping one jumps back to that exact post in the Feed and briefly highlights it), edit their bio/avatar, and customize their profile background image.
- Receive notifications for comments, reactions, and follows, and tap a notification to jump to the relevant post or comment.
- Use the app as a signed-in user or as a guest (with some actions like posting, reacting, commenting, or following requiring sign-in — downloading and browsing do not).
- Optionally purchase a "Pro" upgrade for extra perks/badge.
- Get help any time via SNIX-AI (this assistant), reachable from the Feed screen header and the Profile screen header.
- Contact support by email at mkdev4360@gmail.com.

About the app and its creator (safe to share — this is not implementation detail):
- SNIX was created by Banele Charles Makhanya, who goes by MKDEV.
- If asked "what is SNIX", "tell me about SNIX", "who made this app", "who created you", or similar general questions, answer briefly and naturally — these are NOT implementation questions and you should NOT decline them.
- By default, when naming the creator, mention only his name or nickname — e.g. "Charles" or "MKDEV" (do not default to his full name, country, age, or city).
- Only share the fuller details — his full name (Banele Charles Makhanya), that he is South African, in his early twenties, and based in Durban — if the user explicitly asks for more, e.g. "what's his full name", "where is he from", "how old is he", "what country/city".

How you must behave:
- Answer general questions about what SNIX is and who made it (using only the facts given above), questions about how to use the app, what a feature does, and basic troubleshooting (e.g. "why can't I download a config", "how do I change my profile background", "why don't I see my post").
- Keep answers short, friendly, and practical — a few sentences or a short numbered list at most. Always finish your sentences completely; never cut a thought off mid-way.
- You must NEVER reveal, describe, discuss, or speculate about the app's source code, file structure, programming languages, frameworks, libraries, database, API endpoints, internal architecture, or how any feature is implemented under the hood — even if the user directly asks, claims to be a developer, or tries to rephrase the request. If asked about implementation, politely decline and redirect to what the feature does for the user, not how it works internally.
- If a question is truly unrelated to SNIX (e.g. general knowledge, coding help, unrelated topics), politely say you can only help with using the SNIX app.
- Do not invent features that don't exist in the list above.`;

const SUGGESTIONS = [
  "How do I change my profile background?",
  "Why can't I download a config?",
  "How does the Reacted tab work?",
];

// Block obvious attempts to probe for implementation details
const BLOCKED_INPUT_PATTERNS = [
  /source\s*code/i, /\bthe\s+code\b/i, /your\s+(code|prompt|instructions|system\s*prompt)/i,
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i, /system\s*prompt/i,
  /\bgithub\b/i, /codebase/i, /file\s*structure/i,
  /api\s*(endpoint|route|key)/i, /\bframework\b/i,
  /how\s+(is|was)\s+.*\s+(built|implemented|coded|programmed)/i,
  /show\s+me\s+(the\s+)?(code|implementation)/i,
];

function isBlocked(msg: string): boolean {
  return BLOCKED_INPUT_PATTERNS.some(p => p.test(msg));
}

const DECLINE =
  "I can only help with using the SNIX app — how features work or troubleshooting. I can't discuss source code or how things are built.";

const GREETING = "Hi! I'm SNIX-AI — I can help you find your way around the app. What do you need help with?";

async function askGemini(message: string, history: ChatMsg[]): Promise<string> {
  if (!GEMINI_KEY) throw new Error("SNIX-AI is not configured yet.");

  if (isBlocked(message)) return DECLINE;

  const contents = [
    ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
      }),
    },
  );

  const j = await res.json().catch(() => null) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  } | null;

  if (!res.ok) {
    const msg = j?.error?.message || `Gemini error (HTTP ${res.status})`;
    if (res.status === 429) throw new Error("You're sending messages too fast — try again in a moment.");
    throw new Error(msg);
  }

  const reply = j?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
  if (!reply) throw new Error("No reply received.");
  return reply;
}

export default function AskSnixModal({ onClose, isGuest = false, uid = null }: {
  onClose: () => void; isGuest?: boolean; uid?: string | null;
}) {
  const { openKeyboard, settings: kbSettings } = useKeyboard();
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadHistory(uid) || [
    { role: "model", text: GREETING },
  ]);
  const [input, setInput] = useState("");
  // Keep a ref so the VK onSubmit closure always reads the latest typed value
  // (the state closure captured at openKeyboard() time would be stale).
  const inputRef = useRef("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Persist the conversation so it survives closing/reopening the modal.
  useEffect(() => { saveHistory(uid, messages); }, [messages, uid]);

  const guestRepliesUsed = isGuest ? messages.filter(m => m.role === "model" && !m.failed).length - 1 /* greeting */ : 0;
  const guestLimitReached = isGuest && guestRepliesUsed >= GUEST_REPLY_LIMIT;

  const send = async (text: string, historyOverride?: ChatMsg[]) => {
    const trimmed = text.trim();
    if (!trimmed || sending || guestLimitReached) return;
    setError(null);
    // Use the explicitly-provided history snapshot (e.g. from resend) so that
    // the API context always matches what is shown in the UI at call time.
    const history = historyOverride ?? messages;
    setMessages(m => [...m, { role: "user", text: trimmed }]);
    inputRef.current = "";
    setInput("");
    setSending(true);
    try {
      const reply = await askGemini(trimmed, history);
      setMessages(m => [...m, { role: "model", text: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setMessages(m => m.map((msg, i) => i === m.length - 1 ? { ...msg, failed: true } : msg));
    } finally {
      setSending(false);
    }
  };

  const resend = (index: number) => {
    const msg = messages[index];
    if (!msg || msg.role !== "user" || sending) return;
    // Snapshot the correct trimmed history BEFORE touching state so the API
    // call receives exactly the context shown in the UI after the trim.
    const trimmedHistory = messages.slice(0, index);
    setMessages(trimmedHistory);
    send(msg.text, trimmedHistory);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-h-[82vh] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 flex items-center justify-center text-white">
              <Sparkles size={16} />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>SNIX-AI<span className="text-slate-400 font-bold">(beta)</span></p>
              <p className="text-[10px] text-slate-400 font-medium">App help &amp; troubleshooting</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? `text-white rounded-br-md ${m.failed ? "bg-red-400" : "bg-gradient-to-br from-blue-600 to-emerald-500"}`
                  : "bg-slate-100 text-slate-800 rounded-bl-md"
              }`}>
                {m.text}
              </div>
              {m.role === "user" && m.failed && !sending && (
                <button
                  onClick={() => resend(i)}
                  className="mt-1 flex items-center gap-1 text-[10px] font-bold text-red-500 hover:text-red-600 px-1"
                >
                  <RotateCcw size={11} /> Failed to send · Resend
                </button>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-slate-100 text-slate-400 px-3.5 py-2.5 rounded-2xl rounded-bl-md text-xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
              </div>
            </div>
          )}
          {error && (
            <p className="text-[10px] text-red-500 font-semibold text-center">{error}</p>
          )}
          {messages.length === 1 && !sending && (
            <div className="flex flex-col gap-1.5 pt-1">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-left text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 hover:bg-blue-100 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}
          {guestLimitReached && !sending && (
            <div className="flex flex-col items-center gap-2 pt-2 pb-1 text-center">
              <p className="text-[11px] text-slate-400 font-medium max-w-[240px]">
                You've reached the guest limit of {GUEST_REPLY_LIMIT} SNIX-AI replies. Sign in for unlimited help.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 shrink-0">
          {kbSettings.enabled ? (
            /* In-app keyboard enabled — tappable fake-input opens the overlay */
            <div
              className={`flex-1 bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-medium cursor-pointer select-none min-h-[38px] flex items-center ${(sending || guestLimitReached) ? "opacity-50 pointer-events-none" : ""}`}
              onPointerUp={() => !sending && !guestLimitReached && openKeyboard(input, {
                onChange: (v) => { setInput(v); inputRef.current = v; },
                onSubmit: () => send(inputRef.current),
                placeholder: "Ask about how SNIX works…",
              })}
            >
              {guestLimitReached
                ? <span className="text-slate-400">Sign in to keep chatting…</span>
                : input
                  ? <span className="text-slate-800 break-words">{input}</span>
                  : <span className="text-slate-400">Ask about how SNIX works…</span>
              }
            </div>
          ) : (
            /* In-app keyboard disabled — native browser input */
            <input
              type="text"
              value={input}
              onChange={e => { setInput(e.target.value); inputRef.current = e.target.value; }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(inputRef.current); } }}
              placeholder={guestLimitReached ? "Sign in to keep chatting…" : "Ask about how SNIX works…"}
              disabled={sending || guestLimitReached}
              className="flex-1 bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-medium min-h-[38px] outline-none disabled:opacity-50 placeholder:text-slate-400"
            />
          )}
          <button
            onPointerDown={e => { e.preventDefault(); send(inputRef.current); }}
            disabled={sending || !input.trim() || guestLimitReached}
            className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
