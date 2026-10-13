"use client";

import { useCallback, useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, fmtBytes, fmtDuration } from "@/lib/client";
import { Button, Card, Tabs, Badge, Modal, Field, Input, Textarea, Toggle, Skeleton, QrImage, download, Empty } from "@/components/ui";
import { Uploader, ImagePicker } from "@/components/Uploader";
import { cnNumber, episodeTitle } from "@/lib/cn-number";

interface Video {
  id: string; title: string; duration: number; fileSize: string; coverPath: string | null; filePath: string;
  source: string; sourceUrl: string | null; sort: number; status: number; processStatus: string;
  width: number; height: number;
}
interface GroupDetail {
  id: string; name: string; code: string; cover: string | null; description: string | null;
  password: string; status: number; videos: Video[];
}

const SOURCE_LABEL: Record<string, string> = { upload: "上传", import: "导入", rescue: "抢救", external: "视频号" };

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
        { key: "external", label: "视频号链接" },
        { key: "import", label: "链接导入" },
        { key: "rescue", label: "抢救" },
        { key: "share", label: "分享" },
      ]} />

      {tab === "videos" && <VideosTab group={group} reload={load} totalBytes={totalBytes} />}
      {tab === "external" && <ExternalTab groupId={group.id} reload={load} />}
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
    if (!confirm(v.source === "external" ? `确定删除外链条目「${v.title}」？（视频号上的原视频不受影响）` : `确定删除「${v.title}」？文件将一并删除，不可恢复。`)) return;
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
        <div className="px-5 py-3 border-b border-ink-100 text-sm text-ink-500 flex items-center justify-between">
          <span>共 {group.videos.length} 个 · {fmtBytes(totalBytes)}</span>
          {group.videos.length > 0 && (
            <Button variant="ghost" size="sm" onClick={async () => {
              if (!confirm(`将按当前顺序把全部 ${group.videos.length} 个视频重命名为「第N集 标题」（已有的集数前缀会被替换，标题其余部分保留）。确定？`)) return;
              await api("/api/videos/renumber", { method: "POST", body: JSON.stringify({ groupId: group.id }) });
              reload();
            }}>按顺序编集数</Button>
          )}
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
                    {v.source === "external" ? (
                      <span className="truncate inline-block max-w-xs align-middle" title={v.sourceUrl ?? ""}>{v.sourceUrl}</span>
                    ) : (
                      <>
                        <span className="num">{fmtDuration(v.duration)}</span>
                        <span>{fmtBytes(v.fileSize)}</span>
                        {v.width > 0 && <span className="num">{v.width}×{v.height}</span>}
                      </>
                    )}
                    <Badge tone="blue">{SOURCE_LABEL[v.source]}</Badge>
                    {v.status === 0 && <Badge>已下架</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {v.processStatus === "ready" && v.source !== "external" && <Button variant="ghost" size="sm" onClick={() => setPlaying(v)}>播放</Button>}
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

function ExternalTab({ groupId, reload }: { groupId: string; reload: () => void }) {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchTitle, setBatchTitle] = useState("");
  const [startNo, setStartNo] = useState(1);

  async function submit() {
    setSaving(true);
    try {
      await api("/api/videos", { method: "POST", body: JSON.stringify({ groupId, items: [{ title, sourceUrl, coverPath: cover }] }) });
      setTitle(""); setSourceUrl(""); setCover(null);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function submitBatch() {
    const lines = batchText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { alert("请粘贴链接，每行一条"); return; }
    const items: { title: string; sourceUrl: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\S+)(?:\s+(.+))?$/);
      const url = m?.[1] ?? "";
      if (!url.includes("weixin.qq.com/sph/")) { alert(`第 ${i + 1} 行不是视频号链接`); return; }
      const t = (m?.[2] ?? batchTitle).trim();
      if (!t) { alert(`第 ${i + 1} 行缺少标题（可在上方填统一标题）`); return; }
      items.push({ title: episodeTitle(startNo + i, t), sourceUrl: url });
    }
    setSaving(true);
    try {
      await api<{ count: number }>("/api/videos", { method: "POST", body: JSON.stringify({ groupId, items }) });
      setBatchText(""); setBatchTitle(""); setStartNo(1);
      reload();
      alert(`已添加 ${items.length} 个条目`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className="p-5">
        <h3 className="font-semibold mb-3">视频号外链条目</h3>
        <div className="text-sm text-ink-500 space-y-3">
          <p>把已发布在视频号的视频以<b className="text-ink-900">链接形式</b>挂到本分组，客户在微信内打开合集页、点击条目即跳转到视频号播放——<b className="text-ink-900">不下载、不占服务器空间与带宽</b>。</p>
          <div>
            <p className="font-medium text-brand mb-1">适用场景</p>
            <p>客户明确在微信里查看（如公众号推文、微信群内分享合集链接）。</p>
          </div>
          <div>
            <p className="font-medium text-brand mb-1">三条边界（务必知悉）</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>仅微信内可播放；客户在电脑浏览器/钉钉打开会看到「请在微信中打开」提示</li>
              <li>视频号侧删除或设为私密后链接即失效，本系统无法感知</li>
              <li>分组的「暂停访问」只管得住合集页入口，管不到视频号上的内容本身</li>
            </ol>
          </div>
          <p className="text-xs text-ink-300">链接获取：视频号助手（channels.weixin.qq.com）→ 内容管理 → 视频 → 复制链接；或手机微信里分享视频 → 复制链接。</p>
        </div>
      </Card>
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">添加外链条目</h3>
          <div className="flex rounded-lg border border-ink-200 overflow-hidden text-sm">
            {(["single", "batch"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 ${mode === m ? "bg-brand text-white" : "bg-white text-ink-500"}`}>
                {m === "single" ? "单条" : "批量"}
              </button>
            ))}
          </div>
        </div>
        {mode === "single" ? (
          <>
            <Field label="条目标题" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="客户看到的标题" />
            </Field>
            <Field label="视频号链接" required>
              <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://weixin.qq.com/sph/..." />
            </Field>
            <Field label="封面图（选填，建议上传；视频号封面地址带时效签名不能直接存）">
              <ImagePicker value={cover} onChange={(path) => setCover(path)} label="上传封面" />
            </Field>
            <Button onClick={submit} disabled={saving || !title.trim() || !sourceUrl.includes("weixin.qq.com/sph/")}>
              {saving ? "保存中…" : "添加到分组"}
            </Button>
          </>
        ) : (
          <>
            <Field label="统一标题（选填；各行也可在链接后单独写标题）">
              <Input value={batchTitle} onChange={(e) => setBatchTitle(e.target.value)} placeholder="如：客户答谢会" />
            </Field>
            <Field label="起始集数（自动生成「第N集」前缀）">
              <Input type="number" min={1} max={99} value={startNo} onChange={(e) => setStartNo(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <Field label="链接列表（每行一条；可在链接后空格接该集标题）" required>
              <Textarea rows={7} value={batchText} onChange={(e) => setBatchText(e.target.value)}
                placeholder={"https://weixin.qq.com/sph/aaa 开幕式\nhttps://weixin.qq.com/sph/bbb 领导致辞\nhttps://weixin.qq.com/sph/ccc"} />
            </Field>
            <p className="text-xs text-ink-300 mb-3">将生成「第{cnNumber(startNo)}集 …」起连续编号的 {batchText.split("\n").filter((l) => l.trim()).length} 个条目；批量模式不含封面（集合页显示灰色占位图）。</p>
            <Button onClick={submitBatch} disabled={saving || !batchText.trim()}>
              {saving ? "保存中…" : "批量添加"}
            </Button>
          </>
        )}
      </Card>
    </div>
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
            <Button variant="secondary" size="sm" onClick={() => copyText(url)}>复制链接</Button>
            <Button variant="secondary" size="sm" onClick={() => import("qrcode").then((Q) => Q.toDataURL(url, { width: 800, margin: 1 })).then((u) => download(`${group.name}-二维码.png`, u))}>下载二维码</Button>
            <Button variant="secondary" size="sm" onClick={() => copyText(`【${group.name}】共 ${group.videos.length} 个视频，点击观看：${url}`)}>复制转发文案</Button>
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
