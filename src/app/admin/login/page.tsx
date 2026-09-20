"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      router.replace("/admin");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-ink-50 to-brand-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-card shadow-lift p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand text-white text-2xl font-bold mb-4">台</div>
          <h1 className="text-xl font-bold">活动配套管理系统</h1>
          <p className="text-sm text-ink-300 mt-1">成都广播电视台 · 政商合作部</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <Input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading || !username || !password}>
            {loading ? "登录中…" : "登 录"}
          </Button>
        </form>
      </div>
    </div>
  );
}
