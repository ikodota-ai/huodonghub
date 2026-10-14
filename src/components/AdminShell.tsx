"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Field, Input, Modal } from "./ui";

const NAV = [
  { href: "/admin", label: "仪表盘", icon: "▤", exact: true },
  { href: "/admin/videos", label: "视频分组", icon: "🎬" },
  { href: "/admin/votes", label: "投票评选", icon: "🗳" },
  { href: "/admin/ai", label: "AI 能力", icon: "✦" },
  { href: "/admin/system", label: "系统设置", icon: "⚙" },
];

export function AdminShell({ children, userName, role }: { children: React.ReactNode; userName: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pwOpen, setPwOpen] = useState(false);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-52 shrink-0 bg-white border-r border-ink-100 flex flex-col">
        <div className="px-5 py-5 border-b border-ink-100">
          <div className="font-bold">活动配套管理系统</div>
          <div className="text-xs text-ink-300 mt-0.5">成都广播电视台</div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((item) => {
            if (item.href === "/admin/system" && role !== "admin") return null;
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-5 py-2.5 text-sm transition-colors ${active ? "text-brand bg-brand-50 border-r-2 border-brand font-medium" : "text-ink-500 hover:text-ink-900 hover:bg-ink-50"}`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-ink-100">
          <div className="text-sm font-medium">{userName}</div>
          <div className="flex gap-3 mt-1">
            <button onClick={() => setPwOpen(true)} className="text-xs text-ink-300 hover:text-brand">修改密码</button>
            <button onClick={logout} className="text-xs text-ink-300 hover:text-red-500">退出登录</button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 overflow-x-hidden">{children}</main>
      <ChangePwModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function ChangePwModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setOldPassword(""); setNewPassword(""); setConfirm(""); setError("");
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="修改密码" width="max-w-sm">
      <Field label="原密码" required>
        <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="新密码" required hint="至少 6 位；改密后其他设备的登录会失效">
        <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="确认新密码" required>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </Field>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <div className="flex justify-end">
        <Button disabled={busy} onClick={async () => {
          setError("");
          if (newPassword !== confirm) { setError("两次输入的新密码不一致"); return; }
          setBusy(true);
          try {
            await api("/api/auth/password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) });
            reset(); onClose();
            alert("密码已修改");
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>确认修改</Button>
      </div>
    </Modal>
  );
}
