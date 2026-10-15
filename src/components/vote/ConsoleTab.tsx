"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { api } from "@/lib/client";
import { Button, Card, Badge, Toggle, QrImage } from "@/components/ui";
import { VoteDetail, ROUND_STATUS } from "./types";

export function ConsoleTab({ vote, reload }: { vote: VoteDetail; reload: () => void }) {
  const [roundId, setRoundId] = useState<string | null>(vote.rounds[0]?.id ?? null);
  const round = vote.rounds.find((r) => r.id === roundId) ?? vote.rounds[0];
  const [countdownMin, setCountdownMin] = useState("5");
  const [live, setLive] = useState<{
    participation: { groupId: string; name: string; kind: string; mode: "roster" | "open"; done: number; total: number }[];
    topIps: { ip: string; count: number }[];
    currentBatch: number; batches: number[];
  } | null>(null);

  useEffect(() => {
    if (round && !vote.rounds.some((r) => r.id === roundId)) setRoundId(round.id);
  }, [vote, round, roundId]);

  // 控制台实时数据：参与情况 + IP 分布，跟随 SSE 刷新
  useEffect(() => {
    if (!round) return;
    let dead = false;
    async function fetchLive() {
      try {
        const res = await api<{ participation: never[]; topIps: never[]; currentBatch: number; batches: number[] }>(`/api/console/${round.id}`);
        if (!dead) setLive(res);
      } catch {}
    }
    fetchLive();
    const es = new EventSource(`/api/screen/${round.id}/stream`);
    es.addEventListener("update", () => fetchLive());
    return () => { dead = true; es.close(); };
  }, [round]);

  if (!round) return <Card className="p-5 text-sm text-ink-300">还没有轮次</Card>;

  async function action(payload: Record<string, unknown>) {
    await api(`/api/console/${round.id}`, { method: "POST", body: JSON.stringify(payload) });
    reload();
  }

  const screenUrl = typeof window !== "undefined" ? `${location.origin}/screen/${round.id}` : "";
  const audienceUrl = typeof window !== "undefined" ? `${location.origin}/vote/${round.code}` : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-5">
          <select className="h-9 px-3 rounded-lg border border-ink-200 text-sm bg-white" value={round.id} onChange={(e) => setRoundId(e.target.value)}>
            {vote.rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <Badge tone={ROUND_STATUS[round.status]?.tone}>{ROUND_STATUS[round.status]?.label}</Badge>
        </div>

        {round.contestantIds.length === 0 && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-4">⚠ 本轮未关联选手——投票页与大屏将为空，请先到「轮次」勾选选手</p>
        )}

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {round.status !== "active" ? (
              <Button onClick={() => action({ action: "status", status: "active" })}>▶ 开始投票</Button>
            ) : (
              <Button variant="secondary" onClick={() => action({ action: "status", status: "paused" })}>⏸ 暂停投票</Button>
            )}
            <Button variant="secondary" disabled={round.status === "finished"} onClick={() => action({ action: "status", status: "finished" })}>⏹ 结束本轮</Button>
            <span title={
              round.status === "active" ? "投票进行中不可清空，请先暂停本轮"
              : round.status === "finished" ? "已结束轮次为结果存档，不可清空；如需重投请新建轮次"
              : "清空本轮全部评分与投票数据（彩排后重置）"
            }>
              <Button variant="ghost" className="hover:text-red-500" disabled={round.status === "active" || round.status === "finished"} onClick={async () => {
                if (!confirm(`清空「${round.name}」的全部评分与投票数据？\n（保留轮次配置、选手名单与评审绑定，用于彩排后重置）`)) return;
                if (!confirm("再次确认：清空后不可恢复，确定继续？")) return;
                try {
                  await action({ action: "resetData" });
                  alert("已清空本轮数据");
                } catch (e) {
                  alert((e as Error).message);
                }
              }}>清空数据</Button>
            </span>
          </div>

          {live && live.batches.length > 0 && (
            <div className="border-t border-ink-100 pt-4">
              <p className="text-sm font-medium mb-2">当前批次（共 {live.batches.length} 批）</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" disabled={live.currentBatch <= 1}
                  onClick={() => action({ action: "batch", currentBatch: Math.max(1, live.currentBatch - 1) })}>← 上一批</Button>
                <select
                  className="h-9 px-3 rounded-lg border border-ink-200 text-sm bg-white"
                  value={live.currentBatch}
                  onChange={(e) => action({ action: "batch", currentBatch: Number(e.target.value) })}
                >
                  <option value={0}>全部开放</option>
                  {live.batches.map((b) => <option key={b} value={b}>第 {b} 批</option>)}
                </select>
                <Button size="sm" variant="secondary" disabled={live.currentBatch >= live.batches[live.batches.length - 1]}
                  onClick={() => action({ action: "batch", currentBatch: live.currentBatch + 1 })}>下一批 →</Button>
              </div>
              <p className="text-xs text-ink-300 mt-2">
                {live.currentBatch === 0
                  ? "当前为全部开放：所有批次选手都可被评分/投票。正式比拼建议切换到具体批次。"
                  : `现在为第 ${live.currentBatch} 批：评委页/观众页/大屏只针对该批选手，切换立即生效。`}
              </p>
            </div>
          )}

          {live && (
            <div className="border-t border-ink-100 pt-4">
              <p className="text-sm font-medium mb-2">实时参与</p>
              <div className="flex flex-wrap gap-2">
                {live.participation.map((p) => {
                  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                  return (
                    <div key={p.groupId} className="bg-ink-50 rounded-lg px-3 py-2 text-xs">
                      <span className="text-ink-500">{p.name}</span>
                      {p.mode === "roster" ? (
                        <>
                          <span className="num font-semibold text-ink-900 ml-2">{p.done}/{p.total}</span>
                          <span className={`num ml-1 ${pct === 100 ? "text-green-600" : "text-ink-300"}`}>({pct}%)</span>
                        </>
                      ) : (
                        <span className="num font-semibold text-ink-900 ml-2">参与 {p.done} 人 · {p.total} 票</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {live.topIps.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-ink-300 cursor-pointer hover:text-ink-500">观众投票 IP 分布（Top{live.topIps.length}，识别刷票）</summary>
                  <div className="mt-2 space-y-1">
                    {live.topIps.map((r) => (
                      <div key={r.ip} className="flex items-center gap-2 text-xs">
                        <span className="num text-ink-500 w-32 truncate">{r.ip}</span>
                        <div className="flex-1 h-2.5 bg-ink-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${r.count > 50 ? "bg-red-400" : "bg-brand-300"}`} style={{ width: `${Math.min(100, (r.count / Math.max(1, live.topIps[0].count)) * 100)}%` }} />
                        </div>
                        <span className="num text-ink-500 w-10 text-right">{r.count}票</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          <div className="border-t border-ink-100 pt-4">
            <p className="text-sm font-medium mb-3">大屏显示内容</p>
            <div className="space-y-2">
              {[{ id: null as string | null, name: "总分" }, ...round.groups.map((g) => ({ id: g.id as string | null, name: g.name }))].map((opt) => (
                <label key={opt.id ?? "total"} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="screenGroup"
                    checked={(round.screenGroupId ?? null) === opt.id}
                    onChange={() => action({ action: "screen", screenGroupId: opt.id })}
                  />
                  {opt.name}
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-ink-100 pt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Toggle checked={round.screenShowResult === 1} onChange={(v) => action({ action: "screen", screenShowResult: v ? 1 : 0 })} />
              显示结果数值
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Toggle checked={round.screenShowPart === 1} onChange={(v) => action({ action: "screen", screenShowPart: v ? 1 : 0 })} />
              显示参与率（大屏快捷键 P）
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Toggle checked={round.screenQrMode === 1} onChange={(v) => action({ action: "screen", screenQrMode: v ? 1 : 0 })} />
              二维码模式（隐藏图表，引导扫码）
            </label>
            <label className="flex items-center gap-2 text-sm">
              每屏显示
              <input
                type="number" min={0} max={50}
                key={round.screenPageSize}
                defaultValue={round.screenPageSize}
                className="w-16 h-8 px-2 rounded-lg border border-ink-200 text-sm num"
                onBlur={(e) => {
                  const v = Math.max(0, Math.min(50, parseInt(e.target.value || "0", 10) || 0));
                  if (v !== round.screenPageSize) action({ action: "screen", screenPageSize: v });
                }}
              />
              位选手<span className="text-ink-300">（0 = 按大屏宽度自动；大屏用 PgUp/PgDn 翻页，支持翻页笔）</span>
            </label>
            <div className="flex items-center gap-2 text-sm">
              投票倒计时
              <input className="w-20 h-8 px-2 rounded-lg border border-ink-200 text-sm" value={countdownMin} onChange={(e) => setCountdownMin(e.target.value.replace(/[^\d]/g, ""))} />
              分钟
              <Button size="sm" variant="secondary" onClick={() => action({ action: "countdown", seconds: Number(countdownMin || "0") * 60 })}>启动</Button>
              <Button size="sm" variant="ghost" onClick={() => action({ action: "countdown", seconds: 0 })}>清除</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <p className="text-sm font-medium mb-3">大屏与观众入口</p>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" onClick={() => window.open(screenUrl, "_blank")}>打开大屏页</Button>
            <Button size="sm" variant="secondary" onClick={() => copyText(screenUrl)}>复制大屏链接</Button>
          </div>
          <div className="text-center bg-ink-50 rounded-xl p-5">
            <div className="inline-block"><QrImage text={audienceUrl} size={180} /></div>
            <p className="text-xs text-ink-300 mt-2">观众扫码入口</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => copyText(audienceUrl)}>复制观众链接</Button>
          </div>
          <MiniPreview roundId={round.id} />
        </div>
      </Card>
    </div>
  );
}

function MiniPreview({ roundId }: { roundId: string }) {
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<{ results: { name: string; number: string; total: number }[] } | null>(null);

  useEffect(() => {
    let dead = false;
    async function fetchState() {
      try {
        const res = await fetch(`/api/screen/${roundId}/state`).then((r) => r.json());
        if (!dead && res.ok) setData(res.data);
      } catch {}
    }
    fetchState();
    const es = new EventSource(`/api/screen/${roundId}/stream`);
    es.addEventListener("update", () => setTick((t) => t + 1));
    return () => { dead = true; es.close(); };
  }, [roundId]);

  useEffect(() => {
    if (tick === 0) return;
    fetch(`/api/screen/${roundId}/state`).then((r) => r.json()).then((res) => res.ok && setData(res.data)).catch(() => {});
  }, [tick, roundId]);

  if (!data) return null;
  const top = [...data.results].slice(0, 8);
  const max = Math.max(1, ...top.map((r) => r.total));

  return (
    <div className="border border-ink-100 rounded-xl p-4">
      <p className="text-xs text-ink-300 mb-2 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> 实时预览（总分 Top8）
      </p>
      <div className="space-y-1.5">
        {top.map((r) => (
          <div key={r.number + r.name} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-ink-500">{r.number} {r.name}</span>
            <div className="flex-1 h-3 bg-ink-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${(r.total / max) * 100}%` }} />
            </div>
            <span className="num w-12 text-right">{r.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
