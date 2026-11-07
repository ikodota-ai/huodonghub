"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtBytes, fmtTime } from "@/lib/client";
import { Badge, Button, Card } from "@/components/ui";
import type { StorageUsageResult, StorageRemoteStatus } from "@/lib/storage-usage";

const STATUS: Record<StorageRemoteStatus, { label: string; tone: "gray" | "green" | "red" | "orange" }> = {
  ok: { label: "OSS 正常", tone: "green" },
  local: { label: "本地磁盘", tone: "gray" },
  unconfigured: { label: "配置未完成", tone: "orange" },
  permission_denied: { label: "权限异常", tone: "red" },
  unreachable: { label: "连接失败", tone: "red" },
};

export function StorageUsageCard() {
  const [data, setData] = useState<StorageUsageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      setData(await api<StorageUsageResult>(`/api/settings/storage/usage${refresh ? "?refresh=1" : ""}`));
    } catch (reason) {
      setError((reason as Error).message || "存储状态加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const status = data ? STATUS[data.remote.status] : null;
  const hasRemoteUsage = data?.remote.status === "ok";

  return (
    <Card className="p-5 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">存储运行状态</h2>
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
          </div>
          <p className="text-xs text-ink-300 mt-1">仅统计本项目对象前缀，不代表整个 Bucket 或账单</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/system" className="h-8 inline-flex items-center px-3 text-sm rounded-lg text-ink-500 hover:text-brand hover:bg-brand-50">存储设置</Link>
          <Button size="sm" variant="secondary" disabled={loading} onClick={() => void load(true)}>
            {loading ? "统计中…" : "刷新"}
          </Button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">存储状态加载失败：{error}</p>}

      {!data && loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 animate-pulse">
          {[0, 1, 2].map((item) => <div key={item} className="h-24 rounded-lg bg-ink-50" />)}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            <section className="rounded-lg border border-ink-100 p-4">
              <div className="text-xs text-ink-500">OSS 前缀容量</div>
              <div className="text-2xl font-bold mt-2 num">{hasRemoteUsage ? fmtBytes(data.remote.bytes) : "—"}</div>
              <div className="text-xs text-ink-300 mt-1">{hasRemoteUsage ? `${data.remote.objects.toLocaleString()} 个对象` : "未完成远程统计"}</div>
            </section>
            <section className="rounded-lg border border-ink-100 p-4">
              <div className="text-xs text-ink-500">本地媒体残留</div>
              <div className="text-2xl font-bold mt-2 num">{fmtBytes(data.local.bytes)}</div>
              <div className="text-xs text-ink-300 mt-1">{data.local.files.toLocaleString()} 个文件 · 不含临时与备份</div>
            </section>
            <section className="rounded-lg border border-ink-100 p-4 min-w-0">
              <div className="text-xs text-ink-500">当前配置</div>
              {data.oss ? (
                <div className="text-sm mt-2 space-y-1">
                  <div className="font-medium truncate" title={`${data.oss.bucket} · ${data.oss.region}`}>{data.oss.bucket} · {data.oss.region}</div>
                  <div className="text-xs text-ink-500 break-all">前缀：<code>{data.oss.prefix}</code></div>
                </div>
              ) : (
                <div className="text-sm font-medium mt-2">服务器本地媒体目录</div>
              )}
            </section>
          </div>

          {data.remote.message && (
            <p className={`text-sm mt-4 ${["permission_denied", "unreachable"].includes(data.remote.status) ? "text-red-600" : "text-ink-500"}`}>
              {data.remote.message}
            </p>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-300 mt-4">
            <span>最近统计：{fmtTime(data.remote.checkedAt)}</span>
            {data.remote.checkedAt && <span>耗时：{data.remote.durationMs} ms</span>}
            <span>{data.cached ? "10 分钟内缓存结果" : "本次实时只读统计"}</span>
          </div>
        </>
      )}
    </Card>
  );
}
