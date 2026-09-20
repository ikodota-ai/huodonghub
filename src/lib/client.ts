"use client";

export async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: options?.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  const json = await res.json().catch(() => ({ ok: false, error: "网络错误" }));
  if (!json.ok) throw new Error(json.error || `请求失败(${res.status})`);
  return json.data as T;
}

export function getFp(): string {
  if (typeof window === "undefined") return "";
  let fp = localStorage.getItem("dth_fp");
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem("dth_fp", fp);
  }
  return fp;
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function fmtBytes(bytes: number | string): string {
  const b = typeof bytes === "string" ? Number(bytes) : bytes;
  if (b >= 1 << 30) return (b / (1 << 30)).toFixed(1) + " GB";
  if (b >= 1 << 20) return (b / (1 << 20)).toFixed(1) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
  return b + " B";
}

export function fmtTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function isWechat(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}
