#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MEDIA_DIRS = ["images", "covers", "videos"];
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4" };

function normalizePrefix(value) {
  const prefix = String(value || "").trim().replace(/\\/g, "/");
  if (prefix.includes("\0")) throw new Error("对象前缀包含非法字符");
  if (prefix.startsWith("/")) throw new Error("对象前缀不能有前导 /");
  if (prefix.split("/").some((segment) => segment === "..")) throw new Error("对象前缀不能包含 ..");
  return prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
}

function objectKey(prefix, relPath) {
  const rel = String(relPath).replace(/\\/g, "/");
  if (rel.startsWith("/") || rel.split("/").some((segment) => segment === "..")) {
    throw new Error("媒体相对路径不能包含前导 / 或 ..");
  }
  return `${normalizePrefix(prefix)}${rel}`;
}

function scanFiles(mediaRoot) {
  const files = [];
  function walk(absDir, relDir) {
    if (!fs.existsSync(absDir)) return;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const absPath = path.join(absDir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(absPath, relPath);
      else if (entry.isFile()) files.push({ relPath, absPath, size: fs.statSync(absPath).size });
    }
  }
  for (const dir of MEDIA_DIRS) walk(path.join(mediaRoot, dir), dir);
  return files.sort((a, b) => a.relPath.localeCompare(b.relPath, "en"));
}

function md5File(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(absPath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function remoteMetadata(client, key) {
  try {
    const result = await client.getObjectMeta(key);
    const headers = result.res?.headers || {};
    return {
      size: Number(headers["content-length"] ?? headers["Content-Length"]),
      etag: String(headers.etag || headers.ETag || "").replace(/^W\//, "").replace(/"/g, "").toLowerCase(),
    };
  } catch (error) {
    if (error.status === 404 || error.statusCode === 404 || error.code === "NoSuchKey") return null;
    throw error;
  }
}

async function compareRemote(client, file, prefix) {
  const key = objectKey(prefix, file.relPath);
  const remote = await remoteMetadata(client, key);
  if (!remote) return { status: "missing", key };
  if (!Number.isFinite(remote.size) || remote.size !== file.size) {
    return { status: "size_mismatch", key, reason: `本地 ${file.size} 字节，OSS ${remote.size} 字节`, remoteSize: remote.size };
  }
  if (/^[a-f0-9]{32}$/.test(remote.etag)) {
    const md5 = await md5File(file.absPath);
    if (md5 !== remote.etag) return { status: "md5_mismatch", key, reason: "本地 MD5 与 OSS ETag 不一致" };
    return { status: "match", key, verification: "md5" };
  }
  return { status: "match", key, verification: "size" };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function consume() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => consume()));
  return results;
}

async function loadStorageConfig(db) {
  const row = await db.setting.findUnique({ where: { key: "storage.config" } });
  let config;
  if (row?.value) {
    try { config = JSON.parse(row.value); } catch { throw new Error("settings.storage.config 不是有效 JSON"); }
  } else {
    config = {
      driver: process.env.STORAGE_DRIVER || "local",
      oss: {
        region: process.env.OSS_REGION || "",
        bucket: process.env.OSS_BUCKET || "",
        accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
        accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
        prefix: process.env.OSS_PREFIX || "dth/",
        publicDomain: process.env.OSS_PUBLIC_DOMAIN || "",
        private: process.env.OSS_PRIVATE === "1",
      },
    };
  }
  if (config?.driver !== "oss") throw new Error("当前媒体驱动不是 OSS，请先在后台启用并测试 OSS");
  const oss = config.oss || {};
  for (const key of ["region", "bucket", "accessKeyId", "accessKeySecret"]) {
    if (!oss[key]) throw new Error(`OSS 配置缺少 ${key}`);
  }
  return { driver: "oss", oss: { ...oss, prefix: normalizePrefix(oss.prefix) } };
}

async function runMigration({ command, mediaRoot, client, files, config, outDir, logger = console.log }) {
  if (!new Set(["upload", "verify"]).has(command)) throw new Error("runMigration 仅支持 upload/verify");
  const prefix = config.oss.prefix;
  const summary = { total: files.length, succeeded: 0, uploaded: 0, skipped: 0, verified: 0, failed: 0 };
  const rows = await mapLimit(files, 2, async (file) => {
    const base = { relPath: file.relPath, size: file.size, key: objectKey(prefix, file.relPath) };
    try {
      let comparison = await compareRemote(client, file, prefix);
      let action = "verified";
      if (command === "upload") {
        if (comparison.status === "match") action = "skipped";
        else if (comparison.status === "missing") {
          await client.put(comparison.key, file.absPath, { mime: MIME[path.extname(file.relPath).toLowerCase()] || "application/octet-stream" });
          comparison = await compareRemote(client, file, prefix);
          action = comparison.status === "match" ? "uploaded" : "failed";
        } else action = "conflict";
      } else if (comparison.status !== "match") action = "failed";
      const passed = comparison.status === "match";
      if (passed) {
        summary.succeeded += 1;
        if (action === "uploaded") summary.uploaded += 1;
        else if (action === "skipped") summary.skipped += 1;
        else summary.verified += 1;
      } else summary.failed += 1;
      const row = { ...base, ...comparison, ok: passed, action };
      logger(`${passed ? "✓" : "✗"} ${action} ${file.relPath}${comparison.reason ? `：${comparison.reason}` : ""}`);
      return row;
    } catch (error) {
      summary.failed += 1;
      logger(`✗ error ${file.relPath}：${error.message}`);
      return { ...base, ok: false, action: "error", status: "error", reason: error.message };
    }
  });
  const report = {
    ok: summary.failed === 0,
    command,
    checkedAt: new Date().toISOString(),
    mediaRoot,
    oss: { region: config.oss.region, bucket: config.oss.bucket, prefix },
    summary,
    files: rows,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  return `${Math.ceil(bytes / 1024)} KiB`;
}

async function main() {
  const command = process.argv[2] || "scan";
  if (!new Set(["scan", "upload", "verify"]).has(command)) {
    console.log("用法：node scripts/migrate-media-to-oss.js [scan|upload|verify]");
    process.exitCode = 1;
    return;
  }
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();
  try {
    const config = await loadStorageConfig(db);
    const mediaRoot = path.resolve(process.env.MEDIA_ROOT || "./media");
    const files = scanFiles(mediaRoot);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    console.log(`媒体目录：${mediaRoot}`);
    console.log(`OSS 目标：${config.oss.bucket} / ${config.oss.region} / ${config.oss.prefix}`);
    for (const dir of MEDIA_DIRS) {
      const scoped = files.filter((file) => file.relPath.startsWith(`${dir}/`));
      console.log(`${dir}/：${scoped.length} 个文件，${formatBytes(scoped.reduce((sum, file) => sum + file.size, 0))}`);
    }
    console.log(`合计：${files.length} 个文件，${formatBytes(totalBytes)}`);
    if (command === "scan") return;
    const OSS = require("ali-oss");
    const client = new OSS({
      region: config.oss.region,
      bucket: config.oss.bucket,
      accessKeyId: config.oss.accessKeyId,
      accessKeySecret: config.oss.accessKeySecret,
      timeout: 600000,
    });
    const outDir = path.resolve(process.env.OSS_MIGRATION_OUT || "output/oss-migration");
    const report = await runMigration({ command, mediaRoot, client, files, config, outDir });
    console.log(`报告：${path.join(outDir, "report.json")}`);
    console.log(JSON.stringify(report.summary, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

module.exports = { MEDIA_DIRS, normalizePrefix, objectKey, scanFiles, md5File, remoteMetadata, compareRemote, mapLimit, loadStorageConfig, runMigration };

if (require.main === module) {
  main().catch((error) => {
    console.error(`[媒体迁移] ${error.message}`);
    process.exitCode = 1;
  });
}
