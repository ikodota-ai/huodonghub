"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Tabs, Badge, Skeleton, Modal, Field, Input, Textarea } from "@/components/ui";
import { VoteDetail } from "@/components/vote/types";
import { RoundsTab } from "@/components/vote/RoundsTab";
import { ContestantsTab } from "@/components/vote/ContestantsTab";
import { VotersTab } from "@/components/vote/VotersTab";
import { ConsoleTab } from "@/components/vote/ConsoleTab";
import { ResultsTab } from "@/components/vote/ResultsTab";
import { ImagePicker } from "@/components/Uploader";

export default function VoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [vote, setVote] = useState<VoteDetail | null>(null);
  const [tab, setTab] = useState("rounds");
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    setVote(await api<VoteDetail>(`/api/votes/${id}`));
  }, [id]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  if (!vote) return <Skeleton rows={4} />;

  const activeRound = vote.rounds.find((r) => r.status === "active");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-sm text-ink-300 mb-1"><Link href="/admin/votes" className="hover:text-brand">投票评选</Link> / {vote.name}</div>
          <h1 className="text-xl font-bold flex items-center gap-3">
            {vote.name}
            <Badge tone={{ draft: "gray", active: "green", finished: "orange", archived: "gray" }[vote.status] as "gray" | "green" | "orange"}>
              {{ draft: "草稿", active: "进行中", finished: "已结束", archived: "已归档" }[vote.status]}
            </Badge>
            {vote.wxEffective
              ? <Badge tone="blue">openid 模式 · {vote.wxEffective.source === "global" ? "全局默认" : "自定义"}</Badge>
              : <Badge>指纹模式</Badge>}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)}>投票设置</Button>
          {activeRound && (
            <Button onClick={() => setTab("console")}>大屏控制台（{activeRound.name} 进行中）</Button>
          )}
        </div>
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: "rounds", label: `轮次（${vote.rounds.length}）` },
        { key: "contestants", label: `选手（${vote.contestants.length}）` },
        { key: "voters", label: "评审" },
        { key: "console", label: "大屏控制台" },
        { key: "results", label: "结果" },
      ]} />

      {tab === "rounds" && <RoundsTab vote={vote} reload={load} />}
      {tab === "contestants" && <ContestantsTab vote={vote} reload={load} />}
      {tab === "voters" && <VotersTab vote={vote} />}
      {tab === "console" && <ConsoleTab vote={vote} reload={load} />}
      {tab === "results" && <ResultsTab vote={vote} />}

      <VoteEditModal vote={vote} open={editOpen} onClose={() => setEditOpen(false)} reload={load} />
    </div>
  );
}

function VoteEditModal({ vote, open, onClose, reload }: { vote: VoteDetail; open: boolean; onClose: () => void; reload: () => void }) {
  const [name, setName] = useState(vote.name);
  const [description, setDescription] = useState(vote.description || "");
  const [cover, setCover] = useState(vote.cover || "");
  const [wxAppid, setWxAppid] = useState(vote.wxAppid);
  const [wxSecret, setWxSecret] = useState(vote.wxSecret);
  const [status, setStatus] = useState(vote.status);
  useEffect(() => {
    setName(vote.name); setDescription(vote.description || ""); setCover(vote.cover || "");
    setWxAppid(vote.wxAppid); setWxSecret(vote.wxSecret); setStatus(vote.status);
  }, [vote]);

  return (
    <Modal open={open} onClose={onClose} title="投票设置">
      <Field label="投票名称" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="说明"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="主视觉封面"><ImagePicker value={cover} onChange={(p) => setCover(p)} /></Field>
      <Field label="状态">
        <select className="w-full h-9 px-3 rounded-lg border border-ink-200 text-sm bg-white" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="draft">草稿</option>
          <option value="active">进行中</option>
          <option value="finished">已结束</option>
          <option value="archived">已归档</option>
        </select>
      </Field>
      <div className="bg-ink-50 rounded-lg p-4 mb-4">
        <p className="text-sm font-medium mb-2">微信服务号配置</p>
        <p className="text-xs text-ink-300 mb-3">
          当前生效：{vote.wxEffective ? vote.wxEffective.sourceName : "未配置（设备指纹模式）"}。
          留空跟随「系统设置 → 默认公众号」{vote.wxGlobalConfigured ? "（已配置）" : "（未配置）"}；填写则本投票单独使用。
        </p>
        <div className="space-y-3">
          <Input value={wxAppid} onChange={(e) => setWxAppid(e.target.value)} placeholder="AppID（留空跟随全局默认）" />
          <Input value={wxSecret} onChange={(e) => setWxSecret(e.target.value)} placeholder="AppSecret" />
        </div>
      </div>
      <div className="flex justify-between">
        <Button variant="danger" onClick={async () => {
          if (!confirm(`确定删除投票「${vote.name}」？全部轮次、选手、票数据将删除！`)) return;
          await api(`/api/votes/${vote.id}`, { method: "DELETE" });
          location.href = "/admin/votes";
        }}>删除投票</Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={async () => {
            await api(`/api/votes/${vote.id}`, {
              method: "PUT",
              body: JSON.stringify({ name, description, cover: cover || null, wxAppid: wxAppid || null, wxSecret: wxSecret || null, status }),
            });
            onClose();
            reload();
          }}>保存</Button>
        </div>
      </div>
    </Modal>
  );
}
