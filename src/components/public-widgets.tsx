"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, QrImage } from "./ui";

export function PasswordGate({ code, name }: { code: string; name: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/public/group-auth/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }).then((r) => r.json());
      if (!res.ok) { setError(res.error || "密码错误"); return; }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink-50 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-xs bg-white rounded-card shadow-card p-6 text-center">
        <div className="text-3xl mb-3">🔒</div>
        <h1 className="font-bold mb-1">{name}</h1>
        <p className="text-sm text-ink-300 mb-5">本内容需要访问密码</p>
        <Input type="password" placeholder="请输入密码" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
        <Button type="submit" className="w-full mt-4" disabled={loading || !password}>{loading ? "验证中…" : "进入观看"}</Button>
      </form>
    </div>
  );
}

export function GroupShareButton({ name, count }: { name: string; count: number }) {
  const [open, setOpen] = useState(false);
  const url = typeof window !== "undefined" ? location.href.split("/play/")[0] : "";
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>分享</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`分享「${name}」`}>
        <div className="text-center">
          <div className="inline-block"><QrImage text={url} size={200} /></div>
          <p className="text-xs text-ink-300 mt-3 break-all">{url}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => copyText(`【${name}】共 ${count} 个视频，点击观看：${url}`)}>复制转发文案</Button>
        </div>
      </Modal>
    </>
  );
}

// 视频号外链条目工具：微信内可直跳视频号播放，其他环境引导回微信
export function isWeChat(): boolean {
  return typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);
}

export function VideoEntryLink({ href, externalUrl, className, children }: {
  href: string;
  externalUrl?: string | null; // 非空即"视频号外链"条目
  className?: string;
  children: React.ReactNode;
}) {
  const [hint, setHint] = useState(false);
  function onClick(e: React.MouseEvent) {
    if (!externalUrl) return; // 普通视频走默认跳播放页
    e.preventDefault();
    if (isWeChat()) {
      location.href = externalUrl;
    } else {
      setHint(true);
    }
  }
  return (
    <div>
      <a href={href} onClick={onClick} className={className}>{children}</a>
      {hint && (
        <div className="mx-3 mb-2 -mt-1 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 flex items-start justify-between gap-2">
          <span>该视频托管于微信视频号，请在<b>微信</b>中打开本页面后点击播放（可把本页链接发送到微信「文件传输助手」再点开）。</span>
          <button className="shrink-0 text-amber-500 px-1" onClick={() => setHint(false)}>✕</button>
        </div>
      )}
    </div>
  );
}
