import fs from "fs";
import path from "path";
import { TMP_ROOT } from "./storage";

export interface UploadSession {
  filename: string;
  size: number;
  chunks: number;
  received: Set<number>;
  dir: string;
}

interface UploadMeta {
  filename: string;
  size: number;
  chunks: number;
  createdAt: number;
}

const g = globalThis as unknown as { __dthUploads?: Map<string, UploadSession> };
export const uploadSessions: Map<string, UploadSession> = g.__dthUploads ?? new Map();
g.__dthUploads = uploadSessions;

const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

/** init 时把会话元数据落盘，进程重启后也能恢复续传 */
export function saveUploadMeta(session: UploadSession) {
  const meta: UploadMeta = {
    filename: session.filename,
    size: session.size,
    chunks: session.chunks,
    createdAt: Date.now(),
  };
  fs.writeFileSync(path.join(session.dir, "meta.json"), JSON.stringify(meta));
}

export function getUpload(id: string): UploadSession | undefined {
  if (!ID_RE.test(id)) return undefined;
  const mem = uploadSessions.get(id);
  if (mem) return mem;
  // 内存没有（进程重启过）→ 从磁盘恢复：读 meta.json + 扫描已落地的分片
  const dir = path.join(TMP_ROOT, id);
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) return undefined;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as UploadMeta;
    if (!meta.filename || !meta.size || !meta.chunks) return undefined;
    const received = new Set<number>();
    for (const name of fs.readdirSync(dir)) {
      if (name === "meta.json") continue;
      const n = Number(name);
      if (Number.isInteger(n) && n >= 0 && n < meta.chunks) received.add(n);
    }
    const session: UploadSession = { filename: meta.filename, size: meta.size, chunks: meta.chunks, received, dir };
    uploadSessions.set(id, session);
    return session;
  } catch {
    return undefined;
  }
}

/** 清理超过 maxAgeMs 的孤儿上传目录（init 时顺带调用，防磁盘被失败上传占满） */
export function sweepStaleUploads(maxAgeMs = 24 * 3600 * 1000) {
  let names: string[];
  try {
    names = fs.readdirSync(TMP_ROOT);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of names) {
    if (!ID_RE.test(name)) continue;
    try {
      const dir = path.join(TMP_ROOT, name);
      const st = fs.statSync(dir);
      if (st.isDirectory() && now - st.mtimeMs > maxAgeMs) {
        fs.rmSync(dir, { recursive: true, force: true });
        uploadSessions.delete(name);
      }
    } catch {
      // 单个目录清理失败不影响整体
    }
  }
}
