import { absOf } from "@/lib/storage";
import { getDriver } from "@/lib/storage-driver";
import fs from "fs";
import path from "path";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// 开发环境媒体分发（生产由 Nginx 直接发，支持 Range）
// OSS 模式：本地无文件时 302 到 OSS 真实地址（公开域名或签名 URL），
// 生产 Nginx 通过 error_page 404 回退到本路由，因此客户端写死 /api/media/ 也能工作
export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const rel = params.path.join("/");
  if (rel.includes("..") || rel.startsWith("tmp/")) return new Response("forbidden", { status: 403 });
  const abs = absOf(rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    const driver = await getDriver();
    if (driver.name === "oss") {
      const url = await driver.url(rel);
      if (url) return Response.redirect(url, 302);
    }
    return new Response("not found", { status: 404 });
  }

  const size = fs.statSync(abs).size;
  const type = MIME[path.extname(abs).toLowerCase()] || "application/octet-stream";
  const range = req.headers.get("range");

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
      const chunk = fs.createReadStream(abs, { start, end });
      return new Response(chunk as never, {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
  }
  return new Response(fs.createReadStream(abs) as never, {
    headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" },
  });
}
