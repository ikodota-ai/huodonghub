import fs from "fs";
import path from "path";
import { MEDIA_ROOT } from "./storage";
import type { OssConfig, StorageConfig } from "./settings";

export interface OssListPage {
  objects: Array<{ name: string; size: number }>;
  nextMarker: string | null;
  isTruncated: boolean;
}

export interface OssListClient {
  list(
    query: { prefix: string; "max-keys": number; marker?: string },
    options: { timeout: number },
  ): Promise<OssListPage>;
}

export interface OssPrefixUsage {
  objects: number;
  bytes: number;
  pages: number;
}

export async function collectOssPrefixUsage(client: OssListClient, prefix: string): Promise<OssPrefixUsage> {
  let objects = 0;
  let bytes = 0;
  let pages = 0;
  let marker: string | undefined;
  const seenMarkers = new Set<string>();

  while (true) {
    const page = await client.list(
      { prefix, "max-keys": 1000, ...(marker ? { marker } : {}) },
      { timeout: 10000 },
    );
    pages += 1;
    for (const object of page.objects || []) {
      if (!object.name.startsWith(prefix)) continue;
      objects += 1;
      bytes += Number(object.size) || 0;
    }
    if (!page.isTruncated) break;

    const nextMarker = page.nextMarker;
    if (!nextMarker || seenMarkers.has(nextMarker)) {
      throw new Error("OSS 分页 Marker 缺失或重复，已停止统计");
    }
    seenMarkers.add(nextMarker);
    marker = nextMarker;
  }

  return { objects, bytes, pages };
}

export function classifyOssError(error: unknown): { status: "permission_denied" | "unreachable"; message: string } {
  const value = error as { code?: string; name?: string } | null;
  const code = value?.code || value?.name || "";
  if (["AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "SecurityTokenExpired"].includes(code)) {
    return {
      status: "permission_denied",
      message: "OSS 读取权限不足或密钥无效，请检查 RAM 的 ListObjects 权限",
    };
  }
  return {
    status: "unreachable",
    message: "OSS 连接失败，请检查网络、Region 和 Bucket 配置",
  };
}

export function scanLocalMedia(mediaRoot: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(absolutePath);
        } else if (entry.isFile()) {
          const stat = fs.lstatSync(absolutePath);
          if (!stat.isFile()) continue;
          files += 1;
          bytes += stat.size;
        }
      } catch {}
    }
  }

  for (const dir of ["images", "covers", "videos"]) walk(path.join(mediaRoot, dir));
  return { files, bytes };
}

export type StorageRemoteStatus = "ok" | "local" | "unconfigured" | "permission_denied" | "unreachable";

export interface StorageUsageResult {
  driver: "local" | "oss";
  oss: { region: string; bucket: string; prefix: string } | null;
  remote: {
    status: StorageRemoteStatus;
    objects: number;
    bytes: number;
    checkedAt: string | null;
    durationMs: number;
    message: string | null;
  };
  local: { files: number; bytes: number };
  cached: boolean;
}

interface StorageUsageDependencies {
  mediaRoot?: string;
  now?: () => number;
  clientFactory?: (config: OssConfig) => OssListClient;
}

function defaultClientFactory(config: OssConfig): OssListClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OSS = require("ali-oss");
  return new OSS({
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
  });
}

export function createStorageUsageReader(dependencies: StorageUsageDependencies = {}) {
  const mediaRoot = dependencies.mediaRoot || MEDIA_ROOT;
  const now = dependencies.now || Date.now;
  const clientFactory = dependencies.clientFactory || defaultClientFactory;
  let cache: { key: string; storedAt: number; result: StorageUsageResult } | null = null;

  return async function read(config: StorageConfig, options: { refresh?: boolean } = {}): Promise<StorageUsageResult> {
    const key = JSON.stringify([config.driver, config.oss.region, config.oss.bucket, config.oss.prefix]);
    const timestamp = now();
    if (!options.refresh && cache?.key === key && timestamp - cache.storedAt < 600000) {
      return { ...cache.result, cached: true };
    }

    const local = scanLocalMedia(mediaRoot);
    if (config.driver === "local") {
      return {
        driver: "local",
        oss: null,
        remote: {
          status: "local",
          objects: 0,
          bytes: 0,
          checkedAt: null,
          durationMs: 0,
          message: "当前使用本地磁盘，未查询 OSS",
        },
        local,
        cached: false,
      };
    }

    const oss = { region: config.oss.region, bucket: config.oss.bucket, prefix: config.oss.prefix };
    const required = [
      config.oss.region,
      config.oss.bucket,
      config.oss.accessKeyId,
      config.oss.accessKeySecret,
      config.oss.prefix,
    ];
    if (required.some((value) => !value || !value.trim())) {
      return {
        driver: "oss",
        oss,
        remote: {
          status: "unconfigured",
          objects: 0,
          bytes: 0,
          checkedAt: null,
          durationMs: 0,
          message: "OSS 配置不完整，请补齐 Region、Bucket、AccessKey 和非空对象前缀",
        },
        local,
        cached: false,
      };
    }

    try {
      const usage = await collectOssPrefixUsage(clientFactory(config.oss), config.oss.prefix);
      const checkedAt = now();
      const result: StorageUsageResult = {
        driver: "oss",
        oss,
        remote: {
          status: "ok",
          objects: usage.objects,
          bytes: usage.bytes,
          checkedAt: new Date(checkedAt).toISOString(),
          durationMs: Math.max(0, checkedAt - timestamp),
          message: null,
        },
        local,
        cached: false,
      };
      cache = { key, storedAt: checkedAt, result };
      return result;
    } catch (error) {
      const checkedAt = now();
      const classified = classifyOssError(error);
      return {
        driver: "oss",
        oss,
        remote: {
          ...classified,
          objects: 0,
          bytes: 0,
          checkedAt: new Date(checkedAt).toISOString(),
          durationMs: Math.max(0, checkedAt - timestamp),
        },
        local,
        cached: false,
      };
    }
  };
}

export const readStorageUsage = createStorageUsageReader();
