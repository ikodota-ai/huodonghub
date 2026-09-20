"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, fmtBytes, fmtDuration } from "@/lib/client";
import { Button, Card, Tabs, Badge, Modal, Field, Input, Textarea, Toggle, Skeleton, QrImage, download, Empty } from "@/components/ui";
import { Uploader, ImagePicker } from "@/components/Uploader";

interface Video {
  id: string; title: string; duration: number; fileSize: string; coverPath: string | null; filePath: string;
  source: string; sourceUrl: string | null; sort: number; status: number; processStatus: string;
  width: number; height: number;
}
interface GroupDetail {
  id: string; name: string; code: string; cover: string | null; description: string | null;
  password: string; status: number; videos: Video[];
}

const SOURCE_LABEL: Record<string, string> = { upload: "上传", import: "导入", rescue: "抢救" };

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [tab, setTab] = useState("videos");
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    setGroup(await api<GroupDetail>(`/api/groups/${id}`));
  }, [id]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => {
    const t = setInterval(() => {
      if (group?.videos.some((v) => v.processStatus === "processing" || v.processStatus === "pending")) load();
    }, 3000);
    return () => clearInterval(t);
  }, [group, load]);

  if (!group) return <Skeleton rows={4} />;

  const totalBytes = group.videos.reduce((s, v) => s + Number(v.fileSize), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-sm text-ink-300 mb-1"><Link href="/admin/videos" className="hover:text-brand">视频分组</Link> / {group.name}</div>
          <h1 className="text-xl font-bold flex items-center gap-3">
            {group.name}
            <Badge tone={group.status === 1 ? "green" : "gray"}>{group.status === 1 ? "开放中" : "已暂停"}</Badge>
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)}>分组设置</Button>
          <Button variant="secondary" onClick={() => setTab("share")}>分享</Button>
        </div>
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: "videos", label: `视频（${group.videos.length}）` },
        { key: "import", label: "链接导入" },
        { key: "rescue", label: "抢救" },
        { key: "share", label: "分享" },
      ]} />

      {tab === "videos" && <VideosTab group={group} reload={load} totalBytes={totalBytes} />}
      {tab === "import" && <ImportTab groupId={group.id} reload={load} />}
      {tab === "rescue" && <RescueTab groupId={group.id} reload={load} />}
      {tab === "share" && <ShareTab group={group} reload={load} />}

      <GroupEditModal group={group} open={editOpen} onClose={() => setEditOpen(false)} reload={load} />
    </div>
  );
}

function VideosTab({ group, reload, totalBytes }: { group: GroupDetail; reload: () => void; totalBytes: number }) {
  const [rename, setRename] = useState<Video | null>(null);
  const [title, setTitle] = useState("");
  const [playing, setPlaying] = useState<Video | null>(null);

  async function setStatus(v: Video, status: number) {
    await api(`/api/videos/${v.id}`, { method: "PUT", body: JSON.stringify({ status }) });
    reload();
  }
  async function del(v: Video) {
    if (!confirm(`确定删除「${v.title}」？文件将一并删除，不可恢复。`)) return;
    await api(`/api/videos/${v.id}`, { method: "DELETE" });
    reload();
  }
  async function retry(v: Video) {
    await api(`/api/videos/${v.id}/retry`, { method: "POST" });
    reload();
  }
  async function move(v: Video, dir: -1 | 1) {
    const sorted = [...group.videos].sort((a, b) => a.sort - b.sort);
    const idx = sorted.findIndex((x) => x.id === v.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    await api("/api/videos/reorder", { method: "POST", body: JSON.stringify({ orders: [{ id: v.id, sort: swap.sort }, { id: swap.id, sort: v.sort }] }) });
    reload();
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <Uploader groupId={group.id} onDone={reload} />
      </Card>
      <Card>
        <div className="px-5 py-3 border-b border-ink-100 text-sm text-ink-500">
          共 {group.videos.length} 个 · {fmtBytes(totalBytes)}
        </div>
        {group.videos.length === 0 ? (
          <Empty text="还没有视频，先上传一个" />
        ) : (
          <div className="divide-y divide-ink-100">
            {group.videos.map((v) => (
              <div key={v.id} className="flex items-center gap-4 px-5 py-3">
                <div className="w-24 h-14 rounded-lg bg-ink-100 overflow-hidden shrink-0 relative">
                  {v.coverPath && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/media/${v.coverPath}`} alt="" className="w-full h-full object-cover" />
                  )}
                  {v.processStatus === "processing" && <span className="absolute inset-0 bg-black/50 text-white text-xs flex items-center justify-center">处理中</span>}
                  {v.processStatus === "failed" && <span className="absolute inset-0 bg-red-500/70 text-white text-xs flex items-center justify-center">失败</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{v.title}</div>
                  <div className="text-xs text-ink-300 mt-0.5 space-x-2">
                    <span className="num">{fmtDuration(v.duration)}</span>
                    <span>{fmtBytes(v.fileSize)}</span>
                    {v.width > 0 && <span className="num">{v.width}×{v.height}</span>}
                    <Badge tone="blue">{SOURCE_LABEL[v.source]}</Badge>
                    {v.status === 0 && <Badge>已下架</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {v.processStatus === "ready" && <Button variant="ghost" size="sm" onClick={() => setPlaying(v)}>播放</Button>}
                  <Button variant="ghost" size="sm" onClick={() => move(v, -1)}>↑</Button>
                  <Button variant="ghost" size="sm" onClick={() => move(v, 1)}>↓</Button>
                  {v.processStatus === "failed" && <Button variant="ghost" size="sm" onClick={() => retry(v)}>重试</Button>}
                  <Button variant="ghost" size="sm" onClick={() => { setRename(v); setTitle(v.title); }}>改名</Button>
                  <Button variant="ghost" size="sm" onClick={() => setStatus(v, v.status === 1 ? 0 : 1)}>{v.status === 1 ? "下架" : "上架"}</Button>
                  <Button variant="ghost" size="sm" className="hover:text-red-500" onClick={() => del(v)}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!rename} onClose={() => setRename(null)} title="修改标题">
        <Field label="视频标题" required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRename(null)}>取消</Button>
          <Button disabled={!title} onClick={async () => {
            await api(`/api/videos/${rename!.id}`, { method: "PUT", body: JSON.stringify({ title }) });
            setRename(null);
            reload();
          }}>保存</Button>
        </div>
      </Modal>

      <Modal open={!!playing} onClose={() => setPlaying(null)} title={playing?.title ?? "播放预览"}>
        {playing && (
          <>
            <video
              key={playing.id}
              src={`/api/media/${playing.filePath}`}
              controls
              autoPlay
              playsInline
              className="w-full aspect-video bg-black rounded-lg"
            />
            <p className="text-xs text-ink-300 mt-2">
              {fmtDuration(playing.duration)} · {fmtBytes(playing.fileSize)}
              {playing.width > 0 && ` · ${playing.width}×${playing.height}`}
              {playing.status === 0 && " · 已下架（客户侧不可见）"}
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}

function ImportTab({ groupId, reload }: { groupId: string; reload: () => void }) {
  const [url, setUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [videos, setVideos] = useState<{ vid: string; title: string; urls: { quality: string; url: string }[] }[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);

  async function parse() {
    setParsing(true); setError(""); setVideos([]);
    try {
      const res = await api<{ videos: { vid: string; title: string; urls: { quality: string; url: string }[] }[]; error?: string }>(
        "/api/import/parse", { method: "POST", body: JSON.stringify({ url }) });
      if (res.error) setError(res.error);
      else {
        setVideos(res.videos);
        const sel: Record<string, string> = {};
        res.videos.forEach((v) => { sel[v.vid] = v.urls[0]?.url ?? ""; });
        setSelected(sel);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  async function runImport() {
    const items = videos.filter((v) => selected[v.vid]).map((v) => ({ title: v.title, url: selected[v.vid] }));
    if (items.length === 0) return;
    setImporting(true);
    try {
      await api("/api/import/run", { method: "POST", body: JSON.stringify({ groupId, sourceUrl: url, items }) });
      setVideos([]); setUrl("");
      reload();
      alert("导入成功，视频处理中");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="p-5">
      <p className="text-sm text-ink-500 mb-4">粘贴<b>公众号文章链接</b>（mp.weixin.qq.com），解析文中视频后一键导入。<span className="text-ink-300">不支持视频号链接。</span></p>
      <div className="flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mp.weixin.qq.com/s/..." />
        <Button onClick={parse} disabled={parsing || !url}>{parsing ? "解析中…" : "解析"}</Button>
      </div>
      {error && <p className="text-sm text-red-500 mt-3">{error}（可改用右侧「抢救」Tab 人工上传）</p>}
      {videos.length > 0 && (
        <div className="mt-5 space-y-3">
          {videos.map((v) => (
            <div key={v.vid} className="flex items-center gap-3 bg-ink-50 rounded-lg p-3">
              <input type="checkbox" checked={!!selected[v.vid]} onChange={(e) => setSelected((s) => { const n = { ...s }; if (e.target.checked) n[v.vid] = v.urls[0]?.url ?? ""; else delete n[v.vid]; return n; })} />
              <span className="flex-1 text-sm truncate">{v.title}</span>
              <select className="h-8 rounded border border-ink-200 text-sm bg-white" value={selected[v.vid] || ""} onChange={(e) => setSelected((s) => ({ ...s, [v.vid]: e.target.value }))}>
                {v.urls.map((u) => <option key={u.url} value={u.url}>{u.quality}</option>)}
              </select>
            </div>
          ))}
          <Button onClick={runImport} disabled={importing || Object.keys(selected).length === 0}>
            {importing ? "导入中…" : `导入 ${Object.keys(selected).length} 个视频`}
          </Button>
        </div>
      )}
    </Card>
  );
}

function RescueTab({ groupId, reload }: { groupId: string; reload: () => void }) {
  const [sourceUrl, setSourceUrl] = useState("");
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="p-5">
        <h3 className="font-semibold mb-3">视频号视频抢救指南</h3>
        <div className="text-sm text-ink-700 space-y-4">
          <div>
            <p className="font-medium text-brand mb-1">通道一 · 下载助手公众号（推荐）</p>
            <ol className="list-decimal list-inside space-y-1 text-ink-500">
              <li>微信里打开目标视频号视频，转发给「视频号下载助手」类公众号</li>
              <li>收到下载链接后<b className="text-ink-900">立即</b>下载 MP4（链接有时效）</li>
              <li>把 MP4 拖入右侧上传区</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-brand mb-1">通道二 · PC 微信 + 下载工具</p>
            <ol className="list-decimal list-inside space-y-1 text-ink-500">
              <li>电脑安装 wechatVideoDownload 类开源工具并注入 PC 微信</li>
              <li>PC 微信播放目标视频，工具捕获地址与解密密钥</li>
              <li>下载 MP4 后拖入右侧上传区</li>
            </ol>
          </div>
          <p className="text-xs text-ink-300">仅用于部门自有版权内容的抢救。日常视频请直接上传原始成片，画质更好。</p>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">上传抢救到的视频</h3>
        <Field label="原视频号链接（选填，便于溯源）">
          <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://weixin.qq.com/sph/..." />
        </Field>
        <Uploader groupId={groupId} source="rescue" sourceUrl={sourceUrl || undefined} onDone={reload} />
      </Card>
    </div>
  );
}

function ShareTab({ group, reload }: { group: GroupDetail; reload: () => void }) {
  const url = typeof window !== "undefined" ? `${location.origin}/v/${group.code}` : "";
  async function toggle(status: number) {
    await api(`/api/groups/${group.id}`, { method: "PUT", body: JSON.stringify({ status }) });
    reload();
  }
  return (
    <Card className="p-5">
      <div className="flex flex-col md:flex-row gap-8 items-start">
        <div className="text-center">
          <QrImage text={url} size={200} />
          <p className="text-xs text-ink-300 mt-2">客户扫码观看</p>
        </div>
        <div className="flex-1">
          <Field label="合集链接"><Input readOnly value={url} onFocus={(e) => e.target.select()} /></Field>
          <div className="flex flex-wrap gap-2 mb-5">
            <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(url)}>复制链接</Button>
            <Button variant="secondary" size="sm" onClick={() => import("qrcode").then((Q) => Q.toDataURL(url, { width: 800, margin: 1 })).then((u) => download(`${group.name}-二维码.png`, u))}>下载二维码</Button>
            <Button variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(`【${group.name}】共 ${group.videos.length} 个视频，点击观看：${url}`)}>复制转发文案</Button>
          </div>
          <div className="flex items-center gap-3 py-3 border-t border-ink-100">
            <span className="text-sm text-ink-700">分组开放</span>
            <Toggle checked={group.status === 1} onChange={(v) => toggle(v ? 1 : 0)} />
            <span className="text-xs text-ink-300">暂停后客户立即无法观看（不消耗带宽）</span>
          </div>
          <div className="text-sm text-ink-500">
            访问密码：<b className="text-ink-900">{group.password || "未设置"}</b>
            <span className="text-xs text-ink-300 ml-2">在「分组设置」中修改</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function GroupEditModal({ group, open, onClose, reload }: { group: GroupDetail; open: boolean; onClose: () => void; reload: () => void }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || "");
  const [password, setPassword] = useState(group.password);
  const [cover, setCover] = useState(group.cover || "");
  useEffect(() => {
    setName(group.name); setDescription(group.description || ""); setPassword(group.password); setCover(group.cover || "");
  }, [group]);
  return (
    <Modal open={open} onClose={onClose} title="分组设置">
      <Field label="分组名称" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="描述"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="封面 Banner" hint="客户侧合集页顶部横幅；留空则取第一个视频的截图">
        <ImagePicker value={cover} onChange={(p) => setCover(p)} />
        {cover && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setCover("")}>恢复默认（取视频截图）</Button>}
      </Field>
      <Field label="访问密码" hint="留空表示不设密码"><Input value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <div className="flex justify-between">
        <Button variant="danger" onClick={async () => {
          if (!confirm(`确定删除分组「${group.name}」？组内全部视频与文件将一并删除！`)) return;
          await api(`/api/groups/${group.id}`, { method: "DELETE" });
          location.href = "/admin/videos";
        }}>删除分组</Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={async () => {
            await api(`/api/groups/${group.id}`, { method: "PUT", body: JSON.stringify({ name, description, password: password || null, cover: cover || null }) });
            onClose();
            reload();
          }}>保存</Button>
        </div>
      </div>
    </Modal>
  );
}
