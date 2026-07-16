import React, { useState, useRef } from "react";
import { db, auth } from "../firebase";
import { collection, addDoc, deleteDoc, doc, query, where, getDocs, getDoc } from "firebase/firestore";
import { VPN_APPS_LIST, VPN_EXT_MAP, EXPIRY_OPTIONS, CLOUD_EXPIRY_OPTIONS, COUNTRIES } from "../types";
import { UploadCloud, FileCode, CheckCircle, AlertCircle, ChevronDown, LogIn, Clock, Lock, Minus, Plus, Link, Globe } from "lucide-react";
import VKInput from "./VKInput";

interface CreatePostViewProps { onSuccess: () => void; isGuest: boolean; onSignInRequired: () => void; }

export default function CreatePostView({ onSuccess, isGuest, onSignInRequired }: CreatePostViewProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cloudDesc, setCloudDesc] = useState("");
  const [vpnApp, setVpnApp] = useState("None");
  const [customVpnName, setCustomVpnName] = useState("");
  const [configFileName, setConfigFileName] = useState("");
  const [configContent, setConfigContent] = useState("");
  const [isBinary, setIsBinary] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sharingMode, setSharingMode] = useState<'downloadable' | 'cloud_link'>('downloadable');
  const [expiryIdx, setExpiryIdx] = useState(EXPIRY_OPTIONS.length - 1);
  const [cloudExpiryIdx, setCloudExpiryIdx] = useState(1);
  const [customDays, setCustomDays] = useState("1");
  const [showCustom, setShowCustom] = useState(false);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [isGlobal, setIsGlobal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isGuest) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5 text-center" style={{ backgroundColor: "#080C10" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#111B2A", border: "1px solid #1E3A5F", color: "#00D4FF" }}><LogIn size={28} /></div>
        <div>
          <h3 className="text-lg font-black text-slate-900">Sign In to Post</h3>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-[240px] mx-auto">Create a free account to share VPN configurations with the SNIX community.</p>
        </div>
        <button onClick={onSignInRequired}
          className="w-full max-w-[280px] py-3 font-bold rounded-xl text-xs tracking-wider uppercase" style={{ background: "linear-gradient(90deg, #00A8CC, #00D4FF)", color: "#040709", fontFamily: "'JetBrains Mono', monospace", boxShadow: "0 0 20px rgba(0,212,255,0.25)" }}>
          Sign In / Create Account
        </button>
      </div>
    );
  }

  const EXT_TO_APP: Record<string, string> = {};
  for (const [app, exts] of Object.entries(VPN_EXT_MAP)) {
    for (const ext of exts) { if (!EXT_TO_APP[ext]) EXT_TO_APP[ext] = app; }
  }

  const handleFile = (file: File) => {
    setError("");
    if (!file) return;
    if (file.size > 1023897) { setError("File too large. Max 999.9KB."); return; }
    const ext = "." + (file.name.split('.').pop()?.toLowerCase() || '');
    const binaryExts = ['.hc','.hat','.tls','.v2r','.stark','.ehi','.ktc','.ev2','.npv2','.sip','.eh'];
    const isBin = binaryExts.includes(ext) || file.type.startsWith('application/octet-stream');
    setIsBinary(isBin);
    if (ext !== '.txt') { const detected = EXT_TO_APP[ext]; if (detected) setVpnApp(detected); }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        setConfigContent(isBin ? (result.split(",")[1] || result) : result);
        setConfigFileName(file.name);
        if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
      } else { setError("Could not read file."); }
    };
    reader.onerror = () => setError("Failed to read file.");
    if (isBin) reader.readAsDataURL(file); else reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); };
  const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(e.type==="dragenter"||e.type==="dragover"); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]); };

  const toggleCountry = (code: string) => {
    setIsGlobal(false);
    setSelectedCountries(prev => prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    const currentUser = auth.currentUser;
    if (!currentUser) { setError("You must be logged in to post."); return; }
    if (!title.trim()) { setError("Please enter a config title / name."); return; }
    if (vpnApp === "None") { setError("Please select the Target VPN Client App."); return; }
    if (vpnApp === "Other" && !customVpnName.trim()) { setError("Please enter the custom VPN app name."); return; }
    if (!isGlobal && selectedCountries.length === 0) { setError("Please select at least one country or choose Global 🌍."); return; }

    if (sharingMode === 'cloud_link') {
      if (!description.trim()) { setError("Please enter a cloud link URL or config code."); return; }
    } else {
      if (!description.trim()) { setError("Description is required — tell users about this config."); return; }
      if (!configContent.trim()) { setError("Please import a configuration file."); return; }
      if (showCustom && (!customDays || isNaN(Number(customDays)) || Number(customDays) < 1)) {
        setError("Please enter a valid number of days."); return;
      }
      if (configFileName && vpnApp !== "Other") {
        const ext = "." + (configFileName.split('.').pop()?.toLowerCase() || '');
        const allowed = VPN_EXT_MAP[vpnApp] || [];
        if (allowed.length > 0 && !allowed.includes(ext)) {
          setError(`Wrong file type for ${vpnApp}. Expected: ${allowed.join(", ")} — got: ${ext}`); return;
        }
      }
    }

    setLoading(true);
    try {
      const countriesField = isGlobal ? ['GLOBAL'] : selectedCountries;

      let expiresAt: number | null;
      let expiryLabel: string;
      if (sharingMode === 'cloud_link' && showCustom) {
        const days = Math.max(1, Number(customDays));
        expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
        expiryLabel = `${days} Day${days !== 1 ? 's' : ''}`;
      } else if (sharingMode === 'cloud_link') {
        const opt = CLOUD_EXPIRY_OPTIONS[cloudExpiryIdx];
        expiresAt = opt.ms != null ? Date.now() + opt.ms : null;
        expiryLabel = opt.label;
      } else if (showCustom) {
        const days = Math.max(1, Number(customDays));
        expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
        expiryLabel = `${days} Day${days !== 1 ? 's' : ''}`;
      } else {
        const expiry = EXPIRY_OPTIONS[expiryIdx];
        expiresAt = expiry.ms != null ? Date.now() + expiry.ms : null;
        expiryLabel = expiry.label;
      }

      try {
        const oldSnap = await getDocs(query(collection(db, "posts"), where("uid", "==", currentUser.uid)));
        for (const d of oldSnap.docs) {
          const data = d.data();
          if (data.expiresAt && Date.now() > data.expiresAt + 24*60*60*1000) await deleteDoc(doc(db, "posts", d.id));
        }
      } catch {}

      let authorAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUser.displayName || "anon")}`;
      try {
        const uSnap = await getDoc(doc(db, "users", currentUser.uid));
        if (uSnap.exists()) authorAvatar = uSnap.data().avatarUrl || authorAvatar;
      } catch {}

      const postData: Record<string, unknown> = {
        uid: currentUser.uid,
        authorName: currentUser.displayName || "Anonymous Agent",
        authorAvatar,
        title: title.trim(),
        description: description.trim(),
        vpnApp,
        customVpnName: vpnApp === "Other" ? customVpnName.trim() : "",
        countries: countriesField,
        heartCount: 0, okCount: 0, downCount: 0, downloadCount: 0, commentCount: 0,
        createdAt: Date.now(), expiresAt, expiryLabel,
      };

      if (sharingMode === 'cloud_link') {
        postData.sharingMode = 'cloud_link';
        postData.configContent = description.trim();
        postData.configFileName = title.trim();
        postData.isBinary = false;
        if (cloudDesc.trim()) postData.cloudDescription = cloudDesc.trim();
      } else {
        postData.sharingMode = 'downloadable';
        postData.configContent = configContent.trim();
        postData.configFileName = configFileName || `${title.toLowerCase().replace(/\s+/g,"_")}.conf`;
        postData.isBinary = isBinary;
      }

      await addDoc(collection(db, "posts"), postData);

      setTitle(""); setDescription(""); setVpnApp("None"); setCustomVpnName("");
      setConfigFileName(""); setConfigContent(""); setIsBinary(false);
      setExpiryIdx(EXPIRY_OPTIONS.length-1); setCloudExpiryIdx(1);
      setShowCustom(false); setCustomDays("1");
      setSelectedCountries([]); setIsGlobal(false);
      setSharingMode('downloadable');
      onSuccess();
    } catch (err: any) {
      const code = err?.code || "";
      const msg = err?.message || String(err);
      console.error("[SNIX] addDoc failed:", code, msg, err);
      setError("Failed to post: " + (code ? code + " — " : "") + msg);
    }
    finally { setLoading(false); }
  };

  const expiryOpts = sharingMode === 'cloud_link' ? CLOUD_EXPIRY_OPTIONS : EXPIRY_OPTIONS;
  const activeExpiryIdx = sharingMode === 'cloud_link' ? cloudExpiryIdx : expiryIdx;
  const setActiveExpiryIdx = sharingMode === 'cloud_link' ? setCloudExpiryIdx : setExpiryIdx;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto px-5 py-6 bg-slate-50 select-none">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight" style={{ fontFamily:"'Space Grotesk', sans-serif" }}>Share Config</h2>
        <p className="text-xs text-slate-500 mt-1">Publish a VPN configuration for the SNIX community</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 pb-20">
        {error && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium flex items-center gap-2 border border-red-100"><AlertCircle size={16} />{error}</div>}

        {/* Sharing Mode — first so the form adapts */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Config Sharing Mode</label>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => { setSharingMode('downloadable'); setShowCustom(false); }}
              className={`p-3 rounded-xl border-2 text-left transition-all ${sharingMode==='downloadable'?"border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/10":"border-slate-200 bg-white opacity-70"}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <FileCode size={13} className={sharingMode==='downloadable'?"text-blue-600":"text-slate-400"} />
                <div className={`font-bold text-xs ${sharingMode==='downloadable'?"text-slate-900":"text-slate-500"}`}>Downloadable</div>
              </div>
              <div className="text-[10px] text-slate-500 leading-normal">Users download the config file directly.</div>
            </button>
            <button type="button" onClick={() => { setSharingMode('cloud_link'); setShowCustom(false); }}
              className={`p-3 rounded-xl border-2 text-left transition-all ${sharingMode==='cloud_link'?"border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/10":"border-slate-200 bg-white opacity-70"}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Link size={13} className={sharingMode==='cloud_link'?"text-emerald-600":"text-slate-400"} />
                <div className={`font-bold text-xs ${sharingMode==='cloud_link'?"text-slate-900":"text-slate-500"}`}>Cloud Link</div>
              </div>
              <div className="text-[10px] text-slate-500 leading-normal">Share a hosted config URL.</div>
            </button>
          </div>
        </div>

        {/* Config Name / Title */}
        <div>
          <VKInput
            label="Config Name *"
            required
            value={title}
            onChange={setTitle}
            placeholder={sharingMode==='cloud_link'?"e.g. My HTTP Custom Cloud Config":"e.g. Ultra Fast US OpenVPN Server"}
            maxLength={100}
            inputClassName="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm shadow-sm"
          />
        </div>

        {/* Target VPN App */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Target VPN Client App *</label>
          <div className="relative">
            <select value={vpnApp} onChange={e => setVpnApp(e.target.value)}
              className={`w-full pl-4 pr-10 py-2.5 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm transition-all appearance-none cursor-pointer ${vpnApp === "None" ? "border-orange-300 text-orange-500 font-bold" : "border-slate-200 text-slate-900"}`}>
              {VPN_APPS_LIST.map(app => <option key={app} value={app} disabled={app==="None"}>{app === "None" ? "— Select VPN App —" : app}</option>)}
            </select>
            <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400"><ChevronDown size={16} /></span>
          </div>
          {vpnApp !== "None" && sharingMode === 'downloadable' && VPN_EXT_MAP[vpnApp]?.length > 0 && (
            <p className="text-[10px] text-slate-400 mt-1 ml-1">Accepted: <strong>{VPN_EXT_MAP[vpnApp].join(", ")}</strong></p>
          )}
        </div>

        {vpnApp === "Other" && (
          <div>
            <VKInput
              label="Custom VPN Client Name"
              required
              value={customVpnName}
              onChange={setCustomVpnName}
              placeholder="e.g. HTTP Custom Pro"
              maxLength={50}
              inputClassName="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm shadow-sm"
            />
          </div>
        )}

        {/* File Import — only for downloadable */}
        {sharingMode === 'downloadable' && (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Import File *</label>
            <div onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${isDragActive ? "border-emerald-500 bg-emerald-50/50" : configFileName ? "border-blue-500 bg-blue-50/20" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"}`}>
              <input ref={fileInputRef} type="file" accept=".vpn,.ovpn,.conf,.json,.txt,.ini,.hc,.hat,.tls,.v2r,.stark,.ehi,.ktc,.ev2,.npv2,.sip,.eh" className="hidden" onChange={handleFileInputChange} />
              {configFileName ? (
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-2"><CheckCircle size={20} /></div>
                  <span className="text-xs font-semibold text-slate-800 max-w-[260px] truncate">{configFileName}</span>
                  <span className="text-[10px] text-slate-400 mt-1">Tap to replace</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <UploadCloud size={28} className="text-slate-400 mb-2" />
                  <span className="text-xs font-bold text-slate-700">Import File</span>
                  <span className="text-[10px] text-slate-400 mt-1">Tap to browse — .ovpn, .conf, .ehi, .hat, .tls, etc.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Description / Cloud Link URL */}
        <div>
          <VKInput
            label={sharingMode === 'cloud_link' ? "Cloud Link / Config Code *" : "Description *"}
            required
            value={description}
            onChange={setDescription}
            placeholder={sharingMode === 'cloud_link'
              ? "https://example.com/config  or  4tg5t4-ggg552-y3edj6re"
              : "e.g. Speed 150Mbps, US server, works great for streaming. No logs."}
            maxLength={sharingMode === 'cloud_link' ? 1000 : 500}
            multiline={sharingMode !== 'cloud_link'}
            rows={sharingMode === 'cloud_link' ? 1 : 3}
            inputClassName="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm shadow-sm"
          />
          {sharingMode === 'cloud_link' && (
            <p className="text-[10px] text-slate-400 mt-1 ml-1">Paste a hosted config URL or a cloud config code. URLs can be opened; codes can be copied.</p>
          )}
          {sharingMode === 'cloud_link' && (
            <div className="mt-3">
              <VKInput
                label="Description (optional)"
                value={cloudDesc}
                onChange={setCloudDesc}
                placeholder="e.g Network: MNet, Speed: 122Mbps..."
                maxLength={300}
                multiline
                rows={2}
                inputClassName="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm shadow-sm"
              />
              <p className="text-[10px] text-slate-400 mt-1 ml-1">Help others understand what this config is for.</p>
            </div>
          )}
        </div>

        {/* Country Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase flex items-center gap-1.5">
            <Globe size={12} className="text-slate-500" />For Which Countries? *
          </label>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {/* Global option */}
            <button type="button" onClick={() => { setIsGlobal(true); setSelectedCountries([]); }}
              className={`w-full px-4 py-2.5 flex items-center gap-2 border-b border-slate-100 transition-all ${isGlobal ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
              <span className="text-lg leading-none">🌍</span>
              <span className={`text-xs font-bold ${isGlobal ? "text-blue-700" : "text-slate-600"}`}>Global — Works everywhere</span>
              {isGlobal && <span className="ml-auto text-blue-500 text-xs font-black">✓</span>}
            </button>
            {/* Country grid */}
            <div className="grid grid-cols-4 gap-1.5 p-2.5 max-h-44 overflow-y-auto">
              {COUNTRIES.map(c => {
                const sel = !isGlobal && selectedCountries.includes(c.code);
                return (
                  <button
                    type="button"
                    key={c.code}
                    onClick={() => toggleCountry(c.code)}
                    className={`flex flex-col items-center py-1.5 px-1 rounded-lg border transition-all ${sel ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-300"}`}
                  >
                    <span className="text-base leading-none">{c.flag}</span>
                    <span className="text-[9px] font-bold mt-0.5">{c.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {!isGlobal && selectedCountries.length > 0 && (
            <p className="text-[10px] text-blue-600 font-bold mt-1 ml-1">
              {selectedCountries.length} countr{selectedCountries.length === 1 ? "y" : "ies"} selected
            </p>
          )}
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase flex items-center gap-1.5">
            <Clock size={12} className="text-slate-500" />Config Availability Duration *
          </label>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {expiryOpts.map((opt, idx) => (
              <button key={opt.label} type="button"
                onClick={() => { setActiveExpiryIdx(idx); setShowCustom(false); }}
                className={`py-2 px-1 rounded-xl border text-center text-[10px] font-bold transition-all ${activeExpiryIdx === idx && !showCustom
                  ? (opt.ms === null ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20" : "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20")
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                {opt.label}
              </button>
            ))}
            <button type="button" onClick={() => { setShowCustom(true); setActiveExpiryIdx(-1); }}
              className={`py-2 px-1 rounded-xl border text-center text-[10px] font-bold transition-all ${showCustom ? "border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-500/20" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
              Custom
            </button>
          </div>
          {showCustom && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center border border-purple-300 rounded-xl overflow-hidden select-none">
                <button type="button"
                  onPointerDown={e => { e.preventDefault(); setCustomDays(d => String(Math.max(1, Number(d) - 1))); }}
                  className="px-3 py-2 bg-slate-100 text-slate-700 font-bold text-sm active:bg-slate-200 flex items-center">
                  <Minus size={13} />
                </button>
                <span className="w-12 text-center text-sm font-bold text-slate-800 py-2">{customDays}</span>
                <button type="button"
                  onPointerDown={e => { e.preventDefault(); setCustomDays(d => String(Math.min(365, Number(d) + 1))); }}
                  className="px-3 py-2 bg-slate-100 text-slate-700 font-bold text-sm active:bg-slate-200 flex items-center">
                  <Plus size={13} />
                </button>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                day{Number(customDays)!==1 ? 's' : ''} — expires {new Date(Date.now()+Number(customDays)*86400000).toLocaleDateString()}
              </span>
            </div>
          )}
          {!showCustom && sharingMode === 'downloadable' && EXPIRY_OPTIONS[expiryIdx].ms !== null && (
            <p className="text-[10px] text-orange-500 mt-1 ml-1 font-medium">
              Config marked expired after <strong>{EXPIRY_OPTIONS[expiryIdx].label}</strong> and deleted 24h later.
            </p>
          )}
          {sharingMode === 'cloud_link' && !showCustom && CLOUD_EXPIRY_OPTIONS[cloudExpiryIdx]?.ms !== null && (
            <p className="text-[10px] text-emerald-600 mt-1 ml-1 font-medium">
              Link expires in <strong>{CLOUD_EXPIRY_OPTIONS[cloudExpiryIdx].label}</strong> — typical for short-lived cloud configs.
            </p>
          )}
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-3 font-bold rounded-xl text-sm tracking-wider uppercase flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "linear-gradient(90deg, #00A8CC, #00D4FF)", color: "#040709", fontFamily: "'JetBrains Mono', monospace", boxShadow: "0 0 20px rgba(0,212,255,0.25)" }}>
          {loading ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : (sharingMode === 'cloud_link' ? "Post Cloud Link" : "Post Configuration")}
        </button>
      </form>
    </div>
  );
}
