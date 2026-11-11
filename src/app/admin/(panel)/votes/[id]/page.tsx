"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Tabs, Badge, Skeleton, Modal, Field, Input, Textarea, Toggle } from "@/components/ui";
import { VoteDetail } from "@/components/vote/types";
import { RoundsTab } from "@/components/vote/RoundsTab";
import { ContestantsTab } from "@/components/vote/ContestantsTab";
import { VotersTab } from "@/components/vote/VotersTab";
import { ConsoleTab } from "@/components/vote/ConsoleTab";
import { ResultsTab } from "@/components/vote/ResultsTab";
import { ImagePicker } from "@/components/Uploader";
import { useDialogs } from "@/components/ui/dialogs";

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
              {{ draft: "彩排", active: "正式", finished: "已结束", archived: "已归档" }[vote.status]}
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
  const { confirm, toast, dialogNode } = useDialogs();
  const [name, setName] = useState(vote.name);
  const [description, setDescription] = useState(vote.description || "");
  const [cover, setCover] = useState(vote.cover || "");
  const [wxAppid, setWxAppid] = useState(vote.wxAppid);
  const [wxSecret, setWxSecret] = useState(vote.wxSecret);
  const [transitioning, setTransitioning] = useState(false);
  const [screenBgEnabled, setScreenBgEnabled] = useState(vote.screenBgEnabled);
  const [screenBgImage, setScreenBgImage] = useState(vote.screenBgImage || "");
  const [screenBgDim, setScreenBgDim] = useState(vote.screenBgDim);
  useEffect(() => {
    setName(vote.name); setDescription(vote.description || ""); setCover(vote.cover || "");
    setWxAppid(vote.wxAppid); setWxSecret(vote.wxSecret);
    setScreenBgEnabled(vote.screenBgEnabled); setScreenBgImage(vote.screenBgImage || ""); setScreenBgDim(vote.screenBgDim);
  }, [vote]);

  const next = {
    draft: { status: "active", action: "转为正式", confirmText: "确认转正式", message: "转为正式后不可退回彩排，也不能再清空数据。确认继续？", success: "已转为正式" },
    active: { status: "finished", action: "结束活动", confirmText: "确认结束", message: "结束活动后，观众和评委将不能继续提交。确认结束？", success: "活动已结束" },
    finished: { status: "archived", action: "归档活动", confirmText: "确认归档", message: "归档后仍可查看历史结果，但不能继续提交。确认归档？", success: "活动已归档" },
  }[vote.status];

  async function transition() {
    if (!next) return;
    if (!(await confirm(next.message, { title: next.action, confirmText: next.confirmText, danger: next.status !== "archived" }))) return;
    setTransitioning(true);
    try {
      await api(`/api/votes/${vote.id}`, { method: "PUT", body: JSON.stringify({ status: next.status }) });
      onClose();
      reload();
      toast(next.success);
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="投票设置">
      <Field label="投票名称" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="说明"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="主视觉封面"><ImagePicker value={cover} onChange={(p) => setCover(p)} /></Field>
      <div className="bg-ink-50 rounded-lg p-4 mb-4 space-y-3">
        <div>
          <p className="text-sm font-medium">大屏主视觉背景</p>
          <p className="text-xs text-ink-300 mt-1">独立于上方手机封面。建议按现场 LED 实际分辨率导出，超宽屏使用超宽素材；图片将居中铺满并暗化。</p>
        </div>
        <div className="flex items-center gap-3">
          <ImagePicker value={screenBgImage} onChange={(p) => setScreenBgImage(p)} label="上传 LED 背景图" />
          {screenBgImage && <Button variant="ghost" size="sm" className="hover:text-red-500" onClick={() => { setScreenBgImage(""); setScreenBgEnabled(false); }}>移除</Button>}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <Toggle checked={screenBgEnabled} disabled={!screenBgImage} onChange={setScreenBgEnabled} />
          启用主视觉背景（关闭时仅显示群体氛围色）
        </label>
        <label className="flex items-center gap-3 text-sm text-ink-500">
          <span className="shrink-0">暗化强度</span>
          <input type="range" min={60} max={90} value={screenBgDim} disabled={!screenBgImage} onChange={(e) => setScreenBgDim(Number(e.target.value))} className="flex-1 accent-brand" />
          <span className="num w-10 text-right">{screenBgDim}%</span>
        </label>
      </div>
      <div className="mb-4">
        <p className="block text-sm font-medium text-ink-700 mb-1.5">活动状态</p>
        <div className="flex items-center gap-3">
          <Badge tone={vote.status === "active" ? "green" : vote.status === "finished" ? "orange" : "gray"}>
            {{ draft: "彩排", active: "正式", finished: "已结束", archived: "已归档" }[vote.status]}
          </Badge>
          {next && <Button size="sm" variant={vote.status === "active" ? "danger" : "secondary"} disabled={transitioning} onClick={transition}>{next.action}</Button>}
        </div>
        <p className="text-xs text-ink-300 mt-1">状态仅可按彩排、正式、已结束、已归档顺序转换，不可退回。</p>
      </div>
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
          if (!(await confirm(`确定删除投票「${vote.name}」？全部轮次、选手、票数据将删除！`, { title: "删除投票", confirmText: "确认删除", danger: true }))) return;
          await api(`/api/votes/${vote.id}`, { method: "DELETE" });
          location.href = "/admin/votes";
        }}>删除投票</Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={async () => {
            await api(`/api/votes/${vote.id}`, {
              method: "PUT",
              body: JSON.stringify({ name, description, cover: cover || null, screenBgEnabled, screenBgImage: screenBgImage || null, screenBgDim, wxAppid: wxAppid || null, wxSecret: wxSecret || null }),
            });
            onClose();
            reload();
          }}>保存</Button>
        </div>
      </div>
      {dialogNode}
    </Modal>
  );
}
