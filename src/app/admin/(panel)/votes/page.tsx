"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Card, Modal, Field, Input, Textarea, Badge, Empty, Skeleton } from "@/components/ui";

interface Vote {
  id: string; name: string; cover: string | null; status: string;
  roundCount: number; contestantCount: number; wxMode: "openid" | "global" | "fingerprint"; updatedAt: string;
}

const WX_MODE: Record<Vote["wxMode"], string> = {
  openid: "服务号：本投票自定义（openid 模式）",
  global: "服务号：跟随全局默认（openid 模式）",
  fingerprint: "未配置服务号（指纹模式）",
};

const STATUS: Record<string, { label: string; tone: "gray" | "green" | "red" | "orange" }> = {
  draft: { label: "草稿", tone: "gray" },
  active: { label: "进行中", tone: "green" },
  finished: { label: "已结束", tone: "orange" },
  archived: { label: "已归档", tone: "gray" },
};

export default function VotesPage() {
  const [votes, setVotes] = useState<Vote[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [wxAppid, setWxAppid] = useState("");
  const [wxSecret, setWxSecret] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setVotes(await api<Vote[]>("/api/votes"));
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function create() {
    setError("");
    try {
      const res = await api<{ id: string }>("/api/votes", {
        method: "POST",
        body: JSON.stringify({ name, description, wxAppid, wxSecret }),
      });
      location.href = `/admin/votes/${res.id}`;
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!votes) return <Skeleton rows={3} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">投票评选</h1>
        <Button onClick={() => setShowCreate(true)}>+ 新建投票</Button>
      </div>
      {votes.length === 0 ? (
        <Card><Empty text="还没有投票，新建一个开始配置评选" action={<Button onClick={() => setShowCreate(true)}>新建投票</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {votes.map((v) => (
            <Link key={v.id} href={`/admin/votes/${v.id}`}>
              <Card className="p-5 hover:shadow-lift transition-shadow h-full">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold">{v.name}</h3>
                  <Badge tone={STATUS[v.status]?.tone}>{STATUS[v.status]?.label}</Badge>
                </div>
                <div className="text-xs text-ink-300 space-y-1">
                  <div>{v.roundCount} 个轮次 · {v.contestantCount} 位选手</div>
                  <div>{WX_MODE[v.wxMode] ?? ""}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="新建投票">
        <Field label="投票名称" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：第六届XX杯厨艺大赛" /></Field>
        <Field label="说明"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="bg-ink-50 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium mb-2">微信服务号配置（选填）</p>
          <p className="text-xs text-ink-300 mb-3">留空则跟随「系统设置 → 默认公众号」；填写则本投票单独使用。配置后观众投票与评审绑定走 openid 网页授权（更严谨）；均未配置时降级为设备指纹。需认证服务号并将本站域名加入网页授权域名。</p>
          <div className="space-y-3">
            <Input value={wxAppid} onChange={(e) => setWxAppid(e.target.value)} placeholder="AppID" />
            <Input value={wxSecret} onChange={(e) => setWxSecret(e.target.value)} placeholder="AppSecret" />
          </div>
        </div>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
          <Button onClick={create} disabled={!name}>创建</Button>
        </div>
      </Modal>
    </div>
  );
}
