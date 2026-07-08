import React, { useRef, useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useKeyboard, KeyboardSession } from "../context/KeyboardContext";

interface VKInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  type?: "text" | "email" | "password";
  maxLength?: number;
  multiline?: boolean;
  rows?: number;
  icon?: React.ReactNode;
  className?: string;
  inputClassName?: string;
  label?: string;
  required?: boolean;
  submitting?: boolean;
  disabled?: boolean;
  hint?: string;
  showPasswordToggle?: boolean;
  /** localStorage key — field value is auto-saved and restored on mount (skipped for passwords) */
  memoryKey?: string;
}

const MEM_PREFIX = "snix_mem_";

export default function VKInput({
  value, onChange, onSubmit, placeholder, type = "text",
  maxLength, multiline = false, rows = 2, icon, className = "",
  inputClassName = "", label, required, submitting, disabled, hint,
  showPasswordToggle = false, memoryKey,
}: VKInputProps) {
  const { openKeyboard, isOpen } = useKeyboard();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const [showPassword, setShowPassword] = useState(false);

  const tapRef = useRef<{ x: number; y: number } | null>(null);

  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!isOpen) setActive(false);
  }, [isOpen]);

  // ── Field memory: auto-fill from localStorage, auto-save on change ────────
  // Only applies when memoryKey is set and field is not a password type
  const canRemember = !!memoryKey && type !== "password";
  useEffect(() => {
    if (!canRemember) return;
    try {
      const saved = localStorage.getItem(MEM_PREFIX + memoryKey);
      if (saved) onChangeRef.current(saved);
    } catch {}
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canRemember) return;
    try {
      if (value) localStorage.setItem(MEM_PREFIX + memoryKey, value);
      else       localStorage.removeItem(MEM_PREFIX + memoryKey);
    } catch {}
  }, [value, canRemember, memoryKey]);

  const handleTap = () => {
    if (disabled) return;
    setActive(true);
    const session: KeyboardSession = {
      onChange: (v) => onChangeRef.current(v),
      onSubmit: onSubmitRef.current ? () => onSubmitRef.current?.() : undefined,
      placeholder,
      maxLength,
      isPassword: type === "password" && !showPassword,
      isMultiline: multiline,
    };
    openKeyboard(value, session);
  };

  const isPasswordDisplay = type === "password" && !showPassword;
  const displayText = isPasswordDisplay ? "•".repeat(Math.min(value.length, 24)) : value;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      <div
        className={`
          relative flex items-start gap-2 cursor-pointer select-none
          transition-all rounded-xl border
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${active ? "border-blue-500 ring-2 ring-blue-400/40 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]" : ""}
          ${inputClassName || "px-3 py-2.5 bg-slate-50 border-slate-200"}
        `}
        onPointerDown={e => {
          if (disabled) return;
          tapRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={e => {
          if (disabled || !tapRef.current) return;
          const dx = Math.abs(e.clientX - tapRef.current.x);
          const dy = Math.abs(e.clientY - tapRef.current.y);
          tapRef.current = null;
          if (dx < 10 && dy < 10) handleTap();
        }}
        onPointerCancel={() => { tapRef.current = null; }}
        role="textbox"
        aria-placeholder={placeholder}
      >
        {icon && (
          <span className="shrink-0 mt-0.5 text-slate-400">{icon}</span>
        )}
        <div className={`flex-1 min-w-0 ${multiline ? "min-h-[" + (rows * 20) + "px]" : ""}`}>
          {displayText ? (
            <span className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${isPasswordDisplay ? "tracking-widest" : ""}`}>
              {displayText}
              {active && (
                <span className="border-r-2 border-blue-500 ml-px opacity-60 animate-pulse">&nbsp;</span>
              )}
            </span>
          ) : (
            <span className="text-sm text-slate-400">{placeholder}</span>
          )}
        </div>

        {/* Eye toggle for password fields */}
        {showPasswordToggle && type === "password" && (
          <button
            type="button"
            onPointerDown={e => {
              e.stopPropagation();
              e.preventDefault();
              setShowPassword(s => !s);
            }}
            className="shrink-0 mt-0.5 text-slate-400 hover:text-slate-600 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-400 ml-1">{hint}</p>}
    </div>
  );
}
