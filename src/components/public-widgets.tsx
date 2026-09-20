"use client";

import { useState } from "react";
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
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigator.clipboard.writeText(`【${name}】共 ${count} 个视频，点击观看：${url}`)}>复制转发文案</Button>
        </div>
      </Modal>
    </>
  );
}
