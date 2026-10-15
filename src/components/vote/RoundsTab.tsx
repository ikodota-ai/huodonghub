"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";
import { api } from "@/lib/client";
import { Button, Card, Badge, Field, Input, Toggle, Modal } from "@/components/ui";
import { VoteDetail, RoundItem, ROUND_STATUS } from "./types";

interface GroupDraft {
  enabled: boolean;
  name: string;
  kind: "score" | "vote";
  weight: number;
  maxScore: number;
  maxVotes: number;
  allowRepeat: boolean;
  restricted: boolean;
  needBind?: boolean;
  id?: string;
}

const PRESETS: { key: string; label: string; draft: Omit<GroupDraft, "enabled"> }[] = [
  { key: "expert", label: "专家评审", draft: { name: "专家评审", kind: "score", weight: 60, maxScore: 100, maxVotes: 3, allowRepeat: false, restricted: true } },
  { key: "public", label: "大众评审", draft: { name: "大众评审", kind: "score", weight: 20, maxScore: 100, maxVotes: 3, allowRepeat: false, restricted: true, needBind: true } },
  { key: "audience", label: "观众评审", draft: { name: "观众评审", kind: "vote", weight: 20, maxScore: 100, maxVotes: 3, allowRepeat: false, restricted: false } },
];

export function RoundsTab({ vote, reload }: { vote: VoteDetail; reload: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(vote.rounds[0]?.id ?? null);
  const selected = vote.rounds.find((r) => r.id === selectedId) ?? vote.rounds[0];

  async function addRound() {
    const name = prompt("轮次名称", `第${vote.rounds.length + 1}轮`);
    if (!name) return;
    const res = await api<{ id: string }>("/api/rounds", { method: "POST", body: JSON.stringify({ voteId: vote.id, name }) });
    await reload();
    setSelectedId(res.id);
  }

  async function setStatus(r: RoundItem, status: string) {
    await api(`/api/rounds/${r.id}`, { method: "PUT", body: JSON.stringify({ status }) });
    reload();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
      <Card className="p-3 h-fit">
        <div className="space-y-1">
          {vote.rounds.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between ${selected?.id === r.id ? "bg-brand-50 text-brand font-medium" : "hover:bg-ink-50"}`}
            >
              <span>{r.seq}. {r.name}</span>
              <Badge tone={ROUND_STATUS[r.status]?.tone}>{ROUND_STATUS[r.status]?.label}</Badge>
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="w-full mt-3" onClick={addRound}>+ 新增轮次</Button>
        <p className="text-xs text-ink-300 mt-2 px-1">新轮次自动复制上轮群体与参赛名单</p>
      </Card>
      {selected && <RoundEditor key={selected.id} vote={vote} round={selected} reload={reload} onStatus={setStatus} />}
    </div>
  );
}

function RoundEditor({ vote, round, reload, onStatus }: {
  vote: VoteDetail; round: RoundItem; reload: () => Promise<void> | void;
  onStatus: (r: RoundItem, s: string) => void;
}) {
  const [name, setName] = useState(round.name);
  const [groups, setGroups] = useState<GroupDraft[]>(() => {
    const byName = new Map(round.groups.map((g) => [g.name, g]));
    const drafts: GroupDraft[] = PRESETS.map((p) => {
      const existing = byName.get(p.draft.name);
      if (existing) {
        return {
          enabled: true, id: existing.id, name: existing.name, kind: existing.kind,
          weight: existing.weight, maxScore: existing.maxScore, maxVotes: existing.maxVotes,
          allowRepeat: existing.allowRepeat === 1, restricted: existing.restricted === 1,
        };
      }
      return { enabled: false, ...p.draft };
    });
    for (const g of round.groups) {
      if (!PRESETS.some((p) => p.draft.name === g.name)) {
        drafts.push({
          enabled: true, id: g.id, name: g.name, kind: g.kind, weight: g.weight,
          maxScore: g.maxScore, maxVotes: g.maxVotes, allowRepeat: g.allowRepeat === 1, restricted: g.restricted === 1,
        });
      }
    }
    return drafts;
  });
  const [contestantIds, setContestantIds] = useState<Set<string>>(new Set(round.contestantIds));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [audienceShowResult, setAudienceShowResult] = useState(round.audienceShowResult === 1);
  const [confirmDel, setConfirmDel] = useState(false);

  const totalWeight = groups.filter((g) => g.enabled).reduce((s, g) => s + (Number(g.weight) || 0), 0);
  const audienceUrl = typeof window !== "undefined" ? `${location.origin}/vote/${round.code}` : "";
  const screenUrl = typeof window !== "undefined" ? `${location.origin}/screen/${round.id}` : "";

  function patchGroup(idx: number, patch: Partial<GroupDraft>) {
    setGroups((gs) => gs.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }

  async function save() {
    if (totalWeight !== 100) { setMsg("权重合计必须等于 100%"); return; }
    setSaving(true); setMsg("");
    try {
      await api(`/api/rounds/${round.id}`, { method: "PUT", body: JSON.stringify({ name, audienceShowResult: audienceShowResult ? 1 : 0 }) });
      for (const [idx, g] of groups.entries()) {
        const payload = {
          name: g.name, kind: g.kind, weight: Number(g.weight) || 0,
          maxScore: g.maxScore, maxVotes: g.maxVotes,
          allowRepeat: g.allowRepeat ? 1 : 0, restricted: g.restricted ? 1 : 0,
        };
        if (g.enabled && g.id) {
          // 按界面显示顺序回写 sort，修复历史遗留的群体排序错乱（专家评审→大众评审→观众评审→自定义）
          await api(`/api/vote-groups/${g.id}`, { method: "PUT", body: JSON.stringify({ ...payload, sort: idx + 1 }) });
        } else if (g.enabled && !g.id) {
          const res = await api<{ id: string }>("/api/vote-groups", { method: "POST", body: JSON.stringify({ ...payload, roundId: round.id }) });
          await api(`/api/vote-groups/${res.id}`, { method: "PUT", body: JSON.stringify({ sort: idx + 1 }) });
        } else if (!g.enabled && g.id) {
          await api(`/api/vote-groups/${g.id}`, { method: "DELETE" });
        }
      }
      await api(`/api/rounds/${round.id}/contestants`, { method: "PUT", body: JSON.stringify({ contestantIds: Array.from(contestantIds) }) });
      setMsg("已保存 ✓");
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">轮次设置</h3>
          <div className="flex items-center gap-2">
            {round.status !== "active" ? (
              <Button size="sm" onClick={() => onStatus(round, "active")}>开始投票</Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => onStatus(round, "paused")}>暂停</Button>
            )}
            {round.status !== "finished" && <Button size="sm" variant="secondary" onClick={() => onStatus(round, "finished")}>结束本轮</Button>}
            <Button size="sm" variant="ghost" className="hover:text-red-500" onClick={() => setConfirmDel(true)}>删除轮次</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="轮次名称"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="flex items-end gap-4 pb-4">
            <label className="flex items-center gap-2 text-sm">
              <Toggle checked={audienceShowResult} onChange={setAudienceShowResult} /> 观众端开放结果查看
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-ink-500">观众入口：</span>
          <button className="text-brand hover:underline" onClick={() => copyText(audienceUrl)}>{audienceUrl}（复制）</button>
          <span className="text-ink-300">|</span>
          <span className="text-ink-500">大屏：</span>
          <button className="text-brand hover:underline" onClick={() => copyText(screenUrl)}>{screenUrl}（复制）</button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-1">评审群体配置</h3>
        <p className="text-xs text-ink-300 mb-4">勾选启用群体并设置权重，合计必须等于 100%。</p>
        <div className="space-y-3">
          {groups.map((g, idx) => (
            <div key={g.name + idx} className={`rounded-lg border p-4 transition ${g.enabled ? "border-brand/40 bg-brand-50/40" : "border-ink-100"}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Toggle checked={g.enabled} onChange={(v) => patchGroup(idx, { enabled: v })} />
                <span className="font-medium w-20">{g.name}</span>
                <select className="h-8 rounded border border-ink-200 text-sm bg-white" value={g.kind} disabled={!g.enabled}
                  onChange={(e) => patchGroup(idx, { kind: e.target.value as "score" | "vote" })}>
                  <option value="score">评分制</option>
                  <option value="vote">投票制</option>
                </select>
                <label className="text-sm text-ink-500 flex items-center gap-1">
                  权重 <Input type="number" className="w-20 h-8" value={g.weight} disabled={!g.enabled}
                    onChange={(e) => patchGroup(idx, { weight: Number(e.target.value) })} /> %
                </label>
                {g.kind === "score" && g.enabled && (
                  <label className="text-sm text-ink-500 flex items-center gap-1">
                    满分 <Input type="number" className="w-20 h-8" value={g.maxScore}
                      onChange={(e) => patchGroup(idx, { maxScore: Number(e.target.value) })} />
                  </label>
                )}
                {g.kind === "vote" && g.enabled && (
                  <>
                    <label className="text-sm text-ink-500 flex items-center gap-1">
                      每人 <Input type="number" className="w-16 h-8" value={g.maxVotes}
                        onChange={(e) => patchGroup(idx, { maxVotes: Number(e.target.value) })} /> 票
                    </label>
                    <label className="text-sm text-ink-500 flex items-center gap-1">
                      <input type="checkbox" checked={g.allowRepeat} onChange={(e) => patchGroup(idx, { allowRepeat: e.target.checked })} /> 允许重复投同一人
                    </label>
                  </>
                )}
                {g.enabled && (
                  <label className="text-sm text-ink-500 flex items-center gap-1">
                    <input type="checkbox" checked={g.restricted} onChange={(e) => patchGroup(idx, { restricted: e.target.checked })} /> 限定名单（口令进入）
                  </label>
                )}
              </div>
              {g.enabled && g.restricted && (
                <p className="text-xs text-ink-300 mt-2 ml-13 pl-12">在「评审」Tab 为此群体添加评审并生成专属二维码{g.name === "大众评审" ? "，评审首次扫码将绑定微信" : ""}</p>
              )}
            </div>
          ))}
        </div>
        <div className={`mt-4 rounded-lg p-3 flex items-center gap-3 ${totalWeight === 100 ? "bg-green-50" : "bg-red-50"}`}>
          <span className="text-sm font-medium shrink-0">权重合计 {totalWeight}% {totalWeight === 100 ? "✓" : "（须=100%）"}</span>
          <div className="flex-1 h-2.5 rounded-full bg-white overflow-hidden flex">
            {groups.filter((g) => g.enabled).map((g, i) => (
              <div key={i} style={{ width: `${g.weight}%` }} className={["bg-brand", "bg-blue-400", "bg-green-400", "bg-purple-400", "bg-red-400"][i % 5]} title={`${g.name} ${g.weight}%`} />
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-1">本轮参赛选手（{contestantIds.size}）</h3>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-ink-300">从选手库勾选（选手库在「选手」Tab 维护）</p>
          {vote.contestants.length > 0 && (
            <div className="flex gap-3">
              <button className="text-xs text-brand hover:underline" onClick={() => setContestantIds(new Set(vote.contestants.map((c) => c.id)))}>全选（{vote.contestants.length}）</button>
              <button className="text-xs text-ink-300 hover:text-ink-500" onClick={() => setContestantIds(new Set())}>清空</button>
            </div>
          )}
        </div>
        {contestantIds.size === 0 && vote.contestants.length > 0 && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">⚠ 未勾选选手——保存后投票页和大屏将没有任何选手</p>
        )}
        {vote.contestants.length === 0 ? (
          <p className="text-sm text-ink-300">选手库为空，请先在「选手」Tab 添加</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {vote.contestants.map((c) => (
              <label key={c.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${contestantIds.has(c.id) ? "border-brand/50 bg-brand-50/50" : "border-ink-100"}`}>
                <input type="checkbox" checked={contestantIds.has(c.id)} onChange={(e) => {
                  setContestantIds((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(c.id); else n.delete(c.id);
                    return n;
                  });
                }} />
                <span className="num text-ink-300">{c.number}</span>
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || totalWeight !== 100}>{saving ? "保存中…" : "保存轮次配置"}</Button>
        {msg && <span className={`text-sm ${msg.includes("✓") ? "text-green-600" : "text-red-500"}`}>{msg}</span>}
      </div>

      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="删除轮次">
        <p className="text-sm text-ink-700 mb-4">确定删除「{round.name}」？该轮的群体、评审、全部票数数据将一并删除。</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDel(false)}>取消</Button>
          <Button variant="danger" onClick={async () => {
            await api(`/api/rounds/${round.id}`, { method: "DELETE" });
            location.reload();
          }}>确认删除</Button>
        </div>
      </Modal>
    </div>
  );
}
