"use client";

import { useEffect, useState } from "react";
import { api, fmtBytes, fmtTime } from "@/lib/client";
import { Button, Card, Modal, Field, Input, Badge, Toggle, Skeleton } from "@/components/ui";

interface UserRow { id: string; username: string; name: string; role: string; status: number }
interface StorageCfg {
  driver: "local" | "oss";
  oss: { region: string; bucket: string; accessKeyId: string; accessKeySecret: string; prefix: string; publicDomain: string; private: boolean };
  localBytes: number;
}
interface WxCfg { appid: string; secret: string; name: string }

export default function SystemPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [storage, setStorage] = useState<StorageCfg | null>(null);
  const [backup, setBackup] = useState<{ last: string | null } | null>(null);
  const [wx, setWx] = useState<WxCfg | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    const [u, s, b, w] = await Promise.all([
      api<UserRow[]>("/api/settings/users"),
      api<StorageCfg>("/api/settings/storage"),
      api<{ last: string | null }>("/api/settings/backup"),
      api<WxCfg>("/api/settings/wx"),
    ]);
    setUsers(u); setStorage(s); setBackup(b); setWx(w);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  if (!users || !storage || !backup || !wx) return <Skeleton rows={4} />;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">系统设置</h1>

      <Card>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <h3 className="font-semibold">用户管理</h3>
          <Button size="sm" onClick={() => setAddOpen(true)}>+ 新增用户</Button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-300 border-b border-ink-100">
              <th className="px-5 py-3 font-medium">用户名</th>
              <th className="px-3 py-3 font-medium">姓名</th>
              <th className="px-3 py-3 font-medium">角色</th>
              <th className="px-3 py-3 font-medium">状态</th>
              <th className="px-3 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-3 font-medium">{u.username}</td>
                <td className="px-3 py-3">{u.name}</td>
                <td className="px-3 py-3"><Badge tone={u.role === "admin" ? "orange" : "gray"}>{u.role === "admin" ? "管理员" : "编辑"}</Badge></td>
                <td className="px-3 py-3">{u.status === 1 ? <Badge tone="green">启用</Badge> : <Badge>停用</Badge>}</td>
                <td className="px-3 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={async () => {
                    const pwd = prompt(`为「${u.name}」设置新密码（至少 6 位）`);
                    if (pwd) { await api(`/api/settings/users/${u.id}`, { method: "PUT", body: JSON.stringify({ password: pwd }) }); alert("已重置"); }
                  }}>重置密码</Button>
                  <Button variant="ghost" size="sm" onClick={async () => {
                    await api(`/api/settings/users/${u.id}`, { method: "PUT", body: JSON.stringify({ status: u.status === 1 ? 0 : 1 }) });
                    load();
                  }}>{u.status === 1 ? "停用" : "启用"}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <StorageCard storage={storage} reload={load} />

      <WxCard wx={wx} reload={load} />

      <Card className="p-5">
        <h3 className="font-semibold mb-2">数据备份</h3>
        <p className="text-sm text-ink-500 mb-3">最近备份：{backup.last ? fmtTime(backup.last) : "从未备份"}（数据库 mysqldump + 媒体目录打包，存于媒体目录 backups/ 下）</p>
        <Button variant="secondary" size="sm" onClick={async () => {
          try {
            const res = await api<{ at: string; files: string[] }>("/api/settings/backup", { method: "POST" });
            alert(`备份完成：\n${res.files.join("\n")}`);
            load();
          } catch (e) {
            alert(`备份失败：${(e as Error).message}（服务器需安装 mysqldump 与 tar）`);
          }
        }}>立即备份</Button>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="新增用户">
        <AddUserForm onDone={() => { setAddOpen(false); load(); }} />
      </Modal>
    </div>
  );
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("editor");
  const [error, setError] = useState("");
  return (
    <div>
      <Field label="用户名" required hint="字母数字下划线"><Input value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
      <Field label="姓名" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="初始密码" required hint="至少 6 位"><Input value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Field label="角色">
        <select className="w-full h-9 px-3 rounded-lg border border-ink-200 text-sm bg-white" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="editor">编辑（无系统设置权限）</option>
          <option value="admin">管理员</option>
        </select>
      </Field>
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={async () => {
          setError("");
          try {
            await api("/api/settings/users", { method: "POST", body: JSON.stringify({ username, name, password, role }) });
            onDone();
          } catch (e) { setError((e as Error).message); }
        }}>创建</Button>
      </div>
    </div>
  );
}

function WxCard({ wx, reload }: { wx: WxCfg; reload: () => void }) {
  const [appid, setAppid] = useState(wx.appid);
  const [secret, setSecret] = useState(wx.secret);
  const [name, setName] = useState(wx.name);
  const [msg, setMsg] = useState("");

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-2">默认公众号（全局）</h3>
      <p className="text-xs text-ink-300 mb-4">
        各投票「服务号配置」留空时统一使用此处配置；投票内填写则单独覆盖。
        需认证服务号，并把本站域名加入公众号后台「网页授权域名」。配置后观众投票与大众评审绑定使用 openid（一人一号，最严谨）。
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="公众号备注"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：台里服务号" /></Field>
        <Field label="AppID"><Input value={appid} onChange={(e) => setAppid(e.target.value)} placeholder="wx…" /></Field>
        <Field label="AppSecret" hint="已保存时显示 ***，留 *** 表示不修改"><Input value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <Button size="sm" onClick={async () => {
          setMsg("");
          await api("/api/settings/wx", { method: "PUT", body: JSON.stringify({ appid, secret, name }) });
          setMsg("已保存 ✓");
          reload();
        }}>保存</Button>
        {appid && (
          <Button variant="ghost" size="sm" onClick={async () => {
            if (!confirm("清空全局默认公众号？未单独配置的投票将回退为设备指纹模式。")) return;
            await api("/api/settings/wx", { method: "PUT", body: JSON.stringify({ appid: "", secret: "", name: "" }) });
            setAppid(""); setSecret(""); setName("");
            reload();
          }}>清空</Button>
        )}
        {msg && <span className="text-sm text-green-600">{msg}</span>}
      </div>
    </Card>
  );
}

function StorageCard({ storage, reload }: { storage: StorageCfg; reload: () => void }) {
  const [driver, setDriver] = useState(storage.driver);
  const [oss, setOss] = useState(storage.oss);
  const [msg, setMsg] = useState("");

  async function save() {
    setMsg("");
    await api("/api/settings/storage", { method: "PUT", body: JSON.stringify({ driver, oss }) });
    setMsg("已保存 ✓");
    reload();
  }

  async function test() {
    setMsg("测试中…");
    try {
      const res = await api<{ driver: string; message: string }>("/api/settings/storage/test", { method: "POST" });
      setMsg(`✓ ${res.message}`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">媒体存储</h3>
        <span className="text-xs text-ink-300">本地媒体目录：{fmtBytes(storage.localBytes)}</span>
      </div>
      <div className="flex items-center gap-6 mb-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={driver === "local"} onChange={() => setDriver("local")} /> 本地磁盘（默认）
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={driver === "oss"} onChange={() => setDriver("oss")} /> 阿里云 OSS
        </label>
      </div>
      {driver === "oss" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Field label="Region" hint="如 oss-cn-chengdu"><Input value={oss.region} onChange={(e) => setOss({ ...oss, region: e.target.value })} /></Field>
          <Field label="Bucket"><Input value={oss.bucket} onChange={(e) => setOss({ ...oss, bucket: e.target.value })} /></Field>
          <Field label="AccessKey ID"><Input value={oss.accessKeyId} onChange={(e) => setOss({ ...oss, accessKeyId: e.target.value })} /></Field>
          <Field label="AccessKey Secret" hint="已保存时显示 ***，留 *** 表示不修改"><Input value={oss.accessKeySecret} onChange={(e) => setOss({ ...oss, accessKeySecret: e.target.value })} /></Field>
          <Field label="对象前缀"><Input value={oss.prefix} onChange={(e) => setOss({ ...oss, prefix: e.target.value })} /></Field>
          <Field label="自定义域名" hint="选填，CDN/绑定域名，含 https://"><Input value={oss.publicDomain} onChange={(e) => setOss({ ...oss, publicDomain: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <Toggle checked={oss.private} onChange={(v) => setOss({ ...oss, private: v })} />
            私有桶（访问地址带时效签名，防盗链更强）
          </label>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save}>保存</Button>
        <Button size="sm" variant="secondary" onClick={test}>测试连接</Button>
        {msg && <span className="text-sm text-ink-500">{msg}</span>}
      </div>
      <p className="text-xs text-ink-300 mt-3">切换为 OSS 后，新上传的视频/封面将直接存入 OSS（本地只作中转）；已存在的本地文件不受影响仍可访问。</p>
    </Card>
  );
}
