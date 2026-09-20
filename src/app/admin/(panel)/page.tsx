"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtBytes } from "@/lib/client";
import { Card, Badge, Skeleton, Button } from "@/components/ui";

interface Dash {
  groupCount: number; videoCount: number; activeVoteCount: number; activeRoundCount: number;
  videoBytes: string; mediaBytes: number;
  health: { key: string; level: "ok" | "warn" | "alert"; label: string; detail: string }[];
  recentGroups: { id: string; name: string; code: string; videoCount: number; status: number }[];
  recentVotes: { id: string; name: string; status: string; roundCount: number }[];
}

const HEALTH_STYLE: Record<string, { dot: string; text: string }> = {
  ok: { dot: "bg-green-500", text: "text-ink-500" },
  warn: { dot: "bg-amber-500", text: "text-amber-700" },
  alert: { dot: "bg-red-500", text: "text-red-600" },
};

export default function Dashboard() {
  const [data, setData] = useState<Dash | null>(null);

  useEffect(() => {
    api<Dash>("/api/dashboard").then(setData).catch(() => {});
  }, []);

  if (!data) return <Skeleton rows={4} />;

  const stats = [
    { label: "视频分组", value: data.groupCount, sub: `${data.videoCount} 个视频 · ${fmtBytes(data.videoBytes)}` },
    { label: "进行中的投票", value: data.activeVoteCount, sub: `${data.activeRoundCount} 个轮次投票中` },
    { label: "媒体存储", value: fmtBytes(data.mediaBytes), sub: "本地媒体目录" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">仪表盘</h1>
        <div className="flex gap-2">
          <Link href="/admin/videos"><Button variant="secondary">新建分组</Button></Link>
          <Link href="/admin/votes"><Button>新建投票</Button></Link>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-sm text-ink-500">{s.label}</div>
            <div className="text-3xl font-bold mt-2 num">{s.value}</div>
            <div className="text-xs text-ink-300 mt-1">{s.sub}</div>
          </Card>
        ))}
      </div>

      {data.health.some((h) => h.level !== "ok") && (
        <Card className="p-4 mb-8 border-l-4 border-l-amber-400">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {data.health.map((h) => (
              <div key={h.key} className="flex items-start gap-2 text-sm min-w-56">
                <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${HEALTH_STYLE[h.level].dot}`} />
                <div>
                  <span className={`font-medium ${HEALTH_STYLE[h.level].text}`}>{h.label}</span>
                  <p className="text-xs text-ink-300 mt-0.5">{h.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-semibold mb-4">最近视频分组</h2>
          {data.recentGroups.length === 0 && <p className="text-sm text-ink-300">还没有分组</p>}
          <div className="space-y-2">
            {data.recentGroups.map((g) => (
              <Link key={g.id} href={`/admin/videos/${g.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-ink-50">
                <span className="text-sm font-medium">{g.name}</span>
                <span className="flex items-center gap-2 text-xs text-ink-300">
                  {g.videoCount} 视频
                  <Badge tone={g.status === 1 ? "green" : "gray"}>{g.status === 1 ? "开放" : "暂停"}</Badge>
                </span>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold mb-4">最近投票</h2>
          {data.recentVotes.length === 0 && <p className="text-sm text-ink-300">还没有投票</p>}
          <div className="space-y-2">
            {data.recentVotes.map((v) => (
              <Link key={v.id} href={`/admin/votes/${v.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-ink-50">
                <span className="text-sm font-medium">{v.name}</span>
                <span className="flex items-center gap-2 text-xs text-ink-300">
                  {v.roundCount} 轮次
                  <Badge tone={v.status === "active" ? "green" : "gray"}>{{ draft: "草稿", active: "进行中", finished: "已结束", archived: "已归档" }[v.status]}</Badge>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
