"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, contestantImg } from "@/lib/client";

interface ResultData {
  voteName: string;
  cover: string | null;
  roundName: string;
  status: string;
  batchMode: boolean;
  groups: { id: string; name: string; kind: string; weight: number }[];
  results: {
    rank: number; number: string; name: string; image: string | null;
    total: number; batch: number;
    groups: { groupId: string; name: string; kind: string; raw: number; contribution: number }[];
  }[];
}

const STATUS_TEXT: Record<string, string> = {
  pending: "投票未开始",
  active: "进行中 · 实时刷新",
  paused: "已暂停",
  finished: "已结束",
};

export default function AudienceResultPage() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<ResultData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<ResultData>(`/api/vote/${code}/result`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [code]);

  useEffect(() => { load(); }, [load]);
  // 进行中每 10 秒自动刷新；结束/未开始则静态展示
  useEffect(() => {
    if (!data || (data.status !== "active" && data.status !== "paused")) return;
    const t = setInterval(() => { load(); }, 10000);
    return () => clearInterval(t);
  }, [data, load]);

  if (error) {
    return (
      <div className="min-h-screen bg-ink-50 flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-ink-500">{error}</p>
        <a href={`/vote/${code}`} className="text-brand text-sm">← 返回投票</a>
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-screen bg-ink-50 flex items-center justify-center text-ink-300">加载中…</div>;
  }

  return (
    <div className="min-h-screen bg-ink-50 max-w-2xl mx-auto pb-10">
      {data.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.cover.startsWith("http") ? data.cover : `/api/media/${data.cover}`} alt="" className="w-full aspect-[16/7] object-cover" />
      )}
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10">
        <h1 className="font-bold leading-snug">{data.voteName}</h1>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm text-ink-500">{data.roundName} · 当前结果</p>
          <span className={`text-xs px-2 py-0.5 rounded-full ${data.status === "active" ? "bg-green-100 text-green-700" : "bg-ink-100 text-ink-500"}`}>
            {STATUS_TEXT[data.status] ?? data.status}
          </span>
        </div>
        <p className="text-xs text-ink-300 mt-2">
          {data.groups.map((g) => `${g.name} ${g.weight}%`).join(" · ")}
        </p>
      </div>

      <div className="p-4 space-y-2.5">
        {data.results.length === 0 && (
          <p className="text-center text-sm text-ink-300 py-10">本轮还没有选手</p>
        )}
        {data.results.map((r) => (
          <div key={r.number} className="bg-white rounded-card shadow-card p-3 flex items-center gap-3">
            <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold num ${
              r.rank === 1 ? "bg-amber-400 text-white"
              : r.rank === 2 ? "bg-ink-300 text-white"
              : r.rank === 3 ? "bg-orange-300 text-white"
              : "bg-ink-100 text-ink-500"
            }`}>{r.rank}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={contestantImg(r.image)} alt="" className="w-12 h-12 rounded-lg object-cover bg-ink-100 shrink-0" loading="lazy" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug truncate">
                <span className="num text-brand mr-1">{r.number}</span>{r.name}
                {data.batchMode && r.batch > 0 && <span className="ml-1.5 text-xs text-ink-300">第{r.batch}批</span>}
              </p>
              <p className="text-xs text-ink-300 mt-1 truncate">
                {r.groups.map((g) => `${g.name} ${g.contribution}`).join(" · ")}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-brand num leading-none">{r.total}</p>
              <p className="text-xs text-ink-300 mt-1">总分</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center pb-6">
        <a href={`/vote/${code}`} className="text-brand text-sm">← 返回投票</a>
      </p>
    </div>
  );
}
