import React, { useEffect, useMemo, useState } from "react";
import { X, FlaskConical, Send, Eye, EyeOff, RefreshCw, Trash2 } from "lucide-react";

type Provider = "openai" | "gemini";
type ChatMsg = { role: "user" | "assistant"; text: string };

const STORAGE_PREFIX = "snix_ai_test_";

function loadStr(key: string): string {
  try { return localStorage.getItem(STORAGE_PREFIX + key) || ""; } catch { return ""; }
}
function saveStr(key: string, value: string) {
  try {
    if (value) localStorage.setItem(STORAGE_PREFIX + key, value);
    else localStorage.removeItem(STORAGE_PREFIX + key);
  } catch { /* ignore */ }
}

interface ModelOption { id: string; label: string }

// This panel is dev/testing-only: it stores API keys in this browser's
// localStorage and calls OpenAI/Gemini directly from the client, bypassing
// the app's backend entirely. It is intentionally hidden from every account
// except the configured owner account (see ProfileView) and must never be
// wired into the regular Ask SNIX assistant flow.
async function listOpenAiModels(key: string): Promise<ModelOption[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`OpenAI rejected the key (HTTP ${res.status}).`);
  const data = await res.json() as { data?: { id: string }[] };
  const ids = (data.data || []).map(m => m.id);
  return ids
    .filter(id => /^(gpt-|o1|o3|o4)/.test(id) && !/audio|realtime|transcribe|tts|embedding|moderation|instruct/.test(id))
    .sort()
    .map(id => ({ id, label: id }));
}

async function listGeminiModels(key: string): Promise<ModelOption[]> {
  // Use the x-goog-api-key header rather than a ?key= query param so the
  // key doesn't end up in browser history, proxy logs, or network tooling
  // that captures full request URLs.
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": key },
  });
  if (!res.ok) throw new Error(`Gemini rejected the key (HTTP ${res.status}).`);
  const data = await res.json() as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
  return (data.models || [])
    .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
    .map(m => ({ id: m.name.replace(/^models\//, ""), label: m.displayName || m.name.replace(/^models\//, "") }));
}

async function chatOpenAi(key: string, model: string, history: ChatMsg[], message: string): Promise<string> {
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.text })),
    { role: "user" as const, content: message },
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 500 }),
  });
  const j = await res.json().catch(() => null) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(j?.error?.message || `OpenAI error (HTTP ${res.status}).`);
  const reply = j?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("OpenAI returned an empty reply.");
  return reply;
}

async function chatGemini(key: string, model: string, history: ChatMsg[], message: string): Promise<string> {
  const contents = [
    ...history.map(h => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.6, maxOutputTokens: 500 } }),
  });
  const j = await res.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(j?.error?.message || `Gemini error (HTTP ${res.status}).`);
  const reply = j?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
  if (!reply) throw new Error("Gemini returned an empty reply.");
  return reply;
}

export default function AiTestPanel({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState<Provider>(() => (loadStr("provider") as Provider) || "openai");
  const [openaiKey, setOpenaiKey] = useState(() => loadStr("openai_key"));
  const [geminiKey, setGeminiKey] = useState(() => loadStr("gemini_key"));
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<Record<Provider, ModelOption[]>>({ openai: [], gemini: [] });
  const [model, setModel] = useState(() => ({ openai: loadStr("model_openai"), gemini: loadStr("model_gemini") }));
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const key = provider === "openai" ? openaiKey : geminiKey;
  const currentModel = model[provider];
  const currentModels = models[provider];

  useEffect(() => { saveStr("provider", provider); }, [provider]);
  useEffect(() => { saveStr("openai_key", openaiKey); }, [openaiKey]);
  useEffect(() => { saveStr("gemini_key", geminiKey); }, [geminiKey]);
  useEffect(() => { saveStr("model_openai", model.openai); saveStr("model_gemini", model.gemini); }, [model]);

  const fetchModels = async () => {
    if (!key) { setModelsError("Enter an API key first."); return; }
    setLoadingModels(true);
    setModelsError(null);
    try {
      const list = provider === "openai" ? await listOpenAiModels(key) : await listGeminiModels(key);
      setModels(m => ({ ...m, [provider]: list }));
      if (list.length && !list.some(o => o.id === model[provider])) {
        setModel(m => ({ ...m, [provider]: list[0].id }));
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : "Couldn't fetch models.");
    } finally {
      setLoadingModels(false);
    }
  };

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    if (!key) { setChatError("Enter an API key first."); return; }
    if (!currentModel) { setChatError("Fetch models and pick one first."); return; }
    setChatError(null);
    const history = messages;
    setMessages(m => [...m, { role: "user", text: trimmed }]);
    setInput("");
    setSending(true);
    try {
      const reply = provider === "openai"
        ? await chatOpenAi(key, currentModel, history, trimmed)
        : await chatGemini(key, currentModel, history, trimmed);
      setMessages(m => [...m, { role: "assistant", text: reply }]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setSending(false);
    }
  };

  const clearKey = () => {
    if (provider === "openai") setOpenaiKey(""); else setGeminiKey("");
    setModels(m => ({ ...m, [provider]: [] }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-h-[88vh] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-500 flex items-center justify-center text-white">
              <FlaskConical size={16} />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>AI Test Panel</p>
              <p className="text-[10px] text-slate-400 font-medium">Bring your own key — dev only</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-4">
          <div className="flex gap-2">
            {(["openai", "gemini"] as Provider[]).map(p => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${provider === p ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {p === "openai" ? "OpenAI" : "Gemini"}
              </button>
            ))}
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">API key (stored only in this browser)</p>
            <div className="flex items-center gap-2">
              <input
                type={showKey ? "text" : "password"}
                value={key}
                onChange={e => provider === "openai" ? setOpenaiKey(e.target.value) : setGeminiKey(e.target.value)}
                placeholder={provider === "openai" ? "sk-..." : "AIza..."}
                className="flex-1 bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-purple-200"
              />
              <button onClick={() => setShowKey(s => !s)} className="p-2.5 rounded-xl bg-slate-100 text-slate-500" title={showKey ? "Hide" : "Show"}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button onClick={clearKey} className="p-2.5 rounded-xl bg-red-50 text-red-500" title="Clear key">
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Model</p>
              <button
                onClick={fetchModels}
                disabled={loadingModels}
                className="flex items-center gap-1 text-[10px] font-bold text-purple-600 disabled:opacity-40"
              >
                <RefreshCw size={11} className={loadingModels ? "animate-spin" : ""} />
                {loadingModels ? "Fetching…" : "Fetch models"}
              </button>
            </div>
            <select
              value={currentModel}
              onChange={e => setModel(m => ({ ...m, [provider]: e.target.value }))}
              className="w-full bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-purple-200"
            >
              {currentModel && !currentModels.some(o => o.id === currentModel) && (
                <option value={currentModel}>{currentModel}</option>
              )}
              {!currentModel && <option value="">No model selected</option>}
              {currentModels.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {modelsError && <p className="text-[10px] text-red-500 font-semibold mt-1.5">{modelsError}</p>}
          </div>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Test chat</p>
            <div className="space-y-2 max-h-56 overflow-y-auto mb-2">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-gradient-to-br from-purple-600 to-fuchsia-500 text-white rounded-br-md"
                      : "bg-slate-100 text-slate-800 rounded-bl-md"
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 text-slate-400 px-3.5 py-2.5 rounded-2xl rounded-bl-md text-xs">Thinking…</div>
                </div>
              )}
              {chatError && <p className="text-[10px] text-red-500 font-semibold text-center">{chatError}</p>}
            </div>
            <form onSubmit={e => { e.preventDefault(); send(); }} className="flex items-center gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Send a test message…"
                className="flex-1 bg-slate-100 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-purple-200"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-500 text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
