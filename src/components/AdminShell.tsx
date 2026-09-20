"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";

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
          <button onClick={logout} className="text-xs text-ink-300 hover:text-red-500 mt-1">退出登录</button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
