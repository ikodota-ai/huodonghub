"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { api } from "@/lib/client";
import { Button, Card, Badge, Modal, Field, Empty, QrImage, Toggle } from "@/components/ui";
import { VoteDetail } from "./types";
import { useDialogs } from "@/components/ui/dialogs";

interface Voter {
  id: string; name: string; token: string; needBind: number;
  bound: boolean; boundAt: string | null; hasVoted: number; votedAt: string | null;
}

export function VotersTab({ vote }: { vote: VoteDetail }) {
  const { confirm, dialogNode } = useDialogs();
  const restrictedGroups = vote.rounds.flatMap((r) =>
    r.groups.filter((g) => g.restricted === 1).map((g) => ({ roundId: r.id, roundName: r.name, groupId: g.id, groupName: g.name }))
  );
  const [sel, setSel] = useState(0);
  const [voters, setVoters] = useState<Voter[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [names, setNames] = useState("");
  const [printMode, setPrintMode] = useState(false);
  const [recordsFor, setRecordsFor] = useState<Voter | null>(null);

  const group = restrictedGroups[sel];

  async function load() {
    if (!group) { setVoters([]); return; }
    setVoters(await api<Voter[]>(`/api/voters?groupId=${group.groupId}`));
  }
  useEffect(() => { load().catch(() => {}); }, [sel, vote]);

  async function add() {
    const list = names.split(/[\n,，、\s]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return;
    await api("/api/voters", { method: "POST", body: JSON.stringify({ groupId: group.groupId, names: list, needBind: 1 }) });
    setAddOpen(false); setNames("");
    load();
  }

  async function resetVoter(v: Voter) {
    if (!(await confirm(`重置「${v.name}」的绑定与提交状态？`, { confirmText: "重置", danger: true }))) return;
    await api(`/api/voters/${v.id}/reset`, { method: "POST" });
    load();
  }

  async function del(v: Voter) {
    if (!(await confirm(`删除评审「${v.name}」？`, { confirmText: "删除", danger: true }))) return;
    await api(`/api/voters/${v.id}`, { method: "DELETE" });
    load();
  }

  async function toggleBind(v: Voter) {
    await api(`/api/voters/${v.id}`, { method: "PUT", body: JSON.stringify({ needBind: v.needBind === 1 ? 0 : 1 }) });
    load();
  }

  if (restrictedGroups.length === 0) {
    return <Card><Empty text="当前投票没有限定名单群体。在轮次配置中勾选「限定名单」后，即可在此管理评审。" /></Card>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <select className="h-9 px-3 rounded-lg border border-ink-200 text-sm bg-white" value={sel} onChange={(e) => setSel(Number(e.target.value))}>
          {restrictedGroups.map((g, i) => (
            <option key={g.groupId} value={i}>{g.roundName} · {g.groupName}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPrintMode(true)} disabled={!voters?.length}>打印二维码</Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>+ 添加评审</Button>
        </div>
      </div>

      <Card>
        {!voters ? null : voters.length === 0 ? (
          <Empty text="该群体还没有评审，点击右上角添加" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-300 border-b border-ink-100">
                <th className="px-5 py-3 font-medium">姓名</th>
                <th className="px-3 py-3 font-medium">二维码</th>
                <th className="px-3 py-3 font-medium">微信绑定</th>
                <th className="px-3 py-3 font-medium">需绑定</th>
                <th className="px-3 py-3 font-medium">提交状态</th>
                <th className="px-3 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {voters.map((v) => (
                <tr key={v.id} className="hover:bg-ink-50/50">
                  <td className="px-5 py-3 font-medium">{v.name}</td>
                  <td className="px-3 py-3"><VoterQr name={v.name} token={v.token} /></td>
                  <td className="px-3 py-3">
                    {v.bound ? <Badge tone="green">已绑定</Badge> : <Badge>未绑定</Badge>}
                  </td>
                  <td className="px-3 py-3"><Toggle checked={v.needBind === 1} onChange={() => toggleBind(v)} /></td>
                  <td className="px-3 py-3">
                    {v.hasVoted === 1 ? <Badge tone="blue">已提交</Badge> : <Badge>未提交</Badge>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setRecordsFor(v)}>记录</Button>
                    <Button variant="ghost" size="sm" onClick={() => copyText(`${location.origin}/judge/${v.token}`)}>复制链接</Button>
                    <Button variant="ghost" size="sm" onClick={() => resetVoter(v)}>重置</Button>
                    <Button variant="ghost" size="sm" className="hover:text-red-500" onClick={() => del(v)}>删除</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="添加评审">
        <Field label="评审姓名" hint="每行一个姓名，或用逗号分隔，可一次添加多位" required>
          <textarea rows={5} className="w-full px-3 py-2 rounded-lg border border-ink-200 text-sm outline-none focus:border-brand" value={names} onChange={(e) => setNames(e.target.value)} placeholder={"王老师\n李老师\n赵老师"} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAddOpen(false)}>取消</Button>
          <Button onClick={add}>添加</Button>
        </div>
      </Modal>

      {printMode && voters && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="p-4 flex justify-between items-center print:hidden">
            <span className="text-sm text-ink-500">打印预览：{group.roundName} · {group.groupName}（{voters.length} 张）</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPrintMode(false)}>关闭</Button>
              <Button size="sm" onClick={() => window.print()}>打印</Button>
            </div>
          </div>
          <div className="print-area grid grid-cols-3 gap-4 p-6">
            {voters.map((v) => (
              <div key={v.id} className="border border-ink-200 rounded-xl p-4 text-center break-inside-avoid">
                <div className="font-bold mb-1">{v.name}</div>
                <div className="text-xs text-ink-300 mb-2">{vote.name} · {group.roundName} · {group.groupName}</div>
                <div className="flex justify-center"><QrImage text={`${location.origin}/judge/${v.token}`} size={180} /></div>
                <div className="text-xs text-ink-500 mt-2">微信扫码评分</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {recordsFor && <VoterRecordsModal voter={recordsFor} onClose={() => setRecordsFor(null)} />}
      {dialogNode}
    </div>
  );
}

function VoterQr({ name, token }: { name: string; token: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="text-brand text-xs hover:underline" onClick={() => setOpen(true)}>查看</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${name} 的评分二维码`}>
        <div className="text-center">
          <div className="inline-block"><QrImage text={`${location.origin}/judge/${token}`} size={220} /></div>
          <p className="text-xs text-ink-300 mt-3 break-all">{`${location.origin}/judge/${token}`}</p>
        </div>
      </Modal>
    </>
  );
}

interface VoterRecords {
  voter: { id: string; name: string; hasVoted: number };
  group: { id: string; name: string; kind: string; weight: number; roundName: string };
  entries: { contestantId: string; number: string; name: string; batch: number; score?: number | null; share?: number | null; picked?: boolean }[];
}

function VoterRecordsModal({ voter, onClose }: { voter: Voter; onClose: () => void }) {
  const [data, setData] = useState<VoterRecords | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<VoterRecords>(`/api/voters/${voter.id}/records`).then(setData).catch((e) => setError((e as Error).message));
  }, [voter.id]);
  const isScore = data?.group.kind === "score";
  return (
    <Modal open onClose={onClose} title={`${voter.name} 的${isScore ? "评分" : "投票"}记录`} width="max-w-xl">
      {error && <p className="text-sm text-red-500">{error}</p>}
      {!data && !error && <p className="text-sm text-ink-300 py-6 text-center">加载中…</p>}
      {data && (
        <>
          <p className="text-xs text-ink-500 mb-3 flex items-center gap-2">
            {data.group.roundName} · {data.group.name}（权重 {data.group.weight}%，{isScore ? "评分制" : "投票制"}）
            {data.voter.hasVoted === 1 ? <Badge tone="blue">已提交</Badge> : <Badge>未提交</Badge>}
          </p>
          {data.entries.length === 0 ? <Empty text="本轮还没有选手" /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-300 text-xs border-b border-ink-100">
                  <th className="py-2 pr-3 font-medium w-14">编号</th>
                  <th className="py-2 pr-3 font-medium">选手</th>
                  {isScore ? (
                    <>
                      <th className="py-2 px-2 font-medium text-right">打分</th>
                      <th className="py-2 pl-2 font-medium text-right">折算</th>
                    </>
                  ) : (
                    <th className="py-2 pl-2 font-medium text-right">是否勾选</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.entries.map((e) => (
                  <tr key={e.contestantId}>
                    <td className="py-2.5 pr-3 num text-ink-300">{e.number}</td>
                    <td className="py-2.5 pr-3">
                      {e.name}
                      {e.batch > 0 && <span className="ml-1 text-xs text-ink-300">第{e.batch}批</span>}
                    </td>
                    {isScore ? (
                      <>
                        <td className="py-2.5 px-2 text-right num font-medium">
                          {e.score != null ? `${e.score} 分` : <span className="text-ink-300">未评</span>}
                        </td>
                        <td className="py-2.5 pl-2 text-right num text-ink-500">{e.share != null ? e.share : "—"}</td>
                      </>
                    ) : (
                      <td className="py-2.5 pl-2 text-right">{e.picked ? <Badge tone="green">✓ 已选</Badge> : <span className="text-ink-300 text-xs">—</span>}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Modal>
  );
}
