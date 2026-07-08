import React, { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles } from "lucide-react";
import { getApiBase } from "../utils/notify";

interface ChatMsg { role: "user" | "model"; text: string }

const SUGGESTIONS = [
  "How do I change my profile background?",
  "Why can't I download a config?",
  "How does the Reacted tab work?",
];

async function askAssistant(message: string, history: ChatMsg[]): Promise<string> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  const j = await res.json().catch(() => null) as { ok?: boolean; reply?: string } | null;
  if (!res.ok || !j?.ok || !j.reply) {
    if (res.status === 429) throw new Error("You're sending messages a bit fast — try again in a minute.");
    throw new Error("Ask SNIX is unavailable right now. Please try again shortly.");
  }
  return j.reply;
}

export default function AskSnixModal({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "model", text: "Hi! I'm Ask SNIX — I can help you find your way around the app. What do you need help with?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    const history = messages;
    const next: ChatMsg[] = [...history, { role: "user", text: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const reply = await askAssistant(trimmed, history);
      setMessages(m => [...m, { role: "model", text: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
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
              <p className="text-sm font-black text-slate-900" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Ask SNIX</p>
              <p className="text-[10px] text-slate-400 font-medium">App help &amp; troubleshooting</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-gradient-to-br from-blue-600 to-emerald-500 text-white rounded-br-md"
                  : "bg-slate-100 text-slate-800 rounded-bl-md"
              }`}>
                {m.text}
              </div>
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
        </div>

        <form
          onSubmit={e => { e.preventDefault(); send(input); }}
          className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 shrink-0"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about how SNIX works…"
            className="flex-1 bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-200"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
