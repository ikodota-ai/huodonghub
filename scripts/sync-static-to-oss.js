#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const {
  compareRemote,
  loadStorageConfig,
  mapLimit,
  normalizePrefix,
  objectKey,
} = require("./migrate-media-to-oss");

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

function normalizeAssetPrefix(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url;
  try { url = new URL(raw); } catch { throw new Error("NEXT_ASSET_PREFIX 不是有效 URL"); }
  if (url.protocol !== "https:") throw new Error("NEXT_ASSET_PREFIX 必须使用 HTTPS");
  if (url.username || url.password) throw new Error("NEXT_ASSET_PREFIX 不能包含账号或密码");
  if (url.search || url.hash) throw new Error("NEXT_ASSET_PREFIX 不能包含 query 或 hash");
  const pathname = url.pathname.replace(/\/+$/, "");
  if (/\/_next(?:\/static)?$/.test(pathname)) {
    throw new Error("NEXT_ASSET_PREFIX 只填写到项目前缀，不要包含 _next 或 _next/static");
  }
  return `${url.origin}${pathname}`;
}

function loadBuildAssetPrefix(buildDir) {
  const file = path.join(buildDir, "required-server-files.json");
  if (!fs.existsSync(file)) throw new Error(`构建缺少 required-server-files.json：${buildDir}`);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return normalizeAssetPrefix(parsed.config?.assetPrefix || "");
}

function staticObjectPrefix(storagePrefix, assetPrefix) {
  const projectPrefix = normalizePrefix(storagePrefix);
  if (!projectPrefix) throw new Error("OSS 对象前缀不能为空，拒绝上传到 Bucket 根目录");
  const normalizedAsset = normalizeAssetPrefix(assetPrefix);
  const publicPrefix = normalizePrefix(decodeURIComponent(new URL(normalizedAsset).pathname).replace(/^\/+/, ""));
  if (publicPrefix !== projectPrefix) {
    throw new Error(`公网路径前缀 ${publicPrefix || "(根目录)"} 与 OSS 项目前缀 ${projectPrefix} 不一致`);
  }
  return `${projectPrefix}_next/static/`;
}

function scanStaticFiles(buildDir) {
  const files = [];
  const staticRoot = path.join(buildDir, "static");
  function walk(absDir, relDir) {
    if (!fs.existsSync(absDir)) return;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const absPath = path.join(absDir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(absPath, relPath);
      else if (entry.isFile()) files.push({ relPath, absPath, size: fs.statSync(absPath).size });
    }
  }
  walk(staticRoot, "");
  return files.sort((a, b) => a.relPath.localeCompare(b.relPath, "en"));
}

function contentType(relPath) {
  return MIME[path.extname(relPath).toLowerCase()] || "application/octet-stream";
}

function publicAssetUrl(assetPrefix, relPath) {
  const prefix = normalizeAssetPrefix(assetPrefix);
  if (!prefix) throw new Error("缺少 NEXT_ASSET_PREFIX");
  const safeRel = objectKey("", relPath);
  const encoded = safeRel.split("/").map(encodeURIComponent).join("/");
  return `${prefix}/_next/static/${encoded}`;
}

async function probePublicAssets({ files, assetPrefix, fetchImpl }) {
  const selected = [
    files.find((file) => path.extname(file.relPath).toLowerCase() === ".js"),
    files.find((file) => path.extname(file.relPath).toLowerCase() === ".css"),
  ].filter(Boolean);
  if (!selected.some((file) => file.relPath.endsWith(".js"))) throw new Error("静态构建缺少可公网探测的 JS 文件");

  const results = [];
  for (const file of selected) {
    const url = publicAssetUrl(assetPrefix, file.relPath);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": "HuodongStaticDeploy/1.0", "Cache-Control": "no-cache" },
      });
      const actualType = String(response.headers.get("content-type") || "");
      const disposition = String(response.headers.get("content-disposition") || "");
      const forceDownload = String(response.headers.get("x-oss-force-download") || "");
      const extension = path.extname(file.relPath).toLowerCase();
      const mimeOk = extension === ".js" ? /javascript|ecmascript/i.test(actualType) : /text\/css/i.test(actualType);
      const reasons = [];
      if (response.status !== 200) reasons.push(`HTTP ${response.status}`);
      if (!mimeOk) reasons.push("MIME 不正确");
      if (/attachment/i.test(disposition) || /^true$/i.test(forceDownload)) reasons.push("响应被强制下载");
      results.push({ relPath: file.relPath, url, status: response.status, contentType: actualType, ok: reasons.length === 0, reason: reasons.join("；") });
    } catch (error) {
      results.push({ relPath: file.relPath, url, status: 0, ok: false, reason: `公网请求失败：${error?.name || "Error"}` });
    }
  }
  return results;
}

function emptySummary(total = 0) {
  return { total, succeeded: 0, uploaded: 0, skipped: 0, verified: 0, failed: 0 };
}

function safeOssError(error) {
  return [error?.code || error?.name || "Error", error?.status || error?.statusCode || ""].filter(Boolean).join(" / ");
}

async function runStaticSync({
  command,
  buildDir,
  client,
  config,
  envAssetPrefix,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  outDir = path.resolve("output/static-oss"),
}) {
  if (!new Set(["scan", "upload", "verify"]).has(command)) throw new Error("command 仅支持 scan/upload/verify");
  const absoluteBuildDir = path.resolve(buildDir);
  const assetPrefix = loadBuildAssetPrefix(absoluteBuildDir);
  const environmentPrefix = normalizeAssetPrefix(envAssetPrefix);
  if (assetPrefix !== environmentPrefix) {
    throw new Error(`构建与服务器 NEXT_ASSET_PREFIX 不一致：构建=${assetPrefix || "(本地静态)"}，服务器=${environmentPrefix || "(未设置)"}`);
  }
  const files = scanStaticFiles(absoluteBuildDir);
  const buildId = fs.existsSync(path.join(absoluteBuildDir, "BUILD_ID")) ? fs.readFileSync(path.join(absoluteBuildDir, "BUILD_ID"), "utf8").trim() : "";
  const summary = emptySummary(files.length);
  if (!assetPrefix) return { ok: true, enabled: false, command, buildId, assetPrefix, summary, files: [] };
  if (command === "scan") {
    return {
      ok: true,
      enabled: true,
      command,
      buildId,
      assetPrefix,
      summary,
      files: files.map((file) => ({ relPath: file.relPath, size: file.size })),
    };
  }
  if (files.length === 0) throw new Error(`.next/static 没有文件：${absoluteBuildDir}`);
  if (!client || !config) throw new Error("upload/verify 需要 OSS 客户端与配置");
  const prefix = staticObjectPrefix(config.oss.prefix, assetPrefix);

  const rows = await mapLimit(files, 4, async (file) => {
    const base = { relPath: file.relPath, size: file.size, key: objectKey(prefix, file.relPath) };
    try {
      let comparison = await compareRemote(client, file, prefix);
      let action = "verified";
      if (command === "upload") {
        if (comparison.status === "match") action = "skipped";
        else if (comparison.status === "missing") {
          await client.put(comparison.key, file.absPath, {
            mime: contentType(file.relPath),
            headers: { "Cache-Control": "public, max-age=31536000, immutable" },
          });
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
      logger(`${passed ? "✓" : "✗"} ${action} ${file.relPath}${comparison.reason ? `：${comparison.reason}` : ""}`);
      return { ...base, ...comparison, ok: passed, action };
    } catch (error) {
      summary.failed += 1;
      const reason = safeOssError(error);
      logger(`✗ error ${file.relPath}：${reason}`);
      return { ...base, ok: false, action: "error", status: "error", reason };
    }
  });

  const publicResults = summary.failed === 0 ? await probePublicAssets({ files, assetPrefix, fetchImpl }) : [];
  const report = {
    ok: summary.failed === 0 && publicResults.every((probe) => probe.ok),
    enabled: true,
    command,
    buildId,
    checkedAt: new Date().toISOString(),
    assetPrefix,
    oss: { region: config.oss.region, bucket: config.oss.bucket, prefix },
    summary,
    public: publicResults,
    files: rows,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const command = process.argv[2] || "scan";
  if (!new Set(["scan", "upload", "verify"]).has(command)) {
    console.log("用法：node scripts/sync-static-to-oss.js [scan|upload|verify] [buildDir]");
    process.exitCode = 1;
    return;
  }
  const projectRoot = path.resolve(__dirname, "..");
  require("@next/env").loadEnvConfig(projectRoot);
  const defaultBuild = fs.existsSync(path.join(projectRoot, ".next-build")) ? ".next-build" : ".next";
  const buildDir = path.resolve(process.argv[3] || defaultBuild);
  const envAssetPrefix = process.env.NEXT_ASSET_PREFIX || "";
  if (command === "scan" || !loadBuildAssetPrefix(buildDir)) {
    const result = await runStaticSync({ command, buildDir, envAssetPrefix });
    console.log(JSON.stringify({ enabled: result.enabled, buildId: result.buildId, assetPrefix: result.assetPrefix, summary: result.summary }, null, 2));
    return;
  }

  const { PrismaClient } = require("@prisma/client");
  const OSS = require("ali-oss");
  const db = new PrismaClient();
  try {
    const config = await loadStorageConfig(db);
    const client = new OSS({
      region: config.oss.region,
      bucket: config.oss.bucket,
      accessKeyId: config.oss.accessKeyId,
      accessKeySecret: config.oss.accessKeySecret,
      timeout: 120000,
    });
    const report = await runStaticSync({ command, buildDir, client, config, envAssetPrefix });
    console.log(`报告：${path.resolve("output/static-oss/report.json")}`);
    console.log(JSON.stringify({ ok: report.ok, summary: report.summary, public: report.public }, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

module.exports = {
  contentType,
  loadBuildAssetPrefix,
  normalizeAssetPrefix,
  probePublicAssets,
  publicAssetUrl,
  runStaticSync,
  scanStaticFiles,
  staticObjectPrefix,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`[静态 OSS] ${error.message}`);
    process.exitCode = 1;
  });
}
