"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button, Card, Modal, Field, Input, Textarea, Toggle, Badge, Empty, Skeleton, QrImage, download } from "@/components/ui";

interface Group {
  id: string; name: string; code: string; cover: string | null; fallbackCover: string | null;
  description: string | null; hasPassword: boolean; status: number; videoCount: number; updatedAt: string;
}

export default function VideosPage() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [share, setShare] = useState<Group | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setGroups(await api<Group[]>("/api/groups"));
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function create() {
    setError("");
    try {
      await api("/api/groups", { method: "POST", body: JSON.stringify({ name, description: desc, password }) });
      setShowCreate(false);
      setName(""); setDesc(""); setPassword("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleStatus(g: Group) {
    await api(`/api/groups/${g.id}`, { method: "PUT", body: JSON.stringify({ status: g.status === 1 ? 0 : 1 }) });
    load();
  }

  if (!groups) return <Skeleton rows={3} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">视频分组</h1>
        <Button onClick={() => setShowCreate(true)}>+ 新建分组</Button>
      </div>
      {groups.length === 0 ? (
        <Card><Empty text="还没有视频分组，新建一个开始传视频" action={<Button onClick={() => setShowCreate(true)}>新建分组</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((g) => {
            const cover = g.cover || g.fallbackCover;
            return (
              <Card key={g.id} className="overflow-hidden hover:shadow-lift transition-shadow">
                <Link href={`/admin/videos/${g.id}`} className="block">
                  <div className="aspect-video bg-ink-100 relative">
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/${cover}`} alt="" className="w-full h-full object-cover" />
                    )}
                    <span className="absolute top-2 right-2"><Badge tone={g.status === 1 ? "green" : "gray"}>{g.status === 1 ? "开放" : "暂停"}</Badge></span>
                  </div>
                </Link>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <Link href={`/admin/videos/${g.id}`} className="font-semibold hover:text-brand truncate">{g.name}</Link>
                    <span className="text-xs text-ink-300 shrink-0 ml-2">{g.videoCount} 视频</span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2 text-xs text-ink-300">
                      开放<Toggle checked={g.status === 1} onChange={() => toggleStatus(g)} />
                      {g.hasPassword && <Badge tone="orange">密码</Badge>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setShare(g)}>分享</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="新建视频分组">
        <Field label="分组名称" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：启动仪式、嘉宾采访" /></Field>
        <Field label="描述"><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Field label="访问密码" hint="选填，设置后客户需输入密码才能观看"><Input value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
          <Button onClick={create} disabled={!name}>创建</Button>
        </div>
      </Modal>

      <Modal open={!!share} onClose={() => setShare(null)} title={`分享「${share?.name}」`}>
        {share && (
          <div className="text-center">
            <div className="inline-block"><QrImage text={`${location.origin}/v/${share.code}`} size={220} /></div>
            <p className="text-sm text-ink-500 mt-4 break-all">{`${location.origin}/v/${share.code}`}</p>
            <div className="flex justify-center gap-2 mt-4">
              <Button variant="secondary" size="sm" onClick={() => copyText(`${location.origin}/v/${share.code}`)}>复制链接</Button>
              <Button variant="secondary" size="sm" onClick={() => import("qrcode").then((Q) => Q.toDataURL(`${location.origin}/v/${share.code}`, { width: 800, margin: 1 })).then((u) => download(`${share.name}-二维码.png`, u))}>下载二维码</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
