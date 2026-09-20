"use client";

import React, { useEffect, useRef, useState } from "react";

export function Button({ children, variant = "primary", size = "md", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md" | "lg" }) {
  const v = {
    primary: "bg-brand text-white hover:bg-brand-600 active:bg-brand-700 disabled:bg-ink-200",
    secondary: "border border-ink-200 text-ink-700 hover:border-brand hover:text-brand bg-white disabled:text-ink-300",
    danger: "bg-red-500 text-white hover:bg-red-600 disabled:bg-ink-200",
    ghost: "text-ink-500 hover:text-brand hover:bg-brand-50",
  }[variant];
  const s = { sm: "h-8 px-3 text-sm", md: "h-9 px-4 text-sm", lg: "h-11 px-6 text-base" }[size];
  return (
    <button className={`inline-flex items-center justify-center gap-1 rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${v} ${s} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-card shadow-card ${className}`}>{children}</div>;
}

export function Field({ label, required, error, children, hint }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium text-ink-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-ink-300 mt-1">{hint}</span>}
      {error && <span className="block text-xs text-red-500 mt-1">{error}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full h-9 px-3 rounded-lg border border-ink-200 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 transition ${props.className || ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-100 transition ${props.className || ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full h-9 px-3 rounded-lg border border-ink-200 text-sm bg-white outline-none focus:border-brand transition ${props.className || ""}`} />;
}

export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "red" | "orange" | "blue" }) {
  const t = {
    gray: "bg-ink-100 text-ink-500",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-600",
    orange: "bg-brand-100 text-brand-700",
    blue: "bg-blue-100 text-blue-700",
  }[tone];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${t}`}>{children}</span>;
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full transition-colors relative ${checked ? "bg-brand" : "bg-ink-200"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

export function Modal({ open, onClose, title, children, width = "max-w-lg" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: string }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-card shadow-lift w-full ${width} max-h-[85vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-ink-300 hover:text-ink-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-ink-100 mb-5 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${active === t.key ? "border-brand text-brand" : "border-transparent text-ink-500 hover:text-ink-900"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="py-16 text-center">
      <div className="text-4xl mb-3 opacity-30">▤</div>
      <p className="text-ink-300 text-sm mb-4">{text}</p>
      {action}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-ink-100 animate-pulse" />
      ))}
    </div>
  );
}

export function useQr(text: string, size = 240): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let dead = false;
    if (text) {
      import("qrcode").then((QRCode) => {
        QRCode.toDataURL(text, { width: size, margin: 1 }).then((u: string) => !dead && setUrl(u));
      });
    }
    return () => { dead = true; };
  }, [text, size]);
  return url;
}

export function QrImage({ text, size = 240 }: { text: string; size?: number }) {
  const url = useQr(text, size * 2);
  if (!url) return <div className="bg-ink-100 animate-pulse rounded-lg" style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="二维码" width={size} height={size} className="rounded-lg" />;
}

export function useDebounce<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer.current);
  }, [value, ms]);
  return v;
}

export function download(filename: string, url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}
