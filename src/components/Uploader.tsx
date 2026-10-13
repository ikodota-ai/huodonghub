"use client";

import React, { useRef, useState } from "react";
import { api, fmtBytes } from "@/lib/client";
import { Button } from "./ui";

const CHUNK_SIZE = 4 * 1024 * 1024;

interface Task {
  file: File;
  title: string;
  progress: number;
  status: "等待" | "上传中" | "处理中" | "完成" | "失败";
  error?: string;
}

export function Uploader({ groupId, source = "upload", sourceUrl, onDone }: {
  groupId: string;
  source?: "upload" | "rescue";
  sourceUrl?: string;
  onDone?: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadOne(task: Task, idx: number) {
    const update = (patch: Partial<Task>) =>
      setTasks((ts) => ts.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    try {
      update({ status: "上传中", progress: 0 });
      const chunks = Math.ceil(task.file.size / CHUNK_SIZE);
      const { uploadId } = await api<{ uploadId: string }>("/api/upload/init", {
        method: "POST",
        body: JSON.stringify({ filename: task.file.name, size: task.file.size, chunks }),
      });
      for (let i = 0; i < chunks; i++) {
        const blob = task.file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        let attempt = 0;
        while (true) {
          try {
            await api(`/api/upload/chunk?uploadId=${uploadId}&index=${i}`, { method: "POST", body: blob });
            break;
          } catch (e) {
            if (++attempt >= 3) throw e;
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
        update({ progress: Math.round(((i + 1) / chunks) * 100) });
      }
      update({ status: "处理中" });
      await api("/api/upload/merge", {
        method: "POST",
        body: JSON.stringify({ uploadId, groupId, title: task.title, source, sourceUrl }),
      });
      update({ status: "完成" });
    } catch (e) {
      update({ status: "失败", error: (e as Error).message });
    }
  }

  async function start(files: FileList) {
    const newTasks: Task[] = [...files].map((f) => ({
      file: f,
      title: f.name.replace(/\.[^.]+$/, ""),
      progress: 0,
      status: "等待" as const,
    }));
    const base = tasks.length;
    setTasks((ts) => [...ts, ...newTasks]);
    setUploading(true);
    for (let i = 0; i < newTasks.length; i++) {
      await uploadOne(newTasks[i], base + i);
    }
    setUploading(false);
    onDone?.();
  }

  return (
    <div>
      <div
        className="border-2 border-dashed border-ink-200 rounded-card p-8 text-center hover:border-brand transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) start(e.dataTransfer.files);
        }}
      >
        <p className="text-ink-500 text-sm">点击选择或拖入 MP4/MOV 视频（可多选，单文件 ≤4GB）</p>
        <p className="text-ink-300 text-xs mt-1">大文件自动分片断点续传</p>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && start(e.target.files)}
        />
      </div>
      {tasks.length > 0 && (
        <div className="mt-4 space-y-2">
          {tasks.map((t, i) => (
            <div key={i} className="flex items-center gap-3 text-sm bg-ink-50 rounded-lg px-3 py-2">
              <span className="flex-1 truncate">{t.title}</span>
              <span className="text-ink-300 text-xs">{fmtBytes(t.file.size)}</span>
              {t.status === "上传中" && (
                <span className="w-32 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                  <span className="block h-full bg-brand transition-all" style={{ width: `${t.progress}%` }} />
                </span>
              )}
              <span className={`text-xs w-14 text-right ${t.status === "失败" ? "text-red-500" : t.status === "完成" ? "text-green-600" : "text-ink-500"}`}>
                {t.status === "失败" ? (t.error || "失败") : t.status === "上传中" ? `${t.progress}%` : t.status}
              </span>
            </div>
          ))}
          {uploading && <p className="text-xs text-ink-300">上传中，请勿关闭页面…</p>}
        </div>
      )}
    </div>
  );
}

export function ImagePicker({ value, onChange, label = "上传图片" }: { value?: string | null; onChange: (path: string, url: string) => void; label?: string }) {
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api<{ path: string; url: string }>("/api/images", { method: "POST", body: form });
      onChange(res.path, res.url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value.startsWith("http") ? value : `/api/media/${value}`} alt="" className="w-24 h-14 object-cover rounded-lg border border-ink-100" />
      ) : (
        <div className="w-24 h-14 rounded-lg bg-ink-100 flex items-center justify-center text-ink-300 text-xs">无图</div>
      )}
      <Button variant="secondary" size="sm" disabled={loading} onClick={() => inputRef.current?.click()}>
        {loading ? "上传中…" : label}
      </Button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
    </div>
  );
}
